/**
 * The jersey-exchange event of a Reborn run (J3): offer -> accept / decline / expire. Pure and idempotent.
 *
 * State lives on the run, additive and optional (an old save simply has none):
 *   reborn.jerseys = { version: 1, offers: [Offer], collection: [Instance] }
 *
 * Ids are deterministic, never random, so a refresh, a replayed settlement or a double click cannot mint two jerseys:
 *   offer    jersey-offer:<gameId>:<bref>
 *   instance exchange:<offerId>
 * The jersey is a GAME STORY (releaseLevel "story"): it records who offered it, in which game, with what result. It is
 * never marked signed here -- a signature must be an explicit story beat, not a side effect of a swap.
 *
 * No gameplay effect: nothing in this module touches a rating, a shot or a result.
 */
import { exchangeTemplate } from "./jerseyCatalog.js";
import { EXCHANGE_RULES, evaluateExchangeCandidate, gameEvidenceFromReport, relationSummary } from "./jerseyEligibility.js";

/** The jersey state on a run; missing or malformed reads as empty. */
export function jerseyState(reborn) {
  const raw = reborn?.jerseys;
  return {
    version: 1,
    offers: Array.isArray(raw?.offers) ? raw.offers.filter((o) => o && o.id) : [],
    collection: Array.isArray(raw?.collection) ? raw.collection.filter((j) => j && j.id) : [],
  };
}

export const pendingOffers = (state) => jerseyState({ jerseys: state }).offers.filter((o) => o.status === "pending");

const offerIdFor = (gameId, bref) => `jersey-offer:${gameId}:${bref}`;

/** Pending offers from an earlier season lapse (the settlement window is the season they were earned in). */
export function expireOffers(stateIn, currentYear) {
  const state = structuredClone(jerseyState({ jerseys: stateIn }));
  for (const o of state.offers) {
    if (o.status === "pending" && Number.isFinite(currentYear) && o.evidence?.year < currentYear) o.status = "expired";
  }
  return state;
}

/**
 * Read one settled game and open the offers it earns. Idempotent per report.gameId: feeding the same game twice adds
 * nothing. At most MAX_OFFERS per game, at most one jersey per person per season (offers and kept jerseys both count).
 * Returns { state, created: [Offer] }.
 */
export function offersForGame(stateIn, { report, ledger, rivalry }) {
  const state = expireOffers(stateIn, report?.year);
  const out = { state, created: [] };
  const game = gameEvidenceFromReport(report, ledger);
  if (!game.settled) return out;

  // Who could offer tonight: every rival who really played, plus the man who really guarded you (a rival or just someone
  // you keep facing). Only people in the run's own ledger qualify, and only with a real, settled game behind them.
  const brefs = new Set((rivalry?.met || []).map((m) => m.rival.bref));
  for (const m of game.directMatchups) brefs.add(m.opponentId);
  // A keepsake stays rare: offers still open or already kept this season count against the season's cap (declined / lapsed do not).
  const heldThisSeason = state.offers.filter((o) => o.evidence?.year === game.year && (o.status === "pending" || o.status === "accepted")).length;
  const room = Math.max(0, EXCHANGE_RULES.MAX_PER_SEASON - heldThisSeason);
  const candidates = [];
  for (const bref of brefs) {
    const person = (ledger?.rivals || []).find((r) => r.bref === bref) || ledger?.watch?.[bref];
    const rel = relationSummary(person);
    if (!person || !rel) continue;
    const id = offerIdFor(game.id, bref);
    if (state.offers.some((o) => o.id === id)) continue; // this game already produced it
    // One jersey per man per season, whether it is still pending or already kept (declined / lapsed ones free the slot).
    if (state.offers.some((o) => o.fromBref === bref && o.evidence?.year === game.year && o.status !== "expired" && o.status !== "declined")) continue;
    if (state.collection.some((j) => j.provenance?.fromBref === bref && j.provenance?.year === game.year)) continue;
    const verdict = evaluateExchangeCandidate({ opponent: person, game, respect: rel.respect, meetings: rel.meetings });
    if (verdict.eligible) candidates.push({ rival: person, respect: rel.respect, meetings: rel.meetings, verdict, id });
  }

  candidates.sort((a, b) => b.verdict.score - a.verdict.score || a.rival.bref.localeCompare(b.rival.bref));
  for (const c of candidates.slice(0, Math.min(EXCHANGE_RULES.MAX_OFFERS, room))) {
    const template = exchangeTemplate({ bref: c.rival.bref, name: c.rival.name, nameEn: c.rival.nameEn, team: c.rival.team, year: game.year });
    if (!template) continue;
    // That night's real lines, straight from the settled game: a rival's ledger has them, a man you merely keep facing does not, the report always does.
    const opp = (report.opponents || []).find((o) => o.bref === c.rival.bref);
    const lines = opp ? { you: { pts: report.line?.pts ?? 0, gs: report.gameScore ?? 0 }, rival: { pts: opp.pts ?? 0, gs: opp.gs ?? 0 } } : { you: null, rival: null };
    const offer = {
      id: c.id, type: "JERSEY_EXCHANGE", status: "pending", gameId: game.id,
      fromBref: c.rival.bref, fromName: c.rival.name, fromNameEn: c.rival.nameEn || c.rival.name, fromTeam: c.rival.team || null,
      templateId: template.id, template, reasons: c.verdict.reasons, score: c.verdict.score, respect: c.respect, signed: false,
      evidence: {
        id: game.id, settled: true, year: game.year, game: game.game, won: game.won, margin: game.margin,
        you: lines.you, rival: lines.rival, meetings: c.meetings,
      },
    };
    state.offers.push(offer);
    out.created.push(offer);
  }
  return out;
}

