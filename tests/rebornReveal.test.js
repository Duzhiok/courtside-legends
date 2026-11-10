/**
 * Player Reborn — identity-reveal buildup. The trust-40 reveal stays, but
 * it must land as a surprise: foreshadowing first, the name only at 40.
 * The hints never name the player (pinned — a leak would spoil the reveal).
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  REVEAL_HINTS,
  revealHints,
  latestRevealHint,
  revealLine,
} from "../js/reborn/reveal.js";
import { drawIdentity, createRebornState } from "../js/reborn/identity.js";
import { buildSeason, playGame } from "../js/reborn/season.js";

const ROWS = JSON.parse(
  readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8"),
).players;

test("reveal hints unlock in order at trust 28 / 33 / 37, none before 28", () => {
  const identity = { kind: "historical", revealed: false, name: "张三", nameEn: "Zhang San" };
  assert.deepEqual(revealHints(identity, 0), []);
  assert.deepEqual(revealHints(identity, 27), []);
  assert.deepEqual(revealHints(identity, 28).map((h) => h.id), ["teammate-remark"]);
  assert.deepEqual(revealHints(identity, 33).map((h) => h.id), [
    "teammate-remark",
    "coach-double-take",
  ]);
  assert.deepEqual(revealHints(identity, 39).map((h) => h.id), [
    "teammate-remark",
    "coach-double-take",
    "newspaper-photo",
  ]);
  assert.equal(latestRevealHint(identity, 27), null);
  assert.equal(latestRevealHint(identity, 33).id, "coach-double-take");
  assert.equal(latestRevealHint(identity, 39).id, "newspaper-photo");
  // Thresholds are the module's own table — no hidden fourth beat.
  assert.deepEqual(REVEAL_HINTS.map((h) => h.trust), [28, 33, 37]);
});

test("no hint ever names the player — checked against real historical identities", () => {
  // A leak in any language would spoil the reveal, so check every hint
  // against several real drawn identities (names + English names).
  const names = new Set();
  for (const seed of ["reborn-hint-1", "reborn-hint-2", "reborn-hint-3", "reborn-hint-4"]) {
    const identity = drawIdentity(seed, ROWS);
    if (identity.kind === "historical") {
      names.add(identity.name);
      names.add(identity.nameEn);
    }
  }
  assert.ok(names.size >= 2, "fixture seeds must draw historical identities");
  for (const name of names) {
    for (const hint of REVEAL_HINTS) {
      assert.ok(!hint.zh.includes(name), `zh hint ${hint.id} leaks ${name}`);
      assert.ok(!hint.en.includes(name), `en hint ${hint.id} leaks ${name}`);
    }
  }
});

test("fictional and already-revealed identities get no foreshadowing", () => {
  const fictional = { kind: "fictional", revealed: true, name: "李四" };
  assert.deepEqual(revealHints(fictional, 39), []);
  const revealed = { kind: "historical", revealed: true, name: "王五" };
  assert.deepEqual(revealHints(revealed, 39), []);
  assert.equal(latestRevealHint(fictional, 39), null);
});

test("revealLine names the player — only for the reveal moment itself", () => {
  const identity = { kind: "historical", revealed: true, name: "张三", nameEn: "Zhang San" };
  assert.match(revealLine(identity, "zh"), /张三/);
  assert.match(revealLine(identity, "en"), /Zhang San/);
  assert.equal(revealLine(null), null);
});

test("playGame report carries revealedNow when trust crosses 40 in that game", async () => {
  // Trust 46, unrevealed: even the worst game (-5 performance, no
  // takeover) leaves trust at 41, so the reveal fires deterministically.
  // No assertion on the game's score or line — only on the reveal flag.
  const state = createRebornState("reborn-reveal-1", ROWS);
  assert.equal(state.identity.kind, "historical", "fixture seed must draw historical");
  assert.equal(state.identity.revealed, false);
  const reborn = structuredClone(state);
  reborn.player.coachTrust = 46;
  const season = buildSeason(reborn, ROWS, {
    games: [{ homeId: reborn.player.teamId, awayId: "CHI", day: 1 }],
  });
  const out = await playGame(reborn, season, ROWS, {});
  assert.ok(out, "one game must play");
  assert.equal(typeof out.report.revealedNow, "boolean");
  assert.equal(out.report.revealedNow, true);
  assert.equal(out.reborn.identity.revealed, true);
});
