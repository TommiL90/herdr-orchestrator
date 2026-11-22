#!/usr/bin/env python3
"""Shared runtime for the hcorc and herdorc orchestrators.

Backends:
  hcorc   -> herdr-core (`hc`) + herdr-app (window)   [needs $HC_TERMINAL_ID]
  herdorc -> herdr terminal multiplexer (`herdr`)      [needs HERDR_ENV=1]

Subcommands:
  preflight <agent>               gate for /<agent>-* commands; prints role state
  status                          role panes: name, owner, agent, status
  role <role>                     one role's pane state as JSON (dispatch lookup)
  panes [core|judges|review|all|<role>...]
                                  create missing role panes, 2 per tab
  ensure <role> [--name N] [--launch HARNESS --model M [--prompt-file F]]
                                  create one role pane, optionally starting an agent
  phase <phase>|clear             set the ODD phase indicator (explicit)
  phase --hook                    PostToolUse hook: infer the phase from tool activity
  skills [--json]                 same-name skill conflicts: which copy is used, which it shadows

The agent is taken from a leading `--as <agent>` (how install.py calls orc.py from
CLIs other than Claude Code) or else $CLAUDE_CODE_AGENT (set by `claude --agent <name>`).
"""
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
import time
import uuid
from functools import cached_property
from pathlib import Path

import orc_state

ROLES = {
    "core": ["gentle-ai-explore", "gentle-ai-worker", "gentle-ai-verify"],
    "judges": ["jd-judge-a", "jd-judge-b"],
    "review": ["review-risk", "review-readability", "review-reliability",
               "review-resilience", "review-refuter"],
}
ROLES["all"] = ROLES["core"] + ROLES["judges"] + ROLES["review"]
AGENTS = ("hcorc", "herdorc")
PHASES = ("authorizing", "exploring", "researching", "deciding", "planning",
          "implementing", "checking", "closing")
STRONG_INFERRED = {"deciding", "planning", "implementing", "checking"}
STATE_DIR = orc_state.STATE_DIR
ROLES_DIR = Path(__file__).resolve().parent.parent / "roles"


def pointer_message(role, handoff):
    """First message for a role agent: the conditional role line plus the handoff path."""
    return (f"If you have not read your role file in this session, read {ROLES_DIR / role}.md first "
            f"and follow it; otherwise ignore this line. Then read and execute {Path(handoff).resolve()}.")

# harness -> (hc argv builder, herdr kind). PROMPT may be None.
def _argv(harness, model, prompt):
    m = model or None
    table = {
        "claude": (["claude"] + (["--model", m] if m else []) + ([prompt] if prompt else [])),
        "codex": (["codex", "--no-daemon"] + (["-m", m] if m else []) + ([prompt] if prompt else [])),
        "opencode": (["opencode"] + (["--model", m] if m else []) + (["--prompt", prompt] if prompt else [])),
        "agy": (["agy"] + (["--model", m] if m else []) + (["--prompt-interactive", prompt] if prompt else [])),
        "cursor-agent": (["cursor-agent"] + (["--model", m] if m else []) + ([prompt] if prompt else [])),
        "grok": (["grok"] + (["-m", m] if m else []) + ([prompt] if prompt else [])),
        "td": (["td", "--"] + (["--model", m] if m else [])),  # prompt sent after readiness
    }
    if harness not in table:
        raise SystemExit(f"unknown harness {harness!r}; known: {', '.join(table)}")
    return table[harness]

HERDR_KIND = {"claude": "claude", "codex": "codex", "opencode": "opencode", "agy": "agy",
              "cursor-agent": "cursor", "grok": "grok", "td": "pi"}
PROMPT_AT_LAUNCH = {"claude", "codex", "opencode", "agy", "cursor-agent", "grok"}


def die(msg, code=1):
    print(msg, file=sys.stderr)
    sys.exit(code)


def run(args, timeout=20):
    try:
        p = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        return 127, "", f"{args[0]}: not found"
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    return p.returncode, p.stdout, p.stderr


def run_json(args, timeout=20):
    code, out, err = run(args, timeout)
    try:
        return json.loads(out) if out.strip() else None
    except json.JSONDecodeError:
        return None


