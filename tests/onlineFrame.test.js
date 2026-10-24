import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { GameSim } from "../js/engine/sim.js";
import { buildOnlineFrame } from "../server/online-frame.mjs";

/**
 * T6 P0: per-tick frames must stay small. Full snapshot() measured ~70KB
 * with two 12-man rosters (onCourt + bench + roster triple the players);
 * the frame drops the roster list and all static ratings, which the client
 * already holds from the joined message.
 */
const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(rows);
const pool2020 = rows.filter((r) => r.season === 2020).map(seasonToCard);

function team(name, offset) {
  const players = pool2020.slice(offset, offset + 12);
  return { name, players, starterIds: players.slice(0, 5).map((p) => p.id) };
}

function freshSim() {
  return new GameSim({
    home: team("Home", 0),
    away: team("Away", 12),
    youSide: "home",
    onEvent: () => {},
    onTick: () => {},
    onEnd: () => {},
  });
}

test("frame carries no roster list and stays under 8KB", () => {
  const sim = freshSim();
  for (let i = 0; i < 20; i++) sim.step();
  const frame = buildOnlineFrame(sim, 20);
  const bytes = Buffer.byteLength(JSON.stringify(frame), "utf8");
  assert.ok(bytes < 8192, `frame is ${bytes} bytes, over the 8KB target`);
  assert.equal("roster" in frame.home, false);
  assert.equal("roster" in frame.away, false);
  assert.equal(frame.home.onCourt.length, 5);
  assert.equal(frame.home.bench.length, 7);
});

test("frame mirrors live score, clock, membership and stats", () => {
  const sim = freshSim();
  const benchId = sim.home.bench[0].id;
  const courtId = sim.home.onCourt[0].id;
  sim.substitute(courtId, benchId, "home");
  const frame = buildOnlineFrame(sim, 1);
  assert.equal(frame.score.home, sim.score.home);
  assert.equal(frame.clock, sim.clock);
  assert.equal(frame.home.onCourt.some((p) => p.id === benchId), true);
  assert.equal(frame.home.bench.some((p) => p.id === courtId), true);
  assert.equal(typeof frame.home.onCourt[0].stats.pts, "number");
  assert.equal(typeof frame.home.onCourt[0].fatigue, "number");
});

test("frame exposes each side's focus from its gameplan", () => {
  const sim = freshSim();
  sim.setOffenseFocus(sim.away.onCourt[0].id, { sideKey: "away" });
  const frame = buildOnlineFrame(sim, 1);
  assert.equal(frame.away.focusId, sim.away.onCourt[0].id);
  assert.equal(frame.home.focusId, null);
});
