/**
 * ENGINEERING PLACEHOLDER layers. Not art, never final, never to be accepted visually.
 *
 * They let the renderer's alignment, tinting, order, Shaved handling and portrait crop be exercised before real layered artwork
 * exists. The body carries a PLACEHOLDER watermark so it cannot be mistaken for the shipped look. Geometry follows the anchor
 * table in docs/implementation/AVATAR-2D-ART-SPEC.md section 2 (figure box x 143-881, y 72-1464; chin 648; eyes 458; shoulders 691).
 */
import { CANVAS } from "./avatar2dLayers.js";

const GREY = "#d4d4d4";
const EDGE = "#7c7c7c";
const cx = CANVAS.width / 2;

// role -> (ctx) => void. Tintable roles are drawn in neutral grey, exactly what real art must supply.
const DRAW = {
  hair_back: (g) => ellipse(g, cx, 380, 285, 310, GREY),
  body: (g) => {
    ellipse(g, cx, 399, 245, 249, GREY);                                              // head: a finished bald skull
    rect(g, cx - 55, 630, 110, 90, GREY);                                              // neck
    rect(g, cx - 170, 691, 340, 330, GREY);                                            // torso
    rect(g, cx - 270, 700, 100, 330, GREY); rect(g, cx + 170, 700, 100, 330, GREY);    // arms
    ellipse(g, cx - 315, 1050, 45, 60, GREY); ellipse(g, cx + 315, 1050, 45, 60, GREY); // hands touch the arms (x reaches 152 / 872)
    rect(g, cx - 130, 1000, 110, 400, GREY); rect(g, cx + 20, 1000, 110, 400, GREY);   // legs
    g.save(); g.fillStyle = "rgba(0,0,0,.28)"; g.font = "bold 74px sans-serif"; g.textAlign = "center";
    g.fillText("PLACEHOLDER", cx, 860); g.restore();
  },
  shoes: (g) => { rect(g, cx - 130, 1256, 110, 130, "#f4f4f4"); rect(g, cx + 20, 1256, 110, 130, "#f4f4f4"); ellipse(g, cx - 75, 1426, 100, 38, "#f2f2f2"); ellipse(g, cx + 75, 1426, 100, 38, "#f2f2f2"); },
  bottom: (g) => rect(g, cx - 175, 900, 350, 238, GREY),                               // shorts end at the hem anchor y 1138
  bottom_trim: (g) => { rect(g, cx - 175, 900, 350, 22, GREY); rect(g, cx - 175, 1116, 350, 22, GREY); },
  top: (g) => rect(g, cx - 180, 691, 360, 245, GREY),                                  // jersey hem at y 936
  top_trim: (g) => { rect(g, cx - 180, 691, 360, 20, GREY); rect(g, cx - 180, 916, 360, 20, GREY); rect(g, cx - 40, 760, 80, 110, GREY); },   // piping, hem band, number
  face: (g) => {
    for (const s of [-1, 1]) { ellipse(g, cx + s * 105, 458, 34, 44, "#fff"); ellipse(g, cx + s * 105, 464, 17, 24, "#2a1a10"); }
    rect(g, cx - 60, 555, 120, 14, "#8a2b2b");
  },
  brows: (g) => { rect(g, cx - 160, 368, 110, 20, GREY); rect(g, cx + 50, 368, 110, 20, GREY); },
  hair_front: (g) => { g.beginPath(); g.ellipse(cx, 330, 262, 258, 0, Math.PI, 0); g.closePath(); g.fillStyle = GREY; g.fill(); g.strokeStyle = EDGE; g.lineWidth = 4; g.stroke(); },
};

function ellipse(g, x, y, rx, ry, fill) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); g.fillStyle = fill; g.fill(); g.strokeStyle = EDGE; g.lineWidth = 4; g.stroke(); }
function rect(g, x, y, w, h, fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); g.strokeStyle = EDGE; g.lineWidth = 4; g.strokeRect(x, y, w, h); }

/** @returns a CANVAS-sized canvas holding the placeholder for `layer.role`, or null for a role with no placeholder. */
export function placeholderImage(layer, createCanvas) {
  const draw = DRAW[layer.role];
  if (!draw) return null;
  const canvas = createCanvas(CANVAS.width, CANVAS.height);
  draw(canvas.getContext("2d"));
  return canvas;
}
