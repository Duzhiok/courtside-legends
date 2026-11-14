/**
 * Player Reborn rivalries (Career 2.0 final ruling, decision 2).
 *
 * A rivalry is a story about two real players who keep meeting. It is born
 * three ways, all from real games the run actually played:
 *   - "auto":      repeated meaningful meetings with your direct matchup
 *                  (same position group, real minutes, comparable level).
 *                  Never on first sight: it needs AUTO_MIN_MEETINGS meetings.
 *   - "story":     a story beat read off a real game — a public taunt after
 *                  he buried you, or a clutch possession you took against
 *                  him. Needs at least a second meeting.
 *   - "challenge": the player names someone he really just faced.
 *
 * What a rivalry changes: the pre-game card, a wider takeover window in
 * games against him (more clutch CHANCES; GameSim still decides every shot),
 * the head-to-head record, the career timeline and the account's legacy.
 * What it never changes: OVR, shooting, any dice. There is no rating field
 * here to change.
 *
 * Source of truth is the run's own ledger (`reborn.rivalries`, additive and
 * optional — a guest has no account). mirrorRivalriesToAccount() projects it
 * into the account relationship store with stable ids, so calling it twice
 * changes nothing.
 *
 * Pure: no DOM, no storage, no Math.random. Callers persist what is returned.
 */
import {
  addRelationship,
  appendLegacyEvent,
  personById,
  recordPerson,
  recordRivalryGame,
} from "../career/careerRelationships.js";

export const RIVALRY_ORIGINS = Object.freeze(["auto", "story", "challenge"]);
/** A meeting only counts when both of you really played. */
export const MEETING_MIN_MINUTES = 12;
/** "Comparable level": the direct matchup's OVR is within this gap of yours. */
export const RIVAL_OVR_GAP = 12;
/** Auto rivalries: at least this many meetings, and this much heat. */
export const AUTO_MIN_MEETINGS = 3;
export const AUTO_HEAT_TO_FORM = 6;
/** Story beats need at least this many meetings (the current one included). */
export const STORY_MIN_MEETINGS = 2;
export const CLOSE_GAME_MARGIN = 6;
export const DUEL_GAME_SCORE = 10;
/** Taunt: he out-produced you by this much game score, with 20+ points, in your loss. */
export const TAUNT_GS_GAP = 10;
export const TAUNT_MIN_PTS = 20;
export const MAX_ACTIVE_RIVALS = 3;
/** The Reborn driver's normal clutch window, and the wider one vs a rival. */
export const DEFAULT_TAKEOVER_WINDOW = Object.freeze({ clock: 120, margin: 5 });
export const RIVALRY_TAKEOVER_WINDOW = Object.freeze({ clock: 180, margin: 8 });

const EMPTY = Object.freeze({ version: 1, watch: {}, rivals: [] });

/** The ledger on a run; missing or malformed reads as empty. */
export function rivalryLedger(reborn) {
  const raw = reborn?.rivalries;
  if (!raw || typeof raw !== "object") return { version: 1, watch: {}, rivals: [] };
  return {
    version: 1,
    watch: raw.watch && typeof raw.watch === "object" ? raw.watch : {},
    rivals: Array.isArray(raw.rivals) ? raw.rivals : [],
  };
}

/** G / F / C — enough to say "he guards you". */
export function posGroup(pos) {
  const p = String(pos || "").toUpperCase();
  if (p.startsWith("C")) return "C";
  if (p.includes("G")) return "G";
  return "F";
}

const isRival = (ledger, bref) => ledger.rivals.some((r) => r.bref === bref);

/** Active rivals on an opponent roster (cards with bref). */
export function rivalsOnRoster(ledger, cards = []) {
  const onRoster = new Set(cards.map((c) => c.bref).filter(Boolean));
  return ledger.rivals.filter((r) => onRoster.has(r.bref));
}

