// B61: the Gold Challenge team builders were moved out of app.js unchanged. These pin what callers rely on: the
// team object shape, the shared `used` set being filled (no card or staff reused across teams), and the year teams.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { PLAYERS, seasonToCard } from "../js/data/players.js";
import { FRANCHISES } from "../js/data/franchises.js";
import { HISTORICAL_PLAYOFF_CHALLENGERS } from "../js/data/careerChallenges.js";
import { makeFranchiseCareerTeam, makeRandomCareerTeam, makeYearChallengeTeam } from "../js/career/careerTeams.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
const def = HISTORICAL_PLAYOFF_CHALLENGERS[0];
for (const year of new Set([1995, def.year])) {
  if (!PLAYERS.some((p) => p.season === year)) PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
}
// the pool for franchise / random teams: every real season loaded above
const shape = (t) => {
  assert.equal(typeof t.name, "string");
  assert.ok(Array.isArray(t.players) && t.players.length >= 8, `roster ${t.players.length}`);
  assert.ok(t.coach && t.coach.id, "has a coach");
  assert.equal(t.losses, 0);
  assert.equal(typeof t.gold, "number");
};

test("makeRandomCareerTeam: your team vs a challenger", () => {
  const used = new Set();
  const you = makeRandomCareerTeam({ used, isYou: true, power: 1, index: 0 });
  shape(you);
  assert.equal(you.isCpu, false);
  assert.equal(you.bracketId, "you");
  assert.equal(you.gold, 600);
  const cpu = makeRandomCareerTeam({ used, power: 1, index: 3 });
  shape(cpu);
  assert.equal(cpu.isCpu, true);
  assert.equal(cpu.bracketId, "cpu-r3");
  assert.equal(cpu.franchiseId, null);
});

test("the shared `used` set is filled, so no card is reused across teams", () => {
  const used = new Set();
  const a = makeRandomCareerTeam({ used, isYou: true });
  const b = makeRandomCareerTeam({ used, index: 1 });
  for (const p of [...a.players, ...b.players]) assert.ok(used.has(p.id), `${p.id} marked used`);
  const ids = [...a.players, ...b.players].map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length, "no duplicate card across the two teams");
});

test("makeFranchiseCareerTeam: a franchise team keeps its franchise id and a bracket id", () => {
  const f = FRANCHISES.find((x) => x.id === "CHI") || FRANCHISES[0];
  const t = makeFranchiseCareerTeam(f, { used: new Set(), power: 1, index: 2 });
  shape(t);
  assert.equal(t.franchiseId, f.id);
  assert.equal(t.bracketId, `cpu-${f.id}-2`);
  assert.equal(t.isCpu, true);
  const mine = makeFranchiseCareerTeam(f, { used: new Set(), isYou: true });
  assert.equal(mine.name, `你的${f.name}`);
  assert.equal(mine.bracketId, "you");
});

test("makeYearChallengeTeam: a real historical roster, tagged with its year", () => {
  const used = new Set();
  const t = makeYearChallengeTeam(def, used, 4, 2);
  shape(t);
  assert.equal(t.challengeYear, def.year);
  assert.equal(t.franchiseId, def.teamId);
  assert.equal(t.bracketId, `cpu-${def.year}-${def.teamId}-4`);
  assert.equal(t.gold, 200 + 2 * 40);
  assert.ok(used.has(t.coach.id), "its coach is reserved");
});
