/**
 * Complete a schedule so every team plays exactly `target` games.
 *
 * buildMatchupPairs pads each team's quota with random pairings and gives up when a single team is still short (nobody left to pair with):
 * measured, 59% of Reborn schedules and 37% of the default league's had a team stuck at 74-80 games.
 *
 * This runs AFTER the base schedule and only ever adds to its end, so a schedule that was already complete is returned unchanged and an in-progress save
 * (the schedule is regenerated from seed|year on every load) keeps every game it already had in the same night:
 *  - two or more teams short: the two with the largest gap play each other (Havel-Hakimi style for a multigraph, needs no randomness);
 *  - exactly one team short (by an even number): take back the LATEST game between two other teams, X-Y, and give the short team X-A and Y-A.
 *    X and Y still play the same number of games; only the short team gains.
 * The new games go into extra nights at the end, each team at most once a night, home to whoever has hosted fewer.
 *
 * Pure: the input nights are not mutated.
 */
export function completeSchedule(days, teamIds, target) {
  const count = Object.fromEntries(teamIds.map((id) => [id, 0]));
  const hosted = { ...count };
  const nights = days.map((night) => night.slice());
  for (const night of nights) {
    for (const g of night) {
      if (g.homeId in count) { count[g.homeId] += 1; hosted[g.homeId] += 1; }
      if (g.awayId in count) count[g.awayId] += 1;
    }
  }
  const short = () => teamIds.filter((id) => count[id] < target).sort((a, b) => (count[a] - count[b]) || (teamIds.indexOf(a) - teamIds.indexOf(b)));
  const extra = []; // [a, b]
  for (let guard = 0; guard < 2000; guard += 1) {
    const hungry = short();
    if (!hungry.length) break;
    if (hungry.length >= 2) {
      const [a, b] = hungry;
      extra.push([a, b]); count[a] += 1; count[b] += 1;
      continue;
    }
    const a = hungry[0];
    const taken = takeBackLatestGameWithout(nights, a);
    if (!taken) break;                                  // nothing to rewire (a league too small to need it)
    hosted[taken.homeId] -= 1;
    extra.push([a, taken.homeId], [a, taken.awayId]);
    count[a] += 2;
  }
  return nights.concat(packIntoNights(extra, hosted));
}

/** Remove and return the latest game that does not involve `teamId`. */
function takeBackLatestGameWithout(nights, teamId) {
  for (let n = nights.length - 1; n >= 0; n -= 1) {
    for (let i = nights[n].length - 1; i >= 0; i -= 1) {
      const g = nights[n][i];
      if (g.homeId !== teamId && g.awayId !== teamId) {
        nights[n] = nights[n].filter((_, k) => k !== i);
        return g;
      }
    }
  }
  return null;
}

function packIntoNights(pairs, hosted) {
  const out = [];
  let left = pairs;
  while (left.length) {
    const used = new Set();
    const night = [];
    const rest = [];
    for (const [a, b] of left) {
      if (used.has(a) || used.has(b)) { rest.push([a, b]); continue; }
      const [homeId, awayId] = hosted[a] > hosted[b] ? [b, a] : [a, b];
      hosted[homeId] = (hosted[homeId] || 0) + 1;
      used.add(a); used.add(b);
      night.push({ homeId, awayId, played: false, result: null });
    }
    out.push(night);
    left = rest;
  }
  return out;
}
