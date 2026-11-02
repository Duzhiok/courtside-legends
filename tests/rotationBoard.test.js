import assert from "node:assert/strict";
import test from "node:test";
import { SKILL_PACKS } from "../js/data/skills.js";
import { staminaMinuteCap, staminaMinuteHint } from "../js/engine/gameplan.js";
import {
  attributeChipsHtml,
  benchSectionHtml,
  budgetBarHtml,
  budgetLabel,
  fitLabel,
  minuteBudget,
  rotationRowHtml,
  starterMinuteConflicts,
  startersSectionHtml,
  subAttrChipsHtml,
  topAttributes,
} from "../js/ui/rotationBoard.js";

const CJK = /[\u4e00-\u9fff]/;
const SKILL = Object.keys(SKILL_PACKS)[0];
const player = (over = {}) => ({ id: "p1", name: "Pat Example", season: 1995, scoring: 73, three: 58, defense: 47, rebound: 42, pass: 42, steal: 44, block: 27, speed: 71, strength: 38, targetMinutes: 24, ...over });
const ctx = (over = {}) => ({ lang: "zh", starter: false, over: false, cap: 48, cardPos: "SG", ovr: 72, photo: "<img>", skillChips: "", posOpts: "<option>SG</option>", roleOpts: "<option>x</option>", learned: [], hint: "体能74 · 可稳打约 32 分钟", ...over });

test("topAttributes: the two best numbers, junk and missing values ignored", () => {
  assert.deepEqual(topAttributes(player()), ["scoring", "speed"]);
  assert.deepEqual(topAttributes({ scoring: "n/a", three: 50, defense: 60 }), ["defense", "three"]);
  assert.deepEqual(topAttributes(null), []);
});

