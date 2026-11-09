/**
 * Player Voice image attachments: validate + shrink screenshots on the device, before anything is stored or sent.
 *  - Up to 3 images, PNG / JPEG / WebP only. The real type is read from the file's first bytes (file.type is only a claim).
 *  - Every kept image ends up <= 2 MB: a small, already-fine file is kept byte for byte; a big one is re-encoded
 *    (WebP, else JPEG) on a ladder of smaller sizes / lower quality until it fits, or is refused honestly.
 * The browser parts (decode / encode) are injected so the rule logic runs in Node tests.
 */
export const FEEDBACK_IMAGE_MAX = 3;
export const FEEDBACK_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"];
export const FEEDBACK_IMAGE_BYTES = 2 * 1024 * 1024;
export const FEEDBACK_RAW_LIMIT = 30 * 1024 * 1024; // refuse to even decode something this large (phone panoramas, RAW dumps)
export const FEEDBACK_MAX_EDGE = 1920;

/** Fewer pixels and lower quality each step; the last step is the smallest we are willing to keep. */
export const COMPRESS_LADDER = [
  { edge: 1920, quality: 0.86 }, { edge: 1600, quality: 0.8 }, { edge: 1280, quality: 0.72 },
  { edge: 1024, quality: 0.64 }, { edge: 800, quality: 0.55 }, { edge: 640, quality: 0.45 },
];

/** Type from magic bytes: PNG 89 50 4E 47, JPEG FF D8 FF, WebP "RIFF"....."WEBP". null = not an allowed image. */
export function sniffImageType(bytes) {
  const b = bytes || [];
  if (b.length >= 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  const riff = [0x52, 0x49, 0x46, 0x46];
  const webp = [0x57, 0x45, 0x42, 0x50];
  if (b.length >= 12 && riff.every((v, i) => b[i] === v) && webp.every((v, i) => b[8 + i] === v)) return "image/webp";
  return null;
}

/** Scale (w,h) so the longest edge is at most `edge`; never upscales. */
export function fitEdge(w, h, edge) {
  const longest = Math.max(w, h);
  if (!(longest > edge)) return { w, h };
  const k = edge / longest;
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

const readHead = async (file) => new Uint8Array(await file.slice(0, 12).arrayBuffer());

/** null when acceptable, else the reason: empty | huge | type. */
export async function checkImageFile(file) {
  if (!file || !(file.size > 0)) return "empty";
  if (file.size > FEEDBACK_RAW_LIMIT) return "huge";
  try {
    return sniffImageType(await readHead(file)) ? null : "type";
  } catch {
    return "type";
  }
}

/**
 * Returns { blob, type, width, height } with blob.size <= FEEDBACK_IMAGE_BYTES, or throws Error("toobig" | "unreadable").
 * deps: decode(file) -> { width, height, draw(w,h)->canvasLike }, encode(canvasLike, type, quality) -> Blob|null
 */
export async function shrinkImage(file, deps) {
  let img;
  try {
    img = await deps.decode(file);
  } catch {
    throw new Error("unreadable");
  }
  const type = (await readHead(file).then(sniffImageType)) || file.type;
  const small = Math.max(img.width, img.height) <= FEEDBACK_MAX_EDGE;
  if (file.size <= FEEDBACK_IMAGE_BYTES && small) return { blob: file, type, width: img.width, height: img.height };
  for (const step of COMPRESS_LADDER) {
    const { w, h } = fitEdge(img.width, img.height, step.edge);
    const canvas = img.draw(w, h);
    // WebP when the browser can write it (it silently returns PNG otherwise, which we detect), else JPEG.
    for (const out of ["image/webp", "image/jpeg"]) {
      const blob = await deps.encode(canvas, out, step.quality);
      if (blob && blob.type === out && blob.size > 0) {
        if (blob.size <= FEEDBACK_IMAGE_BYTES) return { blob, type: out, width: w, height: h };
        break; // this format worked but is still too big: next, smaller step
      }
    }
  }
  throw new Error("toobig");
}

let nextId = 0;
const makeId = () => `img_${Date.now().toString(36)}_${(nextId++).toString(36)}`;
const extFor = (type) => ({ "image/webp": "webp", "image/jpeg": "jpg", "image/png": "png" })[type] || "img";
const baseName = (name) => String(name || "image").replace(/\.[^.]*$/, "").replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 40) || "image";

async function prepare(file, deps) {
  const bad = await checkImageFile(file);
  if (bad) return { reject: bad };
  try {
    const r = await shrinkImage(file, deps);
    return { item: { id: makeId(), name: `${baseName(file.name)}.${extFor(r.type)}`, type: r.type, size: r.blob.size, width: r.width, height: r.height, blob: r.blob } };
  } catch (e) {
    return { reject: e.message === "toobig" ? "toobig" : "unreadable" };
  }
}

/**
 * Add picked files to the current list (max 3). Never throws; returns { list, rejected:[{name, reason}] }.
 * reason: limit | empty | huge | type | toobig | unreadable
 */
export async function addImages(list, files, deps) {
  const next = [...list];
  const rejected = [];
  for (const file of Array.from(files || [])) {
    if (next.length >= FEEDBACK_IMAGE_MAX) { rejected.push({ name: file?.name || "", reason: "limit" }); continue; }
    const r = await prepare(file, deps);
    if (r.item) next.push(r.item);
    else rejected.push({ name: file?.name || "", reason: r.reject });
  }
  return { list: next, rejected };
}

/** Swap one image for a new file in place; on failure the old image stays. */
export async function replaceImage(list, id, file, deps) {
  const i = list.findIndex((x) => x.id === id);
  if (i < 0) return { list, rejected: [{ name: file?.name || "", reason: "unreadable" }] };
  const r = await prepare(file, deps);
  if (!r.item) return { list, rejected: [{ name: file?.name || "", reason: r.reject }] };
  const next = [...list];
  next[i] = r.item;
  return { list: next, rejected: [] };
}

/** Real browser deps (canvas). Kept out of the rule logic above. */
export function browserImageDeps(doc = globalThis.document) {
  return {
    async decode(file) {
      const bmp = await createImageBitmap(file);
      return {
        width: bmp.width,
        height: bmp.height,
        draw(w, h) {
          const c = doc.createElement("canvas");
          c.width = w;
          c.height = h;
          const ctx = c.getContext("2d");
          ctx.fillStyle = "#fff"; // JPEG has no alpha: flatten transparent screenshots onto white, not black
          ctx.fillRect(0, 0, w, h);
          ctx.drawImage(bmp, 0, 0, w, h);
          return c;
        },
      };
    },
    encode: (canvas, type, quality) => new Promise((res) => canvas.toBlob(res, type, quality)),
  };
}
