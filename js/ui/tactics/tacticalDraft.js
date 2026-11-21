// UI 3.0 slice 0 — the tactics editor's single draft. Pure functions, no DOM, no storage of its own.
//
// What this is NOT: a second tactical engine or a new save format. A draft is a normalised *view* of fields the
// team already has (coach.specialTactics, starterIds, gameplan, players[].orders). `applyDraft` writes exactly what
// the old tip-off handler (`#btn-setup-confirm` in app.js) writes, through the same `composeGameplan`, so there is
// one gameplan shape. Previews (reducer) never touch the team; only `commitDraft` does, and it rolls back on a
// failed save, so "apply" is all-or-nothing.
//
// Honest mapping of the spec's "offensive / defensive system" onto what GameSim really has:
//   offensiveSchemeId = the one active tactic (first of coach.specialTactics at tip-off)
//   defense           = defensePlan: scheme focus | double | bump against one target (+ matchup assignments)
import { TACTICS, availableTactics, orderTacticsDefaultFirst } from "../../data/coaches.js";
import {
  ORDER_ACTION, TEMPO_OPTIONS, normalizeTempo, ensurePlayerOrders, suggestedBallHandlerAction, usageForBallAction,
} from "../../engine/gameplan.js";

/** sim.js `setDefenseScheme` accepts these three (index.html #gp-scheme lists the same). */
export const DEFENSE_SCHEMES = ["focus", "double", "bump"];

/** The one gameplan shape. Used by the old tip-off handler and by `applyDraft`. */
export function composeGameplan({ defenderId = null, targetId = null, scheme = null, assignments = {}, offenseFocusId = null, tempo }) {
  const board = { ...assignments };
  const focusDef = defenderId || (targetId && board[targetId]) || null;
  return {
    matchup: targetId || Object.keys(board).length
      ? { defenderId: focusDef, targetId: targetId || null, scheme: targetId ? scheme : null, assignments: board }
      : null,
    matchupAssignments: board,
    offenseFocusId: offenseFocusId || null,
    tempo: normalizeTempo(tempo),
  };
}

export function createDraft(team) {
  const gp = team?.gameplan || {};
  const mu = gp.matchup || null;
  const handler = (team?.players || []).find((p) => p.id === gp.offenseFocusId);
  const onTeam = new Set((team?.players || []).map((p) => p.id));
  const pool = [...(team?.coach?.specialTactics?.length ? team.coach.specialTactics : ["balanced"])];
  return {
    coachId: team?.coach?.id ?? null, // read-only in Gold: the coach comes from the market, not from a card bench
    offensiveSchemeId: pool[0],
    tacticPool: pool,
    starterIds: [...(team?.starterIds || [])],
    ballHandlerId: handler ? gp.offenseFocusId : null,
    ballAction: handler?.orders?.action || null,
    tempo: normalizeTempo(gp.tempo),
    defense: {
      scheme: mu?.scheme || null,
      targetId: mu?.targetId || null,
      // A defender who has since left (sold, traded) is dropped here: the engine ignores him anyway, and a stale name used to
      // block Apply with "the chosen defender is not on your team" and no way for the player to clear it.
      defenderId: onTeam.has(mu?.defenderId) ? mu.defenderId : null,
      assignments: Object.fromEntries(Object.entries(gp.matchupAssignments || mu?.assignments || {}).filter(([, defender]) => onTeam.has(defender))),
    },
    scope: "team-default", // Gold v1: team default + this match. Persisted per-opponent plans are a later slice.
  };
}

const sortKeys = (v) => (Array.isArray(v) ? v.map(sortKeys) : v && typeof v === "object"
  ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])])) : v);
export const canonical = (draft) => JSON.stringify(sortKeys(draft));

export function createEditorState(team) {
  const draft = createDraft(team);
  return { savedSnapshot: structuredClone(draft), draft, activeTab: "offense", selectedPlayerId: null, revision: 0 };
}

/** Derived, never stored: a click that changes nothing (or edits back to the saved value) is not "dirty". */
export const isDirty = (state) => canonical(state.draft) !== canonical(state.savedSnapshot);

const edit = (state, patch) => ({ ...state, draft: { ...state.draft, ...patch }, revision: state.revision + 1 });

export function tacticalDraftReducer(state, action) {
  switch (action.type) {
    // navigation: never changes the draft, never dirties it
    case "SELECT_PLAYER": return { ...state, selectedPlayerId: action.playerId ?? null };
    case "SET_TAB": return { ...state, activeTab: action.tab };
    // edits
    case "SET_SCHEME": return edit(state, { offensiveSchemeId: action.schemeId });
    case "SET_TEMPO": return edit(state, { tempo: normalizeTempo(action.tempo) });
    case "SET_BALL_HANDLER": {
      if ((action.playerId || null) === state.draft.ballHandlerId) return state;
      return edit(state, { ballHandlerId: action.playerId || null, ballAction: null }); // null = the suggested action
    }
    case "SET_BALL_ACTION": return edit(state, { ballAction: action.actionId || null });
    case "SET_DEFENSE": return edit(state, { defense: { ...state.draft.defense, ...action.patch } });
    // lifecycle
    case "RESET": return { ...state, draft: structuredClone(state.savedSnapshot), revision: state.revision + 1 };
    // The roster list owns who starts; the board follows it. Not an edit: both the draft and the saved snapshot move,
    // so changing a starter never marks the tactics unsaved. A ball handler who left the five is cleared.
    case "SYNC_STARTERS": {
      const starterIds = [...action.starterIds];
      const follow = (d) => ({ ...d, starterIds, ...(d.ballHandlerId && !starterIds.includes(d.ballHandlerId) ? { ballHandlerId: null, ballAction: null } : {}) });
      return { ...state, draft: follow(state.draft), savedSnapshot: follow(state.savedSnapshot) };
    }
    case "MARK_SAVED": return { ...state, savedSnapshot: structuredClone(state.draft) };
    default: return state;
  }
}

