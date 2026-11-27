/**
 * Dynamic In-Match Events MVP — engine (first vertical slice, 2026-11-14 spec).
 *
 * Three families, decided at real gameplay boundaries (domainEvents.js POSSESSION_START /
 * PERIOD_START), shown through Lychee's js/ui/matchEventCards.js contract:
 *   takeover     — a hot star on your floor asks for the ball
 *   weakness     — an opponent defender on the floor is spent or in foul trouble
 *   foulTrouble  — one of your top-5 players reaches the foul line for this quarter
 *
 * Rules this module keeps:
 * - GameSim stays authoritative. A choice only maps to existing GameSim calls
 *   (setOffenseFocus / setFocusPlay / substitute); there are no shot, win-rate or
 *   rating bonuses and no second possession simulator.
 * - Its own dice. Selection uses seededStream(hashSeed(seed|boundary|eventId)) and never
 *   calls rand(): GameSim's RNG sequence is untouched, so a game where every event is
 *   ignored plays out exactly like a game without events.
 * - Explicit ids. An event id names its family, player and occasion; an id fires at most
 *   once per game, and the fired list travels with the save, so reload never repeats it.
 * - Ignore is always a real choice and is the default; auto-resolve (fast sim) uses the
 *   default, so fast sim never changes a game either.
 *
 * Pure: no DOM, no Math.random, no sim import. `applyMatchEffect` takes the sim instance.
 */
import { hashSeed, seededStream } from "../core/seededRandom.js";
import { CRITICAL_FAMILIES, CRITICAL_TUNING, buildCritical, criticalCandidates, inCrunchWindow } from "./criticalMoments.js";

export const MATCH_EVENT_STATE_VERSION = 1;

export const MATCH_EVENT_TUNING = Object.freeze({
  maxPerGame: 4,
  /** Possession boundaries before the first event can fire (let the game settle). */
  warmupBoundaries: 12,
  /** Boundaries between two fired events (a game has ~190-210, so events spread across quarters). */
  minGapBoundaries: 36,
  /** Chance an eligible candidate fires at one boundary (seeded per boundary + id). */
  chance: Object.freeze({ foulTrouble: 0.9, weakness: 0.3, takeover: 0.25 }),
  /** Snapshot `hot` runs -3..3; 2 is the engine's "hot" label. */
  takeoverHot: 2,
  /**
   * CPU rotations keep defenders fresh: measured over 24 seeded games, the two weakest opponent
   * defenders on the floor reach fatigue 55 in ~2% of possessions (the engine's soft tax starts near
   * 60) and 3 fouls in ~1.6%; 75 / 4 fouls never happened.
   */
  weaknessFatigue: 55,
  weaknessFouls: 3,
  /** Fouls that count as "trouble" by quarter; Q4 and overtime use 5. */
  foulLimit: Object.freeze({ 1: 2, 2: 3, 3: 4 }),
  lateFoulLimit: 5,
  keyPlayers: 5,
  /** Boundaries after a decision before its outcome is measured (or period/match end). */
  outcomeWindow: 8,
  historyCap: 20,
  firedCap: 60,
  /** The choice auto-resolve uses, per family. Must be a no-op choice to keep fast sim neutral. */
  defaults: Object.freeze({ takeover: "ignore", weakness: "ignore", foulTrouble: "keep", clutchOffense: "ignore", clutchDefense: "ignore" }),
});

export const MATCH_EVENT_BOUNDARIES = Object.freeze(["POSSESSION_START", "PERIOD_START"]);
// Critical moments (criticalMoments.js) come first: a last possession outranks any routine event.
const FAMILY_ORDER = [...CRITICAL_FAMILIES, "foulTrouble", "weakness", "takeover"];
const FAMILIES = new Set(FAMILY_ORDER);
const EFFECT_KINDS = new Set(["setOffenseFocus", "setFocusPlay", "substitute", "submitDecision", "setDefenseScheme"]);
const isCritical = (id) => CRITICAL_FAMILIES.some((f) => String(id).startsWith(`${f}:`));

const pair = (zh, en) => ({ zh, en });

// ---------------------------------------------------------------- state

export function createMatchEventState({ seed = "0" } = {}) {
  return {
    v: MATCH_EVENT_STATE_VERSION,
    seed: String(seed),
    boundaries: 0,
    lastFiredAt: null,
    fired: [],
    history: [],
    pending: null,
  };
}

