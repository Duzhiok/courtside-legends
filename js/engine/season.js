/**
 * NBA-style season: 32 teams (modern) or historical year rosters, 82-game RS, playoffs, awards.
 */
import { resolveEffectiveGameplan } from "./effectiveGameplan.js";
import { applyRotationPlan } from "./gameplan.js";
import {
  EAST_IDS,
  WEST_IDS,
  allLeagueTeamIds,
  conferenceOf,
  leagueFranchiseRecord,
  leagueTeamLabel,
  LEAGUE_TEAM_META,
} from "../data/league.js";
import { historicalSeason } from "../data/historicalSeasons.js";
import { playersForFranchise } from "../data/franchises.js";
import { PLAYERS, clonePlayer, overall } from "../data/players.js";
import { ensureTeamStaff } from "../data/coaches.js";
import { autoFillTeam } from "./draft.js";
import { developLeagueRosters } from "./develop.js";
import {
  ensureSeasonMarket,
  hydrateSeasonSalaries,
  refreshFreeAgency,
  refreshStaffMarket,
} from "./seasonMarket.js";
import { accumulateGameToAllTeamBoard, allTeamFromSeasonRows, selectAllTeamByPos, selectFinalsMvp } from "./allTeam.js";
import { GameSim } from "./sim.js";
import { shuffle } from "../core/seededRandom.js";
import { prunePickLedger } from "./pickLedger.js";
import { clearSaveOwner, keyHasData, recordMirrorWrite, recordSaveWrite, seasonSig, slotLocked } from "../data/saveOwnership.js";

const RS_GAMES = 82;
const SAVE_KEY = "cls_season_v1";
export const SEASON_VERSION = 2;

/** Active team ids for this save (historical leagues vary). */
export function seasonTeamIds(st) {
  if (Array.isArray(st?.league?.teamIds) && st.league.teamIds.length) return st.league.teamIds;
  return allLeagueTeamIds();
}

export function seasonEastIds(st) {
  if (Array.isArray(st?.league?.eastIds) && st.league.eastIds.length) return st.league.eastIds;
  return EAST_IDS;
}

export function seasonWestIds(st) {
  if (Array.isArray(st?.league?.westIds) && st.league.westIds.length) return st.league.westIds;
  return WEST_IDS;
}

export function seasonConferenceOf(st, teamId) {
  if (st?.league?.confById?.[teamId]) return st.league.confById[teamId];
  return conferenceOf(teamId);
}

function seasonLabelOf(st, teamId) {
  if (st?.customNames?.[teamId]) return st.customNames[teamId];
  if (st?.league?.labels?.[teamId]) return st.league.labels[teamId];
  return leagueTeamLabel(teamId, st?.customNames);
}


