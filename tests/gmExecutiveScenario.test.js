import test from "node:test";
import assert from "node:assert/strict";
import { historicalSeason } from "../js/data/historicalSeasons.js";
import {
  BUSINESS_EVENT_TYPES,
  applyBusinessEvent,
  availableBusinessEvents,
  businessEventById,
  businessEventForInbox,
} from "../js/career/gm/businessEvents.js";
import {
  SCENARIO_SEASON,
  SCENARIO_TEAM_ID,
  advanceScenarioSeason,
  attachToCareerRoot,
  createExecutiveScenario,
  executiveFromRoot,
  makeScoutingDecision,
  minorityOpportunity,
  resolveScoutingDecision,
  retireExecutive,
  scenarioSummary,
  validateExecutive,
} from "../js/career/gm/businessScenario.js";

const card = (bref, season, rating, ppg = 10, name = "Test Player") => ({
  bref,
  name,
  season,
  team: "VAN",
  pos: "SG",
  three: rating, mid: rating, paint: rating, scoring: rating, pass: rating,
  iq: rating, defense: rating, steal: rating, block: rating, rebound: rating,
  speed: rating, strength: rating, stamina: rating, clutch: rating,
  raw: { ppg },
});
/** Fabricated 1997–99 classes for the draft-board clue (one sleeper, two decoys). */
const draftPlayers = [
  card("sleep01", 1997, 55, 8, "Sleeper One"), card("sleep01", 1998, 85, 22, "Sleeper One"), card("sleep01", 1999, 88, 26, "Sleeper One"),
  card("dec01", 1997, 55, 9, "Decoy One"), card("dec01", 1998, 60, 12, "Decoy One"), card("dec01", 1999, 60, 11, "Decoy One"),
  card("dec02", 1998, 55, 7, "Decoy Two"), card("dec02", 1999, 58, 10, "Decoy Two"), card("dec02", 2000, 60, 9, "Decoy Two"),
];
const star = (team) => ({
  bref: "star01", name: "Star", team, pos: "SG",
  three: 88, mid: 88, paint: 85, scoring: 92, pass: 72, iq: 82,
  defense: 76, steal: 72, block: 60, rebound: 70, speed: 82, strength: 76,
  stamina: 82, clutch: 88, raw: { ppg: 28.4 },
});
const role = (team, bref) => ({
  bref, name: "Role", team, pos: "PF",
  three: 50, mid: 50, paint: 50, scoring: 50, pass: 50, iq: 50,
  defense: 50, steal: 50, block: 50, rebound: 50, speed: 50, strength: 50,
  stamina: 50, clutch: 50, raw: { ppg: 6.1 },
});
const roster = (team) => [star(team), ...Array.from({ length: 11 }, (_, i) => role(team, `role${i}`))];

test("scenario starts as an employed GM of the weakest 1996 team, with knowledge to spend", () => {
  const s = createExecutiveScenario({ players: draftPlayers });
  assert.equal(s.teamId, SCENARIO_TEAM_ID);
  assert.equal(s.season, SCENARIO_SEASON);
  const realName = historicalSeason(1996).teams.find((t) => t.id === "VAN").name;
  assert.equal(s.business.teamName, realName);
  assert.equal(s.business.market, "small");
  assert.equal(s.business.arena.capacity, 19193, "recorded GM Place capacity");
  assert.equal(s.personal.cash, 2);
  assert.equal(s.personal.salary, 0.8);
  assert.equal(s.knowledge.knowledge, 3);
  assert.equal(s.knowledge.clues.length, 1, "the draft-board clue is seeded");
  assert.equal(s.exec.reputation, 45);
  assert.equal(s.draftPick, null);
  assert.equal(s.dismissed, false);
  validateExecutive(s);
});

test("scouting seam: C-shaped results, plain picks and unknown players", () => {
  const viaC = resolveScoutingDecision({ bref: "sleep01", confidence: 0.8, source: "scoutingIntel" }, draftPlayers);
  assert.equal(viaC.name, "Sleeper One");
  assert.equal(viaC.confidence, 0.8);
  assert.equal(viaC.source, "scoutingIntel");
  const direct = resolveScoutingDecision({ bref: "sleep01" }, draftPlayers);
  assert.equal(direct.source, "direct");
  const byId = resolveScoutingDecision({ playerId: "sleep01" }, draftPlayers);
  assert.equal(byId.bref, "sleep01");
  assert.throws(() => resolveScoutingDecision({ bref: "ghost01" }, draftPlayers), /unknown draft prospect/);
  assert.throws(() => resolveScoutingDecision({}, draftPlayers), /needs a bref/);
});

test("scouting decision records the causal event that decays related clues", () => {
  let s = createExecutiveScenario({ players: draftPlayers });
  const before = s.knowledge.ledger.length;
  s = makeScoutingDecision(s, { bref: "sleep01" }, draftPlayers);
  assert.equal(s.draftPick.bref, "sleep01");
  assert.equal(s.knowledge.ledger.length, before + 1);
  assert.equal(s.knowledge.ledger.at(-1).kind, "draft");
  assert.equal(s.knowledge.ledger.at(-1).subject, "sleep01");
  assert.equal(s.log.at(-1).type, "scouting-decision");
});

