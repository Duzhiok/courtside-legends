/**
 * Furniture in the Shop: item thumbnails and the room preview. The art is the SAME isometric art the My Home
 * room draws (js/ui/myHome/isoFurniture.js), so what you buy looks exactly like what lands in your room.
 * Floor pieces are drawn on their own footprint; wall pieces on a flat wall panel.
 */
import { footprint, placementKind, resolveHome } from "../data/homeLayout.js";
import { floorArt, wallArt } from "./myHome/isoFurniture.js";
import { renderIsoRoom } from "./myHome/isoRoom.js";
import { WALL_H, proj } from "./myHome/isoGeometry.js";

/** Height in px of each floor piece (for cropping its thumbnail). */
const HEIGHT = Object.freeze({ rug: 4, "trophy-cabinet": 112, bookshelf: 72, sofa: 52, "floor-lamp": 116, "display-stand": 62 });
const WALL_THUMB = Object.freeze({ x: 0, w: 44, y: WALL_H - 146, h: 84 });

/** Ids this registry can draw. */
export const furnitureIds = () => Object.keys(HEIGHT).concat(["star-poster", "hoop"]);

/** SVG group for one furniture id, or "" when unknown (never throws on bad data). */
export function furnitureSvgFor(id) {
  const kind = placementKind(id);
  if (kind === "floor") return floorArt(id, 0, 0, 0, { trophyCount: 2 });
  if (kind === "wall") {
    const bg = `<rect x="${WALL_THUMB.x - 4}" y="${WALL_THUMB.y - 4}" width="${WALL_THUMB.w + 8}" height="${WALL_THUMB.h + 8}" rx="6" fill="#f1e6cf"/>`;
    return bg + wallArt(id, { x: WALL_THUMB.x, w: WALL_THUMB.w });
  }
  return "";
}

/** Crop box for the single-item thumbnail. */
export function furnitureViewBox(id) {
  const kind = placementKind(id);
  if (kind === "floor") {
    const f = footprint(id, 0);
    const left = proj(0, f.d)[0] - 10;
    const right = proj(f.w, 0)[0] + 10;
    const top = proj(0, 0, HEIGHT[id])[1] - 12;
    const bottom = proj(f.w, f.d)[1] + 8;
    return [left, top, right - left, bottom - top].map((n) => Math.round(n)).join(" ");
  }
  if (kind === "wall") return `${WALL_THUMB.x - 4} ${WALL_THUMB.y - 4} ${WALL_THUMB.w + 8} ${WALL_THUMB.h + 8}`;
  return "0 0 100 100";
}

/** Room preview for the shop's Owned tab: the player's real arrangement (or the default one). */
export const roomPreviewSvg = (furnitureIdList, layout = null, lang = "zh") =>
  renderIsoRoom({ placed: resolveHome(furnitureIdList, layout), lang, label: lang === "en" ? "My room preview" : "我的房间预览" });
