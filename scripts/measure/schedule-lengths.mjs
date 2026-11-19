/**
 * How many games does each team really get from generateSchedule? Measurement only.
 *
 * Contract (js/engine/season.js): every team plays exactly RS_GAMES (82), each team at most once per night, never itself.
 * Reports, for the Player Reborn layout (the 29 stable team ids, seeded the way buildSeason seeds it) and for the default league (My Team / GM):
 * the distribution of games per team, how many team-seasons are short or long, and how many schedules have any problem.
 *
 * Usage: node scripts/measure/schedule-lengths.mjs [seeds=40] [years=1997,1998,2002,2004,2005,2009,2014]
 */
import { generateSchedule, seasonGames } from "../../js/engine/season.js";
import { leagueLayout } from "../../js/reborn/franchises.js";
import { hashSeed } from "../../js/core/seededRandom.js";
const RS_GAMES = seasonGames({});   // the contract: 82

const SEEDS = Number(process.argv[2]) || 40;
const YEARS = (process.argv[3] || "1997,1998,2002,2004,2005,2009,2014").split(",").map(Number);

function audit(days, teamIds) {
  const games = Object.fromEntries(teamIds.map((id) => [id, 0]));
  const problems = [];
  days.forEach((night, d) => {
    const seen = new Set();
    for (const g of night) {
      if (g.homeId === g.awayId) problems.push(`night ${d + 1}: ${g.homeId} plays itself`);
      for (const id of [g.homeId, g.awayId]) {
        if (!(id in games)) { problems.push(`unknown team ${id}`); continue; }
        if (seen.has(id)) problems.push(`night ${d + 1}: ${id} plays twice`);
        seen.add(id);
        games[id] += 1;
      }
    }
  });
  return { games, problems };
}

function report(label, make, teamIdsOf) {
  const hist = {}; let schedules = 0, bad = 0, teamSeasons = 0;
  const examples = [];
  for (const run of make()) {
    const { games, problems } = audit(run.days, typeof teamIdsOf === "function" ? teamIdsOf(run) : teamIdsOf);
    schedules += 1;
    let schedBad = problems.length > 0;
    for (const [id, n] of Object.entries(games)) {
      hist[n] = (hist[n] || 0) + 1; teamSeasons += 1;
      if (n !== RS_GAMES) { schedBad = true; if (examples.length < 4) examples.push(`${run.tag} ${id}:${n}`); }
    }
    if (schedBad) bad += 1;
  }
  const keys = Object.keys(hist).map(Number).sort((a, b) => a - b);
  console.log(`${label}: ${schedules} schedules, ${teamSeasons} team-seasons | games per team: ${keys.map((k) => `${k}:${hist[k]}`).join("  ")} | schedules with any problem: ${bad} (${((100 * bad) / schedules).toFixed(1)}%) | team-seasons not ${RS_GAMES}: ${teamSeasons - (hist[RS_GAMES] || 0)} (${((100 * (teamSeasons - (hist[RS_GAMES] || 0))) / teamSeasons).toFixed(1)}%)`);
  if (examples.length) console.log(`   e.g. ${examples.join(", ")}`);
}

report("Reborn league of the season (29 clubs, 30 from 2005)", function* () {
  for (let s = 0; s < SEEDS; s += 1) for (const year of YEARS) {
    const league = leagueLayout(year);
    yield { tag: `s${s}/${year}`, teams: league.teamIds, days: generateSchedule(league.teamIds, hashSeed(`measure-${s}|${year}`), { eastIds: league.eastIds, westIds: league.westIds, confById: league.confById }) };
  }
}, (run) => run.teams);

report("default league (My Team / GM)", function* () {
  for (let s = 0; s < SEEDS * 3; s += 1) yield { tag: `s${s}`, days: generateSchedule(undefined, 1000 + s) };
}, (() => { const days = generateSchedule(undefined, 1); return [...new Set(days.flat().flatMap((g) => [g.homeId, g.awayId]))]; })());
