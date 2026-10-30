import test from "node:test";
import assert from "node:assert/strict";
import { buildStintRecord } from "../js/career/stints.js";

function root(overrides = {}) {
  return {
    story: { employer: "CHI", startYear: 1991 },
    leagueCareer: { season: { year: 1995 } },
    ...overrides,
  };
}

const performance = { seasons: 5, wins: 220, games: 300, championships: 1 };

test("buildStintRecord captures team, year span, record, and the reason it ended", () => {
  const stint = buildStintRecord(root(), performance, "fired");
  assert.deepEqual(stint, {
    teamId: "CHI",
    startYear: 1991,
    endYear: 1995,
    seasons: 5,
    wins: 220,
    losses: 80,
    championships: 1,
    reason: "fired",
  });
});

test("buildStintRecord never produces negative losses even with a malformed performance object", () => {
  const stint = buildStintRecord(root(), { seasons: 2, wins: 50, games: 40, championships: 0 }, "departed");
  assert.equal(stint.losses, 0, "games < wins should never happen, but must not go negative");
});

test("buildStintRecord falls back to null for a missing startYear or season year", () => {
  const stint = buildStintRecord(
    root({ story: { employer: "CHI" }, leagueCareer: { season: {} } }),
    performance,
    "fired",
  );
  assert.equal(stint.startYear, null);
  assert.equal(stint.endYear, null);
});

test("buildStintRecord requires a root with a career story", () => {
  assert.throws(() => buildStintRecord({}, performance, "fired"), TypeError);
  assert.throws(() => buildStintRecord(null, performance, "fired"), TypeError);
});
