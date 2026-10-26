/**
 * T6 career-online economy MVP: a shared player market + duel prizes.
 *
 * The loop: log in -> get 1000 gold + a random 8-man 2020 roster ->
 * trade on the shared board (system listings + player listings) ->
 * order your roster (first 5 start) -> duel with it (casual or ranked)
 * -> win 200 / lose 50 gold -> trade again.
 *
 * Deliberate simplifications (see WORKNOTE R65):
 * - Cards are fungible templates, not unique instances: two players can
 *   own the same card id, and system listings restock on purchase. True
 *   scarcity (serial-numbered cards) is later work.
 * - The board is not pushed live to viewers: the acting player gets a
 *   fresh market message; everyone else refreshes on request.
 * - No market tax yet, so long-run inflation is a known issue (a tax
 *   and season resets are the planned sinks).
 *
 * The store is separate from the accounts store: accounts own identity
 * and ratings, this store owns gold, rosters and listings, keyed by
 * account name. Everything persists to one JSON file in the home
 * directory (same reasoning as accounts: never inside the served repo).
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export const DEFAULT_ECONOMY_FILE = join(homedir(), ".courtside-online-economy.json");
export const START_GOLD = 1000;
export const STARTER_SIZE = 8;
export const ROSTER_CAP = 12;
export const MIN_DUEL_ROSTER = 5;
export const WIN_PRIZE = 200;
export const LOSE_PRIZE = 50;
export const MAX_LISTINGS_PER_PLAYER = 5;
export const MIN_PRICE = 50;
export const MAX_PRICE = 5000;
export const SYSTEM_BOARD_SIZE = 30;

export function systemPrice(ovr) {
  return Math.max(100, Math.round((ovr - 60) * 20));
}

function pickRandom(pool, n, rng = Math.random) {
  const copy = [...pool];
  const out = [];
  while (copy.length && out.length < n) {
    out.push(copy.splice(Math.floor(rng() * copy.length), 1)[0]);
  }
  return out;
}

export function createEconomyStore({ file = DEFAULT_ECONOMY_FILE, cardIds = [], cardOvr = new Map() } = {}) {
  // Null prototype: a player named "__proto__" / "constructor" must be an ordinary key, not Object.prototype.
  const state = { players: Object.create(null), listings: [], nextListingId: 1 };
  try {
    const raw = JSON.parse(readFileSync(file, "utf8"));
    if (raw && typeof raw === "object") {
      Object.assign(state, raw);
      state.players = Object.assign(Object.create(null), raw.players);
      state.listings = raw.listings || [];
      state.nextListingId = raw.nextListingId || 1;
    }
  } catch {
    // Missing/corrupt file: start empty (same caveat as accounts).
  }

  const save = () => {
    try {
      mkdirSync(dirname(file), { recursive: true });
      const tmp = `${file}.tmp`;
      writeFileSync(tmp, JSON.stringify(state));
      renameSync(tmp, file);
    } catch {
      // Best-effort; the game still works in memory.
    }
  };

  const topUpSystemBoard = () => {
    if (!cardIds.length) return;
    const systemCount = state.listings.filter((l) => l.seller === null).length;
    for (let i = systemCount; i < SYSTEM_BOARD_SIZE; i++) {
      const id = cardIds[Math.floor(Math.random() * cardIds.length)];
      state.listings.push({
        id: state.nextListingId++,
        seller: null,
        cardId: id,
        price: systemPrice(cardOvr.get(id) ?? 75),
      });
    }
  };

  const ensurePlayer = (name) => {
    if (!state.players[name]) {
      state.players[name] = {
        gold: START_GOLD,
        roster: pickRandom(cardIds, Math.min(STARTER_SIZE, cardIds.length)),
      };
      save();
    }
    return state.players[name];
  };

  topUpSystemBoard();

  return {
    ensurePlayer,
    getPlayer: (name) => {
      const p = ensurePlayer(name);
      return { gold: p.gold, roster: [...p.roster] };
    },
    getBoard: () => state.listings.map((l) => ({ ...l })),
    listCard: (name, cardId, price) => {
      const p = ensurePlayer(name);
      if (!Number.isInteger(price) || price < MIN_PRICE || price > MAX_PRICE) {
        return { ok: false, reason: `挂牌价需为 ${MIN_PRICE}–${MAX_PRICE} 之间的整数` };
      }
      const idx = p.roster.indexOf(cardId);
      if (idx < 0) return { ok: false, reason: "你没有这张卡" };
      if (state.listings.filter((l) => l.seller === name).length >= MAX_LISTINGS_PER_PLAYER) {
        return { ok: false, reason: `每人最多同时挂 ${MAX_LISTINGS_PER_PLAYER} 张` };
      }
      p.roster.splice(idx, 1); // escrow: listed cards leave the roster
      state.listings.push({ id: state.nextListingId++, seller: name, cardId, price });
      save();
      return { ok: true };
    },
    buyListing: (buyerName, listingId) => {
      const listing = state.listings.find((l) => l.id === listingId);
      if (!listing) return { ok: false, reason: "这张牌已不在市场上" };
      if (listing.seller === buyerName) return { ok: false, reason: "不能买自己挂的牌" };
      const buyer = ensurePlayer(buyerName);
      if (buyer.roster.length >= ROSTER_CAP) return { ok: false, reason: `阵容已满 ${ROSTER_CAP} 人` };
      if (buyer.gold < listing.price) return { ok: false, reason: "金币不够" };
      buyer.gold -= listing.price;
      buyer.roster.push(listing.cardId);
      if (listing.seller) {
        const seller = ensurePlayer(listing.seller);
        seller.gold += listing.price;
      }
      state.listings = state.listings.filter((l) => l.id !== listingId);
      if (listing.seller === null) topUpSystemBoard(); // system supply restocks
      save();
      return { ok: true, cardId: listing.cardId, price: listing.price };
    },
    cancelListing: (name, listingId) => {
      const listing = state.listings.find((l) => l.id === listingId);
      if (!listing) return { ok: false, reason: "这张牌已不在市场上" };
      if (listing.seller !== name) return { ok: false, reason: "只能撤自己的挂牌" };
      ensurePlayer(name).roster.push(listing.cardId);
      state.listings = state.listings.filter((l) => l.id !== listingId);
      save();
      return { ok: true };
    },
    reorderRoster: (name, cardIdsOrdered) => {
      if (!Array.isArray(cardIdsOrdered)) return { ok: false, reason: "阵容顺序格式不对" };
      const p = ensurePlayer(name);
      const sorted = [...p.roster].sort();
      const given = [...cardIdsOrdered].sort();
      if (sorted.length !== given.length || sorted.some((c, i) => c !== given[i])) {
        return { ok: false, reason: "顺序必须正好是现有阵容的一个排列" };
      }
      p.roster = [...cardIdsOrdered];
      save();
      return { ok: true };
    },
    recordDuel: (winnerName, loserName) => {
      if (!winnerName || !loserName || winnerName === loserName) return null;
      const winner = ensurePlayer(winnerName);
      const loser = ensurePlayer(loserName);
      winner.gold += WIN_PRIZE;
      loser.gold += LOSE_PRIZE;
      save();
      return { winnerGold: winner.gold, loserGold: loser.gold };
    },
  };
}
