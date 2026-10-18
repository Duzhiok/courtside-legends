/**
 * Local multi-account binder: persistent season cards + coach + tactic.
 * Cards survive refresh/offline; ranked uses this roster as the core squad.
 */
import {
  COACHES,
  TACTICS,
  coachDrawWeight,
  isLegendCoach,
  isStarterCoach,
} from "./coaches.js";
import { clonePlayer, overall, PLAYERS } from "./players.js";
import {
  MERGE_ATTR_KEYS,
  pickMergeSkill,
  SKILL_PACKS,
} from "./skills.js";

const MAX_CARD_MERGES = 20;

const STORE_KEY = "cls_accounts_v1";
const ACTIVE_KEY = "cls_active_account";

/**
 * Within-band soft weight (higher OVR a bit likelier inside the same rarity band).
 * Do NOT use alone on the full 20k roster — pool size would crush high cards.
 */
export function drawWeight(ovr) {
  if (ovr >= 100) return 12;
  if (ovr >= 96) return 10;
  if (ovr >= 93) return 9;
  if (ovr >= 90) return 8;
  if (ovr >= 85) return 7;
  if (ovr >= 80) return 6;
  if (ovr >= 75) return 5;
  if (ovr >= 70) return 4;
  if (ovr >= 65) return 3;
  return 2;
}

/**
 * Designed pull rates by OVR band — independent of how many scrub cards exist.
 * Sums to 1. No extra nerf on top of these odds.
 */
export const DRAW_BANDS = [
  { min: 96, max: 200, p: 0.02, label: "神话+" },
  { min: 93, max: 96, p: 0.04, label: "传奇" },
  { min: 90, max: 93, p: 0.08, label: "超巨" },
  { min: 85, max: 90, p: 0.14, label: "全明星" },
  { min: 80, max: 85, p: 0.2, label: "先发" },
  { min: 74, max: 80, p: 0.22, label: "轮换" },
  { min: 0, max: 74, p: 0.3, label: "普通" },
];

/** Pick a player using band probability, then soft weight inside the band. */
export function pickPlayerByOdds(pool, { excludeIds = null } = {}) {
  const list = (pool || []).filter((p) => p && !(excludeIds && excludeIds.has(p.id)));
  if (!list.length) return null;

  const roll = Math.random();
  let acc = 0;
  let band = DRAW_BANDS[DRAW_BANDS.length - 1];
  for (const b of DRAW_BANDS) {
    acc += b.p;
    if (roll <= acc) {
      band = b;
      break;
    }
  }

  let bandPool = list.filter((p) => {
    const o = overall(p);
    return o >= band.min && o < band.max;
  });
  // Empty band (e.g. no 96+ in filtered pool) → fall toward neighboring bands
  if (!bandPool.length) {
    bandPool = list.filter((p) => overall(p) >= band.min);
  }
  if (!bandPool.length) bandPool = list;

  return weightedPick(bandPool, (p) => drawWeight(overall(p)));
}

export function rarityLabel(ovr) {
  if (ovr >= 100) return "满值";
  if (ovr >= 96) return "神话";
  if (ovr >= 93) return "传奇";
  if (ovr >= 90) return "超巨";
  if (ovr >= 85) return "全明星";
  if (ovr >= 80) return "先发";
  if (ovr >= 74) return "轮换";
  if (ovr >= 68) return "角色";
  return ""; // no「边缘」tag — low cards just show OVR
}

