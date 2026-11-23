// The season hub's heading and its "next game" card: what to say and which action buttons are live, per season phase.
// Pure. app.js (renderSeasonHub) keeps everything that touches the season or the page: it advances the schedule to the
// user's next game and looks the game up (advanceToUserGame mutates the season), then asks these what to draw.
//
// Moved out of app.js unchanged (B61): the strings are byte-for-byte what it inlined, and i18n-phrases.js depends on them.
// (The old code also had an empty `if (!st.awards && st.phase === "regular") { /* ... */ }` in the "season is over" branch; it did nothing and is gone.)
import { L } from "../i18n.js";
import { esc } from "../core/html.js";
import { seasonGames, seasonProgressLabel, seasonTeamIds, userGamesPlayed } from "../engine/season.js";
import { formatSalary, SEASON_SALARY_CAP } from "../engine/seasonMarket.js";

/**
 * The title and the pill texts under it. `you` = the user's team, `pay` = its payrollSummary, `lang` = the UI language.
 * A My Team roster is frozen and has no market, so it shows the lock instead of payroll / cap room (which would only alarm).
 */
export function hubHeading(st, { you, pay, lang }) {
  const eraTitle =
    st.mode === "historical" && st.league?.yearLabel
      ? L(`${st.league.yearLabel} 历史赛季`, `${st.league.yearLabel} Historic Season`)
      : L(`${st.year} 赛季`, `${st.year} Season`);
  const histNote =
    st.mode === "historical" ? L(` · ${seasonTeamIds(st).length} 队当年阵容`, ` · ${seasonTeamIds(st).length} teams, historic rosters`) : "";
  const capMetaText = `${seasonProgressLabel(st, lang)}${histNote} · ${L(`薪资 ${formatSalary(pay.payroll)}/${SEASON_SALARY_CAP}`, `Payroll ${formatSalary(pay.payroll)}/${SEASON_SALARY_CAP}`)}${
    pay.overCap ? L("（超软帽）", " (over soft cap)") : ""
  } · ${L(`空间 ${formatSalary(pay.space)}`, `Room ${formatSalary(pay.space)}`)}`;
  const metaText = st.myTeam ? `${seasonProgressLabel(st, lang)} · ${L("阵容已锁定", "Lineup locked")}${st.myTeam.goldEarned ? ` · 🪙 ¤${st.myTeam.goldEarned}` : ""}` : capMetaText;
  return {
    title: `${you?.name || L("我方", "Your team")} · ${eraTitle}`,
    metaParts: metaText.split(" · ").filter(Boolean),
  };
}

/**
 * The "next game" card. `phase` = the season phase the card is for, read BEFORE app.js advances the schedule: advanceToUserGame
 * moves a finished regular season on to "awards", and the card must still be the regular-season one (it says "regular season done").
 * `info` = the user's next game (regular season: `nextUserGame`, playoffs: `nextUserPlayoffGame`; null when
 * there is none), `managed` = the league career is a managed one. `helpers` = { hubTeamHex(team), playoffSeriesLabel(st, series) }
 * (both are shared with other screens, so they stay in app.js).
 * Returns null for a phase that has no card, else `{ html | text, play, simOne, simWeek }`: the card body (html for the matchup,
 * text otherwise) and whether each button is DISABLED.
 */
