import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
globalThis.localStorage = createMemoryStorage();

const { extractPlayerPrefs, applyPlayerPrefs, mergePlayerPrefs } = await import("../js/data/playerPrefs.js");
const { applyRecommendedDefaults, markOrdersManual, markPlayPosManual, suggestTargetMinutes } = await import("../js/engine/gameplan.js");
const { createAccount, saveAccount, getAccount, rememberPlayerPrefs, accountToTeam } = await import("../js/data/account.js");
const { realTeam } = await import("./helpers/realGame.js");
const { GameSim } = await import("../js/engine/sim.js");
const { PLAYERS } = await import("../js/data/players.js");

const squad = () => realTeam("LAL", 2001).players.slice(0, 7);

test("only hand-set fields are stored; a player on pure auto stores nothing", () => {
  const [a, b] = squad().map((p) => applyRecommendedDefaults(structuredClone(p)));
  assert.equal(extractPlayerPrefs(a), null, "auto recommendations must not be frozen as 'preferences'");
  markOrdersManual(b, { usage: "score" });
  markPlayPosManual(b, "SF");
  const prefs = extractPlayerPrefs(b);
  assert.equal(prefs.orders.usage, "score");
  assert.equal(prefs.playPos, "SF");
  assert.equal(prefs.targetMinutes, undefined, "minutes untouched -> not stored");
});

test("a changed minutes target is a preference; the suggested value is not", () => {
  const [p] = squad();
  p.targetMinutes = suggestTargetMinutes(p);
  assert.equal(extractPlayerPrefs(p), null);
  p.targetMinutes = suggestTargetMinutes(p) + 6;
  assert.equal(extractPlayerPrefs(p).targetMinutes, p.targetMinutes);
});

test("apply restores the values AND the manual flags so recommendations leave them alone", () => {
  const [p] = squad();
  applyPlayerPrefs(p, { playPos: "C", orders: { usage: "organize" }, targetMinutes: 40 });
  applyRecommendedDefaults(p); // what setup does on open
  assert.equal(p.playPos, "C");
  assert.equal(p.orders.usage, "organize");
  assert.equal(p.targetMinutes, 40);
});

test("a player put back on auto is dropped from the stored map; others are kept", () => {
  const [a, b] = squad();
  markOrdersManual(a, { usage: "score" });
  markOrdersManual(b, { usage: "defend" });
  let map = mergePlayerPrefs({}, [a, b]);
  assert.deepEqual(Object.keys(map).sort(), [a.id, b.id].sort());
  const reset = applyRecommendedDefaults(structuredClone(a), { force: true });
  reset.ordersManual = false;
  map = mergePlayerPrefs(map, [reset]);
  assert.deepEqual(Object.keys(map), [b.id]);
});

test("account round trip: preferences survive into the next game's team", () => {
  const acc = createAccount("prefs-tester");
  const players = squad();
  PLAYERS.push(...players); // Node never loads the async roster
  acc.playerIds = players.map((p) => p.id);
  acc.coachId = acc.coachId || null;
  saveAccount(acc);
  const first = accountToTeam(getAccount(acc.id));
  const star = first.players[0];
  markOrdersManual(star, { usage: "score", attack: "perimeter" });
  assert.ok(rememberPlayerPrefs(acc.id, first.players));
  const next = accountToTeam(getAccount(acc.id));
  const again = next.players.find((p) => p.id === star.id);
  assert.equal(again.orders.usage, "score");
  assert.equal(again.orders.attack, "perimeter");
});

test("the simulator can change orders in-game; the saved squad object is untouched", () => {
  const home = { ...realTeam("LAL", 2001) };
  home.players = home.players.map((p) => applyRecommendedDefaults(structuredClone(p)));
  const star = home.players[0];
  markOrdersManual(star, { usage: "score" });
  const before = JSON.stringify(star.orders);
  const away = realTeam("BOS", 2008);
  const sim = new GameSim({ home, away, youSide: "home", speed: 3, onEvent: () => {}, onTick: () => {}, onEnd: () => {} });
  const live = sim.home.roster.find((p) => p.id === star.id);
  live.orders = { ...live.orders, usage: "defend" }; // what autopilot/setPlayerOrders does
  assert.equal(JSON.stringify(star.orders), before, "in-game edits must not leak into the next game's setup");
});
