import test from "node:test";
import assert from "node:assert/strict";
import { COMPRESS_LADDER, FEEDBACK_IMAGE_BYTES, FEEDBACK_IMAGE_MAX, addImages, checkImageFile, fitEdge, replaceImage, shrinkImage, sniffImageType } from "../js/data/feedbackImages.js";
import { memoryBackend, normalizeAttachments, readAttachments, writeAttachments, clearAttachments } from "../js/data/feedbackAttachments.js";
import { getFeedbackTransport, setFeedbackTransport } from "../js/data/feedbackTransport.js";

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPG = [0xff, 0xd8, 0xff, 0xe0];
const WEBP = [0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50];

/** A fake File: real bytes at the front (so sniffing works), padded to `size`. */
function file(name, head, size = 1000) {
  const bytes = new Uint8Array(Math.max(size, head.length)); // `size` is what the file claims; 0 means an empty file
  bytes.set(head);
  return { name, size, type: "image/png", slice: (a, b) => ({ arrayBuffer: async () => bytes.slice(a, b).buffer }) };
}
const deps = ({ width = 800, height = 600, sizeAt = () => 1000, canWebp = true } = {}) => ({
  decode: async () => ({ width, height, draw: (w, h) => ({ w, h }) }),
  encode: async (canvas, type, q) => {
    if (type === "image/webp" && !canWebp) return { type: "image/png", size: 5 }; // what browsers do when they can't write webp
    return { type, size: sizeAt(canvas, type, q) };
  },
});

test("types come from the file's first bytes, not from its name or claimed type", () => {
  assert.equal(sniffImageType(PNG), "image/png");
  assert.equal(sniffImageType(JPG), "image/jpeg");
  assert.equal(sniffImageType(WEBP), "image/webp");
  assert.equal(sniffImageType([0x47, 0x49, 0x46, 0x38]), null, "GIF is not allowed");
  assert.equal(sniffImageType([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20]), null, "RIFF but not WebP");
  assert.equal(sniffImageType([]), null);
  assert.equal(sniffImageType(null), null);
});

test("file checks: empty, huge and disguised files are refused with a reason", async () => {
  assert.equal(await checkImageFile(file("a.png", PNG)), null);
  assert.equal(await checkImageFile(file("a.png", PNG, 0)), "empty");
  assert.equal(await checkImageFile(file("a.png", PNG, 31 * 1024 * 1024)), "huge");
  assert.equal(await checkImageFile(file("evil.png", [0x3c, 0x73, 0x76, 0x67])), "type", "an SVG renamed .png");
  assert.equal(await checkImageFile(null), "empty");
});

test("fitEdge never upscales and keeps the aspect ratio", () => {
  assert.deepEqual(fitEdge(800, 600, 1920), { w: 800, h: 600 });
  assert.deepEqual(fitEdge(4000, 2000, 1000), { w: 1000, h: 500 });
  assert.deepEqual(fitEdge(1000, 4000, 1000), { w: 250, h: 1000 });
  assert.ok(COMPRESS_LADDER.every((s, i) => i === 0 || (s.edge < COMPRESS_LADDER[i - 1].edge && s.quality < COMPRESS_LADDER[i - 1].quality)));
});

test("a small image is kept byte for byte; a big one is re-encoded until it fits", async () => {
  const small = file("s.png", PNG, 500 * 1024);
  const kept = await shrinkImage(small, deps());
  assert.equal(kept.blob, small, "untouched");

  const big = file("big.png", PNG, 9 * 1024 * 1024);
  const tried = [];
  const out = await shrinkImage(big, deps({ width: 3000, height: 2000, sizeAt: (c, type, q) => { tried.push([c.w, q]); return q > 0.7 ? 3 * 1024 * 1024 : 1.5 * 1024 * 1024; } }));
  assert.ok(out.blob.size <= FEEDBACK_IMAGE_BYTES);
  assert.equal(out.type, "image/webp");
  assert.ok(out.width <= 1280, `scaled down: ${out.width}`);
  assert.ok(tried.length >= 2, "walked down the ladder");
});

test("large dimensions are scaled even when the file is already under 2 MB", async () => {
  const f = file("tall.png", PNG, 800 * 1024);
  const out = await shrinkImage(f, deps({ width: 6000, height: 3000, sizeAt: () => 400 * 1024 }));
  assert.ok(out.width <= 1920);
  assert.notEqual(out.blob, f);
});

