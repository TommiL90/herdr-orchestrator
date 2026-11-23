// orc-panes: the pane header the layout had, drawing the name Herdr gives a pane
// (Rename in the pane menu, `pane.rename`) and hcorc's ODD phase. Herdr's own
// header draws that name since 0.1.17, but copies of the older one (herdr-nvim's)
// don't: base/ holds the header's modules, copied by install.py (a mod can't
// import another mod's files), and names.js says which name wins.
import { terminals } from "herdr";
import Base from "./base/main.js";
import { chosenName, withName } from "./names.js";

export default class OrcPanes extends Base {
  me() {
    const p = typeof super.me === "function" ? super.me() : null;
    if (!p) return p;
    const terminal = p.terminal ? terminals().find((t) => t.address === p.terminal) : null;
    return withName(p, chosenName(terminal, p));
  }
}
