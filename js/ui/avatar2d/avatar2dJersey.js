/**
 * Putting an owned jersey on the 2D figure. Pure: a template in, a small "kit" out; no storage, no new look field.
 *
 * The art set has ONE cut ("jersey", measured on the Style A master), so a jersey changes the three tint slots the cut already
 * has (shirt, shorts, trim) and gets its number painted on the chest. That is a faithful look for a colourway and a number, and an
 * honest approximation for a silhouette: a template whose family is not the art's family is flagged `simplified` so the UI says so
 * instead of pretending a retro cut was drawn. A template with no number (a story jersey: the data states none) draws none.
 */
const HEX6 = /^#[0-9a-fA-F]{6}$/;

/** The silhouette family the single 2D cut is judged to be (by eye on the master: fitted torso, wide armholes, knee-high shorts). */
export const ART_FAMILY = "modern_fitted";

/** Where the number sits, in art-canvas pixels: shirt bbox x 373..649 (centre 511), y 272..646; chest is ~260 wide below the V-neck (y>422). */
export const NUMBER_ANCHOR = Object.freeze({ x: 511, y: 462, size: 100, maxWidth: 200 });

const cleanNumber = (n) => {
  if (n === null || n === undefined || n === "") return null;
  const v = Number(n);
  return Number.isInteger(v) && v >= 0 && v <= 99 ? String(v) : null;
};

/**
 * @returns {{ shirt:string, pants:string, trim:string, number:string|null, family:string|null, simplified:boolean }|null}
 * null when the template has no usable colours (the figure then simply keeps its normal outfit).
 */
export function jerseyKit(template) {
  const c = template?.colors;
  if (!c || ![c.primary, c.secondary, c.trim].every((h) => HEX6.test(h || ""))) return null;
  const family = typeof template.family === "string" ? template.family : null;
  return { shirt: c.primary, pants: c.secondary, trim: c.trim, number: cleanNumber(template.number), family, simplified: family !== ART_FAMILY };
}

/** Paint the chest number on a CANVAS-sized context. @returns {boolean} whether anything was drawn */
export function paintJerseyNumber(ctx, kit) {
  if (!kit?.number || typeof ctx?.fillText !== "function") return false;
  const { x, y, size, maxWidth } = NUMBER_ANCHOR;
  ctx.save();
  ctx.font = `bold ${size}px Impact, "Arial Black", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.round(size * 0.1);
  ctx.strokeStyle = kit.pants;   // the outline uses the shorts colour so a light number stays readable on a light shirt and vice versa
  ctx.fillStyle = kit.trim;
  ctx.strokeText(kit.number, x, y, maxWidth);
  ctx.fillText(kit.number, x, y, maxWidth);
  ctx.restore();
  return true;
}
