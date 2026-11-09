/**
 * Legend Duel D2 (Avatar challenger): the Duel Profile derivation is
 * deterministic per body preset + height, the avatar plays a full duel to a
 * legal terminal score, and wins pay +25 Account XP exactly once through the
 * same idempotent path D1 uses. Pure + deterministic — every test pins a seed.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  avatarChallengerKey,
  avatarToDuelist,
  deriveAvatarRatings,
  getOrCreateAvatarDuelist,
  hasAvatar,
  readAvatarDuelist,
  DUEL_AVATAR_KEY,
  DUEL_AVATAR_BASE,
} from "../js/duel/duelAvatar.js";
import { GUEST_LOOK_KEY, sanitizeLook } from "../js/data/avatarLook.js";
import { createDuel, playDuel, DUEL_TARGET, DUEL_CAP, DUEL_WIN_BY } from "../js/duel/duelSim.js";
import {
  recordDuelResult,
  readDuelRecord,
  DUEL_WIN_XP,
} from "../js/duel/duelStore.js";

function fakeStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
  };
}

function look(body) {
  return sanitizeLook({ skin: "warm", hair: "black", outfit: "forest", style: "short", body });
}

function legendDuelist(overrides = {}) {
  return {
    id: "legend-test",
    name: "传奇",
    bref: "testle01",
    season: 1991,
    pos: "SG",
    ovr: 95,
    shooting: 90,
    finishing: 90,
    handles: 90,
    defense: 90,
    strength: 85,
    speed: 90,
    stamina: 90,
    skills: [],
    ...overrides,
  };
}

test("profile: derivation is deterministic — same look, same profile", () => {
  const a = avatarToDuelist(look("broad"), { ownerId: "acc-1", name: "我" });
  const b = avatarToDuelist(look("broad"), { ownerId: "acc-1", name: "我" });
  assert.deepEqual(a, b);
  assert.equal(a.id, "avatar:acc-1");
  assert.equal(a.kind, "avatar");
  assert.equal(a.bref, null, "an avatar is not a card — it has no bref");
});

test("profile: broad leans post/strength, slim leans quickness/outside, standard is balanced", () => {
  const broad = deriveAvatarRatings("broad", 1.03);
  assert.ok(broad.strength > broad.speed, "broad is stronger than it is quick");
  assert.ok(broad.strength > DUEL_AVATAR_BASE.strength, "broad adds strength over base");
  assert.deepEqual(broad.skills, ["paint_bully"]);
  assert.equal(broad.pos, "PF");

  const slim = deriveAvatarRatings("slim", 0.97);
  assert.ok(slim.speed > slim.strength, "slim is quicker than it is strong");
  assert.ok(slim.shooting > DUEL_AVATAR_BASE.shooting, "slim adds shooting over base");
  assert.deepEqual(slim.skills, ["rainmaker"]);
  assert.equal(slim.pos, "SG");

  const standard = deriveAvatarRatings("standard", 1.0);
  assert.deepEqual(standard.skills, [], "standard earns no skill");
  assert.equal(standard.pos, "SF");
  assert.deepEqual(
    { ...standard, skills: undefined, pos: undefined },
    { ...DUEL_AVATAR_BASE, skills: undefined, pos: undefined },
    "standard at height 1.0 is exactly the base profile",
  );
});

test("profile: height nudges the same way — taller adds strength, shorter adds speed", () => {
  const tall = deriveAvatarRatings("standard", 1.03);
  const short = deriveAvatarRatings("standard", 0.97);
  assert.ok(tall.strength > short.strength, "taller is stronger");
  assert.ok(tall.finishing > short.finishing, "taller finishes better");
  assert.ok(short.speed > tall.speed, "shorter is quicker");
  assert.ok(short.handles > tall.handles, "shorter handles better");
  for (const ratings of [tall, short]) {
    for (const v of Object.values(ratings).filter((x) => typeof x === "number")) {
      assert.ok(v >= 1 && v <= 99, "every rating stays clamped to 1-99");
    }
  }
});

test("profile: unknown body preset falls back to standard", () => {
  assert.deepEqual(deriveAvatarRatings("not-a-preset", 1.0), deriveAvatarRatings("standard", 1.0));
  assert.equal(avatarToDuelist(look("not-a-preset")).body, "standard");
});

test("profile: no avatar falls back gracefully — no crash, no profile", () => {
  const storage = fakeStorage();
  assert.equal(hasAvatar(null, storage), false, "guest with no saved look has no avatar");
  assert.equal(hasAvatar({ id: "acc-1" }, storage), false, "account with no avatar field has no avatar");
  assert.equal(avatarToDuelist(null), null);
  assert.equal(getOrCreateAvatarDuelist(null, { save: () => {}, storage }), null);
  assert.equal(getOrCreateAvatarDuelist({ id: "acc-1" }, { save: () => {}, storage }), null);
  assert.equal(readAvatarDuelist(null, storage), null);
});

test("profile: a guest avatar is created on first challenge and stored", () => {
  const storage = fakeStorage();
  storage.setItem(GUEST_LOOK_KEY, JSON.stringify(look("slim")));
  assert.equal(hasAvatar(null, storage), true);
  const duelist = getOrCreateAvatarDuelist(null, { name: "我", save: () => {}, storage });
  assert.ok(duelist, "profile is created");
  assert.equal(duelist.pos, "SG");
  assert.equal(duelist.id, "avatar:guest");
  assert.equal(avatarChallengerKey(null), "avatar:guest");
  const stored = JSON.parse(storage.getItem(DUEL_AVATAR_KEY));
  assert.deepEqual(stored, duelist, "the created profile is stored for the guest");
  assert.deepEqual(readAvatarDuelist(null, storage), duelist);
  // Same look again -> the same profile, not a second one.
  assert.deepEqual(getOrCreateAvatarDuelist(null, { name: "我", save: () => {}, storage }), duelist);
});

test("profile: an account avatar is stored on the account", () => {
  const storage = fakeStorage();
  const account = { id: "acc-9", avatar: look("broad") };
  let saved = null;
  const duelist = getOrCreateAvatarDuelist(account, { name: "阿杜", save: (a) => { saved = a; }, storage });
  assert.ok(duelist);
  assert.equal(duelist.pos, "PF");
  assert.equal(account.duelAvatar, duelist, "profile lives on the account next to the duel record");
  assert.equal(saved, account, "the account is persisted");
  assert.equal(readAvatarDuelist(account, storage), duelist);
});

test("duel: an avatar challenger plays a full duel to a legal terminal score", () => {
  for (const body of ["broad", "standard", "slim"]) {
    const challenger = avatarToDuelist(look(body), { ownerId: "acc-1", name: "我" });
    const state = createDuel({ challenger, legend: legendDuelist(), difficulty: "pro", seed: `avatar-duel-${body}` });
    playDuel(state, { offense: "drive", defense: "balanced" });
    assert.equal(state.over, true, `${body} duel ends`);
    assert.ok(state.winner === "a" || state.winner === "b");
    const { a, b } = state;
    const legal =
      (a.score >= DUEL_TARGET && a.score - b.score >= DUEL_WIN_BY) ||
      (b.score >= DUEL_TARGET && b.score - a.score >= DUEL_WIN_BY) ||
      (a.score >= DUEL_CAP && a.score > b.score) ||
      (b.score >= DUEL_CAP && b.score > a.score);
    assert.ok(legal, `${body} ends at a legal terminal score (${a.score}-${b.score})`);
    assert.ok(state.turn < 200, "the duel terminates");
  }
});

test("rewards: an avatar win pays +25 Account XP exactly once, a loss pays none", () => {
  const storage = fakeStorage();
  const base = {
    duelId: "duel-avatar-1",
    legendBref: "jordami01",
    legendName: "乔丹",
    challengerId: "avatar:guest",
    challengerName: "我",
    challengerKind: "avatar",
    difficulty: "pro",
    won: true,
    scoreA: 11,
    scoreB: 8,
  };
  const first = recordDuelResult(null, base, { save: () => {}, storage });
  assert.equal(first.record.wins, 1);
  assert.deepEqual(first.record.defeated, ["jordami01"]);
  assert.equal(first.record.games[0].challengerKind, "avatar", "the game is recorded as an avatar challenge");
  assert.equal(first.xp.gained, DUEL_WIN_XP);

  const second = recordDuelResult(null, base, { save: () => {}, storage });
  assert.equal(second.duplicate, true);
  assert.equal(second.record.wins, 1, "re-settling must not double-count the win");
  assert.equal(second.xp.gained, 0, "re-settling must not double-pay XP");

  const loss = recordDuelResult(null, { ...base, duelId: "duel-avatar-2", won: false, scoreA: 9, scoreB: 11 }, { save: () => {}, storage });
  assert.equal(loss.record.losses, 1);
  assert.equal(loss.xp.gained, 0, "losses pay no win XP");
  const record = readDuelRecord(null, storage);
  assert.equal(record.wins, 1);
  assert.equal(record.losses, 1);
  assert.equal(record.games.length, 2);
  assert.equal(record.wins + record.losses, record.games.length, "wins+losses add up to games played");
});
