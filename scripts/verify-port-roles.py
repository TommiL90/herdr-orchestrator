import sys, importlib.util
from pathlib import Path
if len(sys.argv) != 3:
    sys.exit("usage: verify-port-roles.py <scripts/port-roles.py> <empty output dir>\n"
             "Reverse-applies port-roles.py's edits and checks they give back tomidev-shell's text.")
spec = importlib.util.spec_from_file_location("p", sys.argv[1]); p = importlib.util.module_from_spec(spec); spec.loader.exec_module(p)
out = Path(sys.argv[2]); ok = True
for role in p.ROLES:
    _, src_body = p.split_frontmatter((p.SRC / f"{role}.md").read_text())
    dst = (p.DST / "roles" / f"{role}.md").read_text()
    lines = dst.split("\n")
    assert lines[0].startswith(f"<!-- Ported from tomidev-shell@{p.COMMIT} assets/agents/{role}.md;") and lines[1] == f"# Role: {role}" and lines[2] == "", role
    dst_body = "\n".join(lines[3:])
    (out / f"{role}.src").write_text(src_body); (out / f"{role}.dst").write_text(dst_body)
    rev = dst_body
    for _, old, new, _, _ in reversed(p.EDITS[role]):
        assert rev.count(new) == 1, (role, new); rev = rev.replace(new, old)
    same = rev == src_body; ok &= same
    print(f"{role}: reverse-apply identical={same}")
sys.exit(0 if ok else 1)
