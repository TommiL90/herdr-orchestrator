#!/usr/bin/env python3
"""PreToolUse guard (Bash) for the hcorc and herdorc orchestrators.

Registered in settings.json (agent-frontmatter hooks do not fire for a main
session started with `claude --agent`). It acts when the session's main agent
($CLAUDE_CODE_AGENT, set by `claude --agent`) or the calling agent (hook input
`agent_type`) is hcorc or herdorc, so the orchestrator's internal subagents are
held to the same rules.

hcorc (hc / herdr-app) blocks:
  - hc server stop|restart, hc update, hc machine rm, hc send --force
  - hc kill|rm on a terminal that is not a child of this orchestrator
  - bare `hc`, `hc attach`, `hc run` without a program, and
    read/get/interrupt/wait without a target (interactive: would hang)
  - herdr-app do commands that close or reset the user's layout, and
    terminal.kill on a non-child
herdorc (herdr multiplexer) blocks:
  - bare `herdr` (launches the TUI), session/agent attach, --remote/--session without a command
  - herdr server stop, update, channel set, config, integration install/uninstall
  - herdr machine add|rm|remove|enable|disable|reconnect, --trust-repository
  - herdr workspace close; tab/pane close on anything this orchestrator does not own
    (orc_state.herdr_owned: recorded id, same label, same terminal)

Session exemption: a segment aimed at another session (`HC_SESSION=<name> hc ...`,
`herdr --session <name> ...` or `--session=<name>`) is allowed when <name> is a
literal that differs from the current session ($HC_SESSION / $HERDR_SESSION, else
"default"). That is meant for isolated test servers; a second real session of the
user also counts as "another session", so the rules still forbid touching it.

Commands are found through shell wrappers (env, sudo, nohup, timeout, xargs, ...),
subshells, `bash|sh|zsh -c '...'`, `eval`, and `$( ... )` / backtick bodies. This
is a best-effort parser, not a sandbox. Exit 2 blocks; exit 0 allows.
"""
import json
import os
import re
import shlex
import subprocess
import sys

import orc_state

AGENTS = ("hcorc", "herdorc")
BLOCKED_APP_COMMANDS = {
    "pane.close", "tab.close", "space.close", "layout.reset", "layout.set",
    "app.quit", "app.reset", "app.update", "app.update_core", "window.close",
}
HC_VALUE_FLAGS = {
    "run": {"--name", "--cwd", "--on", "--label", "--parent", "--timeout"},
    "read": {"--lines"},
    "wait": {"--children", "--output", "--timeout"},
    "interrupt": {"--timeout"},
    "send": {"--if", "--timeout"},
    "attach": {"--history"},
    "ls": {"--label"},
}
HC_NEEDS_TARGET = {"read", "get", "interrupt", "wait"}
HERDR_GLOBAL_VALUE_FLAGS = ("--session", "--machine", "--remote")

# Programs that run another command: name -> flags that take a value.
WRAPPERS = {
    "env": {"-u", "--unset", "-S", "--split-string", "-C", "--chdir", "-P"},
    "sudo": {"-u", "--user", "-g", "--group", "-h", "--host", "-p", "--prompt", "-C",
             "--close-from", "-U", "--other-user", "-r", "--role", "-t", "--type",
             "-D", "--chdir", "-R", "--chroot", "-T", "--command-timeout"},
    "doas": {"-u", "-C"},
    "nohup": set(), "setsid": set(), "command": set(), "builtin": set(),
    "exec": {"-a"},
    "time": {"-f", "--format", "-o", "--output"},
    "nice": {"-n", "--adjustment"},
    "timeout": {"-s", "--signal", "-k", "--kill-after"},
    "xargs": {"-n", "--max-args", "-I", "-L", "--max-lines", "-P", "--max-procs",
              "-d", "--delimiter", "-s", "--max-chars", "-E", "-a", "--arg-file"},
    "stdbuf": {"-i", "-o", "-e"},
    "watch": {"-n", "--interval"},
    "caffeinate": {"-t", "-w"},
    "rtk": set(), "bypass": set(),
}
WRAPPER_POSITIONALS = {"timeout": 1}  # the duration before the command
KEYWORDS = {"{", "}", "!", "then", "do", "else", "elif", "if", "while", "until"}
SHELLS = {"bash", "sh", "zsh", "dash", "ksh", "fish"}
ASSIGN_RE = re.compile(r"^([A-Za-z_][A-Za-z0-9_]*)=(.*)$", re.S)
MENTION_RE = re.compile(r"\b(hc|herdr-app|herdr)\b")
SUBST_RES = (re.compile(r"\$\(([^()]*)\)"), re.compile(r"`([^`]*)`"))
SEPARATORS = set(";&|\n()")
MAX_DEPTH = 5


