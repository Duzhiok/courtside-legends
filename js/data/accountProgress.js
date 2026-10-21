/**
 * Per-game progression for account cards: 领悟 streaks for everyone on the
 * roster, XP + levels for the one 本命 card. Called after each ranked game.
 */
import { overall, PLAYERS } from "./players.js";
import { applyCardMods, saveAccount } from "./account.js";
import { recordGameAndCheck } from "../engine/epiphany.js";
import { GROWTH_OVR_HEADROOM, GROWTH_PATHS, MAX_GROWTH_LEVEL, XP_PER_LEVEL } from "./growthPaths.js";

const BASE_XP = 10;
const WIN_XP = 5;

export function gameXp(stats, won) {
  return BASE_XP + Math.round((stats?.min || 0) / 3) + (won ? WIN_XP : 0);
}

/** Ceiling: the person's best real season + headroom. */
export function growthCap(bref, pool = PLAYERS, ovrOf = overall) {
  const peak = pool.filter((p) => p.bref === bref).reduce((best, p) => Math.max(best, ovrOf(p)), 0);
  return peak + GROWTH_OVR_HEADROOM;
}

export function setFavorite(account, playerId, path) {
  if (!(account?.playerIds || []).includes(playerId)) throw new Error("未拥有该卡");
  if (!GROWTH_PATHS[path]) throw new Error("未知成长路线");
  account.cardMods = account.cardMods || {};
  const mod = account.cardMods[playerId] || { merges: 0, skills: [] };
  const growth = mod.growth || { levels: 0, xp: 0 };
  if (growth.levels > 0 && growth.path !== path) {
    throw new Error(`这张卡已按「${GROWTH_PATHS[growth.path].label}」路线成长，不能换路线`);
  }
  account.cardMods[playerId] = { ...mod, growth: { ...growth, path } };
  account.favoriteId = playerId;
  saveAccount(account);
}

function grantFavoriteXp(account, base, stats, won, pool) {
  const mod = account.cardMods[base.id];
  const growth = { levels: 0, xp: 0, ...mod.growth };
  if (!GROWTH_PATHS[growth.path] || growth.levels >= MAX_GROWTH_LEVEL) return null;
  const xpGain = gameXp(stats, won);
  growth.xp += xpGain;
  const cap = growthCap(base.bref, pool);
  let leveled = 0;
  let capped = false;
  while (growth.xp >= XP_PER_LEVEL && growth.levels < MAX_GROWTH_LEVEL) {
    const trial = applyCardMods(base, { ...mod, growth: { ...growth, levels: growth.levels + 1 } });
    if (overall(trial) > cap) {
      capped = true;
      growth.xp = XP_PER_LEVEL;
      break;
    }
    growth.levels += 1;
    growth.xp -= XP_PER_LEVEL;
    leveled += 1;
  }
  account.cardMods[base.id] = { ...mod, growth };
  return { xpGain, leveled, levels: growth.levels, capped };
}

/**
 * Settle one ranked game. `roster` is the home side from the sim snapshot
 * (cards carry `.stats`). Returns notes for the result screen.
 */
export function applyRankedGame(account, roster, { won = false, rng = Math.random, pool = PLAYERS } = {}) {
  const owned = new Set(account?.playerIds || []);
  const byId = new Map(pool.map((p) => [p.id, p]));
  const notes = [];
  account.cardMods = account.cardMods || {};
  for (const card of roster || []) {
    if (!owned.has(card.id) || !card.stats) continue;
    const { mod, learned } = recordGameAndCheck(account.cardMods[card.id], card, card.stats, rng);
    account.cardMods[card.id] = mod;
    if (learned) notes.push({ kind: "epiphany", player: card.name, skill: learned.name, rule: learned.rule.label });
    const base = byId.get(card.id);
    if (account.favoriteId === card.id && base) {
      const growth = grantFavoriteXp(account, base, card.stats, won, pool);
      if (growth) notes.push({ kind: "growth", player: card.name, ...growth });
    }
  }
  saveAccount(account);
  return notes;
}

export function progressNoteText(note) {
  if (note.kind === "epiphany") return `✨ ${note.player} ${note.rule}，领悟了「${note.skill}」！`;
  if (note.leveled) return `🌱 本命 ${note.player} 升到 Lv.${note.levels}（+${note.xpGain} 经验）`;
  if (note.capped) return `🧱 本命 ${note.player} 已触到成长天花板（历史巅峰 +${GROWTH_OVR_HEADROOM}）`;
  return `本命 ${note.player} +${note.xpGain} 经验（Lv.${note.levels}）`;
}
