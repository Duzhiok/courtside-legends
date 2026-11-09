import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// B57 + B58: the playoff tab lives inside #season-hub-panel (dark stage), but its live-stats
// table sits in a white .season-award-card. The hub's dark-stage table rules target td/th
// directly, so they beat the card's inherited ink — the rows rendered near-white on white.
// These tests pin the light-card overrides in css/style.css and check the resulting pairs
// against WCAG AA (4.5:1) numerically, since browser QA needs a Mac run.

const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8");

function ruleBody(selector) {
  const idx = css.indexOf(selector);
  assert.notEqual(idx, -1, `missing CSS rule: ${selector}`);
  const open = css.indexOf("{", idx);
  const close = css.indexOf("}", open);
  return css.slice(open + 1, close);
}

function resolveColor(value) {
  const v = value.trim();
  if (v.startsWith("var(")) {
    const name = v.slice(4, v.indexOf(")")).trim();
    const m = tokens.match(new RegExp(`${name.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, "\\$&")}:\\s*(#[0-9a-fA-F]{6})`));
    assert.ok(m, `token ${name} not found in tokens.css`);
    return m[1];
  }
  return v;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  const f = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(fgHex, bgHex) {
  const [l1, l2] = [luminance(fgHex), luminance(bgHex)].sort((a, b) => b - a);
  return (l1 + 0.05) / (l2 + 0.05);
}

const CARD_BG = "#ffffff"; // .season-award-card background (#fff)

test("B57: playoff live-stats table inside a light award card uses dark ink, not the hub's light text", () => {
  // The dark-stage rule that caused the bug is still there for stage tables — pin it so a
  // future edit doesn't silently "fix" this test by deleting the rule it overrides.
  assert.match(css, /#season-hub-panel \.season-table td \{ color: #e6ece8; \}/);

  const td = ruleBody("#season-hub-panel .season-award-card .season-table td");
  const tdColor = resolveColor(td.match(/color:\s*([^;]+);/)[1]);
  assert.equal(tdColor, "#0f1c14", "td must resolve to --ink");
  assert.ok(contrast(tdColor, CARD_BG) >= 4.5, `td ${tdColor} on ${CARD_BG} must be >= 4.5:1, got ${contrast(tdColor, CARD_BG).toFixed(2)}:1`);

  const th = ruleBody("#season-hub-panel .season-award-card .season-table th");
  const thColor = th.match(/color:\s*(#[0-9a-fA-F]{6})/)[1];
  assert.ok(contrast(thColor, CARD_BG) >= 4.5, `th ${thColor} on ${CARD_BG} must be >= 4.5:1, got ${contrast(thColor, CARD_BG).toFixed(2)}:1`);

  const even = ruleBody("#season-hub-panel .season-award-card .season-table tbody tr:nth-child(even) td");
  assert.match(even, /background: #f8faf8;/, "even rows use the light zebra fill, not the dark-stage translucent one");
});

test("B57: the override wins by specificity over the hub's dark-stage table rules", () => {
  // Both override selectors carry one more class than the dark-stage rules they beat
  // (#season-hub-panel .season-table td = (1,1,1) vs (1,2,1) here), and they appear later.
  const darkTd = css.indexOf("#season-hub-panel .season-table td { color: #e6ece8; }");
  const lightTd = css.indexOf("#season-hub-panel .season-award-card .season-table td");
  assert.ok(lightTd > darkTd, "light-card td override must come after the dark-stage rule");
  const darkEven = css.indexOf("#season-hub-panel .season-table tbody tr:nth-child(even) td");
  const lightEven = css.indexOf("#season-hub-panel .season-award-card .season-table tbody tr:nth-child(even) td");
  assert.ok(lightEven > darkEven, "light-card even-row override must come after the dark-stage rule");
});

test("B58: playoff series rows keep team names whole on narrow screens", () => {
  const span = ruleBody(".season-series-row span");
  assert.match(span, /word-break: keep-all;/, "CJK team names must not split mid-word; breaks only at spaces");
  const strong = ruleBody(".season-series-row strong");
  assert.match(strong, /flex-shrink: 0;/, "score must not shrink");
  assert.match(strong, /white-space: nowrap;/, "score must not wrap");
});
