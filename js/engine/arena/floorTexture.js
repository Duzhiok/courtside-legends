/**
 * Procedural hardwood floor. `paintFloor` draws onto any 2D-canvas-like context (a recording fake in tests); `makeFloorTexture`
 * wraps it in a THREE.CanvasTexture. Deterministic: the same preset always paints the same boards (seeded by the arena id), so
 * screenshots, tests and two devices agree. Original artwork only: parquet / long-plank / herringbone grain, a painted key and
 * centre circle, an eight-point star and the game's own name on the apron. No team marks, no copied court designs.
 *
 * Canvas row 0 is the court's -z end (PlaneGeometry rotated -PI/2 puts texture-up at -z), column 0 is -x.
 */
import { hashSeed, seededStream } from "../../core/seededRandom.js";

const KEY_HALF_WIDTH_M = 2.44;
const KEY_LENGTH_M = 5.8;
const CENTER_CIRCLE_M = 1.8;

/** Multiply a #rrggbb colour's channels by (1 + delta): the cheap, deterministic way to vary one board from the next. */
export function shade(hex, delta) {
  const n = parseInt(String(hex).replace("#", ""), 16);
  const ch = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * (1 + delta))));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function planksParquet(ctx, g, rnd, wood) {
  // 0.6 m panels of four planks; neighbouring panels run at right angles (the classic basket-weave).
  const panel = 0.6;
  const cols = Math.ceil(g.planeW / panel);
  const rows = Math.ceil(g.planeH / panel);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const horizontal = (i + j) % 2 === 0;
      for (let k = 0; k < 4; k++) {
        ctx.fillStyle = shade(wood, (rnd() - 0.5) * 0.14);
        const x = i * panel * g.s;
        const y = j * panel * g.s;
        const w = panel * g.s;
        const t = (panel / 4) * g.s;
        if (horizontal) ctx.fillRect(x, y + k * t, w, t + 0.5);
        else ctx.fillRect(x + k * t, y, t + 0.5, w);
      }
    }
  }
}

function planksLong(ctx, g, rnd, wood) {
  // Boards run along the court (down the canvas), 0.14 m wide, each broken into 1.2-2.4 m lengths with its own tone.
  const board = 0.14 * g.s;
  for (let x = 0; x < g.width; x += board) {
    let y = -rnd() * 1.2 * g.s;
    while (y < g.height) {
      const len = (1.2 + rnd() * 1.2) * g.s;
      ctx.fillStyle = shade(wood, (rnd() - 0.5) * 0.16);
      ctx.fillRect(x, y, board + 0.5, len + 0.5);
      ctx.fillStyle = "rgba(60,35,15,0.28)";
      ctx.fillRect(x, y + len - 1, board, 1.5);
      y += len;
    }
    ctx.fillStyle = "rgba(60,35,15,0.18)";
    ctx.fillRect(x, 0, 1, g.height);
  }
}

function planksHerringbone(ctx, g, rnd, wood) {
  // 0.12 x 0.6 m planks laid at +/-45 degrees on a 0.42 m grid.
  const step = 0.42 * g.s;
  const len = 0.6 * g.s;
  const wid = 0.12 * g.s;
  for (let j = -1; j * step < g.height + step; j++) {
    for (let i = -1; i * step < g.width + step; i++) {
      ctx.save();
      ctx.translate(i * step + step / 2, j * step + step / 2);
      ctx.rotate(((i + j) % 2 === 0 ? 1 : -1) * (Math.PI / 4));
      for (let k = -1; k <= 1; k++) {
        ctx.fillStyle = shade(wood, (rnd() - 0.5) * 0.16);
        ctx.fillRect(-len / 2, k * wid - wid / 2, len, wid - 0.8);
      }
      ctx.restore();
    }
  }
}

const PATTERNS = { parquet: planksParquet, "long-plank": planksLong, herringbone: planksHerringbone };

