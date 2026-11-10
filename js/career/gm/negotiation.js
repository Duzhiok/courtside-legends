/**
 * Trade negotiation — AI GM strategy personas (workstream C).
 *
 * The same offer appeals differently to different GMs. Value is measured
 * in OVR-equivalent points above replacement (a 72-OVR player ≈ 12 points;
 * a future first-rounder ≈ 6, via the existing estimateDraftPickValue):
 *   - rebuild: loves picks and young players, cold on veterans.
 *   - contend: pays for win-now help, discounts future picks.
 *   - financial: holds a strict salary line on top of the value math.
 *   - star: overpays for high-profile players, shrugs at role players.
 *   - conservative: demands a margin on every deal and never loses one.
 *
 * AI GMs remember past behaviour: the relationship ledger records goodwill
 * per GM. Burn one in a lopsided deal and he demands more compensation
 * next time. Multi-round offers (max 3) end in accept, counter or a
 * broken-off negotiation.
 *
 * [Career 2.0 integration] The demand also reads workstream E's
 * negotiation standing: evaluateOffer / negotiateRound accept an optional
 * `standing` (-2..+2, the `.modifier` from
 * careerRelationships.negotiationStanding(account, partyId)) — a party you
 * kept faith with deals easier, one you burned charges more. The caller
 * reads the relationship layer; this module stays pure and takes only the
 * number, so no import cycle. The draft-gamble view does not pass it yet
 * (it has no account in hand) — the read lands when the gamble runs
 * inside a career context.
 *
 * Pure functions, seeded counters only — no Math.random, no sim.js. Trades
 * in the draft-gamble slice move pick ownership in scenario state; this
 * module evaluates, it does not execute the engine's executeTrade.
 */
import { overall } from "../../data/players.js";
import { estimateDraftPickValue } from "../../engine/draftPickValue.js";
import { playerPrice } from "../../data/intangibles.js";
import { clamp, hashSeed, seededStream } from "../../core/seededRandom.js";

/** Value above replacement: what one OVR-equivalent point is worth. */
export const REPLACEMENT_OVR = 60;
export const MAX_ROUNDS = 3;

/** E's standing shifts demand 5% per point, capped at ±10% — the same
 * 5%-per-point shape as goodwillModifier, so the two relationship
 * effects compose instead of one swamping the other. */
export const NEGOTIATION_STANDING_STEP = 0.05;
export const NEGOTIATION_STANDING_CAP = 2;

export function clampStanding(standing) {
  const s = Number(standing);
  if (!Number.isFinite(s)) return 0;
  return Math.max(-NEGOTIATION_STANDING_CAP, Math.min(NEGOTIATION_STANDING_CAP, s));
}

export function standingModifier(standing) {
  return 1 - clampStanding(standing) * NEGOTIATION_STANDING_STEP;
}

export const GM_PERSONAS = [
  {
    id: "rebuild",
    label: "重建型",
    labelEn: "Rebuilder",
    description: "喜欢选秀权和年轻球员，对老将没兴趣。",
    descriptionEn: "Loves picks and young players; cold on veterans.",
    pickMult: 1.3,
    youngMult: 1.25,
    veteranMult: 0.7,
    winNowMult: 1.0,
    starMult: 1.0,
    roleMult: 1.0,
    futurePickMult: 1.0,
    margin: 1.0,
    salaryRatio: 1.25,
  },
  {
    id: "contend",
    label: "争冠型",
    labelEn: "Contender",
    description: "愿意用未来资产换即战力，年轻人反而不值钱。",
    descriptionEn: "Trades future assets for win-now help; youth is discounted.",
    pickMult: 1.0,
    youngMult: 0.9,
    veteranMult: 1.0,
    winNowMult: 1.3,
    starMult: 1.0,
    roleMult: 1.0,
    futurePickMult: 0.7,
    margin: 1.0,
    salaryRatio: 1.25,
  },
  {
    id: "financial",
    label: "财务型",
    labelEn: "Cap Manager",
    description: "优先控制合同和薪资，进来的薪水不能超过出去的 1.1 倍。",
    descriptionEn: "Controls contracts and salary; incoming pay must stay within 1.1x outgoing.",
    pickMult: 1.0,
    youngMult: 1.0,
    veteranMult: 1.0,
    winNowMult: 1.0,
    starMult: 1.0,
    roleMult: 1.0,
    futurePickMult: 1.0,
    margin: 1.0,
    salaryRatio: 1.1,
  },
  {
    id: "star",
    label: "明星型",
    labelEn: "Star Chaser",
    description: "偏爱高知名度球员，角色球员入不了他的眼。",
    descriptionEn: "Prefers high-profile players; role players don't move him.",
    pickMult: 0.9,
    youngMult: 1.0,
    veteranMult: 1.0,
    winNowMult: 1.0,
    starMult: 1.4,
    roleMult: 0.8,
    futurePickMult: 1.0,
    margin: 1.0,
    salaryRatio: 1.25,
  },
  {
    id: "conservative",
    label: "保守型",
    labelEn: "Conservative",
    description: "不愿承担高风险交易，每笔交易都要赚到 15% 的余量。",
    descriptionEn: "Avoids high-risk trades; every deal must clear a 15% margin.",
    pickMult: 1.0,
    youngMult: 1.0,
    veteranMult: 1.0,
    winNowMult: 1.0,
    starMult: 1.0,
    roleMult: 1.0,
    futurePickMult: 1.0,
    margin: 1.15,
    salaryRatio: 1.25,
  },
];

