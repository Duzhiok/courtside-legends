import test from "node:test";
import assert from "node:assert/strict";
import { ordersLabel, setupPlayerList } from "../js/engine/gameplan.js";

// Regression: the orders (tendencies) section used to list starters only,
// so bench players had no tendencies to set in any mode, including the Gold
// League — while the roles section already listed the whole roster.
// Both sections now share this one rule.
const mk = (id, ovr, minutes = 0) => ({ id, ovr2k: ovr, ratingSource: "anchor", targetMinutes: minutes });
const ids = (list) => list.map((p) => p.id);

test("small roster (<=12): the whole roster, minutes first, then OVR", () => {
  const players = [mk("bench-a", 72, 10), mk("starter", 85, 32), mk("bench-b", 63, 20)];
  assert.deepEqual(ids(setupPlayerList(players, new Set(["starter"]))), ["starter", "bench-b", "bench-a"]);
  assert.equal(setupPlayerList(players, new Set(["starter"])).length, 3, "no bench player is dropped");
});

test("season: the whole roster even when it is big", () => {
  const players = Array.from({ length: 14 }, (_, i) => mk(`p${i}`, 60 + i, 10));
  const list = setupPlayerList(players, new Set(["p0", "p1", "p2", "p3", "p4"]), { season: true });
  assert.equal(list.length, 14);
  assert.ok(list.some((p) => p.id === "p13"), "the last bench player is listed");
});

test("big quick-game roster, no season: starters + top 5 bench", () => {
  const players = Array.from({ length: 14 }, (_, i) => mk(`p${i}`, 60 + i, 10));
  const picked = new Set(["p0", "p1", "p2", "p3", "p4"]);
  const list = setupPlayerList(players, picked);
  assert.deepEqual(ids(list), ["p0", "p1", "p2", "p3", "p4", "p13", "p12", "p11", "p10", "p9"]);
});

test("big quick-game roster, nothing picked yet: top 10 by OVR", () => {
  const players = Array.from({ length: 14 }, (_, i) => mk(`p${i}`, 60 + i, 10));
  assert.deepEqual(ids(setupPlayerList(players, new Set())), ["p13", "p12", "p11", "p10", "p9", "p8", "p7", "p6", "p5", "p4"]);
});

test("gold-league shape: 12-man roster lists all 12, bench included", () => {
  const players = [
    ...["s1", "s2", "s3", "s4", "s5"].map((id, i) => mk(id, 80 - i, 30)),
    ...["b1", "b2", "b3", "b4", "b5", "b6", "b7"].map((id, i) => mk(id, 72 - i, 15)),
  ];
  const list = setupPlayerList(players, new Set(["s1", "s2", "s3", "s4", "s5"]));
  assert.equal(list.length, 12);
  for (const b of ["b1", "b2", "b3", "b4", "b5", "b6", "b7"]) {
    assert.ok(list.some((p) => p.id === b), `${b} must have a tendencies row`);
  }
});

// ordersLabel is the one-line tendency summary the live-game coach panel
// shows next to each on-court player. Cases are the real rows from the
// user's 2026-11-22 screenshots: "auto" slots (跟随球队 / 自由区域 /
// 常规防守) are defaults and stay out of the summary.
test("ordersLabel: the screenshot players read exactly as their dropdowns", () => {
  assert.equal(
    ordersLabel({ usage: "balanced", aggression: "normal", action: "post", attack: "paint", hunt: "auto", defFocus: "auto" }),
    "攻传均衡 · 正常欲望 · 低位要球 · 内线杀伤",
    "Donyell Marshall"
  );
  assert.equal(
    ordersLabel({ usage: "balanced", aggression: "normal", action: "pnr", attack: "auto", hunt: "auto", defFocus: "auto" }),
    "攻传均衡 · 正常欲望 · 挡拆",
    "Jrue Holiday"
  );
  assert.equal(
    ordersLabel({ usage: "defend", aggression: "low", action: "spot", attack: "perimeter", hunt: "patient", defFocus: "auto" }),
    "偏防守 · 低攻击欲 · 无球定点 · 外线远投 · 耐心传导",
    "Deron Williams"
  );
});

test("ordersLabel: all-auto orders and a missing orders object summarise to nothing (cards fall back to 自由发挥); a set defence shows up", () => {
  assert.equal(ordersLabel({ usage: "auto", aggression: "auto", action: "auto", attack: "auto", hunt: "auto", defFocus: "auto" }), "");
  assert.equal(ordersLabel(null), "");
  assert.equal(
    ordersLabel({ usage: "auto", aggression: "auto", action: "auto", attack: "auto", hunt: "auto", defFocus: "onball" }),
    "领防持球"
  );
});
