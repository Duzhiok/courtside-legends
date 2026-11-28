/**
 * Skills M2: signature-move proficiency. Pure XP / level rules, the one thing a level changes in the engine (a small make boost, on the
 * shared effect builder), the wiring into a real Reborn game, a real game's XP settled once, and the career-screen line.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  MAX_LEVEL, MAX_XP, PROFICIENCY_BOOST_PER_LEVEL, PROFICIENCY_LEVELS, XP_GAME_CAP, addGameXp, boostOf, gameXp, levelOf, levelsMap, progressOf,
} from "../js/reborn/proficiency.js";
import { loadoutOf, recordUsage } from "../js/reborn/loadout.js";
import { SKILL_PACKS, fireSignature, trySignatureOffense } from "../js/data/skills.js";
import { createRebornState } from "../js/reborn/identity.js";
import { buildSeason, playGame } from "../js/reborn/season.js";
import { loadoutHtml } from "../js/ui/reborn/loadoutView.js";
import { captureHero } from "./helpers/captureHero.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

test("1. five levels at 0 / 100 / 300 / 700 / 1500 XP, with a hard top; garbage is level 1", () => {
  assert.deepEqual(PROFICIENCY_LEVELS.map((l) => l.xp), [0, 100, 300, 700, 1500]);
  assert.deepEqual(PROFICIENCY_LEVELS.map((l) => l.zh), ["初学", "熟练", "精通", "大师", "传奇"]);
  const at = [[0, 1], [99, 1], [100, 2], [299, 2], [300, 3], [699, 3], [700, 4], [1499, 4], [1500, 5], [999999, 5]];
  for (const [xp, level] of at) assert.equal(levelOf(xp), level, `${xp} XP`);
  for (const bad of [undefined, null, NaN, -50, "x"]) assert.equal(levelOf(bad), 1);
  assert.equal(MAX_LEVEL, 5);
  assert.equal(MAX_XP, 1500);
});

test("2. one game gives at most XP_GAME_CAP per move; makes never beat uses; a refused attempt (no use) gives nothing", () => {
  assert.equal(XP_GAME_CAP, 6);
  assert.equal(gameXp({ u: 2, m: 2 }), 6);
  assert.equal(gameXp({ u: 2, m: 0 }), 4);
  assert.equal(gameXp({ u: 1, m: 1 }), 3);
  assert.equal(gameXp({ u: 50, m: 50 }), 6, "farming a single game is capped");
  assert.equal(gameXp({ u: 1, m: 9 }), 3, "makes are clamped to uses");
  assert.equal(gameXp({ u: 0, m: 3 }), 0, "no fired use, no XP");
  for (const bad of [undefined, null, {}, { u: "a" }, { u: -3, m: 1 }]) assert.equal(gameXp(bad), 0);
});

test("3. addGameXp: adds per move, never mutates, tops out at the legend level, leaves an unused move alone", () => {
  const before = { dream_shake: 10 };
  const after = addGameXp(before, { dream_shake: { u: 2, m: 1 }, fadeaway: { u: 0, m: 0 } });
  assert.deepEqual(after, { dream_shake: 15 });
  assert.deepEqual(before, { dream_shake: 10 }, "input untouched");
  assert.equal(addGameXp({ dream_shake: 1498 }, { dream_shake: { u: 2, m: 2 } }).dream_shake, 1500, "capped at the top");
  assert.equal(addGameXp({ dream_shake: 1500 }, { dream_shake: { u: 2, m: 2 } }).dream_shake, 1500);
  assert.deepEqual(addGameXp(undefined, null), {});
});

test("4. progress for the screen: level, XP to the next level, the bonus; the top level has no next", () => {
  const p = progressOf(130);
  assert.equal(p.level, 2);
  assert.equal(p.toNext, 170);
  assert.equal(p.next.zh, "精通");
  assert.equal(p.boost, 0.01);
  const top = progressOf(1500);
  assert.ok(top.maxed && top.next === null && top.toNext === 0 && top.boost === 0.04);
  assert.equal(boostOf(1), 0);
  assert.equal(boostOf(5), 0.04);
  assert.equal(boostOf(99), 0.04, "a level above the top is the top");
  assert.deepEqual(levelsMap({ dream_shake: 400 }, ["dream_shake", "fadeaway"]), { dream_shake: 3 }, "only moves above Lv1 ride on the card");
  assert.deepEqual(levelsMap({}, ["dream_shake"]), {}, "no XP: the card is exactly what it was");
});

test("5. the ledger: XP is settled with the usage counts, once per game, and survives a damaged record", () => {
  const l0 = loadoutOf({});
  const l1 = recordUsage(l0, "g1", { dream_shake: { u: 2, m: 1 } });
  assert.equal(l1.xp.dream_shake, 5);
  assert.equal(recordUsage(l1, "g1", { dream_shake: { u: 2, m: 2 } }), l1, "the same game twice adds nothing, XP included");
  assert.equal(recordUsage(l1, "g2", { dream_shake: { u: 2, m: 2 } }).xp.dream_shake, 11);
  assert.deepEqual(loadoutOf({ loadout: { xp: { a: "x", b: -4, c: 99999, d: 12 } } }).xp, { c: 1500, d: 12 });
});

test("6. the engine: a level adds exactly +0.01 per level to the move's make boost, nothing else; no level is the catalogue's boost", () => {
  const base = SKILL_PACKS.dream_shake.makeBoost;
  const baller = (levels) => ({ skills: ["dream_shake"], signatureLevels: levels });
  assert.equal(fireSignature(baller(undefined), "dream_shake").makeBoost, base, "no proficiency: byte-for-byte the catalogue boost");
  assert.equal(fireSignature(baller({}), "dream_shake").makeBoost, base);
  assert.equal(fireSignature(baller({ dream_shake: 1 }), "dream_shake").makeBoost, base);
  for (let lv = 2; lv <= 5; lv++) assert.equal(fireSignature(baller({ dream_shake: lv }), "dream_shake").makeBoost, Math.round((base + PROFICIENCY_BOOST_PER_LEVEL * (lv - 1)) * 1000) / 1000, `Lv${lv}`);
  assert.equal(fireSignature(baller({ dream_shake: 99 }), "dream_shake").makeBoost, Math.round((base + 0.04) * 1000) / 1000, "a level above the top is the top");
  assert.equal(fireSignature(baller({ dream_shake: "x" }), "dream_shake").makeBoost, base, "garbage is level 1");
  const lv5 = fireSignature(baller({ dream_shake: 5 }), "dream_shake");
  const lv1 = fireSignature(baller(undefined), "dream_shake");
  // (the shot zone of a hybrid move is rolled per call, so it is not compared: a level must not touch anything else that is fixed)
  const fixed = ({ id, name, openBoost, guaranteed, label }) => ({ id, name, openBoost, guaranteed, label });
  assert.deepEqual(fixed(lv5), fixed(lv1), "nothing but the make boost differs (openness, label, guarantee)");
  assert.equal(fireSignature({ skills: ["dream_shake"], signatureLevels: { dream_shake: 5 } }, "stepback"), null, "a level never grants a move");
});

test("7. a leveled move that procs at random (not equipped) gets the same boost: one builder", () => {
  const base = SKILL_PACKS.dream_shake.makeBoost;
  const seen = new Set();
  for (let i = 0; i < 600; i++) {
    const fx = trySignatureOffense({ skills: ["dream_shake"], signatureLevels: { dream_shake: 5 } }, null, {});
    if (fx) seen.add(fx.makeBoost);
  }
  assert.deepEqual([...seen], [Math.round((base + 0.04) * 1000) / 1000], "every random proc carried the leveled boost");
  const plain = new Set();
  for (let i = 0; i < 600; i++) { const fx = trySignatureOffense({ skills: ["dream_shake"] }, null, {}); if (fx) plain.add(fx.makeBoost); }
  assert.deepEqual([...plain], [base], "no levels: the original boost");
});

// A real Reborn run that owns an awakened dream_shake.
const run = (seed, xp) => {
  const r = createRebornState(seed, ROWS);
  return { ...r, player: { ...r.player, loadout: { version: 1, equipped: ["dream_shake"], known: ["dream_shake"], stats: {}, xp, settled: [] }, awakening: { version: 1, season: 1997, form: [], ready: [], awakened: [{ skillId: "dream_shake", source: "awakened", game: 1, season: 1997, evidence: {} }] } } };
};
const play = (reborn) => playGame(reborn, buildSeason(reborn, ROWS), ROWS, { participation: { getMode: () => "auto" } });

test("8a. the engine REALLY plays his level: it is on his card on the sim, and on nobody else's", async () => {
  const lv5 = await captureHero(() => play(run("m2-a", { dream_shake: 1500 })));
  assert.ok(lv5.sims.length > 1 && lv5.players > 40, "the capture covers his game and the rest of the league's day");
  assert.equal(lv5.wired.length, 1, "exactly one player in the whole day carries signature wiring: the hero");
  assert.deepEqual(lv5.hero.signatureLevels, { dream_shake: 5 });
  const lv1 = await captureHero(() => play(run("m2-a", {})));
  assert.equal(lv1.hero.signatureLevels, undefined, "no XP: the card carries no levels at all (exactly what it was)");
  const mid = await captureHero(() => play(run("m2-a", { dream_shake: 400 })));
  assert.deepEqual(mid.hero.signatureLevels, { dream_shake: 3 });
});

test("8. a real game: his level rides on the report; no XP is level 1; a real game's counts settle into XP exactly once", async () => {
  const fresh = await play(run("m2-a", {}));
  assert.equal(fresh.report.signature.levels.dream_shake, 1);
  const maxed = await play(run("m2-a", { dream_shake: 1500 }));
  assert.equal(maxed.report.signature.levels.dream_shake, 5, "the loadout's XP reaches the game");
  // settle the real game the way the career screen does
  const sig = fresh.report.line.zones?.sig;
  const used = fresh.report.signature.used;
  assert.equal(sig?.dream_shake?.u ?? 0, used, "the engine's own count equals the report's uses (every fired move was a purposeful use)");
  const once = recordUsage(loadoutOf(fresh.reborn.player), fresh.report.gameId, sig);
  const twice = recordUsage(once, fresh.report.gameId, sig);
  assert.equal(once.xp.dream_shake ?? 0, gameXp({ u: used, m: sig?.dream_shake?.m ?? 0 }));
  assert.deepEqual(twice.xp, once.xp, "settled once");
  assert.ok(used === 0 || once.xp.dream_shake > 0, "a game where he fired the move earns XP");
});

const reborn = (xp) => ({ player: { loadout: { version: 1, equipped: ["dream_shake"], known: ["dream_shake", "fadeaway"], stats: {}, xp, settled: [] }, awakening: { version: 1, season: 1997, form: [], ready: [], awakened: [{ skillId: "dream_shake", source: "awakened", game: 1, season: 1997, evidence: {} }, { skillId: "fadeaway", source: "awakened", game: 2, season: 1997, evidence: {} }] } } });
const card = { skills: ["dream_shake", "fadeaway"] };

test("9. the career screen: level, name, XP, XP to the next level and the bonus per move; the top level says so", () => {
  const zh = loadoutHtml({ reborn: reborn({ dream_shake: 130, fadeaway: 1500 }), card, lang: "zh" });
  assert.match(zh, /Lv\.2 熟练 · 130 经验 · 距精通还差 170 · 命中 \+1%/);
  assert.match(zh, /Lv\.5 传奇 · 已满级 · 命中 \+4%/);
  assert.match(zh, /<details data-testid="proficiency-rules"><summary>熟练度怎么算<\/summary><p>每次发动 \+2 经验、命中再 \+1，单场每个动作最多 6/, "the long rule text is folded away by default");
  assert.ok(!/<details[^>]*\sopen/.test(zh), "closed by default: the moves come first on a phone");
  assert.match(zh, /不改变每场 2 次的预算/);
  const en = loadoutHtml({ reborn: reborn({ dream_shake: 130, fadeaway: 1500 }), card, lang: "en" });
  assert.match(en, /Lv\.2 Proficient · 130 XP · 170 to Expert · \+1% to make/);
  assert.match(en, /Lv\.5 Legend · max level · \+4% to make/);
  assert.ok(!/[\u4e00-\u9fff]/.test(en), "English shows no Chinese");
  const none = loadoutHtml({ reborn: reborn({}), card, lang: "zh" });
  assert.match(none, /Lv\.1 初学 · 0 经验 · 距熟练还差 100(?! · 命中)/, "Lv1 shows no bonus");
  assert.equal((none.match(/data-testid="proficiency"/g) || []).length, 2, "one line per owned move");
});
