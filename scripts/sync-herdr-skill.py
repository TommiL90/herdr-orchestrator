#!/usr/bin/env python3
"""Keep shared/vendor/herdr/SKILL.md identical to the upstream herdr skill.

The herdr project ships the skill at skills/herdr/SKILL.md (https://github.com/herdrdev/herdr).
herdorc embeds it verbatim, so it must match the installed herdr version.

  python3 scripts/sync-herdr-skill.py            # check: vendored vs installed-version tag vs master
  python3 scripts/sync-herdr-skill.py --update   # vendor the skill of the installed herdr version
  python3 scripts/sync-herdr-skill.py --update --ref master   # or any tag/branch

Exit status of the check: 0 up to date, 1 the installed version's skill differs, 2 fetch error.
Run scripts/build-agents.py after an update.
"""
import argparse
import hashlib
import json
import re
import subprocess
import sys
import urllib.request
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VENDOR = ROOT / "shared/vendor/herdr"
RAW = "https://raw.githubusercontent.com/herdrdev/herdr/{ref}/skills/herdr/SKILL.md"


def fetch(ref):
    with urllib.request.urlopen(RAW.format(ref=ref), timeout=20) as r:
        return r.read()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def installed_tag():
    out = subprocess.run(["herdr", "--version"], capture_output=True, text=True).stdout
    m = re.search(r"(\d+\.\d+\.\d+)", out)
    return f"v{m.group(1)}" if m else None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--update", action="store_true")
    ap.add_argument("--ref", help="tag or branch to vendor (default: the installed herdr version)")
    a = ap.parse_args()

    tag = a.ref or installed_tag()
    if not tag:
        sys.exit("cannot read `herdr --version`; pass --ref")
    try:
        at_tag = fetch(tag)
        at_master = fetch("master")
    except Exception as e:
        print(f"fetch failed: {e}")
        sys.exit(2)
    skill = VENDOR / "SKILL.md"
    current = skill.read_bytes() if skill.exists() else b""

    if a.update:
        VENDOR.mkdir(parents=True, exist_ok=True)
        skill.write_bytes(at_tag)
        (VENDOR / "UPSTREAM.json").write_text(json.dumps({
            "source": RAW.format(ref=tag), "ref": tag, "sha256": sha(at_tag),
            "fetched": date.today().isoformat(),
            "note": "Verbatim copy. Do not edit; rerun scripts/sync-herdr-skill.py --update.",
        }, indent=2) + "\n")
        print(f"vendored herdr skill at {tag} ({sha(at_tag)[:12]}); now run scripts/build-agents.py")
        return

    print(f"vendored : {sha(current)[:12] if current else '(missing)'}")
    print(f"{tag:9}: {sha(at_tag)[:12]}  {'same' if at_tag == current else 'DIFFERENT'}")
    print(f"master   : {sha(at_master)[:12]}  {'same' if at_master == current else 'different (unreleased changes)'}")
    sys.exit(0 if at_tag == current else 1)


if __name__ == "__main__":
    main()
