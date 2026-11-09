import test from "node:test";
import assert from "node:assert/strict";
import { GALLERY_LEGENDS } from "../js/ui/homeShowcase.js";
import { nextUndefeatedLegend } from "../js/ui/duelView.js";

test("nextUndefeatedLegend picks the first unbeaten legend", () => {
  assert.equal(nextUndefeatedLegend({ defeated: [] }), GALLERY_LEGENDS[0]);
  assert.equal(nextUndefeatedLegend({}), GALLERY_LEGENDS[0], "no defeated list yet");
  const firstTwo = GALLERY_LEGENDS.slice(0, 2).map((l) => l.bref);
  assert.equal(nextUndefeatedLegend({ defeated: firstTwo }), GALLERY_LEGENDS[2]);
});

test("nextUndefeatedLegend returns null once every gallery legend is beaten", () => {
  const all = GALLERY_LEGENDS.map((l) => l.bref);
  assert.ok(all.length > 0, "gallery is non-empty");
  assert.equal(nextUndefeatedLegend({ defeated: all }), null);
  // A duplicate entry must not resurrect a Next button either.
  assert.equal(nextUndefeatedLegend({ defeated: [...all, all[0]] }), null);
});

test("the result screen has no Next button copy once all legends are beaten", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../js/ui/duelView.js", import.meta.url), "utf8");
  // The Next button renders only when nextLegend is truthy, and the
  // all-beaten line renders instead when it is null.
  assert.match(src, /nextLegend \? `<button type="button" class="btn" id="btn-duel-next">/);
  assert.match(src, /allBeaten \? `<p>/);
  assert.doesNotMatch(src, /GALLERY_LEGENDS\[0\] \|\| null/);
});