test("browsers that cannot write WebP fall back to JPEG; nothing that stays too big is kept", async () => {
  const big = file("b.png", PNG, 5 * 1024 * 1024);
  const jpeg = await shrinkImage(big, deps({ canWebp: false, sizeAt: () => 900 * 1024 }));
  assert.equal(jpeg.type, "image/jpeg");
  await assert.rejects(shrinkImage(big, deps({ sizeAt: () => 5 * 1024 * 1024 })), /toobig/);
  await assert.rejects(shrinkImage(big, { decode: async () => { throw new Error("bad"); }, encode: async () => null }), /unreadable/);
});

test("add: at most 3, in order, with a reason for every refusal; one bad file never blocks the others", async () => {
  const d = deps();
  const picked = [file("1.png", PNG), file("fake.png", [1, 2, 3, 4]), file("2.jpg", JPG), file("3.png", PNG), file("4.png", PNG)];
  const { list, rejected } = await addImages([], picked, d);
  assert.equal(list.length, FEEDBACK_IMAGE_MAX);
  assert.deepEqual(list.map((x) => x.name), ["1.png", "2.png", "3.png"].map((n, i) => n.replace(/\.\w+$/, "") + (i === 1 ? ".jpg" : ".png")));
  assert.deepEqual(rejected.map((r) => [r.name, r.reason]), [["fake.png", "type"], ["4.png", "limit"]]);
  assert.equal(new Set(list.map((x) => x.id)).size, 3, "unique ids");
  const again = await addImages(list, [file("5.png", PNG)], d);
  assert.equal(again.list.length, 3);
  assert.equal(again.rejected[0].reason, "limit");
  assert.equal(list.length, 3, "the input list is not mutated");
});

test("replace swaps one image in place; a bad replacement keeps the old one", async () => {
  const d = deps();
  const { list } = await addImages([], [file("a.png", PNG), file("b.png", PNG)], d);
  const swapped = await replaceImage(list, list[0].id, file("new.jpg", JPG), d);
  assert.equal(swapped.list[0].name, "new.jpg");
  assert.equal(swapped.list[1].id, list[1].id);
  assert.notEqual(swapped.list[0].id, list[0].id);
  const bad = await replaceImage(list, list[0].id, file("x.png", [0, 0, 0, 0]), d);
  assert.equal(bad.list, list);
  assert.equal(bad.rejected[0].reason, "type");
  assert.equal((await replaceImage(list, "nope", file("a.png", PNG), d)).rejected.length, 1);
});

const blob = (size = 100) => ({ size, slice: () => null });
const att = (id, extra = {}) => ({ id, name: `${id}.png`, type: "image/png", blob: blob(), ...extra });

test("attachment drafts: per owner, round trip, garbage is dropped, capped at 3", async () => {
  const b = memoryBackend();
  assert.equal(await writeAttachments("acc_a", [att("1"), att("2")], b), true);
  assert.deepEqual((await readAttachments("acc_a", b)).map((x) => x.id), ["1", "2"]);
  assert.deepEqual(await readAttachments("acc_b", b), [], "another account sees nothing");
  assert.deepEqual(await readAttachments(null, b), [], "the guest draft is separate too");
  await writeAttachments(null, [att("g")], b);
  assert.equal((await readAttachments("acc_a", b)).length, 2);

  const dirty = [att("ok"), null, { id: 5 }, att("noblob", { blob: null }), att("badtype", { type: "image/gif" }), att("empty", { blob: blob(0) }), att("a"), att("b"), att("c")];
  assert.deepEqual(normalizeAttachments(dirty).map((x) => x.id), ["ok", "a", "b"]);
  assert.deepEqual(normalizeAttachments("nope"), []);

  await clearAttachments("acc_a", b);
  assert.deepEqual(await readAttachments("acc_a", b), []);
  assert.equal((await readAttachments(null, b)).length, 1, "clearing one owner leaves the other");
});

test("storage trouble is reported, never thrown", async () => {
  const broken = { get: async () => { throw new Error("x"); }, set: async () => { throw new Error("quota"); }, del: async () => { throw new Error("x"); } };
  assert.equal(await writeAttachments("a", [att("1")], broken), false);
  assert.deepEqual(await readAttachments("a", broken), []);
  assert.equal(await writeAttachments("a", [att("1")], null), false);
  assert.deepEqual(await readAttachments("a", null), []);
});

test("transport registry starts empty and only accepts functions", () => {
  assert.equal(getFeedbackTransport(), null);
  setFeedbackTransport(async () => true);
  assert.equal(typeof getFeedbackTransport(), "function");
  setFeedbackTransport("not a function");
  assert.equal(getFeedbackTransport(), null);
});
