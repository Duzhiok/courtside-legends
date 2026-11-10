// Career 2.0 integration seams — the three cross-workstream wirings that
// unblocked once G landed on main:
//   G film -> B coach decision (videoAnalyst adapter + challenge hook)
//   E negotiation standing -> C/F trade negotiation (negotiation.js)
//   C draft gamble -> F executive scenario step 3 (scoutingIntel converter)
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seededStream } from "../js/core/seededRandom.js";
import { CLUTCH_POOL } from "./helpers/clutchSim.js";
import { createCoachingChallenge } from "../js/career/coach/coachingChallenge.js";
import {
  filmRecommendForMoment,
  fileFilmRecommendation,
  readFiledFilmRecommendation,
} from "../js/career/network/videoAnalyst.js";
import {
  clampStanding,
  evaluateOffer,
  negotiateRound,
  personaById,
  standingModifier,
  startNegotiation,
} from "../js/career/gm/negotiation.js";
import {
  DRAFT_YEAR,
  FEATURED_BOARD,
  GAMBLE_SEED_DEFAULT,
  GAMBLE_TEAM_ID,
  buildGamble,
  gambleDraftDecision,
} from "../js/career/gm/scoutingIntel.js";
import {
  advanceDraftToUserPick,
  selectDraftProspect,
} from "../js/engine/leagueDraft.js";
import {
  createExecutiveScenario,
  makeScoutingDecision,
} from "../js/career/gm/businessScenario.js";
import { negotiationStanding } from "../js/career/careerRelationships.js";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";

const SEED = GAMBLE_SEED_DEFAULT;

// ---------------------------------------------------------------------------
// G -> B: film recommendation onto a coach moment
// ---------------------------------------------------------------------------

const filmRec = (kind, wasCorrect = true) => ({
  kind,
  wasCorrect,
  source: "film-room",
  suggestionZh: `建议针对：${kind}`,
  suggestionEn: `Recommend exploiting: ${kind}`,
});

const moment = (kind, choiceIds) => ({
  kind,
  choices: choiceIds.map((id) => ({ id })),
});

test("film adapter: cold shooter at the opening suggests packing the paint", () => {
  const rec = filmRecommendForMoment(filmRec("cold-shooter"), moment("opening", ["switch_all", "zone_drop", "pack_paint"]));
  assert.deepEqual(rec, {
    choiceId: "pack_paint",
    reason: "建议针对：cold-shooter",
    source: "film-room",
  });
});

test("film adapter: a scoring run suggests a timeout, a late collapse suggests grinding", () => {
  const run = filmRecommendForMoment(
    filmRec("scoring-run"),
    moment("opponent_run", ["timeout_talk", "double_hot_hand", "attack_focus"]),
  );
  assert.equal(run?.choiceId, "timeout_talk");
  const collapse = filmRecommendForMoment(
    filmRec("late-collapse"),
    moment("late", ["clutch_call", "grind", "push"]),
  );
  assert.equal(collapse?.choiceId, "grind");
  const loose = filmRecommendForMoment(
    filmRec("turnover-prone"),
    moment("late", ["clutch_call", "grind", "push"]),
  );
  assert.equal(loose?.choiceId, "push");
});

test("film adapter: no mapping for the moment kind, unknown finding, or a disabled choice", () => {
  assert.equal(filmRecommendForMoment(filmRec("scoring-run"), moment("opening", ["switch_all", "zone_drop", "pack_paint"])), null);
  assert.equal(filmRecommendForMoment(filmRec("cold-shooter"), moment("late", ["clutch_call", "grind", "push"])), null);
  assert.equal(filmRecommendForMoment(filmRec("sub-effect"), moment("opponent_run", ["timeout_talk", "double_hot_hand", "attack_focus"])), null);
  assert.equal(filmRecommendForMoment(filmRec("onoff-scoring"), moment("opening", ["switch_all"])), null);
  const noTimeout = moment("opponent_run", ["timeout_talk", "double_hot_hand", "attack_focus"]);
  noTimeout.choices[0].disabled = true;
  assert.equal(filmRecommendForMoment(filmRec("scoring-run"), noTimeout), null);
});

test("film adapter: a misread report still maps but says so in the reason", () => {
  const zh = filmRecommendForMoment(
    filmRec("cold-shooter", false),
    moment("opening", ["switch_all", "zone_drop", "pack_paint"]),
  );
  assert.equal(zh?.choiceId, "pack_paint");
  assert.match(zh?.reason || "", /存疑/);
  const en = filmRecommendForMoment(
    filmRec("cold-shooter", false),
    moment("opening", ["switch_all", "zone_drop", "pack_paint"]),
    { lang: "en" },
  );
  assert.match(en?.reason || "", /uncertain/);
  assert.match(en?.reason || "", /Recommend exploiting/);
});

