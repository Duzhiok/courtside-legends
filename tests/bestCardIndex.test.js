// bestCardByBref used to scan the whole card library per call (the Hometown block asks ~100 times while the home screen is drawn).
// The ORACLE is that loop, copied as it was.
import test from "node:test";
import assert from "node:assert/strict";
import { createBestCardIndex } from "../js/data/bestCardIndex.js";
import { readFileSync } from "node:fs";
import { seasonToCard, overall } from "../js/data/players.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

const oracle = (list, bref) => {
  let best = null;
  for (const p of list) if (p.bref === bref && (!best || overall(p) > overall(best))) best = p;
  return best;
};

test("same card as the old scan for every player in a real slice of the library, ties included", () => {
  const list = ROWS.slice(0, 6000).map(seasonToCard);
  const get = createBestCardIndex(() => list, overall);
  const brefs = new Set(list.map((p) => p.bref));
  assert.ok(brefs.size > 100);
  for (const bref of brefs) assert.equal(get(bref), oracle(list, bref), bref);
  assert.equal(get("nobody01"), null);
  const a = { bref: "tie01", ovr: 70, id: "a" };
  const b = { bref: "tie01", ovr: 70, id: "b" };
  const tie = [a, b];
  assert.equal(createBestCardIndex(() => tie, (p) => p.ovr)("tie01"), a, "the earlier card keeps a tie");
});

test("rebuilds when the library is replaced or grows, and does not rescan otherwise", () => {
  let list = [{ bref: "x", r: 1, id: 1 }];
  let rated = 0;
  const get = createBestCardIndex(() => list, (p) => { rated++; return p.r; });
  assert.equal(get("x").id, 1);
  const after = rated;
  for (let i = 0; i < 50; i++) get("x");
  assert.equal(rated, after, "repeat asks cost nothing");
  list.push({ bref: "x", r: 5, id: 2 });
  assert.equal(get("x").id, 2, "grown in place");
  list = [{ bref: "y", r: 1, id: 3 }];
  assert.equal(get("x"), null, "replaced");
  assert.equal(get("y").id, 3);
});
