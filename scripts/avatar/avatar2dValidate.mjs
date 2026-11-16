/**
 * Avatar 2D art validator (docs/implementation/AVATAR-2D-ART-SPEC.md section 11). Pure Node, no browser, no image library:
 * a small PNG decoder/encoder (8-bit, non-interlaced) plus the spec's checks, so the artist gets feedback in seconds.
 *
 *   node scripts/avatar/validate-avatar2d.mjs [assets/avatar2d]
 *
 * Fails (exit 1) on spec violations; WARN is a size/appearance target missed. Checks implemented here: V1 file set, V2 format and
 * size, V3 transparent border + safe margin, V4 greyscale/luminance of tint layers, V6 no enclosed hole in the stacked silhouette,
 * V10 weights. Visual checks (V5, V7, V8, V11) and the portrait size (V9, a renderer property) stay with human review.
 */
import { deflateSync, inflateSync } from "node:zlib";
import { ART, CANVAS, LAYER_SPEC, layerFile, requiredFiles, resolveLayers } from "../../js/ui/avatar2d/avatar2dLayers.js";

export const RULES = Object.freeze({
  border: 24, safeMargin: 72, greyTolerance: 2, floorLum: 80, peakLum: 235, opaque: 250, visible: 16,
  minHolePx: 64, maxLayerBytes: 400 * 1024, maxSetBytes: 3 * 1024 * 1024,
});

// ---- minimal PNG codec -----------------------------------------------------------------------------------------------
export const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (buf) => { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
export const chunk = (type, data) => {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0); out.write(type, 4, "latin1"); data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

/** @returns {{ width, height, bitDepth, colorType, interlace, rgba: Uint8Array|null }} rgba only for 8-bit RGBA, non-interlaced */
export function decodePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33 || !buf.subarray(0, 8).equals(SIGNATURE)) throw new Error("not a PNG file");
  let pos = 8; let ihdr = null; const idat = [];
  while (pos + 12 <= buf.length) {
    const len = buf.readUInt32BE(pos); const type = buf.toString("latin1", pos + 4, pos + 8); const data = buf.subarray(pos + 8, pos + 8 + len);
    if (type === "IHDR") ihdr = { width: data.readUInt32BE(0), height: data.readUInt32BE(4), bitDepth: data[8], colorType: data[9], interlace: data[12] };
    else if (type === "IDAT") idat.push(data);
    else if (type === "IEND") break;
    pos += 12 + len;
  }
  if (!ihdr) throw new Error("PNG has no IHDR");
  if (ihdr.bitDepth !== 8 || ihdr.colorType !== 6 || ihdr.interlace !== 0) return { ...ihdr, rgba: null };
  const { width, height } = ihdr; const stride = width * 4;
  const raw = inflateSync(Buffer.concat(idat));
  if (raw.length !== (stride + 1) * height) throw new Error("PNG pixel data has the wrong length");
  const rgba = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)]; const src = y * (stride + 1) + 1; const dst = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[src + i]; const a = i >= 4 ? rgba[dst + i - 4] : 0; const b = y ? rgba[dst - stride + i] : 0; const c = i >= 4 && y ? rgba[dst - stride + i - 4] : 0;
      let v;
      if (filter === 0) v = x; else if (filter === 1) v = x + a; else if (filter === 2) v = x + b; else if (filter === 3) v = x + ((a + b) >> 1);
      else if (filter === 4) { const p = a + b - c; const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c); v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c); }
      else throw new Error(`PNG uses an unknown filter ${filter}`);
      rgba[dst + i] = v & 255;
    }
  }
  return { ...ihdr, rgba };
}