/**
 * Accept an offer: it becomes a kept jersey with its provenance. Idempotent (a second accept of the same offer is a
 * no-op success), refuses anything that is not pending, and allows one accepted exchange per game.
 */
export function acceptJerseyExchange(stateIn, offerId, { now = null } = {}) {
  const state = structuredClone(jerseyState({ jerseys: stateIn }));
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: "OFFER_NOT_FOUND", state };
  const instanceId = `exchange:${offer.id}`;
  if (offer.status === "accepted" && state.collection.some((j) => j.id === instanceId)) return { ok: true, duplicate: true, state, jersey: state.collection.find((j) => j.id === instanceId) };
  if (offer.status !== "pending") return { ok: false, reason: "OFFER_NOT_PENDING", state };
  if (offer.evidence?.id !== offer.gameId || offer.evidence?.settled !== true) return { ok: false, reason: "INVALID_EVIDENCE", state };
  const takenThisGame = state.collection.filter((j) => j.source === "exchange" && j.provenance?.gameId === offer.gameId).length;
  if (takenThisGame >= EXCHANGE_RULES.MAX_ACCEPTED_PER_GAME) return { ok: false, reason: "GAME_EXCHANGE_LIMIT", state };

  const jersey = {
    id: instanceId, templateId: offer.templateId, template: offer.template, source: "exchange",
    acquiredAt: now || { year: offer.evidence.year, game: offer.evidence.game },
    signed: offer.signed === true, equipped: false, displayed: false,
    provenance: {
      offerId: offer.id, gameId: offer.gameId, fromBref: offer.fromBref, fromName: offer.fromName, fromNameEn: offer.fromNameEn,
      team: offer.fromTeam, year: offer.evidence.year, game: offer.evidence.game, won: offer.evidence.won, margin: offer.evidence.margin,
      you: offer.evidence.you, rival: offer.evidence.rival, meetings: offer.evidence.meetings, reasons: offer.reasons, respect: offer.respect,
    },
  };
  offer.status = "accepted";
  offer.resolvedAt = jersey.acquiredAt;
  state.collection.push(jersey);
  return { ok: true, duplicate: false, state, jersey };
}

/** Decline an offer (terminal). Declining twice is a no-op success; declining an accepted one is refused. */
export function declineJerseyExchange(stateIn, offerId) {
  const state = structuredClone(jerseyState({ jerseys: stateIn }));
  const offer = state.offers.find((o) => o.id === offerId);
  if (!offer) return { ok: false, reason: "OFFER_NOT_FOUND", state };
  if (offer.status === "declined") return { ok: true, duplicate: true, state };
  if (offer.status !== "pending") return { ok: false, reason: "OFFER_NOT_PENDING", state };
  offer.status = "declined";
  return { ok: true, duplicate: false, state };
}
