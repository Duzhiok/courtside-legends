/**
 * Draft-pick ledger and calendar: ONE place that says who owns which pick.
 *
 * Ownership lives in two sparse maps on the season, and the real draft reads them directly:
 *
 *   pickOwnership[year][source]    owner of that source club's ROUND-1 pick (and, unless overridden, round 2)
 *   pickOwnershipR2[year][source]  owner of the ROUND-2 pick, only when it differs from round 1
 *
 * No entry means "the source club still owns its own pick". The tradable picks themselves are not
 * stored anywhere: every club holds a first and a second for each of the next PICK_HORIZON drafts
 * (this summer's included), so the list a club holds is DERIVED from the calendar and the ledger.
 * That is what makes the window roll forward on its own (a draft that has happened simply falls
 * out of it, a new one enters), and why picks cannot be duplicated or lost by moving tokens.
 */

/** Drafts tradable at once: the current year's and the next two. */
export const PICK_HORIZON = 3;

const TOKEN_ID = /^(.+)-r([12])-(\d{4})$/;
const LEDGER_VERSION = 2;

/** Token id -> { sourceTeamId, round, year }; null for ids not tied to a club (older invented sweeteners). */
export function parsePickId(id) {
  const m = typeof id === "string" ? TOKEN_ID.exec(id) : null;
  return m ? { sourceTeamId: m[1], round: Number(m[2]), year: Number(m[3]) } : null;
}

const r1Owner = (season, year, source) => season?.pickOwnership?.[year]?.[source] || source;
const currentYear = (season) => Number(season?.year) || 2024;

export function pickOwnerOf(season, { sourceTeamId, year, round }) {
  const first = r1Owner(season, year, sourceTeamId);
  return round === 2 ? season?.pickOwnershipR2?.[year]?.[sourceTeamId] || first : first;
}

/** Set (or clear) one entry in a sparse year -> source -> owner map, dropping empty leaves. */
function writeEntry(season, key, year, source, owner, natural) {
  const map = { ...(season[key] || {}) };
  const forYear = { ...(map[year] || {}) };
  if (owner === natural) delete forYear[source];
  else forYear[source] = owner;
  if (Object.keys(forYear).length) map[year] = forYear;
  else delete map[year];
  if (Object.keys(map).length) season[key] = map;
  else delete season[key];
}

/**
 * Give `ownerTeamId` the pick `{ sourceTeamId, year, round }`.
 * Moving round 1 never drags a retained round 2 along with it: round 2 only "follows" round 1
 * while nobody has traded it separately.
 */
export function setPickOwner(season, { sourceTeamId, year, round }, ownerTeamId) {
  if (!season || !sourceTeamId || !ownerTeamId) return;
  const keepR2 = pickOwnerOf(season, { sourceTeamId, year, round: 2 });
  if (round === 1) {
    writeEntry(season, "pickOwnership", year, sourceTeamId, ownerTeamId, sourceTeamId);
    writeEntry(season, "pickOwnershipR2", year, sourceTeamId, keepR2, ownerTeamId);
  } else {
    writeEntry(season, "pickOwnershipR2", year, sourceTeamId, ownerTeamId, r1Owner(season, year, sourceTeamId));
  }
}

// ---------- the calendar: which picks exist, and who holds them ----------

/** Every club in the league: the declared list when there is one, otherwise whoever has a team. */
export function teamIdsOf(season) {
  const declared = season?.league?.teamIds;
  return Array.isArray(declared) && declared.length ? declared : Object.keys(season?.teams || {});
}

function pickToken(sourceTeamId, year, round) {
  return {
    id: `${sourceTeamId}-r${round}-${year}`,
    sourceTeamId,
    year,
    round,
    protection: round === 1 ? "lottery-protected" : "unprotected",
    source: "own",
  };
}

/** A club's stored token list. Only older invented sweeteners live here now. */
function pooled(season, teamId) {
  const holder = teamId === season.userTeamId ? season : season.teams?.[teamId];
  return Array.isArray(holder?.draftAssets) ? holder.draftAssets : [];
}