/** Encode 8-bit RGBA (colorType 6) or RGB (colorType 2, `channels` 3) as a PNG. Used by the tests; handy for fixtures. */
export function encodePng(width, height, pixels, colorType = 6) {
  const ch = colorType === 6 ? 4 : 3; const raw = Buffer.alloc((width * ch + 1) * height);
  for (let y = 0; y < height; y++) { raw[y * (width * ch + 1)] = 0; Buffer.from(pixels.buffer, pixels.byteOffset + y * width * ch, width * ch).copy(raw, y * (width * ch + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8; ihdr[9] = colorType;
  return Buffer.concat([SIGNATURE, chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.from(raw))), chunk("IEND", Buffer.alloc(0))]);
}

// ---- checks ----------------------------------------------------------------------------------------------------------
const lum = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/** V3 + V4 for one decoded layer. `tinted` = the layer is a greyscale tint layer. @returns {{level:"FAIL"|"WARN", id:string, msg:string}[]} */
export function checkLayerPixels(png, { tinted }) {
  const out = []; const { width: W, height: H, rgba } = png; const R = RULES;
  let minX = W, maxX = -1, minY = H, maxY = -1, bleed = 0, colour = 0, opaque = 0; const hist = new Uint32Array(256);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4; const a = rgba[i + 3];
    if (a > R.visible) { if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; }
    if (a > 0 && (x < R.border || y < R.border || x >= W - R.border || y >= H - R.border)) bleed += 1;
    if (tinted && a >= R.opaque) {
      opaque += 1; const r = rgba[i], g = rgba[i + 1], b = rgba[i + 2];
      if (Math.max(r, g, b) - Math.min(r, g, b) > R.greyTolerance) colour += 1;
      hist[Math.round(lum(r, g, b))] += 1;
    }
  }
  if (maxX < 0) { out.push({ level: "FAIL", id: "V3", msg: "layer is fully transparent" }); return out; }
  if (bleed) out.push({ level: "FAIL", id: "V3", msg: `${bleed} non-transparent pixels inside the ${R.border}px border` });
  if (minX < R.safeMargin || minY < R.safeMargin || maxX > W - 1 - R.safeMargin || maxY > H - 1 - R.safeMargin) {
    out.push({ level: "FAIL", id: "V3", msg: `artwork box x ${minX}-${maxX}, y ${minY}-${maxY} leaves the ${R.safeMargin}px safe margin` });
  }
  if (tinted) {
    if (!opaque) out.push({ level: "FAIL", id: "V4", msg: "tint layer has no opaque pixels to measure" });
    else {
      if (colour / opaque > 0.001) out.push({ level: "FAIL", id: "V4", msg: `${colour} opaque pixels are not neutral grey (R, G, B must agree within ${R.greyTolerance})` });
      const at = (q) => { let acc = 0; const goal = opaque * q; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= goal) return v; } return 255; };
      const floor = at(0.005); const peak = at(0.995);
      if (floor < R.floorLum) out.push({ level: "FAIL", id: "V4", msg: `darkest values are ${floor}, below the floor ${R.floorLum} (dark colourways would lose all shading)` });
      if (peak < R.peakLum) out.push({ level: "FAIL", id: "V4", msg: `lightest values peak at ${peak}, below ${R.peakLum} (light skin / blond cannot reach their colour; multiply never brightens)` });
    }
  }
  return out;
}

