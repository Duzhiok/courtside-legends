/**
 * Post-game settlement card (C1): one finished game, or one folded stretch of games.
 * Pure string builders over `career/gameRewards.js` reports -- no DOM, no state -- so they unit-test.
 * Reward sections slot in here as C2-C6 land (C2: player growth, C3: epiphany); a section whose data is
 * empty renders nothing, so the card only ever shows what really happened. Order is by how much it
 * matters tonight: verdict, a new skill (rare), the stars, growth, then what is brewing.
 */
import { skillNameL, teamNameL } from "../i18n.js";
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
  return `<h4 class="pg-section-title">${esc(tr(lang, "球员成长", "Player growth"))}</h4><ul class="pg-stars pg-growth">${rows}</ul>`;
}

/** What each streak rule counts, by language ("9+ assists"). */
export const STREAK_UNITS = {
  ast: ["助攻", "assists"], tpm: ["记三分", "threes"], pts: ["分", "points"], twoPm: ["记两分球", "two-pointers"],
  reb: ["篮板", "rebounds"], blk: ["次盖帽", "blocks"], stl: ["次抢断", "steals"],
};
const streakText = (rule, games, lang) => {
  const unit = (STREAK_UNITS[rule.stat] || [rule.stat, rule.stat])[lang === "en" ? 1 : 0];
  return lang === "en" ? `${games} straight games with ${rule.min}+ ${unit}` : `连续 ${games} 场 ${rule.min}+ ${unit}`;
};
const LEARNED_ROWS = 4;
const HEAT_ROWS = 3;
const HIGHLIGHT_ROWS = 4;
const HIGHLIGHT_TAGS = 3;
const HOT_NAMES = 3;

/** What a highlight is called, by language; `{v}` is the figure. Every id in `career/buzz.js` has one. */
export const HIGHLIGHT_LABELS = {
  pts40: ["{v} 分", "{v} points"], pts30: ["{v} 分", "{v} points"], tripleDouble: ["三双", "Triple-double"],
  blk5: ["{v} 次盖帽", "{v} blocks"], tpm8: ["{v} 记三分", "{v} threes"],
};
const highlightText = (tag, lang) => (HIGHLIGHT_LABELS[tag.id] || [tag.id, tag.id])[lang === "en" ? 1 : 0].replace("{v}", tag.value);

/**
 * Highlights (C4): who had a big night and what the market makes of it. One row per player, each
 * figure with its unit as one unbreakable piece. Below it, in one line, everyone the trade market
 * is currently talking about -- and the plain fact that it fades.
 */
function highlightsHtml(entries, hot, lang, title) {
  const rows = (entries || []).slice(0, HIGHLIGHT_ROWS).map((entry) => {
    const shown = entry.tags.slice(0, HIGHLIGHT_TAGS).map((tag) => seg(highlightText(tag, lang)));
    const extra = entry.tags.length - HIGHLIGHT_TAGS;
    if (extra > 0) shown.push(seg(`+${extra}`));
    return `<li class="pg-hl">
      <span class="pg-who"><strong>${esc(entry.name)}</strong><span>${shown.join(" · ")}</span></span>
      <span class="pg-chip pg-buzz" title="${esc(tr(lang, "交易市场热度", "Trade-market buzz"))}"><span aria-hidden="true">🔥</span> +${entry.gain}</span>
    </li>`;
  }).join("");
  const more = (entries || []).length > HIGHLIGHT_ROWS
    ? `<p class="pg-more">${esc(tr(lang, `还有 ${entries.length - HIGHLIGHT_ROWS} 位也有高光`, `${entries.length - HIGHLIGHT_ROWS} more had highlights`))}</p>` : "";
  const names = (hot || []).slice(0, HOT_NAMES).map((entry) => seg(`${entry.name} ${one(entry.buzz)}`)).join(" · ");
  const note = names
    ? `<p class="pg-note pg-hotnote"><span aria-hidden="true">🔥</span> ${esc(tr(lang, "交易市场热度：", "Trade-market buzz: "))}${names}。${esc(tr(
      lang, "趁热出手报价更高，几场不再高光就会降温。", "Offers run higher while it lasts; a few quiet games and it fades.",
    ))}</p>` : "";
  if (!rows && !note) return "";
  const head = `<h4 class="pg-section-title">${esc(rows ? title : tr(lang, "市场热度", "Market buzz"))}</h4>`;
  return `${head}${rows ? `<ul class="pg-stars pg-highlights">${rows}</ul>${more}` : ""}${note}`;
}

/**
 * Epiphany (C3): a skill someone just learned. Rare, so it is the one warm block on the card -- right
 * under the verdict -- and says plainly why (the streak) and what (the skill).
 */
function epiphanyHtml(entries, lang) {
  if (!entries?.length) return "";
  const rows = entries.slice(0, LEARNED_ROWS).map((entry) => `<li class="pg-learn">
      <span class="pg-who"><strong>${esc(entry.name)}</strong><span>${seg(streakText(entry.rule, entry.games, lang))}</span></span>
      <span class="pg-skill">${esc(skillNameL(entry.skill, lang))}</span>
    </li>`).join("");
  const more = entries.length > LEARNED_ROWS
    ? `<p class="pg-more">${esc(tr(lang, `还有 ${entries.length - LEARNED_ROWS} 位也领悟了新技能`, `${entries.length - LEARNED_ROWS} more also learned a skill`))}</p>` : "";
  return `<section class="pg-epiphany" role="status">
    <h4 class="pg-epiphany-title"><span aria-hidden="true">✦</span> ${esc(tr(lang, "领悟新技能", "New skill learned"))}</h4>
    <ul class="pg-stars">${rows}</ul>${more}
  </section>`;
}

