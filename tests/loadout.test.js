/**
 * Skills M1c: the signature-move loadout. Pure rules, the wiring into a real Reborn game (only EQUIPPED moves are set to fire on
 * purpose), old-save compatibility, and the career-screen view + click helper.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { LOADOUT_SLOTS, equipSkill, equippedOf, loadoutOf, recordUsage, syncLoadout, unequipSkill, usageOf } from "../js/reborn/loadout.js";
import { createRebornState } from "../js/reborn/identity.js";
import { buildSeason, playGame } from "../js/reborn/season.js";
import { loadoutClick, loadoutHtml } from "../js/ui/reborn/loadoutView.js";
import { captureHero } from "./helpers/captureHero.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const OWNED = ["dream_shake", "fadeaway", "stepback", "teardrop"];

test("1. an old save (no loadout) equips what he owns in card order up to the slots; the rest wait in the collection", () => {
  assert.equal(LOADOUT_SLOTS, 3);
  assert.deepEqual(equippedOf({}, OWNED), ["dream_shake", "fadeaway", "stepback"], "exactly what M1b armed for anyone with three or fewer");
  assert.deepEqual(equippedOf({}, ["dream_shake"]), ["dream_shake"]);
  assert.deepEqual(equippedOf({}, []), []);
  const once = syncLoadout(loadoutOf({}), OWNED);
  assert.deepEqual(syncLoadout(once, OWNED), once, "sync is idempotent");
});

test("2. a move he no longer owns leaves the slots; a newly owned move takes a free slot, but never a full one", () => {
  const start = syncLoadout(loadoutOf({}), ["dream_shake", "fadeaway"]);
  assert.deepEqual(syncLoadout(start, ["dream_shake"]).equipped, ["dream_shake"]);
  assert.deepEqual(syncLoadout(start, ["dream_shake", "fadeaway", "stepback"]).equipped, ["dream_shake", "fadeaway", "stepback"], "free slot: the new move is armed");
  const full = syncLoadout(loadoutOf({}), OWNED);
  assert.deepEqual(syncLoadout(full, [...OWNED, "skyhook"]).equipped, ["dream_shake", "fadeaway", "stepback"], "slots full: the new move waits");
});

test("3. equip / unequip: free, one change at a time, with a plain reason when it cannot", () => {
  const base = syncLoadout(loadoutOf({}), OWNED); // 3 equipped, teardrop waiting
  assert.deepEqual(equipSkill(base, OWNED, "teardrop"), { ok: false, reason: "full", loadout: base });
  const freed = unequipSkill(base, OWNED, "fadeaway");
  assert.ok(freed.ok);
  assert.deepEqual(freed.loadout.equipped, ["dream_shake", "stepback"]);
  const swapped = equipSkill(freed.loadout, OWNED, "teardrop");
  assert.ok(swapped.ok);
  assert.deepEqual(swapped.loadout.equipped, ["dream_shake", "stepback", "teardrop"], "swap = unequip one, equip another");
  assert.equal(equipSkill(base, OWNED, "skyhook").reason, "not-owned");
  assert.equal(equipSkill(base, OWNED, "dream_shake").reason, "already");
  assert.equal(unequipSkill(base, OWNED, "teardrop").reason, "not-equipped");
  assert.deepEqual(base.equipped, ["dream_shake", "fadeaway", "stepback"], "no call mutates its input");
  // a move he deliberately took off does not sneak back in on the next sync
  assert.deepEqual(syncLoadout(freed.loadout, OWNED).equipped, ["dream_shake", "stepback"]);
});

test("4. the usage ledger is the engine's own counts, once per game, never above uses, unknown until used", () => {
  const l0 = loadoutOf({});
  assert.equal(usageOf(l0, "dream_shake"), null, "never used: no record, not a zero");
  const l1 = recordUsage(l0, "g1", { dream_shake: { u: 3, m: 2 }, fadeaway: { u: 0, m: 0 } });
  assert.deepEqual(usageOf(l1, "dream_shake"), { u: 3, m: 2 });
  assert.equal(usageOf(l1, "fadeaway"), null, "a move that never fired stays unknown");
  assert.equal(recordUsage(l1, "g1", { dream_shake: { u: 9, m: 9 } }), l1, "the same game twice adds nothing");
  const l2 = recordUsage(l1, "g2", { dream_shake: { u: 1, m: 5 } });
  assert.deepEqual(usageOf(l2, "dream_shake"), { u: 4, m: 3 }, "makes can never exceed uses");
  assert.equal(recordUsage(l2, "g3", null).stats.dream_shake.u, 4, "a report with no log changes nothing");
  assert.equal(recordUsage(l2, "", { dream_shake: { u: 1, m: 1 } }), l2, "no game id, no settlement");
  let many = l0;
  for (let i = 0; i < 300; i++) many = recordUsage(many, `g${i}`, { dream_shake: { u: 1, m: 0 } });
  assert.ok(many.settled.length <= 120, "the idempotency memory is bounded");
  assert.deepEqual(loadoutOf({ loadout: { equipped: "nope", stats: { x: { u: "a" } }, known: [1] } }), { version: 1, equipped: [], known: [], stats: {}, xp: {}, settled: [] }, "a damaged record is just empty");
});

// A real Reborn run that owns an awakened dream_shake: the wiring into an actual game.
const withMove = (seed, loadout) => {
  const r = createRebornState(seed, ROWS);
  return { ...r, player: { ...r.player, ...(loadout ? { loadout } : {}), awakening: { version: 1, season: 1997, form: [], ready: [], awakened: [{ skillId: "dream_shake", source: "awakened", game: 1, season: 1997, evidence: {} }] } } };
};
const play = (reborn) => playGame(reborn, buildSeason(reborn, ROWS), ROWS, { participation: { getMode: () => "auto" } });

test("5. only an EQUIPPED move is set to fire on purpose in a real game; an owned move left in the collection is not", async () => {
  const equipped = await play(withMove("m1c-a", { version: 1, equipped: ["dream_shake"], known: ["dream_shake"], stats: {}, settled: [] }));
  assert.ok(equipped.report.signature, "equipped: the game carries the signature section (budget, uses)");
  assert.equal(equipped.report.signature.used + equipped.report.signature.left, 2);
  const benched = await play(withMove("m1c-a", { version: 1, equipped: [], known: ["dream_shake"], stats: {}, settled: [] }));
  assert.equal(benched.report.signature, null, "owned but not equipped: nothing is armed, no signature section");
});

test("5a. the engine REALLY gets only the equipped moves: the card on the sim, not the report", async () => {
  // fadeaway is KNOWN but left unequipped (a move that is not in `known` would count as newly won and take the free slot: tested below)
  const two = { ...withMove("m1c-a", { version: 1, equipped: ["dream_shake"], known: ["dream_shake", "fadeaway"], stats: {}, settled: [] }) };
  two.player.awakening.awakened.push({ skillId: "fadeaway", source: "awakened", game: 2, season: 1997, evidence: {} });
  const armed = await captureHero(() => play(two));
  assert.equal(armed.wired.length, 1, "only the hero carries signature wiring");
  assert.deepEqual(armed.hero.activeSignatures, ["dream_shake"], "fadeaway is owned but left in the collection: it is NOT armed, it keeps its random proc");
  assert.ok(armed.hero.skills.includes("fadeaway"), "...and he still owns it");
  const none = await captureHero(() => play(withMove("m1c-a", { version: 1, equipped: [], known: ["dream_shake"], stats: {}, settled: [] })));
  assert.equal(none.hero, null, "nothing equipped: no card carries any wiring");
  // ...and a move he has just won DOES take the free slot, all the way into the engine's card
  const won = await captureHero(() => play({ ...two, player: { ...two.player, loadout: { version: 1, equipped: ["dream_shake"], known: ["dream_shake"], stats: {}, settled: [] } } }));
  assert.deepEqual(won.hero.activeSignatures, ["dream_shake", "fadeaway"], "a newly won move takes the free slot");
});

test("6. an old save with no loadout still plays exactly as M1b did: the owned move is armed", async () => {
  const legacy = await play(withMove("m1c-a", null));
  assert.ok(legacy.report.signature, "no loadout record -> every owned move (up to the slots) is equipped");
});

const cardWith = (skills) => ({ skills, paint: 70 });
const runWith = (loadout, awakened = []) => ({ player: { loadout, awakening: { version: 1, season: 1997, form: [], ready: [], awakened: awakened.map((skillId) => ({ skillId, source: "awakened", game: 1, season: 1997, evidence: {} })) } } });

test("7. the career screen: every owned move with type, source, status and the engine's real counts; free slots are shown", () => {
  const reborn = runWith({ version: 1, equipped: ["dream_shake"], known: ["dream_shake", "teardrop"], stats: { dream_shake: { u: 5, m: 3 } }, settled: [] }, ["dream_shake"]);
  const card = cardWith(["dream_shake", "teardrop", "glove"]);
  const zh = loadoutHtml({ reborn, card, lang: "zh" });
  assert.match(zh, /我的招牌动作 · 1\/3 已装备/);
  assert.match(zh, /每场所有已装备的动作共享 2 次/);
  assert.match(zh, /梦幻脚步[\s\S]*进攻 · 禁区 · 觉醒[\s\S]*已装备[\s\S]*使用 5 次 · 命中 3/);
  assert.match(zh, /抛投大师[\s\S]*天生[\s\S]*未装备[\s\S]*还没有使用记录/, "an unused move says so, it does not claim zero");
  assert.equal((zh.match(/data-empty="true"/g) || []).length, 2, "two free slots shown");
  assert.ok(!/<strong>手套/.test(zh), "a defensive move is not a loadout move");
  // Layout contract: slots first (equipped, then the empty ones), the collection after, other skills last.
  assert.ok(zh.indexOf("loadout-slots") < zh.indexOf("loadout-collection") && zh.indexOf("loadout-collection") < zh.indexOf("loadout-others"));
  const slots = zh.slice(zh.indexOf("loadout-slots"), zh.indexOf("loadout-collection"));
  assert.ok(slots.includes("梦幻脚步") && !slots.includes("抛投大师"), "the slots hold only the equipped move");
  assert.ok(slots.lastIndexOf("data-empty") > slots.indexOf("梦幻脚步"), "empty slots follow the equipped moves, inside the slots group");
  assert.match(zh.slice(zh.indexOf("loadout-collection")), /抛投大师/, "the unequipped move is in the collection");
  assert.match(zh, /其他技能（自动生效）：[^<]*手套/, "a non-signature skill is listed as automatic");
  assert.match(loadoutHtml({ reborn, card, lang: "en" }), /Other skills \(automatic\): The Glove/);
  const en = loadoutHtml({ reborn, card, lang: "en" });
  assert.match(en, /My signature moves · 1\/3 equipped/);
  assert.match(en, /Dream Shake[\s\S]*Offense · Paint · Awakened[\s\S]*Used 5× · 3 made/);
  assert.ok(!/[\u4e00-\u9fff]/.test(en), "English shows no Chinese");
  assert.equal(loadoutHtml({ reborn, card: cardWith(["glove"]), lang: "zh" }), "", "owning no signature move: no panel");
});

test("8. a full loadout disables the other equip buttons and says why; a move with no catalogue zone claims none", () => {
  const reborn = runWith({ version: 1, equipped: ["dream_shake", "fadeaway", "stepback"], known: OWNED, stats: {}, settled: [] });
  const html = loadoutHtml({ reborn, card: cardWith([...OWNED, "one_leg_fade"]), lang: "en" });
  assert.match(html, /data-skill="teardrop"[^>]*disabled/, "slots full: equip is disabled");
  assert.match(html, /Slots are full: unequip one first/);
  assert.match(html, /<strong>[^<]*<\/strong> <small>Offense · /, "the zone is shown when there is one");
  const noZone = html.slice(html.indexOf('data-skill="one_leg_fade"'));
  assert.match(noZone.slice(0, 300), /<small>Offense · (Awakened|Innate)/, "no zone claimed for a move that has none");
  assert.ok(!/<img/.test(loadoutHtml({ reborn, card: cardWith(["dream_shake"]), lang: "zh" })));
});

test("9. the click helper: equip / unequip return the next run; anything invalid returns null; the input is never mutated", () => {
  const reborn = runWith({ version: 1, equipped: ["dream_shake", "fadeaway", "stepback"], known: OWNED, stats: {}, settled: [] });
  const card = cardWith(OWNED);
  const click = (action, skill) => ({ target: { closest: (sel) => (sel === "[data-loadout]" ? { dataset: { loadout: action, skill } } : null) } });
  assert.equal(loadoutClick(click("equip", "teardrop"), reborn, card), null, "full: refused");
  const freed = loadoutClick(click("unequip", "fadeaway"), reborn, card);
  assert.deepEqual(freed.player.loadout.equipped, ["dream_shake", "stepback"]);
  const swapped = loadoutClick(click("equip", "teardrop"), freed, card);
  assert.deepEqual(swapped.player.loadout.equipped, ["dream_shake", "stepback", "teardrop"]);
  assert.deepEqual(reborn.player.loadout.equipped, ["dream_shake", "fadeaway", "stepback"], "the original run is untouched");
  assert.equal(loadoutClick({ target: { closest: () => null } }, reborn, card), null, "not a loadout click");
  assert.equal(loadoutClick(click("equip", "skyhook"), freed, card), null, "not owned");
});
