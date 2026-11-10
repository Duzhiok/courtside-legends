import test from "node:test";
import assert from "node:assert/strict";
import { overall } from "../js/data/players.js";
import {
  GM_PERSONAS,
  MAX_ROUNDS,
  assignPersonas,
  counterSweetener,
  evaluateOffer,
  goodwillModifier,
  negotiateRound,
  personaById,
  recordNegotiationOutcome,
  startNegotiation,
  valueOfPick,
  valueOfPlayer,
  valueOfSide,
} from "../js/career/gm/negotiation.js";

const CURRENT_YEAR = 1996;

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

test("value scale: a 72-OVR player is ~12 points, a future first ~4.5", () => {
  assert.equal(overall(flatCard(72)), 72);
  const rebuild = personaById("rebuild");
  assert.equal(valueOfPlayer(flatCard(72), rebuild), 12);
  const pick = valueOfPick(first(1997), rebuild, CURRENT_YEAR);
  assert.ok(pick >= 4 && pick <= 6.5, `first-rounder ≈ 4.5, got ${pick}`);
  const second = valueOfPick({ year: 1997, round: 2 }, rebuild, CURRENT_YEAR);
  assert.ok(second < pick, "a second-rounder is worth less than a first");
});

test("the same offer: a rebuilder accepts, a contender rejects", () => {
  // Give three future firsts, ask for a 78-OVR 30-year-old veteran.
  const give = { players: [], picks: [first(1997), first(1998), first(1999)] };
  const ask = { players: [flatCard(78, 30)], picks: [] };
  const rebuild = evaluateOffer({ give, ask, persona: personaById("rebuild"), currentYear: CURRENT_YEAR });
  const contend = evaluateOffer({ give, ask, persona: personaById("contend"), currentYear: CURRENT_YEAR });
  assert.equal(rebuild.verdict, "accept", JSON.stringify(rebuild));
  assert.equal(contend.verdict, "reject", JSON.stringify(contend));
});

test("a close offer draws a counter with one extra asset", () => {
  // Contender, ask a 72-OVR player (12 points), give three firsts (10.5).
  const give = { players: [], picks: [first(1996), first(1997), first(1998)] };
  const ask = { players: [flatCard(72, 26)], picks: [] };
  const result = evaluateOffer({ give, ask, persona: personaById("contend"), currentYear: CURRENT_YEAR });
  assert.equal(result.verdict, "counter");
  assert.ok(result.counter, "a counter names the sweetener");
  assert.equal(typeof result.counter.label, "string");
  assert.equal(typeof result.counter.labelEn, "string");
  // The counter is deterministic for the persona.
  const again = counterSweetener({ give, ask, persona: personaById("contend"), currentYear: CURRENT_YEAR });
  assert.deepEqual(result.counter, again);
});

test("the financial GM rejects on salary even when value is fair", () => {
  const give = { players: [flatCard(72, 26, 200)], picks: [] };
  const ask = { players: [flatCard(72, 26, 50)], picks: [] };
  const result = evaluateOffer({ give, ask, persona: personaById("financial"), currentYear: CURRENT_YEAR });
  assert.equal(result.verdict, "reject");
  assert.ok(/薪资|Salary/.test(result.reason));
});

test("the star chaser overpays for a star and shrugs at role players", () => {
  const star = personaById("star");
  assert.ok(valueOfPlayer(flatCard(84, 27), star) > valueOfPlayer(flatCard(84, 27), personaById("rebuild")));
  assert.ok(valueOfPlayer(flatCard(65, 27), star) < valueOfPlayer(flatCard(65, 27), personaById("rebuild")));
});

test("the conservative GM demands a 15% margin", () => {
  const give = { players: [flatCard(72, 26)], picks: [] };
  const ask = { players: [flatCard(72, 26)], picks: [] };
  const plain = evaluateOffer({ give, ask, persona: personaById("rebuild"), currentYear: CURRENT_YEAR });
  const strict = evaluateOffer({ give, ask, persona: personaById("conservative"), currentYear: CURRENT_YEAR });
  assert.equal(plain.verdict, "accept");
  assert.notEqual(strict.verdict, "accept");
  assert.ok(strict.demand > plain.demand);
});

test("evaluateOffer is deterministic", () => {
  const args = {
    give: { players: [flatCard(70, 24)], picks: [first(1997)] },
    ask: { players: [], picks: [first(1996)] },
    persona: personaById("rebuild"),
    currentYear: CURRENT_YEAR,
  };
  assert.deepEqual(evaluateOffer(args), evaluateOffer(args));
});

