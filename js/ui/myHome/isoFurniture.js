/**
 * Isometric art for every furniture id the shop sells (plus how each one reads in the room).
 * Floor pieces get (x, y, rot, ctx) and return an SVG group; wall pieces get (rect, ctx) in wall-local space.
 * Every group keeps `class="mw-furniture" data-furniture="<id>"` so the same hooks the shop QA uses still find it.
 */
import { WALL_H, box, circleAt, cupAt, faceL, faceR, poly, proj } from "./isoGeometry.js";

const group = (id, label, inner, extra = "") => `<g class="mw-furniture mh-piece" data-furniture="${id}" data-piece="${id}" aria-label="${label}"${extra}>${inner}</g>`;

/** Map a local (u along the piece, v across it) box to world coords for rot 0 / 1. */
const local = (x, y, rot) => (u, v, uw, vd) => (rot === 1 ? [x + v, y + u, vd, uw] : [x + u, y + v, uw, vd]);

const ball = (x, y, z, r = 9) =>
  `${circleAt(x, y, z, r, "#e2622b", 'stroke="#7a2e10" stroke-width="1.2"')}<path d="M${proj(x, y, z)[0] - r} ${proj(x, y, z)[1]}h${2 * r}M${proj(x, y, z)[0]} ${proj(x, y, z)[1] - r}v${2 * r}" stroke="#7a2e10" stroke-width="1"/>`;

const FLOOR_ART = {
  rug: (x, y, rot) => {
    const w = rot === 1 ? 2 : 3;
    const d = rot === 1 ? 3 : 2;
    const ring = Array.from({ length: 28 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2;
      return [x + w / 2 + Math.cos(a) * Math.min(w, d) * 0.3, y + d / 2 + Math.sin(a) * Math.min(w, d) * 0.3, 0.9];
    });
    return group(
      "rug",
      "Court Rug",
      `${poly([[x, y, 0.6], [x + w, y, 0.6], [x + w, y + d, 0.6], [x, y + d, 0.6]], "#1f4a35", 'stroke="#d6b25a" stroke-width="2"')}${poly([[x + 0.12, y + 0.12, 0.8], [x + w - 0.12, y + 0.12, 0.8], [x + w - 0.12, y + d - 0.12, 0.8], [x + 0.12, y + d - 0.12, 0.8]], "#2f6b4a")}${poly(ring, "none", 'stroke="#e9c46a" stroke-width="1.6"')}`,
    );
  },
  "trophy-cabinet": (x, y, rot, ctx) => {
    const cups = Math.min(ctx.trophyCount || 0, 3);
    const H = 108;
    let art = box(x + 0.08, y + 0.08, 0.84, 0.84, H, "#6b4a2b");
    art += faceL(x + 0.18, x + 0.82, y + 0.92, 14, H - 12, "#d7efe4", 'opacity=".55" stroke="#d6b25a" stroke-width="1.2"');
    art += faceR(y + 0.18, y + 0.82, x + 0.92, 14, H - 12, "#d7efe4", 'opacity=".4" stroke="#d6b25a" stroke-width="1"');
    for (const z of [44, 76]) art += `<line x1="${proj(x + 0.18, y + 0.92, z)[0]}" y1="${proj(x + 0.18, y + 0.92, z)[1]}" x2="${proj(x + 0.82, y + 0.92, z)[0]}" y2="${proj(x + 0.82, y + 0.92, z)[1]}" stroke="#8a6a3a" stroke-width="2"/>`;
    for (let i = 0; i < cups; i++) {
      const [sx, sy] = proj(x + 0.34 + i * 0.22, y + 0.92, 58 + (i % 2) * 32);
      art += cupAt(sx, sy, 0.95);
    }
    return group("trophy-cabinet", "Champion Trophy Cabinet", art);
  },
  bookshelf: (x, y, rot) => {
    const L = local(x, y, rot);
    const H = 70; // low bookcase: stays below the wall frames and the trophy shelf
    let art = box(...L(0, 0, 2, 0.5), H, "#7a5232");
    const rows = [10, 38];
    const colors = ["#1f4a35", "#d6b25a", "#b0452b", "#3b6fa6", "#f1e6cf", "#2f6b4a"];
    for (const z0 of rows) {
      for (let i = 0; i < 9; i++) {
        const u0 = 0.1 + i * 0.2;
        const c = colors[(i + z0) % colors.length];
        const tall = z0 + 20 + ((i * 7) % 5);
        art += rot === 1 ? faceR(y + u0, y + u0 + 0.16, x + 0.5, z0, tall, c, 'stroke="#1b1b1b" stroke-width=".6"') : faceL(x + u0, x + u0 + 0.16, y + 0.5, z0, tall, c, 'stroke="#1b1b1b" stroke-width=".6"');
      }
    }
    return group("bookshelf", "Bookshelf", art);
  },
  sofa: (x, y, rot) => {
    const L = local(x, y, rot);
    let art = box(...L(0, 0, 2, 0.3), 48, "#1f4a35");
    art += box(...L(0.15, 0.3, 1.7, 0.7), 18, "#2f6b4a");
    art += box(...L(0, 0.1, 0.22, 0.9), 30, "#1f4a35");
    art += box(...L(1.78, 0.1, 0.22, 0.9), 30, "#1f4a35");
    art += box(...L(1.3, 0.38, 0.3, 0.3), 12, "#d6b25a", { z0: 18 });
    return group("sofa", "Courtside Sofa", art);
  },
  "floor-lamp": (x, y) => {
    let art = box(x + 0.32, y + 0.32, 0.36, 0.36, 6, "#2a2a2a");
    art += box(x + 0.47, y + 0.47, 0.06, 0.06, 84, "#d6b25a", { z0: 6 });
    art += `<ellipse cx="${proj(x + 0.5, y + 0.5, 100)[0]}" cy="${proj(x + 0.5, y + 0.5, 100)[1] + 6}" rx="46" ry="30" fill="#ffe8a0" opacity=".16"/>`;
    art += box(x + 0.28, y + 0.28, 0.44, 0.44, 24, "#f1d98a", { z0: 86, opacity: 0.95 });
    return group("floor-lamp", "Floor Lamp", art);
  },
  "display-stand": (x, y) => {
    let art = box(x + 0.2, y + 0.2, 0.6, 0.6, 36, "#5a3d24");
    art += box(x + 0.2, y + 0.2, 0.6, 0.6, 30, "#cfe8dc", { z0: 36, opacity: 0.4, stroke: "#d6b25a" });
    art += ball(x + 0.5, y + 0.5, 52);
    return group("display-stand", "Display Stand", art);
  },
};

