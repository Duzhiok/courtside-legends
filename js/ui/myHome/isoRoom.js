/**
 * The My Home room as one isometric SVG (Home 2.0, H2). Used twice: the compact preview in My World
 * (no hit areas) and the full interactive room on the My Home screen (`interactive`). Everything shown
 * is real: trophies = the account's championship count, frames = its three best cards, furniture = what
 * the shop sold it, the podium = its portrait. Empty things stay visibly empty — nothing is invented.
 */
import { photoUrl } from "../../data/photo.js";
import { HOME_GRID, WALL_SLOTS, isFlat } from "../../data/homeLayout.js";
import { floorArt, wallArt } from "./isoFurniture.js";
import { GRID as N, TILE, VIEW_H, VIEW_W, WALL_H, cupAt, faceL, footprintPoly, poly, proj, shade, slotRect, wallGroup, wallX } from "./isoGeometry.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const T = (lang, zh, en) => (lang === "en" ? en : zh);
const WALL = "#f1e6cf";
const GREEN = "#1f4a35";
const GOLD = "#d6b25a";
let uidCounter = 0;

function shell() {
  const left = poly([[0, 0, WALL_H], [0, N, WALL_H], [0, N, 0], [0, 0, 0]], shade(WALL, 0.93));
  const right = poly([[0, 0, WALL_H], [N, 0, WALL_H], [N, 0, 0], [0, 0, 0]], shade(WALL, 0.82));
  // Green wainscot + gold rail on both walls, then a thin gold crown line.
  const wain =
    poly([[0, 0, 44], [0, N, 44], [0, N, 0], [0, 0, 0]], shade(GREEN, 0.95)) +
    poly([[0, 0, 44], [N, 0, 44], [N, 0, 0], [0, 0, 0]], shade(GREEN, 0.78)) +
    poly([[0, 0, 48], [0, N, 48], [0, N, 44], [0, 0, 44]], GOLD) +
    poly([[0, 0, 48], [N, 0, 48], [N, 0, 44], [0, 0, 44]], shade(GOLD, 0.8));
  const crown = poly([[0, 0, WALL_H], [0, N, WALL_H], [0, N, WALL_H - 5], [0, 0, WALL_H - 5]], GOLD) + poly([[0, 0, WALL_H], [N, 0, WALL_H], [N, 0, WALL_H - 5], [0, 0, WALL_H - 5]], shade(GOLD, 0.8));
  return left + right + wain + crown;
}

function floor() {
  let out = "";
  for (let x = 0; x < N; x++)
    for (let y = 0; y < N; y++)
      out += poly([[x, y, 0], [x + 1, y, 0], [x + 1, y + 1, 0], [x, y + 1, 0]], (x + y) % 2 ? "#c9954f" : "#bf8a44", 'stroke="#a9772f" stroke-width=".6"');
  // Floor edge thickness so the room reads as a block with depth.
  out += faceL(0, N, N, -8, 0, "#8a5a24") + poly([[N, 0, 0], [N, N, 0], [N, N, -8], [N, 0, -8]], "#6e461a");
  return out;
}

/** Left wall: the three best cards in frames (real photos), empty frames stay empty. */
function collectionWall(cards, lang, uid) {
  let out = "";
  for (let i = 0; i < 3; i++) {
    const a = 1.2 + (2 - i) * 1.2; // best card on the left as you look at the wall
    const x = wallX("left", a + 1);
    const y = WALL_H - 138;
    const card = cards[i];
    out += `<rect x="${x}" y="${y}" width="${TILE}" height="56" rx="2" fill="#2a1c10"/><rect x="${x + 3}" y="${y + 3}" width="${TILE - 6}" height="50" fill="${card ? "#14281d" : "#efe5cf"}"/>`;
    if (card) {
      out += `<clipPath id="mh-f${uid}-${i}"><rect x="${x + 3}" y="${y + 3}" width="${TILE - 6}" height="50"/></clipPath><image href="${esc(photoUrl(card))}" x="${x + 3}" y="${y + 3}" width="${TILE - 6}" height="50" preserveAspectRatio="xMidYMid slice" clip-path="url(#mh-f${uid}-${i})"><title>${esc(card.name)}</title></image>`;
    } else {
      out += `<title>${esc(T(lang, "空相框", "Empty frame"))}</title><circle cx="${x + TILE / 2}" cy="${y + 22}" r="7" fill="#c9b896"/><path d="M${x + 9} ${y + 50}c0-10 6-15 11-15s11 5 11 15z" fill="#c9b896"/>`;
    }
    out += `<rect x="${x + 6}" y="${y + 60}" width="${TILE - 12}" height="4" rx="1" fill="${GOLD}"/>`;
  }
  return wallGroup("left", out, "mh-collection");
}

/** Right wall: a shelf holding up to five real trophies. */
function trophyShelf(count, lang) {
  const x0 = wallX("right", 1.2);
  const x1 = wallX("right", 3.4);
  const y = WALL_H - 92;
  let out = `<rect x="${x0}" y="${y}" width="${x1 - x0}" height="6" rx="2" fill="#6b4a2b" stroke="#1b1b1b" stroke-width=".8"/><path d="M${x0 + 8} ${y + 6}l-5 12M${x1 - 8} ${y + 6}l5 12" stroke="#6b4a2b" stroke-width="3"/>`;
  const shown = Math.min(count, 5);
  for (let i = 0; i < shown; i++) out += `<g class="mh-cup">${cupAt(x0 + 16 + i * ((x1 - x0 - 32) / Math.max(shown - 1, 1) || 0), y - 1, 1.15)}</g>`;
  if (!count) out += `<text x="${(x0 + x1) / 2}" y="${y - 10}" text-anchor="middle" font-size="12" font-weight="600" fill="#8a6a3a">${esc(T(lang, "奖杯架还空着", "Trophy shelf is empty"))}</text>`;
  else if (count > 5) out += `<text x="${x1 - 6}" y="${y - 14}" text-anchor="end" font-size="13" font-weight="700" fill="#8a6a1f">×${count}</text>`;
  return wallGroup("right", out, "mh-trophies");
}