AS_AGENT = ""  # set by a leading `--as <agent>`; see main()


def current_agent():
    raw = AS_AGENT or os.environ.get("CLAUDE_CODE_AGENT", "")
    return raw.split(":")[-1] if raw else ""


def check_role(role):
    if role not in ROLES["all"]:
        die(f"unknown role {role!r}; roles: {', '.join(ROLES['all'])}")
    return role


def roles_from(args):
    if not args:
        return list(ROLES["core"])
    out = []
    for a in args:
        if a in ROLES:
            out += ROLES[a]
        elif a in ROLES["all"]:
            out.append(a)
        else:
            die(f"unknown role or group {a!r}; groups: {', '.join(ROLES)}; "
                f"roles: {', '.join(ROLES['all'])}")
    return list(dict.fromkeys(out))


def role_pattern(role):
    return re.compile(rf"^{re.escape(role)}(-\d+)?$")


def free_name(role, taken):
    """`role`, else the first free `role-N` (N >= 2)."""
    if role not in taken:
        return role
    n = 2
    while f"{role}-{n}" in taken:
        n += 1
    return f"{role}-{n}"


# ---------------------------------------------------------------- hc backend
class HcBackend:
    name = "hcorc"

    def __init__(self):
        self.me = os.environ.get("HC_TERMINAL_ID", "")
        if not self.me:
            die("hcorc is not running inside a herdr-core terminal ($HC_TERMINAL_ID is empty). "
                "Start the hcorc orchestrator from a Herdr pane.")

    # `hc get` only when space, tab or cwd are needed (the phase hook needs none of them).
    @cached_property
    def info(self):
        return run_json(["hc", "get", self.me, "--json"]) or {}

    @property
    def space(self):
        return (self.info.get("labels") or {}).get("herdr.space", "")

    @property
    def tab(self):
        return (self.info.get("labels") or {}).get("herdr.tab", "")

    @property
    def cwd(self):
        return (self.info.get("foreground") or {}).get("cwd") or os.getcwd()

    def snapshot(self):
        """Live terminals, fetched once per command and shared by every role lookup."""
        return [t for t in (run_json(["hc", "ls", "--json"]) or {}).get("terminals", [])
                if t.get("state") == "live"]

    def describe(self, t):
        return {"name": t.get("name"), "address": t.get("address"),
                "mine": t.get("parent") == self.me, "agent": t.get("agent"),
                "status": t.get("status"), "where": t.get("where"),
                "has_agent": t.get("status") is not None}

    def role_panes(self, role, snap=None):
        snap = self.snapshot() if snap is None else snap
        pat = role_pattern(role)
        return [self.describe(t) for t in snap if pat.match(t.get("name") or "")]

    def new_tab_id(self):
        return f"tbhcorc{self.me}{uuid.uuid4().hex[:10]}"

    def create(self, name, tab_id, argv=None):
        if not self.space:
            die("cannot place panes: this terminal has no herdr.space label (is it a Herdr pane?)")
        cmd = ["hc", "run", "--bg", "--json", "--name", name, "--cwd", self.cwd,
               "--parent", self.me, "--label", f"herdr.space={self.space}",
               "--label", f"herdr.tab={tab_id}"]
        if argv:
            cmd += ["--"] + argv
        code, out, err = run(cmd, timeout=40)
        try:
            data = json.loads(out)
        except json.JSONDecodeError:
            data = {"error": (err or out).strip()}
        if code != 0 or "error" in data:
            return {"name": name, "error": data.get("error", err.strip())}
        return {"name": name, "address": data.get("address"), "tab": tab_id,
                "first_message": data.get("first_message")}

    def _tab_name(self, tab_id):
        for s in (run_json(["herdr-app", "ls"]) or {}).get("spaces", []):
            for tb in s.get("tabs", []):
                if tb.get("id") == tab_id:
                    return tb.get("name") or ""
        return None

    def rename_tab(self, tab_id, title, attempts=12):
        """herdr-app adopts a label-created tab shortly after `hc run`; wait for it."""
        for _ in range(attempts):
            if self._tab_name(tab_id) is not None:
                run(["herdr-app", "do", "tab.rename", "--id", tab_id, "--name", title])
                return True
            time.sleep(0.5)
        return False

    def tab_with_room(self, snap=None):
        """An hcorc tab of mine with a single pane, for on-demand panes."""
        snap = self.snapshot() if snap is None else snap
        app = run_json(["herdr-app", "ls"]) or {}
        mine = {t.get("address") for t in snap if t.get("parent") == self.me}
        for s in app.get("spaces", []):
            if s.get("id") != self.space:
                continue
            for tb in s.get("tabs", []):
                terms = [t.get("terminal") for t in tb.get("terminals", [])]
                if tb.get("id", "").startswith(f"tbhcorc{self.me}") and len(terms) == 1 and terms[0] in mine:
                    return tb["id"]
        return None

    def my_pane_id(self):
        app = run_json(["herdr-app", "ls"]) or {}
        for s in app.get("spaces", []):
            for tb in s.get("tabs", []):
                for t in tb.get("terminals", []):
                    if t.get("terminal") == self.me:
                        return t.get("pane")
        return None

    def app_has(self, command):
        """Whether this herdr-app binary has a command.

        Cached per binary (resolved path, mtime, size), so a cache hit costs a stat
        instead of a subprocess; an update changes the key.
        """
        exe = shutil.which("herdr-app")
        if not exe:
            return False
        try:
            real = os.path.realpath(exe)
            st = os.stat(real)
        except OSError:
            return False
        key = hashlib.sha1(f"{real}|{st.st_mtime_ns}|{st.st_size}".encode()).hexdigest()[:16]
        cache = STATE_DIR / f"herdr-app-commands-{key}.json"
        try:
            names = json.loads(cache.read_text())
        except Exception:
            listed = run_json(["herdr-app", "commands"])
            if listed is None:
                return False  # no answer: do not cache a wrong "absent"
            names = [c.get("name") for c in listed]
            orc_state.write_atomic(cache, json.dumps(names))
        return command in names

    def phase_surface(self):
        """Where the ODD phase is shown, or None when this herdr-app cannot show it."""
        return "pane name" if self.app_has("pane.rename") else None

    def set_label(self, text):
        """ODD phase indicator: the orchestrator's pane name. herdr-app versions without
        pane.rename (0.1.16) show nothing; the indicator turns on by itself once it exists."""
        if not self.phase_surface():
            return
        pane = self.my_pane_id()
        if pane:
            run(["herdr-app", "do", "pane.rename", "--pane", pane, "--name", text])


