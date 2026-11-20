/**
 * Player Reborn PR2 — coach trust and rotation roles (ADR-005 §3, prep doc).
 *
 * Pure functions: trust 0-100, visible; the rotation role follows trust (and
 * a vacancy bump); good play earns more minutes, bad play earns fewer, and
 * the reason is on the card. No Math.random anywhere.
 */

const TRUST_MIN = 0;
const TRUST_MAX = 100;
/** A camp player starts at the end of the bench, fighting for minutes. */
export const TRUST_START = 25;

const ROTATION_ROLES = ["dnp", "garbage", "bench", "rotation", "starter"];

/** Target minutes per game for each role (aligns with data/playerMinutes.js PLAYER_ROLES). */
export const ROLE_MINUTES = { dnp: 0, garbage: 4, bench: 10, rotation: 18, starter: 30 };

export const ROLE_LABEL = {
  dnp: { zh: "未出场", en: "DNP" },
  garbage: { zh: "垃圾时间", en: "Garbage time" },
  bench: { zh: "轮换末端", en: "End of bench" },
  rotation: { zh: "轮换", en: "Rotation" },
  starter: { zh: "首发", en: "Starter" },
};

const clampTrust = (value) => Math.max(TRUST_MIN, Math.min(TRUST_MAX, Math.round(value)));

/** Trust tier -> role. A vacancy (injury / trade opening) bumps one tier. */
export function roleForTrust(trust, { vacancy = false } = {}) {
  const t = clampTrust(trust);
  let role = t < 15 ? "dnp" : t < 30 ? "garbage" : t < 50 ? "bench" : t < 75 ? "rotation" : "starter";
  if (vacancy) {
    const i = ROTATION_ROLES.indexOf(role);
    if (i >= 0 && i < ROTATION_ROLES.length - 1) role = ROTATION_ROLES[i + 1];
  }
  return role;
}

/** The Game Score a role is expected to produce (Hollinger Game Score). */
export function expectedGameScore(role) {
  return { dnp: 0, garbage: 2, bench: 4, rotation: 7, starter: 10 }[role] ?? 4;
}

/**
 * Fewer minutes than this and the coach has nothing to judge: sitting is not a poor performance.
 * (Without this a player who is never used lost 2 trust a game, trained back +2 a week and sat in
 * the DNP/garbage band forever -- no minutes, so no evidence, so no trust, so no minutes.)
 */
export const MIN_JUDGED_MINUTES = 3;

/** Lowest trust of each role above DNP, in order (mirror of roleForTrust). */
const TIER_FLOOR = [["garbage", 15], ["bench", 30], ["rotation", 50], ["starter", 75]];

/**
 * What the coach is waiting for: the next role up and how much trust it takes. Null for a starter.
 * Only describes the ladder -- minutes still come from the sim and the role, never from this.
 */
export function nextTier(trust) {
  const t = clampTrust(trust);
  const next = TIER_FLOOR.find(([, floor]) => t < floor);
  return next ? { role: next[0], at: next[1], missing: next[1] - t } : null;
}

/**
 * One game's trust update. Performance is Game Score vs the role's
 * expectation (bounded so one game never swings the whole season); training
 * completion adds trust (more when DNP — practice is how you get back);
 * a takeover that was attempted adds or costs trust by its outcome.
 * Returns the new trust, the total delta, and the parts so the card can
 * explain the change.
 */
export function updateTrust(
  trust,
  { gameScore: gs = 0, role = "bench", trainingDone = false, takeover = null, minutes = null } = {},
) {
  const expected = expectedGameScore(role);
  // `minutes` omitted (null) keeps the old rule; a real game passes the minutes he actually played.
  const unplayed = Number.isFinite(minutes) && minutes < MIN_JUDGED_MINUTES;
  const perfDelta = unplayed ? 0 : Math.max(-5, Math.min(7, Math.round((gs - expected) * 1.2)));
  const trainingDelta = trainingDone ? (role === "dnp" ? 4 : 2) : 0;
  const takeoverDelta = takeover?.attempted ? (takeover.made ? 4 : -2) : 0;
  const delta = perfDelta + trainingDelta + takeoverDelta;
  const parts = [unplayed
    ? { kind: "unplayed", delta: 0, minutes }
    : { kind: "performance", delta: perfDelta, gameScore: gs, expected }];
  if (trainingDone) parts.push({ kind: "training", delta: trainingDelta });
  if (takeover?.attempted) parts.push({ kind: "takeover", delta: takeoverDelta, made: takeover.made });
  return { trust: clampTrust(trust + delta), delta, role, parts };
}

/** The coach's ladder as one line for the header: what is next, how far, and what actually moves it. */
export function describeNextTier(trust, lang = "zh") {
  const next = nextTier(trust);
  if (!next) return "";
  const label = ROLE_LABEL[next.role];
  return lang === "en"
    ? `Next: ${label.en} at trust ${next.at} (${next.missing} to go). Finish the week's training (+${trust < 15 ? 4 : 2} a week); good minutes move it faster.`
    : `下一档「${label.zh}」：信任 ${next.at}（还差 ${next.missing}）。每周完成训练 +${trust < 15 ? 4 : 2}，上场表现好涨得更快。`;
}

/** Render a trust change as a card line. */
export function describeTrustChange(change, lang = "zh") {
  const zh = lang !== "en";
  const bits = [];
  for (const part of change.parts || []) {
    if (part.kind === "performance") {
      bits.push(
        zh
          ? `表现 ${part.gameScore.toFixed(1)} 分（${ROLE_LABEL[change.role]?.zh || ""}预期 ${part.expected}）${part.delta >= 0 ? "+" : ""}${part.delta}`
          : `Play ${part.gameScore.toFixed(1)} (expected ${part.expected} for this role) ${part.delta >= 0 ? "+" : ""}${part.delta}`,
      );
    } else if (part.kind === "unplayed") {
      bits.push(zh ? "没有上场，教练没法评价你，信任不扣" : "Didn't play — nothing for the coach to judge, no trust lost");
    } else if (part.kind === "training") {
      bits.push(zh ? `完成本周训练 +${part.delta}` : `Weekly training done +${part.delta}`);
    } else if (part.kind === "takeover") {
      bits.push(
        zh
          ? part.made
            ? `关键回合打成 +${part.delta}`
            : `关键回合没打成 ${part.delta}`
          : part.made
            ? `Takeover made +${part.delta}`
            : `Takeover missed ${part.delta}`,
      );
    }
  }
  const sign = change.delta >= 0 ? "+" : "";
  return zh ? `信任 ${sign}${change.delta}：${bits.join("；")}` : `Trust ${sign}${change.delta}: ${bits.join("; ")}`;
}
