/**
 * Business Scenario — the composed executive career state and the first playable slice
 * (workstream F, user-approved 2026-11-10).
 *
 * The executive state composes the four F modules — franchise business, personal ownership,
 * future knowledge and executive progression — into ONE object. Personal wealth and
 * franchise budget stay separate sub-objects; the scenario is the only composer that moves
 * money between them, and only through salary and dividends.
 *
 * The three-season slice: 1996, weak team (Vancouver Grizzlies — weakest 1996 roster by
 * real top-5 scoring), employed GM with an operating budget. Steps: (1) start, (2) one
 * scouting decision using future knowledge, (3) negotiate a sponsorship, (4) adjust ticket
 * pricing, (5) simulate seasons with the existing league engine, (6) review revenue,
 * profit, valuation and basketball results, (7) unlock a credible minority-ownership
 * opportunity.
 *
 * Seasons are NOT simulated here: advanceScenarioSeason consumes a season result produced
 * by the real league engine ({ wins, losses, playoffRound, champion }) and turns it into
 * money, achievements and stage movement. The QA script drives it with fixture results;
 * the browser wires it to real season outcomes.
 *
 * Scouting seam (workstream C): resolveScoutingDecision accepts C's scouting result shape
 * ({ bref, confidence, source }) or a plain { bref } pick. C owns scoutingIntel.js; this
 * module never touches it — it only consumes the decision.
 */
import { FRANCHISES } from "../../data/franchises.js";
import { historicalSeason } from "../../data/historicalSeasons.js";
import { createBusinessState, settleSeason } from "./franchiseBusiness.js";
import {
  createKnowledgeState,
  draftBoardClue,
  recordCausalEvent,
} from "./futureKnowledge.js";
import {
  createExecutiveRecord,
  recordSeasonAchievements,
  settleEmpireLegacy,
  stageFor,
  stageLabel,
  stageOpportunities,
} from "./executiveProgression.js";
import {
  accrueDebt,
  createPersonalLedger,
  equityPct,
  forcedSaleCheck,
  payDividends,
  paySalary,
  settlePersonalInvestments,
} from "./ownership.js";

/** The default slice team: weakest 1996 roster by real top-5 scoring (VAN, 11.9 ppg). */
export const SCENARIO_TEAM_ID = "VAN";
export const SCENARIO_SEASON = 1996;
export const SCENARIO_SEASONS = 3;

function teamNameFor(teamId, season) {
  const entry = historicalSeason(season)?.teams?.find((t) => t.id === teamId || t.bref === teamId);
  if (entry?.name) return entry.name;
  return FRANCHISES.find((f) => f.id === teamId)?.name || teamId;
}

export function createExecutiveScenario({ teamId = SCENARIO_TEAM_ID, season = SCENARIO_SEASON, seed = 1, players = [] } = {}) {
  const boardClue = draftBoardClue({ year: season, seed, players });
  return {
    teamId,
    season,
    seed,
    business: createBusinessState({
      teamId,
      teamName: teamNameFor(teamId, season),
      season,
      market: "small",
      operatingBudget: 25,
    }),
    personal: createPersonalLedger({ cash: 2, salary: 0.8 }),
    knowledge: createKnowledgeState({
      knowledge: 3, // same starting budget as the opening future-knowledge choices
      clues: boardClue ? [boardClue] : [],
    }),
    exec: createExecutiveRecord({ reputation: 45, boardTrust: 55 }),
    draftPick: null,
    dismissed: false,
    log: [],
  };
}

/**
 * The scouting seam. Accepts workstream C's scouting result ({ bref, confidence, source })
 * or a plain pick ({ bref } / { playerId }). Returns the resolved decision with its source
 * recorded, so the scenario can tell a C-backed pick from a direct one. Throws on an
 * unknown player — never draft a ghost.
 */
export function resolveScoutingDecision(input, players = []) {
  const bref = input?.bref ?? input?.playerId ?? null;
  if (!bref) throw new TypeError("scouting decision needs a bref or playerId");
  const player = (players || []).find((p) => p.bref === bref || p.id === bref);
  if (!player) throw new RangeError(`unknown draft prospect: ${bref}`);
  return {
    bref: player.bref,
    name: player.name,
    confidence: input?.confidence ?? 0.5,
    source: input?.source ?? (input?.confidence !== undefined ? "scoutingIntel" : "direct"),
  };
}

/** Make the slice's scouting decision: record the causal event (it decays related clues). */
export function makeScoutingDecision(state, input, players = []) {
  const pick = resolveScoutingDecision(input, players);
  const knowledge = recordCausalEvent(state.knowledge, {
    id: `draft-${pick.bref}-${state.season}`,
    kind: "draft",
    subject: pick.bref,
    season: state.season,
    label: `drafted ${pick.name}`,
  });
  return {
    ...state,
    knowledge,
    draftPick: pick,
    log: [...state.log, { type: "scouting-decision", bref: pick.bref, name: pick.name, source: pick.source, at: Date.now() }],
  };
}

/**
 * Advance one season from a REAL engine result. Composes, in order: franchise settlement,
 * salary + investments + dividends (personal), achievements (executive record), debt
 * accrual + forced-sale check. Returns { state, settlement, boardReport }.
 */
