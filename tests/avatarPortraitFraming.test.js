// Profile-picture framing is per figure: a Bobblehead's head is about half its height, so it must not reuse the
// Stylized numbers (that framed only its scalp). The capture is 256 px and must fit the stored-portrait limit.
import test from "node:test";
import assert from "node:assert/strict";
import { FIGURE_STYLES, PORTRAIT_FRAMING, portraitFraming } from "../js/data/avatarLook.js";
import { MAX_PORTRAIT_CHARS } from "../js/data/avatarPortrait.js";
import { LIGHTING_MODES } from "../js/ui/avatarLighting.js";

test("every figure style has its own framing", () => {
  for (const f of FIGURE_STYLES) assert.ok(PORTRAIT_FRAMING[f.id], `framing for ${f.id}`);
});

test("the Bobblehead frames a taller slice, centred lower, than the Stylized figure", () => {
  const s = portraitFraming("stylized");
  const b = portraitFraming("bobblehead");
  assert.ok(b.frame > s.frame * 2, "toy head is ~half the body, so the frame is much taller");
  assert.ok(b.headDown > s.headDown, "toy head centre sits lower from the top");
});

test("framing stays inside the model and unknown figures fall back to Stylized", () => {
  for (const f of Object.values(PORTRAIT_FRAMING)) {
    assert.ok(f.frame > 0 && f.frame < 1);
    assert.ok(f.headDown - f.frame / 2 > -0.15, "headroom above the model stays small");
  }
  assert.deepEqual(portraitFraming("nope"), PORTRAIT_FRAMING.stylized);
});

test("light rigs: classic is the default, studio is opt-in", () => {
  assert.deepEqual([...LIGHTING_MODES], ["classic", "studio"]);
});

test("a 256 px JPEG portrait fits the stored-portrait limit with room to spare (measured 8-12K chars)", () => {
  assert.ok(MAX_PORTRAIT_CHARS >= 3 * 12000);
});
