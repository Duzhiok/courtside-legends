/**
 * My Team lineup persistence (ADR-010 T1). The ONLY place that writes `account.myTeamLineup`, and only when the
 * player explicitly saves or resets: opening the editor, validating or auto-filling never reach this module.
 * The account's cards, coach, tactic and gold are never touched; the field is optional, so older accounts load as before.
 */
import { getAccount, saveAccount } from "../data/account.js";
import { sanitizeDraft } from "./lineup.js";

/** Save the (sanitised) draft as the account's lineup preference. An incomplete lineup may be saved. */
export function saveMyTeamLineup(accountId, rawDraft, now = Date.now) {
  const account = getAccount(accountId);
  if (!account) return { ok: false, reason: "no_account" };
  const { draft, dropped } = sanitizeDraft(account, rawDraft);
  account.myTeamLineup = { rosterIds: draft.rosterIds, starterIds: draft.starterIds, savedAt: now() };
  saveAccount(account);
  return { ok: true, lineup: account.myTeamLineup, dropped };
}

/** Forget the saved preference (the editor falls back to the automatic lineup). */
export function clearMyTeamLineup(accountId) {
  const account = getAccount(accountId);
  if (!account) return { ok: false, reason: "no_account" };
  if (!("myTeamLineup" in account)) return { ok: true, changed: false };
  delete account.myTeamLineup;
  saveAccount(account);
  return { ok: true, changed: true };
}
