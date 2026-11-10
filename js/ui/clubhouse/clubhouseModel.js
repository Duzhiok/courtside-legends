/**
 * My Team Clubhouse view-model: PURE. Reads the account object and a few facts it is handed (the resumable season's
 * label/state) and returns what the page should show. Nothing here writes, nothing is invented: a championship
 * is a record that exists on `account.myTeamSeasons`, a starter is a card on the saved/auto lineup, a skill is a
 * skill the card has. Four things are kept apart on purpose -- the permanent COLLECTION (every owned card), the
 * current LINEUP (the saved 8-12 + starting five), the current SEASON (in progress or done) and HISTORY (records).
 */
import { overall } from "../../data/players.js";
import { SKILL_EN } from "../../i18n.js";
import { levelSnapshot } from "../../data/accountLevel.js";
import { SKILL_PACKS, poolRoleLine } from "../../data/skills.js";
import { playerSlotPos } from "../../engine/gameplan.js";
import { MY_TEAM_RULES, ownedCards, resolveSavedLineup, validateMyTeamLineup } from "../../myteam/lineup.js";

export const SLOTS = ["PG", "SG", "SF", "PF", "C"];

/** Starters onto the five court slots: each in his natural slot when free, leftovers fill the empty ones. */
export function arrangeStarters(starters) {
  const bySlot = Object.fromEntries(SLOTS.map((s) => [s, null]));
  const left = [];
  for (const card of starters) {
    const slot = playerSlotPos(card);
    if (bySlot[slot] == null) bySlot[slot] = card;
    else left.push(card);
  }
  for (const card of left) {
    const free = SLOTS.find((s) => bySlot[s] == null);
    if (free) bySlot[free] = card;
  }
  return SLOTS.map((slot) => ({ slot, card: bySlot[slot] }));
}

/** The skill names a card really has (first `max`), never padded. */
export function skillNames(card, lang = "zh", max = 2) {
  const en = lang === "en";
  return (card?.skills || [])
    .map((id) => SKILL_PACKS[id])
    .filter(Boolean)
    .slice(0, max)
    .map((s) => (en ? SKILL_EN[s.id] || s.name : s.name));
}

export const roleOf = (card, lang = "zh") => poolRoleLine(card, lang).label || "";

/** Championships by season variant: a 20-game title and an 82-game title are never summed into one number. */
export function titleBreakdown(records) {
  const out = { quick: 0, full: 0 };
  for (const r of records) if (r.champion && out[r.variant] != null) out[r.variant] += 1;
  return out;
}

/**
 * What the primary button should do. `season` = { exists, done, label, variant } for THIS account's My Team slot.
 * @returns {{ kind: "signin"|"resume"|"again"|"start"|"build"|"draw", variant?: string, label?: string, needed?: number }}
 */
export function primaryAction({ account, season, eligible, owned = 0, needed = 0 }) {
  if (!account) return { kind: "signin" };
  if (season?.exists && !season.done) return { kind: "resume", label: season.label };
  if (season?.exists && season.done) return { kind: "again", variant: season.variant || "quick" };
  // Too few cards to ever field a team: the next useful thing is drawing, not opening an empty lineup editor.
  if (!eligible && owned < MY_TEAM_RULES.minRoster) return { kind: "draw", needed: needed || MY_TEAM_RULES.minRoster - owned };
  if (eligible) return { kind: "start", variant: "quick" };
  return { kind: "build" };
}

export const FILTER_DEFAULT = Object.freeze({ pos: "all", decade: "all", sort: "ovr", view: "grid" });

/** Collection tiles after the (real) filters: position, decade, sort by OVR or season. */
export function collectionTiles(cards, draft, filter = FILTER_DEFAULT) {
  const starters = new Set(draft.starterIds);
  const roster = new Set(draft.rosterIds);
  const decadeOf = (c) => Math.floor((Number(c.season) || 0) / 10) * 10;
  let list = cards.filter((c) => (filter.pos === "all" || playerSlotPos(c) === filter.pos) && (filter.decade === "all" || decadeOf(c) === Number(filter.decade)));
  const by = filter.sort === "season" ? (a, b) => (Number(b.season) || 0) - (Number(a.season) || 0) || overall(b) - overall(a) : (a, b) => overall(b) - overall(a);
  list = list.slice().sort(by);
  return list.map((card) => ({ card, starter: starters.has(card.id), onRoster: roster.has(card.id) }));
}

export const decadesOf = (cards) => [...new Set(cards.map((c) => Math.floor((Number(c.season) || 0) / 10) * 10).filter(Boolean))].sort((a, b) => b - a);

/** The whole page's data. */
export function buildClubhouse({ account, lang = "zh", season = null, draft = null, filter = FILTER_DEFAULT }) {
  const cards = ownedCards(account);
  const resolved = account ? resolveSavedLineup(account) : { draft: { rosterIds: [], starterIds: [] }, source: "auto" };
  const d = draft || resolved.draft;
  const validation = validateMyTeamLineup(account, d);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const starters = arrangeStarters(d.starterIds.map((id) => byId.get(id)).filter(Boolean));
  const records = (Array.isArray(account?.myTeamSeasons) ? account.myTeamSeasons : []).filter((r) => r && r.seasonId);
  const champs = records.filter((r) => r.champion);
  const latest = champs[0] || null; // newest first
  const featured = latest?.star ? cards.find((c) => c.name === latest.star.name || c.nameEn === latest.star.name) || null : null;
  return {
    account,
    lang,
    cards,
    draft: d,
    lineupSource: resolved.source,
    validation,
    starters,
    benchCount: Math.max(0, d.rosterIds.length - d.starterIds.length),
    records,
    hero: { titles: champs.length, byVariant: titleBreakdown(records), latest, featured, played: records.length },
    primary: primaryAction({ account, season, eligible: validation.eligible, owned: cards.length }),
    season,
    level: account ? levelSnapshot(account, lang) : null,
    tiles: collectionTiles(cards, d, filter),
    decades: decadesOf(cards),
    owned: cards.length,
    rules: MY_TEAM_RULES,
  };
}
