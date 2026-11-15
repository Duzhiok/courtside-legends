import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { seasonToCard } from "../js/data/players.js";
import { saveIdentity } from "../js/data/profile.js";
import { LOCATIONS } from "../js/data/hometown/locations.js";
import { LEGEND_LOCATIONS } from "../js/data/hometown/legendLocations.js";
import {
  RELATIONS,
  levelLabel,
  matchPlace,
  relationLabel,
  resolveForIdentity,
  resolveLegendsForPlace,
  splitPlaces,
  validateLegends,
} from "../js/data/hometown/hometown.js";
import {
  readHometownState,
  recordChallengeResult,
  sanitizeHometownState,
  setIdol,
} from "../js/data/hometown/hometownState.js";
import { buildChallengeTeam, pickOpponentTeam } from "../js/data/hometown/hometownChallenge.js";
import { playChallengeGame } from "../js/modes/hometownChallengeGame.js";
import { hometownHtml } from "../js/ui/hometownView.js";

// ---------- Fixtures (fake data: mechanism only, no real-person claims) ----------
const FIXTURE_LOCATIONS = [
  { id: "CN", level: "country", parentId: null, names: { zh: "中国", en: "China" }, aliases: [] },
  { id: "CN-SH", level: "region", parentId: "CN", names: { zh: "上海", en: "Shanghai" }, aliases: [] },
  { id: "CN-SH-SHANGHAI", level: "city", parentId: "CN-SH", names: { zh: "上海", en: "Shanghai" }, aliases: [] },
  { id: "US", level: "country", parentId: null, names: { zh: "美国", en: "United States" }, aliases: ["USA", "US"] },
  { id: "US-OH", level: "region", parentId: "US", names: { zh: "俄亥俄州", en: "Ohio" }, aliases: [] },
  { id: "US-OH-AKRON", level: "city", parentId: "US-OH", names: { zh: "阿克伦", en: "Akron" }, aliases: [] },
  { id: "US-CA", level: "region", parentId: "US", names: { zh: "加利福尼亚州", en: "California" }, aliases: [] },
  { id: "US-CA-LA", level: "city", parentId: "US-CA", names: { zh: "洛杉矶", en: "Los Angeles" }, aliases: ["LA"] },
  { id: "FR", level: "country", parentId: null, names: { zh: "法国", en: "France" }, aliases: [] },
  { id: "FR-IDF", level: "region", parentId: "FR", names: { zh: "法兰西岛", en: "Ile-de-France" }, aliases: [] },
  { id: "FR-IDF-PARIS", level: "city", parentId: "FR-IDF", names: { zh: "巴黎", en: "Paris" }, aliases: [] },
];
const src = { type: "reference", ref: "Fixture source, Example Reference p.1", checkedOn: "2026-11-11" };
const FIXTURE_RECORDS = [
  // One person, three relations, three different cities (ADR-009 §10 row 1)
  { bref: "fakea01", locationId: "CN-SH-SHANGHAI", relation: "BIRTHPLACE", source: src },
  { bref: "fakea01", locationId: "US-OH-AKRON", relation: "RAISED_IN", source: src },
  { bref: "fakea01", locationId: "US-CA-LA", relation: "TEAM_LEGACY", source: src },
  // A TEAM_LEGACY-only city (Los Angeles has nothing else in the fixture)
  // Region-level record: Ohio region, no Akron city record for this person
  { bref: "fakeb02", locationId: "US-OH", relation: "BIRTHPLACE", source: src },
  // Country-level record: China country, nothing at Shanghai city/region for this person
  { bref: "fakec03", locationId: "CN", relation: "BIRTHPLACE", source: src },
  { bref: "faked04", locationId: "CN", relation: "RAISED_IN", source: src },
  { bref: "fakee05", locationId: "US-OH", relation: "RAISED_IN", source: src },
  { bref: "fakef06", locationId: "US", relation: "BIRTHPLACE", source: src },
  { bref: "fakeg07", locationId: "US", relation: "TEAM_LEGACY", source: src },
];
const KNOWN = new Set(FIXTURE_RECORDS.map((r) => r.bref));
const fx = { records: FIXTURE_RECORDS, locations: FIXTURE_LOCATIONS, knownBrefs: KNOWN };
const NAMES = { fakea01: "Fake Alpha", fakeb02: "Fake Beta", fakec03: "Fake Gamma", faked04: "Fake Delta", fakee05: "Fake Epsilon", fakef06: "Fake Zeta", fakeg07: "Fake Eta" };