# ------------------------------------------------------------- herdr backend
class HerdrBackend:
    name = "herdorc"

    def __init__(self):
        if os.environ.get("HERDR_ENV") != "1" or not os.environ.get("HERDR_PANE_ID"):
            die("herdorc is not running inside a herdr pane (HERDR_ENV/HERDR_PANE_ID missing). "
                "Start the herdorc orchestrator from a herdr pane.")
        if not os.environ.get("HERDR_WORKSPACE_ID"):
            die("HERDR_WORKSPACE_ID is missing; herdorc only works inside its own workspace.")
        self.me = os.environ["HERDR_PANE_ID"]
        self.workspace = os.environ["HERDR_WORKSPACE_ID"]
        self.cwd = os.getcwd()
        self.session = orc_state.herdr_session()
        self.state_file = orc_state.herdorc_state_path(self.session, self.workspace, self.me)

    def _result(self, args):
        data = run_json(["herdr"] + args)
        return (data or {}).get("result", data or {})

    def _list(self, kind):
        """`herdr <kind> list` rows for my workspace, or None when herdr did not answer."""
        args = ["herdr", kind, "list"] + (["--workspace", self.workspace] if kind != "agent" else [])
        data = run_json(args)
        if not data or "result" not in data:
            return None
        return data["result"].get(f"{kind}s", [])

    def load_state(self):
        return orc_state.load_herdorc_state(self.state_file)

    def save_state(self, st):
        orc_state.save_herdorc_state(self.state_file, st)

    def snapshot(self):
        """Panes, tabs, agents and verified ownership, fetched once per command.

        Recorded panes/tabs that no longer match (closed, relabelled, or an id
        reused by herdr) are pruned from the state file here.
        """
        state = self.load_state()  # before the lists: what they can vouch for
        panes, tabs, agents = self._list("pane"), self._list("tab"), self._list("agent")
        if panes is None or tabs is None:
            owned_panes, owned_tabs = set(), set()  # cannot verify; keep the file as is
        else:
            owned_panes, owned_tabs, pruned = orc_state.herdr_owned(state, panes, tabs)
            if pruned != state:  # only entries the lists saw and nobody changed since
                orc_state.update_herdorc_state(
                    self.state_file, lambda cur: orc_state.apply_prune(cur, state, pruned))
        return {"panes": panes or [], "tabs": tabs or [],
                "agents": {a.get("pane_id"): a for a in agents or []},
                "owned_panes": owned_panes, "owned_tabs": owned_tabs}

    def tab_with_room(self, snap=None):
        """One of my role tabs that holds a single pane: (tab_id, that pane id), else (None, None)."""
        snap = self.snapshot() if snap is None else snap
        by_tab = {}
        for p in snap["panes"]:
            by_tab.setdefault(p.get("tab_id"), []).append(p.get("pane_id"))
        for tab in sorted(snap["owned_tabs"]):
            if len(by_tab.get(tab, [])) == 1:
                return tab, by_tab[tab][0]
        return None, None

    def role_panes(self, role, snap=None):
        snap = self.snapshot() if snap is None else snap
        pat = role_pattern(role)
        out = []
        for p in snap["panes"]:
            label = p.get("label") or ""
            a = snap["agents"].get(p.get("pane_id")) or {}
            if pat.match(label) or pat.match(a.get("name") or ""):
                out.append({"name": label or a.get("name"), "address": p.get("pane_id"),
                            "mine": p.get("pane_id") in snap["owned_panes"], "agent": p.get("agent"),
                            "agent_name": a.get("name"), "status": p.get("agent_status"),
                            "has_agent": bool(p.get("agent")), "tab": p.get("tab_id")})
        return out

    def new_tab(self, title):
        res = self._result(["tab", "create", "--workspace", self.workspace, "--cwd", self.cwd,
                            "--label", title, "--no-focus"])
        tab = (res.get("tab") or {}).get("tab_id")
        root = (res.get("root_pane") or {}).get("pane_id")
        if tab:
            label = (res.get("tab") or {}).get("label") or title
            orc_state.update_herdorc_state(self.state_file, lambda st: st["tabs"].__setitem__(tab, {"title": label}))
        return tab, root

    def split(self, pane_id):
        res = self._result(["pane", "split", pane_id, "--direction", "right", "--cwd", self.cwd, "--no-focus"])
        return (res.get("pane") or {}).get("pane_id")

    def claim(self, pane_id, name):
        """Label the pane and record it as mine (name + terminal), only if the label took."""
        code, _, _ = run(["herdr", "pane", "rename", pane_id, name])
        pane = self._result(["pane", "get", pane_id]).get("pane") or {}
        if code != 0 or pane.get("label") != name:
            return False
        record = {"name": name, "terminal": pane.get("terminal_id")}
        orc_state.update_herdorc_state(self.state_file, lambda st: st["panes"].__setitem__(pane_id, record))
        return True

    def start_agent(self, name, harness, model, pane_id):
        kind = HERDR_KIND.get(harness)
        if not kind:
            return {"error": f"no herdr kind for {harness}"}
        extra = _argv(harness, model, None)[1:]
        if harness == "codex":
            extra = [a for a in extra if a != "--no-daemon"]
        if harness == "td":
            # herdr has no `td` kind: the pane runs pi (td's agent) with td's arguments,
            # without the td wrapper itself. hcorc runs td as is.
            extra = extra[1:]
        cmd = ["herdr", "agent", "start", name, "--kind", kind, "--pane", pane_id]
        if extra:
            cmd += ["--"] + extra
        code, out, err = run(cmd, timeout=60)
        return {"started": code == 0, "detail": (out or err).strip()[:400]}

    def phase_surface(self):
        return "pane label"

    def set_label(self, text):
        """Show the phase as my pane's label. Clearing hands the pane back to herdr's
        automatic label (herdr's API does not tell a custom label from an automatic one,
        which follows the foreground process or the cwd, so there is nothing to restore)."""
        run(["herdr", "pane", "rename", self.me] + ([text] if text else ["--clear"]))


