// Duel prizes used to mint 250 gold per game (winner +200, loser +50) with no limit at all, and a forfeit paid
// out the instant the loser's socket closed. Two accounts could farm each other for thousands of gold in
// seconds. Now: the loser gets nothing, and a winner's gold is capped per opponent and per day.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import {
  createEconomyStore,
  DAILY_PRIZE_CAP,
  PAIR_DAILY_PRIZE_LIMIT,
  START_GOLD,
  WIN_PRIZE,
} from "../server/online-economy.mjs";
import { createOnlineServer } from "../server/online-server.mjs";
import { loginClient, sendJson, tmpFile, waitFor, marketOf } from "./helpers/onlineWire.js";

const POOL = Array.from({ length: 20 }, (_, i) => `c${i + 1}`);
const OVR = new Map(POOL.map((id, i) => [id, 70 + i]));
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2030, 0, 15, 12, 0, 0);

/** An economy store on a throwaway file, with a clock the test controls. */
function makeStore(opts = {}) {
  const file = tmpFile("prize");
  const clock = { t: T0 };
  const store = createEconomyStore({ file, cardIds: POOL, cardOvr: OVR, now: () => clock.t, ...opts });
  const reopen = (extra = {}) => createEconomyStore({ file, cardIds: POOL, cardOvr: OVR, now: () => clock.t, ...opts, ...extra });
  return { store, clock, file, reopen, cleanup: () => rmSync(file, { force: true }) };
}

test("the loser of a duel gets nothing; the winner gets the prize", () => {
  const { store, cleanup } = makeStore();
  try {
    const res = store.recordDuel("Alice", "Bob");
    assert.equal(res.winnerPrize, WIN_PRIZE);
    assert.equal(res.winnerGold, START_GOLD + WIN_PRIZE);
    assert.equal(res.loserGold, START_GOLD, "no consolation prize: it was a faucet");
    assert.equal(res.limited, null);
    assert.equal(store.getPlayer("Bob").gold, START_GOLD);
  } finally {
    cleanup();
  }
});

test("the same two accounts only pay out a few times a day, in either direction", () => {
  const { store, cleanup } = makeStore();
  try {
    const paid = [];
    for (let i = 0; i < PAIR_DAILY_PRIZE_LIMIT; i++) paid.push(store.recordDuel(i % 2 ? "Bob" : "Alice", i % 2 ? "Alice" : "Bob").winnerPrize);
    assert.deepEqual(paid, Array(PAIR_DAILY_PRIZE_LIMIT).fill(WIN_PRIZE), "the first few pay normally, whoever wins");
    const over = store.recordDuel("Alice", "Bob");
    assert.equal(over.winnerPrize, 0, "the pair is used up for today");
    assert.equal(over.limited, "pair");
    assert.equal(over.winnerGold, store.getPlayer("Alice").gold, "and nothing was added");
    assert.equal(store.recordDuel("Bob", "Alice").winnerPrize, 0, "the reverse direction is the same pair");
    assert.equal(store.recordDuel("Alice", "Carol").winnerPrize, WIN_PRIZE, "a different opponent still pays");
  } finally {
    cleanup();
  }
});

test("an account can only earn so much prize gold per day, across opponents", () => {
  const { store, cleanup } = makeStore();
  try {
    let earned = 0;
    for (let i = 0; earned < DAILY_PRIZE_CAP; i++) earned += store.recordDuel("Alice", `Opp${i}`).winnerPrize;
    assert.equal(earned, DAILY_PRIZE_CAP);
    const over = store.recordDuel("Alice", "Fresh");
    assert.equal(over.winnerPrize, 0);
    assert.equal(over.limited, "daily");
    assert.equal(store.getPlayer("Alice").gold, START_GOLD + DAILY_PRIZE_CAP);
  } finally {
    cleanup();
  }
});

test("the last bit of the daily cap is paid in part, not skipped", () => {
  const { store, cleanup } = makeStore({ dailyPrizeCap: 500 }); // 2 full prizes, then 100 left
  try {
    assert.equal(store.recordDuel("Alice", "A").winnerPrize, 200);
    assert.equal(store.recordDuel("Alice", "B").winnerPrize, 200);
    const part = store.recordDuel("Alice", "C");
    assert.equal(part.winnerPrize, 100);
    assert.equal(part.limited, "daily", "and the player is told the cap was reached");
    assert.equal(store.recordDuel("Alice", "D").winnerPrize, 0);
  } finally {
    cleanup();
  }
});

test("the limits reset on a new day", () => {
  const { store, clock, cleanup } = makeStore();
  try {
    for (let i = 0; i < PAIR_DAILY_PRIZE_LIMIT; i++) store.recordDuel("Alice", "Bob");
    assert.equal(store.recordDuel("Alice", "Bob").winnerPrize, 0);
    clock.t += DAY;
    assert.equal(store.recordDuel("Alice", "Bob").winnerPrize, WIN_PRIZE, "tomorrow the pair pays again");
  } finally {
    cleanup();
  }
});

test("restarting the server does not reset the limits", () => {
  const { store, reopen, cleanup } = makeStore();
  try {
    for (let i = 0; i < PAIR_DAILY_PRIZE_LIMIT; i++) store.recordDuel("Alice", "Bob");
    const again = reopen();
    assert.equal(again.recordDuel("Alice", "Bob").winnerPrize, 0, "still limited after a restart");
    assert.equal(again.getPlayer("Alice").gold, START_GOLD + PAIR_DAILY_PRIZE_LIMIT * WIN_PRIZE);
  } finally {
    cleanup();
  }
});

