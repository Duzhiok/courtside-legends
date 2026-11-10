/**
 * Player Voice video attachment: ONE short screen recording, MP4 or WebM, at most 20 MB.
 * Videos are not re-encoded on the device (that needs a real transcoder), so a bigger file is refused honestly.
 * The real type is read from the first bytes; file.type is only a claim. Pure logic, runs in Node tests.
 */
export const FEEDBACK_VIDEO_MAX = 1;
export const FEEDBACK_VIDEO_BYTES = 20 * 1024 * 1024;
export const FEEDBACK_VIDEO_TYPES = ["video/mp4", "video/webm"];

/** WebM = EBML header 1A 45 DF A3. MP4 = "ftyp" at byte 4; an Apple "qt  " brand is a .mov, not MP4, so it is refused. */
export function sniffVideoType(bytes) {
  const b = bytes || [];
  if (b.length >= 4 && b[0] === 0x1a && b[1] === 0x45 && b[2] === 0xdf && b[3] === 0xa3) return "video/webm";
  const ftyp = [0x66, 0x74, 0x79, 0x70];
  if (b.length >= 12 && ftyp.every((v, i) => b[4 + i] === v)) {
    const brand = String.fromCharCode(b[8], b[9], b[10], b[11]);
    return brand === "qt  " ? null : "video/mp4";
  }
  return null;
}

let nextId = 0;
const makeId = () => `vid_${Date.now().toString(36)}_${(nextId++).toString(36)}`;
const baseName = (name) => String(name || "video").replace(/\.[^.]*$/, "").replace(/[^\w\u4e00-\u9fff-]+/g, "_").slice(0, 40) || "video";

/** null when acceptable, else the reason: empty | huge | type. Returns the sniffed type through `out.type`. */
export async function checkVideoFile(file, out = {}) {
  if (!file || !(file.size > 0)) return "empty";
  if (file.size > FEEDBACK_VIDEO_BYTES) return "huge";
  try {
    out.type = sniffVideoType(new Uint8Array(await file.slice(0, 12).arrayBuffer()));
  } catch {
    out.type = null;
  }
  return out.type ? null : "type";
}

/**
 * Set the one video (choosing again replaces it). Never throws; on any failure the current list is returned untouched.
 * -> { list, rejected: [{ name, reason }] }   reason: empty | huge | type
 */
export async function setVideo(list, file) {
  const meta = {};
  const bad = await checkVideoFile(file, meta);
  if (bad) return { list, rejected: [{ name: file?.name || "", reason: bad }] };
  const item = { id: makeId(), kind: "video", name: `${baseName(file.name)}.${meta.type === "video/webm" ? "webm" : "mp4"}`, type: meta.type, size: file.size, width: 0, height: 0, blob: file };
  return { list: [...list.filter((a) => a.type && !FEEDBACK_VIDEO_TYPES.includes(a.type)), item], rejected: [] };
}
