#!/usr/bin/env python3
"""Install the third-party Herdr app mods listed in herdr-app/extras.json.

Each one is pinned to the commit whose code was reviewed. Its source is
downloaded once from GitHub (codeload tarball of that commit) into this
clone's dist/herdr-app-extras/, and then:

- a mod that is copied (file-icons, filetree, markdown-panel, agent-flow) is
  built into dist/ like the orchestrator's own Skills panel, patched where
  extras.json says so (agent-flow), and Herdr's mods/<name> becomes one
  symlink to that folder;
- a mod with its own installer (herdr-nvim, gitview) runs that installer from
  the pinned source, with the release version pinned too. Those installers
  download their binary, check its SHA-256 and edit the shown layout;
- keys are added to keys.json only where they are free, and filetree takes
  the Files slot of the layout the Skills panel uses (or your own shown one).

Usage:
  python3 herdr-app/extras.py                     all of them
  python3 herdr-app/extras.py --only filetree,gitview
  python3 herdr-app/extras.py --list              what each one is, and its pin
  python3 herdr-app/extras.py --uninstall [--only ...]
  python3 herdr-app/extras.py --dry-run | --force

--force moves a mod folder that install.py did not write to
<herdr home>/<name>.before-orc and installs over it. $ORC_EXTRAS_SRC=<dir>
reads each source from <dir>/<owner>-<repo> instead of downloading it.
"""
import argparse
import datetime
import io
import json
import os
import shutil
import subprocess
import sys
import tarfile
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
import install as I  # noqa: E402  (install.py: manifest, dist paths, links, Herdr helpers)

# $ORC_EXTRAS_SPEC: another list, for tests.
SPEC = json.loads(Path(os.environ.get("ORC_EXTRAS_SPEC") or ROOT / "herdr-app/extras.json").read_text())["mods"]
MARK = ".orc-extra"  # hidden, like install.py's marker: Herdr does not reload on it


def manifest_key(hp):
    return f"herdr-app-extras|{hp}"


def now():
    return datetime.datetime.now().isoformat(timespec="seconds")


# ------------------------------------------------------------------ sources
def source(m):
    """The repo tree at the pinned ref."""
    slug = m["repo"].replace("/", "-")
    local = os.environ.get("ORC_EXTRAS_SRC")
    if local:
        d = Path(local) / slug
        if not d.is_dir():
            raise RuntimeError(f"no {d} ($ORC_EXTRAS_SRC)")
        return d
    d = I.dist_root() / "herdr-app-extras" / f"{slug}-{m['ref'][:12]}"
    if (d / ".complete").exists():
        return d
    url = f"https://codeload.github.com/{m['repo']}/tar.gz/{m['ref']}"
    print(f"  downloading {m['repo']}@{m['ref'][:7]}")
    with urllib.request.urlopen(url, timeout=120) as r:
        data = r.read()
    tmp = d.with_name(d.name + ".tmp")
    shutil.rmtree(tmp, ignore_errors=True)
    tmp.mkdir(parents=True)
    with tarfile.open(fileobj=io.BytesIO(data), mode="r:gz") as t:
        members = []
        for x in t.getmembers():
            top, _, rest = x.name.partition("/")
            if not rest:
                continue
            if rest.startswith("/") or ".." in Path(rest).parts or x.isdev():
                raise RuntimeError(f"{m['repo']}: unsafe path in the tarball: {x.name}")
            if x.issym() or x.islnk():
                # A symlink is relative to its folder, a hard link to the archive's root.
                if x.islnk():
                    x.linkname = x.linkname.partition("/")[2]
                to = os.path.normpath(os.path.join(os.path.dirname(rest) if x.issym() else "", x.linkname))
                if x.linkname.startswith("/") or to == ".." or to.startswith("../"):
                    raise RuntimeError(f"{m['repo']}: link out of the tree in the tarball: {x.name}")
            x.name = rest
            members.append(x)
        kw = {"filter": "data"} if hasattr(tarfile, "data_filter") else {}
        t.extractall(tmp, members=members, **kw)
    (tmp / ".complete").write_text(m["ref"] + "\n")
    shutil.rmtree(d, ignore_errors=True)
    tmp.rename(d)
    return d


