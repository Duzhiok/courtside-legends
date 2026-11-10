/**
 * Executive Progression — the stages of GM Career: From Employee to Empire (workstream F,
 * user-approved 2026-11-10).
 *
 * General Manager → President of Basketball Operations → Minority Owner → Controlling Owner
 * → Sports Mogul → Empire Legacy (settlement at retirement or the 2050 timeline end).
 *
 * Progression is NEVER automatic at a threshold: stageFor() derives the current stage from
 * the record, but every step up arrives as an OPPORTUNITY the player accepts or declines
 * (stageOpportunities). A great GM may stay a GM forever; a gambler may buy in early and
 * lose control. Ownership is an advanced GM career path — not a fifth career card. The
 * Architect holds dual basketball control (GM + Coach); the Owner holds capital, business
 * and long-term assets.
 *
 * Pure functions over the executive record. Money in $M.
 */

export const STAGES = [
  { id: "gm", zh: "球队雇员 · 总经理", en: "General Manager" },
  { id: "president", zh: "篮球商业操盘手 · 篮球运营总裁", en: "President of Basketball Operations" },
  { id: "minority", zh: "球队合伙人 · 小股东", en: "Minority Owner" },
  { id: "controlling", zh: "球队控制人 · 控股老板", en: "Controlling Owner" },
  { id: "mogul", zh: "篮球帝国 · 体育巨头", en: "Sports Mogul" },
  { id: "legacy", zh: "传奇终局 · 帝国传承", en: "Empire Legacy" },
];

export const MINORITY_PCT = 5;
export const CONTROL_PCT = 51;
export const CONTROL_MIN_EQUITY = 25;
/** Control premium on the shares bought to reach 51%. */
export const CONTROL_PREMIUM = 1.25;

export function createExecutiveRecord({ reputation = 50, boardTrust = 50 } = {}) {
  return {
    achievements: { championships: 0, playoffRuns: 0, winningSeasons: 0 },
    reputation,
    boardTrust,
    equityPct: 0,
    control: false,
    secondAsset: false,
    retired: false,
    settled: null,
  };
}

/** The stage the record actually supports, derived — never stored as an independent boolean. */
export function stageFor(exec) {
  if (exec.settled) return "legacy";
  if (exec.control && (exec.equityPct >= 50 || exec.secondAsset)) return "mogul";
  if (exec.control) return "controlling";
  if (exec.equityPct >= MINORITY_PCT) return "minority";
  const a = exec.achievements || {};
  if ((a.playoffRuns >= 1 || a.winningSeasons >= 2) && exec.boardTrust >= 60) return "president";
  return "gm";
}

export function stageLabel(stageId, lang = "zh") {
  const s = STAGES.find((x) => x.id === stageId);
  return s ? (lang === "en" ? s.en : s.zh) : stageId;
}

/**
 * Advancement opportunities available RIGHT NOW. Each carries its requirements and what is
 * still missing, so the UI can show a credible path instead of a greyed-out button.
 * `ctx`: { wealth ($M personal cash), valuation ($M team value), loanCapacity ($M) }.
 */
