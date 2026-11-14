/**
 * Rivalry enforcer easter egg (user idea 2026-11-14): in a rivalry game,
 * having an enforcer on the floor is a double-edged sword — the enforcer
 * may rattle the rival, or whistle himself into foul trouble.
 *
 * Policy (same as rebornSeason.test.js): game RESULTS are never asserted.
 * These tests pin mechanics (pairing, rolls, effects, report shape) and
 * the Career 2.0 ruling guard (no OVR / shooting / dice change).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

// --- Data: the 1996-97 pool needs enforcers, or the egg can never fire ---

const ENFORCERS_1997 = [
  ["rodmade01", "Dennis Rodman", "CHI"],
  ["oaklech01", "Charles Oakley", "NYK"],
  ["masonan01", "Anthony Mason", "CHH"],
  ["mahorri01", "Rick Mahorn", "DET"],
];

for (const [bref, name, team] of ENFORCERS_1997) {
  test(`${name} (${team}, 1996-97) has the enforcer trait`, () => {
    const row = ROWS.find((r) => r.bref === bref && r.season === 1997);
    assert.ok(row, `${bref} has a 1996-97 row`);
    assert.equal(row.team, team);
    const card = seasonToCard(row);
    assert.ok((card.skills || []).includes("enforcer"), `${name} skills: ${card.skills}`);
  });
}

test("Rodman keeps his signature kit and gains enforcer", () => {
  const row = ROWS.find((r) => r.bref === "rodmade01" && r.season === 1997);
  const card = seasonToCard(row);
  for (const id of ["rebound_maniac", "stamina_monster", "lockdown", "enforcer"]) {
    assert.ok(card.skills.includes(id), `Rodman missing ${id}: ${card.skills}`);
  }
});

test("Oakley keeps his role-layer kit and gains enforcer", () => {
  const row = ROWS.find((r) => r.bref === "oaklech01" && r.season === 1997);
  const card = seasonToCard(row);
  for (const id of ["enforcer", "motor_engine", "crash_board"]) {
    assert.ok(card.skills.includes(id), `Oakley missing ${id}: ${card.skills}`);
  }
});
