/**
 * 2D body shape: a controlled deformation of the composed avatar, so Standard / Broad / Slim (and later the continuous sliders) look different
 * in the default 2D renderer. The layered art has ONE body; this re-draws the finished composition in horizontal strips, each scaled sideways around
 * the body axis. The head and the feet are never scaled (a head is not wider on a broad man), the neck is left alone, and every region fades in and out
 * smoothly so there are no steps in the silhouette.
 *
 * Pure maths + one canvas pass; no storage, no new persistent field. `look.body` maps to the shape through BODY_PRESETS[].shape (js/data/avatarLook.js).
 * Rows are art-canvas rows (1024x1536), measured on the shipped art: head 73-280, shoulders ~300-560, arms hang along the torso 560-840,
 * waist and hips 840-1060, legs 1060-1390, feet 1390-1463, body axis x = 510.
 */
import { BODY_PRESETS } from "../../data/avatarLook.js";
import { CANVAS } from "./avatar2dLayers.js";

export const AXIS_X = 510;
export const FEET_Y = 1463;
/** Rows that may be re-shaped. Above it is the head and neck, below it the feet: both are copied untouched. */
export const RESHAPE_FROM = 285;
export const RESHAPE_TO = 1400;
export const STRIP = 2;

/** Each region: [zero below, full from, full until, zero above] in art rows. Regions add; a delta of 0.15 is +15% width at full strength. */
export const REGIONS = Object.freeze({
  shoulders: [285, 340, 520, 600],
  arms: [520, 580, 800, 870],
  waist: [800, 860, 1040, 1110],
  legs: [1040, 1110, 1330, 1400],
});
export const SHAPE_KEYS = Object.freeze([...Object.keys(REGIONS), "height"]);
export const NEUTRAL_SHAPE = Object.freeze({ shoulders: 0, arms: 0, waist: 0, legs: 0, height: 0 });

const smooth = (t) => t * t * (3 - 2 * t);
/** 0 outside [a, d], 1 inside [b, c], smooth ramps between. */
export function window4(y, [a, b, c, d]) {
  if (y <= a || y >= d) return 0;
  if (y < b) return smooth((y - a) / (b - a));
  if (y > c) return smooth((d - y) / (d - c));
  return 1;
}

/** Sideways scale of one art row for a shape. 1 = unchanged. */
export function rowScale(y, shape = NEUTRAL_SHAPE) {
  let s = 1;
  for (const key of Object.keys(REGIONS)) s += (shape[key] || 0) * window4(y, REGIONS[key]);
  return s;
}

/** The shape of a saved look: a known preset's, else the neutral one. Never throws on a junk look. */
export function shapeFromLook(look) {
  const preset = BODY_PRESETS.find((b) => b.id === look?.body);
  return { ...NEUTRAL_SHAPE, ...(preset?.shape || {}) };
}

export const isNeutralShape = (shape) => SHAPE_KEYS.every((key) => !shape?.[key]);

/**
 * Draw `src` (a CANVAS-sized canvas) onto `dst` with the shape applied. `height` is a uniform scale about the feet, so a taller figure grows
 * upward and the feet stay on the floor.
 */
export function applyBodyShape(src, dst, shape) {
  const { width, height } = CANVAS;
  const g = dst.getContext("2d");
  g.clearRect(0, 0, width, height);
  g.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in g) g.imageSmoothingQuality = "high";
  const h = 1 + (shape.height || 0);
  g.save();
  g.translate(AXIS_X * (1 - h), FEET_Y * (1 - h));
  g.scale(h, h);
  g.drawImage(src, 0, 0, width, RESHAPE_FROM, 0, 0, width, RESHAPE_FROM);                       // head and neck: untouched
  for (let y = RESHAPE_FROM; y < RESHAPE_TO; y += STRIP) {
    const s = rowScale(y + STRIP / 2, shape);
    g.drawImage(src, 0, y, width, STRIP, AXIS_X - AXIS_X * s, y, width * s, STRIP);
  }
  g.drawImage(src, 0, RESHAPE_TO, width, height - RESHAPE_TO, 0, RESHAPE_TO, width, height - RESHAPE_TO);   // feet: untouched
  g.restore();
}