const clone = (value) => (value == null ? value : JSON.parse(JSON.stringify(value)));

/** Plain JSON for the save payload (pending decision included, so reload re-asks instead of dropping it). */
export function exportMatchEventState(state) {
  if (!state) return null;
  return clone({
    ...state,
    fired: state.fired.slice(-MATCH_EVENT_TUNING.firedCap),
    history: state.history.slice(-MATCH_EVENT_TUNING.historyCap),
  });
}

function validPending(p) {
  return (
    p &&
    typeof p === "object" &&
    typeof p.id === "string" &&
    FAMILIES.has(p.family) &&
    Array.isArray(p.choices) &&
    p.choices.length > 0 &&
    p.choices.every((c) => c && typeof c.id === "string")
  );
}

function validEffect(e) {
  return e && typeof e === "object" && EFFECT_KINDS.has(e.kind);
}

/**
 * Read a saved state defensively (it is an optional, additive save field: older saves have none,
 * hand-edited ones may be broken). Anything unusable falls back to a fresh state with `seed`.
 */
export function restoreMatchEventState(raw, { seed = "0" } = {}) {
  if (!raw || typeof raw !== "object" || raw.v !== MATCH_EVENT_STATE_VERSION) return createMatchEventState({ seed });
  const fresh = createMatchEventState({ seed: typeof raw.seed === "string" && raw.seed ? raw.seed : seed });
  const int = (n) => (Number.isInteger(n) && n >= 0 ? n : 0);
  fresh.boundaries = int(raw.boundaries);
  fresh.lastFiredAt = Number.isInteger(raw.lastFiredAt) && raw.lastFiredAt >= 0 ? raw.lastFiredAt : null;
  fresh.fired = Array.isArray(raw.fired)
    ? raw.fired.filter((id) => typeof id === "string").slice(-MATCH_EVENT_TUNING.firedCap)
    : [];
  fresh.history = Array.isArray(raw.history)
    ? raw.history
        .filter((h) => h && typeof h === "object" && typeof h.id === "string" && FAMILIES.has(h.family))
        .slice(-MATCH_EVENT_TUNING.historyCap)
        .map(clone)
    : [];
  if (validPending(raw.pending)) {
    const pending = clone(raw.pending);
    const effects = {};
    for (const [choiceId, list] of Object.entries(pending.effects || {})) {
      effects[choiceId] = Array.isArray(list) ? list.filter(validEffect) : [];
    }
    pending.effects = effects;
    fresh.pending = pending;
    if (!fresh.fired.includes(pending.id)) fresh.fired.push(pending.id);
  }
  return fresh;
}

// ---------------------------------------------------------------- snapshot helpers

const yours = (snap) => snap?.[snap?.youSide === "away" ? "away" : "home"] || null;
const theirs = (snap) => snap?.[snap?.youSide === "away" ? "home" : "away"] || null;
const byOverall = (a, b) => (b.overall || 0) - (a.overall || 0) || String(a.id).localeCompare(String(b.id));
const healthy = (p) => !(p?.injuredGames > 0);

function periodLabel(q) {
  return q > 4 ? `OT${q - 4}` : `Q${q}`;
}

export function matchClockLabel(snap) {
  const q = Number(snap?.quarter) || 1;
  const sec = Math.max(0, Math.round(Number(snap?.clock) || 0));
  const mm = String(Math.floor(sec / 60)).padStart(2, "0");
  const ss = String(sec % 60).padStart(2, "0");
  return `${periodLabel(q)} · ${mm}:${ss}`;
}

function scoreLine(snap) {
  return {
    home: snap?.score?.home ?? 0,
    away: snap?.score?.away ?? 0,
    homeName: snap?.home?.name || "",
    awayName: snap?.away?.name || "",
  };
}

export function foulLimitFor(quarter, tuning = MATCH_EVENT_TUNING) {
  const q = Number(quarter) || 1;
  return q >= 4 ? tuning.lateFoulLimit : tuning.foulLimit[q] ?? tuning.lateFoulLimit;
}

const isBig = (p) => /C|PF/.test(String(p?.playPos || p?.pos || ""));
const posGroup = (p) => {
  const pos = String(p?.playPos || p?.pos || "");
  if (/C/.test(pos)) return "C";
  if (/F/.test(pos)) return "F";
  return "G";
};

