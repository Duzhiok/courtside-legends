/**
 * Account Level for the online page (js/online/client.js).
 *
 * The online client cannot import js/data/accountLevel.js — that module pulls
 * in the account/card layer (players.js + the full roster), which the slim
 * online page must not load. This tiny module does the one thing the online
 * game-over handler needs: add friend-match XP (+20) to the active LOCAL
 * account (same origin, same localStorage), or to the local guest record when
 * no local account is signed in. It shares the storage keys
 * (js/data/accountKeys.js) and the `axp` shape with accountLevel.js, which is
 * the source of truth for the level math — this file only increments totalXp.
 */
import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY, GUEST_AXP_KEY } from "./accountKeys.js";

export const FRIEND_MATCH_XP = 20;

function storageOf(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

function readJson(store, key) {
  try {
    const raw = store?.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeJson(store, key, value) {
  try {
    store?.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

function bump(axp) {
  const next = {
    totalXp: Math.max(0, Math.floor(axp?.totalXp) || 0) + FRIEND_MATCH_XP,
    claimed: Array.isArray(axp?.claimed) ? [...axp.claimed] : [],
    once: axp?.once && typeof axp.once === "object" ? { ...axp.once } : {},
  };
  return next;
}

/**
 * Award one finished online friend-match (own roster) to the local account.
 * One call is one completed duel — the game_over message arrives once per
 * duel, same as the recordGame call next to it. Returns { gained, totalXp,
 * owner: "account" | "guest" } or null when storage is unavailable.
 */
export function awardFriendMatchXp(storage) {
  const store = storageOf(storage);
  if (!store) return null;
  // ACTIVE_ACCOUNT_KEY holds a plain id string (not JSON); the accounts
  // store holds JSON { accounts: [...] }.
  let activeId = null;
  try { activeId = store.getItem(ACTIVE_ACCOUNT_KEY); } catch { activeId = null; }
  const accountsStore = readJson(store, ACCOUNTS_KEY);
  const accounts = Array.isArray(accountsStore?.accounts) ? accountsStore.accounts : [];
  const account = activeId ? accounts.find((a) => a?.id === activeId) : null;
  if (account) {
    account.axp = bump(account.axp);
    writeJson(store, ACCOUNTS_KEY, { ...accountsStore, accounts });
    return { gained: FRIEND_MATCH_XP, totalXp: account.axp.totalXp, owner: "account" };
  }
  const guest = bump(readJson(store, GUEST_AXP_KEY));
  writeJson(store, GUEST_AXP_KEY, guest);
  return { gained: FRIEND_MATCH_XP, totalXp: guest.totalXp, owner: "guest" };
}
