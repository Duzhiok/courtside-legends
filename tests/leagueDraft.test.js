import test from "node:test";
import assert from "node:assert/strict";
import {
  createDraftState,
  generateDraftOrder,
  rookieClassForYear,
} from "../js/engine/leagueDraft.js";

function card(bref, season, overrides = {}) {
  return {
    id: `${bref}-${season}`,
    bref,
    season,
    name: overrides.name || bref,
    pos: overrides.pos || "SG",
    age: overrides.age ?? 21,
    scoring: 70,
    three: 68,
    mid: 69,
    paint: 65,
    defense: 66,
    rebound: 55,
    pass: 62,
    speed: 72,
    strength: 58,
    stamina: 71,
    iq: 64,
    clutch: 63,
    steal: 65,
    block: 45,
    photo: "https://example.test/player.png",
    nbaId: 123,
    ...overrides,
  };
}

const fixturePlayers = [
  card("alpha", 2021, { name: "Alpha Rookie" }),
  card("alpha", 2022, { name: "Alpha Veteran", scoring: 90 }),
  card("beta", 2021, { name: "Beta Rookie", pos: "C" }),
  card("gamma", 2022, { name: "Gamma Rookie" }),
];

function seasonFixture() {
  const ids = ["A", "B", "C", "D", "E", "F", "G", "H"];
  return {
    year: 2024,
    league: { teamIds: ids },
    teams: Object.fromEntries(ids.map((id) => [id, { teamId: id }])),
    standings: Object.fromEntries(
      ids.map((id, index) => [
        id,
        { w: 10 + index * 8, l: 72 - index * 8, pf: 8000 + index, pa: 9000 - index },
      ]),
    ),
  };
}

test("historical classes use each bref's earliest card and the draft-year offset", () => {
  const prospects = rookieClassForYear(2020, {
    seed: 12,
    minimumSize: 0,
    players: fixturePlayers,
  });

  assert.equal(prospects.length, 2);
  assert.deepEqual(new Set(prospects.map((p) => p.bref)), new Set(["alpha", "beta"]));
  assert.equal(prospects.find((p) => p.bref === "alpha").player.season, 2021);
  assert.equal(prospects.find((p) => p.bref === "alpha").player.name, "Alpha Rookie");
  assert.ok(prospects.every((p) => p.source === "historical-debut"));

  const nextClass = rookieClassForYear(2021, {
    seed: 12,
    minimumSize: 0,
    players: fixturePlayers,
  });
  assert.deepEqual(nextClass.map((p) => p.bref), ["gamma"]);
});

test("historical class order is deterministic and returned cards are cloned", () => {
  const first = rookieClassForYear(2020, {
    seed: "career-seed",
    minimumSize: 0,
    players: fixturePlayers,
  });
  const second = rookieClassForYear(2020, {
    seed: "career-seed",
    minimumSize: 0,
    players: fixturePlayers,
  });

  assert.deepEqual(first, second);
  assert.notEqual(first[0].player, fixturePlayers.find((p) => p.bref === first[0].bref));
  first[0].player.scoring = 1;
  assert.notEqual(
    fixturePlayers.find((p) => p.bref === first[0].bref).scoring,
    1,
  );
});

test("post-data classes are deterministic generated prospects with bounded cards", () => {
  const first = rookieClassForYear(2030, {
    seed: 77,
    minimumSize: 12,
    players: fixturePlayers,
  });
  const second = rookieClassForYear(2030, {
    seed: 77,
    minimumSize: 12,
    players: fixturePlayers,
  });

  assert.deepEqual(first, second);
  assert.equal(first.length, 12);
  first.forEach((prospect, index) => {
    assert.equal(prospect.prospectId, `generated-2030-${index}`);
    assert.equal(prospect.bref, prospect.prospectId);
    assert.equal(prospect.source, "generated");
    assert.ok(prospect.player.age >= 19 && prospect.player.age <= 22);
    assert.equal("photo" in prospect.player, false);
    assert.equal("nbaId" in prospect.player, false);
    assert.ok(prospect.scoutingRange.min < prospect.scoutingRange.max);
    assert.ok(
      prospect.potential >= prospect.scoutingRange.min &&
        prospect.potential <= prospect.scoutingRange.max,
    );
    for (const attr of [
      "scoring", "three", "mid", "paint", "defense", "rebound", "pass",
      "speed", "strength", "stamina", "iq", "clutch", "steal", "block",
    ]) {
      assert.ok(prospect.player[attr] >= 35 && prospect.player[attr] <= 95, attr);
    }
  });
});

test("short historical classes are filled to the requested minimum", () => {
  const prospects = rookieClassForYear(2021, {
    seed: 42,
    minimumSize: 4,
    players: fixturePlayers,
  });

  assert.equal(prospects.length, 4);
  assert.equal(prospects.filter((p) => p.source === "historical-debut").length, 1);
  assert.equal(prospects.filter((p) => p.source === "generated").length, 3);
});

test("draft order is complete, deterministic, unique, and does not mutate season", () => {
  const season = seasonFixture();
  const before = structuredClone(season);
  const first = generateDraftOrder(season, { seed: 99 });
  const second = generateDraftOrder(season, { seed: 99 });

  assert.deepEqual(first, second);
  assert.equal(first.length, season.league.teamIds.length);
  assert.equal(new Set(first).size, first.length);
  assert.deepEqual(new Set(first), new Set(season.league.teamIds));
  assert.deepEqual(season, before);
});

test("weighted lottery favors bottom records across stable seeds", () => {
  const season = seasonFixture();
  const positions = Object.fromEntries(season.league.teamIds.map((id) => [id, 0]));
  for (let seed = 0; seed < 200; seed++) {
    generateDraftOrder(season, { seed }).forEach((id, index) => {
      positions[id] += index;
    });
  }

  const bottomAverage = (positions.A + positions.B) / 2;
  const topAverage = (positions.G + positions.H) / 2;
  assert.ok(bottomAverage < topAverage, `${bottomAverage} should be below ${topAverage}`);
});

test("draft state uses the next class year and initializes progress", () => {
  const season = seasonFixture();
  const state = createDraftState({ season, seed: "state-seed" });

  assert.equal(state.year, 2025);
  assert.equal(state.seed, "state-seed");
  assert.equal(state.order.length, season.league.teamIds.length);
  assert.ok(state.prospects.length >= season.league.teamIds.length);
  assert.equal(state.currentPick, 0);
  assert.deepEqual(state.selections, []);
  assert.equal(state.status, "in_progress");
});

test("draft domain validates malformed inputs descriptively", () => {
  assert.throws(
    () => rookieClassForYear("2025", { seed: 1, minimumSize: 1, players: [] }),
    /year/i,
  );
  assert.throws(
    () => rookieClassForYear(2025, { seed: null, minimumSize: 1, players: [] }),
    /seed/i,
  );
  assert.throws(
    () => rookieClassForYear(2025, { seed: 1, minimumSize: -1, players: [] }),
    /minimumSize/i,
  );
  assert.throws(() => generateDraftOrder(null, { seed: 1 }), /season/i);
  assert.throws(
    () => generateDraftOrder({ year: 2025, teams: {}, standings: {} }, { seed: 1 }),
    /team/i,
  );
  assert.throws(
    () =>
      generateDraftOrder(
        {
          year: 2025,
          league: { teamIds: ["A", "A"] },
          teams: { A: {} },
          standings: { A: { w: 1, l: 1 } },
        },
        { seed: 1 },
      ),
    /unique|duplicate/i,
  );
  assert.throws(() => createDraftState({ season: seasonFixture() }), /seed/i);
});
