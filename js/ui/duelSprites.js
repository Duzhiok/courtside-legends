/**
 * Legend Duel D3.2 — 2D character sprites (presentation only).
 *
 * A lightweight Stylized / Bobblehead figure for the takeover court: a big
 * head, a small body, a team-colour jersey — readable at 30-40px, no heavy
 * assets, no skeletal animation in v1. The sprite is a pure SVG string
 * built from a duelist's identity; it NEVER affects outcomes:
 *
 * - It reads team colours (js/data/teamColors.js) and the duelist's team
 *   (cardToDuelist carries `team` through from the roster row). No team
 *   data -> the neutral palette. No jersey numbers are invented (the
 *   roster has none, same rule as js/data/avatarArt.js).
 * - Action states are poses, not game state: they are derived from the
 *   takeover/DuelSim state the view already has (possession, lastShot,
 *   movement) by spriteActionFor(). The only outcome path stays
 *   DuelSim.playPossession(); the sprite never calls it and never reads a
 *   make probability.
 * - The skin tone is ONE generic stylized tone for v1. Real appearance
 *   (skin / hair / outfit from Code's avatar-identity slice) connects
 *   gradually AFTER that slice lands: duelSpriteHtml accepts an optional
 *   `appearance` input ({ skin, hair, jersey: { primary, secondary } } —
 *   plain CSS colours) and falls back to the generic figure for anything
 *   missing. Nothing here duplicates or invents that system; the My World
 *   avatar's look on the court is a later step, not this one.
 * - Poses are static SVG variants (different arm/leg paths per action)
 *   plus two CSS animations (a bob while moving, a bounce while
 *   celebrating) in css/duel.css. The ball is NOT part of the sprite —
 *   the separate .duel-ball element bounces while the ball-handler
 *   dribbles (class duel-ball--dribbling, also in css/duel.css).
 *
 * Action states:
 * - idle: standing, arms at the sides.
 * - moving: mid-stride arms/legs + a CSS bob (the controlled player just moved).
 * - dribbling: one arm down toward the ball (the ball-handler, live possession).
 * - shooting: release pose, both arms up (the just-resolved shot, still flashing).
 * - contesting: both arms up wide (the defender is within 6 court units —
 *   the D3.1 contest threshold — of the ball-handler).
 * - celebrate: arms up in a V + a CSS bounce (the result screen's winner).
 * "celebrate" is not produced by spriteActionFor — the result screen
 * passes it directly. The name tag is rendered by the caller (HTML), not
 * by the SVG, so this module needs no i18n.
 */
import { teamColors } from "../data/teamColors.js";

export const SPRITE_ACTIONS = Object.freeze([
  "idle",
  "moving",
  "dribbling",
  "shooting",
  "contesting",
  "celebrate",
]);

/** Generic stylized skin / hair for v1 (see the module comment). */
export const DEFAULT_SKIN = "#d9a066";
export const DEFAULT_HAIR = "#26221f";
const SHORTS = "#23272b";
const SHOE = "#f2f2f2";
const INK = "#26221f";

/** The D3.1 contest threshold: a defender this close is contesting. */
export const CONTEST_DISTANCE = 6;

const isHexColor = (value) => typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value);

/**
 * Appearance for one figure: team jersey (or neutral), skin, hair.
 * `opts.team` overrides `duelist.team`; `opts.appearance` (Code's
 * avatar-identity slice, later) overrides individual keys with plain CSS
 * colours. Anything missing falls back to the generic figure.
 */
export function spriteAppearance(duelist, opts = {}) {
  const team = teamColors(opts.team || duelist?.team);
  const ap = opts.appearance || {};
  return {
    primary: isHexColor(ap.jersey?.primary) ? ap.jersey.primary : team.primary,
    secondary: isHexColor(ap.jersey?.secondary) ? ap.jersey.secondary : team.secondary,
    skin: isHexColor(ap.skin) ? ap.skin : DEFAULT_SKIN,
    hair: isHexColor(ap.hair) ? ap.hair : DEFAULT_HAIR,
  };
}

/** Arm paths per action: [leftArm, rightArm] as "M x y L x y" (skin strokes). */
const ARMS = {
  idle: ["M15 31 L12 44", "M33 31 L36 44"],
  moving: ["M15 31 L10 40", "M33 31 L38 38"],
  dribbling: ["M15 31 L11 40", "M33 31 L38 48"],
  shooting: ["M15 31 L12 14", "M33 31 L36 12"],
  contesting: ["M15 31 L8 16", "M33 31 L40 16"],
  celebrate: ["M15 31 L10 12", "M33 31 L38 12"],
};

