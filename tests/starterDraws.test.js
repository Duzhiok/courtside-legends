import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { createAccount, finalizeOnboarding } = await import("../js/data/account.js");
const { drawStarterFive } = await import("../js/data/accountGacha.js");
const { COACHES, isStarterCoach } = await import("../js/data/coaches.js");
const { overall } = await import("../js/data/players.js");

function card(id, pos, ovr) {
  const [bref, season] = id.split("-");
  return { id, bref, season: Number(season), team: "DEN", pos, ovr2k: ovr, ratingSource: "anchor", skills: [], intangibles: { winningImpact: 70, ceiling: 60, systemAdapt: 60, composure: 55, chemistryMagnet: 55 } };
}

// One low card per position, plus an 87 OVR center: under the old newbie pity
// the 5th draw was forced to 85+, so it would have picked the 87.
const POOL = [
  card("pg-2020", "PG", 60),
  card("sg-2020", "SG", 60),
  card("sf-2020", "SF", 60),
  card("pf-2020", "PF", 60),
  card("c-low-2020", "C", 60),
  card("c-high-2020", "C", 87),
];

test("starter draws give exactly 5 cards, one per position in PG/SG/SF/PF/C order", () => {
  const { players, gacha } = drawStarterFive({ pool: POOL, rng: () => 0.999 });
  assert.equal(players.length, 5);
  assert.deepEqual(players.map((p) => p.pos), ["PG", "SG", "SF", "PF", "C"]);
  assert.equal(new Set(players.map((p) => p.id)).size, 5, "no duplicates");
  assert.equal(gacha.pulls, 5, "the gacha state is carried normally");
});

test("no pity on the starter draws: the 5th draw is not forced to 85+ with only low rolls", () => {
  const { players } = drawStarterFive({ pool: POOL, rng: () => 0.999 });
  assert.ok(players.every((p) => overall(p) < 85), "every starter draw is an ordinary low roll");
  assert.equal(players[4].id, "c-low-2020", "the 5th draw takes the ordinary center, not the 87");
});

test("finalizeOnboarding accepts the 5 drawn cards and saves their gacha state", () => {
  const { players, gacha } = drawStarterFive({ pool: POOL, rng: () => 0.999 });
  const acc = createAccount("starter-test");
  const coach = COACHES.find(isStarterCoach);
  assert.ok(coach, "a starter coach must exist for the fixture");
  finalizeOnboarding(acc, { playerIds: players.map((p) => p.id), coachId: coach.id, tacticId: "balanced", gacha });
  assert.equal(acc.onboardingDone, true);
  assert.equal(acc.playerIds.length, 5);
  assert.equal(acc.gacha.pulls, 5);
  assert.equal(acc.coachId, coach.id);
});

test("finalizeOnboarding rejects fewer than 5 players", () => {
  const acc = createAccount("starter-test-2");
  const coach = COACHES.find(isStarterCoach);
  assert.throws(
    () => finalizeOnboarding(acc, { playerIds: ["pg-2020", "sg-2020", "sf-2020", "pf-2020"], coachId: coach.id }),
    /开局需要 5 名球员/,
  );
});
