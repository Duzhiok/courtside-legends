// Player Reborn across several consecutive real seasons: the multi-season regression. No browser: this is the real pipeline
// (createRebornState -> buildSeason -> playGame -> rolloverSeason, the exact calls the Reborn screen makes), with fixed seeds.
//
// It checks what a year bug and a roster bug would break, not just that `player.seasonYear` moves:
//   A. the year advances one season at a time, in the season, the player, the timeline and every game id
//   B. each new season opens at 0 played games (resume count from the season log, as the UI does), never "N/N"; each ends at exactly its schedule length
//      (82 for almost every team; the schedule generator leaves ~2% of team-seasons at 76-80, which is reported, not assumed away)
//   C. game ids are unique across seasons and have the shape game:<seed>:<year>:<n>, n = 1..82
//   D. every game is a real game (a void game is 0-0 against an empty roster): both teams score, the opponent has a full roster of THAT season
//      (card ids carry the year), the schedule changes year to year
//   E. later seasons really settle: every direct matchup lands in the rivalry ledger, and fragments, jersey offers and the promise evidence point at real, unique game ids
//   F. save mid-season-2, reload, finish: the result is identical to the uninterrupted run
//   G. an old save without player.seasonYear still plays its first season
//
// Usage: node scripts/qa/reborn-multiseason.mjs [seeds=4] [seasons=3]
import { readFileSync } from "node:fs";
import { createRebornState, REBORN_TEAM_IDS } from "../../js/reborn/identity.js";
import { buildSeason, playGame, rosterCards } from "../../js/reborn/season.js";
import { rolloverSeason } from "../../js/reborn/contract.js";
import { collectEvidence, evidenceWindow } from "../../js/reborn/promiseEvidence.js";
import { jerseyState } from "../../js/collectibles/jerseyExchange.js";
import { MAX_ACTIVE_RIVALS, directMatchup, rivalryLedger } from "../../js/reborn/rivalry.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const SEEDS = Number(process.argv[2]) || 4;
const SEASONS = Number(process.argv[3]) || 3;
const takeover = ({ playerId }) => ({ shooterId: playerId, actionHint: "attack" });
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);
};

/** What the Reborn screen does to resume: the games of this year already in the log. */
const resumeIndex = (reborn, year) => (reborn.player.seasonLog || []).filter((g) => g.year === year).length;
const freshRun = (seed) => { const r = createRebornState(seed, ROWS); r.player.coachTrust = 80; return r; };

/** Play one season to the end. `stopAt` returns the state after that many games (for the save/reload test). */
async function playSeason(reborn, { stopAt = null, onGame = null } = {}) {
  const season = buildSeason(reborn, ROWS);
  season.index = resumeIndex(reborn, season.year);
  let state = reborn;
  while (season.index < season.games.length) {
    if (stopAt !== null && season.index >= stopAt) return { reborn: state, season };
    const out = await playGame(state, season, ROWS, { onTakeover: takeover });
    if (!out) break;
    state = out.reborn;
    if (onGame) onGame(out.report, season, state);
  }
  return { reborn: state, season };
}

const totals = { games: 0, voidGames: 0, fragmentEntries: { later: 0, first: 0 }, offers: { later: 0, first: 0 }, direct: { later: 0, first: 0 }, directMissed: 0, shortSchedules: [] };

