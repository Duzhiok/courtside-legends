/**
 * Post-game settlement card (C1): one finished game, or one folded stretch of games.
 * Pure string builders over `career/gameRewards.js` reports -- no DOM, no state -- so they unit-test.
 * Reward sections slot in here as C2-C6 land (C2: player growth); a section whose data is empty
 * renders nothing, so the card only ever shows what really happened.
 */
import { teamNameL } from "../i18n.js";
import { esc, tr } from "./timeTravel/format.js";

const one = (value) => (Math.round(value * 10) / 10).toFixed(1);
const signed = (value) => (value > 0 ? `+${value}` : String(value));

/**
 * A figure and its unit ("8 分") must never be split across two lines -- "1 / 助" on a phone reads as
 * a bug. So every figure is one unbreakable segment and lines may only wrap BETWEEN segments.
 */
const seg = (text) => `<span class="pg-nowrap">${esc(text)}</span>`;
const segs = (parts) => parts.map(seg).join(" ");

function lineHtml(player, lang) {
  const stats = lang === "en"
    ? [`${player.pts} pts`, `${player.reb} reb`, `${player.ast} ast`]
    : [`${player.pts} 分`, `${player.reb} 板`, `${player.ast} 助`];
  return `${seg(lang === "en" ? `${player.min} min` : `${player.min} 分钟`)} · ${segs(stats)}`;
}

/** Every attribute a development focus can train (playerDevelopment.FOCUS_ATTRIBUTES), by language. */
export const ATTRIBUTE_LABELS = {
  three: ["三分", "3PT"], mid: ["中投", "Mid-range"], scoring: ["得分", "Scoring"], pass: ["传球", "Passing"],
  iq: ["球商", "IQ"], speed: ["速度", "Speed"], defense: ["防守", "Defense"], steal: ["抢断", "Steals"],
  block: ["盖帽", "Blocks"], stamina: ["体能", "Stamina"], strength: ["力量", "Strength"],
};
const attributeName = (key, lang) => (ATTRIBUTE_LABELS[key] ? ATTRIBUTE_LABELS[key][lang === "en" ? 1 : 0] : key);
const GROWTH_ROWS = 4;

/**
 * Player growth (C2): who earned XP, and who levelled up (and which attribute). `entries` come
 * level-ups first, then biggest XP, so the cut at GROWTH_ROWS never hides a level-up behind a trickle.
 * One shape for a single game and for a folded stretch.
 */
function growthHtml(entries, lang) {
  if (!entries?.length) return "";
  const rows = entries.slice(0, GROWTH_ROWS).map((entry) => {
    const pct = Math.round(Math.min(1, Math.max(0, entry.progress)) * 100);
    const ups = entry.leveled.map((up) => seg(`${attributeName(up.attribute, lang)} ${up.from}→${up.to}`)).join(" ");
    const status = ups
      ? `<span class="pg-up">${esc(tr(lang, "升级", "Level up"))}</span> ${ups}`
      : entry.capped ? seg(tr(lang, "本季不再成长", "No more growth this season")) : seg(`${pct}%`);
    return `<li class="pg-grow">
      <span class="pg-who"><strong>${esc(entry.name)}</strong><span>${seg(`+${entry.xp} XP`)} · ${status}</span></span>
      <span class="pg-bar" role="img" aria-label="${esc(`XP ${pct}%`)}"><i style="width:${pct}%"></i></span>
    </li>`;
  }).join("");
  return `<h4 class="pg-growth-title">${esc(tr(lang, "球员成长", "Player growth"))}</h4><ul class="pg-stars pg-growth">${rows}</ul>`;
}

function verdict(report, lang) {
  const { you, opp } = report.score;
  const word = report.tied ? tr(lang, "战平", "Tie") : report.won ? tr(lang, "胜", "Win") : tr(lang, "负", "Loss");
  const tone = report.tied ? "even" : report.won ? "win" : "loss";
  return { tone, text: `${word} ${you}-${opp}`, opp: teamNameL(report.opponentName, lang) };
}

function starsHtml(stars, lang) {
  if (!stars.length) return "";
  const rows = stars.map((player, index) => `<li class="pg-star">
      <span class="pg-rank" aria-hidden="true">${index + 1}</span>
      <span class="pg-who"><strong>${esc(player.name)}</strong><span>${lineHtml(player, lang)}</span></span>
      <span class="pg-chip" title="${esc(tr(lang, "技术统计综合效率（Game Score）", "Box-score efficiency (Game Score)"))}">${esc(tr(lang, "效率", "Eff"))} ${one(player.score)}</span>
    </li>`).join("");
  return `<h4>${esc(tr(lang, "本场最佳", "Stars of the game"))}</h4><ol class="pg-stars">${rows}</ol>`;
}

export function postGameHtml(report, lang = "zh") {
  if (!report) return "";
  const v = verdict(report, lang);
  return `<div class="pg-card pg-${v.tone}">
    <p class="pg-kicker">${esc(tr(lang, "赛后结算", "Post-game"))}</p>
    <p class="pg-verdict"><strong>${esc(v.text)}</strong><span>${esc(tr(lang, `对阵 ${v.opp}`, `vs ${v.opp}`))}</span></p>
    ${starsHtml(report.stars, lang)}
    ${growthHtml(report.rewards?.playerXp, lang)}
  </div>`;
}

export function batchHtml(batch, lang = "zh") {
  if (!batch?.games) return "";
  const best = batch.best;
  const leaders = batch.leaders.map((player, index) => `<li class="pg-star">
      <span class="pg-rank" aria-hidden="true">${index + 1}</span>
      <span class="pg-who"><strong>${esc(player.name)}</strong><span>${lang === "en"
    ? `${segs([`${one(player.ppg)} pts`, `${one(player.rpg)} reb`, `${one(player.apg)} ast`])} per game`
    : segs([`场均 ${one(player.ppg)} 分`, `${one(player.rpg)} 板`, `${one(player.apg)} 助`])} · ${seg(tr(lang, `出场 ${player.games} 场`, `${player.games} GP`))}</span></span>
    </li>`).join("");
  const bestLine = best
    ? `<p class="pg-best">${esc(tr(
      lang,
      `单场最佳：${best.name} ${best.pts} 分 ${best.reb} 板 ${best.ast} 助，对阵 ${teamNameL(best.opponentName, lang)}（${best.won ? "胜" : "负"} ${best.game.you}-${best.game.opp}）`,
      `Best night: ${best.name}, ${best.pts} pts ${best.reb} reb ${best.ast} ast vs ${teamNameL(best.opponentName, lang)} (${best.won ? "W" : "L"} ${best.game.you}-${best.game.opp})`,
    ))}</p>`
    : "";
  return `<div class="pg-card pg-${batch.wins >= batch.losses ? "win" : "loss"}">
    <p class="pg-kicker">${esc(tr(lang, "本段收获", "This stretch"))}</p>
    <p class="pg-verdict"><strong>${esc(tr(lang, `${batch.games} 场 · ${batch.wins} 胜 ${batch.losses} 负`, `${batch.games} games · ${batch.wins}-${batch.losses}`))}</strong><span>${esc(tr(lang, `净胜分 ${signed(batch.pointDiff)}`, `Point diff ${signed(batch.pointDiff)}`))}</span></p>
    ${bestLine}
    ${leaders ? `<h4>${esc(tr(lang, "这段时间的主力", "Who carried you"))}</h4><ol class="pg-stars">${leaders}</ol>` : ""}
    ${growthHtml(batch.growth, lang)}
  </div>`;
}
