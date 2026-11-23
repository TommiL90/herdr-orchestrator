// What a pane is called, with no drawing and no Herdr calls (node can import it).
// Names live in herdr-core as terminal labels, so they outlive the window and
// every Herdr client sees them. orc.py writes PHASE (hcorc's ODD phase); keep
// both keys in step with shared/bin/orc.py (HcBackend.set_label).
export const NAME = "orc.pane-name";
export const PHASE = "orc.phase";

// Longer names are cut, so the header shows what was asked for.
const MAX_LENGTH = 80;

// One line, single spaces, at most MAX_LENGTH; "" when nothing is left.
export function cleanName(text) {
  const name = String(text ?? "").replace(/\s+/g, " ").trim();
  return name.length > MAX_LENGTH ? `${name.slice(0, MAX_LENGTH - 1).trimEnd()}…` : name;
}

// The name a terminal asks for, strongest first: the orchestrator's phase while
// it reports one, the name someone gave the pane, the terminal's own name
// (`hc run --name`, as hcorc names its role panes). null: the header's own.
export function chosenName(terminal) {
  const labels = terminal?.labels ?? {};
  for (const name of [labels[PHASE], labels[NAME], terminal?.name]) {
    const clean = cleanName(name);
    if (clean) return clean;
  }
  return null;
}

// The name the person gave, for the rename field: never the phase.
export function givenName(terminal) {
  return cleanName(terminal?.labels?.[NAME] ?? terminal?.name ?? "");
}

// The pane as Herdr's header reads it, called `name`: agents and shells show
// program.name, other programs their title, so both change; the icon stays.
export function withName(pane, name) {
  if (!pane || !name) return pane;
  return { ...pane, title: name, program: pane.program ? { ...pane.program, name } : pane.program };
}

// `hc label` arguments that set a pane's name, or remove it when empty.
export function labelArgs(terminal, text) {
  return ["label", terminal, `${NAME}=${cleanName(text)}`];
}
