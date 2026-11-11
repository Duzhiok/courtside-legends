/**
 * Hometown Legends core (ADR-009, M4-B): validation, place matching and the
 * city -> region -> country -> chosen-idol fallback resolver.
 *
 * Identity input is the APPROVED account contract (ADR-004 D1):
 * `account.identityPlaces = { birthplace, grewUpIn, representedCity }` —
 * free-text city names (<=40 chars), NOT location ids. This module matches
 * that text against the curated location table; unmatched text is kept
 * verbatim and simply falls back further. ADR-009's draft `account.origin`
 * / location-id fields were superseded by that contract and are not used.
 *
 * Pure functions only: no storage, no saves, no cards, no gold. Choosing a
 * birthplace can never grant anything competitive (ADR-009 §8) — nothing
 * here touches an account at all.
 */
import { LOCATIONS } from "./locations.js";
import { LEGEND_LOCATIONS } from "./legendLocations.js";

export const RELATIONS = Object.freeze(["BIRTHPLACE", "RAISED_IN", "TEAM_LEGACY"]);
const RELATION_ORDER = { BIRTHPLACE: 0, RAISED_IN: 1, TEAM_LEGACY: 2, IDOL: 3 };

const RELATION_LABELS = {
  BIRTHPLACE: ["出生于", "Born in"],
  RAISED_IN: ["成长于", "Grew up in"],
  TEAM_LEGACY: ["效力过", "Played for"],
  IDOL: ["自选偶像", "Your chosen idol"],
};
const LEVEL_LABELS = {
  city: ["本市传奇", "City legends"],
  region: ["本省传奇", "Region legends"],
  country: ["本国传奇", "Country legends"],
  idol: ["自选偶像", "Your chosen idol"],
  none: ["暂无传奇", "No legends yet"],
};
export const relationLabel = (relation, lang) => (RELATION_LABELS[relation] || RELATION_LABELS.IDOL)[lang === "en" ? 1 : 0];
export const levelLabel = (level, lang) => (LEVEL_LABELS[level] || LEVEL_LABELS.none)[lang === "en" ? 1 : 0];
export const locationName = (loc, lang) => (loc ? (lang === "en" ? loc.names.en : loc.names.zh) : "");

/**
 * Load-time validation (ADR-009 §5.5). A record is displayable only when it
 * is a complete, checkable assertion: known bref (when a roster set is
 * given), known location, relation in the enum, and a reference source with
 * a non-empty ref + checkedOn date. `community` sources are valid contract
 * records but are hidden by default (MVP shows no community nominations),
 * so they are reported separately, not as failures. Duplicates are dropped.
 * Nothing here throws: bad data is dropped and counted, never fatal.
 */
export function validateLegends(records, { knownBrefs = null, locations = LOCATIONS } = {}) {
  const locationIds = new Set((locations || []).map((l) => l.id));
  const seen = new Set();
  const clean = [];
  const dropped = [];
  const hidden = [];
  for (const r of Array.isArray(records) ? records : []) {
    const drop = (reason) => dropped.push({ record: r, reason });
    if (!r || typeof r !== "object" || !r.bref || !r.locationId) { drop("malformed"); continue; }
    if (!RELATIONS.includes(r.relation)) { drop("bad-relation"); continue; }
    if (!locationIds.has(r.locationId)) { drop("unknown-location"); continue; }
    if (knownBrefs && !knownBrefs.has(r.bref)) { drop("unknown-bref"); continue; }
    const s = r.source;
    if (!s || typeof s.ref !== "string" || !s.ref.trim() || typeof s.checkedOn !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s.checkedOn)) { drop("missing-source"); continue; }
    if (s.type === "community") { hidden.push(r); continue; }
    if (s.type !== "reference") { drop("missing-source"); continue; }
    const key = `${r.bref}|${r.locationId}|${r.relation}`;
    if (seen.has(key)) { drop("duplicate"); continue; }
    seen.add(key);
    clean.push(r);
  }
  return { records: clean, dropped, hidden, failures: dropped.length };
}

/** The curated tables, validated once (bref existence is asserted by tests against the real roster). */
export const CURATED = validateLegends(LEGEND_LOCATIONS, { locations: LOCATIONS });

export const locationById = (id, locations = LOCATIONS) => locations.find((l) => l.id === id) || null;

