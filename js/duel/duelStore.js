/**
 * Legend Duel store: resolves challenger/legend cards into duelists, and
 * records duel results on the account (wins/losses/defeated legends) plus a
 * small Account XP win bonus. No new save format: the record lives on the
 * account as `account.duel` (same additive pattern as `account.myTeamSeasons`
 * / `account.myTeamGold`); guests keep theirs in localStorage.
 *
 * A duel win never gifts the legend card — gacha stays the only way to own
 * a legend. The XP bonus is +25 (the Quick Play scale, XP_TABLE.quick),
 * keyed per duel id so re-recording the same duel pays nothing.
 */
import { getAccount, saveAccount, resolvePlayers } from "../data/account.js";
import { PLAYERS, overall } from "../data/players.js";
import { awardAccountXp } from "../data/accountLevel.js";
import { GALLERY_LEGENDS } from "../ui/homeShowcase.js";

export const DUEL_WIN_XP = 25;
export const DUEL_RECORD_KEY = "cls_duel_record_v1";
export const DUEL_GAMES_CAP = 20;

/** Find a gallery legend by bref ("jordami01") or "bref:season" token. */
export function legendById(legendId) {
  const token = String(legendId || "").trim().toLowerCase();
  if (!token) return null;
  const [bref, season] = token.split(":");
  const found = GALLERY_LEGENDS.find(
    (l) => l.bref.toLowerCase() === bref && (season === undefined || l.season === Number(season)),
  );
  return found || null;
}

/** Resolve a legend's season card from the roster (first bref+season match). */
export function legendCard(legend) {
  if (!legend) return null;
  const row = PLAYERS.find((p) => p.bref === legend.bref && p.season === legend.season);
  if (!row) return null;
  const resolved = resolvePlayers([row.id]);
  return resolved[0] || null;
}

/**
 * Card -> duelist: normalized 0-100 ratings on the same 2K scale overall()
 * uses. shooting blends three/mid/paint exactly like overall()'s shooting
 * component; finishing/handles blend the card's existing paint/pass/iq/
 * speed/strength fields. Nothing here invents a new stat scale.
 */
export function cardToDuelist(card) {
  if (!card) return null;
  const num = (v, fallback = 50) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);
  const three = num(card.three);
  const mid = num(card.mid);
  const paint = num(card.paint);
  return {
    id: card.id,
    name: card.name,
    nameEn: card.nameEn || null,
    bref: card.bref || null,
    season: card.season || null,
    pos: card.playPos || card.pos || "SF",
    ovr: overall(card),
    shooting: Math.round((three + mid + paint) / 3),
    finishing: Math.round((paint + num(card.speed) + num(card.strength)) / 3),
    handles: Math.round((num(card.pass) + num(card.iq) + num(card.speed)) / 3),
    defense: num(card.defense),
    strength: num(card.strength),
    speed: num(card.speed),
    stamina: num(card.stamina),
    skills: Array.isArray(card.skills) ? [...card.skills] : [],
  };
}

/** Owned cards as duelists, best OVR first (challenger picker source). */
export function ownedDuelists(account) {
  if (!account) return [];
  return resolvePlayers(account.playerIds || [], account)
    .map(cardToDuelist)
    .filter(Boolean)
    .sort((a, b) => b.ovr - a.ovr);
}

/** Gallery legends as duelists (defender pool + Legend vs Legend challengers). */
export function legendDuelists() {
  return GALLERY_LEGENDS.map((legend) => {
    const card = legendCard(legend);
    const duelist = cardToDuelist(card);
    if (!duelist) return null;
    return { ...duelist, displayName: legend.name };
  }).filter(Boolean);
}

export function emptyDuelRecord() {
  return { wins: 0, losses: 0, defeated: [], games: [] };
}

function readGuestRecord(storage) {
  if (!storage) return emptyDuelRecord();
  try {
    const raw = storage.getItem(DUEL_RECORD_KEY);
    if (!raw) return emptyDuelRecord();
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyDuelRecord();
    return { ...emptyDuelRecord(), ...parsed, defeated: Array.isArray(parsed.defeated) ? parsed.defeated : [], games: Array.isArray(parsed.games) ? parsed.games : [] };
  } catch {
    return emptyDuelRecord();
  }
}

function writeGuestRecord(record, storage) {
  if (!storage) return;
  try {
    storage.setItem(DUEL_RECORD_KEY, JSON.stringify(record));
  } catch {
    // storage full/blocked: the in-memory record still renders this session.
  }
}

/**
 * The account's duel record. Guests read localStorage; a missing storage
 * (Node tests) returns a fresh in-memory record.
 */
export function readDuelRecord(account = getAccount(), storage = typeof localStorage !== "undefined" ? localStorage : null) {
  if (!account) return readGuestRecord(storage);
  if (!account.duel || typeof account.duel !== "object") return emptyDuelRecord();
  return { ...emptyDuelRecord(), ...account.duel, defeated: Array.isArray(account.duel.defeated) ? account.duel.defeated : [], games: Array.isArray(account.duel.games) ? account.duel.games : [] };
}

function writeDuelRecord(account, record, storage) {
  if (!account) {
    writeGuestRecord(record, storage);
    return;
  }
  account.duel = record;
}

/**
 * Record one finished duel. Idempotent per duel id: re-recording the same
 * duel returns the stored result without double-counting or double XP.
 * A win pays +25 Account XP (keyed `duelWin:<duelId>`) and marks the legend
 * defeated; a loss counts only. Returns { record, xp, duplicate }.
 */
export function recordDuelResult(
  account,
  { duelId, legendBref, legendName, challengerId, challengerName, challengerKind = "owned", difficulty = "pro", won, scoreA, scoreB },
  { save = saveAccount, storage = typeof localStorage !== "undefined" ? localStorage : null } = {},
) {
  const record = readDuelRecord(account, storage);
  if (record.games.some((g) => g.duelId === duelId)) {
    return { record, xp: { gained: 0, duplicate: true }, duplicate: true };
  }
  const game = {
    duelId,
    legendBref: legendBref || null,
    legendName: legendName || null,
    challengerId: challengerId || null,
    challengerName: challengerName || null,
    challengerKind,
    difficulty,
    won: !!won,
    scoreA,
    scoreB,
    at: new Date().toISOString(),
  };
  record.games.unshift(game);
  if (record.games.length > DUEL_GAMES_CAP) record.games.length = DUEL_GAMES_CAP;
  if (won) {
    record.wins += 1;
    if (legendBref && !record.defeated.includes(legendBref)) record.defeated.push(legendBref);
  } else {
    record.losses += 1;
  }
  writeDuelRecord(account, record, storage);
  let xp = { gained: 0, duplicate: false };
  if (won) {
    xp = awardAccountXp(account, DUEL_WIN_XP, { source: "duelWin", key: `duelWin:${duelId}` });
  }
  try {
    if (account) save(account);
  } catch {
    // A save failure must not lose the in-memory record or the XP already paid.
  }
  return { record, xp, duplicate: false };
}