for (let s = 1; s <= SEEDS; s += 1) {
  const seed = `multiseason-${s}`;
  let reborn = freshRun(seed);
  const startYear = reborn.startYear;
  const seasonOrders = [];
  const careerIds = [];
  const problems = [];
  for (let no = 1; no <= SEASONS; no += 1) {
    const expectYear = startYear + no;
    const opening = buildSeason(reborn, ROWS);
    if (opening.year !== expectYear) problems.push(`season ${no} year ${opening.year}, wanted ${expectYear}`);
    if (reborn.player.seasonYear !== expectYear) problems.push(`player.seasonYear ${reborn.player.seasonYear}, wanted ${expectYear}`);
    if (resumeIndex(reborn, expectYear) !== 0) problems.push(`season ${no} opens with ${resumeIndex(reborn, expectYear)} games already logged (premature completion)`);
    for (const id of REBORN_TEAM_IDS) if (rosterCards(ROWS, id, expectYear).length < 8) problems.push(`${expectYear}: ${id} has no full roster`);
    seasonOrders.push(opening.games.map((g) => `${g.homeId}-${g.awayId}`).join(","));
    const length = opening.games.length;
    if (length !== 82) totals.shortSchedules.push(`${seed} ${expectYear} ${reborn.player.teamId}: ${length}`);
    const orderOf = [];
    const { reborn: after, season } = await playSeason(reborn, {
      onGame: (report, _season, afterState) => {
        totals.games += 1;
        careerIds.push(report.gameId);
        orderOf.push(report.game);
        if (report.year !== expectYear) problems.push(`${report.gameId}: report year ${report.year}`);
        if (report.gameId !== `game:${seed}:${expectYear}:${report.game}`) problems.push(`odd game id ${report.gameId}`);
        // A void game is what an empty roster produced: nobody scores, nobody plays (0-0). Low real scores are not void: the sim does produce 53, 56, 58
        // and, rarely, 37 (2001 CHI), which is a balance observation and not a data fault.
        const void_ = !(report.score.home >= 20 && report.score.away >= 20) || (report.opponents || []).length < 8 || !(report.opponents || []).every((p) => p.id.includes(`-${expectYear}-`));
        if (void_) { totals.voidGames += 1; problems.push(`${report.gameId} vs ${report.opp}: not a real game (score ${JSON.stringify(report.score)}, ${report.opponents?.length} opposing cards)`); }
        // E. rivalry: a direct matchup in a game must be on the ledger afterwards (watch list, or a rival's meetings), whichever season it is
        const opp = directMatchup(report);
        if (opp) {
          const led = rivalryLedger(afterState);
          const recorded = led.watch[opp.bref]?.lastGameId === report.gameId
            || led.rivals.some((r) => r.bref === opp.bref && (r.since?.gameId === report.gameId || r.games.some((g) => g.gameId === report.gameId)))
            || led.rivals.length >= MAX_ACTIVE_RIVALS;                       // the ledger is full: no new person is added, existing rivals still record
          totals.direct[expectYear > startYear + 1 ? "later" : "first"] += 1;
          if (!recorded) { totals.directMissed += 1; problems.push(`${report.gameId}: direct matchup ${opp.bref} is not in the rivalry ledger`); }
        }
      },
    });
    if (resumeIndex(after, expectYear) !== length || season.index !== length) problems.push(`season ${no} ended at ${resumeIndex(after, expectYear)} logged / index ${season.index}, schedule ${length}`);
    if (orderOf.some((g, i) => g !== i + 1)) problems.push(`season ${no} game numbers are not 1..${length}`);
    reborn = rolloverSeason(after, { year: season.year, players: ROWS }).reborn;
  }

  check(`[${seed}] A. ${SEASONS} consecutive seasons ${startYear + 1}..${startYear + SEASONS}; every game is real, id-correct, uses its own year's rosters and is recorded against rivals (${careerIds.length} games)`, problems.length === 0, problems.slice(0, 3).join(" | "));
  check(`[${seed}] B/C. every game id is unique across seasons`, careerIds.length > 0 && new Set(careerIds).size === careerIds.length, `${new Set(careerIds).size} unique of ${careerIds.length}`);
  check(`[${seed}] D. the schedule differs from season to season (not season 1 replayed)`, new Set(seasonOrders).size === SEASONS);
  const timelineYears = (reborn.timeline?.events || []).filter((e) => e.event === "season_start").map((e) => e.year);
  check(`[${seed}] A. the timeline records each season start in order`, timelineYears.join() === Array.from({ length: SEASONS }, (_, n) => startYear + 2 + n).join(), timelineYears.join(","));

  // E. settlement in later seasons, against the real ids
  const idSet = new Set(careerIds);
  const frag = reborn.player.fragments?.history || [];
  const fragIds = frag.map((h) => h.gameId).filter(Boolean);
  check(`[${seed}] E. fragment history: every entry is a real game, none twice`, fragIds.every((id) => idSet.has(id)) && new Set(fragIds).size === fragIds.length, `${fragIds.length} entries`);
  for (const id of fragIds) totals.fragmentEntries[id.split(":")[2] > startYear + 1 ? "later" : "first"] += 1;
  const ledger = rivalryLedger(reborn);
  const meetingIds = [...Object.values(ledger.watch).map((p) => p.lastGameId), ...ledger.rivals.flatMap((r) => [r.since?.gameId, ...r.games.map((g) => g.gameId)])].filter(Boolean);
  check(`[${seed}] E. rivalry ledger: every recorded meeting is a real game id (${Object.keys(ledger.watch).length} watched, ${ledger.rivals.length} rivals)`, meetingIds.every((id) => idSet.has(id)));
  for (const r of ledger.rivals) check(`[${seed}] E. rival ${r.bref}: no meeting is recorded twice`, new Set(r.games.map((g) => g.gameId)).size === r.games.length);
  const offers = jerseyState(reborn).offers || [];
  const offerGames = offers.map((o) => o.gameId || o.id?.replace(/^jersey-offer:/, "").replace(/:[^:]+$/, ""));
  check(`[${seed}] E. jersey offers: unique ids, each tied to a real game, at most 2 per season`, new Set(offers.map((o) => o.id)).size === offers.length && offerGames.every((g) => idSet.has(g)) && [...new Set(offerGames.map((g) => g.split(":")[2]))].every((y) => offerGames.filter((g) => g.split(":")[2] === y).length <= 2), `${offers.length} offers: ${offerGames.map((g) => g.split(":").slice(2).join("/")).join(" ")}`);
  for (const g of offerGames) totals.offers[Number(g.split(":")[2]) > startYear + 1 ? "later" : "first"] += 1;
  const evidence = collectEvidence(reborn, null);
  const gameEv = evidence.filter((e) => e.kind === "game");
  const window = evidenceWindow(evidence, reborn);
  check(`[${seed}] E. promise evidence: one record per game, unique ids, seasons ${startYear + 1}..${startYear + SEASONS}, and "now" is the last season`, gameEv.length === careerIds.length && new Set(gameEv.map((e) => e.evidenceId)).size === gameEv.length && [...new Set(gameEv.map((e) => e.seasonId))].join() === Array.from({ length: SEASONS }, (_, n) => startYear + 1 + n).join() && !!window, `window keys: ${Object.keys(window || {}).join(",")}`);
}