function todayKey(d = new Date()) {
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

function saveStore(store) {
  localStorage.setItem(STORE_KEY, JSON.stringify(store));
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

export function getActiveAccountId() {
  return localStorage.getItem(ACTIVE_KEY) || null;
}

export function setActiveAccountId(id) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
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
 * Apply account merge upgrades onto a cloned card:
 * each merge → all rating attrs +1 (cap 100) + learned skills.
 */
export function applyCardMods(player, mod) {
  if (!player) return null;
  const p = clonePlayer(player);
  const merges = Math.min(MAX_CARD_MERGES, Math.max(0, mod?.merges || 0));
  p.mergeLevel = merges;
  if (merges > 0) {
    for (const key of MERGE_ATTR_KEYS) {
      if (p[key] == null) continue;
      p[key] = Math.min(100, Math.round(Number(p[key]) || 0) + merges);
    }
  }
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
  return p;
}

export function getCardMod(account, playerId) {
  return account?.cardMods?.[playerId] || null;
}

export function resolvePlayers(ids, account = null) {
  const map = new Map(PLAYERS.map((p) => [p.id, p]));
  const mods = account?.cardMods || {};
  return (ids || [])
    .map((id) => map.get(id))
    .filter(Boolean)
    .map((p) => applyCardMods(p, mods[p.id]));
}

/**
 * Merge a duplicate into the owned card: all attrs +1, learn one random skill.
 * Returns { player, merges, learnedSkill, learnedName } or throws.
 */
export function mergeDuplicateCard(account, playerId) {
  if (!account) throw new Error("无账号");
  if (!(account.playerIds || []).includes(playerId)) {
    throw new Error("未拥有该卡，无法合并");
  }
  account.cardMods = account.cardMods || {};
  const prev = account.cardMods[playerId] || { merges: 0, skills: [] };
  if ((prev.merges || 0) >= MAX_CARD_MERGES) {
    throw new Error(`该卡已合并 ${MAX_CARD_MERGES} 次上限`);
  }
  const base = PLAYERS.find((p) => p.id === playerId);
  if (!base) throw new Error("卡牌不存在");
  const current = applyCardMods(base, prev);
  const learnedSkill = pickMergeSkill([...(current.skills || []), ...(prev.skills || [])]);
  const next = {
    merges: (prev.merges || 0) + 1,
    skills: [...(prev.skills || [])],
  };
  if (learnedSkill) next.skills.push(learnedSkill);
  account.cardMods[playerId] = next;
  const merged = applyCardMods(base, next);
  return {
    player: merged,
    merges: next.merges,
    learnedSkill,
    learnedName: learnedSkill ? SKILL_PACKS[learnedSkill]?.name : null,
    ovr: overall(merged),
  };
}

export function resolveCoach(coachId) {
  const c = COACHES.find((x) => x.id === coachId);
  return c ? structuredClone(c) : null;
}

export function resolveTactic(tacticId) {
  return TACTICS[tacticId] || TACTICS.balanced;
}

/** Account → live team blob for ranked / setup. */
export function accountToTeam(account, teamName) {
  if (!account) return null;
  const players = resolvePlayers(account.playerIds, account).slice(0, 12);
  if (!players.length) return null;
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

function weightedPick(list, weightFn) {
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

/** Random pool for onboarding — mix of scrub / solid / rare bait. */
export function rollStarterOffers(count = 24, excludeIds = new Set()) {
  const pool = PLAYERS.filter((p) => !excludeIds.has(p.id));
  const picks = [];
  const used = new Set(excludeIds);
  const attempts = count * 8;
  for (let i = 0; i < attempts && picks.length < count; i++) {
    const p = pickPlayerByOdds(pool, { excludeIds: used });
    if (!p || used.has(p.id)) continue;
    used.add(p.id);
    picks.push(p);
  }
  return picks.map((p) => clonePlayer(p));
}

function posBand(p) {
  const pos = p?.playPos || p?.pos || "SF";
  if (pos === "C") return "C";
  if (pos === "PF" || pos === "SF") return "F";
  return "G"; // PG / SG
}

/**
 * Roll the 7 system cards first (后卫 / 前锋 / 中锋 ≈ 2-2-3, which band gets 3 is random).
 * User reviews these, then picks 5 more from a separate offer pool.
 */
export function rollSystemSeven(excludeIds = new Set()) {
  const used = new Set(excludeIds);
  const bands = ["G", "F", "C"];
  const extra = Math.floor(Math.random() * 3);
  const quotas = { G: 2, F: 2, C: 2 };
  quotas[bands[extra]] = 3;

  const filled = [];
  for (const band of bands) {
    let left = quotas[band];
    const pool = PLAYERS.filter((p) => !used.has(p.id) && posBand(p) === band);
    let guard = 0;
    while (left > 0 && pool.length && guard < pool.length * 4) {
      guard += 1;
      const p = pickPlayerByOdds(pool, { excludeIds: used });
      if (!p || used.has(p.id)) continue;
      used.add(p.id);
      filled.push(clonePlayer(p));
      left -= 1;
    }
    while (left > 0) {
      const p = pickPlayerByOdds(PLAYERS, { excludeIds: used });
      if (!p || used.has(p.id)) break;
      used.add(p.id);
      filled.push(clonePlayer(p));
      left -= 1;
    }
  }
  return filled.slice(0, 7);
}

/**
 * After the player picks 5 cards, auto-add 7 more (legacy helper / rematch paths).
 */
export function autoFillOnboardRoster(pickedIds, need = 7) {
  const picked = resolvePlayers(pickedIds);
  const system = rollSystemSeven(new Set(pickedIds));
  return [...picked, ...system].slice(0, picked.length + need);
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

export function canDailyDraw(account) {
  if (!account) return false;
  return account.lastDailyDraw !== todayKey();
}

/**
 * Daily pull: mostly players; ~20% chance a coach card (名帅极稀有).
 * Returns { kind:'player'|'coach', player?, coach?, duplicate, goldGain, rarity, ovr? }.
 */
export function performDailyDraw(account) {
  if (!account) throw new Error("无账号");
  if (!canDailyDraw(account)) throw new Error("今日已抽过");
  account.coachIds = account.coachIds || [];

  const wantCoach = Math.random() < 0.2;
  if (wantCoach) {
    // Bias toward legend coaches being rare (same idea as superstar players)
    const coach = weightedPick(COACHES, (c) => coachDrawWeight(c));
    const duplicate = account.coachIds.includes(coach.id);
    let goldGain = 0;
    const rarity = isLegendCoach(coach)
      ? coach.fame >= 94
        ? "名帅"
        : "名教"
      : coach.fame >= 45
        ? "主帅"
        : "菜鸟教头";
    if (duplicate) {
      goldGain = Math.max(20, Math.round((coach.fame || 40) * 0.9));
      account.gold = (account.gold || 0) + goldGain;
    } else {
      account.coachIds = [...account.coachIds, coach.id];
    }
    account.lastDailyDraw = todayKey();
    account.drawHistory = [
      ...(account.drawHistory || []).slice(-49),
      { kind: "coach", id: coach.id, at: Date.now(), duplicate, rarity },
    ];
    saveAccount(account);
    return {
      kind: "coach",
      coach: structuredClone(coach),
      duplicate,
      goldGain,
      rarity,
    };
  }

  const owned = new Set(account.playerIds || []);
  const player = pickPlayerByOdds(PLAYERS);
  if (!player) throw new Error("名册为空，无法抽卡");
  const ovr = overall(player);
  const rarity = rarityLabel(ovr);
  const duplicate = owned.has(player.id);
  let goldGain = 0;
  let merge = null;
  if (duplicate) {
    // Same card → merge: all attrs +1 + random skill (no duplicate stack)
    try {
      merge = mergeDuplicateCard(account, player.id);
    } catch (e) {
      // At merge cap: fall back to gold convert
      goldGain = Math.max(15, Math.round(ovr * 0.8));
      account.gold = (account.gold || 0) + goldGain;
    }
  } else {
    account.playerIds = [...(account.playerIds || []), player.id];
  }
  account.lastDailyDraw = todayKey();
  account.drawHistory = [
    ...(account.drawHistory || []).slice(-49),
    {
      kind: "player",
      id: player.id,
      at: Date.now(),
      duplicate,
      rarity,
      merged: !!merge,
      learnedSkill: merge?.learnedSkill || null,
    },
  ];
  saveAccount(account);
  return {
    kind: "player",
    player: merge?.player || clonePlayer(player),
    duplicate,
    merged: !!merge,
    merge,
    goldGain,
    rarity,
    ovr: merge?.ovr ?? ovr,
  };
}

export function finalizeOnboarding(account, { playerIds, coachId, tacticId }) {
  if (!account) throw new Error("无账号");
  if (!playerIds || playerIds.length !== 12) throw new Error("需选定 12 名球员");
  if (!coachId) throw new Error("需选定教练");
  const coach = COACHES.find((c) => c.id === coachId);
  if (!isStarterCoach(coach)) throw new Error("开局只能选用菜鸟/边缘主帅");
  account.playerIds = [...playerIds];
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

export function coachRecordLabel(coach) {
  if (!coach) return "";
  const rec = coach.record;
  const team = coach.team || "—";
  const season = coach.season || "";
  if (rec?.wins != null && rec?.losses != null) {
    const note = rec.note ? ` · ${rec.note}` : "";
    return `${season} ${team} ${rec.wins}-${rec.losses}${note}`;
  }
  return `${season} ${team}`;
}
