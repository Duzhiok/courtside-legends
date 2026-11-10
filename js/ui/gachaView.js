/**
 * HTML builders for the daily draw + collection screens. Pure string output;
 * app.js owns DOM wiring. View helpers (esc, photoImg, …) are injected so this
 * module never reaches into app.js globals.
 */
import { getLang } from "../i18n.js";
import { subAttrChipsHtml } from "./rotationBoard.js";
import { MAX_STARS, RATE_TABLE, SOULS_PER_STAR, craftCost } from "../data/gacha.js";
import { CHALLENGE_XP, DAILY_DRAW_TASKS_NEEDED, DAILY_TASKS, MILESTONE_GOLD, MILESTONE_WINS, WELCOME_TICKETS } from "../data/dailyTasks.js";
import { GROWTH_PATHS, MAX_GROWTH_LEVEL, XP_PER_LEVEL } from "../data/growthPaths.js";
import { MAX_CARDS } from "../data/accountRecycle.js";
import { scoutLabel } from "../data/intangibles.js";

const OUTCOME_TEXT = {
  new: () => "新卡入账",
  newVersion: (r) => `同一球员的新版本入账 · 球魂 +1（现有 ${r.souls}）`,
  starUp: (r) => `重复卡升星 ★${r.stars}：全属性 +1。请选择保留哪套成色 ↓`,
  soulConvert: (r) => `已满 ★${MAX_STARS}，转为 2 球魂（现有 ${r.souls}）`,
};

/** One decimal, trailing .0 trimmed — what is shown must sum to exactly 100%. */
export const pct = (p) => `${(p * 100).toFixed(1).replace(/\.0$/, "")}%`;

export function rateSummary(lang = "zh") {
  return RATE_TABLE.map((band) => `${lang === "en" ? band.labelEn || band.label : band.label} ${pct(band.p)}`).join(" · ");
}

/** The daily-draw rule, derived from DAILY_TASKS, so the rules text cannot drift from the real targets. */
const dailyTaskSummary = (en) =>
  en
    ? `daily tasks (${DAILY_TASKS.map((t) => t.labelEn).join(", ")}) — complete any ${DAILY_DRAW_TASKS_NEEDED} to claim`
    : `每日任务（${DAILY_TASKS.map((t) => t.label).join("、")}）——任意 ${DAILY_DRAW_TASKS_NEEDED} 项完成即可领取`;

export function drawRulesHtml(lang = "zh") {
  const en = lang === "en";
  if (en) {
    return `<details class="draw-rules-more">
    <summary>Rates & daily draw rules</summary>
    <p class="tiny"><strong>Daily player card</strong>: ${dailyTaskSummary(true)} one regular card a day, claimed by hand. A banked ticket also claims it (welcome pack ${WELCOME_TICKETS}, one-time). No gold extra draws, no unconditional free pull.
    Other rewards: today's challenge +${CHALLENGE_XP} Account XP, +¤${MILESTONE_GOLD} gold per ${MILESTONE_WINS} ranked wins, Account Level card packs (Lv.5, Lv.50) separately. About 20% of draws are coach cards.<br/>
    <strong>Player rates</strong>: ${rateSummary("en")}. No pity — every draw is pure random at these rates.<br/>
    Before you pull you only see OVR — grade, hidden traits and gem tags reveal after you own the card.</p>
  </details>`;
  }
  return `<details class="draw-rules-more">
    <summary>概率与每日抽卡规则</summary>
    <p class="tiny"><strong>每日球员卡</strong>：${dailyTaskSummary(false)}，每天最多 1 张，手动领取。已有抽卡券也可领取 1 张（新手礼包 ${WELCOME_TICKETS} 张，一次性）。没有金币加抽，没有无条件免费抽。
    其他奖励：今日挑战 +${CHALLENGE_XP} 账号经验、排位累计每 ${MILESTONE_WINS} 胜 +¤${MILESTONE_GOLD} 金币、账号等级奖励卡包（Lv.5、Lv.50）另计。约 20% 出教练卡。<br/>
    <strong>球员概率</strong>：${rateSummary()}。无保底——每次抽卡都是按这个概率纯随机。<br/>
    抽前只看得到 OVR——成色、隐藏能力、妖人标签入手后才揭晓。</p>
  </details>`;
}

