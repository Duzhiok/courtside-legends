/**
 * Generated prospects are rating-only cards; the engine needs shooting percentages. Found by the Career 2.0
 * rookie probe: a generated Reborn rookie shot 0-for-50 with 0-for-12 free throws and spiralled to DNP.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { completeProspectCard } from "../js/data/prospectCard.js";
import { overall } from "../js/data/players.js";
import { createRebornState, buildPlayerCard } from "../js/reborn/identity.js";
import { buildSeason, playGame } from "../js/reborn/season.js";
import { rookieClassForYear } from "../js/engine/leagueDraft.js";
import { GameSim } from "../js/engine/sim.js";
import { seasonToCard } from "../js/data/players.js";
import { seededStream, hashSeed } from "../js/core/seededRandom.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const SHOOTING = ["threeFg", "midFg", "paintFg", "ft"];
const SUBS = ["handle", "perimDef", "interiorDef", "catchShoot", "offDribble", "offReb", "defReb"];

const bare = () => {
  const [prospect] = rookieClassForYear(1996, { seed: "prospect-card", minimumSize: 400, players: ROWS })
    .filter((p) => String(p.bref).startsWith("generated-"));
  return prospect.player;
};

test("a bare generated prospect has no shooting percentages (the defect), a completed one has sane ones", () => {
  const card = bare();
  for (const key of SHOOTING) assert.equal(card[key], undefined, `${key} is missing on the raw prospect`);
  const done = completeProspectCard(card);
  for (const key of [...SHOOTING, ...SUBS]) assert.ok(Number.isFinite(done[key]), `${key} filled`);
  assert.ok(done.threeFg >= 0.05 && done.threeFg <= 0.5);
  assert.ok(done.midFg >= 0.28 && done.midFg <= 0.55);
  assert.ok(done.paintFg >= 0.35 && done.paintFg <= 0.72);
  assert.ok(done.ft >= 0.4 && done.ft <= 0.95);
});

test("completing never changes a rating (OVR untouched), never mutates the input, and is idempotent", () => {
  const card = bare();
  const before = structuredClone(card);
  const done = completeProspectCard(card);
  assert.deepEqual(card, before, "input untouched");
  assert.equal(overall(done), overall(card));
  assert.deepEqual(completeProspectCard(done), done, "second pass changes nothing");
});

test("a field the card already has is never overwritten", () => {
  const done = completeProspectCard({ ...bare(), ft: 0.91, threeFg: 0.44, handle: 77 });
  assert.equal(done.ft, 0.91);
  assert.equal(done.threeFg, 0.44);
  assert.equal(done.handle, 77);
});

test("better shooters get better percentages (same ordering the real cards follow)", () => {
  const base = bare();
  const lo = completeProspectCard({ ...base, three: 40, mid: 45, paint: 45 });
  const hi = completeProspectCard({ ...base, three: 80, mid: 80, paint: 80 });
  for (const key of SHOOTING) assert.ok(hi[key] > lo[key], key);
});

test("non-objects pass through untouched", () => {
  assert.equal(completeProspectCard(null), null);
  assert.equal(completeProspectCard(undefined), undefined);
});

test("real engine: a generated Reborn rookie actually scores (regression: 0-for-50 and trust spiral)", async () => {
  const reborn0 = createRebornState("rookie-trial-1", ROWS); // a fictional draw
  assert.equal(reborn0.identity.kind, "fictional");
  const card = buildPlayerCard(reborn0.identity, ROWS, { growth: reborn0.player.growth, season: 1997 });
  for (const key of SHOOTING) assert.ok(Number.isFinite(card[key]), `${key} on the built card`);
  let reborn = reborn0;
  const season = buildSeason(reborn, ROWS);
  let made = 0;
  let attempts = 0;
  for (let i = 0; i < 5; i += 1) {
    const out = await playGame(reborn, season, ROWS, {});
    reborn = out.reborn;
    made += out.report.line.fgm + out.report.line.ftm;
    attempts += out.report.line.fga + out.report.line.fta;
  }
  assert.ok(attempts >= 10, `he gets shots up (${attempts})`);
  assert.ok(made > 0, `and some go in (${made}/${attempts})`);
});

test("an old save whose stored prospect is bare plays on a completed card", () => {
  const reborn = createRebornState("rookie-trial-1", ROWS);
  for (const key of [...SHOOTING, ...SUBS]) delete reborn.identity.generated[key];
  const card = buildPlayerCard(reborn.identity, ROWS, { season: 1997 });
  for (const key of SHOOTING) assert.ok(Number.isFinite(card[key]), key);
});

test("GameSim heals a bare generated card saved before B123: he scores, and the saved card is untouched", () => {
  const pool = ROWS.filter((r) => r.season === 2020).map(seasonToCard);
  const bare = rookieClassForYear(2030, { seed: "b123", minimumSize: 40 })
    .filter((p) => p.source === "generated").slice(0, 5)
    .map((p, i) => ({ ...p.player, id: `rk${i}`, name: `Rookie ${i}` }));
  assert.ok(bare.every((p) => !Number.isFinite(p.threeFg)), "fixture really is bare");
  const team = (name, players) => ({ name, players, starterIds: players.slice(0, 5).map((p) => p.id) });
  let pts = 0;
  for (let i = 0; i < 6; i += 1) {
    const sim = new GameSim({
      home: team("H", [...bare, ...pool.slice(5, 12)]), away: team("A", pool.slice(12, 24)), youSide: "home",
      speed: 3, rng: seededStream(hashSeed(`b123|${i}`)), onEvent() {}, onTick() {}, onEnd() {},
    });
    sim.runFast();
    pts += sim.home.roster.filter((p) => String(p.id).startsWith("rk")).reduce((n, p) => n + p.stats.pts, 0);
  }
  assert.ok(pts > 0, `the bare rookies scored ${pts} points over 6 games`);
  assert.ok(bare.every((p) => !Number.isFinite(p.threeFg)), "the caller's saved card was not mutated");
});
