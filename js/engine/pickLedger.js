/**
 * Draft-pick ledger: ONE place that says who owns which pick.
 *
 * The real draft only ever reads `season.pickOwnership[year]` (a sparse { sourceTeamId: ownerTeamId }
 * map over each team's natural first-rounder). The trade market works with per-team token lists
 * (`st.draftAssets` for the user, `team.draftAssets` for CPU clubs). Those two used to be unrelated,
 * so a pick traded in the market never changed the draft. This module keeps the ownership map as
 * the single source of truth and makes the token lists follow it.
 *
 *   pickOwnership[year][source]    owner of that source team's ROUND-1 pick (and, unless overridden, round 2)
 *   pickOwnershipR2[year][source]  owner of the ROUND-2 pick, only when it differs from round 1
 *
 * Both maps are sparse: no entry means "the source team still owns its own pick".
 */

const TOKEN_ID = /^(.+)-r([12])-(\d{4})$/;

/** Token id -> { sourceTeamId, round, year }; null for ids that are not tied to a team (synthetic sweeteners). */
export function parsePickId(id) {
  const m = typeof id === "string" ? TOKEN_ID.exec(id) : null;
  return m ? { sourceTeamId: m[1], round: Number(m[2]), year: Number(m[3]) } : null;
}

const r1Owner = (season, year, source) => season?.pickOwnership?.[year]?.[source] || source;

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

/** Where a team's token list lives: the user's on the season, a CPU club's on the team object. */
function poolOf(season, teamId, { create = false } = {}) {
  const holder = teamId === season.userTeamId ? season : season.teams?.[teamId];
  if (!holder) return null;
  if (!Array.isArray(holder.draftAssets) && create) holder.draftAssets = [];
  return holder.draftAssets || null;
}

function allPools(season) {
  const ids = new Set([season.userTeamId, ...Object.keys(season.teams || {})]);
  return [...ids].filter(Boolean).map((teamId) => ({ teamId, pool: poolOf(season, teamId) }));
}

/**
 * One-time adoption for saves made before the ledger existed: back then a token sitting in another
 * team's pool WAS the record of a trade, so honour it rather than quietly handing the pick back.
 * Anything the draft already knows (an explicit ownership entry) wins over the token.
 */
export function adoptLegacyTokens(season) {
  if (!season || season.pickLedgerVersion >= 1) return;
  for (const { teamId, pool } of allPools(season)) {
    for (const token of pool || []) {
      const parsed = parsePickId(token?.id);
      if (!parsed || parsed.sourceTeamId === teamId) continue;
      if (season.pickOwnership?.[parsed.year]?.[parsed.sourceTeamId]) continue;
      setPickOwner(season, parsed, teamId);
    }
  }
  season.pickLedgerVersion = 1;
}

/**
 * Move every team-bound token into the pool of its canonical owner. Tokens that are not tied to a
 * team (the synthetic "incoming" sweeteners) stay wherever they are.
 */
export function reconcileTokens(season) {
  if (!season) return;
  adoptLegacyTokens(season);
  const moves = [];
  for (const { teamId, pool } of allPools(season)) {
    for (const token of pool || []) {
      const parsed = parsePickId(token?.id);
      if (!parsed) continue;
      const owner = pickOwnerOf(season, parsed);
      if (owner !== teamId) moves.push({ token, from: teamId, to: owner });
    }
  }
  for (const { token, from, to } of moves) {
    const source = poolOf(season, from);
    const target = poolOf(season, to, { create: true });
    if (!target) continue;
    source.splice(source.indexOf(token), 1);
    if (!target.some((t) => t.id === token.id)) target.push(token);
  }
}
