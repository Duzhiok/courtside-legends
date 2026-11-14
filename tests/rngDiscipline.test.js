import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// Guard: game logic draws randomness through js/core/rng.js (`rand()`), or takes an injected
// `rng` parameter. A direct Math.random() call cannot be seeded, so drafts, markets, packs and
// brackets built on it could never be replayed or tested with fixed seeds.
// Allowed: unique-id builders (`...toString(36)`), comments, and `rng = Math.random` defaults
// (a reference, not a call). UI, audio and js/core itself are out of scope.
const LOGIC_DIRS = ["engine", "data", "modes", "career", "reborn", "myteam", "duel", "story"];

function jsFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) jsFiles(path, out);
    else if (name.endsWith(".js")) out.push(path);
  }
  return out;
}

test("game logic never calls Math.random() directly (use rand() from js/core/rng.js)", () => {
  const root = new URL("..", import.meta.url).pathname;
  const offenders = [];
  for (const dir of LOGIC_DIRS) {
    for (const file of jsFiles(join(root, "js", dir))) {
      readFileSync(file, "utf8")
        .split("\n")
        .forEach((line, i) => {
          if (!line.includes("Math.random()")) return;
          if (line.includes("toString(36)") || /^\s*(\*|\/\/)/.test(line)) return;
          offenders.push(`${relative(root, file)}:${i + 1}`);
        });
    }
  }
  assert.deepEqual(offenders, []);
});