export function advanceScenarioSeason(state, seasonResult, { players = [], rng = Math.random } = {}) {
  const season = state.business.season;
  const business = settleSeason(state.business, seasonResult, { players });
  const settledRecord = business.history.at(-1);
  let personal = paySalary(state.personal);
  const investments = settlePersonalInvestments(personal, season, rng);
  personal = investments.ledger;
  const dividends = payDividends(personal, { teamId: state.teamId, profit: settledRecord.profit });
  personal = dividends.ledger;
  personal = accrueDebt(personal, business.season);
  const forced = forcedSaleCheck(personal, { teamId: state.teamId, pricePerPct: business.valuation / 100, season: business.season });
  personal = forced.ledger;
  let exec = recordSeasonAchievements(state.exec, seasonResult);
  exec = { ...exec, equityPct: equityPct(personal, state.teamId) };
  if (equityPct(personal, state.teamId) >= 51) exec = { ...exec, control: true };
  const next = {
    ...state,
    season: business.season,
    business,
    personal,
    exec,
    dismissed: forced.forced && forced.kind === "dismissal",
    log: [
      ...state.log,
      { type: "season-settled", season, ...settledRecord, dividends: dividends.dividends, at: Date.now() },
      ...(forced.forced ? [{ type: "forced-sale", kind: forced.kind, sold: forced.sold, at: Date.now() }] : []),
    ],
  };
  return {
    state: next,
    settlement: {
      season,
      wins: seasonResult.wins ?? 0,
      losses: seasonResult.losses ?? 0,
      champion: !!seasonResult.champion,
      profit: settledRecord.profit,
      valuation: settledRecord.valuation,
      dividends: dividends.dividends,
      investments: investments.settled,
      forced: forced.forced ? forced.kind : null,
    },
    boardReport: scenarioBoardReport(next, settledRecord),
  };
}

/** The monthly board report: concise results + the stage + what is now possible. */
export function scenarioBoardReport(state, record) {
  const stage = stageFor(state.exec);
  const opps = stageOpportunities(state.exec, {
    wealth: state.personal.cash,
    valuation: state.business.valuation,
    loanCapacity: 20,
  }).filter((o) => o.available);
  const profitWord = record.profit >= 0 ? "盈利" : "亏损";
  return {
    lines: [
      `${record.season} 赛季：${record.wins} 胜 ${record.losses} 负，经营${profitWord} $${record.profit}M，球队估值 $${record.valuation}M。`,
      `当前身份：${stageLabel(stage)}；个人财富 $${state.personal.cash}M，持有股权 ${state.exec.equityPct}%。`,
      opps.length ? `新的机会：${opps.map((o) => o.id).join("、")}。` : "暂无新的晋升或收购机会。",
    ],
    linesEn: [
      `Season ${record.season}: ${record.wins}-${record.losses}, ${record.profit >= 0 ? "profit" : "loss"} $${record.profit}M, valuation $${record.valuation}M.`,
      `Current stage: ${stageLabel(stage, "en")}; personal wealth $${state.personal.cash}M, equity ${state.exec.equityPct}%.`,
      opps.length ? `New opportunities: ${opps.map((o) => o.id).join(", ")}.` : "No new advancement or acquisition opportunities.",
    ],
    stage,
    opportunities: opps.map((o) => o.id),
  };
}

/** The three-season review: money, basketball and standing, side by side. */
export function scenarioSummary(state) {
  const history = state.business.history;
  const totalProfit = Math.round(history.reduce((sum, r) => sum + r.profit, 0) * 100) / 100;
  const wins = history.reduce((sum, r) => sum + r.wins, 0);
  const losses = history.reduce((sum, r) => sum + r.losses, 0);
  return {
    seasons: history.length,
    wins,
    losses,
    totalProfit,
    valuationStart: history[0]?.valuation ?? state.business.valuation,
    valuationNow: state.business.valuation,
    championships: state.exec.achievements.championships,
    equityPct: state.exec.equityPct,
    personalCash: state.personal.cash,
    stage: stageFor(state.exec),
    stageLabel: stageLabel(stageFor(state.exec)),
    dismissed: state.dismissed,
  };
}

/** The slice's payoff: the minority-ownership opportunity, with its requirements. */
export function minorityOpportunity(state) {
  return stageOpportunities(state.exec, {
    wealth: state.personal.cash,
    valuation: state.business.valuation,
    loanCapacity: 20,
  }).find((o) => o.id === "minority-offer");
}

/** Retire (or reach 2050): settle the Empire Legacy ending. */
export function retireExecutive(state, { years = 0 } = {}) {
  const settled = settleEmpireLegacy(state.exec, {
    wealth: state.personal.cash,
    valuation: state.business.valuation,
    years,
  });
  return { ...state, exec: { ...state.exec, retired: true, settled } };
}

/** Attach an executive career to a real career root (additive optional field). */
export function attachToCareerRoot(root, execState) {
  return { ...root, story: { ...root.story, executive: execState } };
}

export function executiveFromRoot(root) {
  return root?.story?.executive ?? null;
}

/**
 * Validator for the optional root.story.executive field, following the saveRoot.js
 * convention (seasonGoal / prophecy): only checked when present, old saves without it
 * keep loading unchanged.
 */
export function validateExecutive(exec) {
  const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
  if (!isObject(exec)) throw new Error("invalid executive state");
  if (!isObject(exec.business) || typeof exec.business.teamId !== "string" || !Number.isInteger(exec.business.season)) {
    throw new Error("invalid executive business state");
  }
  if (!isObject(exec.personal) || !Number.isFinite(exec.personal.cash)) {
    throw new Error("invalid executive personal ledger");
  }
  if (!isObject(exec.knowledge) || !Number.isFinite(exec.knowledge.knowledge)) {
    throw new Error("invalid executive knowledge state");
  }
  if (!isObject(exec.exec) || !Number.isFinite(exec.exec.reputation)) {
    throw new Error("invalid executive record");
  }
}
