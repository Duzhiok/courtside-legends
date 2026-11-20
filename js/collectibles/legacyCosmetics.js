/**
 * Career honours redeemed with Player Reborn career fragments (Career 2.0 decision 4): titles and a portrait frame.
 *
 * - Never sold for gold (they are not Shop items) and they add no competitive power.
 * - A title needs real career evidence first (an awakened skill, a rivalry, a championship: checked in
 *   js/reborn/fragments.js, which owns the spending); the fragments only redeem what was already earned.
 * - The run is the truth (reborn.player.unlocks = [{ id, year }]); the account gets an idempotent copy
 *   (account.cosmetics.unlocks) through mirrorUnlocksToAccount, the same pattern as story jerseys. A guest keeps
 *   them in the run only.
 * - The frame is worn through the Shop's own equippedFrame slot (shop.js resolves its CSS class via unlockFrameId).
 *
 * Pure data + account helpers; no Reborn imports, so the Shop can read it without a cycle.
 */

const evidence = (zh, en) => Object.freeze({ zh, en });

export const LEGACY_UNLOCKS = Object.freeze([
  { id: "title:reborn", kind: "title", zh: "重生者", en: "Reborn", cost: 4, needs: evidence("开始一段穿越生涯", "Start a Reborn career") },
  { id: "title:awakened", kind: "title", zh: "觉醒者", en: "Awakened", cost: 5, needs: evidence("在比赛中觉醒一项招牌技能", "Awaken a signature skill in games") },
  { id: "title:rival", kind: "title", zh: "宿敌之名", en: "Rival-Forged", cost: 5, needs: evidence("与一位对手结成宿敌", "Form a rivalry") },
  { id: "title:champion", kind: "title", zh: "总冠军", en: "Champion", cost: 6, needs: evidence("赢下总决赛", "Win the Finals") },
  { id: "frame:reborn", kind: "frame", frameId: "reborn", zh: "重生之环", en: "Reborn ring", cost: 8, needs: evidence("开始一段穿越生涯", "Start a Reborn career") },
].map((u) => Object.freeze(u)));

export const unlockById = (id) => LEGACY_UNLOCKS.find((u) => u.id === id) || null;
export const unlockLabel = (unlock, lang) => (unlock ? (lang === "en" ? unlock.en : unlock.zh) : "");

/** Unlock ids a Reborn run holds (an old save has none). */
export function runUnlockIds(reborn) {
  const list = reborn?.player?.unlocks;
  return Array.isArray(list) ? list.map((u) => u?.id).filter((id) => unlockById(id)) : [];
}

/** The account's honours record, normalised (unknown ids dropped, a title that isn't owned isn't worn). */
export function cosmetics(account) {
  const raw = account?.cosmetics;
  const unlocks = [...new Set(Array.isArray(raw?.unlocks) ? raw.unlocks.filter((id) => unlockById(id)) : [])];
  const title = typeof raw?.title === "string" && unlocks.includes(raw.title) ? raw.title : null;
  return { unlocks, title };
}

const ownsUnlock = (account, id) => cosmetics(account).unlocks.includes(id);

/** Copy the run's unlocks onto the account (deduped by id). Returns how many were new. Mutates `account`. */
export function mirrorUnlocksToAccount(account, ids) {
  if (!account) return 0;
  const current = cosmetics(account);
  const added = (ids || []).filter((id) => unlockById(id) && !current.unlocks.includes(id));
  if (added.length) account.cosmetics = { ...current, unlocks: [...current.unlocks, ...added] };
  return added.length;
}

/** Owned honours by kind, for the My World list: [{ unlock, worn }]. `frameKey` = the Shop's equippedFrame. */
export function ownedUnlocks(account, frameKey = null) {
  const { unlocks, title } = cosmetics(account);
  return unlocks.map((id) => unlockById(id)).map((unlock) => ({ unlock, worn: unlock.kind === "title" ? title === unlock.id : frameKey === unlock.id }));
}

/** Wear a title (null takes it off). Mutates `account`; the caller saves. */
export function equipTitle(account, id) {
  const current = cosmetics(account);
  if (id !== null && (unlockById(id)?.kind !== "title" || !current.unlocks.includes(id))) return { ok: false, reason: "not-owned" };
  account.cosmetics = { ...current, title: id };
  return { ok: true };
}

/** The worn title (catalog entry), or null. */
export const equippedTitle = (account) => unlockById(cosmetics(account).title);

/** The CSS frame key of an unlock frame the account owns (`mw-frame-<key>`), or null for anything else. */
export function unlockFrameId(account, key) {
  const unlock = unlockById(key);
  return unlock?.kind === "frame" && ownsUnlock(account, key) ? unlock.frameId : null;
}