function star(ctx, cx, cy, outer, inner, points = 8) {
  ctx.beginPath();
  for (let i = 0; i < points * 2; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = (Math.PI * i) / points - Math.PI / 2;
    ctx.lineTo(cx + r * Math.cos(a), cy + r * Math.sin(a));
  }
  ctx.closePath();
  ctx.fill();
}

/**
 * Paint the whole floor texture.
 * @param ctx    2D context of a width x height canvas
 * @param preset an arena preset (only preset.id and preset.floor are read)
 * @param dims   { width, height, halfW, halfL, planeW, planeH } in pixels / metres: the playing area is +/-halfW x +/-halfL
 *               centred in a planeW x planeH floor
 */
export function paintFloor(ctx, preset, dims) {
  const { width, height, halfW, halfL, planeW, planeH } = dims;
  const g = { width, height, planeW, planeH, s: width / planeW };
  const f = preset.floor;
  const rnd = seededStream(hashSeed(`arena-floor:${preset.id}`));
  const mx = (x) => (x + planeW / 2) * g.s;
  const mz = (z) => (z + planeH / 2) * g.s;

  ctx.fillStyle = f.wood;
  ctx.fillRect(0, 0, width, height);
  (PATTERNS[f.pattern] || planksLong)(ctx, g, rnd, f.wood);

  // The apron outside the boundary lines is tinted so the court reads as a court.
  ctx.fillStyle = shade(f.border, 0);
  ctx.globalAlpha = 0.62;
  ctx.fillRect(0, 0, width, mz(-halfL));
  ctx.fillRect(0, mz(halfL), width, height - mz(halfL));
  ctx.fillRect(0, mz(-halfL), mx(-halfW), mz(halfL) - mz(-halfL));
  ctx.fillRect(mx(halfW), mz(-halfL), width - mx(halfW), mz(halfL) - mz(-halfL));

  // Painted keys and centre circle: the grain still shows through.
  ctx.fillStyle = f.paint;
  ctx.globalAlpha = 0.9;
  for (const s of [-1, 1]) {
    const base = s * halfL;
    const ft = base - s * KEY_LENGTH_M;
    ctx.fillRect(mx(-KEY_HALF_WIDTH_M), Math.min(mz(base), mz(ft)), (KEY_HALF_WIDTH_M * 2) * g.s, KEY_LENGTH_M * g.s);
  }
  ctx.beginPath();
  ctx.arc(mx(0), mz(0), CENTER_CIRCLE_M * g.s, 0, Math.PI * 2);
  ctx.fill();

  // Centre emblem and the game's own name on both baselines.
  ctx.globalAlpha = 1;
  ctx.fillStyle = f.lines;
  star(ctx, mx(0), mz(0), CENTER_CIRCLE_M * 0.62 * g.s, CENTER_CIRCLE_M * 0.28 * g.s);
  ctx.font = `bold ${Math.round(0.42 * g.s)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.globalAlpha = 0.85;
  for (const s of [-1, 1]) ctx.fillText("COURTSIDE LEGENDS", mx(0), mz(s * (halfL + (planeH / 2 - halfL) / 2)));
  ctx.globalAlpha = 1;
}

/** Draw the preset's floor into a canvas and return a THREE.CanvasTexture, or null when there is no DOM/2D context (tests, SSR). */
export function makeFloorTexture(T, doc, preset, court, widthPx) {
  if (!doc?.createElement || !T?.CanvasTexture) return null;
  const canvas = doc.createElement("canvas");
  const width = Math.round(widthPx);
  const height = Math.round((width * court.planeH) / court.planeW);
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return null;
  try {
    paintFloor(ctx, preset, { ...court, width, height });
  } catch {
    return null; // decoration must never break the match view: the caller falls back to a flat wood colour
  }
  const tex = new T.CanvasTexture(canvas);
  if (T.SRGBColorSpace) tex.colorSpace = T.SRGBColorSpace;
  tex.anisotropy = 4;
  tex.needsUpdate = true;
  return tex;
}