test("an account called __proto__ is an ordinary account for the limits too", () => {
  const { store, cleanup } = makeStore();
  try {
    for (let i = 0; i < PAIR_DAILY_PRIZE_LIMIT; i++) assert.equal(store.recordDuel("__proto__", "constructor").winnerPrize, WIN_PRIZE);
    assert.equal(store.recordDuel("__proto__", "constructor").winnerPrize, 0);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.keys(Object.prototype).length, 0, "nothing leaked onto Object.prototype");
  } finally {
    cleanup();
  }
});

test("a corrupt prize ledger in the save file is ignored, not trusted and not fatal", () => {
  const { store, file, clock, reopen, cleanup } = makeStore();
  try {
    store.recordDuel("Alice", "Bob");
    const raw = JSON.parse(readFileSync(file, "utf8"));
    raw.prizeDay = { day: new Date(clock.t).toISOString().slice(0, 10), pairs: "lots", earned: [1, 2, 3] };
    writeFileSync(file, JSON.stringify(raw));
    const again = reopen();
    assert.equal(again.recordDuel("Alice", "Bob").winnerPrize, WIN_PRIZE, "treated as a fresh day instead of crashing or paying nothing");
    raw.prizeDay = { day: "2030-01-15", pairs: { "[\"Alice\",\"Bob\"]": -5 }, earned: { Alice: "NaN" } };
    writeFileSync(file, JSON.stringify(raw));
    assert.doesNotThrow(() => reopen().recordDuel("Alice", "Bob"));
    // An array where an object belongs would read as {"0": 1000, ...}: an account named "0" would look maxed out.
    raw.prizeDay = { day: new Date(clock.t).toISOString().slice(0, 10), pairs: [], earned: [DAILY_PRIZE_CAP, DAILY_PRIZE_CAP] };
    writeFileSync(file, JSON.stringify(raw));
    assert.equal(reopen().recordDuel("0", "1").winnerPrize, WIN_PRIZE, "array-shaped ledgers are discarded, not reinterpreted");
  } finally {
    cleanup();
  }
});

test("the rules text on the online page states the real numbers", () => {
  const html = readFileSync(new URL("../online.html", import.meta.url), "utf8");
  assert.ok(html.includes(`赢家得 ${WIN_PRIZE} 金`), "winner prize");
  assert.ok(html.includes(`每天最多付 ${PAIR_DAILY_PRIZE_LIMIT} 次奖`), "per-opponent limit");
  assert.ok(html.includes(`每天奖金最多 ${DAILY_PRIZE_CAP} 金`), "daily cap");
  assert.ok(!/输 \+\d+ 金/.test(html), "no consolation prize is promised");
});

// ---- over the wire: the forfeit farm ----

test("wire: two accounts cannot farm each other with instant forfeits", async () => {
  const acctFile = tmpFile("acct");
  const ecoFile = tmpFile("eco");
  const server = createOnlineServer({ port: 0, graceMs: 100, accountsFile: acctFile, economyFile: ecoFile });
  await new Promise((r) => server.wss.on("listening", r));
  const url = `ws://localhost:${server.port()}`;
  const open = [];
  try {
    const alice = await loginClient(url, "Alice");
    open.push(alice);
    let bob = await loginClient(url, "Bob");
    open.push(bob);
    const prizes = [];
    const rounds = PAIR_DAILY_PRIZE_LIMIT + 2;
    for (let round = 0; round < rounds; round++) {
      if (round > 0) {
        bob = await loginClient(url, "Bob", { register: false });
        open.push(bob);
      }
      sendJson(alice, { type: "queue", name: "Alice", roster: "online", token: alice.token });
      sendJson(bob, { type: "queue", name: "Bob", roster: "online", token: bob.token });
      await waitFor(alice.messages, () => alice.messages.filter((m) => m.type === "joined").length > round, 5000);
      bob.ws.close(); // the instant the game starts
      const eco = await waitFor(alice.messages, () => alice.messages.filter((m) => m.type === "economy").length > round, 5000)
        .then(() => alice.messages.filter((m) => m.type === "economy")[round]);
      prizes.push(eco.prize);
      if (round === PAIR_DAILY_PRIZE_LIMIT) assert.equal(eco.limited, "pair", "the winner is told why nothing was added");
    }
    assert.deepEqual(prizes, [...Array(PAIR_DAILY_PRIZE_LIMIT).fill(WIN_PRIZE), 0, 0], "instant forfeits stop paying once the pair is used up");
    const finalAlice = await marketOf(alice);
    assert.equal(finalAlice.gold, START_GOLD + PAIR_DAILY_PRIZE_LIMIT * WIN_PRIZE, "instead of 200 every single time");
    const bobBoard = await loginClient(url, "Bob", { register: false });
    open.push(bobBoard);
    assert.equal((await marketOf(bobBoard)).gold, START_GOLD, "and the quitter did not collect a consolation prize either");
  } finally {
    for (const c of open) try { c.ws.close(); } catch { /* already closed */ }
    await server.close();
    rmSync(acctFile, { force: true });
    rmSync(ecoFile, { force: true });
  }
});
