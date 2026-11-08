/**
 * My Team lineup (ADR-010 T1): which of the account's OWN cards form the team it will take into a season.
 *
 * Everything here is pure: it reads the account object it is handed and returns new values. Nothing is written
 * (not the account, not storage), nothing mutates a card (no resolveStarterPositionCollisions: it rewrites
 * `playPos`), and GameSim is never touched. The size rule is a My Team configuration (MY_TEAM_RULES), not an
 * engine limit, so a later season mode can raise it without touching the simulator.
 *
 * A lineup may be edited while incomplete; only `eligible` (what a season will demand) gates starting one.
 */
import { overall } from "../data/players.js";
import { resolvePlayers, uniqueByPerson } from "../data/account.js";
import { playerSlotPos } from "../engine/gameplan.js";

export const MY_TEAM_RULES = Object.freeze({ minRoster: 8, maxRoster: 12, starters: 5 });

const personOf = (card) => card.bref || card.id;
const byStrength = (a, b) => overall(b) - overall(a) || String(a.id).localeCompare(String(b.id));

/** The account's owned cards as playable cards, strongest first. [] for a guest. */
export function ownedCards(account) {
  if (!account) return [];
  const seen = new Set();
  const ids = (account.playerIds || []).filter((id) => (seen.has(id) ? false : (seen.add(id), true)));
  return resolvePlayers(ids, account).sort(byStrength);
}

/** Best-first roster (one card per person) with a starting five that covers the five slots where it can. */
export function autoLineup(account, rules = MY_TEAM_RULES) {
  const roster = uniqueByPerson(ownedCards(account)).sort(byStrength).slice(0, rules.maxRoster);
  const starters = [];
  const taken = new Set();
  for (const card of roster) {
    if (starters.length >= rules.starters) break;
    const slot = playerSlotPos(card);
    if (taken.has(slot)) continue;
    taken.add(slot);
    starters.push(card);
  }
  for (const card of roster) {
    if (starters.length >= rules.starters) break;
    if (!starters.includes(card)) starters.push(card);
  }
  return { rosterIds: roster.map((c) => c.id), starterIds: starters.map((c) => c.id) };
}

/**
 * Make any raw draft safe against the account's real collection: unknown / repeated ids and a second card of
 * the same person are dropped, the roster is capped, starters must be on the roster. Never throws.
 * @returns {{ draft: {rosterIds: string[], starterIds: string[]}, dropped: number }}
 */
export function sanitizeDraft(account, raw, rules = MY_TEAM_RULES) {
  const owned = new Map(ownedCards(account).map((c) => [c.id, c]));
  const rosterIds = [];
  const people = new Set();
  let dropped = 0;
  for (const id of Array.isArray(raw?.rosterIds) ? raw.rosterIds : []) {
    const card = typeof id === "string" ? owned.get(id) : null;
    if (!card || rosterIds.includes(id) || people.has(personOf(card)) || rosterIds.length >= rules.maxRoster) { dropped++; continue; }
    people.add(personOf(card));
    rosterIds.push(id);
  }
  const starterIds = [];
  for (const id of Array.isArray(raw?.starterIds) ? raw.starterIds : []) {
    if (!rosterIds.includes(id) || starterIds.includes(id) || starterIds.length >= rules.starters) { dropped++; continue; }
    starterIds.push(id);
  }
  return { draft: { rosterIds, starterIds }, dropped };
}

/**
 * The lineup to show when the editor opens: the saved preference (repaired if the collection changed under it)
 * or the automatic one. `source` tells the UI which, so it can say so instead of silently swapping.
 */
export function resolveSavedLineup(account, rules = MY_TEAM_RULES) {
  const saved = account?.myTeamLineup;
  if (saved && typeof saved === "object") {
    const { draft, dropped } = sanitizeDraft(account, saved, rules);
    if (draft.rosterIds.length) return { draft, source: dropped ? "repaired" : "saved", dropped };
  }
  return { draft: autoLineup(account, rules), source: "auto", dropped: 0 };
}