def backend(agent=None):
    agent = agent or current_agent()
    if agent == "hcorc":
        return HcBackend()
    if agent == "herdorc":
        return HerdrBackend()
    die(f"This only works for the hcorc or herdorc orchestrator (`claude --agent <name>`, or "
        f"`orc.py --as <name>` from another CLI; current agent: {agent or 'none'}).")


# --------------------------------------------------------------- subcommands
def cmd_preflight(argv):
    want = argv[0] if argv else ""
    agent = current_agent()
    if want and agent != want:
        die(f"The /{want}-* commands only work in a {want} session "
            f"(current agent: {agent or 'none'}).")
    b = backend()
    print(f"agent: {b.name}")
    print(f"me: {b.me}")
    if isinstance(b, HcBackend):
        print(f"space: {b.space or '(unknown)'}  tab: {b.tab or '(unknown)'}")
    else:
        print(f"workspace: {b.workspace or '(unknown)'}")
    cmd_status([])


def cmd_status(argv):
    b = backend()
    snap = b.snapshot()
    rows = []
    for role in ROLES["all"]:
        for p in b.role_panes(role, snap):
            rows.append({"role": role, **p})
    print("role panes:")
    if not rows:
        print("  (none)")
    for r in rows:
        print(f"  - {r['name']} [{r['address']}] owner={'me' if r['mine'] else 'OTHER'} "
              f"agent={r.get('agent') or '-'} status={r.get('status') or '-'}")
    surface = b.phase_surface()
    print(f"phase indicator: active ({surface})" if surface
          else "phase indicator: inactive (this multiplexer cannot show it; skip explicit phase reports)")
    reports = STATE_DIR / "reports"
    if reports.is_dir():
        files = sorted(reports.glob("*.md"), key=lambda p: p.stat().st_mtime, reverse=True)[:10]
        print("recent reports:" if files else "recent reports: (none)")
        for f in files:
            print(f"  - {f}")


