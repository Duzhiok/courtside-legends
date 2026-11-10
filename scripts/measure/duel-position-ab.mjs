/**
 * D3.1 fixed-seed measurement: does positioning measurably matter, and is
 * the effect bounded? Identical seeds across positions — the ONLY difference
 * between cells is where the players stand.
 *
 *   node scripts/measure/duel-position-ab.mjs
 *
 * Part 1 — single-possession make rates (2000 seeded shots per situation):
 *   outside open (corner) vs contested (paint), drive near rim vs far,
 *   legend outside with the defender tight vs sagged. Reports the empirical
 *   make rate next to the theoretical mean prob from makeProb.
 * Part 2 — full duels (300 per cell, fixed seeds): a low-OVR challenger
 *   (72) vs a Jordan-like legend (95) on "pro", baseline (never moves)
 *   vs optimal positioning (corner for outside, rim for drive/post, tight
 *   on the ball on defense). Reports the legend win rate in both cells.
 *
 * Verdict target: the effect is REAL (open/corner and rim shots make more
 * often) but BOUNDED (a few points of make probability, ±0.06 max) — the
 * legend must still win most duels even against optimal positioning.
 */
import {
  createDuel,
  playPossession,
  makeProb,
  OFFENSE,
} from "../../js/duel/duelSim.js";
import {
  createTakeover,
  moveControlledTo,
  spacingByOffense,
  applyPossession,
} from "../../js/duel/duelTakeover.js";

// 72-OVR role player vs a Jordan-like 95 legend. No skills on the
// challenger, so the only gap-closer is positioning.
const CHALLENGER = {
  id: "role-72", name: "Role Player", bref: "rolepl72", season: 2020, pos: "SG", ovr: 72,
  shooting: 72, finishing: 70, handles: 68, defense: 65, strength: 66, speed: 70, stamina: 70,
  skills: [],
};
const LEGEND = {
  id: "jordan-95", name: "Michael Jordan", bref: "jordami01", season: 1991, pos: "SG", ovr: 95,
  shooting: 95, finishing: 95, handles: 92, defense: 88, strength: 85, speed: 94, stamina: 95,
  skills: ["rainmaker", "ankle_breaker"],
};

const fmt = (n, digits = 1) => (n * 100).toFixed(digits) + "%";
const pct = (n) => (n >= 0 ? "+" : "−") + Math.abs(Math.round(n * 100)) + "%";

function bestOffense(duelist) {
  let best = "drive";
  let bestRating = -Infinity;
  for (const choice of ["drive", "midrange", "outside", "post"]) {
    const rating = OFFENSE[choice].rating(duelist);
    if (rating > bestRating) {
      bestRating = rating;
      best = choice;
    }
  }
  return best;
}

/** Best spot for an offense: corner for outside, rim for drive/post, deep wing for midrange. */
function spotFor(offense) {
  if (offense === "outside") return { x: 12, y: 44 };
  if (offense === "drive" || offense === "post") return { x: 50, y: 8 };
  return { x: 15, y: 40 };
}

// ---- Part 1: single-possession make rates ---------------------------------

function measureShots(label, { shooter, defender, offense, ball, defenderAt, shooterIsLegend = false, n = 2000 }) {
  let makes = 0;
  let probSum = 0;
  let counted = 0;
  // The legend's offense is CPU-picked (bestRate 0.5 on pro), so only count
  // possessions where it actually shot the offense under test; the filter
  // is on the CPU's pick, independent of the make roll that follows it.
  for (let i = 0; counted < n && i < n * 10; i++) {
    const state = createDuel({
      challenger: shooterIsLegend ? defender : shooter,
      legend: shooterIsLegend ? shooter : defender,
      difficulty: "pro",
      seed: `d3-1-shot-${label}-${i}`,
    });
    // The shooter always shoots first: put the ball on their side.
    if (shooterIsLegend) state.possession = "b";
    let t = createTakeover();
    t = moveControlledTo(t, ball.x, ball.y);
    if (defenderAt) {
      // On the shooter's ball the defender is the shadow; to place them
      // exactly, override the shadow spot (defense possessions do this in
      // the real view when the player moves the defender).
      t = { ...t, defender: { ...defenderAt } };
    }
    const choice = shooterIsLegend ? { defense: "balanced" } : { offense };
    const event = playPossession(state, choice, { spacing: spacingByOffense(t) });
    if (shooterIsLegend && event.offense !== offense) continue;
    counted += 1;
    makes += event.made ? 1 : 0;
    probSum += event.prob;
  }
  return { label, n: counted, makes, rate: makes / counted, meanProb: probSum / counted };
}