function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function numericSeed(value) {
  if (Number.isFinite(value)) return Number(value) >>> 0;
  let hash = 2166136261;
  for (const character of String(value ?? "")) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function nextOffseasonSeed(seed, year) {
  return (
    Math.imul(numericSeed(seed) ^ (Number(year) >>> 0), 1664525) +
    1013904223
  ) >>> 0;
}

/** Build opponent lists so each team has exactly 82 games (H/A roughly even). */
function buildMatchupPairs(east, west, rng, confOf = conferenceOf) {
  const pairs = []; // { a, b } unordered intent; home decided later
  const need = Object.fromEntries([...east, ...west].map((id) => [id, RS_GAMES]));

  const addPair = (a, b, times) => {
    for (let i = 0; i < times; i++) {
      if (need[a] <= 0 || need[b] <= 0) return;
      pairs.push([a, b]);
      need[a]--;
      need[b]--;
    }
  };

  // Intra-conference intensity scales with conference size
  const intraTimes = east.length >= 14 || west.length >= 14 ? 3 : east.length >= 10 ? 4 : 5;
  const interTimes = east.length >= 14 && west.length >= 14 ? 2 : 3;

  for (const conf of [east, west]) {
    for (let i = 0; i < conf.length; i++) {
      for (let j = i + 1; j < conf.length; j++) {
        addPair(conf[i], conf[j], intraTimes);
      }
    }
  }
  for (const e of east) {
    for (const w of west) {
      addPair(e, w, interTimes);
    }
  }
  // Pad remaining with same-conference rematches
  const padPool = [...east, ...west];
  let guard = 0;
  while (Object.values(need).some((n) => n > 0) && guard++ < 8000) {
    const hungry = padPool.filter((id) => need[id] > 0);
    if (hungry.length < 2) break;
    const a = hungry[Math.floor(rng() * hungry.length)];
    const same = confOf(a) === "East" ? east : west;
    const cands = same.filter((id) => id !== a && need[id] > 0);
    if (!cands.length) {
      const other = hungry.filter((id) => id !== a);
      if (!other.length) break;
      addPair(a, other[Math.floor(rng() * other.length)], 1);
      continue;
    }
    addPair(a, cands[Math.floor(rng() * cands.length)], 1);
  }
  return pairs;
}

/** Regular-season length of this save (quick My Team seasons are shorter than the NBA's 82). */
export const seasonGames = (st) => Number(st?.rsGames) || RS_GAMES;

/** A games-played threshold written for an 82-game year, scaled to this season's length (identity at 82). */
export const scaleGames = (n, st) => Math.max(1, Math.round((n * seasonGames(st)) / RS_GAMES));

/**
 * Short regular season (e.g. 20 games). Do NOT reuse buildMatchupPairs for this: with a small quota it fills each
 * team from its own conference first, so everyone plays only 6-9 distinct, same-conference opponents.
 * Circle method instead: n-1 rounds where every team meets every other exactly once; take `games` of them.
 * Every team plays exactly `games` games vs `games` DIFFERENT opponents, once per day (needs an even team count).
 */
export function generateShortSchedule(teamIds, seed, games) {
  const n = teamIds.length;
  if (n < 2 || n % 2) throw new Error(`short schedule needs an even number of teams (got ${n})`);
  if (!(games >= 1 && games <= n - 1)) throw new Error(`short schedule supports 1..${n - 1} games (got ${games})`);
  const rng = mulberry32(seed >>> 0);
  const ring = shuffle([...teamIds], rng);
  const rounds = [];
  for (let r = 0; r < n - 1; r++) {
    const night = [];
    for (let i = 0; i < n / 2; i++) night.push([ring[i], ring[n - 1 - i]]);
    rounds.push(night);
    ring.splice(1, 0, ring.pop()); // rotate everyone but ring[0]
  }
  const homeCount = Object.fromEntries(teamIds.map((id) => [id, 0]));
  return shuffle(rounds.map((_, i) => i), rng)
    .slice(0, games)
    .map((ri) =>
      shuffle([...rounds[ri]], rng).map(([a, b]) => {
        // Whoever has hosted fewer games so far hosts (keeps every team near games/2 home games).
        const aHome = homeCount[a] < homeCount[b] || (homeCount[a] === homeCount[b] && rng() < 0.5);
        const [homeId, awayId] = aHome ? [a, b] : [b, a];
        homeCount[homeId]++;
        return { homeId, awayId, played: false, result: null };
      })
    );
}

/**
 * Pack matchups into 82 days where each team plays at most once per day.
 * @param {string[]} teamIds
 * @param {number} seed
 * @param {{ eastIds?: string[], westIds?: string[], confById?: Record<string,string> }} [layout]
 */
export function generateSchedule(teamIds = allLeagueTeamIds(), seed = Date.now(), layout = {}) {
  const rng = mulberry32(seed >>> 0);
  const eastSrc = layout.eastIds || EAST_IDS;
  const westSrc = layout.westIds || WEST_IDS;
  const east = eastSrc.filter((id) => teamIds.includes(id));
  const west = westSrc.filter((id) => teamIds.includes(id));
  const confOf = (id) => layout.confById?.[id] || conferenceOf(id);
  let pairs = shuffle(buildMatchupPairs(east, west, rng, confOf), rng);

  const days = [];
  const homeCount = Object.fromEntries(teamIds.map((id) => [id, 0]));

  while (pairs.length && days.length < 200) {
    const used = new Set();
    const night = [];
    const remain = [];
    for (const [a, b] of pairs) {
      if (used.has(a) || used.has(b)) {
        remain.push([a, b]);
        continue;
      }
      // Balance home: team with fewer home games hosts
      let home = a;
      let away = b;
      if (homeCount[a] > homeCount[b] || (homeCount[a] === homeCount[b] && rng() < 0.5)) {
        home = b;
        away = a;
      }
      homeCount[home]++;
      used.add(a);
      used.add(b);
      night.push({ homeId: home, awayId: away, played: false, result: null });
    }
    pairs = remain;
    if (night.length) days.push(night);
    else break;
  }

  // If leftover pairs, append as short nights
  while (pairs.length) {
    const used = new Set();
    const night = [];
    const remain = [];
    for (const [a, b] of pairs) {
      if (used.has(a) || used.has(b)) {
        remain.push([a, b]);
        continue;
      }
      night.push({ homeId: a, awayId: b, played: false, result: null });
      used.add(a);
      used.add(b);
    }
    pairs = remain;
    if (night.length) days.push(night);
    else break;
  }

  return days;
}

function emptySeasonStats() {
  return {
    gp: 0,
    gs: 0,
    min: 0,
    pts: 0,
    reb: 0,
    ast: 0,
    stl: 0,
    blk: 0,
    tov: 0,
    fg: 0,
    fga: 0,
    tp: 0,
    tpa: 0,
    ft: 0,
    fta: 0,
    oreb: 0,
    dreb: 0,
    pf: 0,
    plusMinus: 0,
  };
}

function accumulatePlayer(box, into) {
  if (!box || !into) return;
  // 只认本场 box score，禁止把整张球员卡当成统计（否则会把 scoring 等属性误加进去）
  const s = box.stats;
  if (!s || typeof s !== "object") return;
  const min = Number(s.min) || 0;
  // Soft sanity cap — sim should sit under this; guards against old inflated snaps
  const pts = Math.min(62, Math.max(0, Number(s.pts) || 0));
  // DNP 不记出场，避免稀释/污染场均
  if (min < 0.5 && pts < 1) return;
  into.gp += 1;
  into.min += min;
  into.pts += pts;
  into.reb += Math.max(0, Number(s.reb) || 0);
  into.ast += Math.max(0, Number(s.ast) || 0);
  into.stl += Math.max(0, Number(s.stl) || 0);
  into.blk += Math.max(0, Number(s.blk) || 0);
  into.tov += Math.max(0, Number(s.tov) || 0);
  into.fg += Math.max(0, Number(s.fgm) || 0);
  into.fga += Math.max(0, Number(s.fga) || 0);
  into.tp += Math.max(0, Number(s.tpm) || 0);
  into.tpa += Math.max(0, Number(s.tpa) || 0);
  into.ft += Math.max(0, Number(s.ftm) || 0);
  into.fta += Math.max(0, Number(s.fta) || 0);
  into.oreb += Math.max(0, Number(s.oreb) || 0);
  into.dreb += Math.max(0, Number(s.dreb) || 0);
  into.pf += Math.max(0, Number(s.pf) || 0);
  into.plusMinus += Number(s.plusMinus ?? s.pm ?? s["+/-"]) || 0;
}

function teamFromRoster(name, players, coach, { isCpu = false, teamId = null } = {}) {
  return {
    name,
    teamId,
    players: players.map((p) => clonePlayer(p)),
    coach: coach ? structuredClone(coach) : null,
    assistant: null,
    gold: 0,
    isCpu,
  };
}

/** Prefer franchise players across eras when building modern CPU clubs. */
export function buildCpuTeam(teamId, displayName, usedIds, power = 1) {
  const fr = leagueFranchiseRecord(teamId);
  let pool = fr ? playersForFranchise(PLAYERS, fr) : [];
  pool = pool.filter((p) => !usedIds.has(p.id)).sort((a, b) => overall(b) - overall(a));
  const picks = [];
  // Take a spread of eras / OVRs so clubs aren't all the same peak
  const top = pool.slice(0, Math.min(80, pool.length));
  const shuffled = shuffle(top);
  for (const p of shuffled) {
    if (picks.length >= 12) break;
    if (usedIds.has(p.id)) continue;
    // Soft uniqueness by bref so we don't stack 5 seasons of same star
    if (picks.some((x) => x.bref && x.bref === p.bref)) continue;
    picks.push(clonePlayer(p));
    usedIds.add(p.id);
  }
  if (picks.length < 10) {
    const fill = autoFillTeam(displayName, 12 - picks.length, {
      excludeIds: usedIds,
      power,
    });
    for (const p of fill.players) {
      if (picks.length >= 12) break;
      picks.push(p);
      usedIds.add(p.id);
    }
    return teamFromRoster(displayName, picks, fill.coach, { isCpu: true, teamId });
  }
  const fill = autoFillTeam(displayName, 0, { excludeIds: usedIds, power });
  return teamFromRoster(displayName, picks, fill.coach, { isCpu: true, teamId });
}

/** Exact-year roster for a historical NBA club (e.g. 1991 CHI = Jordan Bulls). */
export function buildCpuTeamForYear(year, teamMeta, usedIds) {
  const bref = teamMeta.bref || teamMeta.id;
  const displayName = teamMeta.name || bref;
  const teamId = teamMeta.id;
  let pool = PLAYERS.filter(
    (p) => Number(p.season) === Number(year) && p.team === bref && !usedIds.has(p.id)
  );
  pool = pool.sort((a, b) => {
    const oa = overall(b) - overall(a);
    if (oa) return oa;
    return (Number(b.raw?.mpg) || Number(b.mpg) || 0) - (Number(a.raw?.mpg) || Number(a.mpg) || 0);
  });
  const picks = [];
  for (const p of pool) {
    if (picks.length >= 12) break;
    picks.push(clonePlayer(p));
    usedIds.add(p.id);
  }
  if (picks.length < 8) {
    const fill = autoFillTeam(displayName, 12 - picks.length, {
      excludeIds: usedIds,
      power: 1,
    });
    for (const p of fill.players) {
      if (picks.length >= 12) break;
      // Prefer same-year leftovers if any
      picks.push(p);
      usedIds.add(p.id);
    }
    return teamFromRoster(displayName, picks, fill.coach, { isCpu: true, teamId });
  }
  const fill = autoFillTeam(displayName, 0, { excludeIds: usedIds, power: 1 });
  return teamFromRoster(displayName, picks, fill.coach, { isCpu: true, teamId });
}

function modernLeagueLayout() {
  const teamIds = allLeagueTeamIds();
  const labels = Object.fromEntries(teamIds.map((id) => [id, leagueTeamLabel(id)]));
  const confById = Object.fromEntries(teamIds.map((id) => [id, conferenceOf(id)]));
  return {
    mode: "modern",
    teamIds,
    eastIds: [...EAST_IDS],
    westIds: [...WEST_IDS],
    labels,
    confById,
  };
}

function historicalLeagueLayout(hist, userTeamId, userTeamName) {
  const labels = {};
  const confById = {};
  const eastIds = [];
  const westIds = [];
  for (const t of hist.teams) {
    labels[t.id] = t.name;
    confById[t.id] = t.conf === "East" ? "East" : "West";
    if (confById[t.id] === "East") eastIds.push(t.id);
    else westIds.push(t.id);
  }
  // Player club inserts as East expansion if not already in that year
  if (!confById[userTeamId]) {
    labels[userTeamId] = userTeamName || LEAGUE_TEAM_META[userTeamId]?.defaultDisplayName || userTeamId;
    confById[userTeamId] = "East";
    eastIds.push(userTeamId);
  } else {
    labels[userTeamId] = userTeamName || labels[userTeamId];
  }
  return {
    mode: "historical",
    teamIds: [...eastIds, ...westIds],
    eastIds,
    westIds,
    labels,
    confById,
    yearLabel: hist.label,
    championId: hist.championId,
    championName: hist.championName,
    blurb: hist.blurb,
  };
}

/**
 * @param {object} opts
 * @param {string} opts.userTeamId — usually "LAS"
 * @param {string} opts.userTeamName
 * @param {object} opts.userTeam — { name, players, coach }
 * @param {'modern'|'historical'} [opts.mode]
 * @param {number} [opts.year] — season ending year (e.g. 1991)
 * @param {number} [opts.seed]
 */
export function createSeason(opts) {
  const {
    userTeamId = "LAS",
    userTeamName = "拉斯维加斯 ***",
    userTeam,
    mode = "modern",
    year: yearOpt,
    seed = Date.now(),
    gamesPerTeam = RS_GAMES, // a shorter regular season (quick My Team seasons); modern 32-team league only
  } = opts;

  const historical = mode === "historical";
  const year = historical ? Number(yearOpt) : Number(yearOpt) || new Date().getFullYear();
  const hist = historical ? historicalSeason(year) : null;
  if (historical && !hist) {
    throw new Error(`没有 ${year} 赛季的历史数据`);
  }

  const league = historical
    ? historicalLeagueLayout(hist, userTeamId, userTeamName)
    : modernLeagueLayout();
  if (!historical) {
    league.labels[userTeamId] = userTeamName;
  }

  const customNames = { [userTeamId]: userTeamName };
  const used = new Set((userTeam?.players || []).map((p) => p.id));
  const teams = {};

  for (const id of league.teamIds) {
    const label = customNames[id] || league.labels[id] || leagueTeamLabel(id, customNames);
    if (id === userTeamId) {
      teams[id] = teamFromRoster(userTeamName || label, userTeam.players, userTeam.coach, {
        isCpu: false,
        teamId: id,
      });
    } else if (historical) {
      const meta = hist.teams.find((t) => t.id === id) || {
        id,
        bref: id,
        name: label,
        conf: league.confById[id],
      };
      teams[id] = buildCpuTeamForYear(year, meta, used);
    } else {
      const power = id === "SEA" || id === "BOS" || id === "LAL" ? 2 : 1;
      teams[id] = buildCpuTeam(id, label, used, power);
    }
  }

  const short = Number(gamesPerTeam) !== RS_GAMES;
  if (short && historical) throw new Error("短赛季只支持现代 32 队联盟");
  const schedule = short
    ? generateShortSchedule(league.teamIds, seed, Number(gamesPerTeam))
    : generateSchedule(league.teamIds, seed, {
        eastIds: league.eastIds,
        westIds: league.westIds,
        confById: league.confById,
      });
  const standings = Object.fromEntries(
    league.teamIds.map((id) => [
      id,
      {
        w: 0,
        l: 0,
        pf: 0,
        pa: 0,
        conf: league.confById[id] || conferenceOf(id),
        streak: 0,
        last10: [],
      },
    ])
  );
  const playerSeason = {}; // `${teamId}:${playerId}` → stats + meta

  const st = {
    v: SEASON_VERSION,
    mode: historical ? "historical" : "modern",
    year,
    seed,
    ...(short ? { rsGames: Number(gamesPerTeam) } : {}),
    phase: "regular", // regular | awards | playoffs | done
    dayIndex: 0,
    userTeamId,
    customNames,
    league,
    teams,
    schedule,
    standings,
    playerSeason,
    resultsLog: [],
    awards: null,
    playoffs: null,
    freeAgents: [],
    tradeLog: [],
    createdAt: Date.now(),
  };
  hydrateSeasonSalaries(st);
  refreshFreeAgency(st, { force: true });
  return st;
}

/** Ensure older saves get FA + salaries + league layout. */
export function prepareSeasonState(st) {
  if (!st) return st;
  if (!st.mode) st.mode = "modern";
  if (!st.league) {
    const teamIds = Object.keys(st.teams || {});
    const eastIds = teamIds.filter((id) => (st.standings?.[id]?.conf || conferenceOf(id)) === "East");
    const westIds = teamIds.filter((id) => (st.standings?.[id]?.conf || conferenceOf(id)) === "West");
    st.league = {
      mode: st.mode,
      teamIds: teamIds.length ? teamIds : allLeagueTeamIds(),
      eastIds: eastIds.length ? eastIds : [...EAST_IDS],
      westIds: westIds.length ? westIds : [...WEST_IDS],
      labels: Object.fromEntries(
        (teamIds.length ? teamIds : allLeagueTeamIds()).map((id) => [
          id,
          st.teams[id]?.name || leagueTeamLabel(id, st.customNames),
        ])
      ),
      confById: Object.fromEntries(
        (teamIds.length ? teamIds : allLeagueTeamIds()).map((id) => [
          id,
          st.standings?.[id]?.conf || conferenceOf(id),
        ])
      ),
    };
  }
  return ensureSeasonMarket(st);
}

export function teamRecord(st, teamId) {
  return st.standings[teamId] || { w: 0, l: 0 };
}

export function standingsList(st, conf = null) {
  let ids = seasonTeamIds(st);
  if (conf === "East") ids = seasonEastIds(st);
  if (conf === "West") ids = seasonWestIds(st);
  return ids
    .map((id) => {
      const r = st.standings[id] || { w: 0, l: 0, pf: 0, pa: 0, conf: seasonConferenceOf(st, id), streak: 0 };
      const gp = r.w + r.l;
      return {
        id,
        name: st.teams[id]?.name || seasonLabelOf(st, id),
        conf: r.conf || seasonConferenceOf(st, id),
        w: r.w,
        l: r.l,
        pct: gp ? r.w / gp : 0,
        pf: r.pf,
        pa: r.pa,
        diff: r.pf - r.pa,
        streak: r.streak,
      };
    })
    .sort((a, b) => b.pct - a.pct || b.diff - a.diff || b.w - a.w);
}

export function nextUserGame(st) {
  if (st.phase !== "regular") return null;
  for (let d = st.dayIndex; d < st.schedule.length; d++) {
    const night = st.schedule[d];
    for (const g of night) {
      if (g.played) continue;
      if (g.homeId === st.userTeamId || g.awayId === st.userTeamId) {
        return { day: d, game: g };
      }
    }
  }
  return null;
}

export function userGamesPlayed(st) {
  let n = 0;
  for (const night of st.schedule) {
    for (const g of night) {
      if (!g.played) continue;
      if (g.homeId === st.userTeamId || g.awayId === st.userTeamId) n++;
    }
  }
  return n;
}

/** The live card for a snapshot player, from the season's own rosters. Snapshots carry
 * slim() players (no age, no three/mid/paint/iq/clutch), so age/ovr must come from here
 * (B40): otherwise every row has age null and an ovr 10–17 low, and ROY can never fire. */
function liveCardFor(st, teamId, playerId) {
  const players = st.teams?.[teamId]?.players;
  if (!Array.isArray(players)) return null;
  return players.find((c) => c.id === playerId) || null;
}

function ensurePlayerSeason(st, teamId, p) {
  const key = `${teamId}:${p.id}`;
  const live = liveCardFor(st, teamId, p.id);
  // Prefer the live card's age/ovr; a snapshot player has neither (slim() drops them).
  const age = live && Number.isFinite(live.age) ? live.age : p.age;
  const ovr = live ? overall(live) : overall(p);
  if (!st.playerSeason[key]) {
    st.playerSeason[key] = {
      teamId,
      playerId: p.id,
      name: p.name,
      // The card's real position, NOT playPos: playPos is whichever lineup slot he happened to fill in the first
      // game seen, frozen forever -- a wing once plugged in at C was "the center" for every award that season.
      pos: live?.pos || p.pos,
      season: p.season,
      age,
      ovr,
      bref: p.bref,
      stats: emptySeasonStats(),
    };
  } else {
    // Backfill rows created before this fix (or loaded from an old save): only fill
    // what is missing, never rewrite stored values. ovr stays as first written.
    const row = st.playerSeason[key];
    if (row.age == null && age != null) row.age = age;
    // Saves from before the position fix hold a frozen lineup slot here; the live card knows the real one.
    if (live?.pos && row.pos !== live.pos) row.pos = live.pos;
  }
  return st.playerSeason[key];
}

function applyGameResult(st, game, snap, { recordStandings = true, recordLog = true } = {}) {
  // 防止同一场被累加两次（会导致场均 50–70 分这种离谱数据）
  if (game.played || game._statsApplied) return;
  game._statsApplied = true;
  const hs = snap.score.home;
  const as = snap.score.away;
  const homeWin = hs > as;
  game.played = true;
  game.result = {
    homeScore: hs,
    awayScore: as,
    winnerId: homeWin ? game.homeId : game.awayId,
  };

  const upd = (id, scored, against, won) => {
    const r = st.standings[id];
    if (won) {
      r.w += 1;
      r.streak = r.streak >= 0 ? r.streak + 1 : 1;
    } else {
      r.l += 1;
      r.streak = r.streak <= 0 ? r.streak - 1 : -1;
    }
    r.pf += scored;
    r.pa += against;
    r.last10 = [...r.last10, won ? "W" : "L"].slice(-10);
  };
  if (recordStandings) {
    upd(game.homeId, hs, as, homeWin);
    upd(game.awayId, as, hs, !homeWin);
  }

  for (const sideKey of ["home", "away"]) {
    const tid = sideKey === "home" ? game.homeId : game.awayId;
    const side = snap[sideKey];
    for (const p of side.roster || side.onCourt || []) {
      const row = ensurePlayerSeason(st, tid, p);
      accumulatePlayer(p, row.stats);
      // Estimate starts: top 5 by minutes that night
    }
    const ranked = [...(side.roster || [])].sort(
      (a, b) => (b.stats?.min || 0) - (a.stats?.min || 0)
    );
    for (let i = 0; i < Math.min(5, ranked.length); i++) {
      const row = st.playerSeason[`${tid}:${ranked[i].id}`];
      if (row) row.stats.gs += 1;
    }
  }

  const entry = {
    day: st.dayIndex,
    homeId: game.homeId,
    awayId: game.awayId,
    homeScore: hs,
    awayScore: as,
  };
  // Keep a compact box for user games so schedule / post-sim can reopen stats
  const isUser =
    game.homeId === st.userTeamId || game.awayId === st.userTeamId;
  if (isUser && snap) {
    entry.box = compactGameBox(snap);
    entry.youSide =
      game.homeId === st.userTeamId ? "home" : "away";
    // Cap stored boxes so localStorage stays sane (~last 40 user games)
    const withBox = (st.resultsLog || []).filter((r) => r.box);
    if (withBox.length >= 40) {
      for (const old of withBox.slice(0, withBox.length - 39)) {
        delete old.box;
      }
    }
  }
  if (recordLog) st.resultsLog.push(entry);
}

/** Compact box-score payload for UI / persistence (not full sim snapshot). */
export function compactGameBox(snap) {
  if (!snap) return null;
  const side = (t) => ({
    name: t?.name || "—",
    roster: (t?.roster || []).map((p) => ({
      id: p.id,
      name: p.name,
      season: p.season,
      pos: p.pos,
      playPos: p.playPos || p.pos,
      photo: p.photo || null,
      nbaId: p.nbaId || null,
      franchiseId: p.franchiseId || null,
      grade: p.grade || "—",
      gradeTone: p.gradeTone || "grade-c",
      gradeScore: p.gradeScore ?? 0,
      stats: { ...(p.stats || {}) },
    })),
  });
  return {
    home: side(snap.home),
    away: side(snap.away),
    score: {
      home: snap.score?.home ?? 0,
      away: snap.score?.away ?? 0,
    },
  };
}

/** Build a showResult-compatible snap from a resultsLog entry. */
export function snapFromResultLog(st, entry) {
  if (!entry?.box) return null;
  const youSide =
    entry.youSide ||
    (entry.homeId === st?.userTeamId ? "home" : "away");
  return {
    score: entry.box.score || {
      home: entry.homeScore,
      away: entry.awayScore,
    },
    home: entry.box.home,
    away: entry.box.away,
    youSide,
  };
}

/** The user's coach perks that act inside a game (C5: tactician shot edge), or null. Other teams get none. */
export function seasonStaffBonus(st, teamId) {
  const shot = Number(st?.coachPerkShot) || 0;
  return teamId === st?.userTeamId && shot ? { shot } : null;
}

/** Clone team blob for a fresh GameSim (reset night stats via wrapTeam). */
export function liveTeam(st, teamId, { opponentId = null } = {}) {
  const t = st.teams[teamId];
  // 没请主教练/助教：当场 roll 补齐，并写回赛季存档，避免每场重抽
  if (!t.coach?.id || !t.assistant?.id) ensureTeamStaff(t, { preferStarter: true });
  const out = {
    name: t.name,
    players: t.players.map((p) => clonePlayer(p)),
    coach: t.coach ? structuredClone(t.coach) : null,
    assistant: t.assistant ? structuredClone(t.assistant) : null,
    gold: 0,
    isCpu: t.isCpu,
    teamId,
    staffBonus: seasonStaffBonus(st, teamId),
  };
  // The user's team plays with the one effective gameplan (matchup plan for this opponent -> saved default),
  // the same one 亲自指挥 uses. CPU teams keep the engine default so league sims are unchanged.
  if (teamId === st.userTeamId) {
    const { source, plan } = resolveEffectiveGameplan(t, { opponentId });
    if (plan) applyRotationPlan(out, structuredClone(plan));
    out.gameplanSource = source;
  }
  return out;
}

/** Instant-sim one scheduled game; returns snapshot. */
export function simScheduledGame(st, game, { youSide = null, recordStandings = true } = {}) {
  // 已赛场次绝不重打，否则统计会翻倍（场均六七十分）
  if (game.played) return game._lastSnap || null;
  const home = liveTeam(st, game.homeId, { opponentId: game.awayId });
  const away = liveTeam(st, game.awayId, { opponentId: game.homeId });
  const side =
    youSide ||
    (game.homeId === st.userTeamId ? "home" : game.awayId === st.userTeamId ? "away" : "home");
  const sim = new GameSim({
    home,
    away,
    youSide: side,
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
    speed: 3,
  });
  const snap = sim.runFast();
  game._lastSnap = snap;
  if (recordStandings) applyGameResult(st, game, snap);
  else applyGameResult(st, game, snap, { recordStandings: false, recordLog: false });
  return snap;
}

/**
 * Sim all unfinished games before (and optionally including) the user's next game day,
 * except leave the user's game unplayed when stopBeforeUser=true.
 */
export function advanceToUserGame(st, { stopBeforeUser = true } = {}) {
  const played = [];
  while (st.dayIndex < st.schedule.length) {
    const night = st.schedule[st.dayIndex];
    const userG = night.find(
      (g) => !g.played && (g.homeId === st.userTeamId || g.awayId === st.userTeamId)
    );
    for (const g of night) {
      if (g.played) continue;
      if (stopBeforeUser && userG && g === userG) {
        return { stopped: true, userGame: userG, day: st.dayIndex, played };
      }
      if (userG && g === userG && !stopBeforeUser) {
        const snap = simScheduledGame(st, g);
        played.push({ game: g, snap });
        continue;
      }
      if (g.homeId === st.userTeamId || g.awayId === st.userTeamId) {
        // User game — only auto when stopBeforeUser false
        if (!stopBeforeUser) {
          const snap = simScheduledGame(st, g);
          played.push({ game: g, snap });
        }
        continue;
      }
      const snap = simScheduledGame(st, g);
      played.push({ game: g, snap });
    }
    const unfinished = night.some((g) => !g.played);
    if (unfinished && stopBeforeUser) {
      return { stopped: true, userGame: userG, day: st.dayIndex, played };
    }
    if (!unfinished) st.dayIndex += 1;
    else break;
  }
  if (st.dayIndex >= st.schedule.length || !nextUserGame(st)) {
    // Check if RS complete
    const allDone = st.schedule.every((n) => n.every((g) => g.played));
    if (allDone && st.phase === "regular") {
      st.phase = "awards";
      st.awards = computeAwards(st);
    }
  }
  return { stopped: false, played };
}

/** Sim user's next game instantly + surrounding CPU games that night. */
export function simUserNextGame(st) {
  advanceToUserGame(st, { stopBeforeUser: true });
  const info = nextUserGame(st);
  if (!info) {
    const allDone = st.schedule.every((n) => n.every((g) => g.played));
    if (allDone && st.phase === "regular") {
      st.phase = "awards";
      st.awards = computeAwards(st);
    }
    return null;
  }
  st.dayIndex = info.day;
  const night = st.schedule[info.day];
  for (const g of night) {
    if (g.played) continue;
    if (g === info.game) continue;
    simScheduledGame(st, g);
  }
  const snap = simScheduledGame(st, info.game);
  // Finish rest of night if any
  for (const g of night) {
    if (!g.played) simScheduledGame(st, g);
  }
  st.dayIndex = info.day + 1;
  const allDone = st.schedule.every((n) => n.every((g) => g.played));
  if (allDone && st.phase === "regular") {
    st.phase = "awards";
    st.awards = computeAwards(st);
  }
  return { snap, game: info.game, day: info.day };
}

/** After user plays a live GameSim, record result into season. */
export function recordUserLiveResult(st, game, snap) {
  if (!game || game.played) return;
  applyGameResult(st, game, snap);
  const night = st.schedule[st.dayIndex];
  if (night) {
    for (const g of night) {
      if (!g.played) simScheduledGame(st, g);
    }
  }
  st.dayIndex += 1;
  const allDone = st.schedule.every((n) => n.every((g) => g.played));
  if (allDone && st.phase === "regular") {
    st.phase = "awards";
    st.awards = computeAwards(st);
  }
}

function perGame(s, key) {
  return s.gp ? s[key] / s.gp : 0;
}

function mvpScore(row, teamWins, teamGp, scale = (n) => n) {
  const s = row.stats;
  if (s.gp < scale(20)) return -1;
  const ppg = perGame(s, "pts");
  const rpg = perGame(s, "reb");
  const apg = perGame(s, "ast");
  const spg = perGame(s, "stl");
  const bpg = perGame(s, "blk");
  const winPct = teamGp ? teamWins / teamGp : 0;
  const usage =
    ppg * 1.0 + rpg * 0.85 + apg * 1.15 + spg * 2.2 + bpg * 2.0 - perGame(s, "tov") * 0.6;
  return usage * (0.55 + winPct * 0.45) * Math.min(1, s.gp / scale(65));
}

function dpoyScore(row, scale = (n) => n) {
  const s = row.stats;
  if (s.gp < scale(20)) return -1;
  return (
    perGame(s, "stl") * 3.2 +
    perGame(s, "blk") * 3.5 +
    perGame(s, "dreb") * 0.35 +
    perGame(s, "reb") * 0.15 +
    (row.ovr || 70) * 0.02
  );
}

/** 2K-like season awards. */
export function computeAwards(st) {
  const gpScale = (n) => scaleGames(n, st);
  const rows = Object.values(st.playerSeason);
  const scored = rows
    .map((row) => {
      const rec = st.standings[row.teamId] || { w: 0, l: 0 };
      const gp = rec.w + rec.l;
      return {
        row,
        mvp: mvpScore(row, rec.w, gp, gpScale),
        dpoy: dpoyScore(row, gpScale),
        teamW: rec.w,
        teamName: st.teams[row.teamId]?.name || row.teamId,
      };
    })
    .filter((x) => x.mvp >= 0 || x.dpoy >= 0);

  const byMvp = [...scored].sort((a, b) => b.mvp - a.mvp);
  const byDpoy = [...scored].sort((a, b) => b.dpoy - a.dpoy);

  const mvp = byMvp[0] || null;
  const dpoy = byDpoy[0] || null;

  // All-NBA: take top by mvp score into 3 teams of 5 (prefer position diversity lightly)
  const allNbaPool = byMvp.slice(0, 40);
  const allNba = [[], [], []];
  const used = new Set();
  for (let team = 0; team < 3; team++) {
    for (const slot of ["PG", "SG", "SF", "PF", "C"]) {
      const pick =
        allNbaPool.find((x) => {
          if (used.has(x.row.playerId)) return false;
          const pos = String(x.row.pos || "SF").toUpperCase();
          return pos === slot;
        }) || allNbaPool.find((x) => !used.has(x.row.playerId));
      if (pick) {
        used.add(pick.row.playerId);
        allNba[team].push(formatAwardPlayer(pick));
      }
    }
  }

  // Sixth Man: high production, started < 50% of games played
  const sixth = [...scored]
    .filter((x) => x.row.stats.gp >= gpScale(20) && x.row.stats.gs / x.row.stats.gp < 0.5)
    .sort((a, b) => perGame(b.row.stats, "pts") - perGame(a.row.stats, "pts") || b.mvp - a.mvp)[0];

  // MIP: young-ish / mid OVR who produced above expectation
  const mip = [...scored]
    .filter((x) => x.row.stats.gp >= gpScale(25))
    .map((x) => {
      const expect = ((x.row.ovr || 70) - 60) * 0.55;
      const over = perGame(x.row.stats, "pts") + perGame(x.row.stats, "ast") * 0.5 - expect;
      const ageBonus = (x.row.age || 26) <= 24 ? 2 : (x.row.age || 26) <= 27 ? 1 : 0;
      return { ...x, mipScore: over + ageBonus };
    })
    .sort((a, b) => b.mipScore - a.mipScore)[0];

  // ROY: 真正新秀窗口——年龄≤22，且不能已是联盟顶级老将卡
  const roy = [...scored]
    .filter((x) => {
      if (x.row.stats.gp < gpScale(40)) return false;
      const age = x.row.age;
      if (age != null && age <= 22) return true;
      // 无年龄时：卡面赛季偏早且 OVR 未到超巨
      if (age == null && (x.row.ovr || 99) <= 82 && (x.row.season || 0) >= 2015) return true;
      return false;
    })
    .sort((a, b) => b.mvp - a.mvp)[0];

  // COTY: coach of best record (simplified — team wins)
  const cotyTeam = standingsList(st)[0];
  const cotyCoach = cotyTeam ? st.teams[cotyTeam.id]?.coach : null;

  // All-Defense: top DPOY scores
  const allDef = byDpoy.slice(0, 10).map(formatAwardPlayer);

  // Scoring / reb / ast titles
  const scoringChamp = [...scored].sort(
    (a, b) => perGame(b.row.stats, "pts") - perGame(a.row.stats, "pts")
  )[0];
  const rebChamp = [...scored].sort(
    (a, b) => perGame(b.row.stats, "reb") - perGame(a.row.stats, "reb")
  )[0];
  const astChamp = [...scored].sort(
    (a, b) => perGame(b.row.stats, "ast") - perGame(a.row.stats, "ast")
  )[0];

  const awards = {
    mvp: mvp ? formatAwardPlayer(mvp) : null,
    dpoy: dpoy ? formatAwardPlayer(dpoy) : null,
    sixthMan: sixth ? formatAwardPlayer(sixth) : null,
    mip: mip ? formatAwardPlayer(mip) : null,
    roy: roy ? formatAwardPlayer(roy) : null,
    coty: cotyCoach
      ? { name: cotyCoach.name, teamId: cotyTeam.id, teamName: cotyTeam.name, w: cotyTeam.w, l: cotyTeam.l }
      : null,
    allNba: {
      first: allNba[0],
      second: allNba[1],
      third: allNba[2],
    },
    allDefense: { first: allDef.slice(0, 5), second: allDef.slice(5, 10) },
    scoringChamp: scoringChamp ? formatAwardPlayer(scoringChamp) : null,
    rebChamp: rebChamp ? formatAwardPlayer(rebChamp) : null,
    astChamp: astChamp ? formatAwardPlayer(astChamp) : null,
  };
  // Awards are honours only. They used to hand out a free skill, which snowballed the
  // strongest players; skills now come from 领悟 and 技能碎片 only.
  st.awards = awards;
  return awards;
}

function formatAwardPlayer(x) {
  const s = x.row.stats;
  return {
    playerId: x.row.playerId,
    name: x.row.name,
    teamId: x.row.teamId,
    teamName: x.teamName || x.row.teamId,
    pos: x.row.pos,
    gp: s.gp,
    ppg: +perGame(s, "pts").toFixed(1),
    rpg: +perGame(s, "reb").toFixed(1),
    apg: +perGame(s, "ast").toFixed(1),
    spg: +perGame(s, "stl").toFixed(1),
    bpg: +perGame(s, "blk").toFixed(1),
  };
}

/** Seed playoffs: top 8 each conference (or as many as available), best-of-7. */
export function startPlayoffs(st) {
  const padSeeds = (list, tag) => {
    const seeds = list.slice(0, 8);
    let i = 0;
    while (seeds.length < 8) {
      seeds.push({
        id: `__bye_${tag}_${i++}`,
        name: "轮空",
        pct: -1,
        bye: true,
      });
    }
    return seeds;
  };
  const east = padSeeds(standingsList(st, "East"), "e");
  const west = padSeeds(standingsList(st, "West"), "w");
  const bracket = (seeds) => {
    // 1v8, 4v5, 2v7, 3v6
    const order = [
      [0, 7],
      [3, 4],
      [1, 6],
      [2, 5],
    ];
    return order.map(([i, j], idx) => {
      const high = seeds[i];
      const low = seeds[j];
      const byeWin = !!(high?.bye || low?.bye);
      return {
        id: `r1-${idx}`,
        round: 1,
        high,
        low,
        winsHigh: byeWin && !high?.bye ? 4 : byeWin && high?.bye ? 0 : 0,
        winsLow: byeWin && high?.bye ? 4 : 0,
        done: byeWin,
        winnerId: byeWin ? (high?.bye ? low.id : high.id) : null,
        winnerName: byeWin
          ? high?.bye
            ? low.name
            : high.name
          : null,
      };
    });
  };
  st.phase = "playoffs";
  st.playoffs = {
    east: { round: 1, series: bracket(east), finalist: null },
    west: { round: 1, series: bracket(west), finalist: null },
    finals: null,
    championId: null,
  };
  return st.playoffs;
}

function seriesHomeAway(highId, lowId, gameIndex) {
  // 2-2-1-1-1: high home in 1,2,5,7
  const highHome = [true, true, false, false, true, false, true];
  return highHome[gameIndex] ? { homeId: highId, awayId: lowId } : { homeId: lowId, awayId: highId };
}

/** Home/away of the NEXT game of a series (2-2-1-1-1), for the page to say where tonight's game is. */
export const nextSeriesHomeAway = (series) => seriesHomeAway(series.high.id, series.low.id, series.winsHigh + series.winsLow);

/**
 * Sim whatever is left of a series. `onUserGame(snap, game, series)` is called once for each game the USER's
 * team plays inside this call, right after it is decided. The box score used to be made and thrown away here,
 * which is why a bulk playoff sim paid the user no XP, epiphany, buzz or coach XP; the caller settles them.
 */
export function simPlayoffSeries(st, series, { onUserGame } = {}) {
  if (series.done && series.winnerId) return series;
  if (series.high?.bye || series.low?.bye) {
    series.done = true;
    series.winnerId = series.high?.bye ? series.low.id : series.high.id;
    series.winnerName =
      st.teams[series.winnerId]?.name || seasonLabelOf(st, series.winnerId);
    if (series.high?.bye) series.winsLow = 4;
    else series.winsHigh = 4;
    return series;
  }
  while (!series.done) simSeriesOneGame(st, series, { onUserGame });
  return series;
}

/** Record one decided game on its series: the running score, the game log shown on the page, and the winner. */
function recordSeriesGame(st, series, { homeId, awayId, homeScore, awayScore }) {
  const winnerId = homeScore > awayScore ? homeId : awayId;
  if (winnerId === series.high.id) series.winsHigh += 1;
  else series.winsLow += 1;
  (series.games ||= []).push({ homeId, awayId, homeScore, awayScore, winnerId });
  if (series.winsHigh >= 4 || series.winsLow >= 4) {
    series.done = true;
    series.winnerId = series.winsHigh >= 4 ? series.high.id : series.low.id;
    series.winnerName = st.teams[series.winnerId]?.name || seasonLabelOf(st, series.winnerId);
  }
  return winnerId;
}

/**
 * Play exactly ONE more game of a CPU-or-user series (quick sim) and apply it. The single primitive behind
 * every non-live playoff game, so "sim the series", "one playoff day" and a CPU Finals stepped game by game
 * all score, log and finish a series the same way. Resumes from the games already on the board.
 */
export function simSeriesOneGame(st, series, { onUserGame } = {}) {
  if (!series || series.done) return null;
  if (series.high?.bye || series.low?.bye) {
    simPlayoffSeries(st, series);
    return null;
  }
  const gi = series.winsHigh + series.winsLow;
  const { homeId, awayId } = seriesHomeAway(series.high.id, series.low.id, gi);
  const game = { homeId, awayId, played: false, result: null };
  const snap = simScheduledGame(st, game, { recordStandings: false });
  if (st.playoffs && series === st.playoffs.finals) {
    st.finalsBoard = accumulateGameToAllTeamBoard(
      st.finalsBoard || {},
      snap,
      { id: homeId, name: st.teams[homeId]?.name },
      { id: awayId, name: st.teams[awayId]?.name },
    );
  }
  recordSeriesGame(st, series, { homeId, awayId, homeScore: snap.score.home, awayScore: snap.score.away });
  if (series.done && st.playoffs && series === st.playoffs.finals) finalizeFinals(st);
  if (onUserGame && (homeId === st.userTeamId || awayId === st.userTeamId)) onUserGame(snap, game, series);
  return { game, snap, series };
}

/** Every playoff series still open, in bracket order (East, West, Finals). */
export function openSeries(st) {
  const po = st?.playoffs;
  if (!po) return [];
  return [...(po.east?.series || []), ...(po.west?.series || []), ...(po.finals ? [po.finals] : [])].filter((x) => !x.done);
}

/**
 * One playoff NIGHT: every open series plays its next game at the same time, like the real thing. `skip` is the
 * series whose game was just played some other way (the user's live game), so it is not played twice.
 */
export function simPlayoffDay(st, { skip = null, onUserGame } = {}) {
  const played = [];
  for (const series of openSeries(st)) {
    if (series === skip) continue;
    const r = simSeriesOneGame(st, series, { onUserGame });
    if (r) played.push(r);
  }
  return played;
}

/** When the champion is known: crown them, end the season, and judge the Finals awards from the Finals alone. */
export function finalizeFinals(st) {
  const finals = st?.playoffs?.finals;
  if (!finals?.done) return;
  st.playoffs.championId = finals.winnerId;
  st.phase = "done";
  st.finalsMvp = computeFinalsMvp(st);
  st.finalsAllTeam = computeFinalsAllTeam(st);
}

/** Both conference champions known and no Finals yet: set the Finals up (0-0) so it can be played game by game. */
export function ensureFinals(st) {
  const po = st?.playoffs;
  if (!po || po.finals || !po.east?.finalist || !po.west?.finalist) return po?.finals || null;
  const e = standingsList(st, "East").find((x) => x.id === po.east.finalist) || { id: po.east.finalist, pct: 0 };
  const w = standingsList(st, "West").find((x) => x.id === po.west.finalist) || { id: po.west.finalist, pct: 0 };
  const high = e.pct >= w.pct ? e : w;
  const low = high.id === e.id ? w : e;
  po.finals = { id: "finals", round: 4, high, low, winsHigh: 0, winsLow: 0, done: false, winnerId: null, games: [] };
  return po.finals;
}

/** The user's current, still-undecided playoff series, or null (eliminated / not yet in one / playoffs over). */
export function activeUserPlayoffSeries(st) {
  const po = st?.playoffs;
  if (!po || st.phase !== "playoffs") return null;
  const blocks = [po.east, po.west, po.finals ? { series: [po.finals] } : null].filter(Boolean);
  for (const block of blocks) {
    for (const s of block.series || []) {
      if (s.done) continue;
      if (s.high?.id === st.userTeamId || s.low?.id === st.userTeamId) return s;
    }
  }
  return null;
}

/** Next game (home/away + series) the user still has to play this round, or null. */
export function nextUserPlayoffGame(st) {
  const series = activeUserPlayoffSeries(st);
  if (!series) return null;
  const gameIndex = series.winsHigh + series.winsLow;
  if (gameIndex >= 7) return null; // shouldn't happen -- someone should already have 4 wins by then
  const { homeId, awayId } = seriesHomeAway(series.high.id, series.low.id, gameIndex);
  return { series, gameIndex, homeId, awayId };
}

/**
 * Applies ONE already-decided game's result onto its series (winsHigh/winsLow, done, winnerId),
 * and -- only for the finals -- the same championship bookkeeping advancePlayoffs() does when it
 * resolves the finals in one shot (st.phase -> "done", finals All-Team). Round-to-round reseeding
 * (R1 -> R2 -> R3) stays exclusively advancePlayoffs()'s job: once the user's own series is done,
 * clicking 模拟下一轮/一键打完季后赛 resolves whatever CPU-vs-CPU series are still open in the same
 * block and reseeds normally -- simPlayoffSeries() already no-ops on a series that's done.
 */
function finishPlayoffGame(st, series, game, snap) {
  // R89: Finals games accumulate onto a series-only board (not season totals),
  // so the Finals MVP is judged on Finals performance alone.
  if (series === st.playoffs.finals) {
    const gameSnap = snap || game._lastSnap;
    if (gameSnap) {
      st.finalsBoard = accumulateGameToAllTeamBoard(
        st.finalsBoard || {},
        gameSnap,
        { id: game.homeId, name: st.teams[game.homeId]?.name },
        { id: game.awayId, name: st.teams[game.awayId]?.name },
      );
    }
  }
  recordSeriesGame(st, series, {
    homeId: game.homeId,
    awayId: game.awayId,
    homeScore: game.result.homeScore,
    awayScore: game.result.awayScore,
  });
  if (series.done && series === st.playoffs.finals) finalizeFinals(st);
  // The rest of the league plays tonight too: every other open series gets its next game, so the other
  // conference is not frozen at 0-0 while you play yours.
  simPlayoffDay(st, { skip: series });
}

/** Quick-sim exactly one game of the user's active series (no live court, just the box score). */
export function simUserNextPlayoffGame(st) {
  const info = nextUserPlayoffGame(st);
  if (!info) return null;
  const { series, homeId, awayId } = info;
  const game = { homeId, awayId, played: false, result: null };
  const snap = simScheduledGame(st, game, { recordStandings: false });
  finishPlayoffGame(st, series, game, snap);
  return { game, snap, series };
}

/** Records a manually-played (亲自指挥 live court) playoff game's result onto its series. Matches
 * the quick-sim path above: recordLog:false, since playoff games aren't stored for schedule
 * replay the way regular-season games are (simPlayoffSeries never has, either). */
export function recordUserLivePlayoffResult(st, game, series, snap) {
  if (!game || game.played || !series) return;
  applyGameResult(st, game, snap, { recordStandings: false, recordLog: false });
  finishPlayoffGame(st, series, game, snap);
}

export function advancePlayoffs(st, opts = {}) {
  if (!st.playoffs) startPlayoffs(st);
  const po = st.playoffs;

  const advanceConf = (conf) => {
    const block = po[conf];
    for (const s of block.series) {
      if (!s.done) simPlayoffSeries(st, s, opts);
    }
    if (block.round === 1) {
      const winners = block.series.map((s) => {
        const id = s.winnerId;
        const seed = s.high.id === id ? s.high : s.low;
        return { ...seed, id };
      });
      // Re-seed by original standing pct
      winners.sort((a, b) => b.pct - a.pct);
      block.round = 2;
      block.series = [
        {
          id: "sf-0",
          round: 2,
          high: winners[0],
          low: winners[3],
          winsHigh: 0,
          winsLow: 0,
          done: false,
          winnerId: null,
        },
        {
          id: "sf-1",
          round: 2,
          high: winners[1],
          low: winners[2],
          winsHigh: 0,
          winsLow: 0,
          done: false,
          winnerId: null,
        },
      ];
      return false;
    }
    if (block.round === 2) {
      for (const s of block.series) if (!s.done) simPlayoffSeries(st, s);
      const winners = block.series.map((s) => {
        const id = s.winnerId;
        return s.high.id === id ? s.high : s.low;
      });
      winners.sort((a, b) => b.pct - a.pct);
      block.round = 3;
      block.series = [
        {
          id: "cf",
          round: 3,
          high: winners[0],
          low: winners[1],
          winsHigh: 0,
          winsLow: 0,
          done: false,
          winnerId: null,
        },
      ];
      return false;
    }
    if (block.round === 3) {
      for (const s of block.series) if (!s.done) simPlayoffSeries(st, s);
      block.finalist = block.series[0].winnerId;
      return true;
    }
    return !!block.finalist;
  };

  // Both conferences move together, one round per call -- the old code finished the whole East bracket
  // before the West played a single game.
  const pending = ["east", "west"].filter((c) => !po[c].finalist);
  for (const conf of pending) advanceConf(conf);
  if (pending.length) {
    ensureFinals(st); // as soon as both champions are known the Finals is set up (0-0), NOT auto-played
    return st.playoffs;
  }
  if (!ensureFinals(st)?.done) {
    simPlayoffSeries(st, po.finals, opts);
    finalizeFinals(st);
  }
  return st.playoffs;
}

/**
 * 总决赛后最佳阵容 PG→C。Judged on the Finals-only board -- the same numbers the Finals MVP is judged on (it used
 * to rank the two teams' SEASON totals, so the MVP could be missing from the All-Team). The MVP is locked in at his
 * own position. Saves whose Finals predate the board fall back to season rows (with their cards' real positions).
 */
export function computeFinalsAllTeam(st) {
  const finals = st?.playoffs?.finals;
  if (!finals) return [];
  const ids = [finals.high?.id, finals.low?.id].filter(Boolean);
  const board = Object.values(st.finalsBoard || {}).filter((r) => r.gp > 0 && ids.includes(r.teamId));
  const mvpId = st.playoffs.championId ? selectFinalsMvp(board, st.playoffs.championId)?.id : null;
  let team;
  if (board.length) {
    team = selectAllTeamByPos(board, { lockId: mvpId });
  } else {
    const rows = Object.values(st.playerSeason || {}).map((r) => ({ ...r, teamName: st.teams[r.teamId]?.name || r.teamId }));
    team = allTeamFromSeasonRows(rows, ids);
  }
  st.finalsAllTeam = team;
  return team;
}

/**
 * R89 Finals MVP: champion team's best performer on the Finals-only board
 * (accumulated in finishPlayoffGame / simSeriesOneGame). Falls back to the best
 * champion-team entry of the Finals All-Team for saves whose Finals predate the
 * board (their Finals games were never accumulated). Null when there is no
 * champion or no candidate at all.
 */
export function computeFinalsMvp(st) {
  const championId = st?.playoffs?.championId;
  if (!championId) return null;
  const fromBoard = selectFinalsMvp(st.finalsBoard, championId);
  if (fromBoard) return fromBoard;
  const team = st.finalsAllTeam || [];
  const fromTeam = team.filter((p) => p.teamId === championId);
  if (!fromTeam.length) return null;
  return fromTeam.slice().sort((a, b) => (b.score || 0) - (a.score || 0))[0] || null;
}

/** Sim entire playoffs in one go. `opts.onUserGame` is passed down to every series (see simPlayoffSeries). */
export function simAllPlayoffs(st, opts = {}) {
  if (st.phase === "awards" || st.phase === "regular") {
    if (!st.awards) st.awards = computeAwards(st);
    startPlayoffs(st);
  }
  let guard = 0;
  while (st.phase !== "done" && guard++ < 40) {
    advancePlayoffs(st, opts);
  }
  return st;
}

export const hasSeasonSave = () => keyHasData(SAVE_KEY);
/** opts.release: the player explicitly confirmed deleting an unassociated quick season. */
export const seasonSlotLocked = (opts) => slotLocked("season", hasSeasonSave(), undefined, opts);

/**
 * `mirror`: the long-career compat copy (the root save is the real one). It still never overwrites another
 * account's quick season, but it doesn't claim the slot either.
 */
export function saveSeason(st, { mirror = false } = {}) {
  if (seasonSlotLocked()) return false; // P0: another account's quick season lives here
  const owned = () => { if (mirror) recordMirrorWrite("season"); else recordSaveWrite("season", seasonSig(st)); return true; };
  try {
    compactSeasonForSave(st);
    localStorage.setItem(SAVE_KEY, JSON.stringify(st));
    return owned();
  } catch {
    // Quota: strip older boxes and retry once
    try {
      compactSeasonForSave(st, { dropBoxes: true });
      localStorage.setItem(SAVE_KEY, JSON.stringify(st));
      return owned();
    } catch {
      return false;
    }
  }
}

/**
 * Drop what must never be persisted, in place. Every played game keeps its full live snapshot (`_lastSnap`): a few
 * games of that is megabytes and blows the ~5 MB quota (measured: 0.7 MB fresh -> 6.4 MB after five games).
 * `dropBoxes` is the quota fallback: the per-game box scores in resultsLog go too.
 * Shared by every season save slot (quick season, My Team season) so they can't drift apart.
 */
export function compactSeasonForSave(st, { dropBoxes = false } = {}) {
  if (dropBoxes) for (const r of st?.resultsLog || []) delete r.box;
  if (Array.isArray(st?.schedule)) {
    for (const night of st.schedule) {
      for (const g of night || []) {
        if (g && "_lastSnap" in g) delete g._lastSnap;
      }
    }
  }
  return st;
}

export function loadSeason() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const st = JSON.parse(raw);
    if (!st || (st.v !== 1 && st.v !== SEASON_VERSION)) return null;
    return prepareSeasonState(st);
  } catch {
    return null;
  }
}

