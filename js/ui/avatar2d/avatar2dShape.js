/**
 * 2D body shape: a controlled deformation of the composed avatar. The layered art has ONE body, so a build is made by re-drawing the finished
 * composition in horizontal strips, each strip cut into the parts that must move independently. This is a drawing deformation, not a skeleton or muscle
 * model: it does not pretend to sculpt anatomy, and it is appearance only (nothing here reaches GameSim or any ability).
 *
 * What each control moves, row by row on the shipped art (measured by scripts/measure/avatar-body-anchors.mjs, 1024x1536, body axis x = 510):
 *   shoulders         the whole row scales sideways about the body axis (the torso, and the arms with it, get wider or narrower)
 *   waist             the torso and shorts only. The arms and hands are NOT part of it: from the belt down they hang where the shoulders put them, and are
 *                     drawn over the shorts. (Scaling the whole row took the hands with it, and because the waist fades in over the very rows of the hand
 *                     the top of the hand moved less than the bottom: the hand was sheared into a claw and the wrist looked broken.)
 *   arms              each arm grows or shrinks in THICKNESS, away from the torso: its inner edge stays, the torso does not move
 *   legs              each leg scales about ITS OWN centre line, so the legs thicken without spreading apart
 *   height            a uniform scale about the feet: the feet stay on the floor and the head keeps its proportions (the head and neck are copied, never
 *                     stretched sideways)
 * Every region fades in and out smoothly, so there is no step in the silhouette.
 *
 * `STAGE_FIT` draws every figure a little smaller than the art so the tallest height (220 cm) still fits under the top of the canvas.
 */
import { BODY_PRESETS } from "../../data/avatarLook.js";
import { sanitizeBuild, shapeFromBuild } from "../../data/avatarBuild.js";
import { CANVAS } from "./avatar2dLayers.js";
import { ANCHORS } from "./avatar2dAnchors.js";

/** The male set of measured numbers (avatar2dAnchors.js). Every function below takes another presentation's set as its last argument and defaults to this one. */
const MALE = ANCHORS.male;
export const AXIS_X = MALE.axisX;
export const FEET_Y = 1463;
/** Rows that may be re-shaped. Above it is the head and neck, below it the feet: both are copied untouched. */
export const RESHAPE_FROM = 285;
export const RESHAPE_TO = 1400;
export const STRIP = 2;
/** The figure is drawn at this fraction of the art size, so a 220 cm figure (x1.19) still has its head under the top edge of the canvas. */
export const STAGE_FIT = 0.87;
const EDGE_PAD = 8;   // transparent pixels kept around an arm segment so its anti-aliased edge is not cut
/**
 * The arm anchors were measured on alpha > 40, so the faint anti-aliased fringe of a finger lies a few pixels PAST the measured inner edge. Left in the torso
 * segment, a narrower waist carried that fringe away from the hand as thin skin-coloured streaks. The arm segment therefore reaches this far past its inner
 * edge (into the gap or the very edge of the shorts), and the torso segment starts where it ends.
 */
export const ARM_INNER_PAD = 4;

export const REGIONS = MALE.regions;
/** Rows that contain an arm or a hand (the skin outside the clothes). */
export const ARM_ROWS = MALE.armRows;
export const NEUTRAL_SHAPE = Object.freeze({ shoulders: 0, arms: 0, waist: 0, legs: 0, height: 0 });

export const ARM_ANCHORS = MALE.armAnchors;
export const LEG_ANCHORS = MALE.legAnchors;

const smooth = (t) => t * t * (3 - 2 * t);
/** 0 outside [a, d], 1 inside [b, c], smooth ramps between. */
export function window4(y, [a, b, c, d]) {
  if (y <= a || y >= d) return 0;
  if (y < b) return smooth((y - a) / (b - a));
  if (y > c) return smooth((d - y) / (d - c));
  return 1;
}

/** The anchor numbers at row y, linearly between the sampled rows (clamped at both ends). */
export function anchorsAt(table, y) {
  if (y <= table[0][0]) return table[0].slice(1);
  const last = table[table.length - 1];
  if (y >= last[0]) return last.slice(1);
  let i = 0;
  while (table[i + 1][0] < y) i += 1;
  const [y0, ...a] = table[i];
  const [y1, ...b] = table[i + 1];
  const t = (y - y0) / (y1 - y0);
  return a.map((v, k) => v + (b[k] - v) * t);
}

/** Sideways scale of the torso row about the body axis (shoulders and waist). 1 = unchanged. */
export function rowScale(y, shape = NEUTRAL_SHAPE, A = MALE) {
  return 1 + (shape.shoulders || 0) * window4(y, A.regions.shoulders) + (shape.waist || 0) * window4(y, A.regions.waist);
}