/** Wall-local art: `r` = { x, w } of the slot, y runs down from the wall top. */
const WALL_ART = {
  "star-poster": (r) => {
    const w = Math.min(r.w - 6, 44);
    const x = r.x + (r.w - w) / 2;
    const y = WALL_H - 138;
    const cx = x + w / 2;
    return group(
      "star-poster",
      "Star Poster",
      `<rect x="${x}" y="${y}" width="${w}" height="62" rx="2" fill="#f9f3e4" stroke="#8a6a3a" stroke-width="3"/><rect x="${x + 5}" y="${y + 5}" width="${w - 10}" height="52" fill="#d6b25a"/><circle cx="${cx}" cy="${y + 26}" r="12" fill="#e2622b" stroke="#7a2e10" stroke-width="1.6"/><path d="M${cx} ${y + 14}v24M${cx - 12} ${y + 26}h24" stroke="#7a2e10" stroke-width="1.4"/><polygon points="${cx},${y + 40} ${cx + 2},${y + 45} ${cx + 7},${y + 45} ${cx + 3},${y + 48} ${cx + 4.6},${y + 53} ${cx},${y + 50} ${cx - 4.6},${y + 53} ${cx - 3},${y + 48} ${cx - 7},${y + 45} ${cx - 2},${y + 45}" fill="#1f4a35"/>`,
    );
  },
  hoop: (r) => {
    const w = Math.min(r.w - 4, 44);
    const x = r.x + (r.w - w) / 2;
    const y = WALL_H - 132;
    const cx = x + w / 2;
    return group(
      "hoop",
      "Mini Basketball Hoop",
      `<rect x="${x}" y="${y}" width="${w}" height="34" rx="2" fill="#fff" stroke="#303030" stroke-width="2.5"/><rect x="${cx - 8}" y="${y + 14}" width="16" height="13" fill="none" stroke="#e2622b" stroke-width="2.2"/><ellipse cx="${cx}" cy="${y + 40}" rx="12" ry="3.6" fill="none" stroke="#e2622b" stroke-width="3"/><path d="M${cx - 11} ${y + 42}l4 15 7-11 7 11 4-15" fill="none" stroke="#fff" stroke-width="1.4"/>`,
    );
  },
};

export const floorArt = (id, x, y, rot, ctx) => (FLOOR_ART[id] ? FLOOR_ART[id](x, y, rot, ctx) : "");
export const wallArt = (id, rect) => (WALL_ART[id] ? WALL_ART[id](rect) : "");