export function personaById(id) {
  return GM_PERSONAS.find((p) => p.id === id) || null;
}

/** Deterministic persona per team for a scenario (seeded, cycles the five). */
export function assignPersonas(teamIds, seed = "draft-gamble-1996") {
  const rng = seededStream(hashSeed(`${seed}|personas`));
  const order = [...GM_PERSONAS];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const assigned = {};
  (teamIds || []).forEach((teamId, index) => {
    assigned[teamId] = order[index % order.length].id;
  });
  return assigned;
}

function salaryOf(player) {
  if (player?.salary != null && Number.isFinite(+player.salary)) return Math.max(25, Math.round(+player.salary));
  return playerPrice(player);
}

function ageOf(player) {
  return Number(player?.age) || 25;
}

/** One player's trade value in OVR-equivalent points, persona-shaped. */
export function valueOfPlayer(player, persona) {
  const ovr = overall(player);
  let points = Math.max(0, ovr - REPLACEMENT_OVR);
  const age = ageOf(player);
  if (age <= 23) points *= persona.youngMult;
  else if (age >= 30) points *= persona.veteranMult;
  if (ovr >= 75) points *= persona.winNowMult;
  if (ovr >= 80) points *= persona.starMult;
  else if (ovr < 70) points *= persona.roleMult;
  return Math.round(points * 10) / 10;
}

/** One pick's trade value, persona-shaped (reuses draftPickValue). */
export function valueOfPick(pick, persona, currentYear = 1996) {
  const base = estimateDraftPickValue(pick, { currentYear }).ovrEquivalent;
  let mult = persona.pickMult;
  if (Number(pick?.year) > Number(currentYear)) mult *= persona.futurePickMult;
  // A higher slot is worth more: +3% per slot above #15 (the model's
  // reference slot). The view passes `slot` for 1996 picks; future picks
  // carry no slot and keep the flat model.
  if (Number.isFinite(Number(pick?.slot))) {
    mult *= 1 + Math.max(0, 15 - Number(pick.slot)) * 0.03;
  }
  return Math.round(base * mult * 10) / 10;
}

/** Value of a whole side: { players: [cards], picks: [{year, round, protection?}] }. */
export function valueOfSide(side, persona, currentYear = 1996) {
  const players = (side?.players || []).map((p) => ({ player: p, value: valueOfPlayer(p, persona) }));
  const picks = (side?.picks || []).map((p) => ({ pick: p, value: valueOfPick(p, persona, currentYear) }));
  const total = Math.round(
    (players.reduce((s, x) => s + x.value, 0) + picks.reduce((s, x) => s + x.value, 0)) * 10,
  ) / 10;
  return { players, picks, total };
}

