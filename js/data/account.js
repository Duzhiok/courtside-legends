/**
 * Local multi-account binder: persistent season cards + coach + tactic.
 * Cards survive refresh/offline; ranked uses this roster as the core squad.
 */
import { applyPlayerPrefs, mergePlayerPrefs } from "./playerPrefs.js";
import { COACHES, TACTICS, isStarterCoach } from "./coaches.js";
import { clonePlayer, overall, PLAYERS } from "./players.js";
import { MERGE_ATTR_KEYS, SKILL_PACKS } from "./skills.js";
import { applyHiddenRoll, legacyRollSeed } from "./cardRoll.js";
import { MAX_STARS } from "./gacha.js";
import { applyGrowth } from "./growthPaths.js";
import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY as ACTIVE_KEY } from "./accountKeys.js";

const STORE_KEY = ACCOUNTS_KEY;

// rarityLabel(ovr) used to live here (pure-OVR tag text). It is now data/playerLegacy.js's
// legacyOvrBadge(), the fallback tier inside playerLegacyBadge() -- moved so the OVR-only bands
// and the real-basketball-identity tiers (Legendary/Superstar/All-Star/...) share one function
// and one priority order instead of two call sites picking different labels for the same card.

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function uid() {
  return `acc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function loadStore() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (!raw) return { accounts: [] };
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.accounts)) return { accounts: [] };
    return parsed;
  } catch {
    return { accounts: [] };
  }
}

/**
 * Unlike season.js's saveSeason() (which already has a quota-retry fallback), this write had NO
 * error handling at all: a raw localStorage.setItem() that throws an uncaught DOMException the
 * instant the account store (every account's cards/souls/skills/daily-task state, all in one
 * blob) outgrows quota. That's the prime suspect for user report #15 ("跟存储有关系吗" -- a
 * mysterious error, possibly storage-related): saveAccount() runs on nearly every meaningful
 * click (draw a card, claim a daily task, level up, recycle a card), so an unguarded throw here
 * would abort whatever click handler was mid-flight, with no visible explanation to the player.
 * Caught here instead so a quota failure degrades to "this one save silently didn't persist"
 * (logged for diagnosis) rather than a crash -- matching saveAccount()'s existing contract of
 * always returning the account object and never throwing.
 */
function saveStore(store) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store));
    return true;
  } catch (err) {
    console.error(
      "[account] saveStore failed (likely localStorage quota) -- this action's progress was NOT persisted",
      err,
    );
    return false;
  }
}

export function listAccounts() {
  return loadStore().accounts.map((a) => ({
    id: a.id,
    name: a.name,
    createdAt: a.createdAt,
    cardCount: a.playerIds?.length || 0,
    ready: !!(a.playerIds?.length >= 5 && a.coachId && a.tacticId),
    lastDailyDraw: a.lastDailyDraw || null,
  }));
}

/** Guarded like saveStore(): a browser with storage fully disabled (some strict private-mode
 * configurations block the whole localStorage object, not just large writes) must not crash app
 * boot just because nobody has an active account chosen yet. */
export function getActiveAccountId() {
  try {
    return localStorage.getItem(ACTIVE_KEY) || null;
  } catch {
    return null;
  }
}

export function setActiveAccountId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch (err) {
    console.error("[account] setActiveAccountId failed", err);
  }
}

export function getAccount(id = getActiveAccountId()) {
  if (!id) return null;
  return loadStore().accounts.find((a) => a.id === id) || null;
}

export function saveAccount(account) {
  const store = loadStore();
  const i = store.accounts.findIndex((a) => a.id === account.id);
  if (i >= 0) store.accounts[i] = account;
  else store.accounts.push(account);
  saveStore(store);
  return account;
}

export function createAccount(name) {
  const trimmed = String(name || "").trim().slice(0, 24) || "无名教练";
  const account = {
    id: uid(),
    name: trimmed,
    createdAt: Date.now(),
    playerIds: [],
    coachIds: [], // owned coach cards (名帅靠抽卡)
    /** Per-card merge mods: { [playerId]: { merges, skills[] } } */
    cardMods: {},
    coachId: null,
    tacticId: "balanced",
    lastDailyDraw: null,
    drawHistory: [],
    gold: 0,
    rankedWins: 0,
    rankedLosses: 0,
    onboardingDone: false,
  };
  saveAccount(account);
  setActiveAccountId(account.id);
  return account;
}

export function deleteAccount(id) {
  const store = loadStore();
  store.accounts = store.accounts.filter((a) => a.id !== id);
  saveStore(store);
  if (getActiveAccountId() === id) setActiveAccountId(store.accounts[0]?.id || null);
}

/**
 * Apply account upgrades onto a cloned card:
 * each star → all rating attrs +1 (cap 100, max ★5), 本命 growth on its path,
 * learned skills, and the copy's 成色 roll on top of the historical intangibles.
 * `fallbackSeed` covers copies owned before 成色 existed.
 */
export function applyCardMods(player, mod, fallbackSeed = null) {
  if (!player) return null;
  const p = clonePlayer(player);
  const merges = Math.min(MAX_STARS, Math.max(0, mod?.merges || 0));
  p.mergeLevel = merges;
  if (merges > 0) {
    for (const key of MERGE_ATTR_KEYS) {
      if (p[key] == null) continue;
      p[key] = Math.min(100, Math.round(Number(p[key]) || 0) + merges);
    }
  }
  applyGrowth(p, mod?.growth);
  const extra = (mod?.skills || []).filter((id) => SKILL_PACKS[id]);
  if (extra.length) {
    const have = new Set(p.skills || []);
    p.skills = [...(p.skills || [])];
    for (const id of extra) {
      if (!have.has(id)) {
        p.skills.push(id);
        have.add(id);
      }
    }
  }
  return applyHiddenRoll(p, mod?.roll || fallbackSeed);
}

export function getCardMod(account, playerId) {
  return account?.cardMods?.[playerId] || null;
}

/**
 * Resolve owned ids → upgraded cards. Without an account (onboarding offers)
 * no 成色 is applied: hidden values stay unrevealed until the card is owned.
 */
export function resolvePlayers(ids, account = null, pool = PLAYERS) {
  const map = new Map(pool.map((p) => [p.id, p]));
  const mods = account?.cardMods || {};
  return (ids || [])
    .map((id) => map.get(id))
    .filter(Boolean)
    .map((p) =>
      applyCardMods(p, mods[p.id], account ? legacyRollSeed(account.id, p.id) : null)
    );
}

/** Same real person (bref) may only appear once on a roster — keep the best copy. */
export function uniqueByPerson(players, ovrOf = overall) {
  const best = new Map();
  for (const p of players) {
    const key = p.bref || p.id;
    const prev = best.get(key);
    if (!prev || ovrOf(p) > ovrOf(prev)) best.set(key, p);
  }
  return [...best.values()];
}

export function resolveCoach(coachId) {
  const c = COACHES.find((x) => x.id === coachId);
  return c ? structuredClone(c) : null;
}

export function resolveTactic(tacticId) {
  return TACTICS[tacticId] || TACTICS.balanced;
}

/** Account → live team blob for ranked / setup. */
/**
 * Best 12 owned cards, one per real person. (Used to be `playerIds.slice(0, 12)`,
 * which meant every card drawn after onboarding could never play.)
 */
export function accountToTeam(account, teamName) {
  if (!account) return null;
  const players = uniqueByPerson(resolvePlayers(account.playerIds, account))
    .sort((a, b) => overall(b) - overall(a))
    .slice(0, 12);
  if (!players.length) return null;
  for (const p of players) applyPlayerPrefs(p, account.playerPrefs?.[p.id]);
  const coach = resolveCoach(account.coachId) || structuredClone(COACHES[0]);
  return {
    name: teamName || `${account.name} 班底`,
    players,
    coach,
    tacticId: account.tacticId || "balanced",
    gold: account.gold || 0,
    isCpu: false,
    bracketId: "you",
    accountId: account.id,
  };
}

/** B2: remember the player's hand-set per-player tactics on the account (next game starts from them). */
export function rememberPlayerPrefs(accountId, players) {
  const acc = getAccount(accountId);
  if (!acc) return false;
  acc.playerPrefs = mergePlayerPrefs(acc.playerPrefs, players);
  saveAccount(acc);
  return true;
}

export function weightedPick(list, weightFn) {
  let total = 0;
  const weights = list.map((x) => {
    const w = Math.max(0.01, weightFn(x));
    total += w;
    return w;
  });
  let r = Math.random() * total;
  for (let i = 0; i < list.length; i++) {
    r -= weights[i];
    if (r <= 0) return list[i];
  }
  return list[list.length - 1];
}

/** Opening offers: obscure / rookie HCs only — no Phil / Pop / Kerr. */
export function rollCoachOffers(count = 5) {
  const pool = COACHES.filter(isStarterCoach);
  const shuffled = [...(pool.length ? pool : COACHES.filter((c) => (c.fame ?? 50) < 40))].sort(
    () => Math.random() - 0.5
  );
  return shuffled.slice(0, count).map((c) => structuredClone(c));
}

export function ownedCoaches(account) {
  const ids = new Set(account?.coachIds || []);
  if (account?.coachId) ids.add(account.coachId);
  return COACHES.filter((c) => ids.has(c.id)).map((c) => structuredClone(c));
}

export function canEquipCoach(account, coachId) {
  if (!account || !coachId) return false;
  if ((account.coachIds || []).includes(coachId)) return true;
  if (account.coachId === coachId) return true;
  const c = COACHES.find((x) => x.id === coachId);
  return isStarterCoach(c);
}

/**
 * Opening roster is 5 starter draws (one per position, pure random, no pity)
 * dealt by the wizard — see drawStarterFive in accountGacha.js. The caller
 * passes the drawn ids plus the gacha state the draws carried, so the
 * account's counters continue from the opening pulls like any other draw.
 */
export function finalizeOnboarding(account, { playerIds, coachId, tacticId, gacha }) {
  if (!account) throw new Error("无账号");
  if (!playerIds || playerIds.length !== 5) throw new Error("开局需要 5 名球员");
  if (!coachId) throw new Error("需选定教练");
  const coach = COACHES.find((c) => c.id === coachId);
  if (!isStarterCoach(coach)) throw new Error("开局只能选用菜鸟/边缘主帅");
  account.playerIds = [...playerIds];
  if (gacha) account.gacha = { ...(account.gacha || {}), ...gacha };
  account.coachIds = Array.from(new Set([...(account.coachIds || []), coachId]));
  account.coachId = coachId;
  account.tacticId = tacticId || "balanced";
  account.onboardingDone = true;
  saveAccount(account);
  return account;
}

export function setAccountTactic(account, tacticId) {
  if (!account) return null;
  account.tacticId = tacticId || "balanced";
  saveAccount(account);
  return account;
}

export function setAccountCoach(account, coachId) {
  if (!account) return null;
  if (!canEquipCoach(account, coachId)) return account;
  account.coachId = coachId;
  if (!(account.coachIds || []).includes(coachId)) {
    account.coachIds = [...(account.coachIds || []), coachId];
  }
  saveAccount(account);
  return account;
}

export function recordRankedResult(account, won) {
  if (!account) return;
  if (won) account.rankedWins = (account.rankedWins || 0) + 1;
  else account.rankedLosses = (account.rankedLosses || 0) + 1;
  account.gold = (account.gold || 0) + (won ? 40 : 12);
  saveAccount(account);
}

export function coachRecordLabel(coach, lang = "zh") {
  if (!coach) return "";
  const rec = coach.record;
  const team = coach.team || "—";
  const season = coach.season || "";
  const note = rec?.note ? (lang === "en" ? rec.noteEn || rec.note : rec.note) : "";
  if (rec?.wins != null && rec?.losses != null) {
    return `${season} ${team} ${rec.wins}-${rec.losses}${note ? ` · ${note}` : ""}`;
  }
  return `${season} ${team}`;
}
