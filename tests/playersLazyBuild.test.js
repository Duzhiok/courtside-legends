import test from "node:test";
import assert from "node:assert/strict";
import {
  PLAYERS,
  seasonToCard,
  cardForRow,
  getSeasonCards,
  isPlayersReady,
  playersReady,
  assertPlayersReady,
} from "../js/data/players.js";

// perf-r3 (lazy card build): these are pure-function contracts that don't touch the real
// loadPlayers() cold path (that only runs in a browser fetching roster.json — see
// tests/helpers/sampleRoster.js). Node tests push cards onto PLAYERS directly, so
// isPlayersReady() must stay true for every other test file in the suite; pin that here.

test("isPlayersReady: true by default (every Node test bypasses loadPlayers and must see an instantly-ready pool)", () => {
  assert.equal(isPlayersReady(), true);
});

test("playersReady: resolves immediately (with the current PLAYERS) when already ready", async () => {
  const resolved = await playersReady();
  assert.equal(resolved, PLAYERS);
});

test("assertPlayersReady: a no-op (no throw, no console noise needed) once ready", () => {
  // Ready is the steady state for the whole suite; this must never throw.
  assert.doesNotThrow(() => assertPlayersReady("test probe"));
});

test("cardForRow: memoized by row identity — same row object returns the identical card instance", () => {
  const row = { season: 1996, team: "CHI", name: "Test Player", ppg: 20, mpg: 32, gp: 70 };
  const a = cardForRow(row);
  const b = cardForRow(row);
  assert.equal(a, b, "must be the exact same object, not just deep-equal");
  assert.equal(a.name, "Test Player");
});

test("cardForRow: a different row object (even with identical fields) builds its own card, not a stale cached one", () => {
  const row1 = { season: 2000, team: "LAL", name: "A", ppg: 10, mpg: 20, gp: 50 };
  const row2 = { season: 2000, team: "LAL", name: "A", ppg: 10, mpg: 20, gp: 50 };
  const a = cardForRow(row1);
  const b = cardForRow(row2);
  assert.notEqual(a, b);
  assert.deepEqual(a.name, b.name);
});

test("cardForRow: matches seasonToCard's output for the same row (it's the memoized wrapper, not a different builder)", () => {
  const row = { season: 1999, team: "SAS", name: "Duncan Test", ppg: 21, mpg: 39, gp: 82 };
  assert.deepEqual(cardForRow(row), seasonToCard(row));
});

test("getSeasonCards: without loadPlayers() having set up raw rows, returns an empty array rather than throwing", () => {
  // _rawRows is module-private and only populated by the real browser cold path; a caller that
  // asks for a season before that (or in Node, ever) must get [] back, not a crash.
  assert.deepEqual(getSeasonCards(1874), []);
});