const fmt = (n) => n.toLocaleString("en-US");
const bandFloors = (lang = "zh") => RATE_TABLE.filter((band) => band.id !== "common" && band.min >= 85).map((band) => `${lang === "en" ? band.labelEn || band.label : band.label} ${band.min}+`).join(lang === "en" ? ", " : "、");

/** One line under each banner button: how big it is and how its rarity is measured. */
function bannerSubtitle(banner, stats, days, lang = "zh") {
  const en = lang === "en";
  if (!stats) return banner.kind === "standard" ? (en ? "All-history season cards" : "全历史赛季卡") : en ? "Weekly rotation" : "每周轮换";
  if (banner.kind === "standard") return en ? `${fmt(stats.cards)} all-history season cards · tiered by absolute OVR` : `${fmt(stats.cards)} 张全历史赛季卡 · 按绝对 OVR 分档`;
  return en ? `${fmt(stats.cards)} cards · ${fmt(stats.people)} players · tiered by in-pool rank · rotates in ${days} days` : `${fmt(stats.cards)} 张 · ${fmt(stats.people)} 人 · 池内排名分档 · ${days} 天后轮换`;
}

export function bannerPickerHtml(banners, selectedId, esc, view = {}, lang = "zh") {
  return banners
    .map((banner) => `<button type="button" class="draw-banner${banner.id === selectedId ? " active" : ""}" data-banner="${banner.id}" aria-pressed="${banner.id === selectedId}">
        <strong>${esc(banner.name)}</strong>
        <span class="tiny">${esc(bannerSubtitle(banner, view.stats?.[banner.id], view.days, lang))}</span>
      </button>`)
    .join("");
}

function wishLine(stats, wishName, esc, lang = "zh") {
  const en = lang === "en";
  if (!wishName) return en ? "No wish player set yet — set one and this will tell you if he is in this pool." : "还没设心愿球员——设了之后，这里会告诉你他在不在这个池里。";
  const name = esc(wishName);
  return stats.wishCards > 0
    ? en ? `Wish player <strong>${name}</strong>: this pool has ${stats.wishCards} of his cards ✔` : `心愿球员 <strong>${name}</strong>：本池有 ${stats.wishCards} 张他的卡 ✔`
    : en ? `Wish player <strong>${name}</strong>: this pool has <strong>none</strong> of his cards — try another pool.` : `心愿球员 <strong>${name}</strong>：本池<strong>没有</strong>他的卡——换个池抽。`;
}

