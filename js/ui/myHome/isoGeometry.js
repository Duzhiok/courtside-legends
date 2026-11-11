/**
 * Isometric geometry for the My Home room (pure strings, no DOM). Floor cell (x, y) maps to the screen with
 * the back corner at the top; the left wall runs along y (x = 0), the right wall along x (y = 0). z is height in px.
 * Faces that point at the viewer are the one at y + d (lower left) and the one at x + w (lower right).
 */
export const TILE = 40; // half-width of one floor tile on screen
export const WALL_H = 170;
export const GRID = 6;
export const OX = GRID * TILE + 10;
export const OY = WALL_H + 14;
export const VIEW_W = GRID * TILE * 2 + 20;
export const VIEW_H = OY + GRID * TILE + 16;

const r1 = (n) => Math.round(n * 10) / 10;
export const proj = (x, y, z = 0) => [OX + (x - y) * TILE, OY + ((x + y) * TILE) / 2 - z];
const pts = (list) => list.map(([x, y, z]) => proj(x, y, z || 0).map(r1).join(",")).join(" ");

export function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const c = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `#${[(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => c(v).toString(16).padStart(2, "0")).join("")}`;
}

export const poly = (list, fill, extra = "") => `<polygon points="${pts(list)}" fill="${fill}" ${extra}/>`;

/** Plane y = const, spanning x0..x1 and z0..z1. */
export const faceL = (x0, x1, y, z0, z1, fill, extra = "") => poly([[x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1]], fill, extra);
/** Plane x = const, spanning y0..y1 and z0..z1. */
export const faceR = (y0, y1, x, z0, z1, fill, extra = "") => poly([[x, y0, z0], [x, y1, z0], [x, y1, z1], [x, y0, z1]], fill, extra);

/** A solid box: top, lower-left face, lower-right face. `color` is the top colour. */
export function box(x, y, w, d, h, color, { z0 = 0, stroke = "#1b1b1b", opacity = 1 } = {}) {
  const st = `stroke="${stroke}" stroke-width="1" stroke-linejoin="round"${opacity < 1 ? ` opacity="${opacity}"` : ""}`;
  return [
    faceL(x, x + w, y + d, z0, z0 + h, shade(color, 0.8), st),
    faceR(y, y + d, x + w, z0, z0 + h, shade(color, 0.62), st),
    poly([[x, y, z0 + h], [x + w, y, z0 + h], [x + w, y + d, z0 + h], [x, y + d, z0 + h]], color, st),
  ].join("");
}

export const circleAt = (x, y, z, r, fill, extra = "") => {
  const [sx, sy] = proj(x, y, z);
  return `<circle cx="${r1(sx)}" cy="${r1(sy)}" r="${r}" fill="${fill}" ${extra}/>`;
};

/** A small gold trophy cup centred at a screen point. */
export const cupAt = (sx, sy, s = 1) =>
  `<g transform="translate(${r1(sx)} ${r1(sy)}) scale(${s})"><path d="M-6 -11h12v6q0 7-6 9-6-2-6-9z" fill="#e9c46a" stroke="#8a6a1f" stroke-width="1"/><path d="M-6 -9H-10q0 6 4 7M6 -9H10q0 6-4 7" fill="none" stroke="#8a6a1f" stroke-width="1.2"/><rect x="-1.5" y="4" width="3" height="4" fill="#c9a24a"/><rect x="-5" y="8" width="10" height="3" rx="1" fill="#8a5a24"/></g>`;

/** Wall-local drawing space: x runs along the wall in px, y runs down from the wall top. */
export function wallGroup(side, inner, cls = "") {
  const t = side === "left" ? `matrix(1 -0.5 0 1 ${r1(OX - TILE * GRID)} ${r1(OY + (TILE / 2) * GRID - WALL_H)})` : `matrix(1 0.5 0 1 ${r1(OX)} ${r1(OY - WALL_H)})`;
  return `<g transform="${t}"${cls ? ` class="${cls}"` : ""}>${inner}</g>`;
}

/** Local x of a wall position u (in tile units): the left wall is mirrored so the picture reads left-to-right. */
export const wallX = (side, u) => (side === "left" ? (GRID - u) * TILE : u * TILE);
/** Local rect of a slot: { x, w } in px. */
export const slotRect = (slot) => {
  const a = wallX(slot.side, slot.u);
  const b = wallX(slot.side, slot.u + slot.w);
  return { x: Math.min(a, b), w: Math.abs(b - a) };
};

/** Diamond outline of a floor footprint. */
export const footprintPoly = (x, y, w, d, fill, extra = "") => poly([[x, y, 0.4], [x + w, y, 0.4], [x + w, y + d, 0.4], [x, y + d, 0.4]], fill, extra);
