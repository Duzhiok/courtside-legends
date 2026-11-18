/**
 * Season Awards 2.0: the awards tab as a stats dashboard. Pure: (season state, lang) -> HTML.
 *
 * Every number comes from the season itself: the player's `st.playerSeason` row (summed box scores), the standings, and
 * the `basis` the award selection recorded (js/engine/season.js computeAwards). Nothing is estimated here; a metric whose
 * inputs are missing (an old save, a field added later) is null and shows as "—". Per-game numbers divide by games
 * actually played, and "games" is out of the season's real length (seasonGames), not an assumed 82.
 */
import { TL, teamNameL } from "../i18n.js";
import { esc } from "./timeTravel/format.js";
import { photoImg } from "../data/photo.js";
import { seasonGames, standingsList } from "../engine/season.js";

// ── Data ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const has = (stats, ...keys) => keys.every((key) => Number.isFinite(stats?.[key]));
const ratio = (num, den) => (den > 0 ? num / den : null);

/**
 * Season metrics from summed box-score totals. Each is null unless all of its inputs exist.
 * TS% = PTS / (2 x (FGA + 0.44 x FTA)). EFF is the NBA's efficiency rating per game:
 * (PTS + REB + AST + STL + BLK - missed FG - missed FT - TOV) / GP. It is not PER, which needs league pace and averages.
 */
export function seasonMetrics(stats) {
  const gp = has(stats, "gp") && stats.gp > 0 ? stats.gp : null;
  const per = (key) => (gp && has(stats, key) ? stats[key] / gp : null);
  const pct = (made, att) => (has(stats, made, att) ? ratio(stats[made], stats[att]) : null);
  return {
    gp,
    gs: has(stats, "gs") ? stats.gs : null,
    mpg: per("min"),
    ppg: per("pts"),
    rpg: per("reb"),
    orpg: per("oreb"),
    drpg: per("dreb"),
    apg: per("ast"),
    spg: per("stl"),
    bpg: per("blk"),
    tpg: per("tov"),
    fpg: per("pf"),
    fg: pct("fg", "fga"),
    tp: pct("tp", "tpa"),
    ft: pct("ft", "fta"),
    // A shooting-efficiency number needs shots: with no field-goal attempts (free throws only) TS% reads as e.g. 113%.
    ts: has(stats, "pts", "fga", "fta") && stats.fga > 0 ? ratio(stats.pts, 2 * (stats.fga + 0.44 * stats.fta)) : null,
    eff: gp && has(stats, "pts", "reb", "ast", "stl", "blk", "fg", "fga", "ft", "fta", "tov")
      ? (stats.pts + stats.reb + stats.ast + stats.stl + stats.blk - (stats.fga - stats.fg) - (stats.fta - stats.ft) - stats.tov) / gp
      : null,
    pm: per("plusMinus"),
  };
}

/** The player's season row; an award saved without one falls back to the per-game numbers stored on the award. */
function metricsFor(st, award) {
  const row = st?.playerSeason?.[`${award.teamId}:${award.playerId}`];
  if (row?.stats) return seasonMetrics(row.stats);
  const stored = (key) => (Number.isFinite(award[key]) ? award[key] : null);
  return { ...seasonMetrics({}), gp: stored("gp"), ppg: stored("ppg"), rpg: stored("rpg"), apg: stored("apg"), spg: stored("spg"), bpg: stored("bpg") };
}

/** Record, win %, league and conference rank, and points for/against per game, from the standings. */
export function teamContext(st, teamId) {
  const league = standingsList(st);
  const at = league.findIndex((team) => team.id === teamId);
  if (at < 0) return null;
  const team = league[at];
  const conf = team.conf === "East" || team.conf === "West" ? team.conf : null;
  const confRank = conf ? standingsList(st, conf).findIndex((row) => row.id === teamId) + 1 : null;
  const gp = team.w + team.l;
  return {
    name: team.name,
    w: team.w,
    l: team.l,
    pct: gp ? team.w / gp : null,
    leagueRank: at + 1,
    teams: league.length,
    conf,
    confRank: confRank || null,
    ppg: gp && Number.isFinite(team.pf) ? team.pf / gp : null,
    oppg: gp && Number.isFinite(team.pa) ? team.pa / gp : null,
  };
}

