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

// Playoff series context for the panel: which game, the series score, home/away.
// Null in the regular season. The label key mirrors playoffSeriesLabel in app.js;
// the view renders it, so the controller stays free of UI strings.
function seriesContext(st) {
  if (st.phase !== "playoffs") return null;
  const info = nextUserPlayoffGame(st);
  if (!info) return null;
  const { series, gameIndex, homeId } = info;
  const youAreHigh = series.high?.id === st.userTeamId;
  const conf = series === st.playoffs?.finals ? "finals" : st.playoffs?.east?.series?.includes(series) ? "east" : st.playoffs?.west?.series?.includes(series) ? "west" : "playoffs";
  return {
    conf,
    round: series.round || 1,
    gameNumber: gameIndex + 1,
    myWins: youAreHigh ? series.winsHigh : series.winsLow,
    theirWins: youAreHigh ? series.winsLow : series.winsHigh,
    atHome: homeId === st.userTeamId,
  };
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
    const series = seriesContext(st);
    // The series state is part of the key: after a playoff game the opponent
    // and starters may be unchanged, but the game number and series score move.
    const seriesKey = series ? [series.gameNumber, series.myWins, series.theirWins].join(":") : "";
    const key = [oppId, (you.starterIds || []).join(), you.coach?.specialTactics?.[0], mine.players.length, seriesKey].join("|");
    if (cache?.key === key) return cache.value;
    const scout = scoutOpponent({ players: opp.players, starterIds: st.teams[oppId].starterIds, coach: opp.coach, name: opp.name });
    const strategy = scout && mine.coach
      ? counterStrategies({ coach: mine.coach, roster: mine.players.filter((p) => !(p.injuredGames > 0)), opponent: scout, currentIds: you.starterIds || [], currentTacticId: you.coach?.specialTactics?.[0] || null })
      : null;
    const value = scout && strategy ? { scout, strategy, cards: mine.players, series } : null;
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
