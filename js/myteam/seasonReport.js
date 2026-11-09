/**
 * My Team Season report + objectives (T2 progression). Pure functions over the season object: nothing here writes.
 * The cards in a My Team season are clones with no in-season growth system, so the "development" part of the report is
 * what the players actually did (stats, awards, rank), not invented rating changes.
 */
import { madePlayoffs } from "../data/accountLevel.js";

/** champion | finals | playoffs | missed | pending (season not over yet). */
export function seasonFinish(st) {
  if (!st?.userTeamId) return "pending";
  const po = st.playoffs;
  if (po?.championId === st.userTeamId) return "champion";
  if ([po?.finals?.high?.id, po?.finals?.low?.id].includes(st.userTeamId)) return "finals";
  if (madePlayoffs(st)) return "playoffs";
  return st.phase === "done" ? "missed" : "pending";
}

/** 1-based rank by regular-season wins (fewer losses breaks ties), and the number of teams. */
export function seasonRank(st) {
  const rows = Object.entries(st?.standings || {}).map(([id, r]) => ({ id, w: r?.w || 0, l: r?.l || 0 }));
  rows.sort((a, b) => b.w - a.w || a.l - b.l);
  const i = rows.findIndex((r) => r.id === st?.userTeamId);
  return { rank: i < 0 ? null : i + 1, teams: rows.length };
}

/** The user's players with a real sample, best scorer first. */
export function myPlayerLines(st) {
  return Object.values(st?.playerSeason || {})
    .filter((r) => r?.teamId === st.userTeamId && r.stats?.gp > 0)
    .map((r) => {
      const s = r.stats;
      const pg = (k) => +(s[k] / s.gp).toFixed(1);
      return { id: r.playerId, name: r.name, pos: r.pos, gp: s.gp, mpg: pg("min"), ppg: pg("pts"), rpg: pg("reb"), apg: pg("ast") };
    })
    .sort((a, b) => b.ppg - a.ppg);
}

/** Simple objectives from data we already have. status: open | done | failed. */
export function seasonObjectives(st) {
  if (!st?.myTeam) return [];
  const games = st.rsGames || st.myTeam.rules?.seasonLength || 20;
  const rec = st.standings?.[st.userTeamId] || { w: 0, l: 0 };
  const over = st.phase === "done";
  const finish = seasonFinish(st);
  const need = Math.ceil(games * 0.6);
  const best = myPlayerLines(st).find((p) => p.gp >= Math.ceil(games * 0.4));
  const st3 = (done, failed) => (done ? "done" : failed ? "failed" : "open");
  return [
    { id: "wins60", target: need, progress: rec.w, status: st3(rec.w >= need, (rec.l || 0) > games - need) },
    { id: "playoffs", status: st3(["champion", "finals", "playoffs"].includes(finish), over || !!st.playoffs) },
    { id: "star20", progress: best?.ppg || 0, target: 20, status: st3(over && (best?.ppg || 0) >= 20, over) },
    { id: "title", status: st3(finish === "champion", over) },
  ];
}

const OBJ_TEXT = {
  wins60: (o, en) => (en ? `Win ${o.target}+ games` : `赢下 ${o.target}+ 场`),
  playoffs: (_o, en) => (en ? "Make the playoffs" : "打进季后赛"),
  star20: (_o, en) => (en ? "A 20+ PPG scorer" : "出一位场均 20+ 分的球员"),
  title: (_o, en) => (en ? "Win the title" : "夺得总冠军"),
};
export const objectiveText = (o, lang = "zh") => OBJ_TEXT[o.id]?.(o, lang === "en") || o.id;
const MARK = { done: "✓", failed: "✗", open: "·" };

/** One compact line for the season hub while playing. */
export function objectivesLine(list, lang = "zh") {
  return (list || []).map((o) => `${MARK[o.status]} ${objectiveText(o, lang)}`).join("  ");
}

/** Everything the end-of-season panel shows. */
export function seasonReport(st) {
  if (!st?.myTeam) return null;
  const rec = st.standings?.[st.userTeamId] || { w: 0, l: 0 };
  const players = myPlayerLines(st);
  const mine = (a) => (a && a.teamId === st.userTeamId ? a : null);
  return {
    w: rec.w || 0,
    l: rec.l || 0,
    ...seasonRank(st),
    finish: seasonFinish(st),
    players,
    star: players[0] || null,
    mvp: st.awards?.mvp ? { name: st.awards.mvp.name, mine: !!mine(st.awards.mvp), ppg: st.awards.mvp.ppg } : null,
    objectives: seasonObjectives(st),
  };
}
