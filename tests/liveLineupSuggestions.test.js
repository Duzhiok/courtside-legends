import test from "node:test";
import assert from "node:assert/strict";
import {
  livePlayerIntent,
  livePlayerSuggestions,
  liveTeamSuggestion,
} from "../js/ui/liveLineupSuggestions.js";

const base = (over = {}) => ({
  id: "p1",
  name: "Terry Porter",
  orders: { action: "auto", usage: "auto", aggression: "auto", attack: "auto", hunt: "auto" },
  intangibles: { ballNeed: 50, systemAdapt: 60 },
  fatigue: 20,
  hot: 0,
  confidence: 60,
  ironLungs: false,
  ...over,
});

test("intent: handler + pnr reads as the PnR initiator", () => {
  const p = base({ orders: { ...base().orders, action: "pnr" } });
  assert.equal(livePlayerIntent(p, { isHandler: true }), "持球挡拆");
});

test("intent: teammate spot-up plus his defensive assignment", () => {
  const p = base({ orders: { ...base().orders, action: "spot" } });
  assert.equal(livePlayerIntent(p, { guardName: "Ty Lawson" }), "无球定点 · 主防 Ty Lawson");
});

test("intent: focus defender outranks the plain assignment", () => {
  const p = base({ orders: { ...base().orders, action: "crash" } });
  assert.equal(
    livePlayerIntent(p, { guardName: "Ty Lawson", focusGuardName: "Kyle Anderson" }),
    "冲抢二次 · 重点盯防 Kyle Anderson",
  );
});

test("intent: auto action falls back to the usage role", () => {
  assert.equal(livePlayerIntent(base({ orders: { ...base().orders, usage: "score" } })), "主攻得分");
  assert.equal(livePlayerIntent(base({ orders: { ...base().orders, usage: "organize" } })), "组织串联");
  assert.equal(livePlayerIntent(base()), "按体系");
});

test("suggestions: very tired beats everything, hot next", () => {
  assert.deepEqual(livePlayerSuggestions(base({ fatigue: 85 })), ["想休息"]);
  assert.deepEqual(livePlayerSuggestions(base({ hot: 2 })), ["多攻"]);
  assert.deepEqual(livePlayerSuggestions(base({ fatigue: 85, hot: 3 })), ["想休息", "多攻"]);
});

test("suggestions: moderately tired only when not iron lungs", () => {
  assert.deepEqual(livePlayerSuggestions(base({ fatigue: 72 })), ["想休息"]);
  assert.deepEqual(livePlayerSuggestions(base({ fatigue: 72, ironLungs: true })), []);
});

test("suggestions: high ball-need wants the ball, unless he already has it", () => {
  const p = base({ intangibles: { ballNeed: 88 } });
  assert.deepEqual(livePlayerSuggestions(p), ["想持球"]);
  assert.deepEqual(livePlayerSuggestions(p, { isHandler: true }), []);
});

test("suggestions: low confidence says fewer forced shots", () => {
  assert.deepEqual(livePlayerSuggestions(base({ confidence: 30 })), ["少强投"]);
  assert.deepEqual(livePlayerSuggestions(base({ confidence: 50 })), []);
});

test("suggestions: guarding the threat says lock him down, best defender is asked to take him", () => {
  const threat = { id: "t1", name: "Ty Lawson" };
  assert.deepEqual(
    livePlayerSuggestions(base(), { threat, threatGuardId: "p1" }),
    ["盯死 Ty Lawson"],
  );
  assert.deepEqual(
    livePlayerSuggestions(base(), { threat, threatGuardId: "other", bestDefenderId: "p1" }),
    ["建议主防 Ty Lawson"],
  );
  assert.deepEqual(
    livePlayerSuggestions(base(), { threat, threatGuardId: "other", bestDefenderId: "someone-else" }),
    [],
  );
});

test("suggestions: at most two, in priority order", () => {
  const p = base({ fatigue: 85, hot: 2, confidence: 30, intangibles: { ballNeed: 90 } });
  assert.deepEqual(livePlayerSuggestions(p), ["想休息", "多攻"]);
});

test("team suggestion: trailing by 8+ says push the pace, otherwise silent", () => {
  assert.equal(liveTeamSuggestion({ youScore: 40, oppScore: 50 }), "落后 10 分，建议打快追分");
  assert.equal(liveTeamSuggestion({ youScore: 40, oppScore: 47 }), null);
  assert.equal(liveTeamSuggestion({ youScore: 50, oppScore: 40 }), null);
});

test("english strings work for intent and suggestions", () => {
  const p = base({ orders: { ...base().orders, action: "pnr" }, hot: 2 });
  assert.equal(livePlayerIntent(p, { isHandler: true, lang: "en" }), "Ball-handler PnR");
  assert.deepEqual(livePlayerSuggestions(p, { lang: "en" }), ["Attack more"]);
});
