import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rosterTacticUnlocks, tacticUnlockHint } from "../js/data/coaches.js";

// 9ee087ac verification find (B109): fillTacticSelect called tacticUnlockHint(t.id, court)
// without a lang, so rosterTacticUnlocks defaulted to "zh" and the option title
// tooltip stayed Chinese in English mode ("Motion Offense（双组织…→ 动态传导）")
// while the visible option label was already English. The call site must pass
// getLang(); this pins both the call site and the lang behaviour of the helper.

const passer = (name) => ({ name, pass: 80, iq: 80, pos: "PG" });
const big = (name) => ({ name, pos: "C", paint: 80, rebound: 85 });

test("tacticUnlockHint: unlock reasons follow the requested language", () => {
  const en = rosterTacticUnlocks([passer("A"), passer("B"), big("C")], "en");
  assert.match(en.reasons.motion, /Two playmakers/);
  assert.match(en.reasons.pnr_spam, /Quality big C/);
  assert.doesNotMatch(en.reasons.motion, /[\u4e00-\u9fff]/);
  const zh = rosterTacticUnlocks([passer("A"), passer("B"), big("C")]);
  assert.match(zh.reasons.motion, /双组织/);
  assert.match(zh.reasons.pnr_spam, /优质内线/);
  assert.equal(tacticUnlockHint("motion", [passer("A"), passer("B")], "en").includes("Two playmakers"), true);
  assert.equal(tacticUnlockHint("motion", [passer("A"), passer("B")]).includes("双组织"), true);
});

test("tacticUnlockHint: fillTacticSelect passes the current language (source pin)", () => {
  const appSrc = readFileSync(new URL("../js/app.js", import.meta.url), "utf8");
  assert.ok(
    appSrc.includes("tacticUnlockHint(t.id, court, getLang())"),
    "fillTacticSelect must pass getLang() so the unlock hint matches the UI language",
  );
  assert.ok(
    !appSrc.includes("tacticUnlockHint(t.id, court)"),
    "no bare two-arg call may remain (it would silently default to Chinese)",
  );
});
