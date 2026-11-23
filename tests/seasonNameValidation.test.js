// esc audit batch 1 (systemic fix): the load boundary refuses season saves whose names
// carry markup, so the 51 medium-risk unescaped render sites can no longer be reached
// through a crafted quick-season / My Team season slot. The career root already did
// this via validateCareerNames; the check now lives in the shared js/data/saveNames.js
// and is reused by loadSeason, validMyTeamSeason and saveRoot (message preserved).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { ACCOUNTS_KEY, ACTIVE_ACCOUNT_KEY } from "../js/data/accountKeys.js";

globalThis.localStorage = createMemoryStorage();

const { PLAYERS, overall, seasonToCard } = await import("../js/data/players.js");
const { buildCareerSpanIndex } = await import("../js/data/careerArc.js");
const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
buildCareerSpanIndex(ROWS);
PLAYERS.push(...ROWS.map(seasonToCard));

const { isSafeDisplayName, validateSeasonNames } = await import("../js/data/saveNames.js");
const { createSeason, buildCpuTeamForYear, loadSeason } = await import("../js/engine/season.js");
const { historicalSeason } = await import("../js/data/historicalSeasons.js");
const { createRootState, writeRootSave, ROOT_SAVE_KEY } = await import("../js/data/saveRoot.js");
const { buildMyTeamSeason } = await import("../js/myteam/mySeason.js");
const store = await import("../js/myteam/seasonStore.js");
const own = await import("../js/data/saveOwnership.js");
const { buildSandboxTeam, fillWithCopies } = await import("../js/modes/sandboxDuel.js");

const EVIL = 'Evil<img src=x onerror=alert(1)>';
const SEASON_KEY = "cls_season_v1";
const clone = (value) => JSON.parse(JSON.stringify(value));

test("isSafeDisplayName: plain and 60-char names pass; markup, overlong and non-string names fail", () => {
  assert.equal(isSafeDisplayName("迈克尔·乔丹"), true);
  assert.equal(isSafeDisplayName("a".repeat(60)), true);
  assert.equal(isSafeDisplayName("a".repeat(61)), false);
  assert.equal(isSafeDisplayName(EVIL), false);
  assert.equal(isSafeDisplayName("a>b"), false);
  assert.equal(isSafeDisplayName("a<b"), false); // "<" single side (02:55 verification note: EVIL pins both together only)
  assert.equal(isSafeDisplayName(42), false);
  assert.equal(isSafeDisplayName(null), false);
});

test("validateSeasonNames: throws on a markup name in any slot, passes on a clean season", () => {
  const clean = {
    teams: { LAL: { name: "湖人", players: [{ name: "科比" }], coach: { name: "禅师", style: "三角进攻" } } },
    customNames: { LAL: "湖人" },
    league: { labels: { LAL: "湖人" } },
    freeAgents: [{ name: "自由球员" }],
  };
  assert.doesNotThrow(() => validateSeasonNames(clean));
  const cases = [
    ["team name", (s) => { s.teams.LAL.name = EVIL; }],
    ["player name", (s) => { s.teams.LAL.players[0].name = EVIL; }],
    ["coach name", (s) => { s.teams.LAL.coach.name = EVIL; }],
    ["coach style", (s) => { s.teams.LAL.coach.style = EVIL; }],
    ["free-agent name (the market tab renders it)", (s) => { s.freeAgents[0].name = EVIL; }],
    ["customNames value", (s) => { s.customNames.LAL = EVIL; }],
    ["league.labels value", (s) => { s.league.labels.LAL = EVIL; }],
  ];
  for (const [label, mutate] of cases) {
    const s = clone(clean);
    mutate(s);
    assert.throws(() => validateSeasonNames(s), /invalid season names/, label);
  }
  // The career root keeps its own message through the shared helper.
  const s = clone(clean);
  s.teams.LAL.name = EVIL;
  assert.throws(() => validateSeasonNames(s, "invalid root save"), /invalid root save/);
});

function installYear(year) {
  if (!PLAYERS.some((p) => p.season === year)) {
    PLAYERS.push(...ROWS.filter((r) => r.season === year).map(seasonToCard));
  }
}

function legitSeason() {
  // Same setup as seasonRoyAge.test.js: a real 1991 historical season.
  installYear(1991);
  const hist = historicalSeason(1991);
  const teamMeta = hist.teams[0];
  return createSeason({
    userTeamId: teamMeta.id,
    userTeamName: teamMeta.name,
    userTeam: buildCpuTeamForYear(1991, teamMeta, new Set()),
    mode: "historical",
    year: 1991,
    seed: 7,
  });
}

function storeSeason(st, storage) {
  globalThis.localStorage = storage;
  storage.setItem(SEASON_KEY, JSON.stringify(st));
}

