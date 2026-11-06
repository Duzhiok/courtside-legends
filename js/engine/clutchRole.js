/**
 * Role-aware clutch delivery (M2b-1, R165).
 *
 * "Make X take the shot" must be delivered the way basketball would deliver it to THAT kind of player,
 * not by handing everyone the ball. The role is derived from attributes that already exist on the card
 * (handle / offDribble / catchShoot / threeTend / offenseStyle / pass) and the coach's current orders
 * (aggressionLevel) -- no new player data, no new probabilities, no accuracy bonus.
 *
 * Delivery modes (all reuse GameSim mechanics that already exist):
 *   on_ball  the pick may become the ball handler (hand-off gate) -- creators and playmakers.
 *            A playmaker keeps his normal low-appetite behaviour, so he can still distribute.
 *   off_ball the pick is NOT promoted to ball handler; the possession runs a kick-out to him
 *            (catch-and-shoot), using the existing forced-possession kick chance + kick weight.
 *   entry    like off_ball, and the post-player kick-out penalty is waived for the pick (entry pass).
 */
export const CLUTCH_ROLES = Object.freeze(["creator", "playmaker", "catch_shoot", "post", "role_player"]);

export const CLUTCH_DELIVERY = Object.freeze({
  creator: "on_ball",
  playmaker: "on_ball",
  catch_shoot: "off_ball",
  role_player: "off_ball",
  post: "entry",
});

/** Thresholds are about "clearly this type", on the existing 0-100 card scale. */
export function classifyClutchRole(p, aggression = 0.55) {
  if (!p) return "role_player";
  if (p.offenseStyle === "post" || ((p.paint || 0) >= 80 && (p.threeTend ?? 30) < 20)) return "post";
  if ((p.handle || 0) >= 80 && (p.offDribble || 0) >= 80) return "creator";
  if (aggression <= 0.4 && (p.pass || 0) >= 70) return "playmaker"; // a real passer whose orders say: organise first
  if ((p.catchShoot || 0) >= 75 && (p.threeTend ?? 30) >= 35) return "catch_shoot";
  return "role_player";
}

export const deliveryOf = (role) => CLUTCH_DELIVERY[role] || "off_ball";
