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

test("the only web font is the small Latin display face: no CJK web font (Noto Sans SC cost 1.5-4 s of first-layout time), and body text stays on system fonts", () => {
  for (const l of links) {
    assert.match(l, /family=Bebas\+Neue&display=swap/);
    assert.doesNotMatch(l, /Noto/i, "no CJK web font request");
    assert.equal((l.match(/family=/g) || []).length, 1, "one family only");
  }
  const tokens = readFileSync(new URL("../css/tokens.css", import.meta.url), "utf8");
  const body = tokens.match(/--font-body:\s*([^;]+);/)[1];
  assert.doesNotMatch(body, /Noto Sans SC/, "the body stack does not name the web font any more");
  assert.match(body, /system-ui/);
  assert.match(body, /PingFang SC/);
  assert.match(body, /Microsoft YaHei/);
  assert.match(body, /sans-serif\s*$/, "ends in the generic family");
  // the only @font-face left is the local Latin-extended helper (no network source)
  const faces = [...tokens.matchAll(/@font-face\s*{[^}]*}/g)].map((m) => m[0]);
  for (const f of faces) assert.doesNotMatch(f, /url\(/, "no downloaded font file");
});
