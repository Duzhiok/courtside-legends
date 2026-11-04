import test from "node:test";
import assert from "node:assert/strict";
import { suggestDefenseScheme } from "../js/engine/sim.js";

/**
 * suggestDefenseScheme mirrors managedDefense's judgment (minus its 40%
 * random gate on bump) for the live advice line: hottest opponent by
 * pts*1.2 + hot*7 + scoring*0.18 + fgPct*0.15; double when not protecting a
 * lead and the threat is hot (>=2) or has >=22 pts; bump for a lanky threat
 * with scoring >=78; else focus. No numbers changed.
 */
function player(name, extra = {}) {
  return {
    id: `adv-${name}`,
    name,
    pos: "SG",
    playPos: "SG",
    strength: 80,
    block: 50,
    speed: 70,
    scoring: 60,
    fgPct: 42,
    hot: 0,
    stats: { pts: 5 },
    ...extra,
  };
}

test("advice: 24 pts -> double the threat", () => {
  const hot = player("hot", { stats: { pts: 24 } });
  const { scheme, threat } = suggestDefenseScheme([player("a"), hot, player("b")], 0);
  assert.equal(scheme, "double");
  assert.equal(threat, hot);
});

test("advice: hot streak (>=2) -> double even on modest points", () => {
  const hot = player("hot", { hot: 3, stats: { pts: 10 } });
  const { scheme, threat } = suggestDefenseScheme([player("a"), hot], 0);
  assert.equal(scheme, "double");
  assert.equal(threat, hot);
});

test("advice: lanky scorer (strength<=58, scoring>=78) -> bump", () => {
  const big = player("big", {
    pos: "C",
    playPos: "C",
    strength: 50,
    block: 60,
    scoring: 80,
    stats: { pts: 5 },
  });
  const { scheme, threat } = suggestDefenseScheme([player("a"), big], 0);
  assert.equal(scheme, "bump");
  assert.equal(threat, big);
});

test("advice: double beats bump when the lanky scorer is also exploding", () => {
  const big = player("big", {
    pos: "C",
    playPos: "C",
    strength: 50,
    block: 60,
    scoring: 80,
    stats: { pts: 24 },
  });
  const { scheme } = suggestDefenseScheme([player("a"), big], 0);
  assert.equal(scheme, "double");
});

test("advice: protecting a lead -> no double, falls back to focus", () => {
  const hot = player("hot", { hot: 3, stats: { pts: 12 } });
  const { scheme, threat } = suggestDefenseScheme([player("a"), hot], -8);
  assert.equal(scheme, "focus");
  assert.equal(threat, hot);
});

test("advice: quiet game -> focus on the hottest available threat", () => {
  const top = player("top", { scoring: 70, stats: { pts: 8 } });
  const { scheme, threat } = suggestDefenseScheme([player("a"), top], 0);
  assert.equal(scheme, "focus");
  assert.equal(threat, top);
});

test("advice: empty floor -> focus with no threat", () => {
  assert.deepEqual(suggestDefenseScheme([], 0), { scheme: "focus", threat: null });
});
