// Live-game per-player intent + suggestions. Derived readouts only: every
// signal comes from the GameSim snapshot (slim player rows) — orders,
// intangibles.ballNeed, fatigue, hot, confidence, matchup assignments.
// Nothing is stored, nothing touches sim.js. Thresholds reuse the engine's
// own bands: hot >= 2 is On Fire (hotLabel), fatigue soft-start ~60 / hard
// ~80 (fatiguePerfMult, iron lungs push both later), confidence < 45 is
// 信心不足 / 自我怀疑 (form.js confidenceLabel), ballNeed runs 15..99
// (intangibles.js).

const pick = (zh, en, lang) => (lang === "en" ? en : zh);

const HANDLER_ACTION = {
  pnr: ["持球挡拆", "Ball-handler PnR"],
  drive_kick: ["持球突破分球", "Ball-handler drive & kick"],
  iso: ["持球单打", "Ball-handler iso"],
  post: ["低位要球", "Post-up"],
  spot: ["无球定点", "Off-ball spot-up"],
  crash: ["冲抢二次", "Crash the boards"],
};

const TEAMMATE_ACTION = {
  pnr: ["挡拆策应", "PnR support"],
  drive_kick: ["突破分球", "Drive & kick"],
  iso: ["单打", "Iso"],
  post: ["低位要球", "Post-up"],
  spot: ["无球定点", "Off-ball spot-up"],
  crash: ["冲抢二次", "Crash the boards"],
};

const USAGE_FALLBACK = {
  organize: ["组织串联", "Run the offense"],
  score: ["主攻得分", "Primary scorer"],
  defend: ["专注防守", "Lockdown defense"],
  hustle: ["拼抢蓝领", "Hustle role"],
};

/**
 * One short intent line for an on-court player, e.g. "持球挡拆 · 主防 Ty Lawson"
 * or "无球定点". guardName = the opponent this player guards (from
 * defensePlan.assignments, inverted by the caller); focusGuardName = the
 * opponent he is the focus defender against (defensePlan targetId).
 */
export function livePlayerIntent(p, { isHandler = false, guardName = null, focusGuardName = null, lang = "zh" } = {}) {
  const action = p?.orders?.action || "auto";
  let attack;
  if (isHandler) {
    attack = HANDLER_ACTION[action] ? pick(...HANDLER_ACTION[action], lang) : pick("持球发动", "Run the offense", lang);
  } else if (TEAMMATE_ACTION[action]) {
    attack = pick(...TEAMMATE_ACTION[action], lang);
  } else {
    const usage = p?.orders?.usage || "auto";
    attack = USAGE_FALLBACK[usage]
      ? pick(...USAGE_FALLBACK[usage], lang)
      : pick("按体系", "Play the system", lang);
  }
  const bits = [attack];
  if (focusGuardName) bits.push(pick(`重点盯防 ${focusGuardName}`, `Lock down ${focusGuardName}`, lang));
  else if (guardName) bits.push(pick(`主防 ${guardName}`, `Guarding ${guardName}`, lang));
  return bits.join(" · ");
}

/**
 * Up to two short suggestions for an on-court player, most urgent first.
 * threat = the opponent threat object ({ id, name }) from suggestDefenseScheme,
 * threatGuardId = who currently guards him (assignments[threat.id]),
 * bestDefenderId = your on-court player with the highest defense.
 */
export function livePlayerSuggestions(
  p,
  { isHandler = false, threat = null, threatGuardId = null, bestDefenderId = null, lang = "zh" } = {},
) {
  const out = [];
  const fatigue = Number(p?.fatigue) || 0;
  const hot = Number(p?.hot) || 0;
  const confidence = Number(p?.confidence ?? 50);
  const ballNeed = Number(p?.intangibles?.ballNeed ?? 0);
  if (fatigue >= 80) out.push(pick("想休息", "Wants rest", lang));
  if (hot >= 2) out.push(pick("多攻", "Attack more", lang));
  if (threat && threatGuardId && threatGuardId === p?.id) {
    out.push(pick(`盯死 ${threat.name}`, `Lock down ${threat.name}`, lang));
  } else if (threat && bestDefenderId && bestDefenderId === p?.id) {
    out.push(pick(`建议主防 ${threat.name}`, `Should guard ${threat.name}`, lang));
  }
  if (!isHandler && ballNeed >= 80) out.push(pick("想持球", "Wants the ball", lang));
  if (confidence < 45) out.push(pick("少强投", "Fewer forced shots", lang));
  if (fatigue >= 70 && fatigue < 80 && !p?.ironLungs) out.push(pick("想休息", "Wants rest", lang));
  return out.slice(0, 2);
}

/** Team-level suggestion for the panel header. Only the trailing case for now. */
export function liveTeamSuggestion({ youScore = 0, oppScore = 0, lang = "zh" } = {}) {
  const diff = oppScore - youScore;
  if (diff >= 8) return pick(`落后 ${diff} 分，建议打快追分`, `Down ${diff} — push the pace`, lang);
  return null;
}