/** The takeover window for a game against these cards. */
export function takeoverWindowFor(ledger, cards) {
  return rivalsOnRoster(ledger, cards).length ? RIVALRY_TAKEOVER_WINDOW : DEFAULT_TAKEOVER_WINDOW;
}

/** W-L and meetings against one rival. */
export function headToHead(rival) {
  const games = Array.isArray(rival?.games) ? rival.games : [];
  const wins = games.filter((g) => g.won).length;
  return { meetings: games.length, wins, losses: games.length - wins };
}

/**
 * Your direct matchup in this game: same position group, real minutes,
 * comparable level; the one who played the most. Null when nobody fits.
 */
export function directMatchup(report) {
  const you = report?.you;
  if (!you || (report.line?.min || 0) < MEETING_MIN_MINUTES) return null;
  const group = posGroup(you.pos);
  return (report.opponents || [])
    .filter((o) => o.bref && o.min >= MEETING_MIN_MINUTES && posGroup(o.pos) === group)
    .filter((o) => Math.abs((o.ovr || 0) - (you.ovr || 0)) <= RIVAL_OVR_GAP)
    .sort((a, b) => b.min - a.min)[0] || null;
}

const personOf = (o) => ({ bref: o.bref, name: o.name, nameEn: o.nameEn || o.name, pos: o.pos, team: o.team || null });

function meetingRecord(report, opp) {
  return {
    gameId: report.gameId,
    year: report.year,
    game: report.game,
    won: !!report.won,
    margin: report.margin,
    you: { pts: report.line?.pts || 0, gs: report.gameScore || 0 },
    rival: { pts: opp.pts || 0, gs: opp.gs || 0 },
  };
}

function formRival(ledger, opp, report, origin, reason) {
  const rival = {
    ...personOf(opp),
    origin,
    reason,
    since: { year: report.year, game: report.game, gameId: report.gameId },
    games: [meetingRecord(report, opp)],
  };
  delete ledger.watch[opp.bref];
  ledger.rivals.push(rival);
  return rival;
}

/** The story beat this game offers against the matchup, or null. */
function storyBeat(report, opp) {
  const youGs = report.gameScore || 0;
  if (!report.won && (opp.pts || 0) >= TAUNT_MIN_PTS && (opp.gs || 0) - youGs >= TAUNT_GS_GAP) return "taunt";
  if (report.takeover?.attempted && Math.abs(report.margin ?? 99) <= 3) return "clutch";
  return null;
}

/**
 * Record one played game into the ledger. Idempotent per report.gameId:
 * feeding the same report twice changes nothing. Returns
 * { ledger, formed: [rival], met: [{ rival, meeting }] }.
 */
export function recordRivalryMeetings(ledgerIn, report) {
  const ledger = structuredClone(ledgerIn || EMPTY);
  const out = { ledger, formed: [], met: [] };
  if (!report?.gameId || (report.line?.min || 0) <= 0) return out;

  // 1. Every active rival who really played tonight: one more meeting.
  for (const rival of ledger.rivals) {
    const opp = (report.opponents || []).find((o) => o.bref === rival.bref && o.min > 0);
    if (!opp || rival.games.some((g) => g.gameId === report.gameId)) continue;
    const meeting = meetingRecord(report, opp);
    rival.games.push(meeting);
    out.met.push({ rival, meeting });
  }

  // 2. The direct matchup heats up toward a rivalry (auto or story).
  const opp = directMatchup(report);
  if (!opp || isRival(ledger, opp.bref) || ledger.rivals.length >= MAX_ACTIVE_RIVALS) return out;
  const prev = ledger.watch[opp.bref];
  if (prev?.lastGameId === report.gameId) return out;
  const close = Math.abs(report.margin ?? 99) <= CLOSE_GAME_MARGIN;
  const duel = (report.gameScore || 0) >= DUEL_GAME_SCORE && (opp.gs || 0) >= DUEL_GAME_SCORE;
  const watch = {
    ...personOf(opp),
    meetings: (prev?.meetings || 0) + 1,
    heat: (prev?.heat || 0) + 1 + (close ? 1 : 0) + (duel ? 1 : 0),
    lastGameId: report.gameId,
  };
  ledger.watch[opp.bref] = watch;

  const beat = watch.meetings >= STORY_MIN_MEETINGS ? storyBeat(report, opp) : null;
  if (beat) out.formed.push(formRival(ledger, opp, report, "story", beat));
  else if (watch.meetings >= AUTO_MIN_MEETINGS && watch.heat >= AUTO_HEAT_TO_FORM) {
    out.formed.push(formRival(ledger, opp, report, "auto", "repeated"));
  }
  return out;
}

