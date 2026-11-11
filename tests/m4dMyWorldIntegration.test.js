// M4-D My World visual integration (docs/implementation/m4d-my-world-integration-design.md):
// the hero's represented city anchors down to the Hometown Legends card, and the
// honours wall carries one honest line for the hometown-challenge record.
// No new data cards, no new fields, no sim.js / save-format changes.
import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();
const view = await import("../js/ui/myWorldView.js");
const { hometownHtml } = await import("../js/ui/hometownView.js");

const CJK = /[\u4e00-\u9fff]/;
const id = (places) => ({ name: "A", hometown: "", bio: "", guest: false, identityPlaces: places });

test("D1: hero's represented city is an anchor to the hometown card; other places stay plain text", () => {
  const html = view.identityCardHtml(id({ birthplace: "上海", grewUpIn: "南京", representedCity: "洛杉矶" }), "zh");
  assert.match(html, /<a href="#mw-hometown" class="mw-places-link">代表 洛杉矶<\/a>/);
  assert.doesNotMatch(html, /<a href="#mw-hometown"[^>]*>出生于/, "birthplace is not a link");
  assert.doesNotMatch(html, /<a href="#mw-hometown"[^>]*>成长于/, "grew-up-in is not a link");
  const en = view.identityCardHtml(id({ birthplace: "Shanghai", grewUpIn: "Nanjing", representedCity: "Los Angeles" }), "en");
  assert.doesNotMatch(en, CJK);
  assert.match(en, /<a href="#mw-hometown" class="mw-places-link">Representing Los Angeles<\/a>/);
  // No represented city: no anchor at all, and no dangling link target.
  const none = view.identityCardHtml(id({ birthplace: "上海", grewUpIn: null, representedCity: null }), "zh");
  assert.doesNotMatch(none, /#mw-hometown|mw-places-link/);
});

test("D1: the hometown section always carries the anchor target, empty state included", () => {
  const empty = hometownHtml({ identity: id({}), state: null, lang: "zh" });
  assert.match(empty, /<section class="mw-card mw-hometown" id="mw-hometown">/);
  const full = hometownHtml({
    identity: id({ birthplace: "阿克伦", grewUpIn: null, representedCity: "阿克伦" }),
    state: null, lang: "zh",
  });
  assert.match(full, /<section class="mw-card mw-hometown" id="mw-hometown">/);
  assert.equal((full.match(/id="mw-hometown"/g) || []).length, 1, "exactly one anchor target per render");
});

test("D2: legacyFromAccount derives the hometown-challenge summary only after a game is played", () => {
  assert.equal(view.legacyFromAccount(null), null);
  assert.equal(view.legacyFromAccount({ playerIds: [] }).hometownChallenge, null, "no record, no field value");
  const played = view.legacyFromAccount({
    playerIds: [],
    hometownLegends: { idolBref: null, challenge: { played: 3, wins: 2, losses: 1, lastRepresentedCity: "阿克伦", lastResult: "win", lastAt: "2026-11-11T00:00:00.000Z" } },
  }).hometownChallenge;
  assert.deepEqual(played, { played: 3, wins: 2, losses: 1, lastRepresentedCity: "阿克伦", lastResult: "win" });
  const zeroed = view.legacyFromAccount({
    playerIds: [],
    hometownLegends: { challenge: { played: 0, wins: 0, losses: 0, lastRepresentedCity: "阿克伦", lastResult: null, lastAt: null } },
  }).hometownChallenge;
  assert.equal(zeroed, null, "a zeroed record is still no record");
});

test("D2: honours wall shows the challenge line only when played, labelled, and never as a trophy", () => {
  const base = { playerIds: ["a"], codex: ["a"] };
  const unplayed = view.legacyHtml(view.legacyFromAccount(base), null, "zh");
  assert.doesNotMatch(unplayed, /家乡挑战/, "no line before any game");
  const account = {
    ...base,
    hometownLegends: { challenge: { played: 3, wins: 2, losses: 1, lastRepresentedCity: "阿克伦", lastResult: "win", lastAt: null } },
  };
  const zh = view.legacyHtml(view.legacyFromAccount(account), null, "zh");
  assert.match(zh, /🏀 家乡挑战 · 3 场 · 2 胜 1 负 · 最近代表 阿克伦/);
  assert.equal((zh.match(/🏆/g) || []).length, 0, "the challenge line adds no trophy glyph");
  const en = view.legacyHtml(view.legacyFromAccount(account), null, "en");
  assert.doesNotMatch(en.replaceAll("阿克伦", ""), CJK, "the city is the player's own input, not template text");
  assert.match(en, /🏀 Hometown Challenge · 3 played · 2W 1L · last represented 阿克伦/);
  // City-free record: the line renders without a trailing city fragment.
  const noCity = { ...base, hometownLegends: { challenge: { played: 1, wins: 0, losses: 1, lastRepresentedCity: null, lastResult: "loss", lastAt: null } } };
  const noCityHtml = view.legacyHtml(view.legacyFromAccount(noCity), null, "zh");
  assert.match(noCityHtml, /家乡挑战 · 1 场 · 0 胜 1 负/);
  assert.doesNotMatch(noCityHtml, /最近代表/);
  // A hostile city string is escaped, never raw HTML.
  const evil = { ...base, hometownLegends: { challenge: { played: 1, wins: 1, losses: 0, lastRepresentedCity: "<script>", lastResult: "win", lastAt: null } } };
  assert.doesNotMatch(view.legacyHtml(view.legacyFromAccount(evil), null, "zh"), /<script>/);
});

test("D2: the challenge line does not change the trophy count in the full My World render", () => {
  const account = {
    playerIds: ["a"],
    hometownLegends: { challenge: { played: 2, wins: 1, losses: 1, lastRepresentedCity: "北京", lastResult: "loss", lastAt: null } },
  };
  const html = view.myWorldHtml({
    identity: { name: "Z", hometown: "", bio: "", guest: false },
    journey: null, legacy: view.legacyFromAccount(account), frames: [],
  }, "zh");
  assert.match(html, /家乡挑战 · 2 场/);
  assert.equal((html.match(/🏆/g) || []).length, 0, "no career trophies invented by the challenge line");
});
