// Regression: the scoreboard showed "士气 78.00500000000001" / "74.2625". The sim's morale is
// fractional by design, so the display rounds it.
import test from "node:test";
import assert from "node:assert/strict";
import { meterText } from "../js/ui/teamStats.js";

test("meterText rounds float noise and fractions to a whole number", () => {
  assert.equal(meterText(78.00500000000001), "78");
  assert.equal(meterText(74.2625), "74");
  assert.equal(meterText(74.5), "75");
  assert.equal(meterText(72), "72");
  assert.equal(meterText(0), "0");
  assert.equal(meterText("61.4"), "61");
});

test("meterText never prints NaN / undefined / Infinity", () => {
  for (const junk of [undefined, null, NaN, Infinity, -Infinity, "abc", {}]) {
    assert.equal(meterText(junk), "0", String(junk));
  }
});
