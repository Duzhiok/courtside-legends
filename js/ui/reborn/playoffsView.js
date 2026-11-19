/**
 * Player Reborn — standings and playoffs panels (Playoffs v1). Pure HTML builders: the state comes in, markup comes out; the buttons
 * (`data-po-enter`, `data-po-play`) are wired by rebornView.js. Teams are shown by their code, like the rest of the Reborn screen.
 */
import { esc } from "../../core/html.js";
import { leagueStandings } from "../../reborn/league.js";
import { ROUND_NAMES, involves, nextUserGame, userRun } from "../../reborn/playoffs.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);
const roundName = (round, lang) => ROUND_NAMES[round - 1]?.[lang === "en" ? "en" : "zh"] || "";

/** The league table: each conference's top eight (the playoff field), the player's club always shown. Empty when the league was never simulated. */
export function standingsHtml({ reborn, year, lang = "zh" } = {}) {
  if (!reborn?.league || reborn.league.year !== year) return "";
  const st = leagueStandings(reborn, year);
  const me = reborn.player.teamId;
  const conf = (key, label) => {
    const ids = st[key];
    const shown = ids.slice(0, 8);
    if (ids.indexOf(me) >= 8) shown.push(me);
    const rows = shown.map((id) => {
      const r = st.rows[id];
      return `<tr class="${id === me ? "reborn-standing-me" : ""}${r.confRank === 8 ? " reborn-standing-cut" : ""}"><td>${r.confRank}</td><td>${esc(id)}</td><td>${r.w}-${r.l}</td></tr>`;
    });
    return `<div class="reborn-standing-conf"><h4>${label}</h4><table class="reborn-standing-table"><tbody>${rows.join("")}</tbody></table></div>`;
  };
  const pace = st.complete ? "" : ` <span class="tiny">(${L("进行中", "in progress", lang)})</span>`;
  return `<details class="reborn-standings"><summary>${L("联盟积分榜", "League standings", lang)}${pace}</summary>${conf("east", L("东部", "East", lang))}${conf("west", L("西部", "West", lang))}<p class="tiny">${L("每个分区前 8 名进入季后赛（无附加赛）。", "The top 8 of each conference make the playoffs (no Play-In).", lang)}</p></details>`;
}

const seedLabel = (po, id) => `${po.seedOf[id] ? `(${po.seedOf[id]}) ` : ""}${esc(id)}`;

/** One series as a line: "(1) LAL 4–2 (8) SEA", the winner in bold, an open series shows its running score. */
function seriesLine(po, s, lang) {
  if (!s.high || !s.low) return `<li class="reborn-series reborn-series-tbd">${roundName(s.round, lang)} · ${L("待定", "to be decided", lang)}</li>`;
  const mine = involves(s, po.userId) ? " reborn-series-me" : "";
  const w = (id) => (s.winner === id ? `<strong>${seedLabel(po, id)}</strong>` : seedLabel(po, id));
  const bo = L(`${s.bestOf} 场 ${Math.ceil(s.bestOf / 2)} 胜`, `best of ${s.bestOf}`, lang);
  return `<li class="reborn-series${mine}">${roundName(s.round, lang)} · ${w(s.high)} ${s.winsHigh}–${s.winsLow} ${w(s.low)} <span class="tiny">${bo}</span></li>`;
}

const roundExit = (po) => userRun(po)?.series.at(-1)?.round || 0;

