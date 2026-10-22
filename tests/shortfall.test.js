import test from "node:test";
import assert from "node:assert/strict";
import { shortfall, shortfallLabel } from "../js/ui/shortfall.js";

test("shortfall is a plain subtraction: price minus the gold you have", () => {
  assert.equal(shortfall(447, 0), 447);
  assert.equal(shortfall(447, 200), 247);
  assert.equal(shortfall(447, 400), 47);
});

test("shortfall never goes negative or repeats the full price once you can afford it", () => {
  assert.equal(shortfall(447, 447), 0);
  assert.equal(shortfall(447, 1000), 0, "already affordable — not a negative 差钱");
});

test("missing/undefined gold is treated as 0 gold, not NaN", () => {
  assert.equal(shortfall(100, undefined), 100);
  assert.equal(shortfall(100, null), 100);
});

test("rounds fractional price/gold before subtracting, so the label is a whole coin amount", () => {
  assert.equal(shortfall(447.6, 200.4), 248); // round(447.6)=448, round(200.4)=200
});

test("the label is the ¤ shortfall, not the sticker price", () => {
  assert.equal(shortfallLabel(447, 200), "差钱 ¤247");
  assert.equal(shortfallLabel(447, 0), "差钱 ¤447", "with 0 gold the shortfall does equal the price — that's a coincidence, not a bug");
});
