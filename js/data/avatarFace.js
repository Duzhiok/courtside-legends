/**
 * Avatar Creator 2.0, face parts. A look field (`face`) that picks, per part, one of the FINISHED variants of that part's own art layer. It is a choice between
 * separately drawn layers, never a warp of the one face picture: nothing here stretches, scales or morphs anything, so there is no slider and no "intensity".
 *
 * Which variants really exist is decided by the art that ships (avatar2dLayers.js `ART.faceVariants`), not by this file: a saved id with no art behind it is
 * drawn as the original (and reported, never rewritten). Today no variant art exists, so no look can carry a face and the editor shows no face control.
 *
 * Parts: eyes and eyebrows replace the existing `face` / `brows` layers; nose and mouth are new layers drawn on a blank skin base (the male body has both
 * painted in). Not here, on purpose: facial hair (the goatee is on the brows layer, so on/off needs that art split first) and face shape (it needs a
 * head-less base; see docs/implementation/AVATAR-2D-FEMALE-FACE-ART-REQUEST.md).
 *
 * Pure: no DOM, no storage. SPARSE like build / age / presentation: the default ("default", missing, junk) is omitted, so every look saved before this
 * existed comes out byte-identical.
 */
export const FACE_PARTS = Object.freeze([
  { id: "eyes", zh: "眼睛", en: "Eyes" },
  { id: "brows", zh: "眉毛", en: "Eyebrows" },
  { id: "nose", zh: "鼻子", en: "Nose" },
  { id: "mouth", zh: "嘴", en: "Mouth" },
]);
export const FACE_PART_IDS = Object.freeze(FACE_PARTS.map((p) => p.id));
export const DEFAULT_VARIANT = "default";
const VARIANT_ID = /^[a-z][a-z0-9_]{0,23}$/;   // also the file name `face/<part>/<id>.png`: nothing that could climb out of the folder

/** Whitelist a stored face: known parts only, well-formed ids only, "default" and junk dropped. No survivors = no face at all (null). */
export function sanitizeFace(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const face = {};
  for (const part of FACE_PART_IDS) {
    const id = raw[part];
    if (typeof id === "string" && id !== DEFAULT_VARIANT && VARIANT_ID.test(id)) face[part] = id;
  }
  return Object.keys(face).length ? face : null;
}

/** `face` with one part set to `id` ("default" clears it). Never mutates; null when nothing is left. */
export function withFacePart(face, part, id) {
  if (!FACE_PART_IDS.includes(part)) return sanitizeFace(face);
  return sanitizeFace({ ...(face || {}), [part]: id });
}