test("negotiation rounds: three counters break the talks, walk-away closes them", () => {
  const give = { players: [], picks: [first(1996), first(1997), first(1998)] };
  const ask = { players: [flatCard(72, 26)], picks: [] };
  let state = startNegotiation({ gmId: "PHI", personaId: "contend" });
  assert.equal(state.status, "open");
  state = negotiateRound(state, { type: "offer", give, ask }, { currentYear: CURRENT_YEAR });
  assert.equal(state.status, "open");
  assert.equal(state.rounds, 1);
  assert.ok(state.lastCounter);
  state = negotiateRound(state, { type: "offer", give, ask }, { currentYear: CURRENT_YEAR });
  assert.equal(state.rounds, 2);
  state = negotiateRound(state, { type: "offer", give, ask }, { currentYear: CURRENT_YEAR });
  assert.equal(state.status, "broke");
  assert.equal(state.rounds, 3);
  assert.equal(MAX_ROUNDS, 3);
  // A fresh negotiation can be closed by walking away.
  const walked = negotiateRound(startNegotiation({ gmId: "PHI", personaId: "contend" }), { type: "walk-away" });
  assert.equal(walked.status, "closed");
  // Accepting the counter closes the deal.
  let accepted = startNegotiation({ gmId: "PHI", personaId: "contend" });
  accepted = negotiateRound(accepted, { type: "offer", give, ask }, { currentYear: CURRENT_YEAR });
  assert.equal(accepted.status, "open");
  accepted = negotiateRound(accepted, { type: "accept-counter" }, { currentYear: CURRENT_YEAR });
  assert.equal(accepted.status, "accepted");
  assert.throws(() => negotiateRound({ gmId: "PHI", personaId: "nope", status: "open" }, { type: "offer", give, ask }));
});

test("the ledger: a burned GM demands more next time", () => {
  const give = { players: [], picks: [first(1997), first(1998), first(1999)] };
  const ask = { players: [flatCard(78, 30)], picks: [] };
  const persona = personaById("rebuild");
  const before = evaluateOffer({ give, ask, persona, currentYear: CURRENT_YEAR });
  assert.equal(before.verdict, "accept");
  let ledger = recordNegotiationOutcome({}, "PHI", { result: "accepted-lopsided", valueGap: 9 });
  assert.equal(ledger.PHI.goodwill, -2);
  assert.equal(goodwillModifier(ledger, "PHI"), 1.1);
  const after = evaluateOffer({ give, ask, persona, ledger, gmId: "PHI", currentYear: CURRENT_YEAR });
  assert.ok(after.demand > before.demand, `demand rose ${before.demand} → ${after.demand}`);
  // A fair deal and a walk-away cost nothing; a broke-off costs -2.
  ledger = recordNegotiationOutcome(ledger, "PHI", { result: "accepted" });
  assert.equal(ledger.PHI.goodwill, -2);
  ledger = recordNegotiationOutcome(ledger, "PHI", { result: "broke" });
  assert.equal(ledger.PHI.goodwill, -4);
  ledger = recordNegotiationOutcome(ledger, "PHI", { result: "rejected" });
  assert.equal(ledger.PHI.goodwill, -5);
  assert.equal(goodwillModifier({}, "PHI"), 1);
  assert.equal(goodwillModifier(ledger, "UNKNOWN"), 1);
});

test("assignPersonas: deterministic, all five personas in play", () => {
  const teams = ["PHI", "TOR", "VAN", "MIL", "MIN", "BOS", "LAC", "NJN", "DAL", "IND", "GSW", "CLE", "CHH"];
  const a = assignPersonas(teams);
  const b = assignPersonas(teams);
  assert.deepEqual(a, b);
  assert.equal(new Set(Object.values(a)).size, 5);
  assert.equal(GM_PERSONAS.length, 5);
  for (const persona of GM_PERSONAS) {
    assert.ok(personaById(persona.id));
    assert.equal(typeof persona.label, "string");
    assert.equal(typeof persona.description, "string");
  }
});

test("a higher slot is worth more than a lower one", () => {
  const persona = personaById("rebuild");
  const top = valueOfPick({ year: 1996, round: 1, slot: 5 }, persona, CURRENT_YEAR);
  const mid = valueOfPick({ year: 1996, round: 1, slot: 13 }, persona, CURRENT_YEAR);
  const flat = valueOfPick({ year: 1996, round: 1 }, persona, CURRENT_YEAR);
  assert.ok(top > mid, `#5 (${top}) must beat #13 (${mid})`);
  assert.ok(mid >= flat, "a slotted pick is worth at least the flat model");
});

test("valueOfSide breaks a side into priced pieces", () => {
  const side = valueOfSide(
    { players: [flatCard(72, 26)], picks: [first(1997)] },
    personaById("rebuild"),
    CURRENT_YEAR,
  );
  assert.equal(side.players.length, 1);
  assert.equal(side.picks.length, 1);
  assert.equal(side.total, side.players[0].value + side.picks[0].value);
});