/** What the selected banner means. Headline + wish stay visible; the how-it-works part folds away. */
export function bannerExplainHtml(banner, stats, { days, wishName, lang = "zh" } = {}, esc = (x) => x) {
  if (!banner || !stats) return "";
  const en = lang === "en";
  const best = stats.top.map((t) => lang === "en" ? `${esc(t.name)} ${t.season} (OVR ${t.ovr})` : `${esc(t.name)} ${t.season}（OVR ${t.ovr}）`).join(" · ");
  const standard = banner.kind === "standard";
  const headline = standard
    ? en ? `<strong>${esc(banner.name)}</strong>: ${fmt(stats.cards)} season cards, ${fmt(stats.people)} players.` : `<strong>${esc(banner.name)}</strong>：${fmt(stats.cards)} 张赛季卡、${fmt(stats.people)} 位球员。`
    : en ? `<strong>${esc(banner.name)}</strong>: ${fmt(stats.cards)} season cards, ${fmt(stats.people)} players, ${days} days left in rotation.` : `<strong>${esc(banner.name)}</strong>：${fmt(stats.cards)} 张赛季卡、${fmt(stats.people)} 位球员，还剩 ${days} 天轮换。`;
  const how = standard
    ? en ? `Rarity is tiered by <strong>absolute OVR</strong> (${bandFloors("en")}).` : `稀有度按<strong>绝对 OVR</strong> 分档（${bandFloors()}）。`
    : en ? `Rarity is converted by <strong>in-pool rank</strong>: the pool's strongest batch lands in the Myth tier — so weak eras get high tiers too, while strong eras are stronger overall. But a tier only means "position in this pool", not OVR 96+. Pulled cards are marked "Pool tier X".<br/>Strongest in this pool: ${best}` : `稀有度按<strong>「本池内排名」</strong>换算：本池最强的那批出神话档——所以弱年代也有高档位，强年代整体更强。但档位只表示「这个池里的位置」，不等于 OVR 96+。抽到的卡会标「池内 X 档」。<br/>本池最强：${best}`;
  return `<div class="banner-explain" role="region" aria-label="${en ? "Pool notes" : "卡池说明"}">
      <p class="tiny">${headline}</p>
      <p class="tiny">${wishLine(stats, wishName, esc, lang)}</p>
      <details class="banner-more">
        <summary>${en ? "How rarity is calculated" : "稀有度怎么算"}${standard ? "" : en ? " · Strongest in pool" : " · 本池最强"}</summary>
        <p class="tiny">${how}</p>
      </details>
    </div>`;
}

/** Daily-draw slot status: progress toward the 2-of-3 unlock, eligibility, and claimed state. */
export function drawStatusHtml(account, drawState, wishName, esc, lang = "zh") {
  const en = lang === "en";
  const remaining = Math.max(0, drawState.needed - drawState.tasksDone);
  const pull = drawState.claimed
    ? en ? "Today's player card claimed" : "今日球员卡已领取"
    : drawState.taskEligible
      ? en ? "Today's player card available" : "今日球员卡可领取"
      : drawState.tickets > 0
        ? en ? `Claim with a ticket (${drawState.tickets} left)` : `用抽卡券领取（剩 ${drawState.tickets} 张）`
        : en ? `${remaining} more task${remaining > 1 ? "s" : ""} to unlock today's card` : `再完成 ${remaining} 项任务可领取今日球员卡`;
  return `<div class="draw-status">
      <span>${en ? "Gold" : "金币"} ¤${account.gold || 0}</span>
      <span>${en ? "Tickets" : "抽卡券"} ${drawState.tickets || 0}</span>
      <span>${en ? "Collection" : "卡库"} ${(account.playerIds || []).length}/${MAX_CARDS}</span>
      <span>${pull}</span>
      <span>${en ? "Wishlist" : "心愿单"}：${wishName ? esc(wishName) : en ? "not set" : "未设置"}</span>
    </div>`;
}

export function hiddenBadgesHtml(player, esc) {
  const roll = player.hiddenRoll;
  const stars = player.mergeLevel ? `<span class="tag-merge">★${player.mergeLevel}</span>` : "";
  const gem = scoutLabel(player);
  const parts = [
    stars,
    roll ? `<span class="roll-grade roll-${roll.grade}" title="成色">成色 ${roll.grade}</span>` : "",
    roll ? `<span class="tiny">隐藏能力 ${roll.rating}</span>` : "",
    gem ? `<span class="gem-tag">${esc(gem)}</span>` : "",
  ];
  return parts.filter(Boolean).join(" ");
}

function rollSide(label, roll, keepNew) {
  return `<button type="button" class="btn roll-option" data-roll-keep="${keepNew ? "new" : "old"}">
      <strong>${label}</strong>
      <span class="roll-grade roll-${roll.grade}">成色 ${roll.grade}</span>
      <span>隐藏能力 ${roll.rating}</span>
    </button>`;
}

