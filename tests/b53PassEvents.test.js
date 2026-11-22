import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";

// "assist": the sim's own record of who passed to the scorer, emitted in front of the basket when no kick-out already did (B76 pass coverage).
const KINDS = new Set(["handoff", "kick", "repass", "assist"]);

/** Drive a full seeded live game, collecting every event. */
function playGame(seed) {
  const events = [];
  const sim = new GameSim({
    home: realTeam("GSW", 2016),
    away: realTeam("CLE", 2016),
    youSide: "home",
    injuries: false,
    speed: 3,
    rng: seededStream(seed),
    onEvent: (e) => events.push(e),
    onTick: () => {},
    onEnd: () => {},
  });
  sim.running = true;
  let steps = 0;
  while (sim.running && steps < 2000) {
    sim.step();
    steps += 1;
    if (sim.paused) sim.setPaused(false); // quarter-break resume, like the UI
  }
  assert.equal(sim.running, false, `seed ${seed}: the seeded game finished`);
  return events;
}

/** Split the stream at possession-terminal events (score / miss). */
function segments(events) {
  const out = [[]];
  for (const e of events) {
    out[out.length - 1].push(e);
    if (e.type === "score" || e.type === "miss") out.push([]);
  }
  return out;
}

function passesOf(events) {
  return events.filter((e) => e.meta?.pass);
}

test("B53: every meta.pass is kind-tagged and names two different on-court teammates", () => {
  for (const seed of [33, 34, 35]) {
    const events = playGame(seed);
    const passes = passesOf(events);
    assert.ok(passes.length > 20, `seed ${seed}: a full game has many passes (${passes.length})`);
    for (const e of passes) {
      const p = e.meta.pass;
      assert.ok(KINDS.has(p.kind), `kind ${p.kind} must be handoff/kick/repass/assist`);
      assert.notEqual(p.passerId, p.receiverId, "a pass changes hands");
      // The event payload carries the snapshot at emit time: both ends must be
      // on the floor for the same team.
      const snap = e;
      const side = [snap.home, snap.away].find((t) =>
        (t.onCourt || []).some((x) => x.id === p.passerId)
      );
      assert.ok(side, `passer ${p.passerId} is on court`);
      assert.ok((side.onCourt || []).some((x) => x.id === p.receiverId), `receiver ${p.receiverId} is on the same team`);
    }
  }
});

test("B53: no possession segment draws the same pass twice, and none draws more than two", () => {
  // Structural bound: a possession has at most two ball-changes (handoff+kick
  // cannot co-occur, kick+repass and handoff+repass are the pairs). The old
  // organizer narration re-emitted meta.pass for the same ball-change, which
  // would show up as a duplicate pair inside one segment.
  for (const seed of [33, 34, 35]) {
    const events = playGame(seed);
    for (const seg of segments(events)) {
      const ps = passesOf(seg);
      assert.ok(ps.length <= 2, `seed ${seed}: ${ps.length} passes in one segment`);
      const pairs = ps.map((e) => `${e.meta.pass.passerId}->${e.meta.pass.receiverId}`);
      assert.equal(new Set(pairs).size, pairs.length, `seed ${seed}: duplicate arc ${pairs}`);
    }
  }
});

// B53: the organizer-kick narration (1104) is text only. The pass arc already
// fired at the real handoff/kick, so a meta.pass here would redraw the same
// arc. The narration needs the rare blind_pass skill (only Jokic in the
// roster), so it is pinned at the source level, like B51.
test("B53: the organizer-kick narration carries no meta.pass (source pin)", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../js/engine/sim.js", import.meta.url), "utf8");
  const lines = src.split("\n").filter((l) => l.includes("catches it wide open"));
  assert.equal(lines.length, 1, "exactly one organizer-kick narration emit");
  assert.equal(lines[0].includes("pass:"), false, "narration must not re-emit meta.pass");
});

const SCENARIO = { clock: 12, score: { home: 97, away: 100 } };

/** A late-game sim with no player decision: the script picks the shooter. */
function buildClutch(seed) {
  const sim = new GameSim({
    home: realTeam("CHI", 1996), away: realTeam("SEA", 1996), youSide: "home", injuries: false, speed: 3,
    rng: seededStream(seed), onEvent() {}, onTick() {}, onEnd() {},
  });
  sim.running = true;
  sim.paused = false;
  sim.quarter = 4;
  sim.clock = SCENARIO.clock;
  sim.score = { ...SCENARIO.score };
  sim.possession = "home";
  return sim;
}

test("B53: the forced clutch handoff emits a handoff pass to the script shooter", () => {
  let handoffs = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const events = [];
    const sim = buildClutch(seed);
    sim.onEvent = (e) => events.push(e);
    sim.step();
    const shooterId = sim.home.temp?.lateChase?.shooterId;
    // The FORCED handoff is the scripted possession, i.e. the first step. Later possessions run ordinary offence, whose handoffs go to whoever
    // the play calls for (B76: Kerr now shoots like his real minutes say, so he shows up as a receiver there) -- not to the script shooter.
    const scripted = events.length;
    for (let i = 0; i < 14; i++) sim.step();
    for (const e of passesOf(events.slice(0, scripted))) {
      if (e.meta.pass.kind !== "handoff") continue;
      handoffs += 1;
      assert.equal(e.meta.pass.receiverId, shooterId, `seed ${seed}: handoff feeds the script shooter`);
    }
  }
  assert.ok(handoffs > 0, "the handoff fired at least once across 40 seeds");
});

test("B76: an assisted basket has its assisting pass in front of it, from a teammate, and never more passes than the box score has assists", () => {
  let assisted = 0, madeShots = 0, withPass = 0;
  for (const seed of [41, 42, 43, 44]) {
    const events = playGame(seed);
    let lastPass = null;
    let credited = 0;
    for (const e of events) {
      const pass = e.meta?.pass;
      if (pass) {
        lastPass = { ...pass, seq: e.seq };
        if (pass.kind === "assist") assisted += 1;
      }
      const shot = e.meta?.shot;
      if ((e.type === "score" || e.type === "dunk") && shot?.made !== false && shot) {
        madeShots += 1;
        if (lastPass && lastPass.receiverId === shot.shooterId) withPass += 1;
        if (lastPass?.kind === "assist") {
          assert.equal(lastPass.receiverId, shot.shooterId, "the assisting pass goes to the man who scores");
          assert.notEqual(lastPass.passerId, lastPass.receiverId, "nobody assists himself");
          assert.ok(lastPass.seq < e.seq, "the pass is emitted before the basket");
        }
        lastPass = null;
      }
      if (e.type === "score" && /AST|助攻/.test(e.text || "")) credited += 1;
    }
    const assistPasses = passesOf(events).filter((e) => e.meta.pass.kind === "assist").length;
    assert.ok(assistPasses <= credited, `seed ${seed}: ${assistPasses} assist passes for ${credited} credited assists`);
  }
  assert.ok(assisted >= 20, `${assisted} assist passes over four games`);
  assert.ok(withPass / madeShots >= 0.7, `${withPass}/${madeShots} made baskets had a pass into the scorer in front of them (was 40% before the assist pass)`);
});
