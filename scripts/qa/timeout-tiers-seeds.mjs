// Fixed-seed B27 comparison: same seeds, 3 tiers x N fast-forward games.
// Acceptance (docs/implementation/b27-timeout-tiers-design.md): assistant
// timeout counts order conservative < balanced < aggressive, and win-rate
// fluctuation stays within +/-2 percentage points (a feel choice, not a
// power choice). The CPU ladder is untouched, so CPU timeouts are a control
// and should barely move between tiers.
//
// Every tier replays the SAME paired seeds against the SAME opponent, so the
// only differences are the tier table. GameSim is the only match engine.
// Autopilot is fully on (the typical managed setup); injuries off.
//
// Usage: node scripts/qa/timeout-tiers-seeds.mjs [gamesPerTier=100] [live]
//   live: step the game with _quiet=false (the B3 reserve >4 applies, as in
//   real play) instead of runFast, unpausing at halftime like a user who
//   resumes instantly. Fast-forward (default) is the design's prescribed
//   check; live is a diagnostic for whether a miss is a quiet-mode artifact
//   (quiet lets the assistant burn all 7 timeouts; live caps it at 3).
import { readFileSync } from "node:fs";
import { seasonToCard } from "../../js/data/players.js";
import { buildCareerSpanIndex } from "../../js/data/careerArc.js";
import { GameSim } from "../../js/engine/sim.js";
import { seededStream, hashSeed } from "../../js/core/seededRandom.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
const pool2020 = ROWS.filter((r) => r.season === 2020).map(seasonToCard);

function buildTeam(name, offset) {
  const players = pool2020.slice(offset, offset + 12);
  return { name, players, starterIds: players.slice(0, 5).map((p) => p.id) };
}

const N = Number(process.argv[2] || 100);
const LIVE = process.argv[3] === "live";
const TIERS = ["conservative", "balanced", "aggressive"];

function playGame(tier, i) {
  const sim = new GameSim({
    home: buildTeam("Home", 0),
    away: buildTeam("Away", 12),
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(hashSeed(`timeout-tiers|${LIVE ? "live|" : ""}${i}`)),
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
  sim.setAutoOffense(true);
  sim.setAutoDefense(true);
  sim.setAutoRotation(true);
  sim.setTimeoutTier(tier);
  if (LIVE) {
    // Live reserve: _quiet stays false, so assistantMayCallTimeout keeps >4.
    sim._quiet = false;
    sim.running = true;
    sim.paused = false;
    let guard = 0;
    while (!sim.ended && sim.running && guard++ < 8000) {
      if (sim.paused) sim.setPaused(false);
      sim.step();
    }
    const snap = sim.snapshot();
    return {
      win: snap.score.home > snap.score.away,
      assistantTimeouts: 7 - snap.timeouts.home,
      cpuTimeouts: 7 - snap.timeouts.away,
    };
  }
  const snap = sim.runFast();
  return {
    win: snap.score.home > snap.score.away,
    // In runFast nobody else touches your timeouts: every one spent is the assistant's.
    assistantTimeouts: 7 - snap.timeouts.home,
    cpuTimeouts: 7 - snap.timeouts.away,
  };
}

const t0 = Date.now();
const results = {};
for (const tier of TIERS) {
  let wins = 0;
  let asst = 0;
  let cpu = 0;
  for (let i = 0; i < N; i++) {
    const g = playGame(tier, i);
    wins += g.win ? 1 : 0;
    asst += g.assistantTimeouts;
    cpu += g.cpuTimeouts;
  }
  results[tier] = {
    wins,
    winRate: (100 * wins) / N,
    asstMean: asst / N,
    cpuMean: cpu / N,
  };
  console.log(
    `${tier}: W ${wins}/${N} (${results[tier].winRate.toFixed(1)}%) ` +
      `assistant timeouts ${asst} (mean ${results[tier].asstMean.toFixed(2)}/game) ` +
      `cpu timeouts ${cpu} (mean ${results[tier].cpuMean.toFixed(2)}/game)`,
  );
}

const ordered =
  results.conservative.asstMean < results.balanced.asstMean &&
  results.balanced.asstMean < results.aggressive.asstMean;
const spread = Math.max(
  ...TIERS.map((t) => Math.abs(results[t].winRate - results.balanced.winRate)),
);
const winOk = spread <= 2;
console.log(
  `ordering conservative < balanced < aggressive: ${ordered ? "PASS" : "FAIL"} ` +
    `(${results.conservative.asstMean.toFixed(2)} < ${results.balanced.asstMean.toFixed(2)} < ${results.aggressive.asstMean.toFixed(2)})`,
);
console.log(
  `win-rate spread vs balanced: ${spread.toFixed(1)}pp (max ${winOk ? "<=" : ">"} 2pp): ${winOk ? "PASS" : "FAIL"}`,
);
console.log(`total ${Date.now() - t0}ms`);
console.log(
  `limits: single 2020 matchup, autopilot fully on, injuries off, ${LIVE ? "live stepping (B3 reserve >4, halftime auto-resumed)" : "quiet fast-forward (B3 reserve is 0 in quiet mode, live games keep >4)"}; ${N} games/tier.`,
);
if (!ordered || !winOk) process.exit(1);