// ── Formatting ────────────────────────────────────────────────────────────────────────────────────────────────────

const DASH = "—";
const one = (n) => (n == null ? DASH : n.toFixed(1));
const pctText = (n) => (n == null ? DASH : `${(n * 100).toFixed(1)}%`);
const signed = (n) => (n == null ? DASH : `${n > 0 ? "+" : ""}${n.toFixed(1)}`);

/** Stat columns: label (zh/en), how to read it off the metrics. `gp` is shown out of the real season length. */
const STATS = {
  gp: { zh: "场次", en: "GP", read: (m, ctx) => (m.gp == null ? DASH : `${m.gp}/${ctx.games}`) },
  gs: { zh: "首发", en: "GS", read: (m) => (m.gs == null ? DASH : String(m.gs)) },
  mpg: { zh: "时间", en: "MIN", read: (m) => one(m.mpg) },
  ppg: { zh: "得分", en: "PTS", read: (m) => one(m.ppg) },
  rpg: { zh: "篮板", en: "REB", read: (m) => one(m.rpg) },
  orpg: { zh: "前场板", en: "OREB", read: (m) => one(m.orpg) },
  drpg: { zh: "后场板", en: "DREB", read: (m) => one(m.drpg) },
  apg: { zh: "助攻", en: "AST", read: (m) => one(m.apg) },
  spg: { zh: "抢断", en: "STL", read: (m) => one(m.spg) },
  bpg: { zh: "盖帽", en: "BLK", read: (m) => one(m.bpg) },
  tpg: { zh: "失误", en: "TOV", read: (m) => one(m.tpg) },
  fpg: { zh: "犯规", en: "PF", read: (m) => one(m.fpg) },
  fg: { zh: "命中率", en: "FG%", read: (m) => pctText(m.fg) },
  tp: { zh: "三分", en: "3P%", read: (m) => pctText(m.tp) },
  ft: { zh: "罚球", en: "FT%", read: (m) => pctText(m.ft) },
  ts: { zh: "真实命中", en: "TS%", read: (m) => pctText(m.ts) },
  eff: { zh: "效率值", en: "EFF", read: (m) => one(m.eff) },
  pm: { zh: "正负值", en: "+/-", read: (m) => signed(m.pm) },
};
const ALL_STATS = Object.keys(STATS);

function statGrid(keys, metrics, ctx, lang, cls = "aw-stats") {
  const cells = keys.map((key) => {
    const value = STATS[key].read(metrics, ctx);
    const missing = value === DASH ? ` class="na" title="${esc(TL(lang, "暂无数据", "Not available"))}"` : "";
    return `<div><dt>${esc(TL(lang, STATS[key].zh, STATS[key].en))}</dt><dd${missing}>${value}</dd></div>`;
  });
  return `<dl class="${cls}">${cells.join("")}</dl>`;
}

function rankText(team, lang) {
  if (!team) return DASH;
  if (team.conf && team.confRank) {
    return TL(lang, `${team.conf === "East" ? "东部" : "西部"}第 ${team.confRank}`, `#${team.confRank} in the ${team.conf}`);
  }
  return TL(lang, `联盟第 ${team.leagueRank}`, `#${team.leagueRank} in the league`);
}

function teamPanel(team, lang) {
  if (!team) return `<div class="aw-team"><span>${esc(TL(lang, "球队战绩", "Team"))}</span><strong>${DASH}</strong></div>`;
  return `<div class="aw-team">
    <span>${esc(TL(lang, "球队战绩", "Team record"))}</span>
    <strong>${esc(teamNameL(team.name, lang))} ${team.w}-${team.l}</strong>
    <em>${esc(rankText(team, lang))}</em>
  </div>`;
}

