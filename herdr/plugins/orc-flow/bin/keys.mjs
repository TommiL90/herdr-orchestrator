#!/usr/bin/env node
// `keys.mjs setup|remove`: adds or removes orc-flow's block in herdr's config.toml, then
// asks the running herdr to reload it. The block sits between two marker lines, so it can
// be found and removed whole; nothing outside it is touched. The file is backed up first.
//
// The default key is prefix+shift+z. If the config already binds it outside the block,
// the binding is written commented out, with the reason, instead of taking the key.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const START = "# >>> orc-flow keys";
export const END = "# <<< orc-flow keys";
export const KEY = "prefix+shift+z";

export const configPath = (env = process.env) =>
  path.join(env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"), "herdr", "config.toml");

const entry = (key, action, description, off = false) => {
  const c = off ? "# " : "";
  return [`${c}[[keys.command]]`, `${c}key = "${key}"`, `${c}type = "plugin_action"`, `${c}command = "orc-flow.${action}"`, `${c}description = "${description}"`].join("\n");
};

export function block(taken = false) {
  return [
    START,
    taken ? `# ${KEY} is already bound elsewhere in this file: pick a free key and uncomment.` : null,
    entry(taken ? "" : KEY, "open", "orc-flow: herdorc graph (overlay)", taken),
    "",
    "# The other placements: pick a key and uncomment.",
    entry("", "open-split", "orc-flow: herdorc graph (split)", true),
    "",
    entry("", "open-tab", "orc-flow: herdorc graph (tab)", true),
    END,
  ].filter((l) => l !== null).join("\n");
}

// The text without our block (and the blank line we put before it).
export function strip(text) {
  const i = text.indexOf(START);
  if (i < 0) return text;
  const j = text.indexOf(END, i);
  if (j < 0) return text; // a start marker without its end: leave the file alone
  const before = text.slice(0, i).replace(/\n\n$/, "\n");
  const after = text.slice(j + END.length).replace(/^\n/, "");
  return before + after;
}

// Whether a key is bound outside our block: `key = "<key>"` or `<action> = "<key>"` on a
// line that is not a comment.
export function bound(text, key = KEY) {
  return new RegExp(`^[^#\\n]*=\\s*["']${key.replace(/[+]/g, "\\+")}["']`, "m").test(strip(text));
}

export function apply(text, mode) {
  const rest = strip(text);
  if (mode === "remove") return rest;
  const sep = rest === "" || rest.endsWith("\n\n") ? "" : rest.endsWith("\n") ? "\n" : "\n\n";
  return `${rest}${sep}${block(bound(rest))}\n`;
}

function main(mode) {
  if (mode !== "setup" && mode !== "remove") {
    console.error("usage: keys.mjs setup|remove");
    process.exit(2);
  }
  const file = configPath();
  let text = "";
  try { text = fs.readFileSync(file, "utf8"); } catch (e) { if (e.code !== "ENOENT") throw e; }
  if (text.includes(START) && !text.includes(END)) {
    console.error(`${file} has "${START}" without "${END}"; fix it by hand.`);
    process.exit(1);
  }
  const next = apply(text, mode);
  if (next === text) {
    console.log(mode === "remove" ? "orc-flow: no keybinding block to remove" : "orc-flow: keybinding block already up to date");
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (text) fs.copyFileSync(file, `${file}.orc-flow.bak`);
  fs.writeFileSync(file, next);
  const taken = mode === "setup" && bound(strip(text));
  console.log(mode === "remove" ? `orc-flow: removed the keybinding block from ${file}`
    : taken ? `orc-flow: ${KEY} is taken; wrote the block commented out in ${file}`
      : `orc-flow: bound ${KEY} to the overlay in ${file}`);
  try {
    execFileSync(process.env.HERDR_BIN_PATH || "herdr", ["server", "reload-config"], { stdio: "ignore", timeout: 10000 });
  } catch { console.log("orc-flow: reload herdr's config to apply it (prefix+shift+r)"); }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main(process.argv[2]);
