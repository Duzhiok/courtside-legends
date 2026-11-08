/**
 * Account Level (AXP) — the cross-mode long-term growth system (user decision
 * 2026-11-08, design in docs/implementation/account-level-design.md).
 *
 * Account Level represents a player's experience across the whole basketball
 * universe, not just games played. It is shared across My World, My Team,
 * Career and Playground; it is permanent and never reset by a career reset
 * or a new save; it never adds match attributes (a Lv.80 Curry shoots no
 * better than a Lv.10 one).
 *
 * `totalXp` is the single source of truth — `level` is derived from it, never
 * stored separately. Reward claims are recorded per level (`claimed`), so a
 * refresh cannot re-grant them. XP is awarded only at completion/settlement
 * points, never for entering a screen or a match; losing still grants the
 * same participation XP as winning.
 *
 * NOTE: this module is the ACCOUNT level system. `js/data/accountProgress.js`
 * is a different, older module (per-card 领悟/本命 growth) — do not confuse
 * the two. Guest progression lives in its own localStorage key (no account
 * object), so guests level up locally too.
 */
import { saveAccount, todayKey } from "./account.js";
import { grantPackDraws } from "./accountGacha.js";
import { GUEST_AXP_KEY } from "./accountKeys.js";

export const MAX_LEVEL = 100;

/** Configurable prototype values (design doc §2). Losses grant the same amounts. */
export const XP_TABLE = Object.freeze({
  login: 10, // daily first login, once per day
  dailyTask: 20, // per daily task completed
  quick: 25, // finished Quick Play game
  myTeamGame: 40, // My Team regular-season game (played, not simmed)
  ranked: 50, // ranked match
  friend: 20, // online friend match (own roster)
  playground: 15, // Playground / sandbox custom match
  careerEvent: 30, // one valid Reborn story event
  season: 200, // completed a valid season
  playoff: 150, // reached the playoffs, once per season
  championship: 500, // won a championship, once per season
  rebornLifetime: 800, // completed a Reborn lifetime, once at the ending
  autoGame: 5, // Auto League game (feature does not exist yet — unwired)
  autoDailyCap: 20, // max Auto League games paying XP per day
});

/** XP needed to go from L to L+1. Check: L=12 → 1,120; L=99 → 51,580. */
export function xpForLevel(level) {
  const L = Math.max(1, Math.floor(level) || 1);
  return 100 + 25 * L + 5 * L * L;
}

/**
 * Derive the level from a total. Returns { level, xpIntoLevel, xpForNext, pct }.
 * At Lv.100 xpForNext is 0 and pct is 100 (Legacy Rank is v2, not here).
 */
export function levelForTotalXp(total) {
  let remaining = Math.max(0, Math.floor(total) || 0);
  let level = 1;
  while (level < MAX_LEVEL) {
    const need = xpForLevel(level);
    if (remaining < need) return { level, xpIntoLevel: remaining, xpForNext: need, pct: Math.round((remaining / need) * 100), isMax: false };
    remaining -= need;
    level += 1;
  }
  return { level: MAX_LEVEL, xpIntoLevel: remaining, xpForNext: 0, pct: 100, isMax: true };
}

/** Titles change at these levels (design doc examples: Lv.12 Rising Star, Lv.35 All-Star Collector). */
export const TITLE_TABLE = Object.freeze([
  { level: 1, zh: "新秀", en: "Rookie" },
  { level: 5, zh: "轮换球员", en: "Rotation Player" },
  { level: 10, zh: "先发球员", en: "Starter" },
  { level: 12, zh: "新星", en: "Rising Star" },
  { level: 15, zh: "球队核心", en: "Core Player" },
  { level: 20, zh: "全明星水准", en: "All-Star Caliber" },
  { level: 25, zh: "全明星", en: "All-Star" },
  { level: 30, zh: "超级巨星", en: "Superstar" },
  { level: 35, zh: "全明星收藏家", en: "All-Star Collector" },
  { level: 40, zh: "传奇缔造者", en: "Legend Builder" },
  { level: 50, zh: "名人堂候选", en: "Hall of Fame Candidate" },
  { level: 75, zh: "篮球传奇", en: "Basketball Legend" },
  { level: 100, zh: "永恒传奇", en: "Eternal Legend" },
]);

export function levelTitle(level, lang = "zh") {
  let title = TITLE_TABLE[0];
  for (const entry of TITLE_TABLE) {
    if (level >= entry.level) title = entry;
    else break;
  }
  return lang === "en" ? title.en : title.zh;
}