/** The same for an arm: the shoulders carry it, the waist does not. */
export const armRowScale = (y, shape = NEUTRAL_SHAPE, A = MALE) => 1 + (shape.shoulders || 0) * window4(y, A.regions.shoulders);

/**
 * How one art row is drawn: a list of { sx, sw, dx, dw } (cut `sw` pixels of the source row from `sx`, put them at `dx`, `dw` wide). Pure.
 * Without an arm or leg change this is one segment (the whole row scaled about the axis); with one it is the parts that move independently.
 */
export function rowOps(y, shape = NEUTRAL_SHAPE, A = MALE) {
  const W = CANVAS.width;
  const AXIS = A.axisX;
  const S = rowScale(y, shape, A);
  const f0 = (x) => AXIS + (x - AXIS) * S;
  const armK = 1 + (shape.arms || 0) * window4(y, A.regions.arms);
  const legK = 1 + (shape.legs || 0) * window4(y, A.regions.legs);
  if (legK !== 1) {
    const [a1, b1, a2, b2] = anchorsAt(A.legAnchors, y);
    const c1 = (a1 + b1) / 2;
    const c2 = (a2 + b2) / 2;
    const mid = (b1 + a2) / 2;
    const k = S * legK;
    return [
      { sx: 0, sw: mid, dx: f0(c1) - c1 * k, dw: mid * k },
      { sx: mid, sw: W - mid, dx: f0(c2) + (mid - c2) * k, dw: (W - mid) * k },
    ];
  }
  const Sa = armRowScale(y, shape, A);
  if (y >= A.armRows[0] && y <= A.armRows[1] && (armK !== 1 || S !== Sa)) {
    const [oL, iL, iR, oR] = anchorsAt(A.armAnchors, y);
    const sx0 = Math.max(0, oL - EDGE_PAD);
    const sx1 = Math.min(W, oR + EDGE_PAD);
    const fa = (x) => AXIS + (x - AXIS) * Sa;   // an arm's inner edge: where the shoulders put it, whatever the waist does
    const kk = Sa * armK;
    const P = ARM_INNER_PAD;
    return [   // the torso first, the arms over it (as in the art, where the hands hang in front of the shorts)
      { sx: iL + P, sw: iR - iL - 2 * P, dx: f0(iL + P), dw: (iR - iL - 2 * P) * S },
      { sx: sx0, sw: iL + P - sx0, dx: fa(iL) - (iL - sx0) * kk, dw: (iL + P - sx0) * kk },
      { sx: iR - P, sw: sx1 - iR + P, dx: fa(iR) - P * kk, dw: (sx1 - iR + P) * kk },
    ];
  }
  return [{ sx: 0, sw: W, dx: AXIS - AXIS * S, dw: W * S }];
}

/** The shape of a saved look: its own sliders (`build`) if it has them, else its preset's, else the neutral one. Never throws on a junk look. */
export function shapeFromLook(look) {
  const build = sanitizeBuild(look?.build);
  if (build) return shapeFromBuild(build);
  const preset = BODY_PRESETS.find((b) => b.id === look?.body);
  return { ...NEUTRAL_SHAPE, ...(preset?.shape || {}) };
}

/** Drawing scale of the whole figure about the feet: the stage fit times the height. */
export const figureScale = (shape) => STAGE_FIT * (1 + (shape?.height || 0));

/** The portrait square, moved and sized with the figure so the head fills the same part of the picture whatever the height. */
export function portraitCropFor(shape, A = MALE) {
  const h = figureScale(shape);
  const { x, y, size } = A.portraitCrop;
  return { x: A.axisX + (x - A.axisX) * h, y: FEET_Y + (y - FEET_Y) * h, size: size * h };
}

/** Draw `src` (a CANVAS-sized canvas) onto `dst` with the shape applied. The head and the feet are copied whole; only the body between is cut into parts. */
export function applyBodyShape(src, dst, shape, A = MALE) {
  const { width, height } = CANVAS;
  const g = dst.getContext("2d");
  g.clearRect(0, 0, width, height);
  g.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in g) g.imageSmoothingQuality = "high";
  const h = figureScale(shape);
  g.save();
  g.translate(A.axisX * (1 - h), FEET_Y * (1 - h));
  g.scale(h, h);
  g.drawImage(src, 0, 0, width, RESHAPE_FROM, 0, 0, width, RESHAPE_FROM);                       // head and neck: untouched
  for (let y = RESHAPE_FROM; y < RESHAPE_TO; y += STRIP) {
    for (const op of rowOps(y + STRIP / 2, shape, A)) g.drawImage(src, op.sx, y, op.sw, STRIP, op.dx, y, op.dw, STRIP);
  }
  g.drawImage(src, 0, RESHAPE_TO, width, height - RESHAPE_TO, 0, RESHAPE_TO, width, height - RESHAPE_TO);   // feet: untouched
  g.restore();
}