// ── Award cards ───────────────────────────────────────────────────────────────────────────────────────────────────

/**
 * What each award shows up front, and the plain-language rule behind it (the selection itself lives in computeAwards;
 * `basis` carries the numbers it used).
 */
const AWARDS = [
  {
    key: "mvp", zh: "常规赛 MVP", en: "MVP",
    stats: ["gp", "ppg", "rpg", "apg", "spg", "bpg", "ts", "eff"],
    why: (b, lang) => TL(lang,
      `依据：个人产出（得分、篮板、助攻、抢断、盖帽，扣除失误）× 球队胜率加权，再按出场比例折算${b?.score != null ? `；MVP 分 ${b.score}` : ""}。`,
      `Basis: individual production (points, rebounds, assists, steals, blocks, minus turnovers) weighted by team win %, scaled by games played${b?.score != null ? `; MVP score ${b.score}` : ""}.`),
  },
  {
    key: "dpoy", zh: "最佳防守球员 DPOY", en: "Defensive Player of the Year",
    stats: ["gp", "spg", "bpg", "drpg", "rpg", "pm", "mpg", "eff"],
    why: (b, lang) => TL(lang,
      `依据：场均抢断、盖帽、后场篮板、篮板，外加少量能力值加成${b?.score != null ? `；防守分 ${b.score}` : ""}。不含球队防守成绩。`,
      `Basis: steals, blocks, defensive rebounds and rebounds per game, plus a small rating term${b?.score != null ? `; defense score ${b.score}` : ""}. Team defense is not counted.`),
  },
  {
    key: "sixthMan", zh: "最佳第六人", en: "Sixth Man of the Year",
    stats: ["gp", "gs", "mpg", "ppg", "rpg", "apg", "ts", "eff"],
    why: (b, lang) => TL(lang,
      `资格：首发不到出场的一半${b?.gs != null ? `（${b.gs}/${b.gp}）` : ""}，首发按每场上场时间前五估算；在符合者中按场均得分评选。`,
      `Eligibility: started fewer than half his games${b?.gs != null ? ` (${b.gs}/${b.gp})` : ""}; starts are estimated as each night's top five in minutes. Ranked by points per game.`),
  },
  {
    key: "mip", zh: "最快进步 MIP", en: "Most Improved Player",
    stats: ["gp", "ppg", "rpg", "apg", "fg", "tp", "ts", "eff"],
    why: (b, lang) => b?.rule === "yoy" ? TL(lang,
      `依据：与同一球员上一个真实赛季相比，场均综合产出（得分 + 0.85×篮板 + 1.15×助攻）提升最多（${b.prev.season}→${b.card.season}，+${b.gain}）。比较的是两个真实赛季的数据，不是模拟成绩；上赛季至少 20 场、场均 12 分钟以上才有资格。`,
      `Basis: biggest gain in per-game production (points + 0.85 x rebounds + 1.15 x assists) over the same player's previous real season (${b.prev.season} to ${b.card.season}, +${b.gain}). It compares two real seasons, not simulated results; last season needs at least 20 games and 12 minutes a game.`) : TL(lang,
      `依据：没有任何人选有可比较的上一个真实赛季，改按场均得分 + 0.5×助攻，与按能力值（OVR）推算的预期之差${b?.over != null ? `（预期 ${b.expected}，高出 ${b.over}）` : ""}，年轻球员有少量加成。游戏没有保存上赛季数据，所以这不是逐年对比。`,
      `Basis: points + 0.5 x assists per game against what his rating (OVR) predicts${b?.over != null ? ` (expected ${b.expected}, ${b.over} above)` : ""}, with a small youth bonus. Last season's numbers are not kept, so this is not a year-over-year comparison.`),
  },
  {
    key: "roy", zh: "最佳新秀 ROY", en: "Rookie of the Year",
    stats: ["gp", "mpg", "ppg", "rpg", "apg", "spg", "bpg", "ts"],
    why: (b, lang) => (b?.rule === "age"
      ? TL(lang, "资格：没有该球员的生涯数据，按 22 岁及以下判定；在符合者中按 MVP 分评选。", "Eligibility: no career data for this player, so 22 or younger counts; ranked by MVP score.")
      : TL(lang, "资格：本赛季是他的生涯第一季；在符合者中按 MVP 分评选。", "Eligibility: this is his first NBA season; ranked by MVP score.")),
  },
];

