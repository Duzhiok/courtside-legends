/**
 * M4-C Career Identity Snapshot (ADR-004 D1 boundary): at career creation
 * the account's current identity places are frozen onto the career record;
 * later account edits never rewrite it, and it never writes back to the
 * account. Careers without a snapshot (old saves, place-less accounts)
 * fall back to the account's live places.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  snapshotIdentityPlaces,
  careerIdentitySnapshot,
  resolveCareerIdentityPlaces,
} from "../js/career/careerIdentitySnapshot.js";
import { createLeagueCareer } from "../js/modes/leagueCareer.js";
import {
  acceptInterviewOffer,
  acceptReemploymentOffer,
  createTimeTravelPrologue,
  generateReemploymentOffers,
} from "../js/modes/timeTravelCareer.js";
import { historicalSeason } from "../js/data/historicalSeasons.js";
import { PLAYERS } from "../js/data/players.js";
import { createRebornState } from "../js/reborn/identity.js";
import { createRebornFromChoice, creationChoices } from "../js/ui/reborn/creation.js";
import { createRootState, readRootSave, validateRoot, writeRootSave } from "../js/data/saveRoot.js";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

const PLACES = { birthplace: "Chicago", grewUpIn: "Naperville", representedCity: "Chicago" };
const NEW_PLACES = { birthplace: "Shanghai", grewUpIn: "Shanghai", representedCity: "Shanghai" };
const ACCOUNT = { profile: { identityPlaces: PLACES } };
const NEW_ACCOUNT = { profile: { identityPlaces: NEW_PLACES } };

// Time-travel fixture (same shape as timeTravelCareer.test.js): the 1991
// season needs test player cards or the interview roster build fails.
const INPUT = { year: 1991, philosophy: "analytics", seed: 42 };
function playerCard(team, index) {
  const rating = 55 + ((team.charCodeAt(0) + index) % 35);
  return {
    id: `test-${team}-${index}`,
    name: `${team} Player ${index}`,
    season: 1991,
    team,
    pos: "SF",
    scoring: rating,
    three: rating,
    mid: rating,
    paint: rating,
    defense: rating,
    rebound: rating,
    pass: rating,
    speed: rating,
    strength: rating,
    stamina: rating,
    iq: rating,
    clutch: rating,
    steal: rating,
    block: rating,
  };
}
for (const team of historicalSeason(1991).teams) {
  for (let index = 0; index < 12; index++) {
    PLAYERS.push(playerCard(team.bref || team.id, index));
  }
}
for (let index = 0; index < 12; index++) {
  PLAYERS.push(playerCard("FREE", index));
}

function acceptedRoot(identityPlaces) {
  const prologue = createTimeTravelPrologue(INPUT);
  return acceptInterviewOffer(prologue, prologue.offers[0].id, { identityPlaces });
}

// ---------------------------------------------------------------- snapshot helper

test("snapshotIdentityPlaces: sanitizes like the account contract (40-char cap, empty → null)", () => {
  assert.deepEqual(snapshotIdentityPlaces(PLACES), PLACES);
  assert.deepEqual(snapshotIdentityPlaces({ birthplace: "  Chicago  ", grewUpIn: "", representedCity: " " }), {
    birthplace: "Chicago",
    grewUpIn: null,
    representedCity: null,
  });
  assert.equal(snapshotIdentityPlaces({ birthplace: "x".repeat(50) }).birthplace.length, 40);
  assert.equal(snapshotIdentityPlaces({ birthplace: "", grewUpIn: "", representedCity: "" }), null);
  assert.equal(snapshotIdentityPlaces(null), null);
  assert.equal(snapshotIdentityPlaces(undefined), null);
  assert.equal(snapshotIdentityPlaces("Chicago"), null);
});

test("careerIdentitySnapshot: returns a copy — mutating it never touches the stored record", () => {
  const career = createLeagueCareer({
    kind: "franchise",
    season: { phase: "regular" },
    identityPlaces: PLACES,
  });
  const first = careerIdentitySnapshot(career);
  assert.deepEqual(first, PLACES);
  first.birthplace = "Mutated";
  assert.equal(careerIdentitySnapshot(career).birthplace, "Chicago");
  assert.equal(careerIdentitySnapshot(null), null);
  assert.equal(careerIdentitySnapshot({}), null);
});

// ---------------------------------------------------------------- creation stamping

test("createLeagueCareer: stamps the snapshot at creation; absent when the account has no places", () => {
  const career = createLeagueCareer({
    kind: "franchise",
    season: { phase: "regular" },
    identityPlaces: PLACES,
  });
  assert.deepEqual(career.identitySnapshot, PLACES);
  const bare = createLeagueCareer({ kind: "franchise", season: { phase: "regular" } });
  assert.equal("identitySnapshot" in bare, false);
  const empty = createLeagueCareer({
    kind: "franchise",
    season: { phase: "regular" },
    identityPlaces: { birthplace: "", grewUpIn: "", representedCity: "" },
  });
  assert.equal("identitySnapshot" in empty, false);
});

test("acceptInterviewOffer: stamps the snapshot on the new time-travel career", () => {
  const root = acceptedRoot(PLACES);
  assert.deepEqual(root.leagueCareer.identitySnapshot, PLACES);
  const bare = acceptedRoot(undefined);
  assert.equal("identitySnapshot" in bare.leagueCareer, false);
});

test("createRebornState: stamps the snapshot on the new Reborn run", () => {
  const reborn = createRebornState("m4c-test-seed", ROWS, { startYear: 1996, identityPlaces: PLACES });
  assert.deepEqual(reborn.identitySnapshot, PLACES);
  const bare = createRebornState("m4c-test-seed", ROWS, { startYear: 1996 });
  assert.equal("identitySnapshot" in bare, false);
});

test("createRebornFromChoice: all three destinies stamp the snapshot", () => {
  const seed = "m4c-test-seed";
  const choices = creationChoices(ROWS, seed, 1996);
  const random = createRebornFromChoice({
    seed,
    rows: ROWS,
    choice: { startYear: 1996, destiny: "random" },
    identityPlaces: PLACES,
  });
  assert.deepEqual(random.identitySnapshot, PLACES);
  const historical = createRebornFromChoice({
    seed,
    rows: ROWS,
    choice: { startYear: 1996, destiny: "historical", bref: choices.historical[0].bref },
    identityPlaces: PLACES,
  });
  assert.deepEqual(historical.identitySnapshot, PLACES);
  const fictional = createRebornFromChoice({
    seed,
    rows: ROWS,
    choice: { startYear: 1996, destiny: "fictional", bref: choices.fictional[0].bref },
    identityPlaces: PLACES,
  });
  assert.deepEqual(fictional.identitySnapshot, PLACES);
});

// ---------------------------------------------------------------- no write-back, fallback

test("no write-back: editing the account after creation leaves the career snapshot untouched", () => {
  const career = createLeagueCareer({
    kind: "franchise",
    season: { phase: "regular" },
    identityPlaces: PLACES,
  });
  // The account moves on; the career still plays under the old snapshot.
  assert.deepEqual(resolveCareerIdentityPlaces(career, NEW_ACCOUNT), PLACES);
  assert.deepEqual(careerIdentitySnapshot(career), PLACES);
  // The snapshot never flows back into the account either.
  assert.deepEqual(NEW_ACCOUNT.profile.identityPlaces, NEW_PLACES);
});

test("resolveCareerIdentityPlaces: no snapshot falls back to the live account places", () => {
  const bare = createLeagueCareer({ kind: "franchise", season: { phase: "regular" } });
  assert.deepEqual(resolveCareerIdentityPlaces(bare, ACCOUNT), PLACES);
  assert.equal(resolveCareerIdentityPlaces(bare, { profile: {} }), null);
  assert.equal(resolveCareerIdentityPlaces(bare, null), null);
  assert.deepEqual(resolveCareerIdentityPlaces(null, ACCOUNT), PLACES);
});

test("resolveCareerIdentityPlaces: accepts a guest profile / readIdentity() shape too", () => {
  const bare = createLeagueCareer({ kind: "franchise", season: { phase: "regular" } });
  // A guest profile (or readIdentity result) carries identityPlaces directly.
  assert.deepEqual(resolveCareerIdentityPlaces(bare, { identityPlaces: PLACES }), PLACES);
  // The snapshot still wins over live places in either shape.
  const career = createLeagueCareer({
    kind: "franchise",
    season: { phase: "regular" },
    identityPlaces: PLACES,
  });
  assert.deepEqual(resolveCareerIdentityPlaces(career, { identityPlaces: NEW_PLACES }), PLACES);
});

// ---------------------------------------------------------------- old-save compatibility

test("old saves: a career without a snapshot still validates and reads", () => {
  const root = acceptedRoot(undefined);
  assert.doesNotThrow(() => validateRoot(root));
  assert.equal(careerIdentitySnapshot(root.leagueCareer), null);
  assert.deepEqual(resolveCareerIdentityPlaces(root.leagueCareer, ACCOUNT), PLACES);

  // A snapshot deleted by hand (or never written) is equally fine.
  const stripped = acceptedRoot(PLACES);
  delete stripped.leagueCareer.identitySnapshot;
  assert.doesNotThrow(() => validateRoot(stripped));

  const rebornRoot = createRootState({
    reborn: createRebornState("m4c-test-seed", ROWS, { startYear: 1996 }),
  });
  assert.doesNotThrow(() => validateRoot(rebornRoot));
});

test("old saves: a snapshot survives a write/read round-trip", () => {
  const root = acceptedRoot(PLACES);
  const storage = createMemoryStorage();
  writeRootSave(root, storage);
  const back = readRootSave(storage);
  assert.deepEqual(back.leagueCareer.identitySnapshot, PLACES);
  assert.deepEqual(resolveCareerIdentityPlaces(back.leagueCareer, NEW_ACCOUNT), PLACES);
});

test("corrupt snapshots are rejected, not silently passed through", () => {
  const badType = acceptedRoot(PLACES);
  badType.leagueCareer.identitySnapshot = { birthplace: 123 };
  assert.throws(() => validateRoot(badType), /invalid root save/);
  const tooLong = acceptedRoot(PLACES);
  tooLong.leagueCareer.identitySnapshot = { birthplace: "x".repeat(41) };
  assert.throws(() => validateRoot(tooLong), /invalid root save/);
  const badReborn = createRootState({
    reborn: createRebornState("m4c-test-seed", ROWS, { startYear: 1996, identityPlaces: PLACES }),
  });
  badReborn.reborn.identitySnapshot = { grewUpIn: 7 };
  assert.throws(() => validateRoot(badReborn), /invalid root save/);
});

// ---------------------------------------------------------------- re-employment is not a new career

test("re-employment carries the original snapshot forward — it is not re-snapshotted", () => {
  const root = acceptedRoot(PLACES);
  const fired = {
    ...root,
    story: {
      ...root.story,
      employment: { status: "fired", contractYears: 3, tenureStartSeasonCount: 0 },
    },
  };
  const offer = generateReemploymentOffers(fired)[0];
  assert.ok(offer, "a fired coach always has an offer");
  const next = acceptReemploymentOffer(fired, offer.id);
  assert.deepEqual(next.leagueCareer.identitySnapshot, PLACES);
  // Even if the account moved on in the meantime, the new stint keeps the old snapshot.
  assert.deepEqual(resolveCareerIdentityPlaces(next.leagueCareer, NEW_ACCOUNT), PLACES);
});
