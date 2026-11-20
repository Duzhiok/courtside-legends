import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Duel review leftover (queue item 10 follow-up): on phones the two-player
// (duel) market left column holds BOTH teams' rosters (A + B) yet got the
// same 1fr/1fr split as the single-roster career market — the review flagged
// it as too narrow. Fix: at <=480px the duel market restores the desktop
// 1.2fr/1fr left share via a duel-market class toggled by openMarket.
// The two-column layout stays (explicit user requirement: portrait phones
// keep roster / free-agents side by side, no single-column stacking).

const css = readFileSync(new URL("../css/style.css", import.meta.url), "utf8");
const appJs = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

function media480Blocks(cssText) {
  const blocks = [];
  const query = "@media (max-width: 480px)";
  let from = 0;
  for (;;) {
    const at = cssText.indexOf(query, from);
    if (at === -1) return blocks;
    const open = cssText.indexOf("{", at);
    let depth = 0;
    let end = -1;
    for (let i = open; i < cssText.length; i++) {
      if (cssText[i] === "{") depth++;
      else if (cssText[i] === "}") {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    assert.ok(end !== -1, "480px media block closes");
    blocks.push(cssText.slice(open + 1, end));
    from = end + 1;
  }
}

function marketBlock480() {
  const block = media480Blocks(css).find((b) => b.includes(".market-grid {"));
  assert.ok(block, "a <=480px block sets .market-grid");
  return block;
}

function parseFr(ruleText) {
  const m = ruleText.match(/grid-template-columns:\s*([\d.]+)fr\s+([\d.]+)fr/);
  assert.ok(m, `fr columns found in: ${ruleText.trim()}`);
  return [Number(m[1]), Number(m[2])];
}

test("duel market layout: mobile market stays two columns (base 1fr 1fr)", () => {
  const block = marketBlock480();
  const m = block.match(/\.market-grid\s*\{\s*grid-template-columns:\s*1fr 1fr;/);
  assert.ok(m, "base .market-grid at <=480px is still 1fr 1fr (two columns, no single-column collapse)");
});

test("duel market layout: duel left column restores the desktop 1.2fr share", () => {
  const block = marketBlock480();
  const m = block.match(/\.market-grid\.duel-market\s*\{\s*grid-template-columns:\s*([\d.]+)fr\s+([\d.]+)fr;\s*\}/);
  assert.ok(m, ".market-grid.duel-market rule exists at <=480px");
  const [left, right] = [Number(m[1]), Number(m[2])];
  assert.ok(left > right, "duel left column is wider than the right");
  assert.equal(left, 1.2, "duel left share matches the desktop ratio");
  assert.equal(right, 1, "duel right share stays 1fr");
  // Desktop base rule uses the same proportion — one consistent ratio.
  assert.ok(
    /\.setup-grid,\s*\.market-grid\s*\{\s*[^}]*grid-template-columns:\s*1\.2fr 1fr;/.test(css),
    "desktop .market-grid is 1.2fr 1fr"
  );
});

test("duel market layout: 390px arithmetic — duel left gains >10px over base", () => {
  const block = marketBlock480();
  const base = parseFr(block.match(/\.market-grid\s*\{[^}]*\}/)[0]);
  const duel = parseFr(block.match(/\.market-grid\.duel-market\s*\{[^}]*\}/)[0]);
  // #app: max-width min(1680px, 98vw), 20px side padding; grid gap 6px at <=480px.
  assert.ok(/#app\s*\{[^}]*max-width:\s*min\(1680px,\s*98vw\)[^}]*padding:\s*20px 20px 48px;/.test(css), "#app width/padding constants present");
  assert.ok(/\.market-grid\s*\{\s*grid-template-columns:\s*1fr 1fr;\s*gap:\s*6px;/.test(block), "mobile grid gap is 6px");
  const viewport = 390;
  const frSpace = Math.min(1680, viewport * 0.98) - 2 * 20 - 6;
  const baseLeft = (frSpace * base[0]) / (base[0] + base[1]);
  const duelLeft = (frSpace * duel[0]) / (duel[0] + duel[1]);
  assert.ok(duelLeft - baseLeft > 10, `duel left ${duelLeft.toFixed(1)}px vs base ${baseLeft.toFixed(1)}px at 390px`);
});

test("duel market layout: openMarket toggles duel-market on the market grid", () => {
  const start = appJs.indexOf("function openMarket(");
  assert.ok(start !== -1, "openMarket found");
  const nextFn = appJs.indexOf("\nfunction ", start + 1);
  const body = appJs.slice(start, nextFn === -1 ? undefined : nextFn);
  const sel = body.indexOf('$("#screen-market .market-grid")');
  assert.ok(sel !== -1, "openMarket selects #screen-market .market-grid");
  const toggle = body.indexOf('classList.toggle("duel-market", isDuel)');
  assert.ok(toggle !== -1, "openMarket toggles duel-market by isDuel");
  const isDuelAt = body.indexOf('const isDuel = duel || c?.kind === "duel"');
  assert.ok(isDuelAt !== -1 && isDuelAt < toggle, "toggle runs after isDuel is computed");
});

test("duel market layout: no HTML ships with duel-market baked in", () => {
  assert.ok(!html.includes("duel-market"), "duel-market is only ever toggled by JS, never hardcoded in HTML");
});