/** The avatar podium on the reserved front-left cell: the account portrait on a gold plinth. */
function podium({ portrait, name }, uid) {
  const cx = 0.5;
  const cy = 5.5;
  const [sx, sy] = proj(cx, cy, 0);
  const [, ty] = proj(cx, cy, 20);
  let out = `<ellipse cx="${sx}" cy="${sy + 3}" rx="30" ry="15" fill="#6b4a2b"/><ellipse cx="${sx}" cy="${ty}" rx="30" ry="15" fill="${GOLD}" stroke="#8a6a1f" stroke-width="1.5"/><rect x="${sx - 30}" y="${ty}" width="60" height="${sy + 3 - ty}" fill="${shade(GOLD, 0.75)}"/><ellipse cx="${sx}" cy="${sy + 3}" rx="30" ry="15" fill="${shade(GOLD, 0.62)}"/><ellipse cx="${sx}" cy="${ty}" rx="30" ry="15" fill="${GOLD}" stroke="#8a6a1f" stroke-width="1.5"/>`;
  if (portrait) {
    out += `<clipPath id="mh-p${uid}"><circle cx="${sx}" cy="${ty - 34}" r="26"/></clipPath><circle cx="${sx}" cy="${ty - 34}" r="29" fill="#f3d58a"/><image href="${esc(portrait)}" x="${sx - 26}" y="${ty - 60}" width="52" height="52" preserveAspectRatio="xMidYMid slice" clip-path="url(#mh-p${uid})"/>`;
  }
  out += `<text x="${sx}" y="${sy + 26}" text-anchor="middle" font-size="15" font-weight="700" fill="#14281d" stroke="#f6efe0" stroke-width="3" paint-order="stroke">${esc(name)}</text>`;
  return `<g class="mh-avatar-spot" data-spot="avatar">${out}</g>`;
}

/** Transparent hit areas (interactive room only): every floor cell and every wall slot. */
function hitAreas(selected, placedById) {
  let out = "";
  for (let x = 0; x < HOME_GRID; x++)
    for (let y = 0; y < HOME_GRID; y++) out += footprintPoly(x, y, 1, 1, "transparent", `class="mh-cell" data-cell="${x},${y}"`);
  for (const [slotId, slot] of Object.entries(WALL_SLOTS)) {
    const r = slotRect(slot);
    out += wallGroup(slot.side, `<rect class="mh-slot" data-slot="${slotId}" fill="transparent" x="${r.x}" y="${WALL_H - 142}" width="${r.w}" height="76" rx="3"/>`);
  }
  const sel = selected && placedById.get(selected);
  if (sel?.kind === "floor") out += footprintPoly(sel.x, sel.y, sel.w, sel.d, "rgba(233,196,106,.28)", 'class="mh-selected" stroke="#f4d98a" stroke-width="2.5" pointer-events="none"');
  if (sel?.kind === "wall") {
    const r = slotRect(WALL_SLOTS[sel.slot]);
    out += wallGroup(WALL_SLOTS[sel.slot].side, `<rect class="mh-selected" x="${r.x - 2}" y="${WALL_H - 144}" width="${r.w + 4}" height="80" rx="4" fill="rgba(233,196,106,.2)" stroke="#f4d98a" stroke-width="2.5" pointer-events="none"/>`);
  }
  return out;
}

/** Furniture draw order: rug first, then back-to-front so nearer pieces cover farther ones. */
const depth = (p) => p.x + p.y + p.w + p.d;

export function renderIsoRoom({ placed = [], trophyCount = 0, cards = [], portrait = null, name = "", lang = "zh", interactive = false, selectedId = null, label = "" } = {}) {
  const uid = ++uidCounter;
  const floorPieces = placed.filter((p) => p.kind === "floor").sort((a, b) => Number(isFlat(b.id)) - Number(isFlat(a.id)) || depth(a) - depth(b));
  const wallPieces = placed.filter((p) => p.kind === "wall");
  const ctx = { trophyCount };
  const byId = new Map(placed.map((p) => [p.id, p]));
  const art =
    shell() +
    collectionWall(cards, lang, uid) +
    trophyShelf(trophyCount, lang) +
    wallPieces.map((p) => wallGroup(WALL_SLOTS[p.slot].side, wallArt(p.id, slotRect(WALL_SLOTS[p.slot])))).join("") +
    floor() +
    floorPieces.map((p) => floorArt(p.id, p.x, p.y, p.rot, ctx)).join("") +
    podium({ portrait, name: name || T(lang, "访客球员", "Guest player") }, uid) +
    (interactive ? hitAreas(selectedId, byId) : "");
  return `<svg class="mh-room-svg${interactive ? " is-interactive" : ""}" viewBox="0 0 ${VIEW_W} ${VIEW_H}" role="img" aria-label="${esc(label || T(lang, "我的篮球房间", "My basketball room"))}" preserveAspectRatio="xMidYMid meet">${art}</svg>`;
}
