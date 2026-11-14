/**
 * Season hub wiring for opponent scouting. Reads the season, previews plans, and -- only on "Apply plan" --
 * calls the injected `commit(team)` (which saves). Plan choice lives in this closure; nothing is stored until applied.
 */
import { liveTeam, nextUserGame, nextUserPlayoffGame } from "../engine/season.js";
import { scoutOpponent } from "../myteam/opponentScouting.js";
import { counterStrategies } from "../myteam/counterStrategy.js";
import { applyCounterPlan } from "../myteam/applyPlan.js";
import { matchupPlanHtml } from "./matchupPlanView.js";

function nextOpponentId(st) {
  const g = st.phase === "regular" ? nextUserGame(st)?.game : st.phase === "playoffs" ? nextUserPlayoffGame(st) : null;
  if (!g) return null;
  return g.homeId === st.userTeamId ? g.awayId : g.awayId === st.userTeamId ? g.homeId : null;
}

export function createMatchupController({ box, getLang, allow = () => true, commit }) {
  let selected = null;
  let applied = false;
  let cache = null; // keyed by opponent + saved five + tactic: re-picking a tab must not redo the 792-lineup search

  function compute(st) {
    const oppId = nextOpponentId(st);
    if (!oppId || !st.teams[oppId]) return null;
    const mine = liveTeam(st, st.userTeamId);
    const opp = liveTeam(st, oppId);
    const you = st.teams[st.userTeamId];
    const key = [oppId, (you.starterIds || []).join(), you.coach?.specialTactics?.[0], mine.players.length].join("|");
    if (cache?.key === key) return cache.value;
    const scout = scoutOpponent({ players: opp.players, starterIds: st.teams[oppId].starterIds, coach: opp.coach, name: opp.name });
    const strategy = scout && mine.coach
      ? counterStrategies({ coach: mine.coach, roster: mine.players.filter((p) => !(p.injuredGames > 0)), opponent: scout, currentIds: you.starterIds || [], currentTacticId: you.coach?.specialTactics?.[0] || null })
      : null;
    const value = scout && strategy ? { scout, strategy, cards: mine.players } : null;
    cache = { key, value };
    return value;
  }

  function paint(st) {
    if (!box) return;
    const data = st ? compute(st) : null;
    box.innerHTML = data ? matchupPlanHtml({ ...data, selected, lang: getLang(), applied }) : "";
    box.hidden = !data;
  }

  box?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || !box.contains(btn)) return;
    const st = box._season?.();
    const act = btn.dataset.act;
    if (act === "scout-plan") { selected = btn.dataset.plan; applied = false; paint(st); box.querySelector("details")?.setAttribute("open", ""); return; }
    if (act === "scout-keep") { selected = null; applied = false; paint(st); return; }
    if (act === "scout-apply") {
      const data = st && compute(st);
      const plan = data?.strategy.plans.find((p) => p.id === (selected || data.strategy.recommended));
      if (!plan || !allow()) return;
      const team = st.teams[st.userTeamId];
      if (applyCounterPlan(team, plan) && commit(st)) { applied = true; cache = null; paint(st); box.querySelector("details")?.setAttribute("open", ""); }
    }
  });
  return { paint, bind: (getSeason) => { if (box) box._season = getSeason; } };
}
