// Player Reborn PR4 probe — does the takeover option change who shoots and
// what kind of shot it is? Before/after comparison in the real takeover
// window (Q4, last 2:00, margin <= 5, your ball, you on court).
//
//   node scripts/research/reborn-takeover-probe.mjs [trials] [seed]
//
// Baseline (no decision) vs drive vs pull-up vs pass. For drive/pull-up the
// decision goes through the M2b interface (issueAttemptId + submitDecision)
// and the outcome is read from clutchLog; for the baseline/pass the first
// meta.shot of the possession is measured. Reports the share of possessions
// where the player took the shot, and whether it was a two or a three.
// Makes are NOT measured here — the choice changes the shooter and the shot
// type, not the dice.
import { readFileSync } from "node:fs";
import { GameSim } from "../../js/engine/sim.js";
import { createRebornState, buildPlayerCard, REBORN_TEAM_IDS } from "../../js/reborn/identity.js";
import { rosterCards } from "../../js/reborn/season.js";

const ROWS = JSON.parse(readFileSync(new URL("../../js/data/roster.json", import.meta.url), "utf8")).players;
const N = Number(process.argv[2]) || 200;
const SEED = process.argv[3] || "reborn-takeover-probe";

const reborn = createRebornState(SEED, ROWS);
const teamId = reborn.player.teamId;
const clone = buildPlayerCard(reborn.identity, ROWS);
const rest = rosterCards(ROWS, teamId, 1997).filter((p) => p.bref !== reborn.identity.bref);
const homeCards = [clone, ...rest.slice(0, 9)];
const oppId = REBORN_TEAM_IDS.find((t) => t !== teamId);
const awayCards = rosterCards(ROWS, oppId, 1997).slice(0, 10);

function freshSim() {
  const shots = [];
  const sim = new GameSim({
    home: { name: teamId, players: homeCards, starterIds: homeCards.slice(0, 5).map((p) => p.id) },
    away: { name: oppId, players: awayCards, starterIds: awayCards.slice(0, 5).map((p) => p.id) },
    youSide: "home",
    injuries: false,
    speed: 3,
    onEvent: (e) => { if (e.meta?.shot) shots.push(e.meta.shot); },
    onTick: () => {},
    onEnd: () => {},
  });
  sim.running = true;
  sim.quarter = 4;
  sim.clock = 100;
  sim.score = { home: 98, away: 100 };
  sim.possession = "home";
  return { sim, shots };
}

function oneTrial(config) {
  const { sim, shots } = freshSim();
  if (config === "drive" || config === "pullup") {
    const attemptId = sim.issueAttemptId();
    const res = sim.submitDecision({
      attemptId,
      kind: "clutch_shooter",
      shooterId: clone.id,
      actionHint: config === "drive" ? "attack" : "three",
    });
    if (!res.accepted) return { playerShot: false, zone: null, accepted: false };
    for (let i = 0; i < 20 && sim.clutchLog.length === 0; i++) sim.step();
    const out = sim.clutchLog[0];
    if (!out) return { playerShot: false, zone: null, accepted: true, reason: "no_outcome" };
    return {
      playerShot: out.attempted && out.actualShooterId === clone.id,
      zone: out.attempted ? out.zone : null,
      accepted: true,
      reason: out.attempted ? null : out.reason,
    };
  }
  // Baseline / pass: no decision — measure the first shot of the possession.
  sim.step();
  const first = shots[0];
  if (!first) return { playerShot: false, zone: null, accepted: true };
  return {
    playerShot: first.shooterId === clone.id,
    zone: first.pts === 3 ? "three" : "two",
    accepted: true,
  };
}

console.log(`player: ${clone.name} (${teamId}, three ${clone.three}, threeTend ${clone.threeTend ?? "-"}); ${N} trials per row\n`);
for (const config of ["none", "drive", "pullup", "pass"]) {
  let playerShot = 0, threes = 0, twos = 0, noShot = 0, rejected = 0;
  const reasons = {};
  for (let i = 0; i < N; i++) {
    const r = oneTrial(config);
    if (!r.accepted) { rejected++; continue; }
    if (r.playerShot) playerShot++;
    if (r.zone === "three") threes++;
    else if (r.zone === "two") twos++;
    else { noShot++; if (r.reason) reasons[r.reason] = (reasons[r.reason] || 0) + 1; }
  }
  const pct = (x) => `${((100 * x) / N).toFixed(0)}%`;
  const reasonStr = Object.entries(reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v)}`).join(", ");
  console.log(
    `${config.padEnd(7)} player shoots ${pct(playerShot)}  three ${pct(threes)}  two ${pct(twos)}  no shot ${pct(noShot)}${rejected ? `  rejected ${rejected}` : ""}${reasonStr ? `  [${reasonStr}]` : ""}`,
  );
}
