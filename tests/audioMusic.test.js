import test from "node:test";
import assert from "node:assert/strict";
import { createMemoryStorage } from "./helpers/memoryStorage.js";
import { eraOf, sceneForScreen, gameIntensity, trackIdFor, createDirector } from "../js/audio/musicDirector.js";
import { TRACKS, synthTrackById, asTrack } from "../js/audio/synthTracks.js";
import { readSettings, DEFAULTS } from "../js/audio/audioManager.js";
import * as library from "../js/audio/playlistStore.js";

const snap = (q, clock, home, away) => ({ quarter: q, clock, score: { home, away } });

test("eras map to the soundtrack decades", () => {
  assert.deepEqual([1955, 1979, 1985, 1996, 2003, 2016, 2040].map(eraOf), ["70s", "70s", "80s", "90s", "00s", "modern", "modern"]);
  assert.equal(eraOf(undefined), "modern");
});

test("screens map to scenes; the home screen follows its tab; unknown screens keep the music", () => {
  assert.equal(sceneForScreen("home", { homeTab: "world" }), "world");
  assert.equal(sceneForScreen("home", { homeTab: "players" }), "team");
  assert.equal(sceneForScreen("home", { homeTab: "custom" }), "play");
  assert.equal(sceneForScreen("season"), "career");
  assert.equal(sceneForScreen("game"), "game");
  assert.equal(sceneForScreen("result"), "arena");
  assert.equal(sceneForScreen("not-a-screen"), undefined);
});

test("game intensity: arena, tension in a close 4th, clutch in the last 30s of a one-possession game", () => {
  assert.equal(gameIntensity(snap(1, 600, 20, 10)), "arena");
  assert.equal(gameIntensity(snap(4, 400, 90, 85)), "tension");
  assert.equal(gameIntensity(snap(4, 400, 90, 70)), "arena", "a blowout is not tense");
  assert.equal(gameIntensity(snap(4, 25, 90, 88)), "clutch");
  assert.equal(gameIntensity(snap(4, 25, 90, 85)), "tension", "5 down with 25s left is tense, not clutch");
  assert.equal(gameIntensity(snap(5, 20, 100, 100)), "clutch", "overtime counts");
  assert.equal(gameIntensity(null), "arena");
});

test("every scene resolves to a real built-in track", () => {
  const ctxs = [
    ...["world", "team", "play", "arena"].map((scene) => ({ scene })),
    ...["70s", "80s", "90s", "00s", "modern"].map((era) => ({ scene: "career", era })),
    ...["arena", "tension", "clutch"].map((intensity) => ({ scene: "game", intensity })),
  ];
  for (const c of ctxs) assert.ok(synthTrackById(trackIdFor(c)), JSON.stringify(c));
  // 12 contexts, 11 tracks: the bare "arena" scene (result screens) deliberately reuses the in-game arena bed.
  assert.equal(new Set(ctxs.map((c) => trackIdFor(c))).size, 11);
});

function fakePlayer(mode = "dynamic") {
  const plays = [];
  return { plays, mode: () => mode, setMode: (m) => (mode = m), play: (t) => plays.push(t.id), files: () => ({}) };
}
const make = (player, clock = { t: 0 }) => ({ clock, d: createDirector({ player, resolve: (id) => asTrack(synthTrackById(id)), now: () => clock.t, holdMs: 8000 }) });

test("director never restarts the same track on repeated scene/tab re-renders", () => {
  const p = fakePlayer();
  const { d } = make(p);
  d.setScene("world"); d.setScene("world"); d.setScene("world");
  assert.deepEqual(p.plays, ["world_chill"]);
});

test("clutch escalates immediately; calming down waits out the hold time (no flapping)", () => {
  const p = fakePlayer();
  const { d, clock } = make(p);
  d.setScene("game");
  d.onGameSnapshot(snap(4, 300, 80, 78)); // tension
  d.onGameSnapshot(snap(4, 20, 80, 79)); // clutch right away
  clock.t = 3000;
  d.onGameSnapshot(snap(4, 19, 80, 70)); // lead grows, but too soon to calm down
  clock.t = 20_000;
  d.onGameSnapshot(snap(4, 10, 80, 70)); // now it may calm
  assert.deepEqual(p.plays, ["game_arena", "game_tension", "game_clutch", "game_arena"]);
});