test("film handoff holder: file then read, invalid input does not clobber", () => {
  assert.deepEqual(fileFilmRecommendation(filmRec("cold-shooter")), filmRec("cold-shooter"));
  const filed = readFiledFilmRecommendation();
  assert.equal(filed?.kind, "cold-shooter");
  assert.equal(filed?.source, "film-room");
  assert.equal(fileFilmRecommendation(null), null);
  assert.equal(fileFilmRecommendation({ kind: "cold-shooter" }), null);
  assert.equal(readFiledFilmRecommendation()?.kind, "cold-shooter");
});

test("challenge: a filed cold-shooter report recommends pack_paint at the opening moment", () => {
  fileFilmRecommendation(filmRec("cold-shooter"));
  const filed = readFiledFilmRecommendation();
  const c = createCoachingChallenge({
    pool: CLUTCH_POOL,
    rng: seededStream(1),
    recommend: (m) => filmRecommendForMoment(filed, m),
  });
  const started = c.start();
  assert.ok(started.ok, `start must succeed: ${started.reason || ""}`);
  assert.equal(started.moment.kind, "opening");
  assert.equal(started.moment.recommendation?.choiceId, "pack_paint");
  assert.equal(started.moment.recommendation?.source, "film-room");
});

test("challenge: a scoring-run report suggests nothing at the opening moment", () => {
  fileFilmRecommendation(filmRec("scoring-run"));
  const filed = readFiledFilmRecommendation();
  const c = createCoachingChallenge({
    pool: CLUTCH_POOL,
    rng: seededStream(1),
    recommend: (m) => filmRecommendForMoment(filed, m),
  });
  const started = c.start();
  assert.ok(started.ok);
  assert.equal(started.moment.recommendation, undefined);
});

// ---------------------------------------------------------------------------
// E -> C/F: negotiation standing prices a deal
// ---------------------------------------------------------------------------

/** A flat card: every attribute equals `ovr`, so overall() === ovr. */
function flatCard(ovr, age = 26, salary = null) {
  const attrs = {};
  for (const a of ["scoring", "three", "mid", "paint", "defense", "rebound", "pass", "speed", "strength", "stamina", "iq", "clutch", "steal", "block"]) {
    attrs[a] = ovr;
  }
  return {
    id: `flat-${ovr}-${age}-${salary ?? "nosal"}`,
    bref: `flat-${ovr}-${age}`,
    name: `Flat ${ovr}`,
    pos: "SG",
    age,
    salary,
    ...attrs,
  };
}

const first = (year) => ({ year, round: 1, protection: "unprotected" });

test("standingModifier: +2 is 0.9, -2 is 1.1, out-of-range clamps, garbage is 0", () => {
  assert.equal(standingModifier(2), 0.9);
  assert.equal(standingModifier(-2), 1.1);
  assert.equal(standingModifier(0), 1);
  assert.equal(standingModifier(5), 0.9);
  assert.equal(standingModifier(-5), 1.1);
  assert.equal(standingModifier("junk"), 1);
  assert.equal(clampStanding(3), 2);
  assert.equal(clampStanding(-3), -2);
});

test("standing moves demand: +2 flips a near-threshold counter into an accept", () => {
  const persona = personaById("contend");
  // Ask a 72-OVR player (12 points of value); give two 1996 firsts (9.0)
  // plus a 62-OVR player (2) = 11.0. Demand is 12.0 at standing 0 and
  // 10.8 at standing +2, so the same offer counters, then accepts.
  const give = { players: [flatCard(62)], picks: [first(1996), first(1996)] };
  const ask = { players: [flatCard(72, 26)], picks: [] };
  const base = evaluateOffer({ give, ask, persona, currentYear: 1996 });
  assert.equal(base.demand, 12);
  assert.equal(base.verdict, "counter");
  assert.equal(base.standing, 0);
  assert.equal(base.standingModifier, 1);
  const trusted = evaluateOffer({ give, ask, persona, standing: 2, currentYear: 1996 });
  assert.equal(trusted.demand, 10.8);
  assert.equal(trusted.verdict, "accept");
  assert.equal(trusted.standing, 2);
  assert.equal(trusted.standingModifier, 0.9);
  const burned = evaluateOffer({ give, ask, persona, standing: -2, currentYear: 1996 });
  assert.equal(burned.demand, 13.2);
  assert.equal(burned.verdict, "counter");
  assert.equal(burned.standingModifier, 1.1);
});