/**
 * v1 reward track (design doc §4.1). Gold and packs grant for real; cosmetics
 * are recorded as unlocked entitlements on the account — they are applied
 * visually only where a hook already exists (none in v1; that is v2).
 * Lv.50 grants both a 3-card commemorative pack and the legendary frame.
 */
export const REWARD_TRACK = Object.freeze([
  { level: 2, kind: "gold", id: "gold-2", amount: 100, zh: "首次升级奖励：金币 ¤100", en: "First level-up reward: ¤100 gold" },
  { level: 5, kind: "pack", id: "pack-5", amount: 1, zh: "新手卡包 ×1", en: "Starter card pack ×1" },
  { level: 10, kind: "cosmetic", id: "frame-10", zh: "专属头像框", en: "Exclusive avatar frame" },
  { level: 15, kind: "cosmetic", id: "bg-15", zh: "球队主题背景", en: "Team theme background" },
  { level: 20, kind: "cosmetic", id: "outfit-20", zh: "高级外观套装", en: "Premium outfit set" },
  { level: 25, kind: "cosmetic", id: "jersey-25", zh: "特殊球衣", en: "Special jersey" },
  { level: 30, kind: "cosmetic", id: "celebration-30", zh: "专属庆祝动作", en: "Exclusive celebration" },
  { level: 40, kind: "cosmetic", id: "furniture-40", zh: "My Home 家具套装", en: "My Home furniture set" },
  { level: 50, kind: "pack", id: "pack-50", amount: 3, zh: "纪念卡包 ×3", en: "Commemorative card pack ×3" },
  { level: 50, kind: "cosmetic", id: "frame-50", zh: "传奇头像框", en: "Legendary avatar frame" },
  { level: 75, kind: "cosmetic", id: "showcase-75", zh: "稀有个人展示动画", en: "Rare personal showcase animation" },
  { level: 100, kind: "cosmetic", id: "title-100", zh: "永久传奇身份称号", en: "Permanent legendary identity title" },
]);

function storageOf(storage) {
  if (storage) return storage;
  try {
    return globalThis.localStorage || null;
  } catch {
    return null;
  }
}

/** Normalize (or create) the AXP record on an account object. Pure shape, no save. */
export function getAxp(account) {
  const axp = account?.axp && typeof account.axp === "object" ? account.axp : {};
  return {
    totalXp: Math.max(0, Math.floor(axp.totalXp) || 0),
    claimed: Array.isArray(axp.claimed) ? [...axp.claimed] : [],
    once: axp.once && typeof axp.once === "object" ? { ...axp.once } : {},
  };
}

function writeAxp(account, axp) {
  account.axp = axp;
}

