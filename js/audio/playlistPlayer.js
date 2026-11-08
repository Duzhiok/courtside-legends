/**
 * "My playlist" mode: plays the player's imported songs (or, with none imported, the built-in soundtrack) in order.
 * Next/previous/shuffle/repeat live here; the audio manager only plays what it is told.
 */
import * as manager from "./audioManager.js";
import * as library from "./playlistStore.js";
import { TRACKS, asTrack } from "./synthTracks.js";

const SYNTH_SPAN_MS = 90_000; // a built-in track plays this long before the playlist moves on

let queue = [];
let index = 0;
let url = null;
let timer = null;
let missing = new Set();
let active = false;

const clearTimer = () => { clearTimeout(timer); timer = null; };
const revoke = () => { if (url) { URL.revokeObjectURL(url); url = null; } };

export const isActive = () => active;
export const currentItem = () => queue[index] || null;
export const missingIds = () => new Set(missing);
export const queueSnapshot = () => queue.map((q) => ({ id: q.id, name: q.name, source: q.source, missing: missing.has(q.id) }));

async function buildQueue() {
  const mine = await library.listTracks(manager.getProfile());
  queue = mine.length
    ? mine.map((t) => ({ id: t.id, name: t.name, source: "mine" }))
    : TRACKS.map((t) => ({ id: t.id, name: t.name, source: "builtin", def: t }));
}

function nextIndex(step) {
  const n = queue.length;
  if (!n) return -1;
  const { shuffle, repeat } = manager.getSettings();
  if (repeat === "one" && step > 0) return index;
  if (shuffle && n > 1) { let r; do r = Math.floor(Math.random() * n); while (r === index); return r; }
  const i = index + step;
  if (i >= 0 && i < n) return i;
  return repeat === "off" && step > 0 ? -1 : (i + n) % n;
}

async function playIndex(i, tries = 0) {
  clearTimer();
  if (i < 0 || !queue.length || tries >= queue.length) { if (tries >= queue.length) stop(); return; }
  index = i;
  const item = queue[i];
  const advance = () => go(1);
  if (item.source === "builtin") {
    revoke();
    manager.playTrack(asTrack(item.def), { fade: 1.2, restart: true });
    timer = setTimeout(advance, SYNTH_SPAN_MS);
    return;
  }
  const blob = await library.getBlob(manager.getProfile(), item.id).catch(() => null);
  if (!active) return;
  if (!blob) { missing.add(item.id); return playIndex(nextIndex(1), tries + 1); } // file no longer available: skip it
  revoke();
  url = URL.createObjectURL(blob);
  manager.playTrack({ id: item.id, name: item.name, kind: "file", url }, {
    fade: 1,
    restart: true,
    onEnded: advance,
    onError: () => { missing.add(item.id); go(1); },
  });
}

export async function start() {
  active = true;
  missing = new Set();
  await buildQueue();
  index = manager.getSettings().shuffle ? Math.floor(Math.random() * Math.max(1, queue.length)) : 0;
  return playIndex(index);
}

export function stop() {
  active = false;
  clearTimer();
  manager.stopMusic(0.6);
  revoke();
}

export async function go(step) {
  if (!active) return;
  const i = nextIndex(step);
  if (i < 0) return stop();
  return playIndex(i);
}

/** Jump to a specific queue item (clicking it in the radio list). */
export async function playById(id) {
  if (!active) await start();
  const i = queue.findIndex((q) => q.id === id);
  if (i >= 0) return playIndex(i);
}

/** The library changed (import/remove): rebuild the queue without interrupting what is playing if possible. */
export async function refreshQueue() {
  const playing = currentItem()?.id;
  await buildQueue();
  const i = queue.findIndex((q) => q.id === playing);
  index = i >= 0 ? i : 0;
  if (active && i < 0) return playIndex(0);
}
