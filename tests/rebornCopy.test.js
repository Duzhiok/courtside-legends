import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { modeById } from "../js/data/modeCatalog.js";
import { PHRASES } from "../js/i18n-phrases.js";

const html = readFileSync(new URL("../index.html", import.meta.url), "utf8");

// The Reborn card is described in three places (catalog, home card, English phrase table). They drifted
// once already; this keeps them one sentence, and keeps the card honest about what is playable.
test("the Reborn home card text is the same in index.html, modeCatalog and the phrase table", () => {
  const desc = modeById("timeTravel").description;
  const card = html.match(/data-mode="timeTravel"[\s\S]*?<span>([^<]+)<\/span>/)?.[1];
  assert.equal(card, desc, "index.html card text must equal the catalog description");
  const phrase = PHRASES.find(([zh]) => zh === desc);
  assert.ok(phrase, "the description needs an English phrase entry");
  assert.match(phrase[1], /Classic GM \+ Coach/);
});

test("the Reborn card names the playable Classic role and does not sell unfinished careers as playable", () => {
  const desc = modeById("timeTravel").description;
  assert.match(desc, /经典 · 经理兼教练/);
  assert.match(desc, /开发中/);
  assert.doesNotMatch(desc, /五年/, "five years is the initial contract, not the career length");
});
