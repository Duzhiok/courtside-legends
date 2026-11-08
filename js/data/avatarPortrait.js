/**
 * Profile picture (ADR-008a addendum W1): which portrait represents the account in My World and the home bar.
 *
 * Cosmetic only; no game system reads it. It lives in its OWN account field (`account.avatarPortrait`) because
 * `saveLook` rewrites `account.avatar` as four whitelisted fields and would wipe it. Guests use one local key.
 * Storage is never trusted: preset ids are whitelisted and an image must be a small raster data URL
 * (no SVG, no external URL, no script scheme), so a hand-edited value cannot reach an <img> as anything else.
 *
 *   { source: "preset", preset: <id> }
 *   { source: "3d", image: <data:image/...>, sig: <look signature at capture time> }
 *
 * A 3D portrait records the look it was taken from. If the look changes afterwards the old picture is NOT shown
 * (it would lie about how the avatar looks); resolvePortrait falls back to a preset until a new one is captured.
 */
import { defaultStore } from "./profile.js";
import { saveAccount } from "./account.js";
import { sanitizeLook } from "./avatarLook.js";

export const GUEST_PORTRAIT_KEY = "cls_guest_portrait_v1";
export const MAX_PORTRAIT_CHARS = 40000;
const IMAGE_RE = /^data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Hand-drawn default portraits: skin x hair x cut x colours. Art lives in ui/avatarPortraitArt.js. */
export const PORTRAIT_PRESETS = Object.freeze([
  { id: "p1", skin: "warm", hair: "black", cut: "short", bg: "#1f6b45", shirt: "#f4f4f0", zh: "绿色短发", en: "Green, short hair" },
  { id: "p2", skin: "deep", hair: "black", cut: "round", bg: "#e85d04", shirt: "#2b2b2b", zh: "橙色圆发", en: "Orange, round hair" },
  { id: "p3", skin: "light", hair: "blond", cut: "short", bg: "#5b2a86", shirt: "#f0b429", zh: "紫金金发", en: "Purple & gold, blond" },
  { id: "p4", skin: "tan", hair: "brown", cut: "shaved", bg: "#1e2a44", shirt: "#f4f4f0", zh: "深蓝光头", en: "Navy, shaved" },
  { id: "p5", skin: "brown", hair: "black", cut: "short", bg: "#9b2c2c", shirt: "#f4f4f0", zh: "红色短发", en: "Red, short hair" },
  { id: "p6", skin: "light", hair: "red", cut: "round", bg: "#2d6a8a", shirt: "#1b1b1b", zh: "蓝色红发", en: "Blue, red hair" },
]);

/** One short string that changes whenever anything visible about the avatar changes. */
export function lookSignature(look) {
  const l = sanitizeLook(look);
  return [l.skin, l.hair, l.outfit, l.style].join(".");
}

/** Whitelist a stored/raw value. @returns {object|null} null = nothing (valid) chosen */
export function sanitizePortrait(raw) {
  if (!raw || typeof raw !== "object") return null;
  if (raw.source === "preset" && PORTRAIT_PRESETS.some((p) => p.id === raw.preset)) return { source: "preset", preset: raw.preset };
  if (raw.source === "3d" && typeof raw.image === "string" && raw.image.length <= MAX_PORTRAIT_CHARS && IMAGE_RE.test(raw.image) && typeof raw.sig === "string" && raw.sig.length <= 80) {
    return { source: "3d", image: raw.image, sig: raw.sig };
  }
  return null;
}

/** Stable per-owner default so nobody sees an empty picture and the same person always gets the same one. */
export function defaultPresetId(seedKey) {
  let h = 2166136261;
  for (const ch of String(seedKey ?? "guest")) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return PORTRAIT_PRESETS[(h >>> 0) % PORTRAIT_PRESETS.length].id;
}

/**
 * What to show, given the stored value, the CURRENT look and an owner key.
 * @returns {{kind: "3d"|"preset", presetId: string|null, image: string|null, stale: boolean, chosen: boolean}}
 *   stale = a 3D portrait exists but was taken from a different look; chosen = the player explicitly picked something.
 */
export function resolvePortrait(raw, look, seedKey) {
  const p = sanitizePortrait(raw);
  if (p?.source === "3d" && p.sig === lookSignature(look)) return { kind: "3d", presetId: null, image: p.image, stale: false, chosen: true };
  if (p?.source === "preset") return { kind: "preset", presetId: p.preset, image: null, stale: false, chosen: true };
  return { kind: "preset", presetId: defaultPresetId(seedKey), image: null, stale: p?.source === "3d", chosen: !!p };
}

export function readPortrait(account, store = defaultStore()) {
  if (account) return sanitizePortrait(account.avatarPortrait);
  try {
    return sanitizePortrait(JSON.parse(store?.getItem(GUEST_PORTRAIT_KEY) || "null"));
  } catch {
    return null;
  }
}

/** @returns the saved portrait (or null when `portrait` was invalid) plus `saved` (false only if guest storage is unavailable) */
export function savePortrait(account, portrait, { store = defaultStore(), persist = saveAccount } = {}) {
  const next = sanitizePortrait(portrait);
  if (!next) return { portrait: null, saved: false, invalid: true };
  if (!account) {
    try {
      if (!store) throw new Error("no storage");
      store.setItem(GUEST_PORTRAIT_KEY, JSON.stringify(next));
    } catch {
      return { portrait: next, saved: false };
    }
    return { portrait: next, saved: true };
  }
  account.avatarPortrait = next;
  persist(account);
  return { portrait: next, saved: true };
}
