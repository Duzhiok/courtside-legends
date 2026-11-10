/**
 * Furniture SVG registry (Economy workstream, 2026-11-09): every furniture item the
 * shop sells has a real SVG group in the My Home room's 600x240 coordinate space
 * (the same space as ROOM_SVG in js/ui/myWorldView.js), drawn in the room's flat
 * style (solid fills, dark outlines, gold accents). The shop dialog previews each
 * piece cropped to its own viewBox and renders a whole-room preview of everything
 * the account owns — so a furniture purchase is visibly placed, not just a flag.
 *
 * INTEGRATION for workstream D (owns js/ui/myWorldView.js): homeSceneHtml currently
 * hardcodes one check — `furniture.includes("trophy-cabinet")` — and appends
 * TROPHY_CABINET_SVG. Replace that with:
 *
 *   import { roomFurnitureSvg } from "./shopFurniture.js";
 *   const roomSvg = ROOM_SVG.replace("</svg>", `${roomFurnitureSvg(furniture)}</svg>`);
 *
 * roomFurnitureSvg renders the rug first (everything else sits on it), then the
 * rest in catalog order, skipping unknown ids. The cabinet group stays exported
 * from myWorldView.js (single source) and is re-exported here through
 * furnitureSvgFor("trophy-cabinet") so the registry is complete.
 *
 * Coordinates were picked against the existing room art so nothing overlaps:
 * picture frame 26–112, TV 470–554, plant 560–580, armchair 426–500, shoes
 * 196–318, basketball 381–411, cabinet 502–552.
 */
import { TROPHY_CABINET_SVG } from "./myWorldView.js";

/** New furniture groups: { svg, viewBox } — viewBox crops the shop preview to the piece. */
const NEW_FURNITURE = Object.freeze({
  sofa: {
    viewBox: "104 166 97 62",
    svg: `<g class="mw-furniture" data-furniture="sofa" aria-label="Courtside Sofa">
  <rect x="112" y="172" width="81" height="28" rx="6" fill="#1f4a35" stroke="#2a2a2a" stroke-width="2"/>
  <rect x="128" y="176" width="49" height="4" rx="2" fill="#d6b25a"/>
  <rect x="112" y="186" width="14" height="22" rx="4" fill="#1f4a35" stroke="#2a2a2a" stroke-width="2"/>
  <rect x="179" y="186" width="14" height="22" rx="4" fill="#1f4a35" stroke="#2a2a2a" stroke-width="2"/>
  <rect x="128" y="188" width="49" height="14" rx="4" fill="#2f6b4a" stroke="#2a2a2a" stroke-width="1.5"/>
  <line x1="152" y1="188" x2="152" y2="202" stroke="#2a2a2a" stroke-width="1.5"/>
  <rect x="112" y="196" width="81" height="14" rx="4" fill="#14281d" stroke="#2a2a2a" stroke-width="2"/>
  <rect x="118" y="210" width="6" height="12" fill="#5a3d24"/>
  <rect x="181" y="210" width="6" height="12" fill="#5a3d24"/>
</g>`,
  },
  "star-poster": {
    viewBox: "124 22 82 76",
    svg: `<g class="mw-furniture" data-furniture="star-poster" aria-label="Star Poster">
  <rect x="132" y="30" width="66" height="60" rx="3" fill="#f9f3e4" stroke="#8a6a3a" stroke-width="3"/>
  <rect x="138" y="36" width="54" height="48" fill="#d6b25a"/>
  <circle cx="165" cy="54" r="12" fill="#e2622b" stroke="#7a2e10" stroke-width="2"/>
  <path d="M165 42v24M153 54h24" stroke="#7a2e10" stroke-width="2"/>
  <polygon points="165,70 167.2,75 172.5,75 168.5,78.4 170,83.5 165,80.5 160,83.5 161.5,78.4 157.5,75 162.8,75" fill="#1f4a35"/>
</g>`,
  },
  hoop: {
    viewBox: "344 24 62 80",
    svg: `<g class="mw-furniture" data-furniture="hoop" aria-label="Mini Basketball Hoop">
  <rect x="352" y="32" width="48" height="38" rx="3" fill="#ffffff" stroke="#303030" stroke-width="3"/>
  <rect x="368" y="48" width="16" height="14" fill="none" stroke="#e2622b" stroke-width="2.5"/>
  <ellipse cx="376" cy="72" rx="12" ry="3.5" fill="none" stroke="#e2622b" stroke-width="3"/>
  <path d="M366 74l4 16 6-12 6 12 4-16" fill="none" stroke="#ffffff" stroke-width="1.5"/>
</g>`,
  },
  "floor-lamp": {
    viewBox: "464 106 42 132",
    svg: `<g class="mw-furniture" data-furniture="floor-lamp" aria-label="Floor Lamp">
  <ellipse cx="485" cy="120" rx="20" ry="14" fill="#ffe9a8" opacity="0.5"/>
  <path d="M472 118h26l6 20H466z" fill="#f4d98a" stroke="#8a6a3a" stroke-width="2"/>
  <line x1="485" y1="138" x2="485" y2="226" stroke="#4a3b24" stroke-width="3"/>
  <ellipse cx="485" cy="230" rx="12" ry="4" fill="#5a3d24" stroke="#2a2a2a" stroke-width="1.5"/>
</g>`,
  },
  "display-stand": {
    viewBox: "324 132 60 106",
    svg: `<g class="mw-furniture" data-furniture="display-stand" aria-label="Card Display Stand">
  <circle cx="354" cy="142" r="7" fill="#e2622b" stroke="#7a2e10" stroke-width="1.5"/>
  <path d="M354 135v14M347 142h14" stroke="#7a2e10" stroke-width="1.5"/>
  <rect x="334" y="152" width="40" height="52" rx="3" fill="#f9f3e4" stroke="#d6b25a" stroke-width="2" opacity="0.92"/>
  <rect x="340" y="160" width="28" height="36" rx="2" fill="#1f4a35" stroke="#2a2a2a" stroke-width="1.5"/>
  <circle cx="354" cy="172" r="6" fill="#f4d98a"/>
  <rect x="346" y="182" width="16" height="3" fill="#d6b25a"/>
  <rect x="330" y="204" width="48" height="26" rx="3" fill="#5a3d24" stroke="#2a2a2a" stroke-width="2"/>
  <rect x="330" y="204" width="48" height="4" fill="#d6b25a"/>
</g>`,
  },
  rug: {
    viewBox: "109 202 97 40",
    svg: `<g class="mw-furniture" data-furniture="rug" aria-label="Basketball Rug">
  <rect x="115" y="210" width="85" height="24" rx="12" fill="#1f4a35" stroke="#d6b25a" stroke-width="2"/>
  <ellipse cx="157" cy="222" rx="26" ry="7" fill="none" stroke="#d6b25a" stroke-width="1.5"/>
  <line x1="157" y1="215" x2="157" y2="229" stroke="#d6b25a" stroke-width="1"/>
</g>`,
  },
  bookshelf: {
    viewBox: "209 39 72 87",
    svg: `<g class="mw-furniture" data-furniture="bookshelf" aria-label="Basketball Bookshelf">
  <rect x="217" y="47" width="56" height="73" rx="3" fill="#5a3d24" stroke="#2a2a2a" stroke-width="2"/>
  <rect x="222" y="52" width="46" height="24" fill="#f9f3e4"/>
  <rect x="222" y="82" width="46" height="24" fill="#f9f3e4"/>
  <rect x="226" y="56" width="6" height="20" fill="#a31621"/>
  <rect x="234" y="56" width="6" height="20" fill="#1f6b45"/>
  <rect x="242" y="56" width="6" height="20" fill="#d6b25a"/>
  <rect x="250" y="56" width="6" height="20" fill="#e2622b"/>
  <rect x="258" y="60" width="6" height="16" fill="#5b2a86" transform="rotate(8 261 68)"/>
  <rect x="226" y="86" width="6" height="20" fill="#0f766e"/>
  <rect x="234" y="86" width="6" height="20" fill="#e85d04"/>
  <circle cx="256" cy="96" r="7" fill="#e2622b" stroke="#7a2e10" stroke-width="1.5"/>
  <line x1="222" y1="79" x2="268" y2="79" stroke="#8a6a3a" stroke-width="2"/>
  <line x1="222" y1="109" x2="268" y2="109" stroke="#8a6a3a" stroke-width="2"/>
</g>`,
  },
});

