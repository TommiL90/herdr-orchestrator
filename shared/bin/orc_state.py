"""State shared by orc.py (writer) and guard.py (reader).

herdorc records the panes and tabs it creates in one JSON file per herdr
session and workspace:

  {"panes": {"<pane_id>": {"name": "<label>", "terminal": "<terminal_id>"}},
   "tabs":  {"<tab_id>":  {"title": "<label>"}}}

A recorded id is only trusted while it still points at the same object:
herdr reuses pane and tab ids (for example after a server restart), so an id
alone would let a user's new pane pass for one of ours. See herdr_owned().
"""
import json
import os
import re
from pathlib import Path

STATE_DIR = Path(os.path.expanduser("~/.local/state/orc"))


def safe(text):
    """A string usable inside a file name."""
    return re.sub(r"[^A-Za-z0-9_.-]", "_", text or "none")


def herdr_session():
    return os.environ.get("HERDR_SESSION") or "default"


def herdorc_state_path(session=None, workspace=None):
    session = session or herdr_session()
    workspace = workspace or os.environ.get("HERDR_WORKSPACE_ID") or "none"
    return STATE_DIR / f"herdorc-{safe(f'{session}-{workspace}')}.json"


def load_herdorc_state(path):
    """Read the state, normalizing the first format (panes {id: name}, tabs [ids])."""
    try:
        raw = json.loads(Path(path).read_text())
    except Exception:
        raw = {}
    panes = {}
    for pid, v in (raw.get("panes") or {}).items():
        panes[pid] = v if isinstance(v, dict) else {"name": v, "terminal": None}
    tabs_raw = raw.get("tabs") or {}
    if isinstance(tabs_raw, list):
        tabs = {tid: {"title": None} for tid in tabs_raw}
    else:
        tabs = {tid: (v if isinstance(v, dict) else {"title": v}) for tid, v in tabs_raw.items()}
    return {"panes": panes, "tabs": tabs}


def save_herdorc_state(path, state):
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(state, indent=1))


def herdr_owned(state, panes, tabs):
    """Which recorded panes and tabs are still ours, given live `pane list` and `tab list` rows.

    A pane is ours while its id exists, its label is the name we gave it and its
    terminal is the one we recorded. A tab is ours while its id exists, its
    label is the title we gave it and every pane in it is ours (so closing it
    never takes a pane someone moved in). Entries in the first state format have
    no terminal or title: they are adopted from the live row once.

    Returns (owned_pane_ids, owned_tab_ids, pruned_state). pruned_state drops
    panes that are not ours and tabs that are gone or relabelled; a tab that only
    holds someone else's pane for now stays recorded but is not owned.
    """
    live_panes = {p.get("pane_id"): p for p in panes}
    live_tabs = {t.get("tab_id"): t for t in tabs}
    kept_panes = {}
    for pid, rec in state.get("panes", {}).items():
        row = live_panes.get(pid)
        if not row or (row.get("label") or "") != rec.get("name"):
            continue
        terminal = row.get("terminal_id")
        if rec.get("terminal") and terminal != rec["terminal"]:
            continue
        kept_panes[pid] = {"name": rec.get("name"), "terminal": rec.get("terminal") or terminal}
    by_tab = {}
    for p in panes:
        by_tab.setdefault(p.get("tab_id"), []).append(p.get("pane_id"))
    kept_tabs, owned_tabs = {}, set()
    for tid, rec in state.get("tabs", {}).items():
        row = live_tabs.get(tid)
        if not row:
            continue
        label = row.get("label") or ""
        if rec.get("title") is not None and label != rec["title"]:
            continue
        kept_tabs[tid] = {"title": rec.get("title") if rec.get("title") is not None else label}
        if all(pid in kept_panes for pid in by_tab.get(tid, [])):
            owned_tabs.add(tid)
    return set(kept_panes), owned_tabs, {"panes": kept_panes, "tabs": kept_tabs}
