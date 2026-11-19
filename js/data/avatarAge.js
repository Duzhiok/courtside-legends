/**
 * Avatar Creator 2.0, appearance age. A look field (`appearanceAge`, 18..65) that is SEPARATE from a Player Reborn run's real age: it only decides how the
 * hair is drawn. What it does today, and nothing more: the hair and the eyebrows turn grey. There are no wrinkles, no skin ageing, no hairline change:
 * those need art that does not exist, so the editor says so instead of claiming them.
 *
 * Pure: no DOM, no storage. Graying runs from nothing at 34 to almost fully grey at 65 along a smooth curve, and mixes the chosen hair colour toward a
 * light grey, so black hair turns steel grey, blond turns silver, and hair that is already grey barely moves.
 */
export const AGE = Object.freeze({ min: 18, max: 65, default: 28 });
export const GRAY_FROM = 34;          // no grey up to and including this age
export const GRAY_HEX = "#cfd2d6";
export const GRAY_MAX = 0.94;         // never a pure flat grey: a little of the natural colour stays

/** Whitelist a stored age. Junk, missing and the default age are all "no age set" (null), so an untouched look stays byte-identical. */
export function sanitizeAge(raw) {
  const n = Number(raw);
  if (raw === null || raw === undefined || raw === "" || !Number.isFinite(n)) return null;
  const age = Math.min(AGE.max, Math.max(AGE.min, Math.round(n)));
  return age === AGE.default ? null : age;
}

const smooth = (t) => t * t * (3 - 2 * t);

/** 0 = natural colour, GRAY_MAX = as grey as it gets. */
export function grayFraction(age) {
  const a = Number.isFinite(Number(age)) ? Number(age) : AGE.default;
  if (a <= GRAY_FROM) return 0;
  return GRAY_MAX * smooth(Math.min(1, (a - GRAY_FROM) / (AGE.max - GRAY_FROM)));
}

const channels = (hex) => { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** `hex` mixed toward grey by the age's fraction. Age null / <= 34 returns the very same string. */
export function agedHex(hex, age) {
  const t = grayFraction(age);
  if (!t) return hex;
  const from = channels(hex);
  const to = channels(GRAY_HEX);
  return toHex(from.map((c, i) => c + (to[i] - c) * t));
}