// ---------- Validation (ADR-009 §5) ----------
test("validation drops missing-source / unknown bref / unknown location / bad relation, dedupes, hides community", () => {
  const messy = [
    ...FIXTURE_RECORDS,
    { ...FIXTURE_RECORDS[0] }, // duplicate
    { bref: "fakea01", locationId: "CN-SH-SHANGHAI", relation: "BIRTHPLACE" }, // no source
    { bref: "fakea01", locationId: "CN-SH-SHANGHAI", relation: "BIRTHPLACE", source: { type: "reference", ref: "", checkedOn: "2026-11-11" } }, // empty ref
    { bref: "ghost99", locationId: "CN-SH-SHANGHAI", relation: "BIRTHPLACE", source: src }, // unknown bref
    { bref: "fakea01", locationId: "XX-NOWHERE", relation: "BIRTHPLACE", source: src }, // unknown location
    { bref: "fakea01", locationId: "CN-SH-SHANGHAI", relation: "COUSIN_OF", source: src }, // bad relation
    { bref: "fakeb02", locationId: "US-OH", relation: "BIRTHPLACE", source: { type: "community", ref: "forum post", checkedOn: "2026-11-11" } }, // community: hidden, not shown
  ];
  const out = validateLegends(messy, fx);
  assert.equal(out.records.length, FIXTURE_RECORDS.length, "only the clean fixture records survive, deduped");
  assert.equal(out.dropped.length, 6);
  assert.deepEqual(
    out.dropped.map((d) => d.reason).sort(),
    ["bad-relation", "duplicate", "missing-source", "missing-source", "unknown-bref", "unknown-location"],
    "every invalid record is dropped with its reason recorded",
  );
  assert.equal(out.hidden.length, 1, "community nomination is kept out of display, not counted as a failure");
  assert.equal(out.failures, 6);
});

test("relation labels are three distinct texts in both languages; TEAM_LEGACY never says hometown/born", () => {
  const zh = RELATIONS.map((r) => relationLabel(r, "zh"));
  const en = RELATIONS.map((r) => relationLabel(r, "en"));
  assert.equal(new Set(zh).size, 3);
  assert.equal(new Set(en).size, 3);
  assert.ok(zh[2].includes("效力"));
  assert.ok(!zh[2].includes("家乡") && !zh[2].includes("出生"));
  assert.ok(en[2].startsWith("Played for"));
  assert.ok(!/hometown|born/i.test(en[2]));
});

// ---------- Fallback chain (ADR-009 §6) ----------
test("city hit stops at city level; three relations in three cities resolve per city", () => {
  const sh = resolveLegendsForPlace("Shanghai", fx);
  assert.equal(sh.level, "city");
  assert.equal(sh.legends.length, 1);
  assert.equal(sh.legends[0].relation, "BIRTHPLACE");
  const akron = resolveLegendsForPlace("Akron", fx);
  assert.equal(akron.legends[0].relation, "RAISED_IN");
  const la = resolveLegendsForPlace("Los Angeles", fx);
  assert.equal(la.level, "city");
  assert.equal(la.legends[0].relation, "TEAM_LEGACY", "LA is a TEAM_LEGACY-only city in the fixture");
});

test("city with no records falls back to region, then country, with the level labelled", () => {
  // Remove the Akron city record: Akron -> Ohio region record
  const noAkron = { ...fx, records: FIXTURE_RECORDS.filter((r) => r.locationId !== "US-OH-AKRON") };
  const region = resolveLegendsForPlace("Akron", noAkron);
  assert.equal(region.level, "region");
  assert.equal(region.legends[0].bref, "fakeb02");
  assert.equal(levelLabel("region", "zh"), "本省传奇");
  // Shanghai: no city/region records in a trimmed set -> China country records
  const countryOnly = { ...fx, records: FIXTURE_RECORDS.filter((r) => r.locationId === "CN") };
  const country = resolveLegendsForPlace("Shanghai", countryOnly);
  assert.equal(country.level, "country");
  assert.equal(country.legends.length, 2);
  assert.equal(levelLabel("country", "en"), "Country legends");
});

test("no records anywhere in the chain -> chosen-idol entry, never an empty page", () => {
  const none = resolveLegendsForPlace("Paris", fx);
  assert.equal(none.level, "idol");
  assert.equal(none.needsIdol, true);
  assert.deepEqual(none.legends, []);
  const withIdol = resolveLegendsForPlace("Paris", { ...fx, idolBref: "fakeb02" });
  assert.equal(withIdol.level, "idol");
  assert.equal(withIdol.legends.length, 1);
  assert.equal(withIdol.legends[0].relation, "IDOL");
  const html = hometownHtml({ identity: { identityPlaces: { birthplace: "Paris" } }, state: sanitizeHometownState(null), lang: "en", names: NAMES, ...fx });
  assert.ok(html.includes("chosen idol"), "the idol entry is rendered");
  assert.ok(!/[\u4e00-\u9fff]/.test(html), "English UI has no Chinese residue");
});

