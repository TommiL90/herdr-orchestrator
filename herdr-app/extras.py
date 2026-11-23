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
- keys are added to keys.json only where they are free; filetree takes the
  Files slot and better-tabs the tab bar of the layout the Skills panel uses
  (or your own shown one);
- while a mod's own installer edits the layout, the orchestrator's pane names
  (orc-panes) give the pane header back, then draw through the one it leaves.

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
            # Made again even where it already points there: Herdr's watcher doesn't
            # look through the link, so only a new link loads the new build.
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
    I.herdr_add_keys(name, keys, hp, entry, backup=".before-orc-extras")


def remove_keys(hp, entry, names=None):
    I.herdr_drop_keys(hp, entry, {k for n in (names or SPEC) for k in SPEC.get(n, {}).get("keys", {})})


# ------------------------------------------------------------------ layout slots
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


# A slot is a layout block a mod takes over: `files_slot: true` (the Files slot of
# the side panel) or `slot: "tabs"` (the tab bar). The block keeps its id, size and
# window_drag; only its content changes, and the uninstall puts the old one back.
SLOTS = {"files": "the Files slot", "tabs": "the tab bar"}


def slot_of(m):
    return "files" if m.get("files_slot") else m.get("slot")


def take_slot(name, slot_id, hp, manifest, entry):
    what = SLOTS[slot_id]
    target = layout_target(hp, manifest)
    if not target:
        print(f"[{name}] {what} not changed: the shown layout is one of Herdr's own. "
              f"Run installers/herdr-app.sh first, or switch to your own layout, and rerun.")
        return
    path = hp / "layouts" / f"{target}.json"
    tree = I.herdr_json(path, None)
    block = tree and I.herdr_find(tree, slot_id)
    if not block:
        print(f"[{name}] {what} not changed: layout {target} has no `{slot_id}` block")
        return
    key = f"{slot_id}_slot"
    slot = entry.get(key) if entry.get(key, {}).get("layout") == target else None
    if slot is None:
        slot = {"layout": target, "mod": name, "previous": block[0].get("content")}
    before = json.dumps(tree)
    block[0]["content"] = {"mod": name}
    if slot_id == "files":
        panel = I.herdr_find(tree, "panel")
        shipped_panel = I.herdr_find(I.herdr_json(hp / "layouts/main.json", {}), "panel")
        width = shipped_panel and shipped_panel[0].get("size")
        slot.setdefault("panel_size", panel and panel[0].get("size"))
        if panel and width:  # herdr-nvim narrows the panel for its own tree; filetree wants Herdr's width
            panel[0]["size"] = width
    if json.dumps(tree) != before:
        I.herdr_write(path, json.dumps(tree, indent=2) + "\n")
    entry[key] = slot
    print(f"[{name}] holds {what} in layout {target}")


def give_back_slot(hp, entry, slot_id):
    slot = entry.pop(f"{slot_id}_slot", None)
    if not slot:
        return
    path = hp / "layouts" / f"{slot['layout']}.json"
    tree = I.herdr_json(path, None)
    block = tree and I.herdr_find(tree, slot_id)
    mod = slot.get("mod", "filetree")
    if not block or block[0].get("content") != {"mod": mod}:
        return
    if slot.get("previous") is None:
        block[0].pop("content", None)
    else:
        block[0]["content"] = slot["previous"]
    panel = slot_id == "files" and I.herdr_find(tree, "panel")
    if panel and slot.get("panel_size"):
        panel[0]["size"] = slot["panel_size"]
    I.herdr_write(path, json.dumps(tree, indent=2) + "\n")
    print(f"[{mod}] gave {SLOTS[slot_id]} of layout {slot['layout']} back to {json.dumps(slot.get('previous'))}")


def run_wrapped(n, m, which, hp, manifest):
    """A mod's own installer edits the layout: orc-panes gives the pane header back
    while it runs (herdr-nvim adds its button only to Herdr's header) and then draws
    through whatever header the layout shows."""
    I.panes_hand_back(hp, manifest)
    try:
        return run_installer(n, m, which)
    finally:
        I.panes_take_back(hp, manifest)


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
                  + (f"; take {SLOTS[slot_of(m)]}" if slot_of(m) else ""))
        return True
    manifest = I.load_manifest()
    key = manifest_key(hp)
    entry = manifest.get(key, {"files": [], "extras": {}, "keys": {}})
    ok = True
    for n in names:
        m = SPEC[n]
        try:
            done = run_wrapped(n, m, "installer", hp, manifest) if "installer" in m else install_copy(n, m, hp, force, entry)
        except (OSError, RuntimeError, urllib.error.URLError) as e:
            print(f"[{n}] not installed: {e}")
            done = False
        if not done:
            ok = False
            continue
        entry.setdefault("extras", {})[n] = {"repo": m["repo"], "ref": m["ref"]}
        if m.get("keys"):
            add_keys(n, m["keys"], hp, entry)
        if slot_of(m):
            take_slot(n, slot_of(m), hp, manifest, entry)
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
    for slot_id in SLOTS:
        if any(slot_of(SPEC[n]) == slot_id for n in names):
            give_back_slot(hp, entry, slot_id)
    remove_keys(hp, entry, names)
    for n in names:
        m = SPEC[n]
        if "uninstaller" in m:
            try:
                ok = run_wrapped(n, m, "uninstaller", hp, manifest) and ok
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
