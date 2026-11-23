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
  - herdr server stop, session stop|delete, update, channel set, config,
    integration install/uninstall
  - herdr machine add|rm|remove|enable|disable|reconnect, --trust-repository
  - herdr workspace close; tab/pane close on anything this orchestrator does not own
    (orc_state.herdr_owned: recorded id, same label, same terminal)

The other multiplexer: what one orchestrator's rules block, the other
orchestrator may run only after the user confirms it. In Claude Code the hook
answers "ask" (permissionDecision), so the user approves that one call.

Session exemption: an `hc` call aimed at another session (`HC_SESSION=<name> hc ...`)
or a `herdr` call with `--session <name>` / `--session=<name>` is allowed when <name>
is a literal that differs from the current session ($HC_SESSION / $HERDR_SESSION,
else "default"). The last assignment or flag wins, `env -u HC_SESSION` / `env -i`
reset it, and it never carries into a nested shell (`HC_SESSION=x bash -c ...` is
checked as the current session). It is meant for isolated test servers; a second
real session of the user also counts as "another session".

Commands are found through shell wrappers (env, sudo, nohup, timeout, xargs, ...),
subshells, `bash|sh|zsh -c '...'`, `eval`, `$( ... )` / backtick bodies and heredocs
fed to a shell; redirections (`>/dev/null`, `2>&1`) are dropped. This is a
best-effort parser, not a sandbox.