def cmd_role(argv):
    if not argv:
        die("usage: role <role>")
    role = check_role(argv[0])
    b = backend()
    print(json.dumps({"role": role, "panes": b.role_panes(role)}, indent=1))


def cmd_panes(argv):
    roles = roles_from(argv)
    b = backend()
    snap = b.snapshot()
    created, reused, taken = [], [], []
    todo = []
    for role in roles:
        panes = b.role_panes(role, snap)
        mine = [p for p in panes if p["mine"]]
        if mine:
            reused.append(mine[0])
            continue
        if any(p["name"] == role for p in panes):
            taken.append(next(p for p in panes if p["name"] == role))
            continue
        todo.append(role)
    # two panes per tab
    for i in range(0, len(todo), 2):
        pair = todo[i:i + 2]
        title = f"{b.name} · " + " + ".join(r.replace("gentle-ai-", "").replace("review-", "r-") for r in pair)
        if isinstance(b, HcBackend):
            tab = b.new_tab_id()
            results = [b.create(role, tab) for role in pair]
            created += results
            if any("error" not in r for r in results):
                b.rename_tab(tab, title)
        else:
            tab, root = b.new_tab(title)
            if not tab or not root:
                created += [{"name": r, "error": "tab create failed"} for r in pair]
                continue
            created.append({"name": pair[0], "address": root, "tab": tab} if b.claim(root, pair[0])
                           else {"name": pair[0], "address": root, "error": "pane rename failed"})
            if len(pair) == 2:
                p2 = b.split(root)
                if not p2:
                    created.append({"name": pair[1], "error": "split failed"})
                elif b.claim(p2, pair[1]):
                    created.append({"name": pair[1], "address": p2, "tab": tab})
                else:
                    created.append({"name": pair[1], "address": p2, "error": "pane rename failed"})
    print(json.dumps({"created": created, "reused": reused, "taken_by_others": taken,
                      "next": "Start a coding agent (any CLI) in each created pane. For names "
                              "taken by others, ask the user: use the existing one, create <role>-2, "
                              "or use the internal subagent."}, indent=1))


