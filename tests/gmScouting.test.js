import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { overall, seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import {
  advanceDraftToUserPick,
  selectDraftProspect,
} from "../js/engine/leagueDraft.js";
import {
  DRAFT_YEAR,
  FEATURED_BOARD,
  GAMBLE_SEED_DEFAULT,
  GAMBLE_TEAM_ID,
  POTENTIAL_BANDS,
  SCOUTS,
  SLOT_ORDER,
  TRYOUT_BUDGET,
  buildGamble,
  careerPeak,
  deriveHiddenPotential,
  potentialBandFor,
  projectThreeYears,
  publicInfo,
  runTryout,
  scoutById,
  scoutEstimate,
  scoutReports,
  validGambleState,
} from "../js/career/gm/scoutingIntel.js";

const SEED = GAMBLE_SEED_DEFAULT;

function card(bref, season, overrides = {}) {
  return {
    id: `${bref}-${season}`,
    bref,
    season,
    name: overrides.name || bref,
    nameEn: overrides.name || bref,
    pos: overrides.pos || "SG",
    age: overrides.age ?? 20,
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
    growth: overrides.growth ?? 85,
    personality: { ego: 50, team: 70, fiery: 40, calm: 60 },
    raw: { ppg: 12, rpg: 4, apg: 3, mpg: 25, gp: 70, fg: 0.45, tp: 0.35, ft: 0.75, fga: 10, tpa: 3 },
    ...overrides,
  };
}

/** Real 1996-class cards: the 14 featured ladders + the 1997 CHH roster. */
let realPlayers = null;
function loadRealPlayers() {
  if (realPlayers) return realPlayers;
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  const wanted = new Set(FEATURED_BOARD);
  const picked = rows.filter(
    (r) => wanted.has(r.bref) || (Number(r.season) === DRAFT_YEAR + 1 && r.team === GAMBLE_TEAM_ID),
  );
  realPlayers = picked.map((r) => seasonToCard(r));
  return realPlayers;
}

test("careerPeak: the real peak is the max OVR across the ladder", () => {
  const ladder = [
    card("alpha", 1997, { scoring: 60 }),
    card("alpha", 1999, { scoring: 85 }),
    card("alpha", 2001, { scoring: 80 }),
  ];
  const peak = careerPeak(ladder[0], ladder);
  assert.equal(peak.peak, overall(ladder[1]));
  assert.equal(peak.peakSeason, 1999);
  assert.equal(peak.seasons, 3);
  assert.equal(careerPeak(card("ghost", 1997), ladder), null);
});

test("deriveHiddenPotential: deterministic, in range, near the real peak", () => {
  const ladder = [card("alpha", 1997), card("alpha", 1999, { scoring: 88 })];
  const a = deriveHiddenPotential(ladder[0], ladder, SEED);
  const b = deriveHiddenPotential(ladder[0], ladder, SEED);
  assert.deepEqual(a, b);
  assert.ok(a.potential >= 45 && a.potential <= 99);
  assert.ok(a.noise >= -8 && a.noise <= 6);
  assert.equal(a.potential, a.priorPeak + a.noise);
  assert.notEqual(
    deriveHiddenPotential(ladder[0], ladder, "another-seed").potential,
    a.potential,
  );
});

test("potentialBandFor: boundaries are the documented bands", () => {
  assert.equal(potentialBandFor(49).id, "bust");
  assert.equal(potentialBandFor(65).id, "rotation");
  assert.equal(potentialBandFor(75).id, "starter");
  assert.equal(potentialBandFor(85).id, "star");
  assert.equal(potentialBandFor(95).id, "franchise");
  assert.equal(POTENTIAL_BANDS.length, 5);
});

test("scoutEstimate: a band and a note, never the number", () => {
  const prospect = card("bryanko01", 1997, { age: 19, scoring: 55 });
  const hidden = { potential: 95, priorPeak: 98, noise: -3 };
  for (const scout of SCOUTS) {
    const report = scoutEstimate(scout, prospect, hidden, SEED);
    assert.ok(!("potential" in report) && !("estimate" in report));
    assert.equal(report.range.max - report.range.min, scout.reportHalfWidth * 2);
    assert.ok(report.range.min <= report.range.max);
    assert.ok(["medium", "low"].includes(report.confidence));
    assert.equal(typeof report.note.zh, "string");
    assert.equal(typeof report.note.en, "string");
    assert.ok(report.note.zh.length > 0);
  }
  assert.equal(scoutById("nope"), null);
});

test("the three scouts disagree on the 17-year-old sleeper (default seed)", () => {
  const players = loadRealPlayers();
  const kobe = players.find((c) => c.bref === "bryanko01" && Number(c.season) === 1997);
  assert.ok(kobe, "kobe rookie card exists");
  const hidden = deriveHiddenPotential(kobe, players, SEED);
  const reports = SCOUTS.map((s) => scoutEstimate(s, kobe, hidden, SEED));
  const bands = new Set(reports.map((r) => r.band));
  const ranges = reports.map((r) => `${r.range.min}-${r.range.max}`);
  assert.ok(bands.size >= 2, `scouts must disagree on Kobe: ${ranges.join(" / ")}`);
});

test("scoutReports: every prospect gets all three scouts", () => {
  const players = loadRealPlayers();
  const gamble = buildGamble({ players, seed: SEED });
  assert.equal(Object.keys(gamble.reports).length, FEATURED_BOARD.length);
  for (const bref of FEATURED_BOARD) {
    assert.equal(gamble.reports[bref].length, 3);
    assert.deepEqual(gamble.reports[bref].map((r) => r.scoutId), ["veteran", "analytics", "regional"]);
  }
});

test("runTryout: a narrow band plus three clues, no number", () => {
  const players = loadRealPlayers();
  const kobe = players.find((c) => c.bref === "bryanko01" && Number(c.season) === 1997);
  const hidden = deriveHiddenPotential(kobe, players, SEED);
  const tryout = runTryout(kobe, hidden, SEED);
  assert.equal(tryout.range.max - tryout.range.min, 4);
  assert.ok(!("potential" in tryout));
  assert.equal(typeof tryout.clues.workEthic.zh, "string");
  assert.equal(typeof tryout.clues.injury.zh, "string");
  assert.equal(typeof tryout.clues.character.zh, "string");
  assert.equal(typeof tryout.injuryRisk, "boolean");
  assert.ok(TRYOUT_BUDGET === 3);
});

test("publicInfo: the public layer carries no potential", () => {
  const info = publicInfo(card("alpha", 1997, { name: "Alpha", age: 19 }));
  assert.equal(info.name, "Alpha");
  assert.equal(info.age, 19);
  assert.ok(!("potential" in info));
  assert.equal(info.ovr, overall(card("alpha", 1997, { name: "Alpha", age: 19 })));
});

test("buildGamble: 14 featured prospects, fixed slots, CHH holds #8 and #13", () => {
  const players = loadRealPlayers();
  const gamble = buildGamble({ players, seed: SEED });
  assert.equal(gamble.prospects.length, 14);
  assert.deepEqual(
    [...gamble.prospects.map((p) => p.bref)].sort(),
    [...FEATURED_BOARD].sort(),
  );
  assert.deepEqual(gamble.draft.order, SLOT_ORDER);
  assert.equal(gamble.draft.order[7], GAMBLE_TEAM_ID);
  assert.equal(gamble.draft.order[12], GAMBLE_TEAM_ID);
  assert.equal(gamble.draft.year, 1996);
  assert.equal(gamble.draft.status, "in_progress");
  assert.ok(gamble.roster.length >= 10, "CHH 1997 roster loads");
  assert.equal(gamble.season.userTeamId, GAMBLE_TEAM_ID);
  for (const team of Object.values(gamble.season.teams)) {
    assert.ok(Array.isArray(team.players));
  }
  // Same seed → same hidden potentials and reports.
  const again = buildGamble({ players, seed: SEED });
  assert.deepEqual(again.hiddenByBref, gamble.hiddenByBref);
  assert.deepEqual(again.reports, gamble.reports);
});

test("draft flow: CPU fills picks 1-7, the player picks #8 and #13, then it completes", () => {
  const players = loadRealPlayers();
  const { draft, season } = buildGamble({ players, seed: SEED });
  let next = advanceDraftToUserPick(draft, season);
  assert.equal(next.currentPick, 7, "first user pick is #8");
  assert.equal(next.selections.length, 7);
  const pick8 = next.prospects.find((p) => p.bref === "bryanko01");
  assert.ok(pick8, "Kobe is still on the board at #8");
  next = selectDraftProspect(next, season, pick8.prospectId);
  assert.equal(next.selections.length, 8);
  const chh = season.teams[GAMBLE_TEAM_ID];
  const kobe = chh.players.find((p) => p.bref === "bryanko01");
  assert.ok(kobe, "Kobe joins Charlotte");
  assert.equal(kobe._rookie, true);
  assert.equal(kobe._draftPick, 8);
  assert.ok(kobe.contract && kobe.contract.kind === "rookie-scale");
  next = advanceDraftToUserPick(next, season);
  assert.equal(next.currentPick, 12, "second user pick is #13");
  const pick13 = next.prospects[0];
  next = selectDraftProspect(next, season, pick13.prospectId);
  next = advanceDraftToUserPick(next, season);
  assert.equal(next.status, "complete");
  assert.equal(next.selections.length, 14);
  const brefs = next.selections.map((s) => s.bref).filter(Boolean);
  assert.equal(new Set(brefs).size, brefs.length, "no prospect drafted twice");
  assert.equal(chh.players.length, 14, "CHH roster gains exactly two rookies");
});

test("projectThreeYears: deterministic, capped by potential, explainable verdict", () => {
  const players = loadRealPlayers();
  const gamble = buildGamble({ players, seed: SEED });
  const kobe = gamble.prospects.find((p) => p.bref === "bryanko01");
  const nash = gamble.prospects.find((p) => p.bref === "nashst01");
  const iverson = gamble.prospects.find((p) => p.bref === "iversal01");
  const args = {
    drafted: [
      { card: kobe.player, pickNumber: 8 },
      { card: nash.player, pickNumber: 13 },
    ],
    passed: [{ card: iverson.player }],
    roster: gamble.roster,
    seed: SEED,
    players,
  };
  const a = projectThreeYears(args);
  const b = projectThreeYears(args);
  assert.deepEqual(a, b);
  assert.deepEqual(a.years, [1997, 1998, 1999]);
  assert.equal(a.drafted.length, 2);
  assert.equal(a.passed.length, 1);
  for (const proj of [...a.drafted, ...a.passed]) {
    assert.equal(proj.seasons.length, 3);
    const hidden = gamble.hiddenByBref[proj.bref];
    assert.ok(proj.finalOvr <= hidden.potential, `${proj.bref} never exceeds his timeline ceiling`);
    assert.ok(proj.finalOvr >= proj.rookieOvr, "no regression in the projection");
    for (const s of proj.seasons) {
      assert.ok(s.games === 78 || s.games === 55);
      assert.ok(typeof s.injured === "boolean");
    }
  }
  assert.equal(a.team.length, 3);
  for (const year of a.team) {
    assert.ok(year.wins >= 10 && year.wins <= 70);
    assert.equal(year.wins + year.losses, 82);
    assert.equal(year.playoffs, year.wins >= 42);
  }
  assert.ok(["A", "B", "C", "D"].includes(a.verdict.grade));
  assert.equal(a.verdict.diff, a.verdict.yourSum - a.verdict.missedSum);
  assert.ok(!JSON.stringify(a).includes('"potential":'), "the review never prints a hidden potential");
});

test("tryout injury flags raise the injury rate in the projection", () => {
  const players = loadRealPlayers();
  const gamble = buildGamble({ players, seed: SEED });
  const kobe = gamble.prospects.find((p) => p.bref === "bryanko01");
  let flagged = 0;
  let clean = 0;
  for (let i = 0; i < 40; i++) {
    const seed = `injury-check-${i}`;
    const withFlag = projectThreeYears({
      drafted: [{ card: kobe.player, pickNumber: 8 }],
      passed: [],
      roster: gamble.roster,
      seed,
      players,
      injuryFlags: { bryanko01: true },
    });
    const withoutFlag = projectThreeYears({
      drafted: [{ card: kobe.player, pickNumber: 8 }],
      passed: [],
      roster: gamble.roster,
      seed,
      players,
    });
    flagged += withFlag.drafted[0].seasons.filter((s) => s.injured).length;
    clean += withoutFlag.drafted[0].seasons.filter((s) => s.injured).length;
  }
  assert.ok(flagged > clean, `flagged ${flagged} injured seasons vs clean ${clean}`);
});

test("no hidden potential leaks into reports, tryouts or the review", () => {
  const players = loadRealPlayers();
  const gamble = buildGamble({ players, seed: SEED });
  const kobe = gamble.prospects.find((p) => p.bref === "bryanko01");
  const tryout = runTryout(kobe.player, gamble.hiddenByBref.bryanko01, SEED);
  const review = projectThreeYears({
    drafted: [{ card: kobe.player, pickNumber: 8 }],
    passed: [],
    roster: gamble.roster,
    seed: SEED,
    players,
  });
  for (const blob of [JSON.stringify(gamble.reports), JSON.stringify(tryout), JSON.stringify(review)]) {
    assert.ok(!blob.includes('"potential":'), "no potential key in player-facing output");
  }
});

test("validGambleState: version, seed and phase are required", () => {
  assert.equal(validGambleState({ version: 1, seed: SEED, phase: "scout" }), true);
  assert.equal(validGambleState({ version: 2, seed: SEED, phase: "scout" }), false);
  assert.equal(validGambleState({ version: 1, seed: "", phase: "scout" }), false);
  assert.equal(validGambleState({ version: 1, seed: SEED, phase: "done" }), false);
  assert.equal(validGambleState(null), false);
});