def block(reason: str) -> None:
    print(f"orchestrator guard: {reason}", file=sys.stderr)
    sys.exit(2)


def positionals(tokens, values=frozenset()):
    out, skip = [], False
    for i, t in enumerate(tokens):
        if skip:
            skip = False
            continue
        if t == "--":
            out.extend(tokens[i + 1:])
            break
        if t.startswith("-"):
            if t in values:
                skip = True
            continue
        out.append(t)
    return out


def other_session(requested, current):
    """True when `requested` is a literal session name different from the current one."""
    if any(c in requested for c in "$`"):
        return False  # unknown until the shell expands it
    return (requested or "default") != current


# ------------------------------------------------------------------ hcorc
def hc_is_child(target: str) -> bool:
    me = os.environ.get("HC_TERMINAL_ID", "")
    if not me or not target:
        return False
    try:
        out = subprocess.run(["hc", "get", target, "--json"], capture_output=True, text=True, timeout=10)
        return json.loads(out.stdout or "{}").get("parent") == me
    except Exception:
        return False


def check_hc(args):
    if not args or args[0] == "--json":
        block("bare `hc` attaches to a terminal interactively and would hang. Pass a command and a target.")
    sub, rest = args[0], args[1:]
    if "-h" in rest or "--help" in rest:
        return
    values = HC_VALUE_FLAGS.get(sub, set())
    if sub == "attach":
        block("`hc attach` is interactive and would hang your shell. Use `hc read <t>`, or ask the user to attach.")
    if sub == "run" and not positionals(rest, values):
        block("`hc run` without a program opens a shell and waits. Pass a program, or use `orc.py ensure`.")
    if sub in HC_NEEDS_TARGET and not (sub == "wait" and "--children" in rest) and not positionals(rest, values):
        block(f"`hc {sub}` without a target asks which terminal to use. Pass a name or address.")
    if sub == "server" and positionals(rest)[:1] in (["stop"], ["restart"]):
        block("`hc server stop/restart` affects every terminal of the user. Ask the user to do it.")
    if sub == "update":
        block("`hc update` restarts the core. Ask the user to do it.")
    if sub == "machine" and positionals(rest)[:1] == ["rm"]:
        block("`hc machine rm` is the user's decision. Ask the user to do it.")
    if sub == "send" and "--force" in rest:
        block("`hc send --force` bypasses a blocked agent. Relay the question to the user instead.")
    if sub in ("kill", "rm"):
        targets = positionals(rest)
        if not targets:
            block(f"`hc {sub}` needs an explicit target (one of your own children).")
        for t in targets:
            if not hc_is_child(t):
                block(f"`hc {sub} {t}`: {t} is not a child of this orchestrator. "
                      "Only clean up terminals you started; ask the user for others.")


