import test from "node:test";
import assert from "node:assert/strict";
import { overall } from "../js/data/players.js";
import {
  advanceDraftToUserPick,
  createDraftState,
  generateDraftOrder,
  rookieContractForPick,
  rookieClassForYear,
  selectDraftProspect,
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

test("draft state uses the completed season as draft year and selects next-season debuts", () => {
  const season = seasonFixture();
  const nextSeasonDebut = card("future-rookie", 2025, {
    name: "Future Rookie",
  });
  const laterCard = card("future-rookie", 2026, {
    name: "Future Veteran",
  });
  const state = createDraftState({
    season,
    seed: "state-seed",
    players: [laterCard, nextSeasonDebut],
  });

  assert.equal(state.year, 2024);
  assert.equal(state.seed, "state-seed");
  assert.equal(state.order.length, season.league.teamIds.length);
  assert.ok(state.prospects.length >= season.league.teamIds.length);
  const historical = state.prospects.filter((prospect) => prospect.source === "historical-debut");
  assert.equal(historical.length, 1);
  assert.equal(historical[0].bref, "future-rookie");
  assert.equal(historical[0].player.season, 2025);
  assert.equal(historical[0].player.name, "Future Rookie");
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

function playableSeason({ userTeamId = "B", rosterSize = 0 } = {}) {
  const season = seasonFixture();
  season.userTeamId = userTeamId;
  season.freeAgents = [];
  for (const id of season.league.teamIds) {
    season.teams[id].players = Array.from({ length: rosterSize }, (_, index) =>
      card(`${id.toLowerCase()}-veteran-${index}`, 2024, {
        age: 24 + index,
        scoring: 50 + index,
        defense: 50 + index,
      }),
    );
  }
  return season;
}

test("rookie contracts use the four-year salary scale", () => {
  assert.deepEqual(rookieContractForPick(1, 2024), {
    kind: "rookie-scale",
    signedYear: 2024,
    pickNumber: 1,
    salary: 190,
    yearsRemaining: 4,
    rookieScale: true,
  });
  assert.equal(rookieContractForPick(30, 2024).salary, 45);
  assert.throws(() => rookieContractForPick(0, 2024), /pick/i);
  assert.throws(() => rookieContractForPick(1.5, 2024), /pick/i);
  assert.throws(() => rookieContractForPick(1, "2024"), /year/i);
});

test("selection immutably advances the draft and adds one contracted rookie", () => {
  const season = playableSeason();
  const draft = createDraftState({ season, seed: "selection", players: [] });
  const prospect = draft.prospects[0];
  prospect.player.photo = "transient";
  prospect.player.nbaId = 77;
  const before = structuredClone(draft);

  const next = selectDraftProspect(draft, season, prospect.prospectId);

  assert.notEqual(next, draft);
  assert.deepEqual(draft, before);
  assert.equal(next.prospects.some((entry) => entry.prospectId === prospect.prospectId), false);
  assert.equal(next.selections.length, 1);
  assert.equal(next.selections[0].source, "generated");
  assert.equal(next.selections[0].contract.yearsRemaining, 4);
  const rookie = season.teams[draft.order[0]].players[0];
  assert.equal(rookie._rookie, true);
  assert.equal(rookie._draftPick, 1);
  assert.equal(rookie.team, draft.order[0]);
  assert.equal(rookie.salary, rookie.contract.salary);
  assert.equal("photo" in rookie, false);
  assert.equal("nbaId" in rookie, false);
});

test("invalid and duplicate selections reject without partial mutation", () => {
  const season = playableSeason();
  const draft = createDraftState({ season, seed: "atomic", players: [] });
  const seasonBefore = structuredClone(season);
  assert.throws(() => selectDraftProspect({ ...draft, status: "complete" }, season, draft.prospects[0].prospectId), /active|progress/i);
  assert.throws(() => selectDraftProspect(draft, season, "missing"), /available|prospect/i);
  assert.deepEqual(season, seasonBefore);

  const selected = selectDraftProspect(draft, season, draft.prospects[0].prospectId);
  const afterSelection = structuredClone(season);
  assert.throws(() => selectDraftProspect(selected, season, draft.prospects[0].prospectId), /available|prospect/i);
  assert.deepEqual(season, afterSelection);
});

test("selection rejects duplicate available bref identities atomically", () => {
  const season = playableSeason();
  const draft = createDraftState({ season, seed: "duplicate-bref", players: [] });
  draft.prospects[1].bref = draft.prospects[0].bref;
  draft.prospects[1].player.bref = draft.prospects[0].bref;
  const seasonBefore = structuredClone(season);
  const draftBefore = structuredClone(draft);

  assert.throws(
    () => selectDraftProspect(draft, season, draft.prospects[0].prospectId),
    /bref|identity|unique|duplicate/i,
  );
  assert.deepEqual(season, seasonBefore);
  assert.deepEqual(draft, draftBefore);
});

test("full rosters waive the deterministic lowest-value non-rookie", () => {
  const firstSeason = playableSeason({ rosterSize: 15 });
  const secondSeason = structuredClone(firstSeason);
  const draft = createDraftState({ season: firstSeason, seed: "waiver", players: [] });
  const teamId = draft.order[0];
  const expected = [...firstSeason.teams[teamId].players].sort((a, b) => {
    const value = (player) =>
      overall(player) - Math.min(Number(player.age) || 0, 40) * 0.25;
    return value(a) - value(b) || String(a.bref || a.id).localeCompare(String(b.bref || b.id));
  })[0];

  const first = selectDraftProspect(draft, firstSeason, draft.prospects[0].prospectId);
  const secondDraft = createDraftState({ season: secondSeason, seed: "waiver", players: [] });
  const second = selectDraftProspect(secondDraft, secondSeason, secondDraft.prospects[0].prospectId);

  assert.equal(firstSeason.teams[teamId].players.length, 15);
  assert.equal(first.selections[0].waived.bref, expected.bref);
  assert.equal(second.selections[0].waived.bref, expected.bref);
  assert.equal(firstSeason.freeAgents.filter((player) => player.bref === expected.bref).length, 1);
});

test("an all-rookie full roster rejects atomically", () => {
  const season = playableSeason({ rosterSize: 15 });
  const draft = createDraftState({ season, seed: "all-rookie", players: [] });
  const teamId = draft.order[0];
  season.teams[teamId].players.forEach((player) => {
    player._rookie = true;
  });
  const seasonBefore = structuredClone(season);
  const draftBefore = structuredClone(draft);

  assert.throws(() => selectDraftProspect(draft, season, draft.prospects[0].prospectId), /rookie|waive|roster/i);
  assert.deepEqual(season, seasonBefore);
  assert.deepEqual(draft, draftBefore);
});

test("CPU advancement is deterministic, stops for the user, and can finish a draft", () => {
  const firstSeason = playableSeason({ userTeamId: "H" });
  const secondSeason = structuredClone(firstSeason);
  const firstDraft = createDraftState({ season: firstSeason, seed: "cpu", players: [] });
  const secondDraft = createDraftState({ season: secondSeason, seed: "cpu", players: [] });
  const first = advanceDraftToUserPick(firstDraft, firstSeason);
  const second = advanceDraftToUserPick(secondDraft, secondSeason);

  assert.deepEqual(first, second);
  assert.equal(first.order[first.currentPick], "H");
  assert.ok(first.selections.every((selection) => selection.teamId !== "H"));

  firstSeason.userTeamId = "not-in-league";
  const complete = advanceDraftToUserPick(first, firstSeason);
  assert.equal(complete.status, "complete");
  assert.equal(new Set(complete.selections.map((selection) => selection.prospectId)).size, complete.order.length);
  assert.equal(new Set(complete.selections.map((selection) => selection.teamId)).size, complete.order.length);
  assert.ok(Object.values(firstSeason.teams).every((team) => team.players.length <= 15));
});