/** V6: stack the layers a look uses; transparent regions enclosed by artwork (not connected to the outside) are holes. */
export function findHoles(layerPngs, files) {
  const { width: W, height: H } = CANVAS; const solid = new Uint8Array(W * H);
  for (const f of files) { const { rgba } = layerPngs.get(f); for (let p = 0; p < W * H; p++) if (rgba[p * 4 + 3] > RULES.visible) solid[p] = 1; }
  const seen = new Uint8Array(W * H); const stack = [];
  const push = (p) => { if (!solid[p] && !seen[p]) { seen[p] = 1; stack.push(p); } };
  for (let x = 0; x < W; x++) { push(x); push((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { push(y * W); push(y * W + W - 1); }
  while (stack.length) { const p = stack.pop(); const x = p % W; if (x > 0) push(p - 1); if (x < W - 1) push(p + 1); if (p >= W) push(p - W); if (p < W * (H - 1)) push(p + W); }
  const holes = []; const mark = new Uint8Array(W * H);
  for (let p = 0; p < W * H; p++) {
    if (solid[p] || seen[p] || mark[p]) continue;
    let n = 0; const s = [p]; mark[p] = 1;
    while (s.length) { const q = s.pop(); n += 1; const x = q % W; for (const r of [x > 0 ? q - 1 : -1, x < W - 1 ? q + 1 : -1, q >= W ? q - W : -1, q < W * (H - 1) ? q + W : -1]) if (r >= 0 && !solid[r] && !seen[r] && !mark[r]) { mark[r] = 1; s.push(r); } }
    if (n >= RULES.minHolePx) holes.push({ x: p % W, y: Math.floor(p / W), pixels: n });
  }
  return holes;
}

/**
 * Validate a whole art set.
 * @param {Map<string, Buffer>} files relative path (e.g. "base/body.png") -> file bytes
 * @returns {{ level:"PASS"|"WARN"|"FAIL", id:string, msg:string }[]} findings; PASS entries describe what was verified
 */
export function validateSet(files) {
  const out = []; const R = RULES; const required = requiredFiles(); const names = [...files.keys()];
  const missing = required.filter((f) => !files.has(f)); const extra = names.filter((f) => !required.includes(f));
  for (const f of missing) out.push({ level: "FAIL", id: "V1", msg: `missing ${f}` });
  for (const f of extra) out.push({ level: "FAIL", id: "V1", msg: `unexpected file ${f} (the set is exactly the spec's list)` });
  if (!missing.length && !extra.length) out.push({ level: "PASS", id: "V1", msg: `${required.length} files, exactly the spec's set` });

  const tintedByFile = new Map();   // file -> is a greyscale tint layer
  for (const cut of ART.cuts) for (const style of ART.styles) for (const spec of LAYER_SPEC) tintedByFile.set(layerFile(spec, { cut, style }), !!spec.tint);
  const decoded = new Map(); let total = 0;
  for (const f of required.filter((name) => files.has(name))) {
    const buf = files.get(f); total += buf.length;
    let png;
    try { png = decodePng(buf); } catch (e) { out.push({ level: "FAIL", id: "V2", msg: `${f}: ${e.message}` }); continue; }
    if (png.width !== CANVAS.width || png.height !== CANVAS.height) { out.push({ level: "FAIL", id: "V2", msg: `${f}: ${png.width}x${png.height}, must be ${CANVAS.width}x${CANVAS.height}` }); continue; }
    if (!png.rgba) { out.push({ level: "FAIL", id: "V2", msg: `${f}: must be 8-bit RGBA, non-interlaced PNG (colour type ${png.colorType}, depth ${png.bitDepth}, interlace ${png.interlace})` }); continue; }
    decoded.set(f, png);
    const findings = checkLayerPixels(png, { tinted: tintedByFile.get(f) });
    for (const x of findings) out.push({ ...x, msg: `${f}: ${x.msg}` });
    if (!findings.length) out.push({ level: "PASS", id: "V2-V4", msg: `${f}: size, format, border, margin${tintedByFile.get(f) ? ", greyscale range" : ""} OK` });
    if (buf.length > R.maxLayerBytes) out.push({ level: "WARN", id: "V10", msg: `${f}: ${(buf.length / 1024).toFixed(0)} KB (target <= ${R.maxLayerBytes / 1024} KB)` });
  }
  if (total > R.maxSetBytes) out.push({ level: "WARN", id: "V10", msg: `set weighs ${(total / 1048576).toFixed(2)} MB (target <= 3 MB)` });

  if (required.every((f) => decoded.has(f))) {
    for (const style of [...ART.styles, "shaved"]) for (const cut of ART.cuts) {
      const used = resolveLayers({ style, cut }).layers.map((l) => l.file);
      const holes = findHoles(decoded, used);
      out.push(holes.length
        ? { level: "FAIL", id: "V6", msg: `${style}/${cut}: ${holes.length} enclosed transparent hole(s) in the stacked silhouette, e.g. ${holes.slice(0, 3).map((h) => `${h.pixels}px at (${h.x},${h.y})`).join(", ")} (a pocket enclosed by touching feet or an arm resting on the hip also counts: keep the legs and arms apart as in the reference pose, or repaint the missing region)` }
        : { level: "PASS", id: "V6", msg: `${style}/${cut}: no enclosed holes` });
    }
  } else out.push({ level: "WARN", id: "V6", msg: "skipped: needs every layer to be present and valid" });
  return out;
}
