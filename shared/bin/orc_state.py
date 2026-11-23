"""State shared by orc.py (writer) and guard.py (reader).

herdorc records the panes and tabs it creates in one JSON file per herdr
session and workspace:

  {"panes": {"<pane_id>": {"name": "<label>", "terminal": "<terminal_id>"}},
   "tabs":  {"<tab_id>":  {"title": "<label>"}}}

A recorded id is only trusted while it still points at the same object:
herdr reuses pane and tab ids (for example after a server restart), so an id
alone would let a user's new pane pass for one of ours. See herdr_owned().
"""
import contextlib
import fcntl
import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

# The desktop integration test can reuse a terminal address in another Core session.
STATE_DIR = Path(os.environ.get("ORC_TEST_STATE_DIR") or os.path.expanduser("~/.local/state/orc"))


def safe(text):
    """A string usable inside a file name."""
    return re.sub(r"[^A-Za-z0-9_.-]", "_", text or "none")


def herdr_session():
    """herdr sets HERDR_SESSION in a named session's panes; the socket path
    (`.../sessions/<name>/herdr.sock`) says it too. Else the default session.
    herdr/plugins/orc-flow/lib/herdr.mjs (herdrSession) follows the same rule."""
    if os.environ.get("HERDR_SESSION"):
        return os.environ["HERDR_SESSION"]
    m = re.search(r"[\\/]sessions[\\/]([^\\/]+)[\\/]herdr\.sock$", os.environ.get("HERDR_SOCKET_PATH", ""))
    return m.group(1) if m else "default"


def herdorc_state_path(session=None, workspace=None, lead=None):
    """One herdorc's record of the panes and tabs it created: one file per lead pane,
    so two herdorc in one workspace each control only their own. The first format's
    file (one per workspace) is never adopted: it does not say which lead made a
    pane, so its panes stay nobody's and the guard keeps blocking their close. orc-flow
    (lib/herdr.mjs) and the Claude Code mods (hooks/roster.ts) build the same path."""
    session = session or herdr_session()
    workspace = workspace or os.environ.get("HERDR_WORKSPACE_ID") or "none"
    lead = lead or os.environ.get("HERDR_PANE_ID") or "none"
    return STATE_DIR / f"herdorc-{safe(f'{session}-{workspace}')}.pane-{safe(lead)}.json"


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


def write_atomic(path, text):
    """Replace the file in one step, so a reader never sees it half written."""
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    try:
        with os.fdopen(fd, "w") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        with contextlib.suppress(OSError):
            os.unlink(tmp)
        raise


@contextlib.contextmanager
def locked(path):
    """An exclusive lock for a read-modify-write of `path` (a `<path>.lock` beside it)."""
    lock = Path(f"{path}.lock")
    lock.parent.mkdir(parents=True, exist_ok=True)
    with open(lock, "a") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)


def save_herdorc_state(path, state):
    write_atomic(path, json.dumps(state, indent=1))


def update_herdorc_state(path, change):
    """Load, change (a function of the state that edits it in place or returns a new
    one) and save, under the lock, so two orc.py runs never drop each other's panes."""
    with locked(path):
        state = load_herdorc_state(path)
        new = change(state)
        state = state if new is None else new
        save_herdorc_state(path, state)
        return state


def apply_prune(current, before, pruned):
    """The current state with a prune applied only where it was decided.

    `pruned` was computed from `before`, the state read before herdr was asked.
    An entry added or changed since (another run created a pane meanwhile) was
    never checked against those lists, so it is kept as it is now.
    """
    out = {}
    for kind in ("panes", "tabs"):
        cur, old, new = current.get(kind, {}), before.get(kind, {}), pruned.get(kind, {})
        out[kind] = {k: (new[k] if k in old and v == old[k] else v)
                     for k, v in cur.items()
                     if not (k in old and v == old[k] and k not in new)}
    return out