/**
 * The player names a rival from the game he just played. Only someone who
 * really played in that report can be challenged. Returns
 * { ledger, rival } or { ledger, rival: null, reason }.
 */
export function challengeRival(ledgerIn, report, bref) {
  const ledger = structuredClone(ledgerIn || EMPTY);
  const opp = (report?.opponents || []).find((o) => o.bref === bref && o.min > 0);
  if (!opp || !report?.gameId) return { ledger, rival: null, reason: "not-faced" };
  if (isRival(ledger, bref)) return { ledger, rival: null, reason: "already" };
  if (ledger.rivals.length >= MAX_ACTIVE_RIVALS) return { ledger, rival: null, reason: "full" };
  return { ledger, rival: formRival(ledger, opp, report, "challenge", "challenge") };
}

/** Who can be challenged after this game: the top performers you faced, not yet rivals. */
export function challengeCandidates(ledger, report, limit = 3) {
  if (!report?.gameId || ledger.rivals.length >= MAX_ACTIVE_RIVALS) return [];
  return (report.opponents || [])
    .filter((o) => o.bref && o.min > 0 && !isRival(ledger, o.bref))
    .sort((a, b) => (b.gs || 0) - (a.gs || 0))
    .slice(0, limit);
}

/** A timeline event per newly formed rival (the view appends them). */
export function rivalryTimelineEvent(rival) {
  return { year: rival.since.year, event: "rivalry", origin: rival.origin, reason: rival.reason, bref: rival.bref, name: rival.name, nameEn: rival.nameEn, game: rival.since.game };
}

/** The run's own person id in the account store (fictional runs have no bref). */
export const selfPersonId = (reborn) => reborn?.identity?.bref || `reborn:${reborn?.seed}`;

/**
 * Project the run's rivals into the account relationship store + legacy.
 * Stable ids everywhere: safe to call after every game. Mutates `account`.
 */
export function mirrorRivalriesToAccount(account, reborn) {
  if (!account || !reborn) return account;
  const selfId = selfPersonId(reborn);
  // Never overwrite an existing self record (it may carry the revealed name);
  // an unrevealed run must not leak who you are.
  if (!personById(account, selfId)) recordPerson(account, { id: selfId, kind: "player", name: "你", nameEn: "You" });
  for (const rival of rivalryLedger(reborn).rivals) {
    recordPerson(account, { id: rival.bref, kind: "player", name: rival.name, nameEn: rival.nameEn, bref: rival.bref, teamId: rival.team || undefined });
    addRelationship(account, { aId: selfId, bId: rival.bref, kind: "rivalry", season: rival.since.year });
    appendLegacyEvent(account, {
      id: `rivalry:${reborn.seed}:${rival.bref}`,
      type: "rivalry",
      season: rival.since.year,
      summary: `宿敌诞生：${rival.name}`,
      summaryEn: `Rivalry born: ${rival.nameEn || rival.name}`,
      data: { bref: rival.bref, origin: rival.origin, reason: rival.reason },
    });
    for (const g of rival.games) {
      recordRivalryGame(account, { season: g.year, opponentBref: rival.bref, won: g.won, gameId: g.gameId });
    }
  }
  return account;
}