/** Leg paths per action: [leftLeg, rightLeg] + shoe centres. */
const LEGS = {
  idle: { paths: ["M20 52 L19 59", "M28 52 L29 59"], shoes: [[19, 60], [29, 60]] },
  moving: { paths: ["M20 52 L15 58", "M28 52 L33 58"], shoes: [[15, 59], [33, 59]] },
  dribbling: { paths: ["M20 52 L19 59", "M28 52 L29 59"], shoes: [[19, 60], [29, 60]] },
  shooting: { paths: ["M20 52 L19 57", "M28 52 L29 57"], shoes: [[19, 58], [29, 58]] },
  contesting: { paths: ["M20 52 L19 59", "M28 52 L29 59"], shoes: [[19, 60], [29, 60]] },
  celebrate: { paths: ["M20 52 L16 59", "M28 52 L32 59"], shoes: [[16, 60], [32, 60]] },
};

/**
 * Which action a court sprite shows, from live takeover/DuelSim state.
 * Pure: same inputs in, same action out. `shotActive` is true while the
 * just-resolved shot is still flashing (the view owns the ~900ms window);
 * `moving` is true while this marker's player was just moved (the view
 * owns the ~250ms window). Both are view-owned transients, not game state.
 * Priority: shooting > moving > contesting > dribbling > idle. During the
 * shot flash the non-shooter watches (idle) — the ball is in the air.
 * "celebrate" is not produced here; the result screen passes it directly.
 */
export function spriteActionFor({ takeover, myBall, side, moving = false, shotActive = false }) {
  const lastShot = takeover?.lastShot;
  if (shotActive && lastShot && lastShot.shooter === side) return "shooting";
  if (shotActive) return "idle";
  if (moving) return "moving";
  const ball = takeover?.ball;
  const defender = takeover?.defender;
  if (!ball || !defender) return "idle";
  const ballSide = myBall ? "a" : "b";
  if (side !== ballSide) {
    const defDist = Math.hypot(ball.x - defender.x, ball.y - defender.y);
    return defDist < CONTEST_DISTANCE ? "contesting" : "idle";
  }
  return "dribbling";
}

/**
 * Inline SVG for one duelist's court figure (bobblehead proportions,
 * viewBox 0 0 48 64). `opts.action` is one of SPRITE_ACTIONS (default
 * "idle"); `opts.team` / `opts.appearance` override the jersey / look
 * (see spriteAppearance). The SVG is sized by its parent (width/height
 * 100%); the name tag is the caller's job.
 */
export function duelSpriteHtml(duelist, opts = {}) {
  const action = SPRITE_ACTIONS.includes(opts.action) ? opts.action : "idle";
  const { primary, secondary, skin, hair } = spriteAppearance(duelist, opts);
  const arms = ARMS[action];
  const legs = LEGS[action];
  return [
    `<svg class="duel-sprite duel-sprite--${action}" data-action="${action}" viewBox="0 0 48 64" xmlns="http://www.w3.org/2000/svg" role="img" aria-hidden="true">`,
    `<g class="duel-sprite-figure">`,
    // Legs + shoes (behind the shorts).
    legs.paths.map((d) => `<path d="${d}" stroke="${SHORTS}" stroke-width="4.5" stroke-linecap="round" fill="none"/>`).join(""),
    legs.shoes.map(([cx, cy]) => `<ellipse cx="${cx}" cy="${cy}" rx="3" ry="1.8" fill="${SHOE}" stroke="${SHORTS}" stroke-width="0.5"/>`).join(""),
    // Jersey torso + trim, then shorts over the leg tops.
    `<rect x="14" y="28" width="20" height="20" rx="4" fill="${primary}"/>`,
    `<path d="M20 28 L24 33 L28 28" stroke="${secondary}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`,
    `<rect x="14.5" y="32" width="1.5" height="12" fill="${secondary}" opacity="0.8"/>`,
    `<rect x="32" y="32" width="1.5" height="12" fill="${secondary}" opacity="0.8"/>`,
    `<rect x="15" y="46" width="18" height="7" rx="2" fill="${SHORTS}"/>`,
    // Arms (skin strokes, in front of the jersey).
    arms.map((d) => `<path d="${d}" stroke="${skin}" stroke-width="4" stroke-linecap="round" fill="none"/>`).join(""),
    // Head: big circle, hair cap, headband, minimal face.
    `<rect x="22" y="26" width="4" height="4" fill="${skin}"/>`,
    `<circle cx="24" cy="15" r="12" fill="${skin}"/>`,
    `<rect x="15" y="3" width="18" height="9" rx="4.5" fill="${hair}"/>`,
    `<rect x="13.5" y="11.5" width="21" height="3.5" rx="1.75" fill="${secondary}"/>`,
    `<circle cx="20" cy="16" r="1.3" fill="${INK}"/>`,
    `<circle cx="28" cy="16" r="1.3" fill="${INK}"/>`,
    `<path d="M21 20.5 Q24 22.5 27 20.5" stroke="${INK}" stroke-width="1.2" fill="none" stroke-linecap="round"/>`,
    `</g>`,
    `</svg>`,
  ].join("");
}
