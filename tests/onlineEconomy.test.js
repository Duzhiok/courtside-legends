import test from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { rmSync } from "node:fs";
import WebSocket from "ws";
import {
  createEconomyStore,
  START_GOLD,
  WIN_PRIZE,
  ROSTER_CAP,
  SYSTEM_BOARD_SIZE,
} from "../server/online-economy.mjs";
import { createOnlineServer } from "../server/online-server.mjs";

function tmpFile(tag) {
  return join(tmpdir(), `courtside-eco-${tag}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
}

const POOL = Array.from({ length: 20 }, (_, i) => `c${i + 1}`);
const OVR = new Map(POOL.map((id, i) => [id, 70 + i]));

function fakeStore(tag) {
  return createEconomyStore({ file: tmpFile(tag), cardIds: POOL, cardOvr: OVR });
}

test("economy store: starter career is 1000 gold + 8 cards", () => {
  const file = tmpFile("starter");
  try {
    const store = createEconomyStore({ file, cardIds: POOL, cardOvr: OVR });
    const p = store.getPlayer("Alice");
    assert.equal(p.gold, START_GOLD);
    assert.equal(p.roster.length, 8);
    assert.equal(new Set(p.roster).size, 8);
    assert.equal(store.getBoard().length, SYSTEM_BOARD_SIZE);
  } finally {
    rmSync(file, { force: true });
  }
});

test("economy store: list validations (price, ownership, per-player cap)", () => {
  const file = tmpFile("list");
  try {
    const store = createEconomyStore({ file, cardIds: POOL, cardOvr: OVR });
    const p = store.getPlayer("Alice");
    assert.equal(store.listCard("Alice", p.roster[0], 10).ok, false);
    assert.equal(store.listCard("Alice", p.roster[0], 6000).ok, false);
    assert.equal(store.listCard("Alice", p.roster[0], 99.5).ok, false);
    assert.equal(store.listCard("Alice", "not-owned", 300).ok, false);
    for (let i = 0; i < 5; i++) {
      const cur = store.getPlayer("Alice");
      assert.equal(store.listCard("Alice", cur.roster[0], 300).ok, true);
    }
    const cur = store.getPlayer("Alice");
    assert.match(store.listCard("Alice", cur.roster[0], 300).reason, /最多/);
  } finally {
    rmSync(file, { force: true });
  }
});

test("economy store: buy moves gold and card, cancel returns the card", () => {
  const file = tmpFile("buy");
  try {
    const store = createEconomyStore({ file, cardIds: POOL, cardOvr: OVR });
    const aCard = store.getPlayer("Alice").roster[0];
    assert.equal(store.listCard("Alice", aCard, 300).ok, true);
    const listing = store.getBoard().find((l) => l.seller === "Alice");
    assert.ok(listing);
    assert.equal(store.buyListing("Alice", listing.id).ok, false); // own listing
    assert.equal(store.buyListing("Bob", listing.id).ok, true);
    assert.equal(store.getPlayer("Bob").gold, START_GOLD - 300);
    assert.equal(store.getPlayer("Alice").gold, START_GOLD + 300);
    assert.ok(store.getPlayer("Bob").roster.includes(aCard));
    assert.equal(store.getBoard().some((l) => l.id === listing.id), false);

    const bCard = store.getPlayer("Bob").roster[0];
    assert.equal(store.listCard("Bob", bCard, 300).ok, true);
    const listing2 = store.getBoard().find((l) => l.seller === "Bob");
    assert.equal(store.cancelListing("Alice", listing2.id).ok, false); // not mine
    assert.equal(store.cancelListing("Bob", listing2.id).ok, true);
    assert.ok(store.getPlayer("Bob").roster.includes(bCard));
  } finally {
    rmSync(file, { force: true });
  }
});

test("economy store: roster cap blocks buys, system board restocks", () => {
  const file = tmpFile("cap");
  try {
    // Every card at OVR 60 sits at the price floor (100), so the 4 buys cost 400 and the starter gold covers
    // them. (This used to farm duel prizes for the money; prizes are capped now, and have nothing to do with
    // the roster cap anyway.)
    const flatPrices = new Map(POOL.map((id) => [id, 60]));
    const store = createEconomyStore({ file, cardIds: POOL, cardOvr: flatPrices });
    for (let i = 0; i < ROSTER_CAP - 8; i++) {
      const sys = store.getBoard().find((l) => l.seller === null);
      assert.equal(store.buyListing("Alice", sys.id).ok, true);
    }
    assert.equal(store.getPlayer("Alice").roster.length, ROSTER_CAP);
    const sys = store.getBoard().find((l) => l.seller === null);
    assert.match(store.buyListing("Alice", sys.id).reason, /已满/);
    assert.equal(store.getBoard().filter((l) => l.seller === null).length, SYSTEM_BOARD_SIZE);
  } finally {
    rmSync(file, { force: true });
  }
});

test("economy store: reorder needs an exact permutation, duel prizes pay out", () => {
  const file = tmpFile("order");
  try {
    const store = createEconomyStore({ file, cardIds: POOL, cardOvr: OVR });
    const p = store.getPlayer("Alice");
    const reversed = [...p.roster].reverse();
    assert.equal(store.reorderRoster("Alice", reversed).ok, true);
    assert.deepEqual(store.getPlayer("Alice").roster, reversed);
    assert.equal(store.reorderRoster("Alice", reversed.slice(1)).ok, false);
    const prizes = store.recordDuel("Alice", "Bob");
    assert.equal(prizes.winnerGold, START_GOLD + WIN_PRIZE);
    assert.equal(prizes.loserGold, START_GOLD, "the loser gets nothing");
    // Persistence: a new instance sees the same gold and roster.
    const store2 = createEconomyStore({ file, cardIds: POOL, cardOvr: OVR });
    assert.equal(store2.getPlayer("Alice").gold, START_GOLD + WIN_PRIZE);
    assert.deepEqual(store2.getPlayer("Alice").roster, reversed);
  } finally {
    rmSync(file, { force: true });
  }
});

// ---- wire tests ----

function connect(url) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    const messages = [];
    ws.on("message", (raw) => {
      try {
        messages.push(JSON.parse(raw));
      } catch {
        /* ignore */
      }
    });
    ws.on("open", () => resolve({ ws, messages }));
    ws.on("error", reject);
  });
}

async function waitFor(messages, pred, timeoutMs = 5000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = messages.find(pred);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("timed out waiting for a message");
}

async function loginClient(url, name) {
  const c = await connect(url);
  c.ws.send(JSON.stringify({ type: "register", name, password: "secret" }));
  await waitFor(c.messages, (m) => m.type === "registered");
  c.ws.send(JSON.stringify({ type: "login", name, password: "secret" }));
  const logged = await waitFor(c.messages, (m) => m.type === "logged_in");
  return { ...c, token: logged.token };
}

async function marketOf(c) {
  c.ws.send(JSON.stringify({ type: "market_board", token: c.token }));
  const before = c.messages.filter((m) => m.type === "market").length;
  return waitFor(c.messages, (m) => m.type === "market" && c.messages.filter((x) => x.type === "market").indexOf(m) >= before, 5000);
}

test("economy wire: list, buy and balances move across accounts", async () => {
  const acctFile = tmpFile("acct");
  const ecoFile = tmpFile("eco");
  const server = createOnlineServer({ port: 0, accountsFile: acctFile, economyFile: ecoFile });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const a = await loginClient(url, "Alice");
    const b = await loginClient(url, "Bob");
    clients.push(a, b);
    const boardA = await marketOf(a);
    assert.equal(boardA.gold, START_GOLD);
    assert.equal(boardA.roster.length, 8);
    assert.equal(boardA.listings.length, SYSTEM_BOARD_SIZE);
    const cardId = boardA.roster[0].id;
    a.ws.send(JSON.stringify({ type: "market_list", cardId, price: 300, token: a.token }));
    const afterList = await waitFor(a.messages, (m) => m.type === "market" && m.roster.length === 7);
    assert.ok(afterList.listings.some((l) => l.seller === "Alice" && l.card.id === cardId));
    const boardB = await marketOf(b);
    const listing = boardB.listings.find((l) => l.seller === "Alice");
    assert.ok(listing);
    b.ws.send(JSON.stringify({ type: "market_buy", listingId: listing.id, token: b.token }));
    const afterBuy = await waitFor(b.messages, (m) => m.type === "market" && m.gold === START_GOLD - 300);
    assert.ok(afterBuy.roster.some((c) => c.id === cardId));
    const boardA2 = await marketOf(a);
    assert.equal(boardA2.gold, START_GOLD + 300);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
    rmSync(acctFile, { force: true });
    rmSync(ecoFile, { force: true });
  }
});

test("economy wire: online-roster duel pays the winner prize on forfeit", async () => {
  const acctFile = tmpFile("acct2");
  const ecoFile = tmpFile("eco2");
  const server = createOnlineServer({ port: 0, graceMs: 150, accountsFile: acctFile, economyFile: ecoFile });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const a = await loginClient(url, "Alice");
    const b = await loginClient(url, "Bob");
    clients.push(a, b);
    a.ws.send(JSON.stringify({ type: "queue", name: "Alice", roster: "online", token: a.token }));
    b.ws.send(JSON.stringify({ type: "queue", name: "Bob", roster: "online", token: b.token }));
    await waitFor(a.messages, (m) => m.type === "room" && m.matched);
    const joined = await waitFor(a.messages, (m) => m.type === "joined");
    assert.equal(joined.home.roster.length, 8);
    assert.equal(joined.away.roster.length, 8);
    b.ws.close();
    const over = await waitFor(a.messages, (m) => m.type === "game_over" && m.forfeit, 3000);
    assert.equal(over.winner, "home");
    const eco = await waitFor(a.messages, (m) => m.type === "economy", 3000);
    assert.equal(eco.gold, START_GOLD + WIN_PRIZE);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
    rmSync(acctFile, { force: true });
    rmSync(ecoFile, { force: true });
  }
});

test("economy wire: guests cannot use the market, tiny rosters cannot duel", async () => {
  const acctFile = tmpFile("acct3");
  const ecoFile = tmpFile("eco3");
  const server = createOnlineServer({ port: 0, accountsFile: acctFile, economyFile: ecoFile });
  await new Promise((r) => server.wss.on("listening", r));
  const clients = [];
  try {
    const url = `ws://localhost:${server.port()}`;
    const guest = await connect(url);
    clients.push(guest);
    guest.ws.send(JSON.stringify({ type: "market_board" }));
    const rejected = await waitFor(guest.messages, (m) => m.type === "decision_rejected");
    assert.match(rejected.reason, /登录/);

    const a = await loginClient(url, "Alice");
    clients.push(a);
    const board = await marketOf(a);
    for (let i = 0; i < 4; i++) {
      const cur = await marketOf(a);
      a.ws.send(JSON.stringify({ type: "market_list", cardId: cur.roster[0].id, price: 300, token: a.token }));
      await waitFor(a.messages, (m) => m.type === "market" && m.roster.length === board.roster.length - i - 1);
    }
    a.ws.send(JSON.stringify({ type: "queue", name: "Alice", roster: "online", token: a.token }));
    const noDuel = await waitFor(a.messages, (m) => m.type === "decision_rejected" && /不足 5 人/.test(m.reason));
    assert.ok(noDuel);
  } finally {
    for (const c of clients) c.ws.close();
    await server.close();
    rmSync(acctFile, { force: true });
    rmSync(ecoFile, { force: true });
  }
});
