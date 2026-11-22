import test from "node:test";
import assert from "node:assert/strict";
import { eraPhoto } from "../js/data/photo.js";
import { signatureBrefForName } from "../js/data/skills.js";
import { attachIntangibles } from "../js/data/intangibles.js";

// Shared fixture for the attachIntangibles tests below: identical ratings and
// raw line, so any intangibles difference between two calls comes only from
// the identity inputs (bref / name) the bump memos key on.
const makePlayer = (name, bref) => ({
  bref,
  season: 1996,
  name,
  nameEn: name,
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

test("card-build memo: eraPhoto returns the same credited photo on repeat calls", () => {
  const first = eraPhoto({ bref: "jordami01", season: 1996 });
  assert.ok(first?.includes("Michael_Jordan"), `expected a Jordan photo, got ${first}`);
  assert.equal(eraPhoto({ bref: "jordami01", season: 1996 }), first);
  // Jordan resolves to the same 1997 photo in both decades (the ±10-year
  // fallback, then the any-photo fallback), so this only pins repeat
  // stability — decade separation is pinned by the chambto01 test below.
  const eighties = eraPhoto({ bref: "jordami01", season: 1986 });
  assert.equal(eraPhoto({ bref: "jordami01", season: 1986 }), eighties);
});

test("card-build memo: eraPhoto keys by decade — same player, two decades, two photos", () => {
  // Tom Chambers has a different credited photo per decade, so the decade
  // is observable here — unlike Jordan, whose decades collapse to one file.
  const eighties = eraPhoto({ bref: "chambto01", season: 1986 });
  const nineties = eraPhoto({ bref: "chambto01", season: 1996 });
  assert.ok(eighties?.includes("Tom_Chambers"), `expected a Chambers photo, got ${eighties}`);
  assert.ok(nineties?.includes("Tom_Chambers"), `expected a Chambers photo, got ${nineties}`);
  // A key without the decade would serve the first decade's photo for both.
  assert.notEqual(eighties, nineties);
  assert.ok(eighties.includes("51937264090"), `expected the 1980s file, got ${eighties}`);
  assert.ok(nineties.includes("51936725248"), `expected the 1990s file, got ${nineties}`);
  // And each decade's entry repeats stably.
  assert.equal(eraPhoto({ bref: "chambto01", season: 1986 }), eighties);
  assert.equal(eraPhoto({ bref: "chambto01", season: 1996 }), nineties);
});

test("card-build memo: eraPhoto keys by bref — different players never share an entry", () => {
  const jordan = eraPhoto({ bref: "jordami01", season: 1996 });
  const chambers = eraPhoto({ bref: "chambto01", season: 1996 });
  assert.ok(jordan?.includes("Michael_Jordan"), `expected a Jordan photo, got ${jordan}`);
  assert.ok(chambers?.includes("Tom_Chambers"), `expected a Chambers photo, got ${chambers}`);
  // A key without the bref would serve Jordan's photo for every 1990s card.
  assert.notEqual(jordan, chambers);
  // Looking one player up must not poison the other's entry.
  assert.equal(eraPhoto({ bref: "jordami01", season: 1996 }), jordan);
  assert.equal(eraPhoto({ bref: "chambto01", season: 1996 }), chambers);
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
  const a = attachIntangibles(makePlayer("Michael Jordan", "jordami01"));
  const b = attachIntangibles(makePlayer("Michael Jordan", "jordami01"));
  assert.deepEqual(a.intangibles, b.intangibles);
  assert.deepEqual(a.tags, b.tags);
  // Bref-less players fall back to a name key, so each name resolves on its
  // own entry and repeats deterministically.
  const zion = attachIntangibles(makePlayer("Zion Williamson", ""));
  const zion2 = attachIntangibles(makePlayer("Zion Williamson", ""));
  assert.deepEqual(zion.intangibles, zion2.intangibles);
  const john = attachIntangibles(makePlayer("John Smith", ""));
  assert.deepEqual(john.intangibles, attachIntangibles(makePlayer("John Smith", "")).intangibles);
});

test("card-build memo: bref-less bump keys fall back to the name — different names, different bumps", () => {
  const zion = attachIntangibles(makePlayer("Zion Williamson", ""));
  const john = attachIntangibles(makePlayer("John Smith", ""));
  // Zion's name matches the glass-cannon regex (bump 18); John Smith matches
  // none (bump 0). The pinned injuryRisk values encode the bump (injuryBias
  // adds the glass bump) plus each player's seeded noise — a key that
  // dropped the name fallback would serve one player's bumps to every
  // bref-less player and move John's injuryRisk off 28 (and cost him the
  // 铁人 tag, which needs injuryRisk <= 32).
  assert.notDeepEqual(zion.intangibles, john.intangibles);
  assert.equal(zion.intangibles.injuryRisk, 56);
  assert.equal(john.intangibles.injuryRisk, 28);
  assert.deepEqual(zion.tags, []);
  assert.deepEqual(john.tags, ["铁人"]);
});

test("card-build memo: bump keys prefer bref over name — same name, different bref", () => {
  const noBref = attachIntangibles(makePlayer("Zion Williamson", ""));
  const withBref = attachIntangibles(makePlayer("Zion Williamson", "willizi01"));
  // Same name, but the bref resolves through the bref-keyed tables
  // (willizi01 glass 19) instead of the name regexes (18), and the seeded
  // fields draw from a different seed — a name-only key would collide the
  // two and serve the first one's bumps to both.
  assert.notDeepEqual(noBref.intangibles, withBref.intangibles);
  assert.equal(noBref.intangibles.injuryRisk, 56);
  assert.equal(withBref.intangibles.injuryRisk, 44);
});
