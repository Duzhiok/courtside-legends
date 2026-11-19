/**
 * 2D body shape: a controlled deformation of the composed avatar. The layered art has ONE body, so a build is made by re-drawing the finished
 * composition in horizontal strips, each strip cut into the parts that must move independently. This is a drawing deformation, not a skeleton or muscle
 * model: it does not pretend to sculpt anatomy, and it is appearance only (nothing here reaches GameSim or any ability).
 *
 * What each control moves, row by row on the shipped art (measured by scripts/measure/avatar-body-anchors.mjs, 1024x1536, body axis x = 510):
 *   shoulders, waist  the whole row scales sideways about the body axis (the torso, and the arms with it, get wider or narrower)
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
import { CANVAS, PORTRAIT_CROP } from "./avatar2dLayers.js";

export const AXIS_X = 510;
export const FEET_Y = 1463;
/** Rows that may be re-shaped. Above it is the head and neck, below it the feet: both are copied untouched. */
export const RESHAPE_FROM = 285;
export const RESHAPE_TO = 1400;
export const STRIP = 2;
/** The figure is drawn at this fraction of the art size, so a 220 cm figure (x1.19) still has its head under the top edge of the canvas. */
export const STAGE_FIT = 0.87;
const EDGE_PAD = 8;   // transparent pixels kept around an arm segment so its anti-aliased edge is not cut

/** Each region: [zero below, full from, full until, zero above] in art rows. */
export const REGIONS = Object.freeze({
  shoulders: [285, 340, 500, 760],   // fades slowly down the arms, so a narrow shoulder does not leave the arms bowed outward
  arms: [540, 620, 800, 880],       // starts below the shoulder cap: thickening the cap itself bows the arm like a sausage
  waist: [790, 850, 930, 1000],   // belt and shorts only: it ends where the thighs begin, so the waist never thickens a leg
  legs: [940, 1010, 1330, 1400],
});
export const NEUTRAL_SHAPE = Object.freeze({ shoulders: 0, arms: 0, waist: 0, legs: 0, height: 0 });

/** [y, leftOuter, leftInner, rightInner, rightOuter]: the skin of each arm, outside the clothes; "inner" is the edge nearest the torso. */
export const ARM_ANCHORS = Object.freeze([
  [520, 299, 378, 647, 724], [540, 293, 369, 655, 731], [560, 285, 365, 657, 738], [580, 280, 363, 657, 745], [600, 271, 361, 663, 745],
  [620, 271, 356, 667, 744], [640, 271, 348, 672, 744], [660, 271, 340, 681, 744], [680, 269, 333, 689, 744], [700, 269, 325, 698, 744],
  [720, 267, 317, 705, 743], [740, 261, 313, 707, 738], [760, 264, 323, 703, 742], [780, 265, 330, 692, 742], [800, 262, 333, 689, 743],
  [820, 260, 337, 683, 755], [840, 266, 340, 683, 755], [860, 277, 325, 696, 745], [880, 301, 332, 687, 715],
]);
/** [y, leftLegL, leftLegR, rightLegL, rightLegR]: the two legs. */
export const LEG_ANCHORS = Object.freeze([
  [900, 347, 500, 524, 679], [920, 343, 498, 526, 682], [940, 339, 496, 528, 685], [960, 369, 495, 528, 656], [980, 365, 466, 556, 657],
  [1000, 362, 462, 561, 659], [1020, 359, 455, 565, 659], [1040, 353, 447, 572, 664], [1060, 345, 439, 578, 671], [1080, 338, 439, 576, 677],
  [1100, 332, 441, 574, 684], [1120, 326, 443, 572, 687], [1140, 328, 440, 573, 688], [1160, 328, 434, 577, 687], [1180, 330, 425, 586, 683],
  [1200, 332, 418, 594, 679], [1220, 334, 413, 598, 679], [1240, 340, 405, 607, 673], [1260, 343, 400, 611, 670], [1280, 344, 398, 613, 668],
  [1300, 343, 396, 618, 670], [1320, 339, 396, 617, 675], [1340, 323, 404, 609, 691], [1360, 326, 404, 609, 689], [1380, 319, 406, 607, 695],
  [1400, 309, 409, 604, 706], [1420, 297, 411, 602, 720], [1440, 293, 387, 628, 726],
]);

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

