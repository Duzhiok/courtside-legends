// The season playoffs tab (#season-playoffs): the bracket, the Finals card, the Finals All-Team / MVP cards, the live
// stat table and the action row. Pure: (season state, two flags) -> HTML. app.js keeps what is not markup: the render-time
// fill-in of the Finals awards (computeFinalsAllTeam / computeFinalsMvp write onto the season), the button handlers and
// every confirm / save / navigation they trigger.
//
// Moved out of app.js unchanged (B61): the strings are byte-for-byte what it inlined, and i18n-phrases.js depends on them.
import { L } from "../i18n.js";
import { esc } from "../core/html.js";
import { nextSeriesHomeAway, openSeries } from "../engine/season.js";

/** Before the playoffs exist: a hint and the one-click "sim the whole thing" button. */
export function playoffsPromptHtml(st) {
  return `<p class="tiny">${L("常规赛结束后从评奖页进入季后赛（东西部各八强，七场四胜）。", "After the regular season, enter the playoffs from the awards page (top 8 per conference, best of 7).")}</p>
      <button type="button" class="btn" id="btn-season-sim-playoffs" ${
        st.phase === "awards" || st.phase === "regular" ? "" : "disabled"
      }>${L("一键模拟整个季后赛", "Sim the whole playoffs")}</button>`;
}

/**
 * The whole tab once `st.playoffs` exists.
 * `managed` = the league career is a managed one; `hasDraft` = this season's draft board is already open (both only pick the
 * offseason button's wording).
 */
