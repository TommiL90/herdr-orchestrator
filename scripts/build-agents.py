#!/usr/bin/env python3
"""Regenerate this repo's own .claude/ (Claude Code, project scope).

Kept for the old habit; it is the same as
    python3 install.py --cli claude --scope project --project <this repo>
and install.py is the single generator for every CLI and scope (see its --help).
In this repo the hooks use "$CLAUDE_PROJECT_DIR", so they survive a move; the
prompts embed the clone's absolute path, so re-run after moving or cloning.

It also removes the .claude/skills copies that older versions of this script
made: the orchestrators now read the skills straight from shared/skills.
"""
import shutil
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

code = subprocess.call([sys.executable, str(ROOT / "install.py"), "--cli", "claude",
                        "--scope", "project", "--project", str(ROOT), "--no-mods", *sys.argv[1:]])
if code == 0 and "--dry-run" not in sys.argv:
    for old in sorted((ROOT / ".claude/skills").glob("*/.orc-generated")):
        shutil.rmtree(old.parent)
        print("removed old skill copy", old.parent.relative_to(ROOT))
sys.exit(code)
