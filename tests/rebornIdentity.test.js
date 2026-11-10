/**
 * Player Reborn PR1 (design: docs/implementation/player-reborn-slice-prep.md,
 * ADR-005 §3): seeded identity draw. Pure + deterministic — every test pins
 * a seed, no Math.random anywhere.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  benchPool,
  drawIdentity,
  identityCard,
  maybeReveal,
  buildPlayerCard,
  applyIdentityToRoster,
  createRebornState,
  REBORN_SEASON,
  REBORN_START_YEARS,
  seasonForStartYear,
  REBORN_TEAM_IDS,
  REVEAL_TRUST,
} from "../js/reborn/identity.js";
import {
  createRootState,
  writeRootSave,
  readRootSave,
  validateReborn,
} from "../js/data/saveRoot.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

test("bench pool is exactly the 80 measured players (ADR-005 said 100 — outdated)", () => {
  const pool = benchPool(ROWS);
  assert.equal(pool.length, 80);
  assert.equal(new Set(pool.map((r) => r.bref)).size, 80);
  for (const r of pool) {
    assert.equal(r.season, 1997);
    assert.ok(r.mpg < 12, `${r.name} mpg ${r.mpg}`);
    assert.ok(r.gp >= 10, `${r.name} gp ${r.gp}`);
  }
  // sorted by id so the draw never depends on file order
  const ids = pool.map((r) => r.id);
  assert.deepEqual(ids, [...ids].sort());
});

test("drawIdentity is deterministic: same seed draws the same person", () => {
  const a = drawIdentity("reborn-seed-7", ROWS);
  const b = drawIdentity("reborn-seed-7", ROWS);
  assert.deepEqual(a, b);
  assert.equal(a.season, REBORN_SEASON);
});

test("drawIdentity splits ~70/30 across fixed seeds and both kinds occur", () => {
  const kinds = [];
  for (let i = 0; i < 100; i++) kinds.push(drawIdentity(`reborn-split-${i}`, ROWS).kind);
  const historical = kinds.filter((k) => k === "historical").length;
  assert.ok(historical >= 55 && historical <= 85, `historical ${historical}/100`);
  assert.ok(kinds.includes("fictional"), "no fictional identity in 100 seeds");
});

function firstIdentityOf(kind, prefix) {
  for (let i = 0; i < 200; i++) {
    const identity = drawIdentity(`${prefix}-${i}`, ROWS);
    if (identity.kind === kind) return identity;
  }
  throw new Error(`no ${kind} identity in 200 seeds`);
}

test("historical identity matches its roster row and starts unrevealed", () => {
  const identity = firstIdentityOf("historical", "reborn-hist");
  assert.equal(identity.revealed, false);
  const row = ROWS.find((r) => r.bref === identity.bref && r.season === 1997);
  assert.ok(row, "row exists");
  assert.equal(identity.name, row.name);
  assert.equal(identity.team, row.team);
  assert.equal(identity.pos, row.pos);
  assert.equal(identity.cardId, row.id);
});

test("fictional identity is a generated rookie on a real 1996-97 team, revealed at once", () => {
  const identity = firstIdentityOf("fictional", "reborn-fict");
  assert.equal(identity.revealed, true);
  assert.ok(REBORN_TEAM_IDS.includes(identity.team), identity.team);
  assert.ok(identity.bref.startsWith("generated-"), identity.bref);
  assert.ok(identity.generated, "generated prospect stored");
  assert.equal(identity.generated.season, 1997);
  for (const attr of ["scoring", "three", "defense", "pass", "rebound"]) {
    assert.ok(Number.isFinite(identity.generated[attr]), attr);
  }
});

test("identity card hides the name until trust reaches the reveal threshold", () => {
  const identity = firstIdentityOf("historical", "reborn-hide");
  assert.equal(identityCard(identity).name, "无名训练营球员");
  assert.equal(identityCard(identity).revealed, false);
  assert.equal(maybeReveal(identity, REVEAL_TRUST - 1), identity);
  const revealed = maybeReveal(identity, REVEAL_TRUST);
  assert.notEqual(revealed, identity);
  assert.equal(revealed.revealed, true);
  assert.equal(identityCard(revealed).name, identity.name);
  assert.equal(identityCard(revealed).revealed, true);
});

test("fictional identity card shows the name from the start", () => {
  const identity = firstIdentityOf("fictional", "reborn-show");
  assert.equal(identityCard(identity).name, identity.name);
  assert.equal(identityCard(identity).revealed, true);
});

test("buildPlayerCard clones the row, applies growth deltas, never mutates the row", () => {
  const identity = firstIdentityOf("historical", "reborn-clone");
  const row = ROWS.find((r) => r.bref === identity.bref && r.season === 1997);
  const before = JSON.stringify(row);
  const card = buildPlayerCard(identity, ROWS, {
    growth: { [identity.bref]: { year: 1997, xp: 0, levels: 1, deltas: { three: 2 } } },
  });
  assert.equal(card.rebornClone, true);
  assert.equal(card.id, row.id);
  const plain = buildPlayerCard(identity, ROWS);
  assert.equal(card.three, plain.three + 2);
  assert.equal(JSON.stringify(row), before, "roster row untouched");
  assert.throws(() => buildPlayerCard({ ...identity, bref: "nobody00" }, ROWS), /no 1997 row/);
});

test("applyIdentityToRoster replaces the original, never duplicates it", () => {
  const identity = firstIdentityOf("historical", "reborn-dupe");
  const teamCards = ROWS.filter((r) => r.team === identity.team && r.season === 1997).map((r) => ({
    id: r.id,
    bref: r.bref,
    name: r.name,
  }));
  const before = teamCards.length;
  const next = applyIdentityToRoster(teamCards, identity, { players: ROWS });
  assert.equal(next.length, before, "same size: replaced, not added");
  assert.equal(next.filter((p) => p.bref === identity.bref).length, 1);
  assert.equal(next.find((p) => p.bref === identity.bref).rebornClone, true);
  assert.equal(teamCards.filter((p) => p.bref === identity.bref).length, 1, "input untouched");
});

test("applyIdentityToRoster appends a fictional identity as the camp invitee", () => {
  const identity = firstIdentityOf("fictional", "reborn-add");
  const teamCards = ROWS.filter((r) => r.team === identity.team && r.season === 1997).map((r) => ({
    id: r.id,
    bref: r.bref,
    name: r.name,
  }));
  const next = applyIdentityToRoster(teamCards, identity, { players: ROWS });
  assert.equal(next.length, teamCards.length + 1);
  assert.equal(next.at(-1).bref, identity.bref);
  assert.equal(next.at(-1).team, identity.team);
});

test("createRebornState matches the ADR-005 §4 data model", () => {
  const state = createRebornState("reborn-seed-1", ROWS);
  assert.equal(state.version, 1);
  assert.equal(state.seed, "reborn-seed-1");
  assert.equal(state.startYear, 1996);
  assert.equal(state.boundary, "preseason");
  assert.equal(state.role, "player");
  assert.equal(state.origin, "random-destiny");
  assert.equal(state.difficulty, "underdog");
  assert.equal(state.player.teamId, state.identity.team);
  assert.equal(state.player.coachTrust, 25);
  assert.equal(state.player.rotationRole, "garbage");
  assert.equal(state.player.contractStatus, "camp");
  assert.deepEqual(state.player.growth, {});
  assert.deepEqual(state.player.seasonLog, []);
  assert.deepEqual(state.timeline, { events: [] });
  assert.doesNotThrow(() => validateReborn(state));
});

test("root save round-trips reborn; old saves without the field still load", () => {
  const storage = createMemoryStorage();
  const root = createRootState();
  assert.equal(root.reborn, null);
  root.reborn = createRebornState("reborn-seed-2", ROWS);
  writeRootSave(root, storage);
  const back = readRootSave(storage);
  assert.ok(back);
  assert.equal(back.reborn.seed, "reborn-seed-2");
  assert.equal(back.reborn.identity.kind, root.reborn.identity.kind);

  const old = createRootState();
  delete old.reborn;
  writeRootSave(old, storage);
  assert.equal(readRootSave(storage).reborn, undefined);
});

test("validateReborn rejects malformed reborn state", () => {
  const good = createRebornState("reborn-seed-3", ROWS);
  assert.throws(() => validateReborn({ ...good, version: 2 }), /invalid root save/);
  assert.throws(
    () => validateReborn({ ...good, identity: { ...good.identity, kind: "coach" } }),
    /invalid root save/,
  );
  assert.throws(
    () => validateReborn({ ...good, player: { ...good.player, coachTrust: 150 } }),
    /invalid root save/,
  );
  const storage = createMemoryStorage();
  const root = createRootState({ reborn: { ...good, version: 2 } });
  assert.throws(() => writeRootSave(root, storage), /invalid root save/);
});

test("start years: 1995 and 1996 are offered, both pools measured, defaults unchanged", () => {
  assert.deepEqual(REBORN_START_YEARS, [1995, 1996]);
  assert.equal(seasonForStartYear(1995), 1996);
  assert.equal(seasonForStartYear(1996), 1997);
  assert.throws(() => seasonForStartYear(1997), /not offered/);
  assert.throws(() => seasonForStartYear(1976), /not offered/);
  // 1995-96 bench pool: 88 players, all season 1996 rows.
  const pool96 = benchPool(ROWS, 1996);
  assert.equal(pool96.length, 88);
  assert.ok(pool96.every((r) => r.season === 1996 && r.mpg < 12 && r.gp >= 10));
  // Default call still draws the 1996-97 pool (80 players).
  assert.equal(benchPool(ROWS).length, 80);
});

test("drawIdentity with a start year draws from that season only", () => {
  const a = drawIdentity("reborn-seed-7", ROWS, { season: 1996 });
  const b = drawIdentity("reborn-seed-7", ROWS, { season: 1996 });
  assert.deepEqual(a, b);
  assert.equal(a.season, 1996);
  if (a.kind === "historical") {
    assert.ok(ROWS.some((r) => r.bref === a.bref && r.season === 1996));
  }
  // Same seed, different season: the draw is re-rolled from the other pool.
  const c = drawIdentity("reborn-seed-7", ROWS, { season: 1997 });
  assert.equal(c.season, 1997);
});

test("createRebornState with a start year records it and the season", () => {
  const state = createRebornState("reborn-seed-7", ROWS, { startYear: 1995 });
  assert.equal(state.startYear, 1995);
  assert.equal(state.player.seasonYear, 1996);
  assert.equal(state.identity.season, 1996);
  assert.equal(state.player.teamId, state.identity.team);
  // Default is still the 1996 start.
  const def = createRebornState("reborn-seed-7", ROWS);
  assert.equal(def.startYear, 1996);
  assert.equal(def.player.seasonYear, 1997);
  assert.throws(() => createRebornState("reborn-seed-7", ROWS, { startYear: 1997 }), /not offered/);
});
