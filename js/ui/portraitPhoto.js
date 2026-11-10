/**
 * Turn a photo the player picked into a profile picture: validate, centre-crop to a square, shrink, JPEG.
 *
 * Everything stays on this device. The file is read locally and only the small result is stored; nothing is
 * uploaded anywhere. The browser parts (decode, canvas) are injected so the logic is testable without a DOM.
 */
import { MAX_PORTRAIT_CHARS } from "../data/avatarPortrait.js";

export const PHOTO_PX = 192;
export const PHOTO_MAX_BYTES = 15 * 1048576;
export const PHOTO_TYPES = Object.freeze(["image/png", "image/jpeg", "image/webp"]);
const QUALITIES = [0.82, 0.68, 0.52, 0.4]; // try the best first; a busy photo may need to give up some quality

/** Largest centred square inside w x h. @returns {{sx:number, sy:number, side:number}|null} */
export function squareCrop(w, h) {
  if (!(w > 0) || !(h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) return null;
  const side = Math.min(w, h);
  return { sx: Math.floor((w - side) / 2), sy: Math.floor((h - side) / 2), side };
}

/** Browser implementation of the two things we cannot do in Node. */
export function browserPhotoDeps() {
  return {
    async decode(file) {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); // honours the phone's EXIF rotation
      return { width: bmp.width, height: bmp.height, source: bmp, close: () => bmp.close?.() };
    },
    encode(img, crop, size, quality) {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = "#ffffff"; // JPEG has no alpha: a transparent PNG would otherwise turn black
      ctx.fillRect(0, 0, size, size);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(img.source, crop.sx, crop.sy, crop.side, crop.side, 0, 0, size, size);
      return canvas.toDataURL("image/jpeg", quality);
    },
  };
}

/**
 * @returns {Promise<{ok: true, image: string} | {ok: false, reason: "type"|"empty"|"huge"|"unreadable"|"toobig"}>}
 */
export async function photoToPortrait(file, deps = browserPhotoDeps()) {
  if (!file || !PHOTO_TYPES.includes(file.type)) return { ok: false, reason: "type" };
  if (!(file.size > 0)) return { ok: false, reason: "empty" };
  if (file.size > PHOTO_MAX_BYTES) return { ok: false, reason: "huge" };
  let img = null;
  try {
    img = await deps.decode(file);
    const crop = squareCrop(img.width, img.height);
    if (!crop) return { ok: false, reason: "unreadable" };
    for (const q of QUALITIES) {
      const uri = deps.encode(img, crop, PHOTO_PX, q);
      if (typeof uri === "string" && uri.startsWith("data:image/") && uri.length <= MAX_PORTRAIT_CHARS) return { ok: true, image: uri };
    }
    return { ok: false, reason: "toobig" };
  } catch {
    return { ok: false, reason: "unreadable" };
  } finally {
    img?.close?.();
  }
}

const TEXT = {
  type: ["不是 PNG / JPEG / WebP 图片", "Not a PNG / JPEG / WebP image"],
  empty: ["文件是空的", "The file is empty"],
  huge: ["图片太大（超过 15MB）", "Image is too large (over 15 MB)"],
  unreadable: ["读不出这张图片", "Could not read this image"],
  toobig: ["这张图压缩后仍然太大，换一张简单点的", "Still too large after shrinking; try a simpler photo"],
};
export const photoReasonText = (reason, lang) => (TEXT[reason] || TEXT.unreadable)[lang === "en" ? 1 : 0];