def check_herdr_app(args):
    if len(args) < 2 or args[0] != "do":
        return
    command = args[1].split(":", 1)[0]
    if command in BLOCKED_APP_COMMANDS:
        block(f"`herdr-app do {command}` changes or closes the user's layout. Ask the user to do it.")
    if command == "terminal.kill":
        rest, target = args[2:], None
        for i, tok in enumerate(rest):
            if tok == "--terminal" and i + 1 < len(rest):
                target = rest[i + 1]
            elif tok.startswith("--terminal="):
                target = tok.split("=", 1)[1]
        if ":" in args[1]:
            target = args[1].split(":", 1)[1]
        if not target or not hc_is_child(target):
            block("`herdr-app do terminal.kill` is only allowed on your own children (use `hc kill <name>`).")


# ---------------------------------------------------------------- herdorc
def herdr_rows(kind):
    """Live `herdr <kind> list` rows for this workspace ([] when herdr does not answer)."""
    workspace = os.environ.get("HERDR_WORKSPACE_ID", "")
    try:
        out = subprocess.run(["herdr", kind, "list", "--workspace", workspace],
                             capture_output=True, text=True, timeout=10)
        return (json.loads(out.stdout or "{}").get("result") or {}).get(f"{kind}s", [])
    except Exception:
        return []


def herdr_owned():
    state = orc_state.load_herdorc_state(orc_state.herdorc_state_path())
    if not state["panes"] and not state["tabs"]:
        return set(), set()
    panes, tabs, _ = orc_state.herdr_owned(state, herdr_rows("pane"), herdr_rows("tab"))
    return panes, tabs


def strip_herdr_globals(args):
    """Drop leading --session/--machine/--remote (both `--flag v` and `--flag=v`).

    Returns (rest, aimed_at_other_session).
    """
    rest, other = list(args), False
    while rest:
        head = rest[0]
        flag, eq, value = head.partition("=")
        if flag not in HERDR_GLOBAL_VALUE_FLAGS:
            break
        if not eq:
            value = rest[1] if len(rest) > 1 else ""
            rest = rest[2:]
        else:
            rest = rest[1:]
        if flag == "--session" and other_session(value, orc_state.herdr_session()):
            other = True
    return rest, other


def check_herdr(args):
    rest, other = strip_herdr_globals(args)
    if not rest:
        block("bare `herdr` launches or attaches the TUI and would hang. Use a command group "
              "(`herdr pane ...`, `herdr agent ...`).")
    if other:
        return
    sub = rest[0]
    tail = rest[1:]
    if "--help" in tail or "-h" in tail or sub in ("--help", "-h", "--version", "-V", "help", "status"):
        return
    first = positionals(tail)[:1]
    if sub == "session" and first == ["attach"]:
        block("`herdr session attach` is interactive. Ask the user to attach.")
    if sub == "agent" and first == ["attach"]:
        block("`herdr agent attach` is interactive. Use `herdr agent read`, or ask the user to attach.")
    if sub == "server" and first == ["stop"]:
        block("`herdr server stop` ends every pane's processes. Ask the user to do it.")
    if sub in ("update", "channel", "config"):
        block(f"`herdr {sub}` changes the user's installation. Ask the user to do it.")
    if sub == "integration" and first and first[0] in ("install", "uninstall"):
        block("herdr integrations are the user's decision. Ask the user to do it.")
    if sub == "machine" and first and first[0] in ("add", "rm", "remove", "enable", "disable", "reconnect"):
        block("Saved machines are the user's decision (reconnect needs their SSH auth). Ask the user.")
    if "--trust-repository" in tail:
        block("`--trust-repository` grants Git trust; only after the user verified the repository.")
    if sub == "workspace" and first == ["close"]:
        block("`herdr workspace close` closes the user's workspace. Ask the user to do it.")
    if sub in ("tab", "pane") and first == ["close"]:
        targets = positionals(tail)[1:]
        panes, tabs = herdr_owned()
        owned = tabs if sub == "tab" else panes
        if not targets or any(t not in owned for t in targets):
            block(f"`herdr {sub} close` is only allowed on {sub}s this orchestrator created "
                  "(same id, label and terminal as recorded).")


