import test from "node:test";
import assert from "node:assert/strict";
import { creditRows, creditsHtml } from "../js/ui/creditsView.js";
import { PHOTO_CREDITS } from "../js/data/photoCredits.js";

const esc = (text) => String(text).replace(/[&<>\"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SAMPLE = {
  "Bob B.jpg": { artist: "Zed", artistUrl: null, license: "CC BY-SA 2.0", licenseUrl: null, page: "https://commons.wikimedia.org/wiki/File:Bob_B.jpg", brefs: ["bbb01"] },
  "Al A.jpeg": { artist: "Ann", artistUrl: null, license: "Public domain", licenseUrl: null, page: "https://commons.wikimedia.org/wiki/File:Al_A.jpeg", brefs: ["aaa01"] },
  "Cy C.png": { artist: "Cy", artistUrl: null, license: "CC BY 4.0", licenseUrl: null, page: "https://commons.wikimedia.org/wiki/File:Cy_C.png", brefs: ["ccc01"] },
};
const nameOf = (bref) => ({ aaa01: "Al Alpha", bbb01: "Bob Beta", ccc01: "Cy Gamma" })[bref] || bref;

test("S-P2-2: creditRows caches the sort for the same (credits, nameOf) pair", () => {
  const first = creditRows(SAMPLE, nameOf);
  const second = creditRows(SAMPLE, nameOf);
  assert.equal(second, first, "same array reference — no re-sort on repeat opens");
  assert.deepEqual(first.map((row) => row.file), ["Al A.jpeg", "Bob B.jpg", "Cy C.png"]);
});

test("S-P2-2: a different nameOf recomputes instead of serving a stale order", () => {
  const named = creditRows(SAMPLE, nameOf);
  const other = creditRows(SAMPLE, (bref) => ({ aaa01: "Zed Zulu", bbb01: "Amy Alpha", ccc01: "Moe Mid" })[bref]);
  assert.notEqual(other, named);
  assert.deepEqual(other.map((row) => row.file), ["Bob B.jpg", "Cy C.png", "Al A.jpeg"]);
  // And the cache now holds the latest nameOf, not the old one.
  assert.equal(creditRows(SAMPLE, nameOf), creditRows(SAMPLE, nameOf));
});

test("S-P2-2: different credit sets do not share a cache entry", () => {
  const other = { "Zz Z.jpg": { artist: "Z", artistUrl: null, license: "CC BY 4.0", licenseUrl: null, page: "https://example.org/z", brefs: ["zzz01"] } };
  assert.deepEqual(creditRows(other).map((row) => row.file), ["Zz Z.jpg"]);
  assert.deepEqual(creditRows(SAMPLE, nameOf).map((row) => row.file), ["Al A.jpeg", "Bob B.jpg", "Cy C.png"]);
});

test("S-P2-2: the real 2640-photo list sorts once and reuses the result", () => {
  assert.equal(creditRows(PHOTO_CREDITS), creditRows(PHOTO_CREDITS));
  assert.equal(creditRows(PHOTO_CREDITS).length, Object.keys(PHOTO_CREDITS).length);
});

test("S-P2-2: creditsHtml renders only the first `shown` rows plus a load-more button", () => {
  const rows = creditRows(SAMPLE, nameOf);
  const html = creditsHtml({ rows, shown: 1 }, esc);
  assert.equal((html.match(/class="credit-row"/g) || []).length, 1);
  assert.match(html, /data-credits-more/);
  assert.match(html, /加载更多（还剩 2 张）/);
  assert.match(html, /共 3 张照片/, "the intro still counts the whole list");
});

test("S-P2-2: no load-more button once every row is shown", () => {
  const rows = creditRows(SAMPLE, nameOf);
  assert.doesNotMatch(creditsHtml({ rows, shown: 3 }, esc), /data-credits-more/);
  assert.doesNotMatch(creditsHtml({ rows, shown: 99 }, esc), /data-credits-more/);
});

test("S-P2-2: without `shown` the whole list still renders (old behaviour)", () => {
  const rows = creditRows(SAMPLE, nameOf);
  const html = creditsHtml({ rows }, esc);
  assert.equal((html.match(/class="credit-row"/g) || []).length, 3);
  assert.doesNotMatch(html, /data-credits-more/);
});
