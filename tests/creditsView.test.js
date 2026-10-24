import test from "node:test";
import assert from "node:assert/strict";
import { creditRows, creditsHtml } from "../js/ui/creditsView.js";
import { PHOTO_CREDITS } from "../js/data/photoCredits.js";

const esc = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

const SAMPLE = {
  "Bob B.jpg": { artist: "Zed <b>Zimmer</b>", artistUrl: "https://example.org/zed", license: "CC BY-SA 2.0", licenseUrl: "https://creativecommons.org/licenses/by-sa/2.0", page: "https://commons.wikimedia.org/wiki/File:Bob_B.jpg", brefs: ["bbb01"] },
  "Al A.jpeg": { artist: "Unknown author", artistUrl: null, license: "Public domain", licenseUrl: null, page: "https://commons.wikimedia.org/wiki/File:Al_A.jpeg", brefs: ["aaa01", "ccc01"] },
};

test("rows are sorted by player name and carry every player who shares the photo", () => {
  const rows = creditRows(SAMPLE, (bref) => ({ aaa01: "Al Alpha", bbb01: "Bob Beta", ccc01: "Cy Gamma" })[bref]);
  assert.deepEqual(rows.map((row) => row.file), ["Al A.jpeg", "Bob B.jpg"]);
  assert.deepEqual(rows[0].players, ["Al Alpha", "Cy Gamma"]);
});

test("unknown players fall back to their id rather than disappearing", () => {
  assert.deepEqual(creditRows(SAMPLE)[0].players, ["aaa01", "ccc01"]);
});

test("every row links to the source page and names author and licence; links open safely", () => {
  const html = creditsHtml({ rows: creditRows(SAMPLE) }, esc);
  assert.equal((html.match(/class="credit-row"/g) || []).length, 2);
  assert.match(html, /href="https:\/\/commons\.wikimedia\.org\/wiki\/File:Bob_B\.jpg"/);
  assert.match(html, /href="https:\/\/creativecommons\.org\/licenses\/by-sa\/2\.0"[^>]*>CC BY-SA 2\.0</);
  assert.match(html, /href="https:\/\/example\.org\/zed"/, "the author link is kept when Commons gives one");
  for (const anchor of html.match(/<a [^>]*>/g)) assert.match(anchor, /target="_blank" rel="noopener noreferrer"/);
});

test("public-domain photos and authors without a link are plain text, not dead links", () => {
  const html = creditsHtml({ rows: creditRows(SAMPLE) }, esc);
  assert.match(html, /作者：Unknown author · 许可：Public domain</);
});

test("hostile metadata cannot inject markup", () => {
  const html = creditsHtml({ rows: creditRows(SAMPLE) }, esc);
  assert.doesNotMatch(html, /<b>Zimmer<\/b>/);
  assert.match(html, /Zed &lt;b&gt;Zimmer&lt;\/b&gt;/);
});

test("the page says photos were resized/cropped, that silhouettes are not the player, and that it is unofficial", () => {
  const html = creditsHtml({ rows: [] }, esc);
  assert.match(html, /缩放和裁剪/);
  assert.match(html, /生成的剪影[\s\S]*并不是本人照片/);
  assert.match(html, /非官方/);
  assert.doesNotMatch(html, /自制的插画/, "no illustration line while there are none");
  assert.match(creditsHtml({ rows: [], localCount: 3 }, esc), /另有 3 位球员使用本项目自制的插画/);
});

test("the real data renders one row per credited photo; every link is http(s) — an author may only publish an http page", () => {
  const html = creditsHtml({ rows: creditRows(PHOTO_CREDITS) }, esc);
  assert.equal((html.match(/class="credit-row"/g) || []).length, Object.keys(PHOTO_CREDITS).length);
  for (const [, href] of html.matchAll(/href="([^"]+)"/g)) assert.match(href, /^https?:\/\//, href);
});

test("a javascript: or data: link in the metadata is shown as text, never as a link", () => {
  const evil = { "X.jpg": { ...SAMPLE["Bob B.jpg"], artistUrl: "javascript:alert(1)", licenseUrl: "data:text/html,x" } };
  const html = creditsHtml({ rows: creditRows(evil) }, esc);
  assert.doesNotMatch(html, /href="javascript:|href="data:/);
  assert.match(html, /作者：Zed &lt;b&gt;Zimmer&lt;\/b&gt; · 许可：CC BY-SA 2\.0</);
});
