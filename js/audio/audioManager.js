/**
 * The one audio engine for the whole app: one AudioContext, a music bus and an SFX bus, crossfaded music decks,
 * ducking, and per-profile (account or guest) settings. Everything else (director, radio, sfx) goes through here.
 * Browsers only allow audio after a user gesture, so nothing sounds until `unlock()` has been called once.
 */
import { startSynth } from "./synthTracks.js";

export const DEFAULTS = Object.freeze({ mode: "dynamic", lastMode: "dynamic", music: 0.45, sfx: 0.6, shuffle: false, repeat: "all" });
const KEY = (profile) => `cls_audio_v1:${profile || "guest"}`;
const LEGACY_VOL = "courtside-bgm-vol";
const LEGACY_ON = "courtside-bgm-on";
const clamp01 = (v, d) => (Number.isFinite(Number(v)) ? Math.max(0, Math.min(1, Number(v))) : d);

const store = () => { try { return globalThis.localStorage || null; } catch { return null; } };

/** Parse + sanitise stored settings; a profile with none yet inherits the old single-player BGM settings. */
export function readSettings(profile) {
  const ls = store();
  let raw = null;
  try { raw = JSON.parse(ls?.getItem(KEY(profile)) || "null"); } catch { raw = null; }
  if (!raw) {
    const legacyVol = ls?.getItem(LEGACY_VOL);
    const legacyOff = ls?.getItem(LEGACY_ON) === "0";
    raw = { music: legacyVol != null ? clamp01(legacyVol, DEFAULTS.music) : DEFAULTS.music, mode: legacyOff ? "off" : DEFAULTS.mode };
  }
  const mode = ["dynamic", "playlist", "off"].includes(raw.mode) ? raw.mode : DEFAULTS.mode;
  return {
    mode,
    lastMode: ["dynamic", "playlist"].includes(raw.lastMode) ? raw.lastMode : mode === "off" ? "dynamic" : mode,
    music: clamp01(raw.music, DEFAULTS.music),
    sfx: clamp01(raw.sfx, DEFAULTS.sfx),
    shuffle: !!raw.shuffle,
    repeat: ["all", "one", "off"].includes(raw.repeat) ? raw.repeat : DEFAULTS.repeat,
  };
}

let ctx = null;
let musicBus = null;
let sfxBus = null;
let settings = { ...DEFAULTS };
let profile = null;
let current = null; // { track, deck }
let pending = null; // wanted before the first gesture
const decks = new Set();
const listeners = new Set();
const emit = () => listeners.forEach((fn) => { try { fn(); } catch { /* a bad listener must not break audio */ } });

export const onChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
export const getSettings = () => ({ ...settings });
export const getProfile = () => profile;
export const bus = () => (ctx && sfxBus ? { ctx, out: sfxBus } : null);
export const isUnlocked = () => !!ctx && ctx.state !== "suspended";
export const nowPlaying = () => (current ? { ...current.track, def: undefined } : null);
export const debug = () => ({ decks: decks.size, ctxState: ctx?.state || "none", current: current?.track.id || null });

/** Load the settings of `id` (an account id, or null for the guest). Switching profile never leaks volumes between accounts. */
export function useProfile(id) {
  const next = id || "guest";
  if (next === profile) return false;
  profile = next;
  settings = readSettings(profile);
  applyVolumes();
  emit();
  return true;
}

function persist() {
  try { store()?.setItem(KEY(profile), JSON.stringify(settings)); } catch { /* storage full / blocked: keep working in memory */ }
}

function applyVolumes() {
  if (!ctx) return;
  const t = ctx.currentTime;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(settings.mode === "off" ? 0 : settings.music, t, 0.05);
  sfxBus.gain.setTargetAtTime(settings.sfx, t, 0.05);
}

export function updateSettings(patch) {
  settings = { ...settings, ...patch };
  settings.music = clamp01(settings.music, DEFAULTS.music);
  settings.sfx = clamp01(settings.sfx, DEFAULTS.sfx);
  if (settings.mode !== "off") settings.lastMode = settings.mode;
  persist();
  applyVolumes();
  emit();
}

/** Create/resume the context. Call from a user gesture. Safe to call repeatedly. */
export async function unlock() {
  if (!ctx) {
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    musicBus = ctx.createGain();
    sfxBus = ctx.createGain();
    const comp = ctx.createDynamicsCompressor(); // synth + sfx can stack: keep the sum from clipping
    musicBus.connect(comp);
    sfxBus.connect(comp);
    comp.connect(ctx.destination);
    applyVolumes();
  }
  try { if (ctx.state === "suspended") await ctx.resume(); } catch { return false; }
  if (pending && !current) { const { track, opts } = pending; pending = null; playTrack(track, opts); }
  emit();
  return ctx.state === "running";
}

export function setSuspended(hidden) {
  if (!ctx) return;
  (hidden ? ctx.suspend() : ctx.resume()).catch(() => {});
}

function makeDeck(track, opts) {
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(musicBus);
  const deck = { gain, stop: () => {} };
  if (track.kind === "synth") {
    const synth = startSynth(track.def, ctx, gain);
    deck.stop = () => synth.stop();
  } else {
    const el = new Audio();
    el.crossOrigin = "anonymous";
    el.src = track.url;
    el.loop = !opts.onEnded;
    if (opts.onEnded) el.addEventListener("ended", () => opts.onEnded());
    el.addEventListener("error", () => opts.onError?.(track));
    const src = ctx.createMediaElementSource(el);
    src.connect(gain);
    el.play().catch(() => opts.onError?.(track));
    deck.stop = () => { el.pause(); el.removeAttribute("src"); el.load(); src.disconnect(); };
  }
  decks.add(deck);
  return deck;
}

function retire(deck, fade) {
  const t = ctx.currentTime;
  deck.gain.gain.cancelScheduledValues(t);
  deck.gain.gain.setValueAtTime(deck.gain.gain.value, t);
  deck.gain.gain.linearRampToValueAtTime(0, t + fade);
  setTimeout(() => { deck.stop(); try { deck.gain.disconnect(); } catch { /* already gone */ } decks.delete(deck); }, fade * 1000 + 120);
}

/**
 * Play `track` (synth or file) with a crossfade. Asking for the track that is already playing does nothing,
 * so UI re-renders never restart the music. Before the first gesture the request is remembered.
 */
export function playTrack(track, opts = {}) {
  if (!track) return null;
  if (current?.track.id === track.id && !opts.restart) return current;
  if (!ctx || ctx.state === "suspended") { pending = { track, opts }; return null; }
  const fade = opts.fade ?? 1.6;
  const prev = current;
  const deck = makeDeck(track, opts);
  const t = ctx.currentTime;
  deck.gain.gain.setValueAtTime(0, t);
  deck.gain.gain.linearRampToValueAtTime(1, t + fade);
  current = { track, deck };
  if (prev) retire(prev.deck, fade);
  emit();
  return current;
}

export function stopMusic(fade = 0.8) {
  pending = null;
  if (!current) return;
  const { deck } = current;
  current = null;
  if (ctx) retire(deck, fade);
  emit();
}

/** Dip the music under a cue (commentary, stinger) and bring it back. */
export function duck(level = 0.3, hold = 0.5, release = 0.9) {
  if (!ctx || settings.mode === "off") return;
  const t = ctx.currentTime;
  const target = settings.music;
  musicBus.gain.cancelScheduledValues(t);
  musicBus.gain.setTargetAtTime(target * level, t, 0.04);
  musicBus.gain.setTargetAtTime(target, t + hold, release / 3);
}