def cmd_ensure(argv):
    import argparse
    ap = argparse.ArgumentParser(prog="orc.py ensure")
    ap.add_argument("role")
    ap.add_argument("--name")
    ap.add_argument("--launch")
    ap.add_argument("--model", default="")
    ap.add_argument("--handoff", "--prompt-file", dest="handoff",
                    help="handoff file; the new agent receives a pointer to it as its first message")
    a = ap.parse_args(argv)
    check_role(a.role)
    if a.name and not role_pattern(a.role).match(a.name):
        die(f"--name must be {a.role} or {a.role}-<n> (role lookups only find those)")
    if a.launch:
        _argv(a.launch, a.model, None)  # unknown harness: stop before creating any pane
    if a.handoff and not Path(a.handoff).is_file():
        die(f"handoff file not found: {a.handoff}")
    b = backend()
    snap = b.snapshot()
    existing = {p["name"] for p in b.role_panes(a.role, snap)}
    name = a.name or free_name(a.role, existing)
    if name in existing:
        die(f"{name} already exists; pass another --name")
    prompt = pointer_message(a.role, a.handoff) if a.handoff else None
    if isinstance(b, HcBackend):
        reused_tab = b.tab_with_room(snap)
        tab = reused_tab or b.new_tab_id()
        argv_ = _argv(a.launch, a.model, prompt if a.launch in PROMPT_AT_LAUNCH else None) if a.launch else None
        res = b.create(name, tab, argv_)
        if not reused_tab and "error" not in res:
            b.rename_tab(tab, f"{b.name} · {name}")
        # Only when the CLI started with the prompt in its argv; a failed start, or a
        # first message hc reports as not sent (a trust dialog), means: send it yourself.
        first = res.get("first_message")
        res["prompt_delivered_at_launch"] = bool(
            a.launch in PROMPT_AT_LAUNCH and prompt and "error" not in res
            and not (isinstance(first, dict) and first.get("sent") is False))
    else:
        tab, anchor = b.tab_with_room(snap)
        pane = b.split(anchor) if anchor else None
        if not pane:
            tab, pane = b.new_tab(f"{b.name} · {name}")
        if not pane:
            die("could not create a pane (tab create / pane split failed)")
        if not b.claim(pane, name):
            die(f"created pane {pane} but could not label it {name!r}; it is not recorded as yours")
        res = {"name": name, "address": pane, "tab": tab}
        if a.launch:
            res.update(b.start_agent(name, a.launch, a.model, pane))
            if prompt and res.get("started"):
                # --wait --until working: returns once the turn has started (or the agent
                # asks for something), so a later `agent wait` cannot see the idle state
                # from before it. Only agent_prompt_stalled says the text was sent (and no turn
                # was seen); a timeout may expire before the text is sent, so it says nothing.
                code, out, err = run(["herdr", "agent", "prompt", name, prompt, "--wait",
                                      "--until", "working", "--until", "blocked",
                                      "--timeout", "20000"], timeout=60)
                said = (err or out).strip()
                stalled = code != 0 and "agent_prompt_stalled" in said
                res["prompt_sent"] = code == 0 or stalled  # stalled: delivered, never started
                res["prompt_started"] = code == 0
                if code != 0:
                    res["prompt_error"] = said[:400]
    if prompt:
        res["pointer"] = prompt  # what the agent got, or what to send once it is idle
    print(json.dumps(res, indent=1))


# ------------------------------------------------------------------- phases
def _phase_file(agent):
    if agent == "hcorc":
        me = os.environ.get("HC_TERMINAL_ID")
    else:
        me = f"{orc_state.herdr_session()}-{os.environ.get('HERDR_PANE_ID') or 'none'}"
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    return STATE_DIR / f"phase-{agent}-{orc_state.safe(me)}.json"