/** The playoffs of the season: the way in, the series the player is in, his next game, or where his run ended. */
export function playoffsPanelHtml({ reborn, year, lang = "zh", busy = false, progress = false } = {}) {
  const po = reborn?.playoffs?.year === year ? reborn.playoffs : null;
  if (!po) {
    const note = progress ? `<p class="reborn-ff-progress">${L("正在补算联盟赛程……", "Catching up the league schedule…", lang)}</p>` : "";
    return `<section class="reborn-playoffs"><h3>${L("常规赛结束", "Regular season over", lang)}</h3><p>${L("82 场打完，联盟战绩已定。进入季后赛。", "All 82 games are in and the league table is set. On to the playoffs.", lang)}</p>${note}<button type="button" data-po-enter="1" ${busy ? "disabled" : ""}>${L("进入季后赛", "Enter the playoffs", lang)}</button></section>`;
  }
  if (po.status === "unavailable") {
    return `<section class="reborn-playoffs"><h3>${L("季后赛", "Playoffs", lang)}</h3><p>${L("这个赛季没有完整的联盟数据，无法进行季后赛。", "This season has no complete league data, so there are no playoffs.", lang)}</p></section>`;
  }
  const mine = po.series.filter((s) => s.high && involves(s, po.userId));
  const bracket = `<ul class="reborn-bracket">${po.series.filter((s) => s.high || s.round > 1).map((s) => seriesLine(po, s, lang)).join("")}</ul>`;
  const champ = po.championId ? `<p>${L("本季总冠军", "Champions", lang)}：<strong>${esc(po.championId)}</strong></p>` : "";
  if (po.status === "missed") {
    return `<section class="reborn-playoffs"><h3>${L("季后赛", "Playoffs", lang)}</h3><p>${L("你的球队没有进入季后赛，赛季到此结束。", "Your team missed the playoffs. The season ends here.", lang)}</p>${champ}<details><summary>${L("季后赛对阵", "Bracket", lang)}</summary>${bracket}</details></section>`;
  }
  if (po.status === "eliminated") {
    const out = roundName(roundExit(po), lang);
    return `<section class="reborn-playoffs"><h3>${L("季后赛", "Playoffs", lang)}</h3><p>${L(`你的球队在${out}被淘汰。`, `Your team was eliminated in the ${out}.`, lang)}</p>${champ}<details><summary>${L("季后赛对阵", "Bracket", lang)}</summary>${bracket}</details></section>`;
  }
  if (po.status === "champion") {
    return `<section class="reborn-playoffs reborn-champion"><h3>${L("总冠军！", "NBA champions!", lang)}</h3><p>${L("你的球队拿下了总冠军。", "Your team won the title.", lang)}</p><details open><summary>${L("季后赛对阵", "Bracket", lang)}</summary>${bracket}</details></section>`;
  }
  const g = nextUserGame(po);
  const cur = mine.at(-1);
  const where = g ? (g.homeId === po.userId ? L("主场", "Home", lang) : L("客场", "Away", lang)) : "";
  const head = g
    ? `<p>${roundName(g.round, lang)} · ${seedLabel(po, po.userId)} ${g.userWins}–${g.oppWins} ${seedLabel(po, g.oppId)}${g.titleGame ? ` · <strong>${L("夺冠战！", "Title game!", lang)}</strong>` : ""}</p>`
    : `<p>${cur ? roundName(cur.round, lang) : ""}</p>`;
  const btn = g ? `<button type="button" data-po-play="1" ${busy ? "disabled" : ""}>${L(`打季后赛第 ${g.n} 场`, `Play playoff game ${g.n}`, lang)} (${where})</button>` : "";
  return `<section class="reborn-playoffs"><h3>${L("季后赛", "Playoffs", lang)}</h3>${head}${btn}<details><summary>${L("季后赛对阵", "Bracket", lang)}</summary>${bracket}</details></section>`;
}

/** The heading line of a playoff game's report ("Playoffs · First round · game 2 · series 2–1"). Empty for a regular-season report. */
export function playoffReportLine(report, lang = "zh") {
  const po = report?.po, s = report?.playoffs;
  if (!po) return "";
  const score = s ? ` · ${L("系列赛", "series", lang)} ${s.userWins}–${s.oppWins}${s.seriesOver ? (s.seriesWon ? L("，晋级", ", advance", lang) : L("，出局", ", out", lang)) : ""}` : "";
  return `${L("季后赛", "Playoffs", lang)} · ${roundName(po.round, lang)} · ${L(`第 ${po.n} 场`, `game ${po.n}`, lang)}${score}`;
}