test("loadSeason: a clean quick-season save loads; a markup name in any slot reads as no save", () => {
  const base = legitSeason();
  const userTeamId = base.userTeamId;
  const [firstTeamId] = Object.entries(base.teams).find(([, t]) => Array.isArray(t.players) && t.players.length);

  const storage = createMemoryStorage();
  storeSeason(base, storage);
  assert.ok(loadSeason(), "clean season must load");

  const mutations = [
    ["team name", (s) => { s.teams[userTeamId].name = EVIL; }],
    ["player name", (s) => { s.teams[firstTeamId].players[0].name = EVIL; }],
    ["coach name", (s) => { s.teams[userTeamId].coach = { name: EVIL, style: "balanced" }; }],
    ["coach style", (s) => { s.teams[userTeamId].coach = { name: "教练", style: EVIL }; }],
    ["customNames value", (s) => { s.customNames = { [userTeamId]: EVIL }; }],
    ["league.labels value", (s) => { s.league.labels[userTeamId] = EVIL; }],
  ];
  for (const [label, mutate] of mutations) {
    const st = clone(base);
    mutate(st);
    storeSeason(st, storage);
    assert.equal(loadSeason(), null, `${label} must read as no save`);
  }
});

// --- My Team season slot (same gate, mirrored from myTeamSeason.test.js) ---
const STARS = ["curryst01", "jordami01", "jamesle01", "duncati01", "onealsh01", "bryanko01", "johnsma02", "birdla01", "olajuha01", "garneke01"];
const peak = (b) => PLAYERS.filter((p) => p.bref === b).sort((x, y) => overall(y) - overall(x))[0];
const acct = (id = "acc-a", extra = {}) => ({ id, name: "Zed", playerIds: STARS.map((b) => peak(b).id), cardMods: {}, gold: 5, tacticId: "pace_space", ...extra });

function device(...ids) {
  own._resetOwnershipForTests();
  const storage = createMemoryStorage({ [ACCOUNTS_KEY]: JSON.stringify({ accounts: ids.map((id) => ({ id })) }) });
  globalThis.localStorage = storage;
  const as = (id) => storage.setItem(ACTIVE_ACCOUNT_KEY, id);
  as(ids[0]);
  own.stampLegacySaves({}, storage);
  return { storage, as };
}

test("My Team season: a markup team name is refused on save and reads as no save", () => {
  const { storage } = device("acc-a");
  const built = buildMyTeamSeason(acct(), { variant: "quick", seed: 7 });
  assert.equal(built.ok, true, JSON.stringify(built));
  const st = built.season;
  assert.equal(store.saveMyTeamSeason(st, storage).ok, true, "clean My Team season must save");
  assert.ok(store.readMyTeamSeason(storage), "clean My Team season must read back");

  const evil = clone(st);
  evil.teams[evil.userTeamId].name = EVIL;
  assert.deepEqual(store.saveMyTeamSeason(evil, storage), { ok: false, reason: "invalid" });
  storage.setItem(store.MYTEAM_SEASON_KEY, JSON.stringify(evil));
  assert.equal(store.readMyTeamSeason(storage), null, "crafted slot must read as no save");
  assert.equal(store.loadMyTeamSeason(storage), null);
});

test("saveRoot still refuses a markup season name with 'invalid root save' (no behaviour change)", () => {
  const season = (name) => ({
    v: 2, year: 1991, phase: "regular", userTeamId: "POR",
    teams: { POR: { id: "POR", name, players: [] } },
    schedule: [],
  });
  const rootWith = (name) => createRootState({
    activeMode: "franchise",
    leagueCareer: {
      careerId: "career-1", kind: "franchise", phase: "draft",
      season: season(name), history: [], manualOverrides: {}, recommendations: {},
    },
  });
  const storage = createMemoryStorage();
  writeRootSave(rootWith("开拓者"), storage);
  assert.ok(storage.getItem(ROOT_SAVE_KEY), "clean root save must write");

  const badStorage = createMemoryStorage();
  assert.throws(() => writeRootSave(rootWith(EVIL), badStorage), /invalid root save/);
  assert.equal(badStorage.getItem(ROOT_SAVE_KEY), null, "a rejected save must not touch storage");
});

test("sandbox team name: markup brackets are stripped at entry", () => {
  const card = { id: "jordami01-1991-chi", bref: "jordami01", name: "迈克尔·乔丹", nameEn: "Michael Jordan", season: 1991, team: "CHI", pos: "SG", ovr: 98, skills: [] };
  const team = buildSandboxTeam("A<B>队<script>", fillWithCopies(card));
  assert.equal(team.name, "AB队script");
  assert.equal(buildSandboxTeam("五乔丹", fillWithCopies(card)).name, "五乔丹");
});