// ---------------------------------------------------------------- eligibility (pure)

/** A hot top-2 star on your floor who is not already the ball-handler. */
export function takeoverCandidates(snap, tuning = MATCH_EVENT_TUNING) {
  const team = yours(snap);
  if (!team?.onCourt?.length) return [];
  const stars = new Set([...(team.roster || team.onCourt)].filter(healthy).sort(byOverall).slice(0, 2).map((p) => p.id));
  if (snap.focusPlay?.id === "iso_star") return [];
  const half = snap.quarter <= 2 ? 1 : snap.quarter <= 4 ? 2 : "ot";
  return team.onCourt
    .filter((p) => stars.has(p.id) && (p.hot || 0) >= tuning.takeoverHot && snap.offenseFocusId !== p.id)
    .map((p) => ({ family: "takeover", id: `takeover:${p.id}:h${half}`, player: p }));
}

/** An opponent defender on the floor (one of their two weakest) who is spent or in foul trouble. */
export function weaknessCandidates(snap, tuning = MATCH_EVENT_TUNING) {
  const team = theirs(snap);
  if (!team?.onCourt?.length) return [];
  if (snap.focusPlay?.id === "hunt_mismatch" || snap.focusPlay?.id === "post_up") return [];
  const weakest = [...team.onCourt].sort((a, b) => (a.defense || 0) - (b.defense || 0) || String(a.id).localeCompare(String(b.id))).slice(0, 2);
  return weakest
    .filter((p) => (p.fatigue || 0) >= tuning.weaknessFatigue || (p.stats?.pf || 0) >= tuning.weaknessFouls)
    .map((p) => ({
      family: "weakness",
      id: `weakness:${p.id}:q${snap.quarter}`,
      player: p,
      reason: (p.stats?.pf || 0) >= tuning.weaknessFouls ? "fouls" : "fatigue",
    }));
}

/** One of your top-5 players on the floor at or past this quarter's foul line. One event per foul count. */
export function foulTroubleCandidates(snap, tuning = MATCH_EVENT_TUNING) {
  const team = yours(snap);
  if (!team?.onCourt?.length) return [];
  const key = new Set([...(team.roster || team.onCourt)].filter(healthy).sort(byOverall).slice(0, tuning.keyPlayers).map((p) => p.id));
  const limit = foulLimitFor(snap.quarter, tuning);
  return team.onCourt
    .filter((p) => key.has(p.id) && (p.stats?.pf || 0) >= limit)
    .map((p) => ({ family: "foulTrouble", id: `foulTrouble:${p.id}:pf${p.stats.pf}`, player: p, limit }));
}

export function matchEventCandidates(snap, tuning = MATCH_EVENT_TUNING) {
  return [...foulTroubleCandidates(snap, tuning), ...weaknessCandidates(snap, tuning), ...takeoverCandidates(snap, tuning)].sort(
    (a, b) => FAMILY_ORDER.indexOf(a.family) - FAMILY_ORDER.indexOf(b.family) || a.id.localeCompare(b.id),
  );
}

// ---------------------------------------------------------------- event objects

function playerLine(p) {
  return { name: p.name, pos: p.playPos || p.pos || "", fouls: p.stats?.pf ?? undefined };
}

function bestReplacement(snap, out) {
  const team = yours(snap);
  const bench = (team?.bench || []).filter(healthy);
  if (!bench.length) return null;
  const same = bench.filter((p) => posGroup(p) === posGroup(out)).sort(byOverall);
  return same[0] || [...bench].sort(byOverall)[0];
}

function buildTakeover(c) {
  const p = c.player;
  return {
    title: pair(`${p.name} 要球`, `${p.name} wants the ball`),
    body: pair(
      `${p.name} 手感正热，示意把球交给他。交给他会把他设为持球发起人，直到你再改。`,
      `${p.name} is hot and is asking for the ball. Running it through him makes him the ball-handler until you change it.`,
    ),
    choices: [
      { id: "feed", label: pair("交给他", "Run it through him"), hint: pair("设为持球发起人", "He becomes the initiator") },
      { id: "ignore", label: pair("按体系打", "Stick to the system"), hint: pair("什么都不变", "Nothing changes") },
    ],
    effects: { feed: [{ kind: "setOffenseFocus", playerId: p.id }], ignore: [] },
  };
}

