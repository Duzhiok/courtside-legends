/**
 * Draft pick → OVR-equivalent estimate for trade decisions.
 *
 * Model (deliberately simple and explainable, not a hidden oracle):
 * 1. Expected draft slot from round + protection.
 * 2. Expected prospect current OVR / potential at that slot
 *    (matches leagueDraft scouting: potential ≈ current + 8..23).
 * 3. Conveyance chance (protected picks may roll over) and a time discount.
 * 4. Trade value = (potential − replacement level) × convey × discount × weight.
 */

const REPLACEMENT_POTENTIAL = 60;
const VALUE_WEIGHT = 0.25;
const YEARLY_DISCOUNT = 0.9;

const PICK_PROFILES = {
  "1:unprotected": { slot: 15, convey: 1, label: "首轮（无保护）" },
  "1:lottery-protected": { slot: 22, convey: 0.55, label: "首轮（乐透保护）" },
  "2:unprotected": { slot: 45, convey: 1, label: "次轮（无保护）" },
  "2:lottery-protected": { slot: 45, convey: 1, label: "次轮" },
};

function round1(n) {
  return Math.round(n * 10) / 10;
}

export function expectedProspectAtSlot(slot) {
  const current = Math.max(50, Math.round(73 - slot * 0.4));
  const potential = Math.round(current + 12 - slot * 0.08);
  return { current, potential };
}

export function estimateDraftPickValue(pick, { currentYear } = {}) {
  const round = Number(pick?.round) === 2 ? 2 : 1;
  const protection = pick?.protection === "lottery-protected" ? "lottery-protected" : "unprotected";
  const profile = PICK_PROFILES[`${round}:${protection}`];
  const yearsOut = Math.max(1, (Number(pick?.year) || 0) - (Number(currentYear) || 0));
  const discount = YEARLY_DISCOUNT ** (yearsOut - 1);
  const prospect = expectedProspectAtSlot(profile.slot);
  const ovrEquivalent = round1(
    Math.max(0, prospect.potential - REPLACEMENT_POTENTIAL) * profile.convey * discount * VALUE_WEIGHT,
  );
  const conveyNote = profile.convey < 1
    ? `；约 ${Math.round(profile.convey * 100)}% 概率当年兑现（进乐透则顺延）`
    : "";
  return {
    year: pick?.year,
    round,
    protection,
    label: `${pick?.year ?? "未来"} 年${profile.label}`,
    expectedSlot: profile.slot,
    prospectCurrent: prospect.current,
    prospectPotential: prospect.potential,
    conveyChance: profile.convey,
    ovrEquivalent,
    explanation: `预计第 ${profile.slot} 顺位左右，可选到当前 OVR ~${prospect.current}、潜力 ~${prospect.potential} 的新秀${conveyNote}；折算约 +${ovrEquivalent} OVR 交易价值。`,
  };
}

export function totalPickValue(picks, options) {
  const items = (picks || []).map((pick) => estimateDraftPickValue(pick, options));
  return {
    items,
    total: round1(items.reduce((sum, item) => sum + item.ovrEquivalent, 0)),
  };
}
