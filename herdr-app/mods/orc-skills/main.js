// orc-skills: which skills the hcorc/herdorc orchestrator will use in the
// focused project, and which copies they shadow. Read-only. Data comes from
// `orc.py skills --json`: a project copy wins over a user copy, and both win
// over the orchestrator's own. Two roles:
//   props.role "toggle": the Skills button beside the tab bar (with the
//     conflict count); it opens and closes the panel column and does the reads.
//   no role: the panel, beside Files/Changes.
// Inspired by runkids/skillshare's Herdr mod (MIT).
import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, notify, home, checking, layout, run, props, window as herdrWindow } from "herdr";
import { PANEL, TOGGLE, find, location, contextKey, current, load } from "./skills.js";

const SPINNER = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const stop = (_e, cx) => cx.stop_propagation();

export default class OrcSkills extends View {
  init(_props, cx) {
    this.toggle = props()?.role === "toggle";
    this.loading = false;
    this.showUser = false;
    try { this.seen = JSON.parse(localStorage.getItem("seen") ?? "{}") || {}; } catch { this.seen = {}; }
    if (checking()) return;
    // The button reads; a panel shown without a button reads for itself.
    const leader = () => this.toggle || !find(layout(), TOGGLE);
    cx.timer.every(1500, (cx) => { if (leader() && current()?.context !== contextKey()) this.refresh(cx); });
    // New skills where you already are: reread only while someone can see the panel.
    const watched = () => { const p = find(layout(), PANEL); return Boolean(p && !p.hidden) && herdrWindow().active; };
    cx.timer.every(20000, (cx) => { if (leader() && watched()) this.refresh(cx); });
    if (leader() || current()?.context !== contextKey()) this.refresh(cx);
  }

  refresh(cx) {
    if (this.loading) return;
    this.loading = true;
    cx.notify();
    cx.spawn(async (cx) => {
      try {
        const r = await load();
        if (r.context === contextKey() && (this.toggle || !find(layout(), TOGGLE))) this.announce(r);
      } finally {
        this.loading = false;
        cx.notify();
      }
    });
  }

  // One toast each time a set of conflicts changes. Conflicts with a project copy are kept
  // per project; those between user and orchestrator copies are the same in every folder
  // (outside a git repo each folder is its own project), so they share one key.
  announce(r) {
    const { project, conflicts } = r.data ?? {};
    if (!Array.isArray(conflicts)) return;
    const local = (c) => c.use?.scope === "project" || (c.shadows ?? []).some((s) => s.scope === "project");
    const changed = [];
    for (const [key, list] of [[project, conflicts.filter(local)], ["~", conflicts.filter((c) => !local(c))]]) {
      const sig = list.map((c) => `${c.skill}:${c.use?.scope}`).sort().join(",");
      if ((this.seen[key] ?? "") === sig) continue;
      if (sig) this.seen[key] = sig; else delete this.seen[key];
      changed.push(...list);
    }
    try { localStorage.setItem("seen", JSON.stringify(this.seen)); } catch {}
    if (!changed.length) return;
    const first = changed[0], more = conflicts.length - 1;
    notify({
      title: `Skill conflicts: ${conflicts.length}`,
      body: `${first.skill}: the ${first.use.scope} copy is used${more ? ` (+${more} more)` : ""}.`,
      level: "warning", timeout: 8000,
      action: find(layout(), PANEL) ? { name: "layout.show", args: { id: PANEL } } : undefined,
    });
  }

  render(cx) {
    return this.toggle ? this.renderToggle() : this.renderPanel();
  }

