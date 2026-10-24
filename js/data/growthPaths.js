/**
 * 本命养成 growth paths. Shared by account.js (applying growth to a card) and
 * accountProgress.js (earning it), so neither has to import the other.
 */
export const GROWTH_PATHS = {
  shooter: { label: "射手", attrs: ["three", "mid", "scoring"] },
  playmaker: { label: "组织", attrs: ["pass", "iq", "clutch"] },
  defender: { label: "防守", attrs: ["defense", "steal", "block"] },
  inside: { label: "内线", attrs: ["paint", "rebound", "strength"] },
};

export const MAX_GROWTH_LEVEL = 10;
export const XP_PER_LEVEL = 100;
/** A favourite may outgrow their best real season, but only by this much. */
export const GROWTH_OVR_HEADROOM = 8;

/** Mutates a cloned card: +levels on each attribute of the chosen path. */
export function applyGrowth(player, growth) {
  const path = GROWTH_PATHS[growth?.path];
  const levels = Math.min(MAX_GROWTH_LEVEL, Math.max(0, growth?.levels || 0));
  if (!path || !levels) return player;
  for (const key of path.attrs) {
    if (player[key] == null) continue;
    player[key] = Math.min(100, Math.round(Number(player[key]) || 0) + levels);
  }
  player.growthLevel = levels;
  return player;
}