/** Add/remove a card from the roster. A second card of the same person REPLACES the first. */
export function toggleRoster(account, draft, cardId, rules = MY_TEAM_RULES) {
  const card = ownedCards(account).find((c) => c.id === cardId);
  if (!card) return { draft, blocked: "not_owned" };
  if (draft.rosterIds.includes(cardId)) {
    return { draft: { rosterIds: draft.rosterIds.filter((id) => id !== cardId), starterIds: draft.starterIds.filter((id) => id !== cardId) } };
  }
  const owned = new Map(ownedCards(account).map((c) => [c.id, c]));
  const twin = draft.rosterIds.find((id) => owned.get(id) && personOf(owned.get(id)) === personOf(card));
  if (twin) {
    const swap = (ids) => ids.map((id) => (id === twin ? cardId : id));
    return { draft: { rosterIds: swap(draft.rosterIds), starterIds: swap(draft.starterIds) }, replaced: twin };
  }
  if (draft.rosterIds.length >= rules.maxRoster) return { draft, blocked: "roster_full" };
  return { draft: { rosterIds: [...draft.rosterIds, cardId], starterIds: draft.starterIds } };
}

/** Mark/unmark a rostered card as a starter (at most `rules.starters`). */
export function toggleStarter(draft, cardId, rules = MY_TEAM_RULES) {
  if (!draft.rosterIds.includes(cardId)) return { draft, blocked: "not_on_roster" };
  if (draft.starterIds.includes(cardId)) return { draft: { ...draft, starterIds: draft.starterIds.filter((id) => id !== cardId) } };
  if (draft.starterIds.length >= rules.starters) return { draft, blocked: "starters_full" };
  return { draft: { ...draft, starterIds: [...draft.starterIds, cardId] } };
}

/**
 * Judge a draft against what a season will require. Pure and total: any input yields a verdict.
 * issue.level "block" => not eligible; "warn" => allowed (e.g. an odd-looking starting five).
 * @returns {{ eligible: boolean, issues: {level: string, code: string, [k: string]: any}[],
 *            counts: {roster: number, starters: number}, roster: object[], starters: object[] }}
 */
export function validateMyTeamLineup(account, draft, rules = MY_TEAM_RULES) {
  const none = { counts: { roster: 0, starters: 0 }, roster: [], starters: [] };
  if (!account) return { eligible: false, issues: [{ level: "block", code: "guest" }], ...none };
  const owned = new Map(ownedCards(account).map((c) => [c.id, c]));
  const issues = [];
  const rosterIds = Array.isArray(draft?.rosterIds) ? draft.rosterIds : [];
  const starterIds = Array.isArray(draft?.starterIds) ? draft.starterIds : [];

  const foreign = rosterIds.filter((id) => !owned.has(id));
  if (foreign.length) issues.push({ level: "block", code: "not_owned", ids: foreign });
  const roster = [...new Set(rosterIds)].map((id) => owned.get(id)).filter(Boolean);
  const people = new Map();
  for (const card of roster) people.set(personOf(card), (people.get(personOf(card)) || 0) + 1);
  const twins = [...people].filter(([, n]) => n > 1).map(([who]) => who);
  if (twins.length) issues.push({ level: "block", code: "duplicate_person", people: twins });
  if (roster.length < rules.minRoster) issues.push({ level: "block", code: "roster_small", have: roster.length, min: rules.minRoster });
  if (roster.length > rules.maxRoster) issues.push({ level: "block", code: "roster_large", have: roster.length, max: rules.maxRoster });

  const rosterSet = new Set(roster.map((c) => c.id));
  const offRoster = starterIds.filter((id) => !rosterSet.has(id));
  if (offRoster.length) issues.push({ level: "block", code: "starter_not_in_roster", ids: offRoster });
  const starters = [...new Set(starterIds)].filter((id) => rosterSet.has(id)).map((id) => owned.get(id));
  if (starters.length !== rules.starters) issues.push({ level: "block", code: "starters_count", have: starters.length, need: rules.starters });

  if (account.coachId && !(account.coachIds || []).includes(account.coachId)) issues.push({ level: "block", code: "coach_not_owned" });

  if (starters.length === rules.starters) {
    const bySlot = {};
    for (const card of starters) bySlot[playerSlotPos(card)] = (bySlot[playerSlotPos(card)] || 0) + 1;
    for (const [slot, n] of Object.entries(bySlot)) if (n >= 3) issues.push({ level: "warn", code: "position_stack", slot, count: n });
    if (!bySlot.PG && !bySlot.SG) issues.push({ level: "warn", code: "no_guard" });
  }
  return {
    eligible: !issues.some((i) => i.level === "block"),
    issues,
    counts: { roster: roster.length, starters: starters.length },
    roster,
    starters,
  };
}