function buildWeakness(c) {
  const p = c.player;
  const why = c.reason === "fouls"
    ? pair(`已经 ${p.stats.pf} 次犯规`, `on ${p.stats.pf} fouls`)
    : pair("体能在下滑", "tiring");
  const big = isBig(p);
  return {
    title: pair(`对手 ${p.name} 防守露破绽`, `${p.name} is a weak spot on defense`),
    body: pair(
      `对方的 ${p.name}（${p.playPos || p.pos || ""}）${why.zh}，还在场上。可以用现有的回合重点去打他。`,
      `Their ${p.name} (${p.playPos || p.pos || ""}) is ${why.en} and still on the floor. Use a possession focus to go at it.`,
    ),
    choices: [
      { id: "hunt", label: pair("清侧翼错位", "Hunt the mismatch"), hint: pair("约 6 个回合攻打最弱对位", "~6 possessions attacking the weakest matchup") },
      {
        id: "post",
        label: pair("连攻内线", "Feed the post"),
        hint: pair("约 6 个回合偏好内线", "~6 possessions in the paint"),
        disabled: !big,
        disabledReason: big ? undefined : pair("他不是内线球员", "He isn't a big"),
      },
      { id: "ignore", label: pair("不理会", "Ignore it"), hint: pair("什么都不变", "Nothing changes") },
    ],
    effects: {
      hunt: [{ kind: "setFocusPlay", focusId: "hunt_mismatch" }],
      post: [{ kind: "setFocusPlay", focusId: "post_up" }],
      ignore: [],
    },
  };
}

function buildFoulTrouble(c, snap) {
  const p = c.player;
  const sub = bestReplacement(snap, p);
  const q = periodLabel(snap.quarter);
  return {
    title: pair(`${p.name} 犯规麻烦`, `${p.name} is in foul trouble`),
    body: pair(
      `${p.name} 在 ${q} 已经 ${p.stats.pf} 次犯规。`,
      `${p.name} has ${p.stats.pf} fouls in ${q}.`,
    ),
    choices: [
      {
        id: "sit",
        label: sub ? pair(`换下，换上 ${sub.name}`, `Sit him, bring in ${sub.name}`) : pair("换下", "Sit him"),
        hint: pair("马上换人，之后随时可以换回", "Subs now; you can bring him back any time"),
        disabled: !sub,
        disabledReason: sub ? undefined : pair("替补席没有可上场的球员", "No healthy player on the bench"),
      },
      { id: "keep", label: pair("留在场上", "Keep him in"), hint: pair("什么都不变", "Nothing changes") },
    ],
    effects: { sit: sub ? [{ kind: "substitute", outId: p.id, inId: sub.id }] : [], keep: [] },
  };
}

const BUILDERS = { takeover: buildTakeover, weakness: buildWeakness, foulTrouble: buildFoulTrouble };

/** The full event object for one candidate (Lychee's UI contract + `effects` per choice). */
export function buildMatchEvent(candidate, snap, tuning = MATCH_EVENT_TUNING, ctx = null) {
  const built = candidate.critical ? buildCritical(candidate, snap, ctx) : BUILDERS[candidate.family](candidate, snap);
  const who = built.player || candidate.player;
  const fallback = built.choices.find((ch) => !ch.disabled && !built.effects[ch.id]?.length)?.id;
  const wanted = tuning.defaults[candidate.family];
  const usable = built.choices.find((ch) => ch.id === wanted && !ch.disabled);
  return {
    id: candidate.id,
    family: candidate.family,
    severity: "decision",
    title: built.title,
    body: built.body,
    clock: matchClockLabel(snap),
    score: scoreLine(snap),
    player: playerLine(who),
    playerId: who.id,
    choices: built.choices,
    defaultChoiceId: usable ? usable.id : fallback,
    effects: built.effects,
  };
}

// ---------------------------------------------------------------- the boundary step

const roll = (seed, boundary, id) => seededStream(hashSeed(`${seed}|${boundary}|${id}`))();

/**
 * Feed one domain event. Returns { state, event } where `event` is a newly fired decision (or null).
 * Never mutates `state`. Only POSSESSION_START advances the boundary counter; both boundary types may fire.
 */
