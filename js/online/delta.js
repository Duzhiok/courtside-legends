/**
 * T6 P1 frame deltas — shared by the Node server and the browser client.
 *
 * A full online frame is < 8KB, but at 300ms/tick most of it is unchanged:
 * only the clock, the scorer's line and a few stamina/mood numbers move
 * per possession. diffFrame() emits just the changes; applyFrameDelta()
 * rebuilds the full frame on the client. The first frame a connection
 * sees is always full (server-side needsFull flag); a delta arriving
 * before any full frame is ignored by the caller.
 *
 * Patch shape:
 *   { type: "frame_delta", tick, <changed scalars...>,
 *     home: { <changed team scalars...>, onCourt: [ids]?, bench: [ids]?,
 *             players: { id: {partial player} }? },
 *     away: { ... } }
 * onCourt/bench id lists appear only when membership changed; players
 * entries carry only changed fields (a player with no previous entry
 * carries its full framePlayer). diffFrame returns null when nothing
 * changed (caller may skip the send).
 */

function diffScalars(prev, next, keys, out) {
  for (const k of keys) {
    if (prev[k] !== next[k]) out[k] = next[k];
  }
}

function diffNested(prev, next, keys, out, key) {
  const sub = {};
  diffScalars(prev, next, keys, sub);
  if (Object.keys(sub).length) out[key] = sub;
}

const STAT_KEYS = [
  "pts", "reb", "ast", "stl", "blk", "tov", "pf",
  "fgm", "fga", "tpm", "tpa", "ftm", "fta", "min",
];

function diffPlayer(prev, next) {
  if (!prev) return { ...next, stats: { ...next.stats } };
  const out = { id: next.id };
  diffScalars(prev, next, ["playPos", "fatigue", "hot", "mood", "injuredGames", "injuryStatus"], out);
  diffNested(prev.stats || {}, next.stats || {}, STAT_KEYS, out, "stats");
  return Object.keys(out).length > 1 ? out : null;
}

function sameIdList(a, b) {
  return a.length === b.length && a.every((p, i) => p.id === b[i].id);
}

function diffTeam(prev, next) {
  const out = {};
  diffScalars(prev, next, ["name", "chem", "fit", "morale", "focusId"], out);
  const prevTactic = prev.tactic?.id ?? null;
  const nextTactic = next.tactic?.id ?? null;
  if (prevTactic !== nextTactic) out.tactic = next.tactic;
  const prevById = new Map([...prev.onCourt, ...prev.bench].map((p) => [p.id, p]));
  const players = {};
  for (const p of [...next.onCourt, ...next.bench]) {
    const d = diffPlayer(prevById.get(p.id), p);
    if (d) players[p.id] = d;
  }
  if (Object.keys(players).length) out.players = players;
  if (!sameIdList(prev.onCourt, next.onCourt)) out.onCourt = next.onCourt.map((p) => p.id);
  if (!sameIdList(prev.bench, next.bench)) out.bench = next.bench.map((p) => p.id);
  return Object.keys(out).length ? out : null;
}

export function diffFrame(prev, next) {
  if (!prev) return null;
  const patch = { type: "frame_delta", tick: next.tick };
  diffScalars(prev, next, ["quarter", "clock", "possession", "paused", "breakReason"], patch);
  diffNested(prev.score || {}, next.score || {}, ["home", "away"], patch, "score");
  diffNested(prev.timeouts || {}, next.timeouts || {}, ["home", "away"], patch, "timeouts");
  diffNested(prev.momentum || {}, next.momentum || {}, ["side", "points", "streak"], patch, "momentum");
  for (const side of ["home", "away"]) {
    const d = diffTeam(prev[side], next[side]);
    if (d) patch[side] = d;
  }
  return Object.keys(patch).length > 2 ? patch : null;
}

function applyTeam(prevTeam, patchTeam) {
  const team = { ...prevTeam };
  for (const k of ["name", "chem", "fit", "morale", "focusId", "tactic"]) {
    if (k in patchTeam) team[k] = patchTeam[k];
  }
  const byId = new Map([...prevTeam.onCourt, ...prevTeam.bench].map((p) => [p.id, { ...p, stats: { ...p.stats } }]));
  for (const [id, partial] of Object.entries(patchTeam.players || {})) {
    const base = byId.get(id);
    if (base) {
      byId.set(id, { ...base, ...partial, stats: { ...base.stats, ...(partial.stats || {}) } });
    } else {
      byId.set(id, { ...partial, stats: { ...(partial.stats || {}) } });
    }
  }
  if (patchTeam.onCourt) team.onCourt = patchTeam.onCourt.map((id) => byId.get(id)).filter(Boolean);
  else team.onCourt = team.onCourt.map((p) => byId.get(p.id) || p);
  if (patchTeam.bench) team.bench = patchTeam.bench.map((id) => byId.get(id)).filter(Boolean);
  else team.bench = team.bench.map((p) => byId.get(p.id) || p);
  return team;
}

export function applyFrameDelta(prev, patch) {
  if (!prev || !patch || patch.type !== "frame_delta") return null;
  const frame = JSON.parse(JSON.stringify(prev));
  frame.type = "frame";
  frame.tick = patch.tick;
  for (const k of ["quarter", "clock", "possession", "paused", "breakReason"]) {
    if (k in patch) frame[k] = patch[k];
  }
  for (const k of ["score", "timeouts", "momentum"]) {
    if (patch[k]) frame[k] = { ...frame[k], ...patch[k] };
  }
  for (const side of ["home", "away"]) {
    if (patch[side]) frame[side] = applyTeam(frame[side], patch[side]);
  }
  return frame;
}