test("attribute chips: all nine are shown, exactly the best two are highlighted, English has no Chinese", () => {
  const html = attributeChipsHtml(player(), "zh");
  assert.equal((html.match(/class="rot-attr/g) || []).length, 9);
  assert.equal((html.match(/rot-attr hi/g) || []).length, 2);
  assert.ok(!CJK.test(attributeChipsHtml(player(), "en")));
  assert.match(attributeChipsHtml(player({ steal: undefined }), "zh"), /断<\/b>—/, "a missing attribute shows a dash, not NaN/undefined");
});

test("sub-attribute chips: all seven shown, stored values win, old saves derive, empty players dash", () => {
  const stored = { handle: 90, perimDef: 88, interiorDef: 70, catchShoot: 66, offDribble: 64, offReb: 55, defReb: 60 };
  const zh = subAttrChipsHtml(player(stored), "zh");
  assert.equal((zh.match(/class="rot-attr/g) || []).length, 7);
  assert.match(zh, /控球<\/b>90/);
  assert.match(zh, /后板<\/b>60/);
  assert.ok(!CJK.test(subAttrChipsHtml(player(stored), "en")));
  const derived = subAttrChipsHtml(player({ pos: "PG", mid: 65, paint: 60 }), "zh");
  assert.match(derived, /控球<\/b>\d+/);
  assert.match(derived, /接球投<\/b>\d+/);
  assert.ok(!derived.includes("—"), "a player with main attributes derives all seven, no dashes");
  const empty = subAttrChipsHtml({}, "zh");
  assert.equal((empty.match(/—/g) || []).length, 7);
});

test("rotation row shows the seven sub-attributes under the main nine", () => {
  const html = rotationRowHtml(player(), ctx());
  assert.ok(html.includes('class="rot-attrs sub-attrs"'));
  assert.match(html, /控球<\/b>/);
});

test("minute budget: 240 is a full game; short and over say by how much", () => {
  const mk = (...m) => m.map((targetMinutes, i) => ({ id: `p${i}`, name: `P${i}`, targetMinutes }));
  assert.deepEqual(minuteBudget(mk(48, 48, 48, 48, 48)), { total: 240, diff: 0, state: "ok" });
  assert.deepEqual(minuteBudget(mk(36, 30, 24, 24, 24, 24, 24, 12, 12, 12)), { total: 222, diff: -18, state: "short" });
  assert.deepEqual(minuteBudget(mk(48, 48, 48, 48, 48, 12)), { total: 252, diff: 12, state: "over" });
  assert.match(budgetLabel({ state: "short", diff: -18 }, "zh"), /还有 18 分钟没分配/);
  assert.match(budgetLabel({ state: "over", diff: 12 }, "en"), /12 minutes over/);
  assert.match(budgetLabel({ state: "ok", diff: 0 }, "zh"), /刚好 240/);
});

test("budget bar: starters and bench are coloured apart, and an over-full game still fits inside the bar", () => {
  const players = [48, 48, 48, 48, 48, 24].map((targetMinutes, i) => ({ id: `p${i}`, name: `P${i}`, targetMinutes }));
  const html = budgetBarHtml(players, ["p0", "p1", "p2", "p3", "p4"], "zh");
  assert.equal((html.match(/<i class="st"/g) || []).length, 5);
  assert.equal((html.match(/<i class="bn"/g) || []).length, 1);
  const widths = [...html.matchAll(/style="width:([\d.]+)%"/g)].map((m) => Number(m[1]));
  assert.ok(widths.reduce((a, b) => a + b, 0) <= 100.01, "segments never overflow the bar");
  assert.match(html, /rot-budget-over/);
  assert.match(budgetBarHtml([], [], "zh"), /rot-budget-short/, "an empty roster is 0/240, not a crash");
});

test("lineup fit is a dash until there is a full five", () => {
  assert.equal(fitLabel(0, 40), "—");
  assert.equal(fitLabel(4, 40), "—");
  assert.equal(fitLabel(5, 40), 40);
  assert.equal(fitLabel(5, null), "—");
});

test("a row keeps every control app.js wires up, and escapes the player's name", () => {
  const html = rotationRowHtml(player({ name: '<img src=x onerror="alert(1)">' }), ctx({ starter: true }));
  for (const hook of ['data-id="p1"', "rot-start-cb", "rot-min", "rot-pos", "rot-role", "rot-row starter"]) assert.ok(html.includes(hook), hook);
  assert.match(html, /rot-start-cb" checked/);
  assert.ok(!html.includes("<img src=x"), "name is escaped");
  assert.match(html, /value="24"/);
});

test("the stamina warning appears only for players it matters for", () => {
  assert.ok(!rotationRowHtml(player(), ctx({ cap: 48 })).includes("rot-tired"), "rested and capable: no noise");
  assert.ok(rotationRowHtml(player(), ctx({ cap: 32 })).includes("rot-tired"), "can only carry 32: say so");
  const over = rotationRowHtml(player({ targetMinutes: 40 }), ctx({ cap: 32, over: true }));
  assert.ok(over.includes("over-min") && over.includes("rot-bar over"));
});

test("the minutes bar is drawn against 48 and marks the stamina cap", () => {
  const html = rotationRowHtml(player({ targetMinutes: 36 }), ctx({ cap: 24 }));
  assert.match(html, /--m:75\.0%;--cap:50\.0%/);
  assert.match(rotationRowHtml(player({ targetMinutes: 99 }), ctx()), /--m:100\.0%/, "never wider than the bar");
});

test("a row shows the learned badge only when he learned something", () => {
  assert.ok(!rotationRowHtml(player(), ctx()).includes("learned-badge"));
  const html = rotationRowHtml(player(), ctx({ learned: [SKILL] }));
  assert.ok(html.includes("learned-badge") && html.includes("learned-line"));
});

test("sections: empty-state when nobody starts, a full-five marker, and an honest heading while no one is picked", () => {
  const empty = startersSectionHtml("", 0, "zh");
  assert.match(empty, /0\/5/);
  assert.match(empty, /还没有首发/);
  assert.ok(!empty.includes("rot-list"));
  assert.match(startersSectionHtml("<div></div>", 5, "en"), /class="full">5\/5/);
  assert.match(startersSectionHtml("<div></div>", 3, "zh"), /3\/5/);
  assert.equal(benchSectionHtml("", 0, "zh"), "");
  assert.match(benchSectionHtml("<div></div>", 7, "zh"), /替补轮换/);
  assert.match(benchSectionHtml("<div></div>", 12, "zh", { noStarters: true }), /全部球员/);
  assert.match(benchSectionHtml("<div></div>", 12, "en", { noStarters: true }), /All players/);
});

test("the stamina hint speaks the player's language in all three states, and defaults to Chinese", () => {
  const p = { stamina: 74, skills: [] };
  const cap = staminaMinuteCap(p);
  for (const [targetMinutes, zh, en] of [[cap + 4, /易崩/, /wear him down/], [cap - 1, /已接近上限/, /near his limit/], [Math.max(8, cap - 10), /可稳打约/, /can carry about/]]) {
    const q = { ...p, targetMinutes };
    assert.match(staminaMinuteHint(q), zh, "default is Chinese");
    assert.match(staminaMinuteHint(q, "zh"), zh);
    assert.match(staminaMinuteHint(q, "en"), en);
    assert.ok(!CJK.test(staminaMinuteHint(q, "en")), "English hint has no Chinese");
  }
});

// ---- a starter slated for fewer minutes than a bench player
const squad = (...rows) => rows.map(([id, targetMinutes], i) => ({ id, name: `Player ${i}`, targetMinutes }));

test("starterMinuteConflicts: each starter below the busiest bench player is named, with who out-minutes him", () => {
  const players = squad(["s1", 30], ["s2", 12], ["s3", 40], ["b1", 20], ["b2", 36]);
  const found = starterMinuteConflicts(players, new Set(["s1", "s2", "s3"]));
  assert.deepEqual(found.map((c) => [c.id, c.min, c.benchMin]), [["s1", 30, 36], ["s2", 12, 36]]);
  assert.equal(found[0].benchName, "Player 4", "names the busiest bench player, not just any");
});

test("starterMinuteConflicts: equal minutes are fine, and it needs both a starter and a bench player", () => {
  assert.deepEqual(starterMinuteConflicts(squad(["s", 30], ["b", 30]), ["s"]), [], "a tie is not a conflict; ids may be an array");
  assert.deepEqual(starterMinuteConflicts(squad(["a", 10], ["b", 40]), new Set()), [], "nobody picked as a starter yet");
  assert.deepEqual(starterMinuteConflicts(squad(["a", 10], ["b", 40]), new Set(["a", "b"])), [], "no bench to compare with");
  assert.deepEqual(starterMinuteConflicts(undefined, undefined), []);
});

test("starterMinuteConflicts: a player without minutes counts as the row default (24), like the input shows", () => {
  const players = [{ id: "s", name: "S" }, { id: "b", name: "B", targetMinutes: 30 }];
  assert.deepEqual(starterMinuteConflicts(players, ["s"]).map((c) => c.min), [24]);
});

test("a flagged row says it (zh and en, no Chinese in English), an unflagged row says nothing", () => {
  const clash = { min: 12, benchName: "Sam <b>", benchMin: 40 };
  const zh = rotationRowHtml(player(), ctx({ clash }));
  assert.match(zh, /首发只排 12 分钟，替补 Sam &lt;b&gt; 排了 40/, "name escaped");
  const en = rotationRowHtml(player(), ctx({ lang: "en", clash }));
  assert.match(en, /Starter plays 12 min, bench Sam &lt;b&gt; plays 40/);
  assert.ok(!CJK.test(en.match(/rot-clash">([^<]*)</)[1]));
  assert.ok(!rotationRowHtml(player(), ctx()).includes("rot-clash"));
});

test("the starters heading counts the conflicts only when there are some", () => {
  assert.ok(!startersSectionHtml("<i></i>", 5, "zh").includes("warn"));
  assert.ok(!startersSectionHtml("<i></i>", 5, "zh", { clashes: 0 }).includes("warn"));
  assert.match(startersSectionHtml("<i></i>", 5, "zh", { clashes: 2 }), /warn">⚠ 2 人分钟低于替补/);
  assert.match(startersSectionHtml("<i></i>", 5, "en", { clashes: 1 }), /1 out-minuted by the bench/);
});
