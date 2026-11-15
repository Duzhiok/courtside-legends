import test from "node:test";
import assert from "node:assert/strict";
import {
  HALF_COURT_BOX_COLUMNS,
  halfCourtBoxTableHtml,
  halfCourtMarkerHtml,
  halfCourtPickerCardHtml,
} from "../js/ui/halfCourtView.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const ovrOf = () => 97;
const card = { name: "Michael Jordan", bref: "jordami01", season: 1991, team: "CHI", pos: "SG" };

test("3v3 picker card: portrait, name, OVR badge, position badge, season · team", () => {
  const html = halfCourtPickerCardHtml(card, { ovrOf, esc });
  assert.match(html, /hc-pick-card/);
  assert.match(html, /<img class="hc-pick-img" src="https:\/\//, "real photo URL on the thumbnail");
  assert.match(html, /data-fb="data:image\/svg\+xml/, "generated-avatar fallback if the photo fails");
  assert.match(html, /Michael Jordan/);
  assert.match(html, /OVR 97/);
  assert.match(html, /hc-pick-pos">SG</);
  assert.match(html, /1991 · CHI/);
});

test("3v3 picker card escapes hostile names", () => {
  const html = halfCourtPickerCardHtml({ ...card, name: "<img src=x>" }, { ovrOf, esc });
  assert.doesNotMatch(html, /<img src=x>/);
  assert.match(html, /&lt;img src=x&gt;/);
});

test("court marker: initials + position label, shooter marked, side class kept", () => {
  const html = halfCourtMarkerHtml({ name: "Kobe Bryant", pos: "SG", id: "k1" }, { x: 50, y: 33 }, "home", true, esc);
  assert.match(html, /hc-player hc-home hc-active/);
  assert.match(html, />KB</, "initials");
  assert.match(html, /hc-pos"[^>]*>SG</, "position label under the circle");
  assert.match(html, /translate\(50\.0 33\.0\)/);
  const plain = halfCourtMarkerHtml({ name: "Shaq", pos: "C", id: "s1" }, { x: 22, y: 21 }, "away", false, esc);
  assert.doesNotMatch(plain, /hc-active/);
  assert.match(plain, /hc-away/);
});

test("box score: 11 columns in order, scroll wrapper, totals row, winner mark", () => {
  assert.deepEqual(
    HALF_COURT_BOX_COLUMNS.map((c) => c.id),
    ["player", "pts", "1pt", "2pt", "ft", "reb", "ast", "stl", "blk", "tov", "fatigue"],
  );
  const lines = [
    { name: "A", season: 1991, pos: "SG", pts: 12, fgm1: 4, fga1: 5, fgm2: 2, fga2: 3, ftm: 0, fta: 0, reb: 3, ast: 2, stl: 1, blk: 0, tov: 1, fatigue: 12 },
    { name: "B", season: 1991, pos: "PF", pts: 9, fgm1: 3, fga1: 4, fgm2: 1, fga2: 2, ftm: 1, fta: 2, reb: 5, ast: 1, stl: 0, blk: 2, tov: 0, fatigue: 9 },
  ];
  const html = halfCourtBoxTableHtml({ name: "半场 A 队", lines, won: true, lang: "zh", esc });
  assert.match(html, /hc-box-scroll/, "horizontal scroll instead of squeeze");
  for (const col of HALF_COURT_BOX_COLUMNS) assert.match(html, new RegExp(`data-col="${col.id}"`), `column ${col.id} is tagged`);
  assert.match(html, /半场 A 队 · 胜/);
  assert.match(html, /合计/);
  assert.match(html, /<td data-col="pts">21<\/td>/, "totals row sums points (12 + 9)");
  assert.match(html, /<td data-col="reb">8<\/td>/, "totals row sums rebounds (3 + 5)");
  assert.match(html, /A <small>1991 SG<\/small>/);
  const en = halfCourtBoxTableHtml({ name: "Team", lines, won: false, lang: "en", esc });
  assert.match(en, />Player</);
  assert.match(en, />Total</);
  assert.doesNotMatch(en, /胜|合计|得分/);
});

test("box score escapes hostile names", () => {
  const lines = [{ name: "<b>evil</b>", season: 1991, pos: "SG", pts: 0, fgm1: 0, fga1: 0, fgm2: 0, fga2: 0, ftm: 0, fta: 0, reb: 0, ast: 0, stl: 0, blk: 0, tov: 0, fatigue: 0 }];
  const html = halfCourtBoxTableHtml({ name: "<i>team</i>", lines, won: false, lang: "zh", esc });
  assert.doesNotMatch(html, /<b>evil<\/b>/);
  assert.doesNotMatch(html, /<i>team<\/i>/);
  assert.match(html, /&lt;b&gt;evil&lt;\/b&gt;/);
});
