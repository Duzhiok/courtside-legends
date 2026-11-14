import test from "node:test";
import assert from "node:assert/strict";
import {
  CLUE_COST,
  MEDICAL_LEVELS,
  TRENDS,
  clueReliability,
  clueView,
  createClue,
  createKnowledgeState,
  draftBoardClue,
  injuryClueFor,
  injuryRisk,
  investInTrend,
  knowledgeFromRoot,
  linkMatched,
  prophecyAsClue,
  recordCausalEvent,
  reliabilityBand,
  revealClue,
  setMedicalLevel,
} from "../js/career/gm/futureKnowledge.js";

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
/** Fabricated 1997–99 classes: one real sleeper (55 -> 85), two decoys (55 -> 60). */
const players = [
  card("sleep01", 1997, 55, 8, "Sleeper One"), card("sleep01", 1998, 85, 22, "Sleeper One"), card("sleep01", 1999, 88, 26, "Sleeper One"),
  card("dec01", 1997, 55, 9, "Decoy One"), card("dec01", 1998, 60, 12, "Decoy One"), card("dec01", 1999, 60, 11, "Decoy One"),
  card("dec02", 1998, 55, 7, "Decoy Two"), card("dec02", 1999, 58, 10, "Decoy Two"), card("dec02", 2000, 60, 9, "Decoy Two"),
];

const clue = (over = {}) => createClue({
  id: "c1", type: "potential", subjectBref: "sleep01", season: 1997,
  summary: "记忆", baseReliability: 0.85,
  links: [{ kind: "draft", subject: "sleep01" }, { kind: "trade", subject: "VAN" }],
  ...over,
});

test("knowledge budget seeds from the career root and reveal costs one point", () => {
  assert.equal(knowledgeFromRoot({ story: { futureKnowledge: 3 } }), 3);
  assert.equal(knowledgeFromRoot({}), 0);
  let s = createKnowledgeState({ knowledge: 1, clues: [clue()] });
  s = revealClue(s, "c1");
  assert.equal(s.knowledge, 0);
  assert.equal(s.clues[0].revealed, true);
  assert.equal(revealClue(s, "c1"), s, "revealing twice is a no-op");
  const broke = createKnowledgeState({ knowledge: 0, clues: [clue()] });
  assert.throws(() => revealClue(broke, "c1"), /not enough future knowledge/);
  assert.throws(() => revealClue(s, "nope"), /unknown clue/);
});

test("causal events: dedupe, match by kind+subject, reliability decays per matched link only", () => {
  let s = createKnowledgeState({ ledger: [] });
  s = recordCausalEvent(s, { id: "e1", kind: "draft", subject: "sleep01", season: 1997, label: "drafted" });
  s = recordCausalEvent(s, { id: "e1", kind: "draft", subject: "sleep01", season: 1997, label: "drafted" });
  assert.equal(s.ledger.length, 1);
  assert.throws(() => recordCausalEvent(s, { kind: "draft" }), /needs id, kind, subject/);
  const c = clue();
  assert.equal(clueReliability(c, []), 0.85);
  assert.equal(clueReliability(c, s.ledger), 0.6, "0.85 x 0.7 rounds to 0.6");
  // An unrelated event (different subject, different kind) never touches this clue.
  const other = recordCausalEvent(createKnowledgeState({}), { id: "e2", kind: "trade", subject: "LAL", season: 1997, label: "x" });
  assert.equal(clueReliability(c, other.ledger), 0.85);
  assert.ok(linkMatched({ kind: "draft", subject: "sleep01" }, s.ledger));
  assert.ok(!linkMatched({ kind: "trade", subject: "sleep01" }, s.ledger));
  const both = recordCausalEvent(s, { id: "e3", kind: "trade", subject: "VAN", season: 1997, label: "y" });
  assert.equal(clueReliability(c, both.ledger), 0.42, "0.85 x 0.7 x 0.7 rounds to 0.42");
});

