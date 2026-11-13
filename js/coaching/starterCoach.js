/**
 * One free, permanent starter coach per account (Team Intelligence v3 / P0). Reuses the existing coach-card collection
 * (`account.coachIds` / `account.coachId`) — no parallel ownership store.
 *
 * Idempotent and stable: an account that already owns a coach is never touched, and the pick is a deterministic function
 * of the account id, so a refresh, a crash between pick and save, or two tabs can never reroll it.
 * Onboarding still lets a NEW player pick from starter offers; this only fills the gap for accounts that have no coach.
 */
import { COACHES, isStarterCoach } from "../data/coaches.js";

function hash(str) {
  let h = 2166136261;
  for (const ch of String(str)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

export const hasAnyCoach = (account) => !!(account?.coachId || account?.coachIds?.length);

/** @returns {{account, granted: string|null}} granted = coach id when this call handed one out. Mutates + returns `account`. */
export function ensureStarterCoach(account, save = () => {}) {
  if (!account || hasAnyCoach(account)) return { account, granted: null };
  const pool = COACHES.filter((c) => c?.id && isStarterCoach(c)).sort((x, y) => (x.id < y.id ? -1 : 1));
  const pick = pool[hash(account.id) % pool.length];
  if (!pick) return { account, granted: null };
  account.coachIds = [pick.id];
  account.coachId = pick.id;
  save(account);
  return { account, granted: pick.id };
}