test("unrecorded city text is kept as free text and falls back through its country part", () => {
  const res = resolveLegendsForPlace("Springfield, USA", fx);
  assert.equal(res.level, "country", "unknown city + known country -> country legends");
  assert.equal(res.placeText, "Springfield, USA", "the player's own words are preserved verbatim");
  const bare = resolveLegendsForPlace("Springfield", fx);
  assert.equal(bare.level, "idol", "a wholly unknown place still gets the idol entry");
  assert.equal(matchPlace("Akron", FIXTURE_LOCATIONS)?.id, "US-OH-AKRON");
  assert.deepEqual(splitPlaces("Akron, Chicago、Los Angeles; Paris, Extra"), ["Akron", "Chicago", "Los Angeles"]);
});

// ---------- Identity integration (approved account.identityPlaces contract) ----------
test("old account without identityPlaces resolves without error; empty identity is an honest empty state", () => {
  const out = resolveForIdentity(null, fx);
  assert.equal(out.birthplace, null);
  assert.deepEqual(out.grewUpIn, []);
  const out2 = resolveForIdentity({}, fx);
  assert.equal(out2.representedCity, null);
  const html = hometownHtml({ identity: {}, state: null, lang: "zh", names: NAMES, ...fx });
  assert.ok(html.includes("还没有填写出生地"), "empty state says so");
});

test("setting a birthplace adds no cards and no gold; idol + challenge state live in their own field", () => {
  const account = { id: "a1", name: "Tester", playerIds: ["x-2000"], gold: 321, profile: {} };
  const persist = () => {};
  saveIdentity(account, { identityPlaces: { birthplace: "Akron", grewUpIn: null, representedCity: null } }, { persist });
  assert.deepEqual(account.playerIds, ["x-2000"]);
  assert.equal(account.gold, 321);
  const before = JSON.stringify(account);
  resolveForIdentity(account.profile.identityPlaces, fx); // pure read: must not mutate the account
  assert.equal(JSON.stringify(account), before);
  const st = setIdol(account, "fakeb02", { knownBrefs: KNOWN, persist });
  assert.equal(st.idolBref, "fakeb02");
  assert.deepEqual(account.playerIds, ["x-2000"], "choosing an idol grants no card");
  assert.equal(account.gold, 321, "choosing an idol grants no gold");
  assert.throws(() => setIdol(account, "ghost99", { knownBrefs: KNOWN, persist }), /unknown/);
});

test("changing account places never reads or writes a career (Reborn) save", () => {
  const root = { schemaVersion: 4, reborn: { player: { name: "Rookie", hometown: "Chicago" } }, leagueCareer: null };
  const snapshot = JSON.stringify(root);
  const account = { id: "a2", name: "Tester", playerIds: [], gold: 0, profile: {} };
  saveIdentity(account, { identityPlaces: { birthplace: "Shanghai", grewUpIn: "Shanghai", representedCity: "Shanghai" } }, { persist: () => {} });
  recordChallengeResult(account, { won: true, representedCity: "Shanghai" }, { persist: () => {} });
  assert.equal(JSON.stringify(root), snapshot, "career save untouched");
  // The hometown state modules must not import the root-save layer at all.
  for (const f of ["hometown.js", "hometownState.js", "hometownChallenge.js"]) {
    const code = readFileSync(new URL(`../js/data/hometown/${f}`, import.meta.url), "utf8");
    assert.ok(!code.includes("saveRoot"), `${f} must not touch root saves`);
  }
  const challengeCode = readFileSync(new URL("../js/modes/hometownChallengeGame.js", import.meta.url), "utf8");
  assert.ok(challengeCode.includes("GameSim"), "the challenge runs on the existing GameSim, not a second simulator");
});

test("honours keep the represented city as it was when the challenge was played (no retroactive rewrite)", () => {
  const account = { id: "a3", name: "Tester", profile: { identityPlaces: { representedCity: "Akron" } } };
  recordChallengeResult(account, { won: true, representedCity: "Akron", at: "2026-11-11T00:00:00.000Z" }, { persist: () => {} });
  account.profile.identityPlaces.representedCity = "Paris"; // player changes their mind later
  const st = readHometownState(account);
  assert.equal(st.challenge.played, 1);
  assert.equal(st.challenge.wins, 1);
  assert.equal(st.challenge.lastRepresentedCity, "Akron", "the record keeps the city of the time");
  const html = hometownHtml({ identity: readIdentityFor(account), state: st, lang: "en", names: NAMES, ...fx });
  assert.ok(html.includes("Akron"), "honours show the recorded city");
  function readIdentityFor(a) { return { identityPlaces: a.profile.identityPlaces }; }
});

