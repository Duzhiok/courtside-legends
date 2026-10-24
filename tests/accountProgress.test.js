import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";

globalThis.localStorage = createMemoryStorage();

const { applyCardMods } = await import("../js/data/account.js");
const { overall } = await import("../js/data/players.js");
const { applyRankedGame, gameXp, growthCap, progressNoteText, setFavorite } = await import("../js/data/accountProgress.js");
const { GROWTH_OVR_HEADROOM, MAX_GROWTH_LEVEL, XP_PER_LEVEL } = await import("../js/data/growthPaths.js");

function card(id, attrs = {}) {
  const [bref, season] = id.split("-");
  return {
    id, bref, season: Number(season), name: bref, team: "GSW", pos: "PG", heightCm: 201, age: 29,
    scoring: 60, three: 55, mid: 60, paint: 60, pass: 70, iq: 70, clutch: 60,
    defense: 65, steal: 55, block: 40, rebound: 50, speed: 60, strength: 55, stamina: 70,
    skills: [], ...attrs,
  };
}

const LIV_2015 = card("liv-2015");
const LIV_2016 = card("liv-2016", { pass: 74, iq: 74 });
const POOL = [LIV_2015, LIV_2016];
const quiet = { min: 30, pts: 6, reb: 3, ast: 4, stl: 1, blk: 0, fgm: 3, tpm: 0 };

function acc() {
  return { id: "a", playerIds: ["liv-2015"], cardMods: {} };
}

test("favourite path is locked once the card has grown", () => {
  const account = acc();
  setFavorite(account, "liv-2015", "playmaker");
  account.cardMods["liv-2015"].growth.levels = 1;
  assert.throws(() => setFavorite(account, "liv-2015", "shooter"), /不能换路线/);
  setFavorite(account, "liv-2015", "playmaker");
});

test("ranked games give the 本命 XP and levels raise only the path attributes", () => {
  const account = acc();
  setFavorite(account, "liv-2015", "playmaker");
  const games = Math.ceil(XP_PER_LEVEL / gameXp(quiet, true));
  let notes = [];
  for (let i = 0; i < games; i++) {
    notes = applyRankedGame(account, [{ ...LIV_2015, stats: quiet }], { won: true, rng: () => 0.99, pool: POOL });
  }
  assert.equal(account.cardMods["liv-2015"].growth.levels, 1);
  assert.match(progressNoteText(notes.at(-1)), /Lv\.1/);
  const grown = applyCardMods(LIV_2015, account.cardMods["liv-2015"]);
  assert.equal(grown.pass, LIV_2015.pass + 1);
  assert.equal(grown.iq, LIV_2015.iq + 1);
  assert.equal(grown.three, LIV_2015.three, "off-path attributes untouched");
});

test("growth stops at the person's best real season + headroom", () => {
  const ovr = (p) => p.pass; // stand-in OVR so the cap formula is easy to check
  assert.equal(growthCap("liv", POOL, ovr), 74 + GROWTH_OVR_HEADROOM);

  // However long the grind, the grown card's real OVR never passes the cap.
  const account = acc();
  setFavorite(account, "liv-2015", "playmaker");
  for (let i = 0; i < 200; i++) {
    applyRankedGame(account, [{ ...LIV_2015, stats: quiet }], { won: true, rng: () => 0.99, pool: POOL });
  }
  const growth = account.cardMods["liv-2015"].growth;
  assert.ok(growth.levels <= MAX_GROWTH_LEVEL);
  const grown = applyCardMods(LIV_2015, account.cardMods["liv-2015"]);
  assert.ok(overall(grown) <= growthCap("liv", POOL));
});

test("non-owned or stat-less roster entries are ignored", () => {
  const account = acc();
  const notes = applyRankedGame(account, [{ ...card("other-2000"), stats: quiet }, { ...LIV_2015 }], { pool: POOL });
  assert.deepEqual(notes, []);
  assert.equal(account.cardMods["other-2000"], undefined);
});