Every CLI with hooks runs it, `--format` naming the hook protocol (default claude):
  claude    tool_input.command; exit 2 blocks, a PreToolUse "ask" decision asks
  agy       toolCall.args.CommandLine of run_command; {"decision": "deny"|"force_ask"}
  cursor    command (beforeShellExecution); {"permission": "deny"|"ask"}
  codex     tool_input.command; exit 2 only
  opencode  command, from the orc guard plugin; exit 2 only (the plugin throws)
  grok      toolInput.command (Claude Code's hook format); {"decision": "deny"|"ask"}
  pi        command, from the orc guard extension; {"decision": "deny"|"ask"}, which the
            extension turns into a block or a confirmation dialog
Where a hook can only refuse (codex, opencode), a call that needs the user's yes is
refused with the instruction to ask, and runs once rerun with a leading
`ORC_CONFIRMED=1` (accepted for those calls only, never for a blocked one).
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
REDIRECT_RE = re.compile(r"^(&>>?|>>?&?|<<?<?|<&|<>|>\|)$")
HEREDOC_RE = re.compile(r"<<-?\s*(['\"]?)([A-Za-z_][A-Za-z0-9_]*)\1")
MAX_DEPTH = 5


class Blocked(Exception):
    """A rule of this orchestrator's own multiplexer: the call is refused."""


ASKS = []


def block(reason: str) -> None:
    raise Blocked(reason)


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
    children = any(t == "--children" or t.startswith("--children=") for t in rest)
    if sub in HC_NEEDS_TARGET and not (sub == "wait" and children) and not positionals(rest, values):
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
    """Live `herdr <kind> list` rows for this workspace; None when herdr gives no
    valid answer (an error is not an empty list: nothing can be verified from it)."""
    workspace = os.environ.get("HERDR_WORKSPACE_ID", "")
    try:
        out = subprocess.run(["herdr", kind, "list", "--workspace", workspace],
                             capture_output=True, text=True, timeout=10)
        if out.returncode != 0:
            return None
        rows = (json.loads(out.stdout or "{}").get("result") or {}).get(f"{kind}s")
        return rows if isinstance(rows, list) else None
    except Exception:
        return None


def herdr_owned():
    """Panes and tabs this orchestrator verifiably owns; none when herdr cannot say."""
    state = orc_state.load_herdorc_state(orc_state.herdorc_state_path())
    if not state["panes"] and not state["tabs"]:
        return set(), set()
    panes, tabs = herdr_rows("pane"), herdr_rows("tab")
    if panes is None or tabs is None:
        return set(), set()
    owned_panes, owned_tabs, _ = orc_state.herdr_owned(state, panes, tabs)
    return owned_panes, owned_tabs


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
        if flag == "--session":  # the last one wins
            other = other_session(value, orc_state.herdr_session())
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
    if sub == "session" and first and first[0] in ("stop", "delete"):
        block(f"`herdr session {first[0]}` ends or deletes a session of the user. Ask the user to do it.")
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
def split_heredocs(command):
    """(command without heredoc bodies, [bodies fed to a shell]).

    A heredoc body is data unless the command that reads it is a shell
    (`bash <<EOF`, `cd x && bash <<EOF`), in which case it is a script to check.
    `<<` counts only outside quotes and comments, so `echo "a <<X"` hides no
    later line; the command it belongs to starts after the last `;`, `&`, `|`
    or parenthesis before it.
    """
    lines, out, scripts, i, quote = command.split("\n"), [], [], 0, None
    while i < len(lines):
        line = lines[i]
        out.append(line)
        i += 1
        pending, start, j = [], 0, 0  # pending: (delimiter, read by a shell)
        while j < len(line):
            c = line[j]
            if quote:
                if c == "\\" and quote == '"':
                    j += 2
                    continue
                if c == quote:
                    quote = None
                j += 1
            elif c == "\\":
                j += 2
            elif c in "'\"":
                quote = c
                j += 1
            elif c == "#" and (j == 0 or line[j - 1] in " \t;&|()"):
                break  # a comment runs to the end of the line
            elif c in ";&|()":
                start = j = j + 1
            elif line.startswith("<<<", j):
                j += 3  # a here-string, not a heredoc
            elif line.startswith("<<", j) and (m := HEREDOC_RE.match(line, j)):
                pending.append((m.group(2), read_by_shell(line[start:j])))
                j = m.end()
            else:
                j += 1
        for delimiter, shell in pending:
            body = []
            while i < len(lines) and lines[i].strip() != delimiter:
                body.append(lines[i])
                i += 1
            i += 1  # the delimiter line
            if shell:
                scripts.append("\n".join(body))
    return "\n".join(out), scripts


def read_by_shell(text):
    """Whether the simple command `text` (up to its `<<`) runs a shell."""
    segs = list(segments(text))
    if not segs:
        return False
    tokens = strip_prefix(segs[-1])[0]
    return bool(tokens) and os.path.basename(tokens[0]) in SHELLS


def drop_redirections(tokens):
    """Remove `>file`, `2>&1`, `<in`, `&>log` and the like from a token list."""
    out, i = [], 0
    while i < len(tokens):
        tok = tokens[i]
        if REDIRECT_RE.match(tok):
            if out and out[-1].isdigit():
                out.pop()  # the fd in front: 2>&1
            i += 2  # the operator and its target
            continue
        out.append(tok)
        i += 1
    return out


def drop_comments(command):
    """The command without its comments (`#` at a word's start, outside quotes, to
    the end of its line). The newline stays: the next line is its own command."""
    out, quote, j, n = [], None, 0, len(command)
    while j < n:
        c = command[j]
        if quote:
            if c == "\\" and quote == '"' and j + 1 < n:
                out.append(command[j:j + 2])
                j += 2
                continue
            if c == quote:
                quote = None
        elif c == "\\" and j + 1 < n:
            out.append(command[j:j + 2])
            j += 2
            continue
        elif c in "'\"":
            quote = c
        elif c == "#" and (j == 0 or command[j - 1] in " \t\n;&|()"):
            while j < n and command[j] != "\n":
                j += 1
            continue
        out.append(c)
        j += 1
    return "".join(out)


def segments(command):
    """Split a shell line into simple commands, honoring quotes.

    Operators inside quotes (e.g. `echo 'a; hc kill x'`) are text, not
    separators; `(` and `)` separate like `;` so subshells are checked.
    Redirections are dropped. With unbalanced quoting, words and operators
    are split without quotes (lines and `;` still separate commands).
    """
    command = drop_comments(command)
    try:
        lex = shlex.shlex(command, posix=True, punctuation_chars=";&|\n()<>")
        lex.whitespace = " \t\r"
        lex.whitespace_split = True
        lex.commenters = ""  # drop_comments did it: shlex's would swallow the newline too
        tokens = list(lex)
    except ValueError:
        tokens = re.findall(r"[;&|\n()<>]+|[^\s;&|\n()<>]+", command)
    seg = []
    for tok in tokens:
        if tok and set(tok) <= SEPARATORS:
            if seg:
                yield drop_redirections(seg)
            seg = []
        elif tok:
            seg.append(tok)
    if seg:
        yield drop_redirections(seg)


def strip_prefix(tokens):
    """Drop assignments, shell keywords and wrapper programs in front of the real command.

    Returns (command_tokens, hc_session, nested_command_lines). hc_session is the
    HC_SESSION the command gets from this line: the last assignment wins, and
    `env -u HC_SESSION` / `env -i` reset it to the inherited one (None: unchanged).
    """
    hc_session, nested, i = None, [], 0
    while i < len(tokens):
        tok = tokens[i]
        m = ASSIGN_RE.match(tok)
        if m:
            if m.group(1) == "HC_SESSION":
                hc_session = m.group(2)
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
            if name == "command" and flag in ("-v", "-V"):
                return [], hc_session, nested  # only looks the program up
            if name == "env" and (flag in ("-i", "--ignore-environment", "-")):
                hc_session = None
            if flag in values and i < len(tokens):
                if name == "env" and flag in ("-S", "--split-string"):
                    nested.append(tokens[i])
                if name == "env" and flag in ("-u", "--unset") and tokens[i] == "HC_SESSION":
                    hc_session = None
                i += 1
            elif name == "env" and flag.startswith("--unset=") and flag.endswith("=HC_SESSION"):
                hc_session = None
        i += WRAPPER_POSITIONALS.get(name, 0)
    return tokens[i:], hc_session, nested


def shell_script(args):
    """The script of `<shell> [flags] -c 'script'` (flags like -lc, -ec count), else None."""
    wants = False
    for tok in args:
        if tok.startswith("-") and not tok.startswith("--"):
            wants = wants or "c" in tok[1:]
            continue
        return tok if wants else None
    return None


def rules(prog, args, hc_session):
    """The rule check for one program, or None when no rule covers it."""
    if prog == "hc":
        if hc_session is not None and other_session(hc_session, os.environ.get("HC_SESSION") or "default"):
            return None  # an isolated hc server
        return lambda: check_hc(args)
    if prog == "herdr-app":
        return lambda: check_herdr_app(args)
    if prog == "herdr":
        return lambda: check_herdr(args)
    return None


OWN = {"hcorc": ("hc", "herdr-app"), "herdorc": ("herdr",)}


def check_command(command, agent, depth=0):
    if not MENTION_RE.search(command):
        return
    if depth > MAX_DEPTH:
        block("command nests shells too deeply to check. Run the hc/herdr call directly.")
    command, scripts = split_heredocs(command)
    for script in scripts:
        check_command(script, agent, depth + 1)
    for pattern in SUBST_RES:
        for body in pattern.findall(command):
            check_command(body, agent, depth + 1)
    for tokens in segments(command):
        tokens, hc_session, nested = strip_prefix(tokens)
        for line in nested:
            check_command(line, agent, depth + 1)
        if not tokens:
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
        check = rules(prog, tokens[1:], hc_session)
        if check is None:
            continue
        if prog in OWN[agent]:
            check()
            continue
        try:  # the other multiplexer: allowed after the user confirms
            check()
        except Blocked as e:
            ASKS.append(f"{agent} is about to run a command of the other multiplexer ({prog}): {e}")


FORMATS = ("claude", "codex", "agy", "cursor", "opencode", "grok", "pi")
CONFIRMED_RE = re.compile(r"^\s*ORC_CONFIRMED=1\s+\S")
RERUN = ("To run it yourself instead, ask the user with your ask tool, showing the exact command and why; "
         "only after their yes, run it again unchanged except for a leading `ORC_CONFIRMED=1 `. "
         "Never add it without their yes.")


def command_of(data, fmt):
    """The shell command in the hook input of `fmt`'s CLI, or None for a call that is not one."""
    if fmt == "agy":
        call = data.get("toolCall") or {}
        if call.get("name") != "run_command":
            return None
        args = call.get("args") or {}
        return args.get("CommandLine") or args.get("command") or ""
    if fmt in ("cursor", "opencode", "pi"):
        return data.get("command") or ""
    if fmt == "grok":
        tool_input = data.get("toolInput") or data.get("tool_input") or {}
        return (tool_input.get("command") or "") if isinstance(tool_input, dict) else ""
    return (data.get("tool_input") or {}).get("command") or ""


def truncated(data, fmt):
    """Grok sends a call's input past 128 KiB as a string ending in " [truncated]", and says
    so in toolInputTruncated: the command can't be read."""
    if fmt != "grok":
        return False
    tool_input = data.get("toolInput", data.get("tool_input"))
    return data.get("toolInputTruncated") is True or isinstance(tool_input, str)


def orchestrator(data, fmt="claude"):
    """hcorc/herdorc when the session's main agent or the calling agent is one, else ''.
    Outside Claude Code no variable names the agent: `orc.py --as <agent>` records the
    CLI session it runs in, and the guard (started by that same CLI) looks it up."""
    for raw in (os.environ.get("CLAUDE_CODE_AGENT", ""), data.get("agent_type") or ""):
        name = raw.split(":")[-1]
        if name in AGENTS:
            return name
    if fmt == "claude":
        return ""
    # pi's extension sends its conversation (pi keeps one process across /new and /resume).
    name = orc_state.lead_of_session(str(data.get("session_id") or ""))
    return name if name in AGENTS else ""


def answer(fmt, decision, reason):
    """Tell `fmt`'s CLI to deny or ask; exits."""
    reason = "orchestrator guard: " + reason
    if fmt == "claude":
        if decision == "deny":
            print(reason, file=sys.stderr)
            sys.exit(2)
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PreToolUse", "permissionDecision": "ask", "permissionDecisionReason": reason}}))
    elif fmt == "agy":
        print(json.dumps({"decision": "deny" if decision == "deny" else "force_ask", "reason": reason}))
    elif fmt == "cursor":
        print(json.dumps({"permission": decision, "user_message": reason, "agent_message": reason}))
    elif fmt == "grok":  # a deny in the JSON stands whatever the exit code; 2 says it too
        print(json.dumps({"decision": decision, "reason": reason}))
        sys.exit(2 if decision == "deny" else 0)
    elif fmt == "pi":  # the extension blocks, or asks in pi's dialog
        print(json.dumps({"decision": decision, "reason": reason}))
    else:  # codex, opencode: a hook can only refuse, so asking is the agent's job
        print(reason if decision == "deny" else f"{reason.rstrip('.')}. {RERUN}", file=sys.stderr)
        sys.exit(2)
    sys.exit(0)


def main():
    fmt = "claude"
    argv = sys.argv[1:]
    if argv[:1] == ["--format"] and len(argv) > 1:
        fmt = argv[1]
    elif argv[:1] and argv[0].startswith("--format="):
        fmt = argv[0].split("=", 1)[1]
    if fmt not in FORMATS:
        print(f"orchestrator guard: --format takes one of {', '.join(FORMATS)}", file=sys.stderr)
        sys.exit(0)
    try:
        data = json.load(sys.stdin)
    except Exception:
        sys.exit(0)
    if not isinstance(data, dict):
        sys.exit(0)
    if truncated(data, fmt):  # unreadable: an orchestrator's call is refused, anyone else's runs
        if orchestrator(data, fmt):
            answer(fmt, "deny", "Grok cut this shell call's input past 128 KiB, so the guard cannot read "
                   "the command. Run it again shorter: put long text in a file and pass the file's path.")
        sys.exit(0)
    command = command_of(data, fmt)
    if not command or not MENTION_RE.search(command):
        sys.exit(0)
    agent = orchestrator(data, fmt)
    if not agent:
        sys.exit(0)
    try:
        check_command(command, agent)
    except Blocked as e:
        answer(fmt, "deny", str(e))
    if ASKS and not (fmt in ("codex", "opencode") and CONFIRMED_RE.match(command)):
        answer(fmt, "ask", " | ".join(dict.fromkeys(ASKS)))
    sys.exit(0)


if __name__ == "__main__":
    main()