/** The guest record: same shape as account.axp, kept in its own localStorage key. */
export function getGuestAxp(storage) {
  const store = storageOf(storage);
  try {
    const raw = store?.getItem(GUEST_AXP_KEY);
    if (!raw) return { totalXp: 0, claimed: [], once: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return { totalXp: 0, claimed: [], once: {} };
    return {
      totalXp: Math.max(0, Math.floor(parsed.totalXp) || 0),
      claimed: Array.isArray(parsed.claimed) ? [...parsed.claimed] : [],
      once: parsed.once && typeof parsed.once === "object" ? { ...parsed.once } : {},
    };
  } catch {
    return { totalXp: 0, claimed: [], once: {} };
  }
}

function saveGuestAxp(storage, axp) {
  const store = storageOf(storage);
  try {
    store?.setItem(GUEST_AXP_KEY, JSON.stringify(axp));
    return true;
  } catch {
    return false;
  }
}

function applyAward(axp, amount) {
  const before = levelForTotalXp(axp.totalXp).level;
  axp.totalXp = Math.max(0, axp.totalXp + amount);
  const after = levelForTotalXp(axp.totalXp).level;
  return { gained: amount, totalXp: axp.totalXp, levelBefore: before, levelAfter: after, leveledUp: after > before, duplicate: false };
}

/**
 * Award XP to an account. `key` makes the award idempotent (same key twice
 * pays once) — use it for anything that must not double-pay (daily login,
 * daily tasks, season results). Per-game awards pass no key: one call is one
 * completed game, and the settle call sites run once per game.
 * Saves the account when XP was actually gained.
 */
export function awardXp(account, amount, { source = "", key = null } = {}) {
  if (!account || !(amount > 0)) return { gained: 0, totalXp: getAxp(account).totalXp, levelBefore: 0, levelAfter: 0, leveledUp: false, duplicate: false, owner: "account" };
  const axp = getAxp(account);
  if (key) {
    if (axp.once[key]) return { gained: 0, totalXp: axp.totalXp, levelBefore: levelForTotalXp(axp.totalXp).level, levelAfter: levelForTotalXp(axp.totalXp).level, leveledUp: false, duplicate: true, owner: "account" };
    axp.once[key] = source || "award";
  }
  const result = applyAward(axp, amount);
  writeAxp(account, axp);
  saveAccount(account);
  return { ...result, owner: "account" };
}

/** Award XP to the active account, or to the local guest record when there is none. */
export function awardAccountXp(account, amount, { source = "", key = null, storage } = {}) {
  if (account) return awardXp(account, amount, { source, key });
  const axp = getGuestAxp(storage);
  if (key) {
    if (axp.once[key]) return { gained: 0, totalXp: axp.totalXp, levelBefore: levelForTotalXp(axp.totalXp).level, levelAfter: levelForTotalXp(axp.totalXp).level, leveledUp: false, duplicate: true, owner: "guest" };
    axp.once[key] = source || "award";
  }
  const result = applyAward(axp, amount);
  saveGuestAxp(storage, axp);
  return { ...result, owner: "guest" };
}

/** Daily first login: +10, once per account per day. */
export function recordDailyLogin(account, today = todayKey(), opts = {}) {
  return awardAccountXp(account, XP_TABLE.login, { ...opts, source: "login", key: `login:${today}` });
}

/** One daily task completed: +20, once per task per day. */
export function recordDailyTaskXp(account, taskId, today = todayKey(), opts = {}) {
  return awardAccountXp(account, XP_TABLE.dailyTask, { ...opts, source: "dailyTask", key: `task:${taskId}:${today}` });
}

/**
 * Claim one level's rewards. Gold and packs need a real account (guests are
 * told to create one first); cosmetic entitlements are recorded for guests
 * too. Idempotent: a level can only be claimed once.
 */
export function claimLevelReward(account, level, { rng = Math.random, pool, storage } = {}) {
  const entries = REWARD_TRACK.filter((entry) => entry.level === level);
  if (!entries.length) return { ok: false, reason: "no-reward" };
  const needsAccount = entries.some((entry) => entry.kind === "gold" || entry.kind === "pack");
  if (needsAccount && !account) return { ok: false, reason: "guest" };
  const axp = account ? getAxp(account) : getGuestAxp(storage);
  if (levelForTotalXp(axp.totalXp).level < level) return { ok: false, reason: "locked", level };
  if (axp.claimed.includes(level)) return { ok: false, reason: "claimed" };
  let cards = [];
  try {
    for (const entry of entries) {
      if (entry.kind === "gold") account.gold = (account.gold || 0) + (entry.amount || 0);
      else if (entry.kind === "pack") cards.push(...grantPackDraws(account, entry.amount || 1, { rng, pool }));
    }
  } catch (error) {
    // Binder full (or any draw failure): nothing is marked claimed, so the player can retry after making room.
    return { ok: false, reason: "card-room-full", message: error?.message || "" };
  }
  axp.claimed = [...axp.claimed, level];
  if (account) {
    writeAxp(account, axp);
    saveAccount(account);
  } else {
    saveGuestAxp(storage, axp);
  }
  return { ok: true, level, entries, cards };
}

/** Everything My World needs to render the level card + reward track. */
export function levelSnapshot(account, lang = "zh", storage) {
  const axp = account ? getAxp(account) : getGuestAxp(storage);
  const { level, xpIntoLevel, xpForNext, pct } = levelForTotalXp(axp.totalXp);
  const track = REWARD_TRACK.map((entry) => ({
    ...entry,
    label: lang === "en" ? entry.en : entry.zh,
    state: axp.claimed.includes(entry.level) ? "claimed" : level >= entry.level ? "available" : "locked",
  }));
  return {
    level,
    title: levelTitle(level, "zh"),
    titleEn: levelTitle(level, "en"),
    totalXp: axp.totalXp,
    xpIntoLevel,
    xpForNext,
    pct,
    isMax: level >= MAX_LEVEL,
    track,
  };
}

/** Did this season's user team reach the playoffs? Scans every playoff series for the user team. */
export function madePlayoffs(st) {
  const po = st?.playoffs;
  if (!po || !st?.userTeamId) return false;
  const blocks = [po.east, po.west, po.finals ? { series: [po.finals] } : null].filter(Boolean);
  for (const block of blocks) {
    for (const series of block.series || []) {
      if (series?.high?.id === st.userTeamId || series?.low?.id === st.userTeamId) return true;
    }
  }
  return false;
}
