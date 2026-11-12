import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";
import { TACTICS } from "../js/data/coaches.js";

/**
 * B54 remainder: sim.js coach-switch (setTactic) and shout broadcasts used
 * tactic.name verbatim, so an English game leaked Chinese tactic names.
 * English broadcasts must use nameEn (falling back to the Chinese name when
 * a tactic has no nameEn); Chinese broadcasts are unchanged. Zero behaviour
 * change: tactic, fit and morale effects are identical.
 */
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool2020 = rows.filter((r) => r.season === 2020).map(seasonToCard);

function freshSim(events, lang) {
  return new GameSim({
    home: {
      name: "Home",
      players: pool2020.slice(0, 12),
      starterIds: pool2020.slice(0, 5).map((p) => p.id),
    },
    away: {
      name: "Away",
      players: pool2020.slice(12, 24),
      starterIds: pool2020.slice(12, 17).map((p) => p.id),
    },
    youSide: "home",
    lang,
    onEvent: (e) => events.push(e),
    onTick: () => {},
    onEnd: () => {},
  });
}

test("setTactic broadcast in English uses nameEn, not the Chinese name", () => {
  const events = [];
  const sim = freshSim(events, "en");
  sim.setTactic("triangle");
  const line = events.map((e) => e.text).find((t) => t.includes("System switched"));
  assert.ok(line, `expected a switch line; got ${JSON.stringify(events.map((e) => e.text))}`);
  assert.ok(line.includes("Triangle Offense"), `expected nameEn in line; got ${line}`);
  assert.ok(!line.includes("三角进攻"), `Chinese name leaked into English line: ${line}`);
  assert.equal(sim.you().tactic, TACTICS.triangle);
  assert.equal(typeof sim.you().fit, "number");
});

test("setTactic broadcast in Chinese keeps the Chinese name", () => {
  const events = [];
  const sim = freshSim(events, "zh");
  sim.setTactic("triangle");
  const line = events.map((e) => e.text).find((t) => t.includes("战术切换"));
  assert.ok(line, `expected a switch line; got ${JSON.stringify(events.map((e) => e.text))}`);
  assert.ok(line.includes("三角进攻"), `expected Chinese name in line; got ${line}`);
  assert.ok(!line.includes("Triangle Offense"), `English name leaked into Chinese line: ${line}`);
});

test("shout broadcast in English names the tactic in English", () => {
  const events = [];
  const sim = freshSim(events, "en");
  const you = sim.you();
  for (const p of you.onCourt) p.personality = { ...(p.personality || {}), ego: 50 };
  const star = you.onCourt[0];
  star.personality = { ...(star.personality || {}), ego: 100 };
  sim.shout();
  const line = events.map((e) => e.text).find((t) => t.includes("Shout!"));
  assert.ok(line, `expected a shout line; got ${JSON.stringify(events.map((e) => e.text))}`);
  assert.ok(line.includes("Balanced Offense"), `expected nameEn in shout line; got ${line}`);
  assert.ok(!line.includes("均衡进攻"), `Chinese name leaked into English shout line: ${line}`);
});

test("tacticName falls back to the Chinese name when nameEn is missing", () => {
  const events = [];
  const sim = freshSim(events, "en");
  assert.equal(sim.tacticName({ name: "测试战术" }), "测试战术");
  assert.equal(sim.tacticName(null), "");
  assert.equal(sim.tacticName(TACTICS.triangle), "Triangle Offense");
  const zh = freshSim([], "zh");
  assert.equal(zh.tacticName(TACTICS.triangle), "三角进攻");
});

test("unknown tactic id still falls back to balanced, named in English", () => {
  const events = [];
  const sim = freshSim(events, "en");
  sim.setTactic("not_a_tactic");
  assert.equal(sim.you().tactic, TACTICS.balanced);
  const line = events.map((e) => e.text).find((t) => t.includes("System switched"));
  assert.ok(line && line.includes("Balanced Offense"), `expected balanced nameEn; got ${line}`);
});