/** errors block Apply (the engine cannot execute it); warnings never do: the player may choose a poor plan. */
export function validateDraft(draft, { team, opponent = null } = {}) {
  const errors = [];
  const warnings = [];
  const ids = new Set((team?.players || []).map((p) => p.id));
  const starters = draft.starterIds || [];
  if (starters.length !== 5 || new Set(starters).size !== 5 || starters.some((id) => !ids.has(id))) errors.push("STARTERS_INVALID");
  if (!TACTICS[draft.offensiveSchemeId]) errors.push("SCHEME_UNKNOWN");
  else if (!availableTactics(team?.coach, team?.players).some((t) => t.id === draft.offensiveSchemeId)) warnings.push("SCHEME_NOT_AVAILABLE_FOR_COACH_OR_ROSTER");
  if (!TEMPO_OPTIONS.some((t) => t.id === draft.tempo)) errors.push("TEMPO_INVALID");
  if (draft.ballHandlerId && !ids.has(draft.ballHandlerId)) errors.push("HANDLER_NOT_ON_TEAM");
  else if (draft.ballHandlerId && !starters.includes(draft.ballHandlerId)) warnings.push("HANDLER_NOT_A_STARTER");
  if (draft.ballAction && !ORDER_ACTION.some((a) => a.id === draft.ballAction)) errors.push("BALL_ACTION_INVALID");
  const d = draft.defense || {};
  if (d.scheme && !DEFENSE_SCHEMES.includes(d.scheme)) errors.push("DEFENSE_SCHEME_INVALID");
  // The engine ignores a defensive scheme with no target, or a target who is not on this opponent (a plan kept from last game's opponent):
  // it plays without it. That is worth telling the player, but it is not a plan the engine "cannot run", and it must never block tip-off.
  if (d.scheme && !d.targetId) warnings.push("DEFENSE_TARGET_MISSING");
  if (d.defenderId && !ids.has(d.defenderId)) errors.push("DEFENDER_NOT_ON_TEAM");
  if (opponent?.players && d.targetId && !opponent.players.some((p) => p.id === d.targetId)) warnings.push("DEFENSE_TARGET_NOT_ON_OPPONENT");
  return { errors, warnings };
}

/** Pure: returns a new team with the draft written exactly as the tip-off handler writes it. */
export function applyDraft(team, draft) {
  const next = structuredClone(team);
  const active = draft.offensiveSchemeId;
  const pool = draft.tacticPool.includes(active) ? draft.tacticPool : [active, ...draft.tacticPool];
  next.coach = { ...(next.coach || {}), specialTactics: orderTacticsDefaultFirst(pool, active) };
  next.starterIds = [...draft.starterIds];
  next.gameplan = composeGameplan({ ...draft.defense, offenseFocusId: draft.ballHandlerId, tempo: draft.tempo });
  ensurePlayerOrders(next.players);
  const handler = next.players.find((p) => p.id === draft.ballHandlerId);
  if (handler) {
    const act = draft.ballAction && draft.ballAction !== "auto" ? draft.ballAction : suggestedBallHandlerAction(handler);
    handler.orders.action = act;
    const usage = usageForBallAction(act);
    if (usage && (handler.orders.usage === "auto" || !handler.orders.usage)) handler.orders.usage = usage;
  }
  return next;
}

const planFields = (team) => ({
  coach: team.coach, starterIds: team.starterIds, gameplan: team.gameplan,
  orders: Object.fromEntries((team.players || []).map((p) => [p.id, p.orders])),
});
function writePlanFields(team, fields) {
  team.coach = fields.coach;
  team.starterIds = fields.starterIds;
  team.gameplan = fields.gameplan;
  for (const p of team.players || []) if (p.id in fields.orders) p.orders = fields.orders[p.id];
}

/**
 * All-or-nothing apply onto the live team object (identity preserved: other code holds references to it).
 * `save` is injected (Gold: autosaveCareer); a throw or `false` restores every field and reports SAVE_FAILED.
 */
export function commitDraft(team, draft, { save = null, opponent = null } = {}) {
  const { errors, warnings } = validateDraft(draft, { team, opponent });
  if (errors.length) return { ok: false, errors, warnings };
  const rollback = structuredClone(planFields(team));
  writePlanFields(team, planFields(applyDraft(team, draft)));
  try {
    if (save && save() === false) throw new Error("save returned false");
  } catch (error) {
    writePlanFields(team, rollback);
    return { ok: false, errors: ["SAVE_FAILED"], warnings, error };
  }
  return { ok: true, errors: [], warnings };
}