/**
 * The picks a club holds right now: everything on the calendar the ledger says it owns (its own
 * picks first, nearest draft first), plus any older invented sweeteners it still has that have not
 * expired.
 */
export function picksHeldBy(season, teamId) {
  const start = currentYear(season);
  const sources = [teamId, ...teamIdsOf(season).filter((id) => id !== teamId)];
  const held = [];
  for (let year = start; year < start + PICK_HORIZON; year++) {
    for (const round of [1, 2]) {
      for (const sourceTeamId of sources) {
        if (pickOwnerOf(season, { sourceTeamId, year, round }) === teamId) {
          held.push(pickToken(sourceTeamId, year, round));
        }
      }
    }
  }
  const legacy = pooled(season, teamId).filter((t) => !parsePickId(t?.id) && !(Number(t?.year) < start));
  return [...held, ...legacy];
}

// ---------- housekeeping ----------

/**
 * Older saves kept tokens in per-club lists, and a token sitting in another club's list WAS the
 * record of a trade. Honour that once instead of quietly handing the pick back. An ownership entry
 * the draft already knows about wins over a token, and picks for drafts already played are ignored.
 */
function adoptPooledTokens(season) {
  const start = currentYear(season);
  const holders = new Set([season.userTeamId, ...Object.keys(season.teams || {})].filter(Boolean));
  for (const teamId of holders) {
    for (const token of pooled(season, teamId)) {
      const slot = parsePickId(token?.id);
      if (!slot || slot.sourceTeamId === teamId || slot.year < start) continue;
      if (season.pickOwnership?.[slot.year]?.[slot.sourceTeamId]) continue;
      setPickOwner(season, slot, teamId);
    }
  }
}

/**
 * Bring a season up to the current ledger format, once (idempotent).
 *   v0  tokens in per-club lists were the only record of trades -> adopt them, then drop them
 *   v1  the ledger was already the truth and the lists were a mirror of it -> just drop them
 *   v2  tokens are derived; the lists only hold older invented sweeteners, which expire
 */
export function ensurePickLedger(season) {
  if (!season || season.pickLedgerVersion >= LEDGER_VERSION) return season;
  if (!(season.pickLedgerVersion >= 1)) adoptPooledTokens(season);
  const holders = new Set([season.userTeamId, ...Object.keys(season.teams || {})].filter(Boolean));
  for (const teamId of holders) {
    const holder = teamId === season.userTeamId ? season : season.teams?.[teamId];
    if (!holder || !Array.isArray(holder.draftAssets)) continue;
    holder.draftAssets = holder.draftAssets.filter((t) => !parsePickId(t?.id) && !(Number(t?.year) < currentYear(season)));
  }
  delete season.draftPoolsSeeded;
  season.pickLedgerVersion = LEDGER_VERSION;
  return season;
}

/** The same migration without touching the caller's object: returns it as-is when it is already current. */
export function withPickLedger(season) {
  return !season || season.pickLedgerVersion >= LEDGER_VERSION ? season : ensurePickLedger(structuredClone(season));
}

/** Forget picks for drafts that have already happened. Call after the season year advances. */
export function prunePickLedger(season) {
  if (!season) return;
  const start = currentYear(season);
  for (const key of ["pickOwnership", "pickOwnershipR2"]) {
    if (!season[key]) continue;
    const kept = Object.fromEntries(Object.entries(season[key]).filter(([year]) => Number(year) >= start));
    if (Object.keys(kept).length) season[key] = kept;
    else delete season[key];
  }
  const holders = new Set([season.userTeamId, ...Object.keys(season.teams || {})].filter(Boolean));
  for (const teamId of holders) {
    const holder = teamId === season.userTeamId ? season : season.teams?.[teamId];
    if (holder && Array.isArray(holder.draftAssets)) {
      holder.draftAssets = holder.draftAssets.filter((t) => !(Number(t?.year) < start));
    }
  }
}