export function stepMatchEvents(state, domainEvent, tuning = MATCH_EVENT_TUNING, ctx = null) {
  if (!state || !domainEvent || !MATCH_EVENT_BOUNDARIES.includes(domainEvent.type)) return { state, event: null };
  const snap = domainEvent.snapshot;
  const next = { ...state, fired: [...state.fired], history: [...state.history] };
  if (domainEvent.type === "POSSESSION_START") next.boundaries += 1;
  if (next.pending || !snap) return { state: next, event: null };
  // `tuning.critical` is a QA/balance override of the crunch window only (the situation, never a probability).
  const crunch = tuning.critical ? { ...CRITICAL_TUNING, ...tuning.critical } : CRITICAL_TUNING;
  // Critical moments: no dice, no warm-up, no spacing -- the situation itself is the trigger. Own cap.
  if (domainEvent.type === "POSSESSION_START" && next.fired.filter(isCritical).length < crunch.maxPerGame) {
    const crit = criticalCandidates(snap, { boundary: next.boundaries, tuning: crunch }).find((c) => !next.fired.includes(c.id));
    if (crit) {
      const event = buildMatchEvent(crit, snap, tuning, ctx);
      next.pending = event;
      next.fired.push(event.id);
      return { state: next, event };
    }
  }
  // One voice at a time: routine events stay quiet in the crunch window, whoever has the ball.
  if (inCrunchWindow(snap, crunch)) return { state: next, event: null };
  if (next.fired.filter((id) => !isCritical(id)).length >= tuning.maxPerGame) return { state: next, event: null };
  if (next.boundaries < tuning.warmupBoundaries) return { state: next, event: null };
  if (next.lastFiredAt != null && next.boundaries - next.lastFiredAt < tuning.minGapBoundaries) return { state: next, event: null };
  const fired = new Set(next.fired);
  for (const candidate of matchEventCandidates(snap, tuning)) {
    if (fired.has(candidate.id)) continue;
    if (roll(next.seed, next.boundaries, candidate.id) >= (tuning.chance[candidate.family] ?? 0)) continue;
    const event = buildMatchEvent(candidate, snap, tuning);
    next.pending = event;
    next.fired.push(event.id);
    next.lastFiredAt = next.boundaries;
    return { state: next, event };
  }
  return { state: next, event: null };
}

// ---------------------------------------------------------------- decisions, effects, outcomes

function statsOf(snap, playerId) {
  for (const side of ["home", "away"]) {
    const p = (snap?.[side]?.roster || []).find((x) => x.id === playerId);
    if (p) return { pts: p.stats?.pts || 0, fgm: p.stats?.fgm || 0, fga: p.stats?.fga || 0, pf: p.stats?.pf || 0 };
  }
  return { pts: 0, fgm: 0, fga: 0, pf: 0 };
}

function youAgainst(snap) {
  const mine = snap?.youSide === "away" ? "away" : "home";
  const other = mine === "home" ? "away" : "home";
  return { for: snap?.score?.[mine] || 0, against: snap?.score?.[other] || 0 };
}

/**
 * Resolve the pending decision. A disabled or unknown choice falls back to the default.
 * Returns { state, effects, entry }; the caller runs `applyMatchEffect(sim, effects)` and should
 * record its result with `markApplied`. Never mutates `state`.
 */
export function decideMatchEvent(state, choiceId, { auto = false, snapshot = null } = {}) {
  const pending = state?.pending;
  if (!pending) return { state, effects: [], entry: null };
  const chosen = pending.choices.find((c) => c.id === choiceId && !c.disabled)
    || pending.choices.find((c) => c.id === pending.defaultChoiceId)
    || pending.choices[0];
  const effects = (pending.effects?.[chosen.id] || []).filter(validEffect);
  const entry = {
    id: pending.id,
    family: pending.family,
    title: pending.title,
    clock: pending.clock,
    playerId: pending.playerId || null,
    playerName: pending.player?.name || "",
    choiceId: chosen.id,
    choiceText: chosen.label,
    auto: !!auto,
    applied: effects.length ? null : true,
    at: state.boundaries,
    baseline: snapshot ? { player: statsOf(snapshot, pending.playerId), score: youAgainst(snapshot) } : null,
    outcome: null,
  };
  return { state: { ...state, pending: null, history: [...state.history, entry] }, effects, entry };
}

