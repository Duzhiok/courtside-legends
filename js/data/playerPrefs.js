import { suggestTargetMinutes } from "../engine/gameplan.js";

/**
 * B2 — 球员个人战术偏好：玩家赛前亲手设的位置 / 指令 / 角色 / 分钟，下一场开赛继续沿用。
 *
 * 只存"亲手改过的字段"：没改过的跟着推荐走（卡升级后推荐会变，不该被旧值冻住）。
 * 比赛里托管/教练对场上副本的改动（GameSim 内是 structuredClone）不会写回这里，
 * 所以"模拟器可以临时改，下一场恢复我的设定"天然成立。
 */

/** @returns {object|null} 只含手改字段；全是自动值则返回 null */
export function extractPlayerPrefs(p) {
  if (!p) return null;
  const out = {};
  if (p.playPosManual && p.playPos) out.playPos = p.playPos;
  if (p.ordersManual && p.orders) out.orders = { ...p.orders };
  if (p._roleManual && p.roleExpectation) out.roleExpectation = p.roleExpectation;
  if (Number.isFinite(p.targetMinutes) && p.targetMinutes !== suggestTargetMinutes(p)) out.targetMinutes = p.targetMinutes;
  return Object.keys(out).length ? out : null;
}

/** Re-attach saved prefs (and the "manual" flags that make recommendations leave them alone). */
export function applyPlayerPrefs(p, prefs) {
  if (!p || !prefs) return p;
  if (prefs.playPos) { p.playPos = prefs.playPos; p.playPosManual = true; }
  if (prefs.orders) { p.orders = { ...prefs.orders }; p.ordersManual = true; }
  if (prefs.roleExpectation) { p.roleExpectation = prefs.roleExpectation; p._roleManual = true; }
  if (Number.isFinite(prefs.targetMinutes)) p.targetMinutes = prefs.targetMinutes;
  return p;
}

/** Fold the current players' hand-set prefs into a stored map; a player back on auto is dropped. */
export function mergePlayerPrefs(stored, players) {
  const next = { ...(stored || {}) };
  for (const p of players || []) {
    const prefs = extractPlayerPrefs(p);
    if (prefs) next[p.id] = prefs;
    else delete next[p.id];
  }
  return next;
}
