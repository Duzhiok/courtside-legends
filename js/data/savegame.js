/**
 * Local mid-session save / continue (localStorage).
 * Covers live game, draft, setup, career market, legend, tournament.
 */

const SAVE_KEY = "cls_savegame_v1";
export const SAVE_VERSION = 1;

function reviveSets(value, setKeys = []) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map((v) => reviveSets(v, setKeys));
  const out = { ...value };
  for (const k of setKeys) {
    if (Array.isArray(out[k])) out[k] = new Set(out[k]);
  }
  return out;
}

function jsonClone(obj) {
  return JSON.parse(JSON.stringify(obj, (_k, v) => {
    if (v instanceof Set) return [...v];
    if (typeof v === "function") return undefined;
    return v;
  }));
}

export function hasSave() {
  return !!peekSave();
}

export function peekSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || data.v !== SAVE_VERSION) return null;
    return data;
  } catch {
    return null;
  }
}

export function clearSave() {
  localStorage.removeItem(SAVE_KEY);
}

export function formatSaveLabel(meta) {
  if (!meta) return "无存档";
  const when = meta.savedAt
    ? new Date(meta.savedAt).toLocaleString("zh-CN", {
        month: "numeric",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";
  return when ? `${meta.label || "进度"} · ${when}` : meta.label || "已保存进度";
}

/**
 * @param {object} payload — { screen, label, app, sim?, feed? }
 */
export function writeSave(payload) {
  const data = {
    v: SAVE_VERSION,
    savedAt: Date.now(),
    screen: payload.screen || "home",
    label: payload.label || "进度",
    app: payload.app || null,
    sim: payload.sim || null,
    feed: payload.feed || [],
  };
  const text = JSON.stringify(data);
  localStorage.setItem(SAVE_KEY, text);
  return { bytes: text.length, ...data };
}

export function readSave() {
  const data = peekSave();
  if (!data) return null;
  return data;
}

/** Draft: timers stripped, used → array for JSON. */
export function serializeDraft(draft) {
  if (!draft) return null;
  const d = { ...draft };
  delete d._cpuTimer;
  d.picking = false;
  d.used = draft.used instanceof Set ? [...draft.used] : [...(draft.used || [])];
  d.pack = jsonClone(draft.pack || []);
  d.teams = jsonClone(draft.teams);
  d.picksDone = { ...(draft.picksDone || {}) };
  d.needCoach = { ...(draft.needCoach || {}) };
  d.needAssistant = { ...(draft.needAssistant || {}) };
  d.freeRefreshes = { ...(draft.freeRefreshes || {}) };
  return d;
}

export function reviveDraft(raw) {
  if (!raw) return null;
  const d = reviveSets(raw, []);
  d.used = new Set(raw.used || []);
  d._cpuTimer = null;
  d.picking = false;
  return d;
}

export function serializeCareer(career) {
  if (!career) return null;
  const c = jsonClone(career);
  if (career.used instanceof Set) c.used = [...career.used];
  return c;
}

export function reviveCareer(raw) {
  if (!raw) return null;
  const c = { ...raw };
  c.used = new Set(raw.used || []);
  if (!Array.isArray(c.skillInventory)) c.skillInventory = [];
  return c;
}

export function serializeLegend(legend) {
  if (!legend) return null;
  const L = jsonClone(legend);
  if (legend.usedIds instanceof Set) L.usedIds = [...legend.usedIds];
  if (legend.usedPlayerKeys instanceof Set) L.usedPlayerKeys = [...legend.usedPlayerKeys];
  return L;
}

export function reviveLegend(raw) {
  if (!raw) return null;
  const L = { ...raw };
  L.usedIds = new Set(raw.usedIds || []);
  L.usedPlayerKeys = new Set(raw.usedPlayerKeys || []);
  return L;
}

export function serializeSetup(setup) {
  if (!setup) return null;
  return {
    selected: setup.selected instanceof Set ? [...setup.selected] : [...(setup.selected || [])],
    packPreview: setup.packPreview ?? null,
  };
}

export function reviveSetup(raw, youTeam) {
  if (!raw || !youTeam) return null;
  return {
    you: youTeam,
    selected: new Set(raw.selected || []),
    packPreview: raw.packPreview ?? null,
  };
}

export function serializeAppSlice(state) {
  return {
    mode: state.mode,
    lastMode: state.lastMode,
    speed: state.speed,
    autoOffense: !!state.autoOffense,
    autoDefense: !!state.autoDefense,
    autoRotation: !!state.autoRotation,
    career: serializeCareer(state.career),
    draft: serializeDraft(state.draft),
    legend: serializeLegend(state.legend),
    tournament: state.tournament ? jsonClone(state.tournament) : null,
    pendingMatch: state.pendingMatch ? jsonClone(state.pendingMatch) : null,
    setup: serializeSetup(state.setup),
  };
}

export { jsonClone };
