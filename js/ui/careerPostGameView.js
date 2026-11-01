/**
 * Post-game settlement card (C1): one finished game, or one folded stretch of games.
 * Pure string builders over `career/gameRewards.js` reports -- no DOM, no state -- so they unit-test.
 * Reward sections (XP, highlights, ...) will slot in here as C2-C6 land; until then the card shows
 * only what the box score really says.
 */
import { teamNameL } from "../i18n.js";
import { esc, tr } from "./timeTravel/format.js";

const one = (value) => (Math.round(value * 10) / 10).toFixed(1);
const signed = (value) => (value > 0 ? `+${value}` : String(value));

function lineText(player, lang) {
  return tr(
    lang,
    `${player.min} 分钟 · ${player.pts} 分 ${player.reb} 板 ${player.ast} 助`,
    `${player.min} min · ${player.pts} pts ${player.reb} reb ${player.ast} ast`,
  );
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
      <span class="pg-who"><strong>${esc(player.name)}</strong><span>${esc(lineText(player, lang))}</span></span>
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
  </div>`;
}

export function batchHtml(batch, lang = "zh") {
  if (!batch?.games) return "";
  const best = batch.best;
  const leaders = batch.leaders.map((player, index) => `<li class="pg-star">
      <span class="pg-rank" aria-hidden="true">${index + 1}</span>
      <span class="pg-who"><strong>${esc(player.name)}</strong><span>${esc(tr(
    lang,
    `场均 ${one(player.ppg)} 分 ${one(player.rpg)} 板 ${one(player.apg)} 助`,
    `${one(player.ppg)} pts ${one(player.rpg)} reb ${one(player.apg)} ast per game`,
  ))} · <span class="pg-nowrap">${esc(tr(lang, `出场 ${player.games} 场`, `${player.games} GP`))}</span></span></span>
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
  </div>`;
}