test("reliability is shown as a band, never a percent; hidden until revealed", () => {
  assert.equal(reliabilityBand(0.9).id, "clear");
  assert.equal(reliabilityBand(0.6).id, "fading");
  assert.equal(reliabilityBand(0.3).id, "unreliable");
  const hidden = clueView(clue(), []);
  assert.equal(hidden.revealed, false);
  assert.equal(hidden.summary, undefined);
  const shown = clueView({ ...clue(), revealed: true }, []);
  assert.equal(shown.revealed, true);
  assert.equal(shown.band.id, "clear");
  assert.equal("reliability" in shown && typeof shown.reliability === "number", true);
});

test("prophecyAsClue reuses the existing draft sleeper, it does not rebuild it", () => {
  assert.equal(prophecyAsClue({}), null);
  const root = { story: { prophecy: { bref: "sleep01", name: "Sleeper", rookieSeason: 1997, low: 72, high: 84, status: "pending" } } };
  const c = prophecyAsClue(root);
  assert.equal(c.type, "draft");
  assert.equal(c.subjectBref, "sleep01");
  assert.deepEqual(c.links, [{ kind: "draft", subject: "sleep01" }]);
});

test("draftBoardClue names all three board candidates and leaks no answer", () => {
  const c = draftBoardClue({ year: 1996, seed: 42, players });
  assert.ok(c);
  assert.equal(c.type, "draft");
  assert.equal(c.candidates.length, 3);
  const brefs = c.candidates.map((x) => x.bref).sort();
  assert.deepEqual(brefs, ["dec01", "dec02", "sleep01"]);
  // The sleeper is on the board but the clue never says which one it is.
  assert.ok(c.summary.includes("Sleeper One"));
  assert.ok(c.summary.includes("Decoy One"));
  assert.ok(!c.summary.includes("一定是") && !c.summary.includes("就是"));
  // Drafting any candidate decays the clue — each of them changes the board.
  const ledger = [{ id: "e1", kind: "draft", subject: "dec01", season: 1997 }];
  assert.ok(clueReliability(c, ledger) < clueReliability(c, []));
  const none = draftBoardClue({ year: 1996, seed: 42, players: [card("dec01", 1997, 55, 9, "Decoy One"), card("dec01", 1998, 60, 12, "Decoy One"), card("dec01", 1999, 60, 11, "Decoy One")] });
  assert.equal(none, null);
});

test("injury clues read real card evidence; risk is bounded and mitigation never zeroes it", () => {
  const player = { bref: "glass01", name: "Glass Body", intangibles: { injuryRisk: 80 } };
  const c = injuryClueFor(player, { season: 1996, careerSpan: 5 });
  assert.equal(c.type, "injury");
  assert.equal(c.baseRisk, 0.8);
  assert.ok(c.summary.includes("职业生涯很短"));
  assert.equal(injuryClueFor(null, { season: 1996 }), null);
  const base = injuryRisk({ baseRisk: 0.4, load: 0.5, medicalLevel: 0 });
  const loaded = injuryRisk({ baseRisk: 0.4, load: 1, medicalLevel: 0 });
  const treated = injuryRisk({ baseRisk: 0.4, load: 1, medicalLevel: 3 });
  assert.ok(loaded > base, "load raises risk");
  assert.ok(treated < loaded, "medical investment lowers risk");
  assert.ok(treated > 0, "risk never reaches zero");
  assert.ok(injuryRisk({ baseRisk: 0.9, load: 1, medicalLevel: 0 }) <= 0.9);
  assert.ok(injuryRisk({ baseRisk: 0.01, load: 0, medicalLevel: 3 }) >= 0.02);
  assert.equal(MEDICAL_LEVELS[3].cost, 6);
});

test("medical levels validate; trends record a focus and a causal event", () => {
  let s = createKnowledgeState({});
  s = setMedicalLevel(s, 2);
  assert.equal(s.medicalLevel, 2);
  assert.throws(() => setMedicalLevel(s, 5), /unknown medical level/);
  s = investInTrend(s, "three-point-revolution", 1996);
  assert.equal(s.trendFocus, "three-point-revolution");
  assert.equal(s.ledger.length, 1);
  assert.equal(s.ledger[0].kind, "trend");
  assert.throws(() => investInTrend(s, "flying-cars", 1996), /unknown trend/);
  assert.ok(TRENDS["three-point-revolution"]);
  assert.equal(CLUE_COST, 1);
});
