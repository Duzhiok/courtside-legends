import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { AVATAR_DIR, MAX_BYTES, manifestFor, manifestSource } from "../scripts/avatars/build-manifest.mjs";
import { LOCAL_AVATARS } from "../js/data/avatars.local.js";

const root = new URL("../", import.meta.url);
const files = readdirSync(new URL(`${AVATAR_DIR}/`, root));
const ROSTER_BREFS = new Set(JSON.parse(readFileSync(new URL("js/data/roster.json", root), "utf8")).players.map((row) => row.bref));

test("manifestFor maps <bref>.<ext> files and ignores .gitkeep", () => {
  assert.deepEqual(manifestFor([".gitkeep", "jordami01.webp", "birdla01.png", "kingbe01.jpg"]), {
    birdla01: "assets/avatars/birdla01.png",
    jordami01: "assets/avatars/jordami01.webp",
    kingbe01: "assets/avatars/kingbe01.jpg",
  });
  assert.deepEqual(manifestFor([]), {});
});

test("a misspelt or duplicate file is an error, not a silently missing illustration", () => {
  assert.throws(() => manifestFor(["Michael Jordan.webp"]), /not <bref>/);
  assert.throws(() => manifestFor(["jordami01.gif"]), /not <bref>/);
  assert.throws(() => manifestFor(["jordami1.webp"]), /not <bref>/);
  assert.throws(() => manifestFor(["jordami01.webp", "jordami01.png"]), /already has/);
});

test("the committed manifest matches the folder (run scripts/avatars/build-manifest.mjs after adding a file)", () => {
  assert.deepEqual(LOCAL_AVATARS, manifestFor(files));
  assert.match(manifestSource(LOCAL_AVATARS), /AUTO-GENERATED/);
});

test("every illustration belongs to a real player and stays small enough to ship", () => {
  for (const [bref, path] of Object.entries(LOCAL_AVATARS)) {
    assert.ok(ROSTER_BREFS.has(bref), `${bref} is not in the roster, so it would never show`);
    assert.ok(statSync(new URL(path, root)).size <= MAX_BYTES, `${path} is over ${MAX_BYTES / 1024} KB`);
  }
});