test("negotiateRound threads standing through to the evaluated offer", () => {
  const give = { players: [flatCard(62)], picks: [first(1996), first(1996)] };
  const ask = { players: [flatCard(72, 26)], picks: [] };
  const machine = startNegotiation({ gmId: "CHH", personaId: "contend", seed: "draft-gamble-1996" });
  const next = negotiateRound(machine, { type: "offer", give, ask }, { standing: 2, currentYear: 1996 });
  assert.equal(next.lastResult?.verdict, "accept");
  assert.equal(next.lastResult?.demand, 10.8);
  assert.equal(next.status, "accepted");
});

test("E's negotiationStanding modifier is the number the negotiation layer reads", () => {
  const account = {
    careerRelationships: {
      promises: [
        { makerId: "gm-chh", targetId: "you", status: "fulfilled" },
        { makerId: "you", targetId: "gm-chh", status: "fulfilled" },
        { makerId: "you", targetId: "gm-other", status: "broken" },
      ],
    },
  };
  assert.equal(negotiationStanding(account, "gm-chh").modifier, 2);
  assert.equal(negotiationStanding(account, "gm-other").modifier, -1);
  const persona = personaById("contend");
  const give = { players: [flatCard(62)], picks: [first(1996), first(1996)] };
  const ask = { players: [flatCard(72, 26)], picks: [] };
  const kept = evaluateOffer({
    give, ask, persona,
    standing: negotiationStanding(account, "gm-chh").modifier,
    currentYear: 1996,
  });
  assert.equal(kept.verdict, "accept");
  const broken = evaluateOffer({
    give, ask, persona,
    standing: negotiationStanding(account, "gm-other").modifier,
    currentYear: 1996,
  });
  assert.equal(broken.demand, 12.6);
  assert.equal(broken.verdict, "counter");
});

// ---------------------------------------------------------------------------
// C -> F: the draft gamble's pick becomes the executive scenario's step 3
// ---------------------------------------------------------------------------

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

test("gambleDraftDecision: scout agreement sets the confidence (3/3, 2/3, 0/3, none)", () => {
  const base = (reports) => ({
    draft: { selections: [{ pickNumber: 8, teamId: "CHH", bref: "prospect01", prospectId: "prospect01" }] },
    reports: { prospect01: reports },
  });
  const band = (b) => ({ band: b });
  assert.equal(gambleDraftDecision(base([band("star"), band("star"), band("star")]), { pickNumber: 8 }).confidence, 0.8);
  assert.equal(gambleDraftDecision(base([band("star"), band("star"), band("starter")]), { pickNumber: 8 }).confidence, 0.6);
  assert.equal(gambleDraftDecision(base([band("star"), band("starter"), band("bench")]), { pickNumber: 8 }).confidence, 0.35);
  assert.equal(gambleDraftDecision(base([]), { pickNumber: 8 }).confidence, 0.5);
  assert.equal(gambleDraftDecision(base([band("star"), band("star"), band("star")]), { bref: "prospect01" }).bref, "prospect01");
});

test("gambleDraftDecision: missing or forfeited selections throw", () => {
  const gamble = {
    draft: { selections: [{ pickNumber: 8, teamId: "CHH", forfeited: true }] },
    reports: {},
  };
  assert.throws(() => gambleDraftDecision(gamble, { pickNumber: 8 }), /no completed gamble selection/);
  assert.throws(() => gambleDraftDecision(gamble, { pickNumber: 13 }), /no completed gamble selection/);
  assert.throws(() => gambleDraftDecision({ draft: { selections: [] }, reports: {} }, { bref: "nobody01" }), /no completed gamble selection/);
});

test("end to end: the gamble's #8 pick feeds F's scouting decision with source draft-gamble", () => {
  const players = loadRealPlayers();
  const gamble = buildGamble({ players, seed: SEED });
  let next = advanceDraftToUserPick(gamble.draft, gamble.season);
  assert.equal(next.currentPick, 7, "first user pick is #8");
  const pick8 = next.prospects.find((p) => p.bref === "bryanko01");
  assert.ok(pick8, "Kobe is still on the board at #8");
  next = selectDraftProspect(next, gamble.season, pick8.prospectId);
  const decided = gambleDraftDecision({ ...gamble, draft: next }, { pickNumber: 8 });
  assert.equal(decided.bref, "bryanko01");
  assert.equal(decided.source, "draft-gamble");
  assert.ok([0.35, 0.6, 0.8].includes(decided.confidence), `confidence from real scout agreement, got ${decided.confidence}`);

  const scenario = createExecutiveScenario({ players: gamble.prospects });
  const after = makeScoutingDecision(scenario, decided, gamble.prospects);
  assert.equal(after.draftPick.bref, "bryanko01");
  assert.equal(after.draftPick.source, "draft-gamble");
  assert.equal(after.draftPick.confidence, decided.confidence);
  const logged = after.log.find((e) => e.type === "scouting-decision");
  assert.equal(logged?.source, "draft-gamble");
  assert.equal(logged?.bref, "bryanko01");
});
