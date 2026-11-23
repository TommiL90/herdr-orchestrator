// What a pane is called, with no drawing and no Herdr calls (node can import it).
// orc.py writes PHASE (hcorc's ODD phase) as a herdr-core terminal label, so it
// never takes the place of the name someone gave the pane; keep the key in step
// with shared/bin/orc.py (PHASE_LABEL). NAME is where orc-panes kept names before
// Herdr named panes itself (0.1.17): still read, so those names stay.
export const NAME = "orc.pane-name";
export const PHASE = "orc.phase";

// Longer names are cut, so the header shows what was asked for.
const MAX_LENGTH = 80;

// One line, single spaces, at most MAX_LENGTH; "" when nothing is left.
export function cleanName(text) {
  const name = String(text ?? "").replace(/\s+/g, " ").trim();
  return name.length > MAX_LENGTH ? `${name.slice(0, MAX_LENGTH - 1).trimEnd()}…` : name;
}

// The name a pane shows, strongest first: the orchestrator's phase while it
// reports one, the name Herdr gave the pane, an older orc-panes name, the
// terminal's own name (`hc run --name`). null: the header's own.
export function chosenName(terminal, pane) {
  const labels = terminal?.labels ?? {};
  for (const name of [labels[PHASE], pane?.name, labels[NAME], terminal?.name]) {
    const clean = cleanName(name);
    if (clean) return clean;
  }
  return null;
}

// The pane as the copied header reads it, called `name`: agents and shells show
// program.name, other programs their title, so both change; the icon stays.
export function withName(pane, name) {
  if (!pane || !name) return pane;
  return { ...pane, title: name, program: pane.program ? { ...pane.program, name } : pane.program };
}
