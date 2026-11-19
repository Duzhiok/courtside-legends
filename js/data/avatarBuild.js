/**
 * Avatar Creator 2.0, continuous body build (2D figure). Pure data: ranges, validation, and the conversion between the five editor sliders and the
 * body-shape deltas that js/ui/avatar2d/avatar2dShape.js draws.
 *
 * The build is APPEARANCE ONLY. `height` is a drawing scale, not the player's height: it never reaches GameSim, ratings, rebounds, blocks or any
 * other ability. The 3D figure ignores it (it keeps using the Standard / Broad / Slim preset bones).
 *
 * Sliders are 0..100 around 50 = the figure as drawn, and height is in centimetres. A part's slider end moves it by BUILD_RANGE of its own size.
 */
export const HEIGHT_CM = Object.freeze({ min: 150, max: 220, default: 185 });
export const SLIDER = Object.freeze({ min: 0, max: 100, mid: 50 });
export const BUILD_KEYS = Object.freeze(["height", "shoulders", "waist", "arms", "legs"]);
export const DEFAULT_BUILD = Object.freeze({ height: HEIGHT_CM.default, shoulders: SLIDER.mid, waist: SLIDER.mid, arms: SLIDER.mid, legs: SLIDER.mid });

/**
 * How far one slider end moves its part, as a fraction of that part's own width: shoulders / waist = the width of those rows, arms = the thickness of each
 * arm (the arm grows away from the torso), legs = the thickness of each leg (each leg grows about its own centre line, so the legs do not spread apart).
 */
export const BUILD_RANGE = Object.freeze({ shoulders: 0.24, waist: 0.14, arms: 0.30, legs: 0.30 });
// Waist and arms were 0.22 and 0.36 until the extremes were seen on the real art: at the ends the arm was a sausage and the hands stood out from the shorts.
// 0.30 for the arms is the Broad preset's own arm size, 0.14 covers the Slim / Broad waist (-0.12 / +0.10): the ends of the slider are now the largest looks the art carries well.

const clampInt = (value, min, max, fallback) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, Math.round(n))) : fallback;
};

const sameBuild = (a, b) => BUILD_KEYS.every((key) => a?.[key] === b?.[key]);

/** Whitelist a stored build. Any slider that is missing or junk becomes its default; a build equal to the default is no build at all (null). */
export function sanitizeBuild(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const build = { height: clampInt(raw.height, HEIGHT_CM.min, HEIGHT_CM.max, HEIGHT_CM.default) };
  for (const key of BUILD_KEYS.slice(1)) build[key] = clampInt(raw[key], SLIDER.min, SLIDER.max, SLIDER.mid);
  return sameBuild(build, DEFAULT_BUILD) ? null : build;
}

/** Slider position -> signed fraction of the part's size (-range .. +range). */
const delta = (value, key) => ((value - SLIDER.mid) / SLIDER.mid) * BUILD_RANGE[key];

/** The body-shape deltas of a build (avatar2dShape.js reads these; `height` is relative to the default height). */
export function shapeFromBuild(build) {
  const b = { ...DEFAULT_BUILD, ...(build || {}) };
  return {
    shoulders: delta(b.shoulders, "shoulders"),
    arms: delta(b.arms, "arms"),
    waist: delta(b.waist, "waist"),
    legs: delta(b.legs, "legs"),
    height: b.height / HEIGHT_CM.default - 1,
  };
}

/** The sliders that show a preset (Standard / Broad / Slim) so the editor opens on the figure the player sees. */
export function buildFromShape(shape) {
  const s = shape || {};
  const slider = (key) => clampInt(SLIDER.mid + ((s[key] || 0) / BUILD_RANGE[key]) * SLIDER.mid, SLIDER.min, SLIDER.max, SLIDER.mid);
  return {
    height: clampInt(HEIGHT_CM.default * (1 + (s.height || 0)), HEIGHT_CM.min, HEIGHT_CM.max, HEIGHT_CM.default),
    shoulders: slider("shoulders"),
    waist: slider("waist"),
    arms: slider("arms"),
    legs: slider("legs"),
  };
}