def _apply_phase(agent, phase, source):
    """Update the indicator only on a real change; the backend is built lazily."""
    f = _phase_file(agent)
    try:
        cur = json.loads(f.read_text())
    except Exception:
        cur = {"phase": None, "source": None}
    if source == "inferred" and cur.get("source") == "explicit" and phase not in STRONG_INFERRED:
        return  # an explicit report survives weaker inferred phases
    if phase == cur.get("phase") and (source == cur.get("source") or source == "inferred"):
        return
    b = backend(agent)  # before the file: a backend that cannot start leaves it untouched
    b.set_label(f"{b.name} · {phase}" if phase else "")
    orc_state.write_atomic(f, json.dumps({"phase": phase, "source": source}))


CHECK_RE = re.compile(r"\b(test|tests|pytest|jest|vitest|mocha|go test|cargo (test|check|clippy|build)|"
                      r"tsc|typecheck|lint|eslint|ruff|mypy|build|make)\b")
READ_RE = re.compile(r"^\s*(ls|cat|head|tail|grep|rg|find|fd|git (status|diff|log|show)|wc|tree)\b")


def infer_phase(tool, tool_input):
    if tool in ("Read", "Grep", "Glob", "WebFetch", "WebSearch") or tool.startswith("mcp__codegraph"):
        return "exploring"
    if tool in ("Edit", "Write", "NotebookEdit", "MultiEdit"):
        path = str(tool_input.get("file_path", ""))
        return "planning" if "/.agents/designs/features/" in path else "implementing"
    if tool in ("TodoWrite",) or tool.startswith("Task"):
        return "planning"
    if tool == "AskUserQuestion":
        return "deciding"
    if tool == "Bash":
        cmd = str(tool_input.get("command", ""))
        if "orc.py phase" in cmd:
            return None
        if CHECK_RE.search(cmd):
            return "checking"
        if READ_RE.match(cmd):
            return "exploring"
    return None


def cmd_phase(argv):
    if argv and argv[0] == "--hook":
        try:
            data = json.load(sys.stdin)
        except Exception:
            return
        if not isinstance(data, dict) or data.get("agent_id"):
            return  # a subagent's tool call says nothing about the orchestrator's phase
        agent = (data.get("agent_type") or current_agent()).split(":")[-1]
        if agent not in AGENTS:
            return
        if agent == "hcorc" and not os.environ.get("HC_TERMINAL_ID"):
            return
        if agent == "herdorc" and os.environ.get("HERDR_ENV") != "1":
            return
        phase = infer_phase(data.get("tool_name", ""), data.get("tool_input") or {})
        if phase:
            try:
                _apply_phase(agent, phase, "inferred")
            except SystemExit:
                pass
        return
    if not argv or (argv[0] not in PHASES and argv[0] != "clear"):
        die(f"usage: phase <{'|'.join(PHASES)}|clear>")
    agent = current_agent()
    if agent not in AGENTS:
        die(f"phase only works in an hcorc or herdorc session (current agent: {agent or 'none'})")
    _apply_phase(agent, None if argv[0] == "clear" else argv[0], "explicit")
    print(f"phase: {argv[0]}")


# ------------------------------------------------------------ skill conflicts
SKILLS_DIR = Path(__file__).resolve().parent.parent / "skills"
PROJECT_SKILL_DIRS = (".claude/skills", ".agents/skills", ".opencode/skills", ".cursor/skills", ".codex/skills")


def user_skill_dirs():
    home = Path.home()
    return [home / ".claude/skills", home / ".agents/skills", home / ".gemini/config/skills",
            Path(os.environ.get("XDG_CONFIG_HOME") or home / ".config") / "opencode/skills",
            home / ".cursor/skills", Path(os.environ.get("CODEX_HOME") or home / ".codex") / "skills"]


def skill_name(skill_md):
    try:
        head = skill_md.read_text(errors="ignore")[:3000]
    except OSError:
        return skill_md.parent.name
    fm = re.match(r"\A---\n(.*?)\n---", head, flags=re.S)
    m = re.search(r"^name:\s*[\"']?([^\"'\n]+?)[\"']?\s*$", fm.group(1), flags=re.M) if fm else None
    return m.group(1).strip() if m else skill_md.parent.name