/** Sideways scale of the whole row about the body axis (shoulders and waist only). 1 = unchanged. */
export function rowScale(y, shape = NEUTRAL_SHAPE) {
  return 1 + (shape.shoulders || 0) * window4(y, REGIONS.shoulders) + (shape.waist || 0) * window4(y, REGIONS.waist);
}

/**
 * How one art row is drawn: a list of { sx, sw, dx, dw } (cut `sw` pixels of the source row from `sx`, put them at `dx`, `dw` wide). Pure.
 * Without an arm or leg change this is one segment (the whole row scaled about the axis); with one it is the parts that move independently.
 */
export function rowOps(y, shape = NEUTRAL_SHAPE) {
  const W = CANVAS.width;
  const S = rowScale(y, shape);
  const f0 = (x) => AXIS_X + (x - AXIS_X) * S;
  const armK = 1 + (shape.arms || 0) * window4(y, REGIONS.arms);
  const legK = 1 + (shape.legs || 0) * window4(y, REGIONS.legs);
  if (legK !== 1) {
    const [a1, b1, a2, b2] = anchorsAt(LEG_ANCHORS, y);
    const c1 = (a1 + b1) / 2;
    const c2 = (a2 + b2) / 2;
    const mid = (b1 + a2) / 2;
    const k = S * legK;
    return [
      { sx: 0, sw: mid, dx: f0(c1) - c1 * k, dw: mid * k },
      { sx: mid, sw: W - mid, dx: f0(c2) + (mid - c2) * k, dw: (W - mid) * k },
    ];
  }
  if (armK !== 1) {
    const [oL, iL, iR, oR] = anchorsAt(ARM_ANCHORS, y);
    const sx0 = Math.max(0, oL - EDGE_PAD);
    const sx1 = Math.min(W, oR + EDGE_PAD);
    const kk = S * armK;
    return [
      { sx: sx0, sw: iL - sx0, dx: f0(iL) - (iL - sx0) * kk, dw: (iL - sx0) * kk },
      { sx: iL, sw: iR - iL, dx: f0(iL), dw: (iR - iL) * S },
      { sx: iR, sw: sx1 - iR, dx: f0(iR), dw: (sx1 - iR) * kk },
    ];
  }
  return [{ sx: 0, sw: W, dx: AXIS_X - AXIS_X * S, dw: W * S }];
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
export function portraitCropFor(shape) {
  const h = figureScale(shape);
  const { x, y, size } = PORTRAIT_CROP;
  return { x: AXIS_X + (x - AXIS_X) * h, y: FEET_Y + (y - FEET_Y) * h, size: size * h };
}

/** Draw `src` (a CANVAS-sized canvas) onto `dst` with the shape applied. The head and the feet are copied whole; only the body between is cut into parts. */
export function applyBodyShape(src, dst, shape) {
  const { width, height } = CANVAS;
  const g = dst.getContext("2d");
  g.clearRect(0, 0, width, height);
  g.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in g) g.imageSmoothingQuality = "high";
  const h = figureScale(shape);
  g.save();
  g.translate(AXIS_X * (1 - h), FEET_Y * (1 - h));
  g.scale(h, h);
  g.drawImage(src, 0, 0, width, RESHAPE_FROM, 0, 0, width, RESHAPE_FROM);                       // head and neck: untouched
  for (let y = RESHAPE_FROM; y < RESHAPE_TO; y += STRIP) {
    for (const op of rowOps(y + STRIP / 2, shape)) g.drawImage(src, op.sx, y, op.sw, STRIP, op.dx, y, op.dw, STRIP);
  }
  g.drawImage(src, 0, RESHAPE_TO, width, height - RESHAPE_TO, 0, RESHAPE_TO, width, height - RESHAPE_TO);   // feet: untouched
  g.restore();
}