function minGamesLine(award, lang) {
  const min = award.basis?.minGames;
  return min ? `<li>${esc(TL(lang, `出场门槛：至少 ${min} 场（按本季长度折算）。`, `Minimum: ${min} games (scaled to this season's length).`))}</li>` : "";
}

function playerCard(def, award, st, ctx, lang) {
  const title = esc(TL(lang, def.zh, def.en));
  if (!award) {
    return `<section class="aw-card aw-empty"><h4 class="aw-title">${title}</h4><p>${esc(TL(lang, "本季没有符合条件的人选。", "No eligible player this season."))}</p></section>`;
  }
  const metrics = metricsFor(st, award);
  const team = teamContext(st, award.teamId);
  const photo = photoImg({ name: award.name, bref: award.bref, season: award.season }, "headshot aw-photo");
  const meta = [award.pos, teamNameL(award.teamName, lang), award.season ? TL(lang, `${award.season} 卡`, `${award.season} card`) : ""].filter(Boolean).join(" · ");
  const yoy = def.key === "mip" && award.basis?.rule === "yoy" ? award.basis : null;
  const badge = yoy
    ? `<div class="aw-badge"><span>${esc(TL(lang, "产出提升", "Gain"))}</span><strong>${signed(yoy.gain)}</strong></div>`
    : def.key === "mip" && award.basis?.over != null
      ? `<div class="aw-badge"><span>${esc(TL(lang, "超出能力预期", "Above rating"))}</span><strong>${signed(award.basis.over)}</strong></div>`
      : "";
  const yoyLine = yoy
    ? `<p class="aw-prev">${esc(TL(lang,
      `真实数据：${yoy.prev.season} ${yoy.prev.ppg}分 ${yoy.prev.rpg}板 ${yoy.prev.apg}助 → ${yoy.card.season} ${yoy.card.ppg}分 ${yoy.card.rpg}板 ${yoy.card.apg}助`,
      `Real seasons: ${yoy.prev.season} ${yoy.prev.ppg}/${yoy.prev.rpg}/${yoy.prev.apg} to ${yoy.card.season} ${yoy.card.ppg}/${yoy.card.rpg}/${yoy.card.apg}`))}</p>`
    : "";
  return `<details class="aw-card" data-award="${def.key}">
    <summary>
      <div class="aw-head">
        <h4 class="aw-title">${title}</h4>
        <div class="aw-who">${photo}<div><strong>${esc(award.name)}</strong><span>${esc(meta)}</span></div></div>
      </div>
      ${badge}
      ${yoyLine}
      ${statGrid(def.stats, metrics, ctx, lang)}
      ${teamPanel(team, lang)}
      <span class="aw-more">${esc(TL(lang, "详情", "Details"))}</span>
    </summary>
    <div class="aw-body">
      ${statGrid(ALL_STATS, metrics, ctx, lang, "aw-stats aw-stats-full")}
      <ul class="aw-why">
        <li>${esc(def.why(award.basis, lang))}</li>
        ${minGamesLine(award, lang)}
        ${team ? `<li>${esc(TL(lang,
    `球队：${team.w}-${team.l}，胜率 ${pctText(team.pct)}，${rankText(team, "zh")}、联盟第 ${team.leagueRank}/${team.teams}。`,
    `Team: ${team.w}-${team.l}, ${pctText(team.pct)}, ${rankText(team, "en")}, #${team.leagueRank} of ${team.teams} overall.`))}</li>` : ""}
      </ul>
    </div>
  </details>`;
}

function coachCard(coty, st, lang) {
  const title = esc(TL(lang, "最佳教练", "Coach of the Year"));
  if (!coty) return `<section class="aw-card aw-empty"><h4 class="aw-title">${title}</h4><p>${DASH}</p></section>`;
  const team = teamContext(st, coty.teamId);
  const initials = esc(String(coty.name || "?").slice(0, 1));
  const cell = (zh, en, value) => `<div><dt>${esc(TL(lang, zh, en))}</dt><dd${value === DASH ? ' class="na"' : ""}>${value}</dd></div>`;
  const net = team?.ppg != null && team?.oppg != null ? team.ppg - team.oppg : null;
  return `<details class="aw-card" data-award="coty">
    <summary>
      <div class="aw-head">
        <h4 class="aw-title">${title}</h4>
        <div class="aw-who"><span class="aw-initial" aria-hidden="true">${initials}</span><div><strong>${esc(coty.name)}</strong><span>${esc(TL(lang, `主教练 · ${teamNameL(coty.teamName, lang)}`, `Head coach · ${teamNameL(coty.teamName, lang)}`))}</span></div></div>
      </div>
      <dl class="aw-stats">
        ${cell("战绩", "W-L", team ? `${team.w}-${team.l}` : `${coty.w}-${coty.l}`)}
        ${cell("胜率", "Win %", pctText(team?.pct ?? null))}
        ${cell("联盟排名", "League", team ? `${team.leagueRank}/${team.teams}` : DASH)}
        ${cell("场均得分", "PPG", one(team?.ppg ?? null))}
        ${cell("场均失分", "Opp PPG", one(team?.oppg ?? null))}
        ${cell("场均净胜", "Net", signed(net))}
        ${cell("较上季胜场", "vs last season", DASH)}
      </dl>
      ${teamPanel(team, lang)}
      <span class="aw-more">${esc(TL(lang, "详情", "Details"))}</span>
    </summary>
    <div class="aw-body"><ul class="aw-why">
      <li>${esc(TL(lang, "依据：常规赛战绩最好的球队的主教练，不考虑赛前预期。", "Basis: head coach of the team with the best regular-season record; preseason expectations are not considered."))}</li>
      <li>${esc(TL(lang, "得失分是每场实际比分；进攻/防守效率需要回合数，本作不记录，所以不显示。上赛季战绩未保存。", "Points are actual scores per game. Offensive/defensive ratings need possession counts, which are not recorded, and last season's record is not kept."))}</li>
    </ul></div>
  </details>`;
}

// ── All-league tables ─────────────────────────────────────────────────────────────────────────────────────────────

const SLOTS = ["PG", "SG", "SF", "PF", "C"];
/** Teams are filled slot by slot (PG..C, see positionalTeams); a slot nobody fit takes the best remaining player. */
function slotLabel(index, pos) {
  const slot = SLOTS[index];
  if (!slot) return esc(pos || "");
  const own = String(pos || "").toUpperCase();
  return own && own !== slot ? `${slot} <em>(${esc(own)})</em>` : slot;
}

function teamTable(list, label, st, ctx, lang) {
  if (!list?.length) return "";
  const head = [TL(lang, "位置", "Pos"), TL(lang, "球员（球队）", "Player (team)"), TL(lang, "场次", "GP"), TL(lang, "分/板/助/抢/帽", "PTS/REB/AST/STL/BLK"), "FG%", "3P%", "TS%", "EFF", TL(lang, "球队战绩", "Team")];
  const rows = list.map((award, index) => {
    const m = metricsFor(st, award);
    const team = teamContext(st, award.teamId);
    const line = [m.ppg, m.rpg, m.apg, m.spg, m.bpg].map(one).join(" / ");
    return `<tr>
      <td class="pos">${slotLabel(index, award.pos)}</td>
      <td class="who">${photoImg({ name: award.name, bref: award.bref, season: award.season }, "headshot sm")}<span><strong>${esc(award.name)}</strong><em>${esc(teamNameL(award.teamName, lang))}</em></span></td>
      <td class="num">${STATS.gp.read(m, ctx)}</td>
      <td class="num line">${line}</td>
      <td class="num">${pctText(m.fg)}</td><td class="num">${pctText(m.tp)}</td><td class="num">${pctText(m.ts)}</td><td class="num">${one(m.eff)}</td>
      <td class="rec">${team ? `${team.w}-${team.l} <em>${esc(rankText(team, lang))}</em>` : DASH}</td>
    </tr>`;
  }).join("");
  return `<section class="aw-team-card">
    <h4>${esc(label)}</h4>
    <div class="aw-table-wrap"><table class="aw-table"><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${rows}</tbody></table></div>
  </section>`;
}

function leadersRow(a, st, ctx, lang) {
  const chip = (award, zh, en, key) => (award
    ? `<div class="aw-leader"><span>${esc(TL(lang, zh, en))}</span><strong>${esc(award.name)}</strong><em>${STATS[key].read(metricsFor(st, award), ctx)} · ${esc(teamNameL(award.teamName, lang))}</em></div>`
    : "");
  return `<div class="aw-leaders">${chip(a.scoringChamp, "得分王", "Scoring", "ppg")}${chip(a.rebChamp, "篮板王", "Rebounds", "rpg")}${chip(a.astChamp, "助攻王", "Assists", "apg")}</div>`;
}

/** The whole awards tab body (without the "enter playoffs" button, which app.js owns). */
export function seasonAwardsHtml(st, lang = "zh") {
  const a = st?.awards;
  if (!a) return "";
  const ctx = { games: seasonGames(st) };
  const L = (zh, en) => TL(lang, zh, en);
  return `<div class="aw-board">
    <p class="aw-intro">${esc(L(`本季 ${ctx.games} 场 · 场次一栏为出场/赛季总场次，评奖门槛按赛季长度折算。点开卡片看全部数据和评选依据。`, `${ctx.games}-game season · GP is games played out of the season; award minimums scale with season length. Open a card for every stat and the reasoning.`))}</p>
    ${AWARDS.map((def) => playerCard(def, a[def.key], st, ctx, lang)).join("")}
    ${coachCard(a.coty, st, lang)}
    ${teamTable(a.allNba?.first, L("一阵 All-NBA 1st", "All-NBA 1st Team"), st, ctx, lang)}
    ${teamTable(a.allNba?.second, L("二阵 All-NBA 2nd", "All-NBA 2nd Team"), st, ctx, lang)}
    ${teamTable(a.allNba?.third, L("三阵 All-NBA 3rd", "All-NBA 3rd Team"), st, ctx, lang)}
    ${teamTable(a.allDefense?.first, L("最佳防守一阵", "All-Defense 1st Team"), st, ctx, lang)}
    ${teamTable(a.allDefense?.second, L("最佳防守二阵", "All-Defense 2nd Team"), st, ctx, lang)}
    ${leadersRow(a, st, ctx, lang)}
    <p class="aw-defs">${esc(L(
    "TS%（真实命中率）= 得分 ÷ (2 × (投篮出手 + 0.44 × 罚球出手))。EFF（NBA 效率值）=（得分 + 篮板 + 助攻 + 抢断 + 盖帽 − 投篮未中 − 罚球未中 − 失误）÷ 场次；不是 PER。阵容每队每个位置一人，一至三阵按 MVP 分，防守阵容按防守分。",
    "TS% = PTS ÷ (2 × (FGA + 0.44 × FTA)). EFF (NBA efficiency) = (PTS + REB + AST + STL + BLK − missed FG − missed FT − TOV) ÷ GP; not PER. Each team has one player per position: All-NBA by MVP score, All-Defense by defense score.",
  ))}</p>
  </div>`;
}
