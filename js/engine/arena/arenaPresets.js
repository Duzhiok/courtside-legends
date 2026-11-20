/**
 * Arena presets: ONE renderer, many looks. Every venue is data here (floor pattern + colours, lighting, crowd palette, LED boards),
 * so adding a scene is a new entry, not new rendering code. Everything is original: no team logos, wordmarks or copied court designs.
 * Pure data + tiny helpers; nothing here touches THREE, the DOM (except the guarded preference reads) or GameSim.
 */

export const ARENA_IDS = Object.freeze(["classic", "modern", "retro90"]);
export const DEFAULT_ARENA = "classic";

export const ARENA_PRESETS = Object.freeze({
  classic: Object.freeze({
    id: "classic",
    label: { zh: "经典枫木", en: "Classic Hardwood" },
    floor: Object.freeze({ pattern: "parquet", wood: "#C99B65", border: "#7a4d2b", paint: "#216747", lines: "#F5E8D0" }),
    lighting: "warm",
    background: "#0b140f",
    shell: Object.freeze({ wall: "#1d2a22", seat: "#2c5a3d", seatAlt: "#23483a", rail: "#8b9a90", led: "#216747", ledText: "#F5E8D0" }),
    crowd: Object.freeze({ palette: ["#e8d9b8", "#2c5a3d", "#c99b65", "#f2efe6", "#7c8f84", "#a23b3b"], skin: ["#f1c9a5", "#d9a37a", "#a8714b", "#6f4529"] }),
    scoreboard: "traditional",
  }),
  modern: Object.freeze({
    id: "modern",
    label: { zh: "现代职业球馆", en: "Modern Pro Arena" },
    floor: Object.freeze({ pattern: "long-plank", wood: "#D6B184", border: "#10192b", paint: "#18243B", lines: "#FFFFFF" }),
    lighting: "broadcast",
    background: "#080b12",
    shell: Object.freeze({ wall: "#121a28", seat: "#202938", seatAlt: "#2a3446", rail: "#aab6c8", led: "#18243B", ledText: "#6fe0ff" }),
    crowd: Object.freeze({ palette: ["#e6ebf5", "#2f6fdb", "#202938", "#f2b84b", "#8a96ab", "#c8d2e4"], skin: ["#f1c9a5", "#d9a37a", "#a8714b", "#6f4529"] }),
    scoreboard: "led",
  }),
  retro90: Object.freeze({
    id: "retro90",
    label: { zh: "复古 90 年代", en: "Retro 90s Arena" },
    floor: Object.freeze({ pattern: "herringbone", wood: "#B98756", border: "#6e3d27", paint: "#A13C32", lines: "#FFF1D5" }),
    lighting: "warm",
    background: "#120c09",
    shell: Object.freeze({ wall: "#2a1a16", seat: "#7a2e2a", seatAlt: "#5b3a2c", rail: "#b79a7a", led: "#A13C32", ledText: "#FFD36A" }),
    crowd: Object.freeze({ palette: ["#f0dcc0", "#a13c32", "#e0a43c", "#3d5a80", "#f2efe6", "#6b4a3a"], skin: ["#f1c9a5", "#d9a37a", "#a8714b", "#6f4529"] }),
    scoreboard: "retro",
  }),
});

export function normalizeArenaId(id) {
  return ARENA_IDS.includes(id) ? id : DEFAULT_ARENA;
}

export function arenaPreset(id) {
  return ARENA_PRESETS[normalizeArenaId(id)];
}

/**
 * Quality profiles. Low never removes match information (court, lines, players, ball, score): it thins crowd and decoration.
 * crowd = share of seats filled, floorPx = floor texture width (height follows the court's aspect), detail = optional trim.
 */
export const QUALITY_IDS = Object.freeze(["auto", "low", "medium", "high"]);
export const QUALITY_PROFILES = Object.freeze({
  low: Object.freeze({ crowd: 0.3, floorPx: 1024, detail: false, rigs: false }),
  medium: Object.freeze({ crowd: 0.65, floorPx: 1536, detail: true, rigs: true }),
  high: Object.freeze({ crowd: 1, floorPx: 2048, detail: true, rigs: true }),
});

/** "auto" picks Low on a small/touch screen and High otherwise; an unknown value falls back to auto. */
export function resolveQuality(quality, { mobile = false } = {}) {
  const q = QUALITY_PROFILES[quality] ? quality : "auto";
  if (q !== "auto") return q;
  return mobile ? "low" : "high";
}

export function qualityProfile(quality, env) {
  return QUALITY_PROFILES[resolveQuality(quality, env)];
}

// ---- device-local preference (not account data, like the avatar renderer choice) -------------------------------------

export const ARENA_PREF_KEY = "cls_arena_v1";
export const QUALITY_PREF_KEY = "cls_arena_quality_v1";

function readPref(storage, key) {
  try {
    return storage?.getItem?.(key) || null;
  } catch {
    return null;
  }
}

function writePref(storage, key, value) {
  try {
    storage?.setItem?.(key, value);
    return true;
  } catch {
    return false;
  }
}

export const readArenaPref = (storage) => readPref(storage, ARENA_PREF_KEY);
export const writeArenaPref = (storage, id) => writePref(storage, ARENA_PREF_KEY, normalizeArenaId(id));
export const readQualityPref = (storage) => readPref(storage, QUALITY_PREF_KEY);
export const writeQualityPref = (storage, q) => writePref(storage, QUALITY_PREF_KEY, QUALITY_IDS.includes(q) ? q : "auto");

/** URL override (?arena=modern, ?arenaQuality=low) beats the saved preference, which beats the default. */
export function chosenArena(search = "", storage = null) {
  const fromUrl = new URLSearchParams(search || "").get("arena");
  return normalizeArenaId(ARENA_IDS.includes(fromUrl) ? fromUrl : readArenaPref(storage));
}

export function chosenQuality(search = "", storage = null) {
  const fromUrl = new URLSearchParams(search || "").get("arenaQuality");
  const saved = readQualityPref(storage);
  return QUALITY_IDS.includes(fromUrl) ? fromUrl : QUALITY_IDS.includes(saved) ? saved : "auto";
}

/** Everything CourtView3D needs from the page, read defensively (no window/localStorage in tests or private modes). */
export function arenaOptionsFromPage() {
  const search = typeof location !== "undefined" ? location.search : "";
  let storage = null;
  try {
    storage = typeof localStorage !== "undefined" ? localStorage : null;
  } catch {
    storage = null;
  }
  const mobile = typeof matchMedia === "function" ? !!matchMedia("(max-width: 700px), (pointer: coarse)").matches : false;
  return { arena: chosenArena(search, storage), quality: resolveQuality(chosenQuality(search, storage), { mobile }) };
}