export function clearSeasonSave({ release = false } = {}) {
  try {
    if (seasonSlotLocked({ release })) return false;
    localStorage.removeItem(SAVE_KEY);
    clearSaveOwner("season");
  } catch (err) {
    console.error("[season] clearSeasonSave failed", err);
  }
}

export function seasonProgressLabel(st, lang = "zh") {
  if (!st) return "";
  const en = lang === "en";
  const era =
    st.mode === "historical" && st.league?.yearLabel
      ? `${st.league.yearLabel}`
      : `${st.year}`;
  if (st.phase === "done") {
    const champ = st.teams[st.playoffs?.championId]?.name || "—";
    return en ? `${era} season over · champions ${champ}` : `${era} 赛季结束 · 冠军 ${champ}`;
  }
  if (st.phase === "playoffs") return en ? `${era} playoffs in progress` : `${era} 季后赛进行中`;
  if (st.phase === "awards") return en ? `${era} regular season over · awards` : `${era} 常规赛结束 · 评奖`;
  const rec = st.standings[st.userTeamId];
  const played = userGamesPlayed(st);
  return en
    ? `${st.teams[st.userTeamId]?.name || "Your team"} ${rec?.w || 0}-${rec?.l || 0} · ${played}/${seasonGames(st)} played`
    : `${st.teams[st.userTeamId]?.name || "我方"} ${rec?.w || 0}胜${rec?.l || 0}负 · 已打 ${played}/${seasonGames(st)}`;
}