export function rollChoiceHtml(choice) {
  if (!choice) return "";
  return `<div class="roll-choice">
      <p class="tiny">整套二选一（不会逐项取最高，避免把卡刷成满值）：</p>
      <div class="roll-options">
        ${rollSide("保留原成色", choice.current, false)}
        ${rollSide("换成新成色", choice.candidate, true)}
      </div>
    </div>`;
}

/** What this draw cost — only a banked ticket can still pay for one now. */
function paymentFlagsHtml(result) {
  return result.usedTicket ? '<span class="draw-flag">抽卡券 −1</span>' : "";
}

export function drawRevealHtml(result, view) {
  const { esc, photoImg, skillChipsHtml } = view;
  if (result.kind === "coach") {
    const c = result.coach;
    return `<div class="draw-reveal">
        <div class="name">${esc(c.name)} <span class="rarity-tag myth">${esc(result.rarity)}</span></div>
        <p class="tiny">${esc(c.style)} · ${esc(c.note || "")}</p>
        <div class="draw-flags">${paymentFlagsHtml(result)}</div>
        <p class="tiny">${result.duplicate ? `重复教练卡，折合 ¤${result.goldGain}` : "新教练卡已加入教头收藏"}</p>
      </div>`;
  }
  const p = result.player;
  const flags = [
    result.poolBand ? `<span class="draw-flag">池内 ${esc(result.poolBand)} 档</span>` : "",
    result.wishHit ? '<span class="draw-flag wish">心愿命中</span>' : "",
    paymentFlagsHtml(result),
    result.goldGain ? `<span class="draw-flag">+¤${result.goldGain}</span>` : "",
  ].join("");
  const cardStyleAttr = result.cardStyle ? ` style="${result.cardStyle}"` : "";
  const cardClass = result.cardStyle ? " legend-season" : "";
  return `<div class="draw-reveal${cardClass}"${cardStyleAttr}>
      ${photoImg(p, "headshot xl")}
      <div class="name">${esc(p.name)}${result.rarity ? ` <span class="rarity-tag ${result.rarityCls || ""}">${esc(result.rarity)}</span>` : ""}</div>
      <div class="meta">${p.season} · ${p.pos} · OVR ${result.ovr} · ${esc(result.banner?.name || "")}</div>
      <div class="draw-flags">${flags}</div>
      <p class="tiny">${OUTCOME_TEXT[result.outcome](result)}</p>
      <div>${hiddenBadgesHtml(p, esc)}</div>
      ${skillChipsHtml(p, getLang())}
      <div class="rot-attrs sub-attrs">${subAttrChipsHtml(p, getLang())}</div>
      ${rollChoiceHtml(result.rollChoice)}
    </div>`;
}

/** Wishlist search results + craftable cards of the current wish person. */
export function wishlistHtml({ people, wishCards, wishBref, wishName, ownedIds, gold }, view) {
  const { esc, ovrOf } = view;
  const peopleRows = people
    .map((person) => {
      const current = person.bref === wishBref;
      return `<button type="button" class="btn small${current ? " primary" : ""}" data-wish="${person.bref}" aria-pressed="${current}">${current ? "❤ 当前心愿 · " : ""}${esc(person.name)} · ${person.count} 张卡 · 最高 OVR ${ovrOf(person.best)}</button>`;
    })
    .join("");
  const craftRows = wishCards
    .map((card) => {
      const owned = ownedIds.has(card.id);
      const cost = craftCost(ovrOf(card));
      return `<div class="craft-row">
          <span>${card.season} · ${esc(card.team)} · OVR ${ovrOf(card)}</span>
          ${owned
            ? '<span class="tiny">已拥有</span>'
            : `<button type="button" class="btn small" data-craft="${card.id}" ${gold < cost ? "disabled" : ""}>¤${cost} 合成</button>`}
        </div>`;
    })
    .join("");
  return `${peopleRows ? `<div class="wish-results">${peopleRows}</div>` : ""}
    ${craftRows && wishName ? `<div class="craft-list"><p class="tiny">❤ ${esc(wishName)} 的赛季卡（金币直接合成指定年份）：</p>${craftRows}</div>` : ""}`;
}

