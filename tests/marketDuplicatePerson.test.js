import test from "node:test";
import assert from "node:assert/strict";
import { PLAYERS } from "../js/data/players.js";
import { buildAffordableShop } from "../js/engine/careerEconomy.js";
import { loadSampleRoster } from "./helpers/sampleRoster.js";

/**
 * R45: 模拟试玩总决赛时抓到的 bug —— 金币晋级赛市场只按卡 id 去重，
 * 能买到「同人异赛季」的第二张卡（场间市场买进乔丹 '91、下一场又买乔丹 '92）。
 * 项目决策记录写明：同一真人只有时空对决允许重复，正常阵容一人一卡；
 * 选秀侧早有 takenPeople 按人去重，市场侧（buildAffordableShop）漏了。
 */
await loadSampleRoster(1);
const jordans = PLAYERS.filter((p) => p.bref === "jordami01");
assert.ok(jordans.length >= 10, "fixture: Jordan should have many season cards");

// Shrink the global pool to a deterministic fixture: all Jordan seasons
// plus a handful of other people. (PLAYERS is per-process in node:test.)
const others = PLAYERS.filter((p) => p.bref !== "jordami01").slice(0, 30);
PLAYERS.length = 0;
PLAYERS.push(...jordans, ...others);

test("buildAffordableShop: owning one Jordan season blocks every Jordan season", () => {
  const owned = jordans.find((p) => p.season === 1996);
  const c = { kind: "career", gold: 100000, used: new Set([owned.id]), shop: [] };
  for (let i = 0; i < 5; i++) {
    const shop = buildAffordableShop(c, 12);
    assert.ok(shop.length > 0, "shop should still stock other players");
    assert.ok(
      shop.every((p) => p.bref !== "jordami01"),
      `shop must not offer another Jordan season, got: ${shop.map((p) => p.id).join(",")}`
    );
  }
});

test("buildAffordableShop: one shop never stocks two seasons of the same person", () => {
  const c = { kind: "career", gold: 100000, used: new Set(), shop: [] };
  for (let i = 0; i < 5; i++) {
    const shop = buildAffordableShop(c, 12);
    const brefs = shop.map((p) => p.bref).filter(Boolean);
    assert.equal(new Set(brefs).size, brefs.length, "duplicate person inside one shop");
  }
});
