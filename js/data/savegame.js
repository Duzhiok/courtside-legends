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

const TEAM_REF_TAG = "__teamRef";

/**
 * Bracket careers (金币晋级赛 / 自定义预算轮抽) reference the SAME team object from
 * `career.team`, every `alive[]` slot, every pod's `teams[]`, and every match's `a`/`b`/
 * `winner`/`loser` across all rounds — that's the whole point, it's how a roster change
 * on your team shows up everywhere it appears (see seedCareerStage's `c.team` aliasing).
 * Naively `JSON.stringify`-ing that graph loses the sharing and writes out N independent
 * full copies of a 12-player roster instead of 1 — for a fresh 32-team bracket that was
 * ~7.9MB and blew straight through the localStorage quota before a single match was
 * played. So: collect each distinct team ONCE by bracketId, store it in a side table,
 * and replace every other appearance with a cheap `{ __teamRef }` stub. Revive does the
 * reverse — and importantly hands back the literal same object for every stub with the
 * same id, restoring (not just preserving) the sharing a plain deep-clone would have lost.
 */
function collectCareerTeams(career) {
  const map = new Map();
  const visit = (t) => {
    if (!t || typeof t !== "object" || t.bracketId == null) return;
    if (!map.has(t.bracketId)) map.set(t.bracketId, t);
  };
  visit(career.team);
  for (const t of career.alive || []) visit(t);
  for (const pod of career.pods || []) {
    for (const t of pod.teams || []) visit(t);
    for (const m of [pod.openerA, pod.openerB, pod.winnersMatch, pod.revivalMatch, pod.deciderMatch]) {
      if (!m) continue;
      visit(m.a);
      visit(m.b);
      visit(m.winner);
      visit(m.loser);
    }
    for (const t of pod.advancers || []) visit(t);
    for (const t of pod.eliminated || []) visit(t);
  }
  for (const m of career.roundMatches || []) {
    visit(m.a);
    visit(m.b);
    visit(m.winner);
    visit(m.loser);
  }
  if (career.series?.opp) visit(career.series.opp);
  return map;
}

function stubTeam(t) {
  if (!t || typeof t !== "object" || t.bracketId == null) return t ?? null;
  return { [TEAM_REF_TAG]: t.bracketId };
}

function stubMatch(m) {
  if (!m) return m;
  return { ...m, a: stubTeam(m.a), b: stubTeam(m.b), winner: stubTeam(m.winner), loser: stubTeam(m.loser) };
}

function stubPod(pod) {
  if (!pod) return pod;
  return {
    ...pod,
    teams: (pod.teams || []).map(stubTeam),
    openerA: stubMatch(pod.openerA),
    openerB: stubMatch(pod.openerB),
    winnersMatch: stubMatch(pod.winnersMatch),
    revivalMatch: stubMatch(pod.revivalMatch),
    deciderMatch: stubMatch(pod.deciderMatch),
    advancers: (pod.advancers || []).map(stubTeam),
    eliminated: (pod.eliminated || []).map(stubTeam),
  };
}

function unstubTeam(v, teamsById) {
  if (!v || typeof v !== "object") return v ?? null;
  if (TEAM_REF_TAG in v) return teamsById.get(v[TEAM_REF_TAG]) ?? null;
  return v;
}

function unstubMatch(m, teamsById) {
  if (!m) return m;
  return {
    ...m,
    a: unstubTeam(m.a, teamsById),
    b: unstubTeam(m.b, teamsById),
    winner: unstubTeam(m.winner, teamsById),
    loser: unstubTeam(m.loser, teamsById),
  };
}

function unstubPod(pod, teamsById) {
  if (!pod) return pod;
  return {
    ...pod,
    teams: (pod.teams || []).map((t) => unstubTeam(t, teamsById)),
    openerA: unstubMatch(pod.openerA, teamsById),
    openerB: unstubMatch(pod.openerB, teamsById),
    winnersMatch: unstubMatch(pod.winnersMatch, teamsById),
    revivalMatch: unstubMatch(pod.revivalMatch, teamsById),
    deciderMatch: unstubMatch(pod.deciderMatch, teamsById),
    advancers: (pod.advancers || []).map((t) => unstubTeam(t, teamsById)),
    eliminated: (pod.eliminated || []).map((t) => unstubTeam(t, teamsById)),
  };
}

export function serializeCareer(career) {
  if (!career) return null;
  const teamMap = collectCareerTeams(career);
  const teamsById = {};
  for (const [id, t] of teamMap) teamsById[id] = jsonClone(t);

  const skeleton = { ...career };
  skeleton.team = stubTeam(career.team);
  skeleton.alive = (career.alive || []).map(stubTeam);
  skeleton.pods = (career.pods || []).map(stubPod);
  skeleton.roundMatches = (career.roundMatches || []).map(stubMatch);
  if (career.series?.opp) skeleton.series = { ...career.series, opp: stubTeam(career.series.opp) };

  const c = jsonClone(skeleton);
  if (career.used instanceof Set) c.used = [...career.used];
  c.__teamsById = teamsById;
  return c;
}

export function reviveCareer(raw) {
  if (!raw) return null;
  const teamsById = new Map(Object.entries(raw.__teamsById || {}));
  const c = { ...raw };
  delete c.__teamsById;
  c.used = new Set(raw.used || []);
  if (!Array.isArray(c.skillInventory)) c.skillInventory = [];

  c.team = unstubTeam(raw.team, teamsById);
  c.alive = (raw.alive || []).map((t) => unstubTeam(t, teamsById));
  c.pods = (raw.pods || []).map((pod) => unstubPod(pod, teamsById));
  c.roundMatches = (raw.roundMatches || []).map((m) => unstubMatch(m, teamsById));
  if (raw.series?.opp) c.series = { ...raw.series, opp: unstubTeam(raw.series.opp, teamsById) };
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
