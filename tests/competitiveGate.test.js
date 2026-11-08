// 8-player competitive unlock gate (user decision 2026-11-08): once the account's roster
// reaches 8 players, ranked, My Team Season (the AI regular season) and online matches with
// your own roster unlock. Below 8 they stay locked. The gate counts account.playerIds.length.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import {
  MIN_COMPETITIVE_ROSTER,
  competitivePlayersNeeded,
  competitiveRosterCount,
  competitiveUnlocked,
} from "../js/data/competitiveGate.js";
import { MIN_DUEL_ROSTER } from "../server/online-economy.mjs";

globalThis.localStorage = createMemoryStorage();

const { PLAYERS, overall, seasonToCard } = await import("../js/data/players.js");
const { buildCareerSpanIndex } = await import("../js/data/careerArc.js");
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
PLAYERS.push(...ROWS.map(seasonToCard));

const { buildMyTeamSeason } = await import("../js/myteam/mySeason.js");

const STARS = ["curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01", "olajuha01", "garneke01"];
const peak = (b) => PLAYERS.filter((p) => p.bref === b).sort((x, y) => overall(y) - overall(x))[0];
const acct = (id = "acc-a", extra = {}) => ({ id, name: "Zed", playerIds: STARS.map((b) => peak(b).id), cardMods: {}, gold: 5, tacticId: "pace_space", ...extra });

test("gate helper: 7 locks with 1 needed, 8 unlocks, guest locks with 8 needed", () => {
  assert.equal(MIN_COMPETITIVE_ROSTER, 8);
  assert.equal(competitiveRosterCount(null), 0);
  assert.equal(competitiveUnlocked(null), false);
  assert.equal(competitivePlayersNeeded(null), 8);
  assert.equal(competitiveRosterCount({ playerIds: [] }), 0);
  assert.equal(competitiveUnlocked({ playerIds: [] }), false);
  const seven = { playerIds: acct().playerIds.slice(0, 7) };
  assert.equal(competitiveRosterCount(seven), 7);
  assert.equal(competitiveUnlocked(seven), false);
  assert.equal(competitivePlayersNeeded(seven), 1);
  const eight = { playerIds: acct().playerIds.slice(0, 8) };
  assert.equal(competitiveRosterCount(eight), 8);
  assert.equal(competitiveUnlocked(eight), true);
  assert.equal(competitivePlayersNeeded(eight), 0);
  assert.equal(competitiveUnlocked(acct()), true, "10 players unlock");
});

test("My Team Season (AI regular season): 7-card account cannot start, 8-card account can", () => {
  const seven = buildMyTeamSeason(acct("acc-7", { playerIds: acct().playerIds.slice(0, 7) }), { variant: "quick", seed: 7 });
  assert.equal(seven.ok, false);
  assert.equal(seven.reason, "invalid");
  assert.ok(
    seven.issues.some((i) => i.code === "roster_small" && i.have === 7 && i.min === 8),
    JSON.stringify(seven.issues),
  );
  const eight = buildMyTeamSeason(acct("acc-8", { playerIds: acct().playerIds.slice(0, 8) }), { variant: "quick", seed: 7 });
  assert.equal(eight.ok, true, JSON.stringify(eight));
  assert.equal(eight.season.teams[eight.season.userTeamId].players.length, 8);
});

test("online duel minimum matches the competitive gate", () => {
  assert.equal(MIN_DUEL_ROSTER, MIN_COMPETITIVE_ROSTER, "server and client gates are the same 8");
});
