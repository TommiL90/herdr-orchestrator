// orc-panes: names for Herdr's panes, as herdr's own panes have (`herdr pane rename`).
// It is the pane header the layout had, unchanged except for the name it shows:
// base/ holds that header's modules, copied by install.py (a mod can't import
// another mod's files), and names.js says which name wins.
// Rename the focused pane: double-click its header, or press the key bound to
// `orc-panes.rename`. An empty name gives the pane back its own.
// props.role "rename": the rename dialog ({ terminal, value }).
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { terminals, props, focused, openOverlay, closeOverlay, theme, hc, checking, nextCommand, notify, shared, setShared } from "herdr";
import Base from "./base/main.js";
import { chosenName, givenName, labelArgs, withName } from "./names.js";

// A key command reaches every shown copy: the first to see it opens the dialog.
const ASKED = "orc-panes.asked";

export default class OrcPanes extends Base {
  init(initProps, cx) {
    this.dialog = props()?.role === "rename";
    if (this.dialog) return this.initDialog(cx);
    if (typeof super.init === "function") super.init(initProps, cx);
    if (checking()) return;
    cx.spawn(async (cx) => {
      for (;;) {
        if ((await nextCommand()) !== "rename") continue;
        const f = focused();
        const asked = shared(ASKED);
        if (!f?.terminal || (asked?.terminal === f.terminal && Date.now() - asked.at < 1000)) continue;
        setShared(ASKED, { terminal: f.terminal, at: Date.now() });
        this.ask(f.terminal);
      }
    });
  }

  // ── The header ───────────────────────────────────────────────────────────

  me() {
    const p = typeof super.me === "function" ? super.me() : null;
    if (!p?.terminal) return p;
    return withName(p, chosenName(terminals().find((t) => t.address === p.terminal)));
  }

  ask(terminal) {
    const t = terminals().find((x) => x.address === terminal);
    openOverlay({ mod: "orc-panes", kind: "dialog", width: 380, props: { role: "rename", terminal, value: givenName(t) } });
  }

  render(cx) {
    if (this.dialog) return this.renderDialog();
    const head = super.render(cx);
    const terminal = props()?.terminal;
    if (!terminal) return head;
    return div()
      .id(`orc-panes-${props().pane}`)
      .size_full()
      .on_mouse_down("left", (e) => { if (e.click_count === 2) this.ask(terminal); })
      .child(head);
  }

  // ── The rename dialog ────────────────────────────────────────────────────

  initDialog(cx) {
    this.text = props()?.value ?? "";
    this.input = InputState.new({ value: this.text });
    if (this.text) this.input.set_selected_range({ start: 0, end: this.text.length });
    this.input.on("change", (_e, cx) => { this.text = this.input.value(); cx.notify(); });
    this.input.on("submit", (_e, cx) => this.save(cx));
    this.inputFocused = true;
    this.input.on("focus", (_e, cx) => { this.inputFocused = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.inputFocused = false; cx.notify(); });
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    this.handle = cx.focus_handle();
  }

  // The label first: closing the dialog would cancel a call still on its way.
  save(cx) {
    const p = props();
    cx.spawn(async () => {
      const r = await hc(labelArgs(p.terminal, this.text)).catch((e) => ({ code: 1, stdout: "", stderr: String(e?.message ?? e) }));
      if (r.code !== 0) {
        notify({ title: "Pane name not saved", body: (r.stderr || r.stdout).trim() || `hc label exited ${r.code}`, level: "error" });
      }
      closeOverlay(p.overlay);
    });
  }

  renderDialog() {
    const t = theme();
    const p = props() ?? {};
    const button = (id, text, primary, action) => h_flex().id(id).h(32).px(14).items_center().rounded(8)
      .border_1().border_color(primary ? t.solid : t.input).bg(primary ? t.solid : t.raised)
      .text_color(primary ? t.solid_foreground : t.foreground).text_size(12.5).font_medium().cursor_pointer()
      .hover((s) => s.opacity(0.88)).on_click(action).child(text);
    return v_flex().id("orc-panes-rename").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { closeOverlay(p.overlay); cx.stop_propagation(); } })
      .w_full().min_h(0).p(18).bg(t.popover).text_color(t.foreground)
      .child(h_flex().items_center()
        .child(div().flex_1().text_size(15).font_semibold().child("Rename pane"))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(div().pt(16).pb(7).text_size(11.5).text_color(t.dim).child("Name"))
      .child(Input.new(this.input).h(36).px(10).rounded(9).border_1()
        .border_color(this.inputFocused ? t.accent : t.input).bg(t.background).text_size(12.8).text_color(t.foreground))
      .child(div().pt(6).text_size(11.5).text_color(t.dim).child("Empty: the pane's own name again."))
      .child(h_flex().pt(20).gap(8).justify_end()
        .child(button("orc-panes-cancel", "Cancel", false, () => closeOverlay(p.overlay)))
        .child(button("orc-panes-save", "Save", true, (_e, cx) => this.save(cx))));
  }
}
