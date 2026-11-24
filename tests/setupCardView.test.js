import { test } from "node:test";
import assert from "node:assert/strict";
import { KEY_STATS, setupKeyStats, setupKeyStatsHtml, setupCardSummary, setupCardMoreHtml, statTone } from "../js/ui/setupCardView.js";
import { setupBoardHtml, setupRosterModel, setupRosterStatus } from "../js/ui/setupRosterView.js";

const p = {
  id: "x1", name: "Test <b>Guy</b>", pos: "PG", stamina: 88,
  pass: 91, handle: 84, three: 77, speed: 60, scoring: 70, paint: 40, rebound: 30, defense: 66, strength: 50, block: 10,
  roleExpectation: "sixth", targetMinutes: 27, orders: { usage: "organize", defFocus: "auto" },
};

test("key stats: four per position, read from the player (sub-attributes included)", () => {
  for (const pos of ["PG", "SG", "SF", "PF", "C"]) assert.equal(KEY_STATS[pos].length, 4, pos);
  assert.deepEqual(setupKeyStats(p, "PG").map((s) => [s.key, s.value]), [["pass", 91], ["handle", 84], ["three", 77], ["speed", 60]]);
  assert.deepEqual(setupKeyStats(p, "C").map((s) => s.key), ["paint", "rebound", "block", "strength"]);
  assert.equal(setupKeyStats(p, "??").length, 4, "an unknown spot falls back to the wing set");
  assert.equal(setupKeyStats({}, "PG")[0].value, 0);
});

test("key stats html: tone classes, labels per language, stamina bar clamped", () => {
  assert.equal(statTone(80), "hi");
  assert.equal(statTone(65), "mid");
  assert.equal(statTone(64), "lo");
  const zh = setupKeyStatsHtml(p, "PG", "zh");
  assert.match(zh, /setup-key-stat hi"><em>传球<\/em><b>91<\/b>/);
  assert.match(zh, /setup-key-stat lo"><em>速度<\/em><b>60<\/b>/);
  assert.match(zh, /--v:88%/);
  const en = setupKeyStatsHtml(p, "PG", "en");
  assert.match(en, /<em>PAS<\/em>/);
  assert.doesNotMatch(en, /[一-鿿]/, "no Chinese left in the English card face");
  assert.match(setupKeyStatsHtml({ ...p, stamina: 140 }, "PG"), /--v:100%/);
  assert.doesNotMatch(setupKeyStatsHtml({ ...p, stamina: 0 }, "PG"), /setup-stamina/, "no bar without a stamina value");
});

test("drawer summary says role · minutes · offense / defense orders, in both languages", () => {
  assert.equal(setupCardSummary(p, "zh"), "第六人 · 27 分钟 · 攻 偏组织 / 防 常规防守");
  assert.match(setupCardSummary(p, "en"), /^Sixth Man · 27 min · O Playmaker \/ D /);
  assert.match(setupCardSummary({ id: "y" }, "zh"), / · 24 分钟 · /, "minutes default to 24 like the minutes input");
});

test("drawer html: escaped id + summary, open state restored, body passed through", () => {
  const html = setupCardMoreHtml({ ...p, id: 'a"b' }, "<i>BODY</i>", { open: true });
  assert.match(html, /data-more-for="a&quot;b" open>/);
  assert.match(html, /<i>BODY<\/i>/);
  assert.doesNotMatch(setupCardMoreHtml(p, "", { open: false }), / open>/);
  assert.match(setupCardMoreHtml(p, "", { lang: "en" }), /Orders · role · all ratings/);
});

test("board + status strings: zh default unchanged, en passed by app.js", () => {
  const players = [{ id: "a", pos: "PG", name: "A" }, { id: "b", pos: "C", name: "B" }];
  const model = setupRosterModel(players, new Set(["a"]), () => 0);
  const zh = setupBoardHtml(model, () => "", "zh");
  assert.match(zh, /场上五人/);
  assert.equal(zh, setupBoardHtml(model, () => ""), "omitting lang keeps the zh output");
  const en = setupBoardHtml(model, () => "", "en");
  assert.doesNotMatch(en, /[一-鿿]/);
  assert.match(en, /Drag up to start \(4 to go\)/);
  const st = setupRosterStatus({ selectedCount: 1, ...model }, "en");
  assert.equal(st.confirmLabel, "Pick 4 more to tip off");
  assert.match(st.posNote, /4 to go/);
});
