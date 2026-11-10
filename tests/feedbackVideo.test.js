import test from "node:test";
import assert from "node:assert/strict";
import { FEEDBACK_VIDEO_BYTES, checkVideoFile, setVideo, sniffVideoType } from "../js/data/feedbackVideo.js";
import { memoryBackend, normalizeAttachments, readAttachments, writeAttachments } from "../js/data/feedbackAttachments.js";
import { FEEDBACK_MODULES, normalizeDraft, readDraft, writeDraft } from "../js/data/feedbackDraft.js";
import { moduleForScreen } from "../js/data/feedbackContext.js";

const WEBM = [0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x86, 0x81];
const MP4 = [0, 0, 0, 0x20, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d]; // ....ftypisom
const MOV = [0, 0, 0, 0x14, 0x66, 0x74, 0x79, 0x70, 0x71, 0x74, 0x20, 0x20]; // ....ftypqt
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** A fake File/Blob: real bytes at the front, the rest padded, and a real blob-ish shape for the storage layer. */
function media(name, head, size = 1000) {
  const bytes = new Uint8Array(Math.max(size, head.length));
  bytes.set(head);
  return { name, size, slice: (a, b) => ({ arrayBuffer: async () => bytes.slice(a, b).buffer }) };
}
const att = (id, type, size = 100) => ({ id, type, name: id, blob: { size, slice() {} } });

test("video type comes from the first bytes; .mov and look-alikes are refused", () => {
  assert.equal(sniffVideoType(WEBM), "video/webm");
  assert.equal(sniffVideoType(MP4), "video/mp4");
  assert.equal(sniffVideoType(MOV), null, "an Apple .mov is not MP4");
  assert.equal(sniffVideoType(PNG), null);
  assert.equal(sniffVideoType([0, 0, 0, 0x20, 0x66, 0x74]), null, "truncated header");
  assert.equal(sniffVideoType(null), null);
});

test("video checks: empty, over 20 MB and disguised files are refused with a reason; the limit itself passes", async () => {
  assert.equal(await checkVideoFile(media("a.mp4", MP4)), null);
  assert.equal(await checkVideoFile(media("a.mp4", MP4, FEEDBACK_VIDEO_BYTES)), null, "exactly 20 MB is allowed");
  assert.equal(await checkVideoFile(media("a.mp4", MP4, FEEDBACK_VIDEO_BYTES + 1)), "huge");
  assert.equal(await checkVideoFile(media("a.mp4", MP4, 0)), "empty");
  assert.equal(await checkVideoFile(media("clip.mp4", PNG)), "type", "a PNG renamed .mp4 is not a video");
  assert.equal(await checkVideoFile(media("a.mov", MOV)), "type");
  assert.equal(await checkVideoFile(null), "empty");
});

test("setVideo keeps exactly one video: choosing again replaces it, a bad file keeps the old one, images are untouched", async () => {
  const img = att("i1", "image/png");
  const first = await setVideo([img], media("one.mp4", MP4, 500));
  assert.equal(first.rejected.length, 0);
  assert.deepEqual(first.list.map((a) => a.kind || a.id), ["i1", "video"]);
  assert.equal(first.list[1].type, "video/mp4");
  assert.equal(first.list[1].name, "one.mp4");

  const second = await setVideo(first.list, media("two.webm", WEBM, 700));
  assert.equal(second.list.filter((a) => a.kind === "video").length, 1, "never two videos");
  assert.equal(second.list.find((a) => a.kind === "video").name, "two.webm");
  assert.equal(second.list[0], img);

  const bad = await setVideo(second.list, media("huge.mp4", MP4, FEEDBACK_VIDEO_BYTES + 5));
  assert.equal(bad.list, second.list, "failure returns the very same list");
  assert.deepEqual(bad.rejected.map((r) => r.reason), ["huge"]);
});

test("attachment drafts allow 3 images + 1 video, drop extras and anything malformed, and tag each item's kind", () => {
  const raw = [att("a", "image/png"), att("b", "image/jpeg"), att("c", "image/webp"), att("d", "image/png"), att("v1", "video/mp4"), att("v2", "video/webm"), att("x", "text/plain"), { id: "n", type: "video/mp4", blob: null }, att("big", "video/mp4", FEEDBACK_VIDEO_BYTES + 1), att("z", "image/png", 0)];
  const out = normalizeAttachments(raw);
  assert.deepEqual(out.map((a) => a.id), ["a", "b", "c", "v1"], "4th image, 2nd video, wrong type, no blob, too-big video, empty blob: all dropped");
  assert.deepEqual(out.map((a) => a.kind), ["image", "image", "image", "video"]);
  assert.deepEqual(normalizeAttachments("nope"), []);
});

test("a video draft survives storage per owner and does not leak between accounts", async () => {
  const be = memoryBackend();
  await writeAttachments("acc1", [att("v", "video/mp4", 5000), att("i", "image/png")], be);
  const mine = await readAttachments("acc1", be);
  assert.deepEqual(mine.map((a) => a.kind), ["video", "image"]);
  assert.deepEqual(await readAttachments("acc2", be), []);
  assert.deepEqual(await readAttachments(undefined, be), [], "guest sees nothing of acc1");
});

test("the feedback module is part of the draft; old drafts without it read as the whole game", () => {
  assert.deepEqual(FEEDBACK_MODULES, ["game", "world", "myteam", "career", "gameplay", "custom", "account", "other"]);
  assert.equal(normalizeDraft({ note: "x" }).module, "game");
  assert.equal(normalizeDraft({ module: "career" }).module, "career");
  assert.equal(normalizeDraft({ module: "<script>" }).module, "game");
  const store = new Map();
  const storage = { getItem: (k) => store.get(k) ?? null, setItem: (k, v) => store.set(k, v), removeItem: (k) => store.delete(k) };
  writeDraft("a", { category: "bug", module: "myteam", stars: 0, note: "hi" }, storage);
  assert.equal(readDraft("a", storage).module, "myteam");
  assert.equal(readDraft("b", storage).module, "game", "another owner starts at the default");
  store.set("cls_feedback_draft_v1:old", JSON.stringify({ category: "bug", stars: 2, note: "legacy" }));
  assert.deepEqual(readDraft("old", storage), { category: "bug", module: "game", stars: 2, note: "legacy" });
});

test("context: real screens map to the module they belong to; unknown screens mean the whole game", () => {
  assert.equal(moduleForScreen("screen-home", "world"), "world");
  assert.equal(moduleForScreen("screen-home", "players"), "myteam");
  assert.equal(moduleForScreen("screen-home", "custom"), "custom");
  assert.equal(moduleForScreen("screen-home"), "game");
  assert.equal(moduleForScreen("screen-game"), "gameplay");
  assert.equal(moduleForScreen("screen-draw"), "account");
  assert.equal(moduleForScreen("screen-time-travel"), "career");
  assert.equal(moduleForScreen("screen-season", "myTeam"), "myteam");
  assert.equal(moduleForScreen("screen-season", "league"), "career");
  assert.equal(moduleForScreen("screen-clutch-3d"), "gameplay");
  assert.equal(moduleForScreen("screen-unknown-new-mode"), "game");
  assert.equal(moduleForScreen(undefined), "game");
  for (const id of ["screen-home", "screen-season", "screen-game", "screen-draw", "screen-legend"]) assert.ok(FEEDBACK_MODULES.includes(moduleForScreen(id, "career")), id);
});