test("leaving the game forgets the intensity; snapshots outside a game are ignored", () => {
  const p = fakePlayer();
  const { d } = make(p);
  d.onGameSnapshot(snap(4, 10, 50, 50));
  assert.deepEqual(p.plays, []);
  d.setScene("game"); d.onGameSnapshot(snap(4, 10, 50, 50)); d.setScene("world");
  d.setScene("game");
  assert.equal(d.state().intensity, "arena");
});

test("era soundtrack follows the season year; the director is silent unless mode is dynamic", () => {
  const p = fakePlayer();
  const { d } = make(p);
  d.setScene("career", { year: 1996 });
  d.setEra(1984);
  assert.deepEqual(p.plays, ["career_90s", "career_80s"]);
  const quiet = fakePlayer("playlist");
  make(quiet).d.setScene("world");
  assert.deepEqual(quiet.plays, []);
});

test("built-in track definitions are well-formed", () => {
  assert.equal(new Set(TRACKS.map((t) => t.id)).size, TRACKS.length);
  for (const t of TRACKS) {
    for (const k of ["kick", "snare", "hat", "bass", "lead"]) if (t[k] != null) assert.equal(t[k].length, 16, `${t.id}.${k}`);
    assert.ok(t.chords.length && t.chords.every((c) => c.length >= 2 && Number.isFinite(c[0])), t.id);
    assert.ok(t.bpm >= 60 && t.bpm <= 160, t.id);
  }
});

test("settings: defaults, clamping, legacy migration, per-profile isolation", () => {
  globalThis.localStorage = createMemoryStorage({ "courtside-bgm-vol": "0.2", "courtside-bgm-on": "0" });
  const migrated = readSettings("acc1");
  assert.equal(migrated.music, 0.2);
  assert.equal(migrated.mode, "off");
  globalThis.localStorage = createMemoryStorage({ "cls_audio_v1:a": JSON.stringify({ mode: "playlist", music: 9, sfx: -3, repeat: "x" }), "cls_audio_v1:b": JSON.stringify({ mode: "dynamic", music: 0.1 }) });
  const a = readSettings("a");
  assert.deepEqual([a.mode, a.music, a.sfx, a.repeat], ["playlist", 1, 0, "all"]);
  assert.equal(readSettings("b").music, 0.1);
  assert.equal(readSettings("c").music, DEFAULTS.music, "an unseen profile gets defaults, not another account's volume");
  globalThis.localStorage = createMemoryStorage({ "cls_audio_v1:z": "{not json" });
  assert.equal(readSettings("z").mode, "dynamic");
  delete globalThis.localStorage;
});

test("library: audio only, size/count limits, isolated per profile, removable", async () => {
  library._resetForTests();
  const f = (name, size = 10, type = "audio/mpeg") => ({ name, size, type });
  const r = await library.addFiles("p1", [f("a.mp3"), f("notes.txt", 5, "text/plain"), f("huge.mp3", library.MAX_BYTES + 1), f("b.FLAC", 5, "")]);
  assert.deepEqual(r.added.map((t) => t.name), ["a", "b"]);
  assert.deepEqual(r.rejected.map((x) => x.reason), ["not-audio", "too-big"]);
  assert.equal((await library.listTracks("p2")).length, 0);
  assert.ok(await library.getBlob("p1", r.added[0].id));
  assert.equal(await library.getBlob("p2", r.added[0].id), null);
  await library.removeTrack("p1", r.added[0].id);
  assert.equal((await library.listTracks("p1")).length, 1);
  const many = await library.addFiles("p3", Array.from({ length: library.MAX_TRACKS + 3 }, (_, i) => f(`t${i}.mp3`)));
  assert.equal(many.added.length, library.MAX_TRACKS);
  assert.equal(many.rejected.filter((x) => x.reason === "full").length, 3);
});
