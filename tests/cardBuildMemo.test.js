import test from "node:test";
import assert from "node:assert/strict";
import { eraPhoto } from "../js/data/photo.js";
import { signatureBrefForName } from "../js/data/skills.js";
import { attachIntangibles } from "../js/data/intangibles.js";

test("card-build memo: eraPhoto returns the same credited photo on repeat calls", () => {
  const first = eraPhoto({ bref: "jordami01", season: 1996 });
  assert.ok(first?.includes("Michael_Jordan"), `expected a Jordan photo, got ${first}`);
  assert.equal(eraPhoto({ bref: "jordami01", season: 1996 }), first);
  // A different decade resolves on its own key, not on the 1990s hit.
  const eighties = eraPhoto({ bref: "jordami01", season: 1986 });
  assert.equal(eraPhoto({ bref: "jordami01", season: 1986 }), eighties);
});

test("card-build memo: eraPhoto caches nulls too (unknown bref, no bref)", () => {
  assert.equal(eraPhoto({ bref: "nobodyxx00", season: 2000 }), null);
  assert.equal(eraPhoto({ bref: "nobodyxx00", season: 2000 }), null);
  assert.equal(eraPhoto({ season: 2000 }), null);
  assert.equal(eraPhoto(null), null);
});

test("card-build memo: signatureBrefForName resolves the same bref on repeat calls", () => {
  assert.equal(signatureBrefForName({ nameEn: "Ray Allen", name: "雷·阿伦" }), "allenra02");
  assert.equal(signatureBrefForName({ nameEn: "Ray Allen", name: "雷·阿伦" }), "allenra02");
  assert.equal(signatureBrefForName({ nameEn: "Nobody", name: "无名" }), null);
  assert.equal(signatureBrefForName({ nameEn: "Nobody", name: "无名" }), null);
});

test("card-build memo: attachIntangibles is deterministic for the same player (bump memos)", () => {
  const player = (name, nameEn, bref) => ({
    bref,
    season: 1996,
    name,
    nameEn,
    age: 33,
    stamina: 95,
    strength: 85,
    iq: 95,
    three: 70,
    pos: "SG",
    defense: 90,
    steal: 80,
    scoring: 98,
    paint: 85,
    raw: { gp: 82, mpg: 37, ppg: 30, apg: 4, tpg: 2, spg: 2, bpg: 0.5 },
  });
  const a = attachIntangibles(player("Michael Jordan", "Michael Jordan", "jordami01"));
  const b = attachIntangibles(player("Michael Jordan", "Michael Jordan", "jordami01"));
  assert.deepEqual(a.intangibles, b.intangibles);
  assert.deepEqual(a.tags, b.tags);
  // Bref-less players fall back to a name key, so each name resolves on its
  // own entry and repeats deterministically.
  const zion = attachIntangibles(player("Zion Williamson", "Zion Williamson", ""));
  const zion2 = attachIntangibles(player("Zion Williamson", "Zion Williamson", ""));
  assert.deepEqual(zion.intangibles, zion2.intangibles);
  const john = attachIntangibles(player("John Smith", "John Smith", ""));
  assert.deepEqual(john.intangibles, attachIntangibles(player("John Smith", "John Smith", "")).intangibles);
});