function salaryOfSide(side) {
  return (side?.players || []).reduce((sum, p) => sum + salaryOf(p), 0);
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Evaluate one offer against one AI GM. `give` is what the player sends,
 * `ask` is what the player wants. Returns accept / counter / reject with
 * an explainable reason and, on a counter, the exact sweetener demanded.
 * `ledger` is the relationship ledger ({ [gmId]: { goodwill } }); a burned
 * GM demands more — see goodwillModifier.
 */
export function evaluateOffer({ give, ask, persona, ledger = {}, gmId = null, standing = 0, currentYear = 1996, seed = "draft-gamble-1996", lang = "zh" } = {}) {
  const en = lang === "en";
  const valueIn = valueOfSide(give, persona, currentYear);
  const valueOut = valueOfSide(ask, persona, currentYear);
  const standingValue = clampStanding(standing);
  const standingMult = standingModifier(standingValue);
  const demand = round1(valueOut.total * persona.margin * goodwillModifier(ledger, gmId) * standingMult);
  const salaryIn = salaryOfSide(give);
  const salaryOut = salaryOfSide(ask);
  const salaryOk = salaryIn <= salaryOut * persona.salaryRatio + 40 || salaryOut === 0;

  if (!salaryOk) {
    return {
      verdict: "reject",
      reason: en
        ? `Salary doesn't work for them: they'd take on ${salaryIn} for ${salaryOut} outgoing (their line is ${persona.salaryRatio}x).`
        : `薪资对不上：对方要接手 ${salaryIn} 薪水，只送出 ${salaryOut}（他的底线是 ${persona.salaryRatio} 倍）。`,
      valueIn: valueIn.total,
      valueOut: valueOut.total,
      demand,
      standing: standingValue,
      standingModifier: standingMult,
      counter: null,
    };
  }
  if (valueIn.total >= demand) {
    const lopsided = valueIn.total < valueOut.total * 0.7;
    return {
      verdict: "accept",
      reason: en
        ? `They take the deal: ${valueIn.total} of value in for ${valueOut.total} out.`
        : `对方接受：你送出价值 ${valueIn.total}，换回价值 ${valueOut.total}。`,
      valueIn: valueIn.total,
      valueOut: valueOut.total,
      demand,
      standing: standingValue,
      standingModifier: standingMult,
      counter: null,
      lopsided,
    };
  }
  // Close but short: counter with one sweetener, chosen by persona priority.
  if (valueIn.total >= demand * 0.75) {
    const sweetener = counterSweetener({ give, ask, persona, currentYear, seed });
    return {
      verdict: "counter",
      reason: en
        ? `Close, but not enough: ${valueIn.total} in against ${demand} demanded. They want ${sweetener.labelEn}.`
        : `差一点：你只送出价值 ${valueIn.total}，对方要 ${demand}。对方要求${sweetener.label}。`,
      valueIn: valueIn.total,
      valueOut: valueOut.total,
      demand,
      standing: standingValue,
      standingModifier: standingMult,
      counter: sweetener,
    };
  }
  return {
    verdict: "reject",
    reason: en
      ? `Not close: ${valueIn.total} in against ${demand} demanded. They walk away.`
      : `差距太大：你只送出价值 ${valueIn.total}，对方要 ${demand}。对方直接拒绝。`,
    valueIn: valueIn.total,
    valueOut: valueOut.total,
    demand,
    standing: standingValue,
    standingModifier: standingMult,
    counter: null,
  };
}

/** The one extra asset a countering GM demands (deterministic by persona). */
export function counterSweetener({ give, ask, persona, currentYear = 1996, seed = "draft-gamble-1996" } = {}) {
  const rng = seededStream(hashSeed(`${seed}|counter|${persona.id}`));
  const givePicks = (give?.picks || []).map((p) => Number(p?.round) === 1 ? 1 : 2);
  const bestPickRound = givePicks.length ? Math.min(...givePicks) : 1;
  // The counter always asks for one more asset than the original offer had:
  // a better pick for rebuilders, a win-now player for contenders, salary
  // relief for the financial type, the best player for star chasers, and
  // plain extra value for conservatives.
  if (persona.id === "rebuild") {
    return {
      kind: "pick",
      pick: { year: currentYear + 1, round: bestPickRound },
      label: `再加一个 ${currentYear + 1} 年首轮签`,
      labelEn: `one more ${currentYear + 1} first-rounder`,
    };
  }
  if (persona.id === "contend") {
    return {
      kind: "player",
      role: "win-now",
      label: "再加一名即战力球员（OVR 70+）",
      labelEn: "one more win-now player (OVR 70+)",
    };
  }
  if (persona.id === "financial") {
    return {
      kind: "salary",
      label: "再吃下一份到期合同，帮对方腾薪资空间",
      labelEn: "take on one more expiring contract to clear their cap",
    };
  }
  if (persona.id === "star") {
    return {
      kind: "player",
      role: "best",
      label: "再加你队里最好的那名球员",
      labelEn: "your best player on top",
    };
  }
  const extra = 1 + Math.floor(rng() * 2);
  return {
    kind: "value",
    points: extra,
    label: `再加价值约 ${extra} 点的筹码`,
    labelEn: `about ${extra} more points of value`,
  };
}

// ---------------------------------------------------------------------------
// Multi-round negotiation state machine + relationship ledger
// ---------------------------------------------------------------------------

/** A fresh negotiation with one AI GM. */
export function startNegotiation({ gmId, personaId, seed = "draft-gamble-1996" } = {}) {
  return { gmId, personaId, seed, rounds: 0, status: "open", history: [], lastCounter: null };
}

/**
 * Advance one round. `action` is { type: "offer", give, ask } or
 * { type: "accept-counter" } or { type: "walk-away" }. Returns the new
 * state; the caller applies the accepted terms (pick ownership moves in
 * scenario state) and records the outcome in the ledger.
 */
export function negotiateRound(state, action, { ledger = {}, standing = 0, currentYear = 1996, lang = "zh" } = {}) {
  if (!state || state.status !== "open") return state;
  const persona = personaById(state.personaId);
  if (!persona) throw new Error(`unknown persona "${state.personaId}"`);
  if (action?.type === "walk-away") {
    return { ...state, status: "closed", history: [...state.history, { type: "walk-away" }] };
  }
  if (action?.type === "accept-counter" && state.lastCounter) {
    return {
      ...state,
      status: "accepted",
      history: [...state.history, { type: "accept-counter", counter: state.lastCounter }],
    };
  }
  if (action?.type !== "offer") throw new Error(`unknown negotiation action "${action?.type}"`);
  const result = evaluateOffer({
    give: action.give,
    ask: action.ask,
    persona,
    ledger,
    gmId: state.gmId,
    standing,
    currentYear,
    seed: state.seed,
    lang,
  });
  const rounds = state.rounds + 1;
  const history = [...state.history, { type: "offer", give: action.give, ask: action.ask, result }];
  if (result.verdict === "accept") {
    return { ...state, rounds, status: "accepted", history, lastCounter: null, lastResult: result };
  }
  if (result.verdict === "counter" && rounds < MAX_ROUNDS) {
    return { ...state, rounds, status: "open", history, lastCounter: result.counter, lastResult: result };
  }
  return { ...state, rounds, status: "broke", history, lastCounter: null, lastResult: result };
}

/** How much more a GM demands, from the ledger: -goodwill adds 5% per point. */
export function goodwillModifier(ledger, gmId) {
  if (!gmId) return 1;
  const goodwill = Number(ledger?.[gmId]?.goodwill) || 0;
  return 1 + Math.max(0, -goodwill) * 0.05;
}

/**
 * Record an outcome in the ledger. A GM you burned in a lopsided deal
 * remembers it (goodwill -2); a broke-off negotiation costs -2; a plain
 * rejection costs -1; a fair accepted deal or a walk-away costs nothing.
 * Goodwill is clamped to [-10, 10].
 */
export function recordNegotiationOutcome(ledger, gmId, outcome) {
  const next = { ...(ledger || {}) };
  const entry = { ...(next[gmId] || { goodwill: 0, deals: [] }) };
  let delta = 0;
  if (outcome?.result === "accepted-lopsided") delta = -2;
  else if (outcome?.result === "broke") delta = -2;
  else if (outcome?.result === "rejected") delta = -1;
  entry.goodwill = clamp((entry.goodwill || 0) + delta, -10, 10);
  entry.deals = [...(entry.deals || []), { ...outcome, goodwillAfter: entry.goodwill }];
  next[gmId] = entry;
  return next;
}