/**
 * Heating up (C3): who is one qualifying game from a shot at a new skill. Progress dots and ONE line of
 * explanation; the skill itself stays a surprise, and nobody shows up who couldn't learn anything.
 */
function heatHtml(entries, lang) {
  if (!entries?.length) return "";
  const rows = entries.slice(0, HEAT_ROWS).map((entry) => {
    const lit = Math.min(entry.games, entry.of);
    const dots = Array.from({ length: entry.of }, (_, i) => `<i${i < lit ? ' class="on"' : ""}></i>`).join("");
    return `<li class="pg-heat">
      <span class="pg-who"><strong>${esc(entry.name)}</strong><span>${seg(streakText(entry.rule, entry.games, lang))}</span></span>
      <span class="pg-dots" role="img" aria-label="${esc(`${lit}/${entry.of}`)}">${dots}</span>
    </li>`;
  }).join("");
  return `<h4 class="pg-section-title">${esc(tr(lang, "手感正热", "Heating up"))}</h4>
    <p class="pg-note">${esc(tr(lang, "再来一场达标，就有机会领悟新技能。", "One more qualifying game gives a shot at a new skill."))}</p>
    <ul class="pg-stars">${rows}</ul>`;
}

/** Why the coach earned what he did tonight, by part id. */
const COACH_XP_PARTS = { win: ["赢球", "Win"], loss: ["输球也有收获", "Lessons from a loss"], upset: ["爆冷", "Upset"] };

/** The bar, the level, and -- only when there is one -- the level-up or the unspent-points reminder. */
function coachLevelHtml(entry, lang) {
  const pct = Math.round(Math.min(1, Math.max(0, entry.progress || 0)) * 100);
  const points = entry.perkPoints || 0;
  const news = entry.leveledUp > 0
    ? `<span class="pg-up">${esc(tr(lang, `升到 Lv.${entry.level}`, `Reached Lv.${entry.level}`))}</span> ${seg(tr(lang, `共 ${points} 点天赋点，去穿越生涯总部分配`, `${points} perk point${points === 1 ? "" : "s"} to spend at career HQ`))}`
    : points > 0 ? seg(tr(lang, `${points} 点天赋点未分配`, `${points} unspent perk point${points === 1 ? "" : "s"}`)) : "";
  return `<span class="pg-bar" role="img" aria-label="${esc(`Lv.${entry.level} ${pct}%`)}"><i style="width:${pct}%"></i></span>
    <p class="pg-note">${seg(`Lv.${entry.level}`)} · ${seg(`${pct}%`)}${news ? ` · ${news}` : ""}</p>`;
}

/** C5: the coach's own XP for one game -- how much, and why. */
function coachXpHtml(entry, lang) {
  if (!entry) return "";
  const parts = (entry.parts || []).map((part) => seg(`${(COACH_XP_PARTS[part.id] || [part.id, part.id])[lang === "en" ? 1 : 0]} +${part.xp}`));
  if (entry.playoff) parts.push(seg(tr(lang, "季后赛 ×2", "Playoffs ×2")));
  return `<h4 class="pg-section-title">${esc(tr(lang, "教练成长", "Coach growth"))}</h4>
    <div class="pg-coach"><p class="pg-coach-xp"><strong>${seg(`+${entry.xp} XP`)}</strong> ${parts.join(" · ")}</p>${coachLevelHtml(entry, lang)}</div>`;
}

/** The same section for a folded stretch: total XP, how many upsets, level as of the last game. */
function coachBatchHtml(batch, lang) {
  if (!batch) return "";
  const upsets = batch.upsets ? ` · ${seg(tr(lang, `爆冷 ${batch.upsets} 场`, `${batch.upsets} upset${batch.upsets === 1 ? "" : "s"}`))}` : "";
  return `<h4 class="pg-section-title">${esc(tr(lang, "教练成长", "Coach growth"))}</h4>
    <div class="pg-coach"><p class="pg-coach-xp"><strong>${seg(`+${batch.xp} XP`)}</strong> ${seg(tr(lang, `${batch.games} 场`, `${batch.games} games`))}${upsets}</p>${coachLevelHtml(batch, lang)}</div>`;
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
    ${epiphanyHtml(report.rewards?.epiphanies, lang)}
    ${starsHtml(report.stars, lang)}
    ${highlightsHtml(report.rewards?.highlights, report.rewards?.hot, lang, tr(lang, "本场高光", "Highlights"))}
    ${growthHtml(report.rewards?.playerXp, lang)}
    ${coachXpHtml(report.rewards?.coachXp, lang)}
    ${heatHtml(report.rewards?.heat, lang)}
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
    ${epiphanyHtml(batch.epiphanies, lang)}
    ${leaders ? `<h4>${esc(tr(lang, "这段时间的主力", "Who carried you"))}</h4><ol class="pg-stars">${leaders}</ol>` : ""}
    ${highlightsHtml(batch.highlights, batch.hot, lang, tr(lang, "这段时间的高光", "Highlights of the stretch"))}
    ${growthHtml(batch.growth, lang)}
    ${coachBatchHtml(batch.coachXp, lang)}
    ${heatHtml(batch.heat, lang)}
  </div>`;
}