def scan_skills(dirs, scope, seen):
    out = []
    for d in dirs:
        for md in sorted(d.glob("*/SKILL.md")) if d.is_dir() else []:
            try:
                if not md.is_file():  # a broken link, or a folder named SKILL.md
                    continue
                real = md.resolve()
            except (OSError, RuntimeError):  # a symlink loop
                continue
            if real in seen or (md.parent / ".orc-generated").exists():  # copies older builds made
                continue
            seen.add(real)
            out.append((skill_name(md), scope, md))
    return out


def project_root():
    try:
        r = subprocess.run(["git", "rev-parse", "--show-toplevel"], capture_output=True, text=True, timeout=5)
        if r.returncode == 0 and r.stdout.strip():
            return Path(r.stdout.strip())
    except (OSError, subprocess.SubprocessError):
        pass
    return Path.cwd()


def tilde(path):
    text, home = str(path), str(Path.home())
    return "~" + text[len(home):] if text.startswith(home + os.sep) else text


def cmd_skills(argv):
    """Same-name conflicts between the project's or user's skills and this orchestrator's
    copies. The first copy wins: project, then user, then the orchestrator's (as tomidev's
    registry dedupes); same-purpose conflicts under other names are left to the agent."""
    ours = {skill_name(md): md for md in sorted(SKILLS_DIR.glob("*/SKILL.md"))}
    root, seen = project_root(), {md.resolve() for md in ours.values()}
    # The home folder is not a project: its .claude/skills etc. are the user's skills
    # (a new terminal often starts there).
    home = Path.home().resolve()
    bases = [b for b in dict.fromkeys([Path.cwd().resolve(), root.resolve()]) if b != home]
    found = scan_skills([b / d for b in bases for d in PROJECT_SKILL_DIRS], "project", seen)
    found += scan_skills(user_skill_dirs(), "user", seen)
    conflicts = []
    for name, md in ours.items():
        copies = [{"scope": scope, "path": str(path)} for n, scope, path in found if n == name]
        if copies:
            copies.append({"scope": "orchestrator", "path": str(md)})
            conflicts.append({"skill": name, "use": copies[0], "shadows": copies[1:]})
    if "--json" in argv:
        # Every skill seen, in precedence order; `used` marks the copy that wins its name.
        rows, winners = [], set()
        for name, scope, path in found + [(n, "orchestrator", md) for n, md in ours.items()]:
            rows.append({"name": name, "scope": scope, "path": str(path), "used": name not in winners})
            winners.add(name)
        print(json.dumps({"project": str(root), "conflicts": conflicts, "skills": rows}, indent=1))
        return
    if not conflicts:
        print(f"skills: no same-name conflicts with the orchestrator's {len(ours)} skills ({tilde(root)})")
        return
    print(f"skill conflicts (same name) in {tilde(root)}: the first copy is used")
    for c in conflicts:
        shadows = ", ".join(f"{x['scope']} {tilde(x['path'])}" for x in c["shadows"])
        print(f"- {c['skill']}: uses {c['use']['scope']} {tilde(c['use']['path'])}; shadows {shadows}")


def main():
    global AS_AGENT
    args = sys.argv[1:]
    if args and (args[0] == "--as" or args[0].startswith("--as=")):
        AS_AGENT, args = (args[0][5:], args[1:]) if "=" in args[0] else ((args[1:2] or [""])[0], args[2:])
        if AS_AGENT not in AGENTS:
            die(f"--as takes one of: {', '.join(AGENTS)}")
    if not args:
        die(__doc__)
    cmd, argv = args[0], args[1:]
    handlers = {"preflight": cmd_preflight, "status": cmd_status, "role": cmd_role,
                "panes": cmd_panes, "ensure": cmd_ensure, "phase": cmd_phase,
                "skills": cmd_skills}
    if cmd not in handlers:
        die(__doc__)
    handlers[cmd](argv)


if __name__ == "__main__":
    main()
