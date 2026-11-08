import test from "node:test";
import assert from "node:assert/strict";
import { GameSim } from "../js/engine/sim.js";
import { seededStream } from "../js/core/seededRandom.js";
import { realTeam } from "./helpers/realGame.js";

const KINDS = new Set(["handoff", "kick", "repass"]);

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
      assert.ok(KINDS.has(p.kind), `kind ${p.kind} must be handoff/kick/repass`);
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
    for (let i = 0; i < 14; i++) sim.step();
    for (const e of passesOf(events)) {
      if (e.meta.pass.kind !== "handoff") continue;
      handoffs += 1;
      assert.equal(e.meta.pass.receiverId, shooterId, `seed ${seed}: handoff feeds the script shooter`);
    }
  }
  assert.ok(handoffs > 0, "the handoff fired at least once across 40 seeds");
});