# ------------------------------------------------------------------ copied mods
def install_copy(name, m, hp, force, entry):
    """Build (copy, patch, mark) and check the mod in a staging folder first; only a
    build that passed moves the user's own mod aside and takes its place."""
    dst = hp / "mods" / name
    built = I.dist_path(dst)
    previous = built.with_name(f".{name}.orc-previous")
    aside = hp / f"{name}.before-orc"
    theirs = I.present(dst) and not (dst.is_symlink() and I.ours(dst))
    if theirs and not force:
        print(f"[{name}] not installed: {dst} exists and was not written by install.py (pass --force)")
        return False
    if theirs and (I.present(aside) or aside.is_symlink()):
        print(f"[{name}] not installed: {aside} already holds an earlier {name}; move one of them away first")
        return False
    src = source(m) / m["copy"]
    if not src.is_dir():
        print(f"[{name}] not installed: {m['repo']}@{m['ref'][:7]} has no {m['copy']}")
        return False
    if I.present(previous):
        if I.present(built):
            print(f"[{name}] not installed: {previous} holds a build from an interrupted update")
            return False
        previous.rename(built)
    stage = built.parent / f".{name}.orc-stage"
    tmp = stage / name  # the folder keeps the mod's name, as Herdr and its check expect
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    try:
        shutil.copytree(src, tmp, symlinks=True)
        if m.get("patch"):
            # The patches name files as a/mods/<name>/<file>, relative to the Herdr home.
            r = subprocess.run(["patch", "-p3", "-s", "-d", str(tmp), "-i", str(ROOT / m["patch"])],
                               capture_output=True, text=True)
            if r.returncode != 0:
                print(f"[{name}] not installed: {m['patch']} does not apply:\n{(r.stdout + r.stderr).strip()}")
                return False
            for orig in tmp.rglob("*.orig"):
                orig.unlink()
        (tmp / MARK).write_text(json.dumps({"repo": m["repo"], "ref": m["ref"]}) + "\n")
        check = I.herdr_app("check", str(tmp))
        if check is not None and check.returncode != 0:
            print(f"[{name}] not installed: herdr-app check failed:\n{(check.stdout + check.stderr).strip()}")
            return False
        if theirs:  # nothing of the user's was touched before this point
            dst.rename(aside)
        saved = published = False
        try:
            if I.present(built):
                if built.is_symlink() or not built.is_dir():
                    raise OSError(f"{built} is not a build directory")
                built.rename(previous)
                saved = True
            tmp.rename(built)
            published = True
            if not I.linked(dst, built):
                I.link(dst, built)
        except OSError as e:
            try:
                if published:
                    shutil.rmtree(built)
                if saved:
                    previous.rename(built)
            finally:
                if theirs and not I.present(dst):
                    aside.rename(dst)
            print(f"[{name}] not installed: could not publish the build ({e})"
                  + (f"; {dst} is back in place" if theirs and I.present(dst) else ""))
            return False
        if saved:
            shutil.rmtree(previous, ignore_errors=True)
        if theirs:
            print(f"[{name}] moved the existing {dst} to {aside}")
    finally:
        shutil.rmtree(stage, ignore_errors=True)
    print(f"[{name}] {m['repo']}@{m['ref'][:7]}" + (" (patched)" if m.get("patch") else "")
          + f": {dst} links to {built}" + ("; herdr-app check passed" if check is not None else ""))
    entry["files"] = sorted(set(entry.get("files", [])) | {str(dst)})
    return True


def uninstall_copy(name, hp, entry):
    dst = hp / "mods" / name
    built = I.dist_path(dst)
    if dst.is_symlink() and I.ours(dst):
        dst.unlink()
    if (built / MARK).exists():
        shutil.rmtree(built)
        I.prune(built.parent, I.dist_root())
    aside = hp / f"{name}.before-orc"
    restored = ""
    if aside.exists() and not I.present(dst):
        aside.rename(dst)
        restored = f"; put back the {name} that was there before"
    entry["files"] = [f for f in entry.get("files", []) if f != str(dst)]
    print(f"[{name}] removed {dst}{restored}")


# ------------------------------------------------------------------ installers
def run_installer(name, m, which):
    src = source(m)
    cmd = m[which]
    print(f"[{name}] running {m['repo']}@{m['ref'][:7]}: {' '.join(cmd)}")
    r = subprocess.run(cmd, cwd=src)  # its own prompts (Neovim) reach the person
    if r.returncode != 0:
        print(f"[{name}] its installer exited with {r.returncode}")
    return r.returncode == 0


