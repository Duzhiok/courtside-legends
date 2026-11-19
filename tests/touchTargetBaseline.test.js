// U-P1-9 touch-target baseline (2026-11-13 global review): every button the
// user can tap must be at least 44px tall (.btn.small, the compact variant
// used in dense rows/filters, at least 40px), and no bare <button> without a
// class may render at the UA default (~22px). Source assertions: without a
// browser on this VM the CSS rules and the markup are the contract.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => readFileSync(join(root, rel), "utf8");

// Extract the declaration block of a top-level selector from a CSS file.
function ruleBlock(css, selector) {
  const m = css.match(new RegExp(`^[ \\t]*${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`, "m"));
  assert.ok(m, `${selector} rule missing`);
  return m[1];
}

function minHeightPx(block) {
  const m = block.match(/min-height:\s*(\d+)px/);
  assert.ok(m, `min-height missing in: ${block.trim()}`);
  return Number(m[1]);
}

function walkJs(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walkJs(p, out);
    else if (name.endsWith(".js")) out.push(p);
  }
  return out;
}

test("U-P1-9: .btn is at least 44px tall", () => {
  const css = read("css/style.css");
  assert.ok(minHeightPx(ruleBlock(css, ".btn")) >= 44, ".btn min-height must be >= 44px");
});

test("U-P1-9: .btn.small keeps a compact-but-tappable floor of 40px", () => {
  const css = read("css/style.css");
  assert.ok(minHeightPx(ruleBlock(css, ".btn.small")) >= 40, ".btn.small min-height must be >= 40px");
});

test("U-P1-9: no bare <button> without a class in the main app", () => {
  const files = [...walkJs(join(root, "js/ui")), join(root, "js/app.js")];
  const bare = [];
  for (const file of files) {
    const src = readFileSync(file, "utf8");
    for (const tag of src.match(/<button[^>]*>/g) ?? []) {
      if (!/class=/.test(tag)) bare.push(`${file.replace(root + "/", "")}: ${tag}`);
    }
  }
  assert.deepEqual(bare, [], "bare buttons render at the UA default (~22px); give them class=\"btn\"");
});

test("U-P1-9: online page buttons are covered by its own 44px button rule", () => {
  // online.html does not load style.css; its inline <style> is the contract
  // for both its static buttons and the ones js/online/client.js renders.
  const html = read("online.html");
  const style = html.match(/<style>([\s\S]*?)<\/style>/);
  assert.ok(style, "online.html inline <style> missing");
  assert.ok(minHeightPx(ruleBlock(style[1], "button")) >= 44, "online.html button min-height must be >= 44px");
  const client = read("js/online/client.js");
  assert.ok(/<button[^>]*>/.test(client), "client.js renders buttons into online.html");
});

test("U-P1-9: index.html loads the stylesheet that carries the baseline", () => {
  assert.match(read("index.html"), /<link rel="stylesheet" href="css\/style\.css/);
});