  // ------------------------------------------------------------ button
  renderToggle() {
    const t = theme(), panel = find(layout(), PANEL);
    const on = Boolean(panel && !panel.hidden);
    const s = current(), n = s?.context === contextKey() ? (s.data?.conflicts?.length ?? 0) : 0;
    // Level with the bar's first line (21 px down), as the bar grows taller when
    // its tabs wrap (the tabs-row column): centred in a 42 px bar, as before.
    return h_flex().size_full().items_start().pt(8).pl(2).pr(10).bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("orc-skills-button").h(26).px(8).gap(5).flex_none().items_center().rounded(6)
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((e) => e.bg(t.hover)).on_mouse_down("left", stop)
        .on_click(() => { if (panel) run("layout.toggle", { id: PANEL }); })
        .child(svg("mods/orc-skills/icon.svg").size(14))
        .child("Skills")
        .when(n > 0, (e) => e.child(div().px(5).rounded(8).bg(t.blocked).text_color(t.background)
          .text_size(10).font_semibold().child(String(n)))));
  }

  // ------------------------------------------------------------- panel
  tilde(path) {
    const h = home();
    return h && path.startsWith(h + "/") ? "~" + path.slice(h.length) : path;
  }

  heading(t, title, count) {
    return h_flex().gap(6).items_center().px(4)
      .child(div().text_size(11).font_semibold().text_color(t.muted).child(title))
      .child(div().text_size(11).text_color(t.dim).child(String(count)));
  }

  copyRow(t, id, copy, used) {
    return h_flex().id(id).gap(6).items_center().min_w(0)
      .child(div().w(12).flex_none().text_size(11).text_color(used ? t.done : t.dim).child(used ? "✓" : "·"))
      .child(div().w(84).flex_none().text_size(11).text_color(used ? t.foreground : t.dim).child(copy.scope))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(this.tilde(copy.path)));
  }

  conflictCard(t, c) {
    return v_flex().id(`conflict-${c.skill}`).gap(3).p(8).rounded(8).bg(t.surface).border_1().border_color(t.blocked)
      .child(h_flex().gap(6).items_center()
        .child(div().font_semibold().child(c.skill))
        .child(div().flex_1())
        .child(div().text_size(11).text_color(t.blocked).child(`uses ${c.use.scope}`)))
      .child(this.copyRow(t, `use-${c.skill}`, c.use, true))
      .children(c.shadows.map((s, i) => this.copyRow(t, `shadow-${c.skill}-${i}`, s, false)));
  }

  skillRow(t, s, note) {
    return h_flex().id(`skill-${s.scope}-${s.name}-${s.path}`).gap(8).items_center().px(4).py(2).rounded(6).min_w(0)
      .hover((e) => e.bg(t.hover))
      .child(div().flex_none().text_color(s.used ? t.foreground : t.dim).child(s.name))
      .child(div().flex_1().min_w(0).truncate().text_size(11).text_color(t.dim).child(this.tilde(s.path)))
      .when(Boolean(note), (e) => e.child(div().flex_none().text_size(11).text_color(t.blocked).child(note)));
  }

  renderPanel() {
    const t = theme(), s = current(), fresh = s?.context === contextKey();
    const d = s?.data, conflicts = d?.conflicts ?? [], skills = d?.skills ?? [];
    const by = (scope) => skills.filter((x) => x.scope === scope);
    const winner = (name) => skills.find((x) => x.name === name && x.used);
    const where = d?.project ?? location().cwd;
    const busy = this.loading || !fresh;

    const header = h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
      .child(div().font_semibold().child("Skills"))
      .when(Boolean(d), (e) => e.child(div().px(5).py(1).rounded(4).border_1()
        .border_color(conflicts.length ? t.blocked : t.border).text_size(10)
        .text_color(conflicts.length ? t.blocked : t.muted)
        .child(conflicts.length ? `${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""}` : "no conflicts")))
      .child(div().flex_1())
      .child(div().id("orc-skills-refresh").w(24).h(24).flex().items_center().justify_center().rounded(6)
        .text_color(t.muted).hover((e) => e.bg(t.hover)).on_click((_e, cx) => this.refresh(cx))
        .child(busy ? div().frames(SPINNER, 90) : "↻"))
      .child(div().id("orc-skills-close").w(24).h(24).flex().items_center().justify_center().rounded(6)
        .text_color(t.muted).hover((e) => e.bg(t.hover)).on_click(() => run("layout.hide", { id: PANEL }))
        .child("✕"));

    const rows = [];
    if (s?.error && fresh) rows.push(div().px(4).text_size(12).text_color(t.ansi1).child(s.error));
    if (d) {
      if (conflicts.length) {
        rows.push(v_flex().gap(6).child(this.heading(t, "CONFLICTS", conflicts.length))
          .children(conflicts.map((c) => this.conflictCard(t, c))));
      }
      const orc = by("orchestrator");
      rows.push(v_flex().gap(2).child(this.heading(t, "ORCHESTRATOR", orc.length))
        .children(orc.map((x) => this.skillRow(t, x, x.used ? "" : `→ ${winner(x.name)?.scope ?? "?"}`))));
      const proj = by("project");
      rows.push(v_flex().gap(2).child(this.heading(t, "PROJECT", proj.length))
        .children(proj.length ? proj.map((x) => this.skillRow(t, x, x.used ? "" : "shadowed"))
          : [div().px(4).text_size(11).text_color(t.dim).child("No skills in this project.")]));
      const user = by("user");
      rows.push(v_flex().gap(2)
        .child(h_flex().id("orc-skills-user").gap(6).items_center().px(4).rounded(6).hover((e) => e.bg(t.hover))
          .on_click((_e, cx) => { this.showUser = !this.showUser; cx.notify(); })
          .child(div().text_size(11).font_semibold().text_color(t.muted).child("USER"))
          .child(div().text_size(11).text_color(t.dim).child(String(user.length)))
          .child(div().text_size(11).text_color(t.dim).child(this.showUser ? "▾" : "▸")))
        .when(this.showUser, (e) => e.children(user.map((x) => this.skillRow(t, x, x.used ? "" : "shadowed")))));
      rows.push(div().px(4).text_size(11).text_color(t.dim)
        .child("Same name: the project copy wins, then the user's, then the orchestrator's. Same purpose under another name: the orchestrator picks the project's skill and says which."));
    }

    return v_flex().id("orc-skills").size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background)
      .border_1().border_color(t.border).text_color(t.foreground).text_size(13)
      .child(header)
      .when(Boolean(where), (e) => e.child(div().px(14).py(6).flex_none().truncate().text_size(11).text_color(t.dim)
        .border_b(1).border_color(t.border).child(this.tilde(where))))
      .child(div().flex_1().min_h(0).relative()
        .child(v_flex().id("orc-skills-list").absolute().inset_0().overflow_y_scroll().p(10).gap(14).children(rows)));
  }
}
