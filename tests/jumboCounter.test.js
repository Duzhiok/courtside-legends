import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";

/**
 * Autopilot must SEE a jumbo opponent and punish it. managedOffensePlan used
 * to read only our own shooters/bigs plus the score -- never the opponent's
 * floor -- so against 3-4 non-shooting bigs it either stayed neutral or, when
 * we also had 2+ bigs, ground into the crowd with triangle/grind/post_up and
 * ate the full paintCrowdPenalty. The engine already rewards threes against
 * jumbo (big-mismatch bonus + perimeter discount + crowd penalty on every
 * non-three); this locks the autopilot side: detect 3+ non-shooting bigs on
 * the opponent's floor and switch to spacing + three hunting.
 *
 * Fixtures pin the floor explicitly (playPos/three/threeTend) instead of
 * trusting real-card derivations, so the tests stay deterministic even if
 * roster derivations change.
 */
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool2020 = rows.filter((r) => r.season === 2020).map(seasonToCard);

function freshSim(coachTactics = ["pace_space", "smallball", "five_out"]) {
  return new GameSim({
    home: {
      name: "Home",
      players: pool2020.slice(0, 12),
      starterIds: pool2020.slice(0, 5).map((p) => p.id),
      coach: { id: "t-h", name: "T", specialTactics: coachTactics, preferred: [], buffs: {} },
    },
    away: {
      name: "Away",
      players: pool2020.slice(12, 24),
      starterIds: pool2020.slice(12, 17).map((p) => p.id),
      coach: { id: "t-a", name: "T", specialTactics: ["balanced"], preferred: [], buffs: {} },
    },
    youSide: "home",
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
}

function setNonShooterBig(p, pos) {
  p.playPos = pos;
  p.pos = pos;
  p.three = 40;
  p.threeTend = 10;
  p.offenseStyle = undefined;
  p.orders = {};
}

function setJumboOpp(sim) {
  sim.opp().onCourt.forEach((p, i) => {
    if (i < 3) setNonShooterBig(p, i === 0 ? "C" : "PF");
    else {
      p.playPos = i === 3 ? "PG" : "SG";
      p.three = 80;
    }
  });
}

function setBalancedOpp(sim) {
  sim.opp().onCourt.forEach((p, i) => {
    if (i === 0) setNonShooterBig(p, "C");
    else {
      p.playPos = ["PG", "SG", "SF", "PF"][i - 1];
      p.three = 80;
    }
  });
}

function setShooters(sim, n) {
  sim.you().onCourt.forEach((p, i) => {
    p.three = i < n ? 85 : 40;
  });
}

function setYouBigs(sim, n) {
  sim.you().onCourt.forEach((p, i) => {
    if (i < n) {
      p.playPos = "C";
      p.pos = "C";
    }
  });
}

test("autopilot vs jumbo: spacing tactic + pace_three when we have shooters", () => {
  const sim = freshSim();
  setJumboOpp(sim);
  setShooters(sim, 3);
  sim.managedOffensePlan({ light: false });
  assert.equal(sim.you().tactic.id, "pace_space");
  assert.equal(sim.focusPlay?.id, "pace_three");
});

test("autopilot vs jumbo: the light per-possession tick answers too, not only breaks", () => {
  const sim = freshSim();
  setJumboOpp(sim);
  setShooters(sim, 3);
  sim.managedOffensePlan({ light: true });
  assert.equal(sim.you().tactic.id, "pace_space");
  assert.equal(sim.focusPlay?.id, "pace_three");
});

test("autopilot vs jumbo: jumbo branch beats our own bigs branch (no grind/post_up into the crowd)", () => {
  const sim = freshSim();
  setYouBigs(sim, 2);
  setJumboOpp(sim);
  setShooters(sim, 3);
  sim.managedOffensePlan({ light: false });
  assert.equal(sim.you().tactic.id, "pace_space");
  assert.equal(sim.focusPlay?.id, "pace_three");
});

test("autopilot vs jumbo without shooters: still spacing tactic, but hunt_mismatch instead of pace_three", () => {
  const sim = freshSim();
  setJumboOpp(sim);
  setShooters(sim, 0);
  sim.managedOffensePlan({ light: false });
  assert.equal(sim.you().tactic.id, "pace_space");
  assert.equal(sim.focusPlay?.id, "hunt_mismatch");
});

test("autopilot vs jumbo with a coach that has no spacing tactic: balanced tactic, pace_three focus kept", () => {
  const sim = freshSim(["triangle", "grind"]);
  setJumboOpp(sim);
  setShooters(sim, 3);
  sim.managedOffensePlan({ light: false });
  assert.equal(sim.you().tactic.id, "balanced");
  assert.equal(sim.focusPlay?.id, "pace_three");
});

test("autopilot vs a balanced opponent: jumbo branch does not fire", () => {
  const sim = freshSim();
  setBalancedOpp(sim);
  setShooters(sim, 3);
  sim.managedOffensePlan({ light: false });
  assert.equal(sim.you().tactic.id, "smallball");
  assert.equal(sim.focusPlay, null);
});