# --------------------------------------------------------------- parsing
def segments(command):
    """Split a shell line into simple commands, honoring quotes.

    Operators inside quotes (e.g. `echo 'a; hc kill x'`) are text, not
    separators; `(` and `)` separate like `;` so subshells are checked.
    Falls back to a plain split if the quoting is unbalanced.
    """
    try:
        lex = shlex.shlex(command, posix=True, punctuation_chars=";&|\n()")
        lex.whitespace = " \t\r"
        lex.whitespace_split = True
        lex.commenters = "#"
        tokens = list(lex)
    except ValueError:
        tokens = re.split(r"\s+", command)
    seg = []
    for tok in tokens:
        if tok and set(tok) <= SEPARATORS:
            if seg:
                yield seg
            seg = []
        elif tok:
            seg.append(tok)
    if seg:
        yield seg


def strip_prefix(tokens):
    """Drop assignments, shell keywords and wrapper programs in front of the real command.

    Returns (command_tokens, aimed_at_other_hc_session, nested_command_lines).
    """
    other, nested, i = False, [], 0
    current_hc = os.environ.get("HC_SESSION") or "default"
    while i < len(tokens):
        tok = tokens[i]
        m = ASSIGN_RE.match(tok)
        if m:
            if m.group(1) == "HC_SESSION" and other_session(m.group(2), current_hc):
                other = True
            i += 1
            continue
        if tok in KEYWORDS or tok.isdigit():
            i += 1
            continue
        name = os.path.basename(tok)
        if name not in WRAPPERS:
            break
        values = WRAPPERS[name]
        i += 1
        while i < len(tokens) and tokens[i].startswith("-") and tokens[i] != "-":
            flag = tokens[i]
            i += 1
            if flag == "--":
                break
            if flag in values and i < len(tokens):
                if name == "env" and flag in ("-S", "--split-string"):
                    nested.append(tokens[i])
                i += 1
        i += WRAPPER_POSITIONALS.get(name, 0)
    return tokens[i:], other, nested


def shell_script(args):
    """The script of `<shell> [flags] -c 'script'` (flags like -lc, -ec count), else None."""
    wants = False
    for tok in args:
        if tok.startswith("-") and not tok.startswith("--"):
            wants = wants or "c" in tok[1:]
            continue
        return tok if wants else None
    return None


def check_command(command, agent, depth=0):
    if not MENTION_RE.search(command):
        return
    if depth > MAX_DEPTH:
        block("command nests shells too deeply to check. Run the hc/herdr call directly.")
    for pattern in SUBST_RES:
        for body in pattern.findall(command):
            check_command(body, agent, depth + 1)
    for tokens in segments(command):
        tokens, other, nested = strip_prefix(tokens)
        for line in nested:
            check_command(line, agent, depth + 1)
        if not tokens or other:
            continue
        prog = os.path.basename(tokens[0])
        if prog in SHELLS:
            script = shell_script(tokens[1:])
            if script:
                check_command(script, agent, depth + 1)
            continue
        if prog == "eval":
            check_command(" ".join(tokens[1:]), agent, depth + 1)
            continue
        if agent == "hcorc":
            if prog == "hc":
                check_hc(tokens[1:])
            elif prog == "herdr-app":
                check_herdr_app(tokens[1:])
        elif agent == "herdorc" and prog == "herdr":
            check_herdr(tokens[1:])


def orchestrator(data):
    """hcorc/herdorc when the session's main agent or the calling agent is one, else ''."""
    for raw in (os.environ.get("CLAUDE_CODE_AGENT", ""), data.get("agent_type") or ""):
        name = raw.split(":")[-1]
        if name in AGENTS:
            return name
    return ""


def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    agent = orchestrator(data)
    if not agent:
        sys.exit(0)
    check_command((data.get("tool_input") or {}).get("command") or "", agent)
    sys.exit(0)


if __name__ == "__main__":
    main()