export function stageOpportunities(exec, ctx = {}) {
  const { wealth = 0, valuation = 150, loanCapacity = 0 } = ctx;
  const a = exec.achievements || {};
  const pricePerPct = valuation / 100;
  const minorityCost = MINORITY_PCT * pricePerPct;
  const neededToControl = Math.max(0, CONTROL_PCT - exec.equityPct);
  const controlCost = neededToControl * pricePerPct * CONTROL_PREMIUM;
  const opps = [];
  opps.push({
    id: "president-offer",
    to: "president",
    available: (a.playoffRuns >= 1 || a.winningSeasons >= 2) && exec.boardTrust >= 60,
    missing: [
      ...(a.playoffRuns < 1 && a.winningSeasons < 2 ? ["need a playoff run or two winning seasons"] : []),
      ...(exec.boardTrust < 60 ? ["need board trust 60+"] : []),
    ],
  });
  opps.push({
    id: "minority-offer",
    to: "minority",
    cost: Math.round(minorityCost * 100) / 100,
    available: wealth >= minorityCost && exec.reputation >= 60 && exec.boardTrust >= 60,
    missing: [
      ...(wealth < minorityCost ? [`need $${minorityCost.toFixed(1)}M personal cash`] : []),
      ...(exec.reputation < 60 ? ["need reputation 60+"] : []),
      ...(exec.boardTrust < 60 ? ["need board trust 60+"] : []),
    ],
  });
  opps.push({
    id: "control-offer",
    to: "controlling",
    cost: Math.round(controlCost * 100) / 100,
    available: exec.equityPct >= CONTROL_MIN_EQUITY && wealth + loanCapacity >= controlCost,
    missing: [
      ...(exec.equityPct < CONTROL_MIN_EQUITY ? [`need ${CONTROL_MIN_EQUITY}% equity first`] : []),
      ...(wealth + loanCapacity < controlCost ? ["need more cash or financing"] : []),
    ],
  });
  opps.push({
    id: "mogul-path",
    to: "mogul",
    available: exec.control && (exec.equityPct >= 50 || exec.secondAsset),
    missing: [
      ...(!exec.control ? ["need controlling ownership first"] : []),
      ...(exec.control && exec.equityPct < 50 && !exec.secondAsset ? ["need 50% equity or a second sports asset"] : []),
    ],
  });
  return opps;
}

/** Record one season's basketball achievements into the record. Results also move the
 * standing that gates advancement: winning raises board trust and reputation, losing
 * lowers them. A championship season is worth +8 trust — the board notices. */
export function recordSeasonAchievements(exec, { wins = 0, losses = 0, playoffRound = null, champion = false } = {}) {
  const games = wins + losses;
  const winPct = games ? wins / games : 0.5;
  const a = { ...exec.achievements };
  if (games && winPct > 0.5) a.winningSeasons += 1;
  if (playoffRound) a.playoffRuns += 1;
  if (champion) a.championships += 1;
  let boardTrust = exec.boardTrust ?? 50;
  let reputation = exec.reputation ?? 50;
  if (champion) {
    boardTrust += 8;
    reputation += 5;
  } else if (playoffRound) {
    boardTrust += 5;
    reputation += 2;
  } else if (winPct > 0.5) {
    boardTrust += 3;
    reputation += 1;
  } else if (winPct < 0.4) {
    boardTrust -= 5;
    reputation -= 2;
  }
  return {
    ...exec,
    achievements: a,
    boardTrust: Math.max(0, Math.min(100, boardTrust)),
    reputation: Math.max(0, Math.min(100, reputation)),
  };
}

/**
 * Empire Legacy settlement: at retirement or the 2050 timeline end. Wealth, the value of
 * the equity held, championships, influence and years in the game all count. Returns the
 * settlement (stored on the record by the caller) — never a Game Over, the settlement IS
 * the ending.
 */
export function settleEmpireLegacy(exec, { wealth = 0, valuation = 0, years = 0 } = {}) {
  const a = exec.achievements || {};
  const equityValue = (valuation * exec.equityPct) / 100;
  const score = Math.round(
    wealth * 0.3 + equityValue * 0.3 + a.championships * 15 + a.playoffRuns * 3 + exec.reputation * 0.2 + years * 1,
  );
  const title =
    score >= 90 ? { zh: "篮球不朽", en: "Basketball Immortal" }
    : score >= 60 ? { zh: "王朝缔造者", en: "Dynasty Builder" }
    : score >= 35 ? { zh: "商业巨头", en: "Business Mogul" }
    : { zh: "球队建设者", en: "Franchise Builder" };
  return {
    score,
    title,
    wealth: Math.round(wealth * 100) / 100,
    equityValue: Math.round(equityValue * 100) / 100,
    championships: a.championships,
    playoffRuns: a.playoffRuns,
    years,
    lines: [
      `个人财富 $${Math.round(wealth * 100) / 100}M · 球队股权价值 $${Math.round(equityValue * 100) / 100}M`,
      `${a.championships} 次总冠军 · ${a.playoffRuns} 次季后赛 · ${years} 个赛季`,
    ],
  };
}