/** What the player is told after spending 球魂 on a star (null = nothing to announce). */
export function soulStarNotice(result) {
  if (!result?.skill) return null;
  return `★${result.stars} 满星！获得技能「${result.skill.name}」`;
}

export function soulButtonHtml(player, souls) {
  if ((player.mergeLevel || 0) >= MAX_STARS) return "";
  const enough = souls >= SOULS_PER_STAR;
  return `<button type="button" class="btn small" data-soul-star="${player.id}" ${enough ? "" : "disabled"}>球魂升星 ${souls}/${SOULS_PER_STAR}</button>`;
}

/** 本命 status for the favourite card, a path picker for everyone else. */
export function favoriteControlHtml(player, growth, isFavorite) {
  const locked = (growth?.levels || 0) > 0 ? growth.path : null;
  if (isFavorite && GROWTH_PATHS[growth?.path]) {
    const done = growth.levels >= MAX_GROWTH_LEVEL;
    return `<div class="favorite-tag">❤ 本命 · ${GROWTH_PATHS[growth.path].label} Lv.${growth.levels || 0}${done ? "（已满）" : ` · ${growth.xp || 0}/${XP_PER_LEVEL} 经验`}</div>`;
  }
  const options = Object.entries(GROWTH_PATHS)
    .filter(([id]) => !locked || id === locked)
    .map(([id, path]) => `<option value="${id}">${path.label}路线</option>`)
    .join("");
  return `<label class="tiny favorite-pick">设为本命
      <select data-favorite="${player.id}"><option value="">—</option>${options}</select>
    </label>`;
}

/** Daily tasks + the daily-draw slot + challenge XP + win-milestone gold. Any 2 of the 3 tasks unlock today's card. */
export function tasksHtml(board, lang = getLang()) {
  const en = lang === "en";
  const rows = board.tasks
    .map((task) => {
      const progress = !task.claimed && task.target > 1 ? ` <span class="tiny">${task.progress}/${task.target}</span>` : "";
      return `<li class="${task.claimed ? "done" : ""}"><span aria-hidden="true">${task.claimed ? "✅" : "⬜"}</span> ${task.label}${progress}</li>`;
    })
    .join("");
  const draw = board.dailyDraw;
  const dailyDrawRow = draw
    ? `<li class="${draw.claimed ? "done" : ""}"><span aria-hidden="true">${draw.claimed ? "✅" : "🎴"}</span> ${draw.label} <span class="tiny">${draw.tasksDone}/${draw.needed}${draw.claimed ? (en ? " (claimed)" : "（已领）") : ""}</span></li>`
    : "";
  const challenge = board.challenge;
  const challengeRow = challenge
    ? `<li class="${challenge.claimed ? "done" : ""}"><span aria-hidden="true">${challenge.claimed ? "✅" : "🏆"}</span> ${en ? "Today's challenge: " : "今日挑战："}${challenge.label} <span class="tiny">→ ${en ? "Account XP" : "账号经验"} +${challenge.xp}${challenge.claimed ? (en ? " (claimed)" : "（已领）") : ""}</span></li>`
    : "";
  const { next, wins, perReward, gold } = board.milestone;
  const milestone = en
    ? `Ranked total ${next} wins <span class="tiny">→ Gold +${gold} (now ${wins} wins, one per ${perReward})</span>`
    : `排位累计 ${next} 胜 <span class="tiny">→ 金币 +${gold}（现在 ${wins} 胜，每 ${perReward} 胜一次）</span>`;
  return `<div class="draw-tasks">
      <strong>${en ? "Daily tasks" : "每日任务"}</strong>
      <ul>${rows}${dailyDrawRow}${challengeRow}<li><span aria-hidden="true">🎯</span> ${milestone}</li></ul>
    </div>`;
}
