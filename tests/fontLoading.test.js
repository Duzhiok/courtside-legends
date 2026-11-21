// B77: the web-font stylesheet must never block first paint. It is media="print" until js/fontCss.js switches it on; without JS a
// <noscript> copy still loads it; and the weight nobody needs is not downloaded.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");
const links = [...html.matchAll(/<link\b[^>]*fonts\.googleapis\.com\/css2[^>]*>/g)].map((m) => m[0]);

test("no Google Fonts stylesheet blocks rendering: the live one is media=print, the other is inside <noscript>", () => {
  assert.equal(links.length, 2, "one live link + one noscript copy");
  const live = links.find((l) => /id="font-css"/.test(l));
  assert.ok(live && /media="print"/.test(live), "the live link starts as media=print");
  const copy = links.find((l) => !/id="font-css"/.test(l));
  const at = html.indexOf(copy);
  assert.ok(html.lastIndexOf("<noscript>", at) > html.lastIndexOf("</noscript>", at), "the other copy sits inside <noscript>");
});

test("js/fontCss.js is loaded and switches exactly that link on (a classic external script, no inline code)", () => {
  assert.match(html, /<script src="js\/fontCss\.js[^"]*"><\/script>/);
  const src = readFileSync(new URL("../js/fontCss.js", import.meta.url), "utf8");
  assert.match(src, /getElementById\("font-css"\)/);
  assert.match(src, /\.media = "all"/);
  // run it against a minimal DOM
  const link = { media: "print" };
  globalThis.document = { getElementById: (id) => (id === "font-css" ? link : null) };
  new Function(src)();
  assert.equal(link.media, "all");
  delete globalThis.document;
  assert.doesNotThrow(() => { globalThis.document = { getElementById: () => null }; new Function(src)(); delete globalThis.document; }, "no link: harmless");
});

test("only the Noto Sans SC weights the app uses are requested (400 + 700, not 500)", () => {
  for (const l of links) assert.match(l, /Noto\+Sans\+SC:wght@400;700&/);
});