test("three seasons: money, achievements and stage move from real engine results", () => {
  let s = createExecutiveScenario({ players: draftPlayers });
  const players = roster("VAN");
  const r1 = advanceScenarioSeason(s, { wins: 20, losses: 62, playoffRound: null, champion: false }, { players, rng: () => 0.5 });
  assert.equal(r1.state.business.season, 1997);
  assert.equal(r1.settlement.season, 1996);
  assert.equal(r1.settlement.wins, 20);
  assert.ok(r1.state.personal.cash > 2, "salary lands even in a losing season");
  assert.equal(r1.state.exec.achievements.winningSeasons, 0);
  assert.equal(r1.boardReport.stage, "gm");
  assert.ok(r1.boardReport.lines[0].includes("1996"));
  const r2 = advanceScenarioSeason(r1.state, { wins: 45, losses: 37, playoffRound: "first-round", champion: false }, { players, rng: () => 0.5 });
  const r3 = advanceScenarioSeason(r2.state, { wins: 58, losses: 24, playoffRound: "finals", champion: true }, { players, rng: () => 0.5 });
  const summary = scenarioSummary(r3.state);
  assert.equal(summary.seasons, 3);
  assert.equal(summary.wins, 20 + 45 + 58);
  assert.equal(summary.championships, 1);
  assert.ok(summary.valuationNow > summary.valuationStart, "winning lifts the valuation");
  assert.equal(summary.stage, "president", "playoff run + board trust promotes the GM to president");
  assert.equal(r3.state.business.history.length, 3);
  validateExecutive(r3.state);
});

test("minority opportunity is not available at the start and opens when wealth is built", () => {
  const s = createExecutiveScenario({ players: draftPlayers });
  const opp = minorityOpportunity(s);
  assert.equal(opp.available, false);
  assert.ok(opp.missing.length > 0);
  const rich = {
    ...s,
    personal: { ...s.personal, cash: 100 },
    exec: { ...s.exec, reputation: 70, boardTrust: 70 },
  };
  const open = minorityOpportunity(rich);
  assert.equal(open.available, true);
  assert.ok(open.cost > 0);
});

test("business events: all eight types exist, apply with real costs, adapt to the inbox", () => {
  assert.equal(BUSINESS_EVENT_TYPES.length, 8);
  const ids = BUSINESS_EVENT_TYPES.map((e) => e.id);
  for (const id of ["sponsorship-offer", "ownership-dispute", "star-marketing", "financial-crisis", "arena-negotiation", "relocation-proposal", "acquisition-opportunity", "executive-employment"]) {
    assert.ok(ids.includes(id), `missing event ${id}`);
  }
  let s = createExecutiveScenario({ players: draftPlayers });
  // Sponsorship: sign the first offer.
  const signed = applyBusinessEvent(s, "sponsorship-offer", "sign");
  assert.equal(signed.state.business.sponsorships.length, 1);
  assert.ok(signed.effects.includes("$"));
  // Financial crisis: paying costs real operating budget.
  const paid = applyBusinessEvent(s, "financial-crisis", "pay");
  assert.equal(paid.state.business.operatingBudget, 25 - 8);
  const deferred = applyBusinessEvent(s, "financial-crisis", "defer");
  assert.ok(deferred.state.business.fanLoyalty < s.business.fanLoyalty);
  // Arena deal: half-price renovation.
  const arena = applyBusinessEvent(s, "arena-negotiation", "accept");
  assert.equal(arena.state.business.arena.level, 2);
  assert.equal(arena.state.business.operatingBudget, 25 - 6);
  // Inbox shape: title, body, choice labels only.
  const inbox = businessEventForInbox(businessEventById("financial-crisis"), "en");
  assert.equal(inbox.id, "financial-crisis");
  assert.ok(inbox.title.includes("Arena"));
  assert.deepEqual(inbox.choices.map((c) => c.id), ["pay", "defer"]);
  assert.throws(() => applyBusinessEvent(s, "nope", "pay"), /unknown business event/);
  assert.throws(() => applyBusinessEvent(s, "financial-crisis", "nope"), /unknown choice/);
  // Availability filters by state: the acquisition offer needs real wealth.
  assert.ok(!availableBusinessEvents(s).some((e) => e.id === "acquisition-opportunity"));
});

test("retirement settles the Empire Legacy; root attachment is additive", () => {
  let s = createExecutiveScenario({ players: draftPlayers });
  const players = roster("VAN");
  const r = advanceScenarioSeason(s, { wins: 60, losses: 22, playoffRound: "finals", champion: true }, { players, rng: () => 0.5 });
  const retired = retireExecutive(r.state, { years: 3 });
  assert.equal(retired.exec.retired, true);
  assert.ok(retired.exec.settled.score >= 0);
  assert.ok(retired.exec.settled.title.zh);
  const root = attachToCareerRoot({ story: { storyId: "x" } }, retired);
  assert.equal(executiveFromRoot(root), retired);
  assert.equal(executiveFromRoot({}), null);
  assert.equal(root.story.storyId, "x", "attachment never overwrites existing story fields");
});
