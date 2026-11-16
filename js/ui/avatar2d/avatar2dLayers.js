/**
 * 2D avatar layers (Avatar 2D First): which art layers draw a saved look, in what order, tinted with what.
 *
 * Pure: no DOM, no storage, no new persistent field. It reads the existing look (`skin hair outfit style body figure cut`,
 * js/data/avatarLook.js) and derives a draw list. Colours come from `lookColors`, the same table the 3D figure uses, so every
 * shop outfit (all 9 colourways, locked or owned) resolves to the same shirt / pants / trim colours in 2D and 3D.
 *
 * Art contract: docs/implementation/AVATAR-2D-ART-SPEC.md (canvas, anchors, layer order, folder layout). Coordinates here are
 * in the art canvas, not on-screen pixels.
 */
import { HAIR_COLORS, lookColors, sanitizeLook } from "../../data/avatarLook.js";

export const CANVAS = Object.freeze({ width: 1024, height: 1536 });

/** Head-and-shoulders square cut out of the art canvas for the profile portrait (spec section 10). */
export const PORTRAIT_CROP = Object.freeze({ x: 152, y: 36, size: 720 });

/**
 * What art exists. A cut or hairstyle outside this list draws its fallback instead (reported, never saved back), so adding art
 * is: drop the files in assets/avatar2d/ and add the id here. `shaved` needs no files: it is "no hair layers".
 */
export const ART = Object.freeze({ cuts: ["jersey"], styles: ["short"], fallbackCut: "jersey", fallbackStyle: "short" });

/**
 * Layers, bottom to top. `group` picks the folder (`base/`, `hair/<style>/`, `outfits/<cut>/`); `tint` names the colour that
 * multiplies a greyscale layer (null = the art is already its final colour); `hideWhenShaved` layers are skipped for Shaved:
 * the skin layer already holds a finished bald skull, so there is no scalp-cap seam to hide.
 */
export const LAYER_SPEC = Object.freeze([
  { role: "hair_back", group: "hair", file: "back.png", tint: "Hair", hideWhenShaved: true },
  { role: "body", group: "base", file: "body.png", tint: "Skin" },
  { role: "shoes", group: "base", file: "shoes.png", tint: null },
  { role: "bottom", group: "outfit", file: "bottom.png", tint: "Pants" },
  { role: "bottom_trim", group: "outfit", file: "bottom_trim.png", tint: "Trim" },
  { role: "top", group: "outfit", file: "top.png", tint: "Shirt" },
  { role: "top_trim", group: "outfit", file: "top_trim.png", tint: "Trim" },
  { role: "face", group: "base", file: "face.png", tint: null },
  { role: "brows", group: "base", file: "brows.png", tint: "Brows" },
  { role: "hair_front", group: "hair", file: "front.png", tint: "Hair", hideWhenShaved: true },
]);

const FOLDER = { base: () => "base/", hair: ({ style }) => `hair/${style}/`, outfit: ({ cut }) => `outfits/${cut}/` };
export const layerFile = (spec, ids) => `${FOLDER[spec.group](ids)}${spec.file}`;

/**
 * @returns {{ layers: {role:string, file:string, tint:string|null}[], cut:string, style:string|null, fellBack:boolean, styleFellBack:boolean, look:object }}
 * Never mutates its input; an unknown look falls back field by field exactly like the 3D path.
 */
export function resolveLayers(rawLook) {
  const look = sanitizeLook(rawLook);
  const shaved = look.style === "shaved";
  const colors = lookColors(look);
  // lookColors paints Hair in the skin colour when shaved (that is what hides the 3D skull cap). Eyebrows must not vanish with it.
  colors.Brows = HAIR_COLORS.find((h) => h.id === look.hair).hex;
  const cut = ART.cuts.includes(look.cut) ? look.cut : ART.fallbackCut;
  const style = shaved ? null : (ART.styles.includes(look.style) ? look.style : ART.fallbackStyle);
  const layers = LAYER_SPEC
    .filter((spec) => !(shaved && spec.hideWhenShaved))
    .map((spec) => ({ role: spec.role, file: layerFile(spec, { cut, style }), tint: spec.tint ? colors[spec.tint] : null }));
  return { layers, cut, style, fellBack: cut !== look.cut, styleFellBack: !shaved && style !== look.style, look };
}

/** Every file the art set must contain, for validation and preloading. */
export const requiredFiles = () => {
  const out = new Set();
  for (const cut of ART.cuts) for (const style of ART.styles) for (const spec of LAYER_SPEC) out.add(layerFile(spec, { cut, style }));
  return [...out];
};
