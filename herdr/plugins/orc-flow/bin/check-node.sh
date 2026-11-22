#!/bin/sh
# Install check: orc-flow runs on Node 22.5 or newer (node:sqlite reads Codex's and
# opencode's databases; without it those panes show without a model).
if ! command -v node >/dev/null 2>&1; then
  echo "orc-flow needs Node.js 22.5 or newer on PATH; node was not found." >&2
  exit 1
fi
node -e '
const [maj, min] = process.versions.node.split(".").map(Number);
if (maj < 22 || (maj === 22 && min < 5)) {
  console.error(`orc-flow needs Node.js 22.5 or newer; found ${process.versions.node}.`);
  process.exit(1);
}
console.log(`orc-flow: Node ${process.versions.node} ok`);'