# ------------------------------------------------------------------ keys
def add_keys(name, keys, hp, entry):
    path = hp / "keys.json"
    data = I.herdr_json(path, None)
    if data is None:
        print(f"[{name}] keys not added: {path} is missing or not JSON (open Herdr once): "
              + ", ".join(keys))
        return
    g = data.setdefault("global", {})
    added, taken = [], []
    for key, value in keys.items():
        if key not in g:
            g[key] = value
            added.append(key)
        elif g[key] != value:
            taken.append(key)
            continue
        elif key not in entry.get("keys", {}):
            continue  # the user bound it to the same action already: theirs, never removed by us
        entry.setdefault("keys", {})[key] = value
    if added:
        backup = path.with_name(path.name + ".before-orc-extras")
        if not backup.exists():
            shutil.copy2(path, backup)
        I.herdr_write(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
    if added or taken:
        print(f"[{name}] keys: " + ", ".join(added or ["none added"])
              + (f"; already bound to something else, left alone: {', '.join(taken)}" if taken else ""))


def remove_keys(hp, entry, names=None):
    path = hp / "keys.json"
    data = I.herdr_json(path, None)
    ours = entry.get("keys", {})
    drop = {k for n in (names or SPEC) for k in SPEC.get(n, {}).get("keys", {})} & set(ours)
    if data is None or not drop:
        return
    g = data.get("global", {})
    removed = [k for k in drop if g.get(k) == ours[k]]
    for k in removed:
        g.pop(k)
    for k in drop:
        ours.pop(k)
    if removed:
        I.herdr_write(path, json.dumps(data, indent=2, ensure_ascii=False) + "\n")
        print(f"[keys] removed {', '.join(sorted(removed))}")


# ------------------------------------------------------------------ Files slot
def layout_target(hp, manifest):
    """The layout to edit: the shown one if it is the person's own, else the one
    install.py put the Skills panel in. None when only a shipped one is shown."""
    shown = I.herdr_json(hp / "shared.json", {}).get("layout") or "main"
    shipped = {k.split(":", 1)[1] for k in I.herdr_json(hp / "installed.json", {}) if k.startswith("layout:")}
    if shown not in shipped and (hp / "layouts" / f"{shown}.json").exists():
        return shown
    skills = manifest.get(f"herdr-app|{hp}", {}).get("layout")
    if skills and (hp / "layouts" / f"{skills}.json").exists():
        return skills
    return None


def take_files_slot(name, hp, manifest, entry):
    target = layout_target(hp, manifest)
    if not target:
        print(f"[{name}] Files slot not changed: the shown layout is one of Herdr's own. "
              f"Run installers/herdr-app.sh first, or switch to your own layout, and rerun.")
        return
    path = hp / "layouts" / f"{target}.json"
    tree = I.herdr_json(path, None)
    files = tree and I.herdr_find(tree, "files")
    if not files:
        print(f"[{name}] Files slot not changed: layout {target} has no `files` block")
        return
    want = {"mod": name}
    panel = I.herdr_find(tree, "panel")
    shipped_panel = I.herdr_find(I.herdr_json(hp / "layouts/main.json", {}), "panel")
    width = shipped_panel and shipped_panel[0].get("size")
    before = json.dumps(tree)
    slot = entry.get("files_slot") if entry.get("files_slot", {}).get("layout") == target else None
    if slot is None:
        slot = {"layout": target, "mod": name, "previous": files[0].get("content"),
                "panel_size": panel and panel[0].get("size")}
    files[0]["content"] = want
    if panel and width:  # herdr-nvim narrows the panel for its own tree; filetree wants Herdr's width
        panel[0]["size"] = width
    if json.dumps(tree) != before:
        I.herdr_write(path, json.dumps(tree, indent=2) + "\n")
    entry["files_slot"] = slot
    print(f"[{name}] holds the Files slot in layout {target}")


def give_back_files_slot(hp, entry):
    slot = entry.pop("files_slot", None)
    if not slot:
        return
    path = hp / "layouts" / f"{slot['layout']}.json"
    tree = I.herdr_json(path, None)
    files = tree and I.herdr_find(tree, "files")
    mod = slot.get("mod", "filetree")
    if not files or files[0].get("content") != {"mod": mod}:
        return
    if slot.get("previous") is None:
        files[0].pop("content", None)
    else:
        files[0]["content"] = slot["previous"]
    panel = I.herdr_find(tree, "panel")
    if panel and slot.get("panel_size"):
        panel[0]["size"] = slot["panel_size"]
    I.herdr_write(path, json.dumps(tree, indent=2) + "\n")
    print(f"[{mod}] gave the Files slot of layout {slot['layout']} back to {json.dumps(slot.get('previous'))}")


# ------------------------------------------------------------------ actions
def selection(only):
    if not only:
        return list(SPEC)
    names = [n.strip() for n in only.split(",") if n.strip()]
    unknown = [n for n in names if n not in SPEC]
    if unknown:
        raise SystemExit(f"unknown extras {unknown}; choose from {', '.join(SPEC)}")
    for n in list(names):
        names += [d for d in SPEC[n].get("needs", []) if d not in names]
    return [n for n in SPEC if n in names]  # extras.json's order


def install(names, dry, force):
    with I.manifest_lock():  # all extras share one manifest entry: no other run may save it meanwhile
        return _install(names, dry, force)


def _install(names, dry, force):
    hp = I.herdr_home()
    if not (hp / "layouts").is_dir():
        print(f"[extras] skipped: no Herdr app home at {hp} (open Herdr once, or set HERDR_APP_HOME)")
        return True
    if dry:
        for n in names:
            m = SPEC[n]
            how = "run its installer" if "installer" in m else "link a patched build" if m.get("patch") else "link a build"
            print(f"[{n}] would fetch {m['repo']}@{m['ref'][:7]} and {how}"
                  + (f"; keys {', '.join(m['keys'])} where free" if m.get("keys") else "")
                  + ("; take the Files slot" if m.get("files_slot") else ""))
        return True
    manifest = I.load_manifest()
    key = manifest_key(hp)
    entry = manifest.get(key, {"files": [], "extras": {}, "keys": {}})
    ok = True
    for n in names:
        m = SPEC[n]
        try:
            done = run_installer(n, m, "installer") if "installer" in m else install_copy(n, m, hp, force, entry)
        except (OSError, RuntimeError, urllib.error.URLError) as e:
            print(f"[{n}] not installed: {e}")
            done = False
        if not done:
            ok = False
            continue
        entry.setdefault("extras", {})[n] = {"repo": m["repo"], "ref": m["ref"]}
        if m.get("keys"):
            add_keys(n, m["keys"], hp, entry)
        if m.get("files_slot"):
            take_files_slot(n, hp, manifest, entry)
    if entry.get("extras"):
        entry.update(clone=str(I.ROOT), agents=[], installed=now())
        manifest[key] = entry
        I.save_manifest(manifest)
    return ok


def uninstall(names, dry, explicit):
    with I.manifest_lock():
        return _uninstall(names, dry, explicit)


def _uninstall(names, dry, explicit):
    hp = I.herdr_home()
    manifest = I.load_manifest()
    key = manifest_key(hp)
    entry = manifest.get(key)
    if not entry:
        print(f"[extras] nothing recorded for {hp}")
        return True
    names = [n for n in reversed(names) if n in entry.get("extras", {})] if explicit \
        else [n for n in reversed(list(SPEC)) if n in entry.get("extras", {})]
    if dry:
        print("[extras] would remove " + ", ".join(names))
        return True
    ok = True
    if any(SPEC[n].get("files_slot") for n in names):
        give_back_files_slot(hp, entry)
    remove_keys(hp, entry, names)
    for n in names:
        m = SPEC[n]
        if "uninstaller" in m:
            try:
                ok = run_installer(n, m, "uninstaller") and ok
            except (OSError, RuntimeError, urllib.error.URLError) as e:
                print(f"[{n}] could not run its uninstaller: {e}")
                ok = False
        else:
            uninstall_copy(n, hp, entry)
        entry["extras"].pop(n, None)
    if entry.get("extras"):
        manifest[key] = entry
    else:
        manifest.pop(key, None)
    I.save_manifest(manifest)
    return ok


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--only", help="comma-separated: " + ", ".join(SPEC))
    ap.add_argument("--uninstall", action="store_true")
    ap.add_argument("--dry-run", action="store_true")
    ap.add_argument("--force", action="store_true")
    ap.add_argument("--list", action="store_true")
    a = ap.parse_args()
    if a.list:
        for n, m in SPEC.items():
            print(f"{n:15} {m['repo']}@{m['ref'][:7]} ({m['license']})\n{'':15} {m['about']}")
        return 0
    names = selection(a.only)
    ok = uninstall(names, a.dry_run, bool(a.only)) if a.uninstall else install(names, a.dry_run, a.force)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
