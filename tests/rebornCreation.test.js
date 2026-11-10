/**
 * Player Reborn — career creation. The random destiny stays seeded (same
 * seed + same choice = same person); chosen identities are built from the
 * row / prospect the player picked. The 70/30 split is not changed here.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  creationChoices,
  createRebornFromChoice,
  creationHtml,
  campTeamFor,
} from "../js/ui/reborn/creation.js";
import { drawIdentity, benchPool } from "../js/reborn/identity.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

test("creationChoices: the bench pool and the generated prospects for a start year", () => {
  const choices = creationChoices(ROWS, "reborn-create-1", 1996);
  assert.equal(choices.season, 1997);
  assert.equal(choices.historical.length, 80);
  assert.ok(choices.historical.every((e) => e.bref && e.team && e.pos));
  assert.equal(choices.fictional.length, 20, "20 generated prospects per seed");
  assert.ok(choices.fictional.every((e) => e.bref.startsWith("generated-")));
  assert.ok(choices.fictional.every((e) => e.team && e.pos));
  // Deterministic: the same seed lists the same prospects.
  const again = creationChoices(ROWS, "reborn-create-1", 1996);
  assert.deepEqual(again, choices);
  const choices95 = creationChoices(ROWS, "reborn-create-1", 1995);
  assert.equal(choices95.season, 1996);
  assert.equal(choices95.historical.length, 88);
});

test("campTeamFor is deterministic per seed + bref", () => {
  const team = campTeamFor("reborn-create-1", "generated-abc");
  assert.equal(campTeamFor("reborn-create-1", "generated-abc"), team);
  assert.notEqual(campTeamFor("reborn-create-2", "generated-abc"), team, "a different seed may assign a different team");
});

test("random destiny: same seed + same choice draws the same person", () => {
  const a = createRebornFromChoice({
    seed: "reborn-create-2",
    rows: ROWS,
    choice: { startYear: 1996, destiny: "random" },
  });
  const b = createRebornFromChoice({
    seed: "reborn-create-2",
    rows: ROWS,
    choice: { startYear: 1996, destiny: "random" },
  });
  assert.deepEqual(a, b);
  assert.equal(a.origin, "random-destiny");
  assert.equal(a.startYear, 1996);
  assert.equal(a.player.seasonYear, 1997);
  // And it is exactly the seeded draw for that seed.
  assert.deepEqual(a.identity, drawIdentity("reborn-create-2", ROWS, { season: 1997 }));
});

test("chosen historical identity: the picked row, known from the start", () => {
  const pool = benchPool(ROWS, 1997);
  const row = pool[3];
  const state = createRebornFromChoice({
    seed: "reborn-create-3",
    rows: ROWS,
    choice: { startYear: 1996, destiny: "historical", bref: row.bref },
  });
  assert.equal(state.identity.bref, row.bref);
  assert.equal(state.identity.name, row.name);
  assert.equal(state.identity.team, row.team);
  assert.equal(state.identity.revealed, true, "chosen identities are known from the start");
  assert.equal(state.origin, "chosen-identity");
  assert.equal(state.player.teamId, row.team);
  // A starter is not a bench player and cannot be picked.
  const starter = ROWS.find((r) => r.season === 1997 && r.mpg >= 30);
  assert.ok(starter, "fixture needs a starter row");
  assert.throws(
    () =>
      createRebornFromChoice({
        seed: "reborn-create-3",
        rows: ROWS,
        choice: { startYear: 1996, destiny: "historical", bref: starter.bref },
      }),
    /bench player/,
  );
  assert.throws(
    () =>
      createRebornFromChoice({
        seed: "reborn-create-3",
        rows: ROWS,
        choice: { startYear: 1996, destiny: "historical", bref: "nope01" },
      }),
    /no .* bench player/,
  );
});

test("chosen fictional identity: the picked prospect, on a real team", () => {
  const choices = creationChoices(ROWS, "reborn-create-4", 1996);
  const pick = choices.fictional[0];
  const state = createRebornFromChoice({
    seed: "reborn-create-4",
    rows: ROWS,
    choice: { startYear: 1996, destiny: "fictional", bref: pick.bref },
  });
  assert.equal(state.identity.bref, pick.bref);
  assert.equal(state.identity.kind, "fictional");
  assert.equal(state.identity.team, pick.team, "the list and the factory assign the same team");
  assert.equal(state.identity.revealed, true);
  assert.equal(state.origin, "chosen-identity");
  assert.throws(
    () =>
      createRebornFromChoice({
        seed: "reborn-create-4",
        rows: ROWS,
        choice: { startYear: 1996, destiny: "fictional", bref: "jordami01" },
      }),
    /no generated prospect/,
  );
  assert.throws(
    () =>
      createRebornFromChoice({
        seed: "reborn-create-4",
        rows: ROWS,
        choice: { startYear: 1996, destiny: "mystery" },
      }),
    /unknown destiny/,
  );
});

test("creationHtml: years, destinies and lists render; the random draw stays unnamed", () => {
  const html = creationHtml({ rows: ROWS, seed: "reborn-create-5", lang: "zh", startYear: 1996 });
  assert.match(html, /1995–96/);
  assert.match(html, /1996–97/);
  assert.match(html, /随机命运/);
  assert.match(html, /自选历史替补/);
  assert.match(html, /自选虚构新秀/);
  assert.match(html, /更多历史年代即将推出/);
  // The random destiny panel never names the drawn person.
  const drawn = drawIdentity("reborn-create-5", ROWS, { season: 1997 });
  if (drawn.kind === "historical") {
    assert.ok(!html.includes(drawn.name), "the random draw must not leak the name");
  }
  // The historical list names real bench players.
  const listHtml = creationHtml({
    rows: ROWS,
    seed: "reborn-create-5",
    lang: "zh",
    startYear: 1996,
    destiny: "historical",
  });
  assert.match(listHtml, /当季替补池/);
  assert.match(listHtml, /共 80 人/);
  assert.ok(listHtml.includes(benchPool(ROWS, 1997)[0].name));
  // Confirm is disabled until a destiny is picked.
  assert.match(html, /disabled/);
  const confirmed = creationHtml({
    rows: ROWS,
    seed: "reborn-create-5",
    lang: "en",
    startYear: 1996,
    destiny: "random",
  });
  assert.ok(!confirmed.includes("disabled"), "random destiny can confirm at once");
  assert.match(confirmed, /Draw your destiny/);
});