// F. save mid-season-2, reload, finish; identical to the uninterrupted run
{
  const seed = "multiseason-reload";
  const straight = async () => {
    let r = freshRun(seed);
    const first = await playSeason(r); r = rolloverSeason(first.reborn, { year: first.season.year, players: ROWS }).reborn;
    return (await playSeason(r)).reborn;
  };
  const interrupted = async () => {
    let r = freshRun(seed);
    const first = await playSeason(r); r = rolloverSeason(first.reborn, { year: first.season.year, players: ROWS }).reborn;
    const half = await playSeason(r, { stopAt: 41 });
    const reloaded = JSON.parse(JSON.stringify(half.reborn));                      // what a save and reload does
    check("[reload] F. after 41 games of season 2 the reloaded run resumes at game 42 of the right year", resumeIndex(reloaded, reloaded.player.seasonYear) === 41 && reloaded.player.seasonYear === reloaded.startYear + 2, `year ${reloaded.player.seasonYear}, ${resumeIndex(reloaded, reloaded.player.seasonYear)} logged`);
    return (await playSeason(reloaded)).reborn;
  };
  const a = await straight();
  const b = await interrupted();
  const digest = (r) => JSON.stringify({ log: r.player.seasonLog, frag: r.player.fragments, riv: r.rivalries, jer: jerseyState(r), trust: r.player.coachTrust, growth: r.player.growth });
  check("[reload] F. save + reload mid-season gives exactly the same season log, fragments, rivalries, jersey offers, trust and growth as playing straight through", digest(a) === digest(b), `${a.player.seasonLog.length} vs ${b.player.seasonLog.length} games`);
}

// G. an old save with no player.seasonYear still plays its first season
{
  const old = freshRun("multiseason-oldsave");
  delete old.player.seasonYear;
  const season = buildSeason(old, ROWS);
  check("[old save] G. a save without player.seasonYear falls back to startYear + 1 and plays", season.year === old.startYear + 1 && season.games.length >= 76, `year ${season.year}, ${season.games.length} games`);
  const out = await playGame(old, season, ROWS, { onTakeover: takeover });
  check("[old save] G. its first game is a real, correctly identified game", out.report.gameId === `game:multiseason-oldsave:${old.startYear + 1}:1` && out.report.score.home >= 60);
}

console.log(`\n${totals.games} real games over ${SEEDS} careers x ${SEASONS} seasons; void games: ${totals.voidGames}`);
console.log(`direct matchups checked against the rivalry ledger: season 1 ${totals.direct.first}, season 2+ ${totals.direct.later}; missed: ${totals.directMissed}`);
console.log(`settled in later seasons (season 2+): fragment entries ${totals.fragmentEntries.later} (season 1: ${totals.fragmentEntries.first}), jersey offers ${totals.offers.later} (season 1: ${totals.offers.first})`);
if (totals.shortSchedules.length) console.log(`schedules shorter than 82 (pre-existing generator behaviour): ${totals.shortSchedules.join("; ")}`);
console.log(failed ? `\n${failed} FAILED` : "\nall passed");
process.exit(failed ? 1 : 0);