export function nextCardView(st, { phase, info, managed }, { hubTeamHex, playoffSeriesLabel }) {
  if (phase === "regular") {
    if (!info) {
      return { text: L("常规赛已打完——查看评奖后进入季后赛", "Regular season done — check awards, then enter the playoffs"), play: true, simOne: true, simWeek: true };
    }
    const g = info.game;
    const home = st.teams[g.homeId]?.name;
    const away = st.teams[g.awayId]?.name;
    const played = userGamesPlayed(st);
    const youHome = g.homeId === st.userTeamId;
    const html = `<div class="next-matchup"><span class="nm-team${youHome ? " nm-you" : ""}"><i class="nm-dot" style="background:${hubTeamHex(st.teams[g.homeId])}"></i>${esc(home)}</span><span class="nm-vs">VS</span><span class="nm-team${youHome ? "" : " nm-you"}"><i class="nm-dot" style="background:${hubTeamHex(st.teams[g.awayId])}"></i>${esc(away)}</span></div><p class="nm-meta">${L(`第 ${played + 1}/${seasonGames(st)} 场 · 日程日 ${info.day + 1}`, `Game ${played + 1}/${seasonGames(st)} · Day ${info.day + 1}`)}</p>`;
    return { html, play: false, simOne: false, simWeek: false };
  }
  if (phase === "awards") {
    return { text: L("常规赛结束。已生成赛季评奖，可进入季后赛。", "Regular season over. Awards are in — you can enter the playoffs."), play: true, simOne: true, simWeek: true };
  }
  if (phase !== "playoffs" && phase !== "done") return null;
  const champ = st.playoffs?.championId ? st.teams[st.playoffs.championId]?.name : null;
  // "Sim 5 games" is a regular-season idea and never applies to the playoffs / a finished season.
  if (phase === "done") {
    const text = st.myTeam
      ? champ
        ? L(`总冠军：${champ}。这一季打完了，点上方「再来一季」继续。`, `Champions: ${champ}. That's the season — hit "Play another season" above.`)
        : L("这一季打完了，点上方「再来一季」继续。", "That's the season — hit \"Play another season\" above.")
      : champ
      ? managed
        ? L(`总冠军：${champ}。可进入休赛期选秀，完成选择后开启 ${Number(st.year) + 1} 赛季。`, `Champions: ${champ}. Head to the offseason draft, then start the ${Number(st.year) + 1} season.`)
        : L(`总冠军：${champ}。可进入休赛期：球员按史实生涯成长/衰老，并开启 ${Number(st.year) + 1} 赛季。`, `Champions: ${champ}. Head to the offseason: players grow and age on their real career curves, then the ${Number(st.year) + 1} season starts.`)
      : managed
        ? L("赛季结束。可进入休赛期选秀。", "Season over. Head to the offseason draft.")
        : L("赛季结束。可进入休赛期让球员按史实潜力成长。", "Season over. Head to the offseason, where players grow on their real potential.");
    return { text, play: true, simOne: true, simWeek: true };
  }
  if (info) {
    // The user's series is still alive and it's their turn: show whose turn it is and let them play it (this used to be
    // unconditionally disabled for the whole playoffs — user report: "季后赛我不能手动打吗？？？").
    const label = playoffSeriesLabel(st, info.series);
    const youAreHigh = info.series.high?.id === st.userTeamId;
    const myWins = youAreHigh ? info.series.winsHigh : info.series.winsLow;
    const theirWins = youAreHigh ? info.series.winsLow : info.series.winsHigh;
    const oppName = (youAreHigh ? info.series.low : info.series.high)?.name || L("对手", "Opponent");
    const atHome = info.homeId === st.userTeamId;
    return {
      text: L(`${label} 第 ${myWins + theirWins + 1} 场 · ${myWins}-${theirWins} vs ${oppName}（${atHome ? "主场" : "客场"}）`, `${label} Game ${myWins + theirWins + 1} · ${myWins}-${theirWins} vs ${oppName} (${atHome ? "Home" : "Away"})`),
      play: false, simOne: false, simWeek: true,
    };
  }
  return {
    text: champ
      ? L(`总冠军：${champ}`, `Champions: ${champ}`)
      : L("你的系列赛暂无进行中的比赛——可能在等另一分区，或已被淘汰。可点「季后赛」页签模拟剩余赛事。", "Your series has no game right now — it may be waiting on the other bracket, or you may be out. Use the Playoffs tab to sim the rest."),
    play: true, simOne: true, simWeek: true,
  };
}