/**
 * After Finals: age every roster along historical career curves, then open a new 82-game year.
 */
export function advanceLeagueOffseason(st, options = {}) {
  if (!st || st.phase !== "done") {
    return { ok: false, reason: "需先打完总决赛才能进入休赛期" };
  }
  if (
    options.seed !== undefined &&
    !Number.isInteger(options.seed)
  ) {
    return { ok: false, reason: "offseason seed must be a finite integer" };
  }
  const nextSeed =
    options.seed === undefined
      ? nextOffseasonSeed(st.seed, st.year)
      : Number(options.seed) >>> 0;
  const developLog = developLeagueRosters(st, {
    rng: mulberry32(nextSeed ^ 0x243f6a88),
    developmentPlans:
      options.developmentPlans === undefined ? {} : options.developmentPlans,
    growth: options.growth === undefined ? {} : options.growth,
  });
  st.year = Number(st.year) + 1;
  // The calendar rolls with the year: picks for the draft that just happened are used up, and last
  // year's trade offers (which may mention them) no longer apply.
  prunePickLedger(st);
  delete st.tradeProposals;
  if (st.mode === "historical") {
    const hist = historicalSeason(st.year);
    if (hist && st.league) {
      st.league.yearLabel = hist.label;
      st.league.championId = hist.championId;
      st.league.championName = hist.championName;
      st.league.blurb = hist.blurb;
    }
  }
  st.seed = nextSeed;
  st.phase = "regular";
  st.dayIndex = 0;
  st.awards = null;
  st.playoffs = null;
  st.playerSeason = {};
  // Market buzz is a this-season thing (C4): a new year starts with nobody hot and no offers priced on it.
  delete st.buzz;
  delete st.tradeProposalsBuzz;
  // Finals board is a this-season thing too: it accumulates with `|| {}`, so
  // without this, last year's Finals games would leak into next year's Finals
  // MVP race. (The MVP itself is already captured into the season summary and
  // recomputed at each Finals, so dropping the board here loses nothing.)
  delete st.finalsBoard;
  st.resultsLog = [];
  st.tradeLog = Array.isArray(st.tradeLog) ? st.tradeLog : [];
  st.schedule = generateSchedule(seasonTeamIds(st), st.seed, {
    eastIds: seasonEastIds(st),
    westIds: seasonWestIds(st),
    confById: st.league?.confById,
  });
  st.standings = Object.fromEntries(
    seasonTeamIds(st).map((id) => [
      id,
      {
        w: 0,
        l: 0,
        pf: 0,
        pa: 0,
        conf: seasonConferenceOf(st, id),
        streak: 0,
        last10: [],
      },
    ])
  );
  hydrateSeasonSalaries(st);
  refreshFreeAgency(st, {
    force: true,
    rng: mulberry32(nextSeed ^ 0x85a308d3),
  });
  refreshStaffMarket(st, {
    force: true,
    rng: mulberry32(nextSeed ^ 0x13198a2e),
  });
  st.offseasonLog = developLog;
  return { ok: true, log: developLog, year: st.year };
}

export { RS_GAMES, EAST_IDS, WEST_IDS };
