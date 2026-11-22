# Sourced by the scripts in installers/ and by ./install.sh, after they set ROOT.
die() { echo "$*" >&2; exit 1; }

# install.py and herdr-app/extras.py use only Python's standard library, 3.9 or later.
need_python() {
  command -v python3 >/dev/null 2>&1 || die "python3 (3.9 or later) is needed; it is not on PATH."
  python3 -c 'import sys; sys.exit(sys.version_info < (3, 9))' \
    || die "python3 3.9 or later is needed; found $(python3 -V 2>&1)."
}