// ---------- Challenge (H4) ----------
test("challenge lineup fills from fallback levels; too few people hides the challenge (no fabricated players)", () => {
  const cardFor = (bref) => ({ bref, id: `${bref}-2000`, name: NAMES[bref] });
  const team = buildChallengeTeam({ placeText: "Akron", cardFor, ...fx });
  assert.equal(team.available, true, "Akron city 1 + Ohio region 2 + US country 2 = 5 distinct people");
  assert.equal(team.players.length, 5);
  assert.equal(new Set(team.brefs).size, 5);
  assert.deepEqual(team.filledFrom, ["city", "region", "country"]);
  const thin = buildChallengeTeam({ placeText: "Paris", cardFor, ...fx });
  assert.equal(thin.available, false);
  assert.equal(thin.players.length, 0);
});

test("challenge game runs on the existing GameSim and returns a real score", () => {
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  const cardOf = (bref, season) => seasonToCard(rows.find((r) => r.bref === bref && r.season === season));
  const home = { name: "Akron Legends", players: [cardOf("jamesle01", 2013), cardOf("curryst01", 2016), cardOf("wadedw01", 2006), cardOf("rosede01", 2011), cardOf("thomais01", 1989), cardOf("anthoca01", 2013)] };
  const away = { name: "Chicago 1996", players: [cardOf("jordami01", 1996), cardOf("pippesc01", 1996), cardOf("rodmade01", 1996), cardOf("kukocto01", 1996), cardOf("harpero01", 1996), cardOf("longllu01", 1996)] };
  const out = playChallengeGame({ home, away, seed: 7 });
  assert.ok(Number.isFinite(out.homeScore) && Number.isFinite(out.awayScore));
  assert.ok(out.homeScore + out.awayScore > 40, "a real game was simulated");
  assert.equal(out.won, out.homeScore > out.awayScore);
  const opp = pickOpponentTeam([...home.players, ...away.players], { rng: () => 0, size: 5 });
  assert.ok(opp && opp.players.length >= 5);
});

// ---------- View (H2/H5) ----------
test("hometown card: three relation labels differ in the rendered card; TEAM_LEGACY says Played for, never hometown star", () => {
  const identity = { identityPlaces: { birthplace: "Shanghai", grewUpIn: "Akron", representedCity: "Los Angeles" } };
  const html = hometownHtml({ identity, state: sanitizeHometownState(null), lang: "en", names: NAMES, challengeAvailable: false, ...fx });
  assert.ok(html.includes("Born in"));
  assert.ok(html.includes("Grew up in"));
  assert.ok(html.includes("Played for"));
  assert.ok(!html.includes("Hometown star"));
  const zh = hometownHtml({ identity, state: null, lang: "zh", names: NAMES, ...fx });
  assert.ok(zh.includes("出生于") && zh.includes("成长于") && zh.includes("效力过"));
  assert.ok(!zh.includes("家乡球星"));
  assert.ok(zh.includes("不请求定位"), "privacy note is shown");
});

// ---------- Real curated data ----------
test("curated tables are internally valid against the real roster (every bref exists, every source checkable)", () => {
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  const brefs = new Set(rows.map((r) => r.bref));
  const ids = new Set(LOCATIONS.map((l) => l.id));
  assert.equal(ids.size, LOCATIONS.length, "location ids unique");
  for (const loc of LOCATIONS) {
    assert.ok(loc.names.zh && loc.names.en, `${loc.id} has both names`);
    if (loc.level !== "country") assert.ok(ids.has(loc.parentId), `${loc.id} parent exists`);
  }
  const cities = LOCATIONS.filter((l) => l.level === "city");
  assert.ok(cities.length >= 10 && cities.length <= 15, `MVP curation is 10-15 cities, got ${cities.length}`);
  const out = validateLegends(LEGEND_LOCATIONS, { knownBrefs: brefs, locations: LOCATIONS });
  assert.equal(out.failures, 0, JSON.stringify(out.dropped));
  assert.equal(out.hidden.length, 0, "MVP ships reference sources only");
  const perCity = new Map();
  for (const r of out.records) {
    assert.equal(r.source.type, "reference");
    assert.ok(r.source.ref.length >= 10, "ref is a checkable source string");
    assert.equal(r.source.checkedOn, "2026-11-11");
    perCity.set(r.locationId, new Set([...(perCity.get(r.locationId) || []), r.bref]));
  }
  for (const [city, people] of perCity) assert.ok(people.size <= 3, `${city} has <=3 people`);
});