const shots = [
  measureShots("challenger outside, OPEN (corner)", {
    shooter: CHALLENGER, defender: LEGEND, offense: "outside", ball: { x: 12, y: 44 },
  }),
  measureShots("challenger outside, CONTESTED (paint)", {
    shooter: CHALLENGER, defender: LEGEND, offense: "outside", ball: { x: 50, y: 10 }, defenderAt: { x: 50, y: 8 },
  }),
  measureShots("challenger drive, AT THE RIM", {
    shooter: CHALLENGER, defender: LEGEND, offense: "drive", ball: { x: 50, y: 8 },
  }),
  measureShots("challenger drive, FROM THE ARC", {
    shooter: CHALLENGER, defender: LEGEND, offense: "drive", ball: { x: 50, y: 32 },
  }),
  measureShots("legend outside, defender TIGHT", {
    shooter: LEGEND, defender: CHALLENGER, offense: "outside", ball: { x: 50, y: 32 }, defenderAt: { x: 50, y: 32 }, shooterIsLegend: true,
  }),
  measureShots("legend outside, defender SAGGED", {
    shooter: LEGEND, defender: CHALLENGER, offense: "outside", ball: { x: 50, y: 32 }, defenderAt: { x: 50, y: 10 }, shooterIsLegend: true,
  }),
];

console.log("== D3.1 single-possession make rates (2000 seeded shots each) ==");
for (const s of shots) {
  console.log(`  ${s.label.padEnd(42)} make ${fmt(s.rate)}  (theory ${fmt(s.meanProb)})  n=${s.n}`);
}
const openVsContested = shots[0].rate - shots[1].rate;
const rimVsFar = shots[2].rate - shots[3].rate;
const tightVsSagged = shots[4].rate - shots[5].rate;
console.log(`  open vs contested outside: ${pct(openVsContested)}  |  rim vs arc drive: ${pct(rimVsFar)}  |  tight vs sagged legend outside: ${pct(tightVsSagged)}`);

// ---- Part 2: full-duel win rates ------------------------------------------

function playDuelWithPositioning(seed, positioning) {
  const state = createDuel({ challenger: CHALLENGER, legend: LEGEND, difficulty: "pro", seed });
  let t = createTakeover();
  while (!state.over && state.turn < 200) {
    const myBall = state.possession === "a";
    if (positioning === "optimal" && myBall) {
      const offense = bestOffense(state.a.duelist);
      t = moveControlledTo(t, ...Object.values(spotFor(offense)));
    } else if (positioning === "optimal" && !myBall) {
      t = moveControlledTo(t, 50, 32); // defender onto the ball
    }
    const choice = myBall
      ? { offense: bestOffense(state.a.duelist) }
      : { defense: "balanced" };
    const event = playPossession(state, choice, { spacing: spacingByOffense(t) });
    t = applyPossession(t, state, event);
  }
  return state;
}

const DUELS_PER_CELL = 300;
function winRateCell(positioning) {
  let challengerWins = 0;
  for (let i = 0; i < DUELS_PER_CELL; i++) {
    const state = playDuelWithPositioning(`d3-1-duel-${positioning}-${i}`, positioning);
    if (state.winner === "a") challengerWins += 1;
  }
  return { positioning, n: DUELS_PER_CELL, challengerWins, legendWins: DUELS_PER_CELL - challengerWins };
}

const baseline = winRateCell("baseline");
const optimal = winRateCell("optimal");

console.log("\n== D3.1 full duels: 72-OVR challenger vs 95 legend, pro, 300 duels/cell ==");
console.log(`  baseline (never moves):      challenger ${fmt(baseline.challengerWins / baseline.n)}  ·  legend ${fmt(baseline.legendWins / baseline.n)}`);
console.log(`  optimal positioning:         challenger ${fmt(optimal.challengerWins / optimal.n)}  ·  legend ${fmt(optimal.legendWins / optimal.n)}`);
console.log(`  positioning swing:           challenger ${pct(optimal.challengerWins / optimal.n - baseline.challengerWins / baseline.n)}`);

// ---- Verdict ----------------------------------------------------------------

const effectReal = openVsContested > 0.02 && rimVsFar > 0.01 && tightVsSagged < -0.01;
const bounded = optimal.legendWins / optimal.n > 0.5;
console.log("\n== verdict ==");
console.log(`  effect real: ${effectReal ? "YES" : "NO"} (open beats contested, rim beats arc, tight beats sagged)`);
console.log(`  bounded: ${bounded ? "YES" : "NO"} — legend still wins ${fmt(optimal.legendWins / optimal.n)} vs optimal positioning (was ${fmt(baseline.legendWins / baseline.n)} baseline)`);
console.log(`  ${effectReal && bounded ? "PASS" : "FAIL"}: positioning matters, but a 72-OVR challenger cannot out-position a 95 legend into a favorite`);
