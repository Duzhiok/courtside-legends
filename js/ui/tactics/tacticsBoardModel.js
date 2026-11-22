// UI 3.0 slice 1 — view model for the Gold pre-game tactics board. Pure: no DOM, no storage, no dice.
//
// Everything here is read from the draft (tacticalDraft.js) plus the team/opponent cards, through the helpers the
// game already uses, so the board shows the same numbers GameSim will act on. Each analysis row carries a `tag`:
//   "sim"    = the value is a GameSim input or the same number GameSim computes (fit = lineupFit)
//   "advice" = analysis only (scouting, suggestions) — it never changes a dice roll by itself
import { TACTICS } from "../../data/coaches.js";
import { selectableSystems, coachProfile } from "../../coaching/coachTacticalProfile.js";
import { coachSystemFit } from "../../coaching/coachSystemFit.js";
import { COURT_SLOTS, SLOT_ORDER, assignCourtSlots } from "../../myteam/courtSlots.js";
import { scoutOpponent } from "../../myteam/opponentScouting.js";
import { ovr } from "../../myteam/playerRoleFit.js";
import { ORDER_ACTION, suggestedBallHandlerAction } from "../../engine/gameplan.js";
import { normalizePos } from "../../data/positions.js";
import { validateDraft } from "./tacticalDraft.js";

const pick = (lang, zh, en) => (lang === "en" ? en || zh : zh);
const tacticLabel = (id, lang) => pick(lang, TACTICS[id]?.name || id, TACTICS[id]?.nameEn);
// ORDER_ACTION (engine/gameplan.js, shared file) only carries Chinese names; English labels live here, UI-side.
const ACTION_EN = { pnr: "Pick & roll", drive_kick: "Drive & kick", iso: "Isolation", spot: "Spot-up", post: "Post-up", crash: "Crash the glass" };
const actionLabel = (a, lang) => (lang === "en" ? ACTION_EN[a.id] || a.name : a.name);
const posOf = (p) => normalizePos(p?.playPos || p?.pos);

function playerChip(p, handlerId) {
  const parts = String(p.name || "").trim().split(/\s+/);
  const short = parts.length > 1 ? parts.slice(1).join(" ") : parts[0]; // surname on the court chip; full name in aria
  return { id: p.id, name: p.name, short, pos: posOf(p), ovr: ovr(p), isHandler: p.id === handlerId };
}

/**
 * @param {{team: object, draft: object, opponent?: object|null, lang?: string, dirty?: boolean}} args
 */
export function buildTacticsBoardModel({ team, draft, opponent = null, lang = "zh", dirty = false, saveFailed = false }) {
  const coach = team?.coach || null;
  const players = team?.players || [];
  const byId = new Map(players.map((p) => [p.id, p]));
  const starters = (draft?.starterIds || []).map((id) => byId.get(id)).filter(Boolean);

  const systems = selectableSystems(coach, players).map((s) => ({
    id: s.id,
    name: tacticLabel(s.id, lang),
    source: s.source, // coach | roster | open
    proficiencyPct: Math.round(s.proficiency * 100),
    fit: coachSystemFit(coach, s.tactic, starters).score,
    active: s.id === draft?.offensiveSchemeId,
  }));
  const active = systems.find((s) => s.active) || null;

  const placed = assignCourtSlots(starters, posOf, ovr);
  const slots = SLOT_ORDER.map((slot) => ({
    slot,
    ...COURT_SLOTS[slot],
    player: placed[slot] ? playerChip(placed[slot], draft?.ballHandlerId) : null,
  }));

  const handler = byId.get(draft?.ballHandlerId) || null;
  const suggested = handler ? suggestedBallHandlerAction(handler) : null;
  const ballActions = ORDER_ACTION.filter((a) => a.id !== "auto").map((a) => ({
    id: a.id,
    name: actionLabel(a, lang),
    selected: (draft?.ballAction || suggested) === a.id,
    suggested: a.id === suggested,
  }));

  const scout = opponent ? scoutOpponent(opponent) : null;
  const threats = (scout?.threats || []).slice(0, 2).map((t) => ({ id: t.id, name: t.name, pos: t.pos, ovr: t.ovr, level: t.level }));

  const rows = [
    { key: "system", tag: "sim", label: pick(lang, "体系", "System"), value: active ? active.name : "—" },
    { key: "fit", tag: "sim", label: pick(lang, "体系契合", "System fit"), value: active ? String(active.fit) : "—" },
    { key: "proficiency", tag: "sim", label: pick(lang, "教练熟练度", "Coach proficiency"), value: active ? `${active.proficiencyPct}%` : "—" },
    { key: "handler", tag: "sim", label: pick(lang, "持球核心", "Ball handler"), value: handler ? handler.name : pick(lang, "自动", "Auto") },
  ];
  if (threats.length) {
    rows.push({ key: "threat", tag: "advice", label: pick(lang, "对手威胁", "Opponent threat"), value: threats.map((t) => t.name).join(" · ") });
  }

  const { errors, warnings } = validateDraft(draft, { team, opponent });
  const prof = coachProfile(coach);
  return {
    coach: coach ? { name: coach.name || coach.id || "—", philosophy: prof.philosophy, native: prof.nativeSystems.map((id) => tacticLabel(id, lang)) } : null,
    systems,
    slots,
    handlerId: handler?.id || null,
    ballActions: handler ? ballActions : [],
    threats,
    rows,
    errors,
    warnings,
    dirty: !!dirty,
    saveFailed: !!saveFailed,
    canApply: !!dirty && errors.length === 0,
  };
}
