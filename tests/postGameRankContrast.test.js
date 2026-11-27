import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// B133 follow-up ①: the post-game "Stars of the game" rank digit (.pg-rank, the 1/2/3 in
// each .pg-star row) was never in the career-buzz contrast checklist, and its accent
// orange #e85d04 scores only 3.05:1 on the paper row. The digit is 1.2rem (19.2px at the
// 16px root) at weight 400, so under WCAG it is normal text — the 3:1 large-text bar does
// not apply and the digit must clear 4.5:1. These tests pin the fixed colour and the
// resulting pair numerically, since browser QA needs a Mac run.

const css = readFileSync(new URL("../css/careerPostGame.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8");

function ruleBody(selector) {
  // Match the rule opening exactly (".pg-star {" not the ".pg-stars" list rule).
  const idx = css.indexOf(`${selector} {`);
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

test("B133: .pg-rank rank digit clears WCAG AA (4.5:1) on the .pg-star paper row", () => {
  // The row background the digit sits on: .pg-star uses var(--paper).
  const star = ruleBody(".pg-star");
  const bg = resolveColor(star.match(/background:\s*([^;]+);/)[1]);
  assert.equal(bg, "#f3efe4", ".pg-star background must resolve to --paper");

  const rank = ruleBody(".pg-rank");
  const fg = resolveColor(rank.match(/color:\s*([^;]+);/)[1]);
  const ratio = contrast(fg, bg);
  assert.ok(ratio >= 4.5, `.pg-rank ${fg} on ${bg} must be >= 4.5:1, got ${ratio.toFixed(2)}:1`);
});

test("B133: .pg-rank is normal-size text, so the 3:1 large-text bar does not apply", () => {
  // Pin the premise of the fix: 1.2rem at the 16px root is 19.2px, weight 400 — below
  // both WCAG large-text thresholds (24px, or 18.66px bold). If the digit is ever made
  // large/bold, the 4.5:1 assertion above still holds (5.59:1), so this test only
  // documents why 3.05:1 could not be accepted as-is.
  const rank = ruleBody(".pg-rank");
  assert.match(rank, /font-size:\s*1\.2rem;/);
  assert.doesNotMatch(rank, /font-weight:\s*(700|800|900|bold)/);
});