/** [self, parent, grandparent...] — the fallback chain for a location. */
export function locationChain(location, locations = LOCATIONS) {
  const chain = [];
  let cur = location;
  const guard = new Set();
  while (cur && !guard.has(cur.id)) {
    guard.add(cur.id);
    chain.push(cur);
    cur = cur.parentId ? locationById(cur.parentId, locations) : null;
  }
  return chain;
}

const norm = (s) => String(s ?? "").trim().toLowerCase().replace(/\s+/g, " ");

/** Split a free-text places field into up to 3 places (ADR-009 Q5: grew up in at most 3). */
export function splitPlaces(text) {
  return String(text ?? "")
    .split(/[,，、;；/]/)
    .map((p) => p.trim())
    .filter(Boolean)
    .slice(0, 3);
}

/**
 * Match free text to a curated location. The whole string is tried first,
 * then each comma-separated part (so "Springfield, USA" can still reach the
 * United States country level — an unrecorded city kept as country + free
 * text, exactly as ADR-009 §6 prescribes). Cities win over regions over
 * countries. Returns null when nothing curated matches.
 */
export function matchPlace(text, locations = LOCATIONS) {
  const candidates = [String(text ?? "").trim(), ...splitPlaces(text)];
  for (const level of ["city", "region", "country"]) {
    for (const cand of candidates) {
      const n = norm(cand);
      if (!n) continue;
      const hit = locations.find((l) => l.level === level && [l.names.zh, l.names.en, ...(l.aliases || [])].some((name) => norm(name) === n));
      if (hit) return hit;
    }
  }
  return null;
}

const byRelationThenBref = (a, b) => (RELATION_ORDER[a.relation] - RELATION_ORDER[b.relation]) || a.bref.localeCompare(b.bref);

/**
 * Resolve one place to its legends. Walks city -> region -> country and
 * stops at the first level that has records. When no level has any, the
 * resolution is the chosen-idol entry (with the idol when one is set), so
 * no place ever renders an empty page. `records` are expected pre-validated
 * (see validateLegends); the curated default already is.
 */
export function resolveLegendsForPlace(placeText, { records = CURATED.records, locations = LOCATIONS, idolBref = null } = {}) {
  const place = String(placeText ?? "").trim();
  const location = matchPlace(place, locations);
  if (location) {
    for (const loc of locationChain(location, locations)) {
      const recs = records.filter((r) => r.locationId === loc.id).sort(byRelationThenBref);
      if (recs.length) {
        // One row per person: the strongest relation wins (records are
        // already sorted by relation order, so keep the FIRST per bref —
        // a Map built from the pairs would keep the last instead).
        const firstByBref = new Map();
        for (const r of recs) if (!firstByBref.has(r.bref)) firstByBref.set(r.bref, r);
        const people = [...firstByBref.values()].slice(0, 3);
        return {
          placeText: place,
          location,
          matchedLocation: loc,
          level: loc.level,
          legends: people.map((r) => ({ bref: r.bref, relation: r.relation, locationId: r.locationId })),
          needsIdol: false,
        };
      }
    }
  }
  return {
    placeText: place,
    location,
    matchedLocation: null,
    level: "idol",
    legends: idolBref ? [{ bref: idolBref, relation: "IDOL", locationId: location?.id || null }] : [],
    needsIdol: !idolBref,
  };
}

/**
 * Resolve all three identity places. `identityPlaces` may be null/absent
 * (old accounts) — that is a normal empty result, never an error.
 * grewUpIn may hold up to 3 places (splitPlaces).
 */
export function resolveForIdentity(identityPlaces, opts = {}) {
  const places = identityPlaces && typeof identityPlaces === "object" ? identityPlaces : {};
  const one = (text) => (text ? resolveLegendsForPlace(text, opts) : null);
  return {
    birthplace: one(places.birthplace),
    grewUpIn: places.grewUpIn ? splitPlaces(places.grewUpIn).map((p) => resolveLegendsForPlace(p, opts)) : [],
    representedCity: one(places.representedCity),
  };
}

/**
 * Hometown honours (H5), derived — never stored twice. The challenge line
 * reads the state recorded at play time, so a later change of represented
 * city does not rewrite history (ADR-009 Q2 default).
 */
export function hometownHonours(identity, state) {
  const places = identity?.identityPlaces || {};
  const ch = state?.challenge || { played: 0, wins: 0, losses: 0, lastRepresentedCity: null, lastResult: null, lastAt: null };
  return {
    birthplace: places.birthplace || null,
    grewUpIn: places.grewUpIn || null,
    representedCity: places.representedCity || null,
    idolBref: state?.idolBref || null,
    challenge: ch,
  };
}
