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
import { BROWS_GRAY_HEX, agedHex } from "../../data/avatarAge.js";
import { DEFAULT_VARIANT, FACE_PART_IDS } from "../../data/avatarFace.js";

export const CANVAS = Object.freeze({ width: 1024, height: 1536 });

/**
 * Head-and-shoulders square cut out of the art canvas for the profile portrait (spec section 10). Measured on the Style A master
 * (realistic proportions): hair top y 74, chin y 261, head centred on x 510; the square adds the neckline and shoulder tops.
 */
export const PORTRAIT_CROP = Object.freeze({ x: 340, y: 46, size: 340 });

/**
 * What art exists. A cut or hairstyle outside this list draws its fallback instead (reported, never saved back), so adding art
 * is: drop the files in assets/avatar2d/ and add the id here. `shaved` needs no files: it is "no hair layers".
 */
export const ART = Object.freeze({
  cuts: ["jersey"], styles: ["short"], presentations: ["male"], fallbackCut: "jersey", fallbackStyle: "short", fallbackPresentation: "male",
  /**
   * Finished face-part variants that ship, per presentation: `{ male: { eyes: ["b", "c"] } }` means `face/eyes/b.png` and `face/eyes/c.png` exist next to the
   * original eyes. The original is always "default" and never listed. Empty today: no such art exists, so no face control is offered and no look can carry one.
   * `blankFace`: the presentations that ship `base/body_blank_face.png` (the skin without nose and mouth), which nose and mouth variants are drawn on.
   */
  faceVariants: Object.freeze({}), blankFace: Object.freeze([]),
});

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
/** The male art is the original set at the root of assets/avatar2d/; any other presentation has its own complete set in a folder of that name. */
const presentationRoot = (presentation) => (!presentation || presentation === ART.fallbackPresentation ? "" : `${presentation}/`);
export const layerFile = (spec, ids) => `${presentationRoot(ids.presentation)}${FOLDER[spec.group](ids)}${spec.file}`;

/** The finished variants (other than the original) of one part in one presentation's art. */
const variantsOf = (art, presentation, part) => art.faceVariants?.[presentation]?.[part] || [];
/** Nose and mouth are painted into the normal skin layer, so they only exist as choices where the blank skin base ships too. */
const needsBlank = (part) => part === "nose" || part === "mouth";
const partUsable = (art, presentation, part) => variantsOf(art, presentation, part).length > 0 && (!needsBlank(part) || art.blankFace.includes(presentation));
const faceFile = (presentation, part, id) => `${presentationRoot(presentation)}face/${part}/${id}.png`;
const BLANK_BODY = (presentation) => `${presentationRoot(presentation)}base/body_blank_face.png`;

/** The face parts a player can actually change in this presentation's art: those with at least one finished variant besides the original. Empty = show no control. */
export const faceControls = (presentation, art = ART) => FACE_PART_IDS.filter((part) => partUsable(art, presentation || art.fallbackPresentation, part));
/** The variants of one part to offer: the original first, then each finished variant. */
export const faceChoices = (presentation, part, art = ART) => [DEFAULT_VARIANT, ...variantsOf(art, presentation || art.fallbackPresentation, part)];

/**
 * `jersey` (avatar2dJersey.jerseyKit, optional) swaps the shirt / shorts / trim tints for the worn jersey's colours. The look, its
 * skin, hair and cut, is untouched and nothing is saved: a jersey is a render input, not part of the appearance schema.
 * @returns {{ layers: {role:string, file:string, tint:string|null}[], cut:string, style:string|null, presentation:string, presentationFellBack:boolean, fellBack:boolean, styleFellBack:boolean, look:object, jersey:object|null }}
 * Never mutates its input; an unknown look falls back field by field exactly like the 3D path.
 */
export function resolveLayers(rawLook, jersey = null, art = ART) {
  const look = sanitizeLook(rawLook);
  const shaved = look.style === "shaved";
  const colors = lookColors(look);
  // lookColors paints Hair in the skin colour when shaved (that is what hides the 3D skull cap). Eyebrows must not vanish with it, and they grey with age.
  colors.Brows = agedHex(HAIR_COLORS.find((h) => h.id === look.hair).hex, look.appearanceAge, BROWS_GRAY_HEX);   // greys to the SAME grey as the hair, not to a lighter one (see avatarAge.js)
  if (jersey) Object.assign(colors, { Shirt: jersey.shirt, Pants: jersey.pants, Trim: jersey.trim });
  const wanted = look.presentation || ART.fallbackPresentation;
  const presentation = art.presentations.includes(wanted) ? wanted : art.fallbackPresentation;   // a presentation with no art draws the male art; never a recolour
  const cut = art.cuts.includes(look.cut) ? look.cut : art.fallbackCut;
  const style = shaved ? null : (art.styles.includes(look.style) ? look.style : art.fallbackStyle);
  // Face parts: a saved variant with no art behind it is drawn as the original and reported, never rewritten.
  const face = {};
  const faceFellBack = [];
  for (const [part, id] of Object.entries(look.face || {})) {
    if (partUsable(art, presentation, part) && variantsOf(art, presentation, part).includes(id)) face[part] = id; else faceFellBack.push(part);
  }
  const blank = !!(face.nose || face.mouth);   // any chosen nose or mouth: the skin without them, plus both parts drawn
  const layers = [];
  for (const spec of LAYER_SPEC) {
    if (shaved && spec.hideWhenShaved) continue;
    const layer = { role: spec.role, file: layerFile(spec, { cut, style, presentation }), tint: spec.tint ? colors[spec.tint] : null };
    if (spec.role === "face" && face.eyes) layer.file = faceFile(presentation, "eyes", face.eyes);
    if (spec.role === "brows" && face.brows) layer.file = faceFile(presentation, "brows", face.brows);
    if (spec.role === "body" && blank) layer.file = BLANK_BODY(presentation);
    layers.push(layer);
    if (spec.role === "body" && blank) for (const part of ["nose", "mouth"]) layers.push({ role: part, file: faceFile(presentation, part, face[part] || DEFAULT_VARIANT), tint: colors.Skin });
  }
  return { layers, cut, style, presentation, presentationFellBack: presentation !== wanted, fellBack: cut !== look.cut, styleFellBack: !shaved && style !== look.style, faceFellBack, look, jersey: jersey || null };
}

/** Every file ONE presentation's art set must contain (also for a presentation that has no art yet: this is the list the artist is asked for). */
export const requiredFilesFor = (presentation, art = ART) => {
  const out = new Set();
  for (const cut of art.cuts) for (const style of art.styles) for (const spec of LAYER_SPEC) out.add(layerFile(spec, { cut, style, presentation }));
  for (const part of FACE_PART_IDS) {
    if (!partUsable(art, presentation, part)) continue;
    for (const id of variantsOf(art, presentation, part)) out.add(faceFile(presentation, part, id));
    if (needsBlank(part)) { out.add(faceFile(presentation, part, DEFAULT_VARIANT)); out.add(BLANK_BODY(presentation)); }   // the original nose / mouth as their own layer, on the blank skin
  }
  return [...out];
};

/** Every file the shipped art set must contain, for validation and preloading. */
export const requiredFiles = (art = ART) => [...new Set(art.presentations.flatMap((p) => requiredFilesFor(p, art)))];