export function playoffsHtml(st, { managed = false, hasDraft = false } = {}) {
  const po = st.playoffs;
  const teamName = (id) => st.teams[id]?.name || id;
  // Every game of a series with its score (home first), so a series reads as a story instead of a bare "3-2".
  const gameLogHtml = (s) =>
    (s.games || []).length
      ? `<div class="series-games">${s.games
          .map((g, i) => `<span class="series-game${g.winnerId === s.high?.id ? " hi" : " lo"}">G${i + 1} ${esc(teamName(g.homeId))} <b>${g.homeScore}</b>–<b>${g.awayScore}</b> ${esc(teamName(g.awayId))}</span>`)
          .join("")}</div>`
      : "";
  const seriesHtml = (s) =>
    `<div class="season-series-row"><span>${s.high?.name || s.high?.id} vs ${
      s.low?.name || s.low?.id
    }</span><strong>${s.winsHigh}-${s.winsLow}${s.done ? ` · ${s.winnerName || s.winnerId}` : ""}</strong></div>${gameLogHtml(s)}`;
  const finalsCardHtml = (f) => {
    const next = f.done ? null : nextSeriesHomeAway(f);
    return `<div class="season-award-card finals-card"><h4>${L("总决赛", "Finals")} · ${L("七场四胜", "best of 7")}</h4>
      <div class="finals-board"><span>${esc(f.high?.name || f.high?.id)}</span><strong>${f.winsHigh} – ${f.winsLow}</strong><span>${esc(f.low?.name || f.low?.id)}</span></div>
      ${gameLogHtml(f)}
      ${next ? `<p class="tiny">${L(`下一场：第 ${f.winsHigh + f.winsLow + 1} 场 · 主场 ${esc(teamName(next.homeId))}`, `Next: Game ${f.winsHigh + f.winsLow + 1} · home ${esc(teamName(next.homeId))}`)}</p>` : ""}
      ${po.championId ? `<p><strong>${L(`总冠军 ${st.teams[po.championId]?.name}`, `Champions ${st.teams[po.championId]?.name}`)}</strong></p>` : ""}</div>`;
  };
  const confBlock = (key, title) => {
    const b = po[key];
    return `<div class="season-award-card"><h4>${title} · R${b.round}</h4>${(b.series || [])
      .map(seriesHtml)
      .join("")}${b.finalist ? `<p class="tiny">${L(`分区冠军：${st.teams[b.finalist]?.name}`, `Conference champions: ${st.teams[b.finalist]?.name}`)}</p>` : ""}</div>`;
  };
  const finalsTeamHtml = (st.finalsAllTeam || []).length
    ? `<div class="season-award-card"><h4>${L("总决赛最佳阵容 · PG → C", "Finals All-Team · PG → C")}</h4>
        <div class="all-team-row season">
          ${st.finalsAllTeam
            .map(
              (p) => `<div class="all-team-slot">
                <span class="all-team-pos">${p.slot || p.pos}</span>
                <strong>${p.name}</strong>
                <em class="tiny">${p.teamName || ""}</em>
                <span class="tiny">${p.gp ? L(`${p.ppg}分 ${p.rpg}板 ${p.apg}助`, `${p.ppg} pts ${p.rpg} reb ${p.apg} ast`) : `OVR ${p.ovr}`}</span>
              </div>`
            )
            .join("")}
        </div></div>`
    : "";
  const finalsMvpHtml = st.finalsMvp
    ? `<div class="season-award-card"><h4>${L("总决赛 MVP", "Finals MVP")}</h4>
        <p><strong>${st.finalsMvp.name}</strong>${st.finalsMvp.teamName ? ` · ${st.finalsMvp.teamName}` : ""} · ${st.finalsMvp.gp ? L(`${st.finalsMvp.ppg}分 ${st.finalsMvp.rpg}板 ${st.finalsMvp.apg}助（${st.finalsMvp.gp}场）`, `${st.finalsMvp.ppg} pts ${st.finalsMvp.rpg} reb ${st.finalsMvp.apg} ast (${st.finalsMvp.gp} G)`) : `OVR ${st.finalsMvp.ovr}`}</p></div>`
    : "";
  const userRecord = st.standings?.[st.userTeamId];
  const playoffStats = Object.values(st.playerSeason || {})
    .filter((row) => row.teamId === st.userTeamId && row.stats?.gp)
    .sort((a, b) => (b.stats.pts / b.stats.gp) - (a.stats.pts / a.stats.gp))
    .slice(0, 8);
  const playoffStatsHtml = `<div class="season-award-card playoff-live-stats"><h4>${L("我方当前战绩与球员数据", "Your current record and player stats")}</h4><p class="tiny">${
    userRecord ? L(`${userRecord.w}胜${userRecord.l}负 · 净胜 ${userRecord.pf - userRecord.pa}`, `${userRecord.w}-${userRecord.l} · Diff ${userRecord.pf - userRecord.pa}`) : L("暂无战绩", "No record yet")
  }${L(" · 数据为赛季累计（含已模拟季后赛）", " · Season totals (including simmed playoffs)")}</p><div class="table-scroll"><table class="season-table"><thead><tr><th>${L("球员", "Player")}</th><th>GP</th><th>MIN</th><th>PTS</th><th>REB</th><th>AST</th><th>+/-</th></tr></thead><tbody>${
    playoffStats.map((row) => `<tr><td>${esc(row.name)}</td><td>${row.stats.gp}</td><td>${(row.stats.min / row.stats.gp).toFixed(1)}</td><td>${(row.stats.pts / row.stats.gp).toFixed(1)}</td><td>${(row.stats.reb / row.stats.gp).toFixed(1)}</td><td>${(row.stats.ast / row.stats.gp).toFixed(1)}</td><td>${row.stats.plusMinus / row.stats.gp >= 0 ? "+" : ""}${(row.stats.plusMinus / row.stats.gp).toFixed(1)}</td></tr>`).join("") || `<tr><td colspan="7">${L("暂无球员数据", "No player data yet")}</td></tr>`}</tbody></table></div></div>`;
  // B59: once the season is over the bulk playoff sims are dead buttons (they were only
  // disabled) — don't render them. The offseason button stays for non-My Team seasons;
  // a My Team season shows its own done bar instead, so the row may end up empty.
  const poSimButtons =
    st.phase === "done"
      ? ""
      : `<button type="button" class="btn primary" id="btn-season-night-po">${
          po.finals && !po.finals.done
            ? L("模拟总决赛下一场", "Sim next Finals game")
            : openSeries(st).length
              ? L("模拟下一个比赛日", "Sim next playoff night")
              : L("进入下一轮", "Start next round")
        }</button>
      <button type="button" class="btn" id="btn-season-advance-po">${po.finals && !po.finals.done ? L("打完总决赛", "Sim the rest of the Finals") : L("模拟下一轮", "Sim next round")}</button>
      <button type="button" class="btn" id="btn-season-sim-all-po">${L("一键打完季后赛", "Sim rest of playoffs")}</button>`;
  const poOffseasonButton =
    st.phase === "done" && !st.myTeam
      ? `<button type="button" class="btn primary" id="btn-season-offseason">${
          hasDraft
            ? L("继续选秀", "Continue draft")
            : managed
              ? L("进入休赛期选秀", "Enter offseason draft")
              : L(`休赛期成长 · 开启 ${Number(st.year) + 1} 赛季`, `Offseason growth · Start ${Number(st.year) + 1} season`)
        }</button>`
      : "";
  const poActionRow =
    poSimButtons || poOffseasonButton ? `<div class="btn-row">${poSimButtons}${poOffseasonButton}</div>` : "";
  return `
    ${playoffStatsHtml}
    ${confBlock("east", L("东部", "East"))}
    ${confBlock("west", L("西部", "West"))}
    ${
      po.finals ? finalsCardHtml(po.finals) : ""
    }
    ${finalsTeamHtml}
    ${finalsMvpHtml}
    ${poActionRow}
    ${
      st.offseasonLog?.length
        ? `<div class="season-award-card"><h4>${L("上次休赛期成长 / 续约（我方）", "Last offseason growth / renewals (yours)")}</h4><div class="tiny">${st.offseasonLog
            .slice(0, 16)
            .map((r) => {
              const sal =
                r.salaryBefore != null
                  ? L(` · 薪 ¤${r.salaryBefore}→¤${r.salaryAfter || 0}${
                      r.renewal ? `（${r.renewal}）` : ""
                    }`, ` · Sal ¤${r.salaryBefore}→¤${r.salaryAfter || 0}${
                      r.renewal ? ` (${r.renewal})` : ""
                    }`)
                  : "";
              return `${r.name}：${r.fromSeason}→${r.toSeason} · OVR ${r.before}${
                r.delta >= 0 ? "+" : ""
              }${r.delta}→${r.after}${sal}`;
            })
            .join("<br/>")}</div></div>`
        : ""
    }
  `;
}