/** Run effect descriptors through the existing GameSim API. Returns true only if every call succeeded. */
export function applyMatchEffect(sim, effects) {
  if (!sim || !Array.isArray(effects)) return false;
  let ok = true;
  for (const e of effects) {
    if (e.kind === "setOffenseFocus") ok = sim.setOffenseFocus(e.playerId) !== false && ok;
    else if (e.kind === "setFocusPlay") ok = sim.setFocusPlay(e.focusId) !== false && ok;
    else if (e.kind === "substitute") ok = sim.substitute(e.outId, e.inId) !== false && ok;
    else if (e.kind === "submitDecision") {
      const r = sim.submitDecision({ attemptId: sim.issueAttemptId(), kind: "clutch_shooter", shooterId: e.shooterId, actionHint: e.actionHint });
      ok = !!r?.accepted && ok;
    } else if (e.kind === "setDefenseScheme") ok = sim.setDefenseScheme(e.scheme, e.targetId) !== false && ok;
    else ok = false;
  }
  return ok;
}

export function markApplied(state, eventId, applied) {
  return {
    ...state,
    history: state.history.map((h) => (h.id === eventId && h.applied === null ? { ...h, applied: !!applied } : h)),
  };
}

function outcomeText(entry, snap) {
  const base = entry.baseline;
  if (!base) return null;
  const now = statsOf(snap, entry.playerId);
  const score = youAgainst(snap);
  const runFor = score.for - base.score.for;
  const runAgainst = score.against - base.score.against;
  const run = pair(`这段比分 ${runFor}–${runAgainst}`, `${runFor}–${runAgainst} run since`);
  const name = entry.playerName;
  if (entry.family === "takeover" || isCritical(entry.id)) {
    const pts = now.pts - base.player.pts;
    const fgm = now.fgm - base.player.fgm;
    const fga = now.fga - base.player.fga;
    return pair(`${name} 此后 ${pts} 分（${fgm}/${fga}）· ${run.zh}`, `${name}: ${pts} pts (${fgm}/${fga} FG) · ${run.en}`);
  }
  if (entry.family === "foulTrouble") {
    const pf = now.pf - base.player.pf;
    const pts = now.pts - base.player.pts;
    return pair(`${name} 此后 ${pts} 分、又犯规 ${pf} 次 · ${run.zh}`, `${name}: ${pts} pts, ${pf} more fouls · ${run.en}`);
  }
  return run;
}

/**
 * Measure what actually happened after each decision: once `outcomeWindow` boundaries have passed,
 * or at period/match end (`final`). Read from the real snapshot only — nothing is invented.
 */
export function settleMatchEventOutcomes(state, snap, { final = false, tuning = MATCH_EVENT_TUNING } = {}) {
  if (!state || !snap) return state;
  let changed = false;
  const history = state.history.map((h) => {
    if (h.outcome || !h.baseline) return h;
    if (!final && state.boundaries - h.at < tuning.outcomeWindow) return h;
    changed = true;
    return { ...h, outcome: outcomeText(h, snap) };
  });
  return changed ? { ...state, history } : state;
}

/** History rows shaped for matchEventHistoryHtml (choiceLabel is a plain string there). Newest first. */
export function matchEventHistoryRows(state, lang = "zh") {
  const pick = (p) => (p == null ? "" : typeof p === "string" ? p : lang === "en" ? p.en || p.zh : p.zh || p.en);
  return [...(state?.history || [])].reverse().map((h) => ({
    id: h.id,
    family: h.family,
    title: h.title,
    clock: h.clock,
    choiceLabel: `${pick(h.choiceText)}${h.auto ? (lang === "en" ? " (auto)" : "（自动）") : ""}`,
    outcome: h.outcome,
  }));
}

/** The info toast shown when a decision was auto-resolved (fast sim, top speed, or play resumed). */
export function autoResolvedNotice(entry) {
  if (!entry) return null;
  return {
    id: `${entry.id}:auto`,
    family: entry.family,
    severity: "info",
    title: pair(
      `${typeof entry.title === "string" ? entry.title : entry.title?.zh || ""}——按默认：${entry.choiceText?.zh || ""}`,
      `${typeof entry.title === "string" ? entry.title : entry.title?.en || ""} — default: ${entry.choiceText?.en || ""}`,
    ),
    body: "",
    clock: entry.clock,
  };
}
