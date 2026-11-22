#!/bin/sh
# Install everything this machine can take, after cloning the repo:
#
#   ./install.sh                 the coding CLIs on PATH (claude, opencode, agy, codex,
#                                cursor-agent), the Herdr app Skills panel if Herdr is
#                                installed, and orc-flow if herdr is on PATH
#   ./install.sh --extras        also the third-party Herdr app mods (pinned):
#                                herdr-nvim, gitview, file-icons, filetree,
#                                markdown-panel, agent-flow
#   ./install.sh --extras=filetree,gitview   only some of them
#   ./install.sh --uninstall     remove all of it (the extras too)
#   ./install.sh --status        what is installed on this machine
#   ./install.sh --dry-run | --force
#
# Other options go to the CLI step, as in installers/<cli>.sh: --cli agy,codex,
# --scope user|project, --project DIR, --agents herdorc, --no-mods. One part
# alone: installers/<target>.sh. Every installed file is a symlink into this
# clone's dist/: rerun ./install.sh after git pull, and after moving the clone.
ROOT=$(cd "$(dirname "$0")" && pwd)
. "$ROOT/installers/_lib.sh"

extras= uninstall= common= cli_args= project_scope=
for arg in "$@"; do
  case $arg in
    -h|--help) sed -n '2,18p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --status) need_python; exec python3 "$ROOT/install.py" --status ;;
    --extras) extras=all ;;
    --extras=*) extras=${arg#--extras=} ;;
    --uninstall) uninstall=--uninstall ;;
    --dry-run|--force) common="$common $arg" ;;
    *) cli_args="$cli_args $(printf '%s' "$arg" | sed "s/'/'\\\\''/g; s/^/'/; s/\$/'/")"
       case $arg in project|--scope=project) project_scope=1 ;; esac ;;
  esac
done
need_python

fail=0
step() {
  title=$1; shift
  printf '\n== %s\n' "$title"
  "$@" || fail=1
}
herdr_app_home=${HERDR_APP_HOME:-$HOME/.config/herdr-app}
has_herdr_app() { command -v herdr-app >/dev/null 2>&1 || [ -d "$herdr_app_home/layouts" ]; }
clis() {
  case $cli_args in *--cli*) return 0 ;; esac
  for b in claude opencode agy codex cursor-agent; do command -v "$b" >/dev/null 2>&1 && return 0; done
  return 1
}
run_clis() {
  if clis; then
    step "coding CLIs" eval "python3 \"\$ROOT/install.py\" $uninstall $common $cli_args"
  else
    printf '\n== coding CLIs: none on PATH (claude, opencode, agy, codex, cursor-agent); skipped\n'
  fi
}

if [ -n "$uninstall" ]; then
  if [ -n "$project_scope" ]; then :
  elif has_herdr_app; then
    step "Herdr app: third-party mods" python3 "$ROOT/herdr-app/extras.py" --uninstall $common
    step "Herdr app: Skills panel" python3 "$ROOT/install.py" --herdr-app --uninstall $common
  fi
  if [ -z "$project_scope" ] && command -v herdr >/dev/null 2>&1; then
    step "herdr: orc-flow" python3 "$ROOT/install.py" --herdr --uninstall $common
  fi
  run_clis
else
  run_clis
  if [ -n "$project_scope" ]; then
    printf '\n== Herdr app and herdr: they are per user, not per project; skipped with --scope project\n'
  else
    if has_herdr_app; then
      step "Herdr app: Skills panel" python3 "$ROOT/install.py" --herdr-app $common
    else
      printf '\n== Herdr app: not installed; skipped\n'
    fi
    if command -v herdr >/dev/null 2>&1; then
      step "herdr: orc-flow" python3 "$ROOT/install.py" --herdr $common
    else
      printf '\n== herdr: not on PATH; skipped\n'
    fi
    if [ -n "$extras" ]; then
      if has_herdr_app; then
        only=; [ "$extras" = all ] || only="--only $extras"
        step "Herdr app: third-party mods" python3 "$ROOT/herdr-app/extras.py" $only $common
      else
        printf '\n== Herdr app third-party mods: Herdr app is not installed; skipped\n'
      fi
    fi
  fi
fi

[ "$fail" = 0 ] || printf '\nSome steps failed; see above. Each one can be rerun alone: installers/<target>.sh\n'
exit "$fail"