def herdr_owned(state, panes, tabs):
    """Which recorded panes and tabs are still ours, given live `pane list` and `tab list` rows.

    A pane is ours while its id exists, its label is the name we gave it and its
    terminal is the one we recorded. A tab is ours while its id exists, its
    label is the title we gave it, the pane list shows at least one pane in it, and
    every pane in it is ours (so closing it never takes a pane someone moved in). Entries in the first state format have
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
        members = by_tab.get(tid, [])
        if members and all(pid in kept_panes for pid in members):  # none seen: herdr did not show it, not ours
            owned_tabs.add(tid)
    return set(kept_panes), owned_tabs, {"panes": kept_panes, "tabs": kept_tabs}


# ------------------------------------------------------------ lead sessions
# Hooks in CLIs other than Claude Code are not told which agent is running. The
# orchestrator's own `orc.py --as <agent>` calls record it against the processes
# above them (the CLI, and any helper it runs shells from), and the guard looks
# for its own CLI among them. A process is named by pid and start time, so a
# reused pid never matches. orc.py records the two nearest (a CLI may run shells from
# a helper process), the guard looks up only its nearest: the CLI that runs hooks.
# Looking further up would reach what many sessions share (an editor, an app).
LEADS = Path(os.environ.get("ORC_LEADS") or STATE_DIR / "leads.json")  # ORC_LEADS: tests only
_PASS = re.compile(r"^-?(sh|bash|zsh|fish|dash|ksh|tcsh|csh|nu|env|sudo|doas|nohup|timeout|gtimeout|"
                   r"script|sandbox-exec|bwrap|rtk|uv|uvx|xargs|stdbuf|nice|caffeinate|"
                   r"[Pp]ython[\d.]*)$")  # the shells and wrappers between a CLI and a command
_STOP = re.compile(r"^-?(launchd|init|systemd|login|sshd|tmux|screen|zellij|herdr|herdr-core|hc|"
                   r"herdr-app|Herdr|Terminal|iTerm2|ghostty|wezterm-gui|kitty|alacritty)$")


def _processes():
    try:
        out = subprocess.run(["ps", "-A", "-o", "pid=,ppid=,lstart=,comm="], capture_output=True, env={**os.environ, "LC_ALL": "C"},
                             text=True, timeout=5).stdout
    except (OSError, subprocess.SubprocessError):
        return {}
    procs = {}
    for line in out.splitlines():
        parts = line.split(None, 7)
        if len(parts) < 8:
            continue
        pid, ppid = int(parts[0]), int(parts[1])
        procs[pid] = (ppid, " ".join(parts[2:7]), os.path.basename(parts[7].strip()))
    return procs


def session_processes(limit, start=None):
    """The `pid:start` of the first `limit` processes above `start` (default: this one's
    parent) that are neither a shell nor a wrapper, short of a multiplexer, terminal or init."""
    procs = _processes()
    out, pid, seen = [], start or os.getppid(), set()
    while pid in procs and pid not in seen and pid > 1 and len(out) < limit:
        seen.add(pid)
        ppid, started, name = procs[pid]
        if _STOP.match(name):
            break
        if not _PASS.match(name):
            out.append(f"{pid}:{started}")
        pid = ppid
    return out


# The conversation a CLI runs inside its process, where it tells its shell commands:
# pi starts a new one in the same process with /new and goes back with /resume.
SESSION_VARS = ("PI_SESSION_ID",)


def _conversation():
    return next((os.environ[v] for v in SESSION_VARS if os.environ.get(v)), "")


def record_lead(agent):
    """Remember that the CLI session above this process runs `agent` (an orchestrator),
    and, where the CLI names it, in which of its conversations."""
    keys = session_processes(2)
    if not keys:
        return
    conversation = _conversation()
    alive = {f"{pid}:{p[1]}" for pid, p in _processes().items()}
    with locked(LEADS):
        try:
            data = json.loads(LEADS.read_text())
        except (OSError, ValueError):
            data = {}
        data = {k: v for k, v in data.items() if k in alive} if isinstance(data, dict) else {}
        for k in keys:
            if not conversation:
                data[k] = agent
                continue
            old = data.get(k) if isinstance(data.get(k), dict) else {}
            data[k] = {"agent": agent, "sessions": {**old.get("sessions", {}), conversation: agent}}
        write_atomic(LEADS, json.dumps(data, indent=1) + "\n")


def lead_of_session(conversation=""):
    """The orchestrator the calling CLI session runs, as recorded by record_lead, or ''.
    `conversation`: the CLI's conversation the call comes from, where it names one; a
    process that recorded its conversations leads only in those."""
    try:
        data = json.loads(LEADS.read_text())
    except (OSError, ValueError):
        return ""
    if not isinstance(data, dict):
        return ""
    for k in session_processes(1):
        lead = data.get(k)
        if isinstance(lead, dict):
            sessions = lead.get("sessions") or {}
            return sessions.get(conversation, "") if conversation and sessions else lead.get("agent", "")
        if lead:
            return lead
    return ""
