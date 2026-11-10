/**
 * Player Reborn PR2 — coach trust and rotation roles (ADR-005 §3, prep doc).
 *
 * Pure functions: trust 0-100, visible; the rotation role follows trust (and
 * a vacancy bump); good play earns more minutes, bad play earns fewer, and
 * the reason is on the card. No Math.random anywhere.
 */

export const TRUST_MIN = 0;
export const TRUST_MAX = 100;
/** A camp player starts at the end of the bench, fighting for minutes. */
export const TRUST_START = 25;

export const ROTATION_ROLES = ["dnp", "garbage", "bench", "rotation", "starter"];

/** Target minutes per game for each role (aligns with gameplan PLAYER_ROLES). */
export const ROLE_MINUTES = { dnp: 0, garbage: 4, bench: 10, rotation: 18, starter: 30 };

export const ROLE_LABEL = {
  dnp: { zh: "未出场", en: "DNP" },
  garbage: { zh: "垃圾时间", en: "Garbage time" },
  bench: { zh: "轮换末端", en: "End of bench" },
  rotation: { zh: "轮换", en: "Rotation" },
  starter: { zh: "首发", en: "Starter" },
};

export const clampTrust = (value) => Math.max(TRUST_MIN, Math.min(TRUST_MAX, Math.round(value)));

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
 * One game's trust update. Performance is Game Score vs the role's
 * expectation (bounded so one game never swings the whole season); training
 * completion adds trust (more when DNP — practice is how you get back);
 * a takeover that was attempted adds or costs trust by its outcome.
 * Returns the new trust, the total delta, and the parts so the card can
 * explain the change.
 */
export function updateTrust(
  trust,
  { gameScore: gs = 0, role = "bench", trainingDone = false, takeover = null } = {},
) {
  const expected = expectedGameScore(role);
  const perfDelta = Math.max(-5, Math.min(7, Math.round((gs - expected) * 1.2)));
  const trainingDelta = trainingDone ? (role === "dnp" ? 4 : 2) : 0;
  const takeoverDelta = takeover?.attempted ? (takeover.made ? 4 : -2) : 0;
  const delta = perfDelta + trainingDelta + takeoverDelta;
  const parts = [{ kind: "performance", delta: perfDelta, gameScore: gs, expected }];
  if (trainingDone) parts.push({ kind: "training", delta: trainingDelta });
  if (takeover?.attempted) parts.push({ kind: "takeover", delta: takeoverDelta, made: takeover.made });
  return { trust: clampTrust(trust + delta), delta, role, parts };
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
