/**
 * Season hub wiring for opponent scouting. Reads the season, previews plans, and -- only on "Apply plan" --
 * calls the injected `commit(team)` (which saves). Plan choice lives in this closure; nothing is stored until applied.
 */
import { liveTeam, nextUserGame, nextUserPlayoffGame } from "../engine/season.js";
import { scoutOpponent } from "../myteam/opponentScouting.js";
import { counterStrategies } from "../myteam/counterStrategy.js";
import { applyCounterPlan, clearMatchupPlan } from "../myteam/applyPlan.js";
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

  /** The cache key of what is on screen right now (null when there is no next opponent). Cheap: no analysis. */
  function keyOf(st) {
    const oppId = nextOpponentId(st);
    if (!oppId || !st.teams[oppId]) return null;
    const mine = liveTeam(st, st.userTeamId);
    const you = st.teams[st.userTeamId];
    const series = seriesContext(st);
    // The series state is part of the key: after a playoff game the opponent
    // and starters may be unchanged, but the game number and series score move.
    const seriesKey = series ? [series.gameNumber, series.myWins, series.theirWins].join(":") : "";
    return { oppId, mine, you, series, key: [oppId, (you.starterIds || []).join(), you.coach?.specialTactics?.[0], mine.players.length, seriesKey].join("|") };
  }

  function compute(st) {
    const k = keyOf(st);
    if (!k) return null;
    if (cache?.key === k.key) return cache.value;
    const { oppId, mine, you, series } = k;
    const opp = liveTeam(st, oppId);
    const scout = scoutOpponent({ players: opp.players, starterIds: st.teams[oppId].starterIds, coach: opp.coach, name: opp.name });
    const strategy = scout && mine.coach
      ? counterStrategies({ coach: mine.coach, roster: mine.players.filter((p) => !(p.injuredGames > 0)), opponent: scout, currentIds: you.starterIds || [], currentTacticId: you.coach?.specialTactics?.[0] || null })
      : null;
    const value = scout && strategy ? { scout, strategy, cards: mine.players, series } : null;
    cache = { key: k.key, value };
    return value;
  }

  function paint(st) {
    if (!box) return;
    const data = st ? compute(st) : null;
    box.innerHTML = data ? matchupPlanHtml({ ...data, selected, lang: getLang(), applied }) : "";
    box.hidden = !data;
  }

  // The first analysis of a new opponent searches ~800 lineups (about a fifth of a second, a second on a phone) and the player has not
  // asked for it yet: the season hub paints first, the panel fills in when the browser is idle. A repeat of something already analysed
  // paints at once.
  let pending = null;
  const later = (fn) => (typeof requestIdleCallback === "function" ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 60));
  const cancel = (id) => (typeof cancelIdleCallback === "function" ? cancelIdleCallback(id) : clearTimeout(id));
  function paintLater(st) {
    if (!box) return;
    const k = st ? keyOf(st) : null;
    if (!k || cache?.key === k.key) { paint(st); return; }
    if (pending != null) cancel(pending);
    box.hidden = true; // the previous opponent's panel must not stay up while this one is worked out
    pending = later(() => {
      pending = null;
      paint(box._season?.() || st);
    });
  }

  box?.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || !box.contains(btn)) return;
    const st = box._season?.();
    const act = btn.dataset.act;
    if (act === "scout-plan") { selected = btn.dataset.plan; applied = false; paint(st); box.querySelector("details")?.setAttribute("open", ""); return; }
    if (act === "scout-keep") {
      selected = null; applied = false;
      // "Keep current" also clears a previously-applied matchup plan for this opponent -- the saved default resumes.
      const team = st?.teams[st.userTeamId];
      if (team && clearMatchupPlan(team) && allow()) commit(st);
      cache = null; paint(st); return;
    }
    if (act === "scout-apply") {
      const data = st && compute(st);
      const plan = data?.strategy.plans.find((p) => p.id === (selected || data.strategy.recommended));
      const oppId = nextOpponentId(st);
      if (!plan || !oppId || !allow()) return;
      const team = st.teams[st.userTeamId];
      if (applyCounterPlan(team, plan, oppId) && commit(st)) { applied = true; cache = null; paint(st); box.querySelector("details")?.setAttribute("open", ""); }
    }
  });
  return { paint, paintLater, bind: (getSeason) => { if (box) box._season = getSeason; } };
}