/** The cabinet group stays exported from myWorldView.js (single source); read lazily so the myWorldView <-> shopFurniture import cycle never hits the TDZ at module load. */
const CABINET_VIEWBOX = "490 140 70 100";
const cabinetSvg = () => TROPHY_CABINET_SVG;

/** SVG group for one furniture id, or "" when unknown (never throws on bad data). */
export function furnitureSvgFor(furnitureId) {
  if (furnitureId === "trophy-cabinet") return cabinetSvg();
  return NEW_FURNITURE[furnitureId]?.svg || "";
}

/** Crop box for the shop's single-item preview. */
export function furnitureViewBox(furnitureId) {
  if (furnitureId === "trophy-cabinet") return CABINET_VIEWBOX;
  return NEW_FURNITURE[furnitureId]?.viewBox || "0 0 600 240";
}

/** Furniture ids this registry can draw (cabinet + the new pieces). */
export function furnitureIds() {
  return ["trophy-cabinet", ...Object.keys(NEW_FURNITURE)];
}

/**
 * All groups for a list of owned furniture ids, rug first (everything else sits
 * on it), then catalog order, deduped. Unknown ids are skipped, so a stale save
 * can never break the room.
 */
export function roomFurnitureSvg(furnitureIds) {
  const ids = [...new Set(furnitureIds || [])];
  const ordered = [
    ...(ids.includes("rug") ? ["rug"] : []),
    ...ids.filter((id) => id !== "rug"),
  ];
  return ordered.map((id) => furnitureSvgFor(id)).filter(Boolean).join("");
}

/**
 * Standalone room preview for the shop dialog: a simplified backdrop (same wall /
 * floor bands as the real room, without its props) with the owned furniture placed
 * at their real coordinates. The backdrop is a preview approximation — the real
 * My Home room (workstream D) renders the same groups over the full ROOM_SVG.
 */
export function roomPreviewSvg(furnitureIds) {
  const groups = roomFurnitureSvg(furnitureIds);
  return `<svg class="shop-room-preview-svg" viewBox="0 0 600 240" role="img" aria-label="My Home preview">
  <rect width="600" height="158" fill="#f1e6cf"/>
  <rect y="120" width="600" height="38" fill="#1f4a35"/>
  <rect y="116" width="600" height="6" fill="#d6b25a"/>
  <rect y="158" width="600" height="82" fill="#c9954f"/>
  ${groups || `<text x="300" y="120" text-anchor="middle" fill="#8a6a3a" font-size="14">房间还空着 — 去商城买家具摆进来</text>`}
</svg>`;
}
