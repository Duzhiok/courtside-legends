/**
 * HTML builders for the daily draw + collection screens. Pure string output;
 * app.js owns DOM wiring. View helpers (esc, photoImg, …) are injected so this
 * module never reaches into app.js globals.
 */
import { EXTRA_DRAW, MAX_STARS, NEWBIE, PITY, RATE_TABLE, SOULS_PER_STAR, craftCost } from "../data/gacha.js";
import { CHALLENGE_TICKETS, MILESTONE_WINS, WELCOME_TICKETS } from "../data/dailyTasks.js";
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

export function rateSummary() {
  return RATE_TABLE.map((band) => `${band.label} ${pct(band.p)}`).join(" · ");
}

export function drawRulesHtml() {
  return `<details class="draw-rules-more">
    <summary>概率与保底规则</summary>
    <p class="tiny"><strong>抽卡顺序</strong>：每日免费 1 抽 → 抽卡券 → 金币加抽（¤${EXTRA_DRAW.cost}/次，每天最多 ${EXTRA_DRAW.perDay} 次）。
    抽卡券来源：新手礼包 ${WELCOME_TICKETS} 张、每日任务（排位打 1 场 +1、赢 1 场 +1、金币挑战赛赢 1 场 +1）、今日挑战 +${CHALLENGE_TICKETS}、排位累计每 ${MILESTONE_WINS} 胜 +1。约 20% 出教练卡。<br/>
    <strong>球员概率</strong>：${rateSummary()}。<br/>
    <strong>保底</strong>：新手前 ${NEWBIE.allstarByPull} 抽必出 85+（只一次，一定从常驻池出）；之后每 ${PITY.allstarEvery} 抽必出全明星+，${PITY.legendAt} 抽必出传奇+。教练卡也算一抽。<br/>
    抽前只看得到 OVR——成色、隐藏能力、妖人标签入手后才揭晓。</p>
  </details>`;
}

const fmt = (n) => n.toLocaleString("en-US");
const bandFloors = () => RATE_TABLE.filter((band) => band.id !== "common" && band.min >= 85).map((band) => `${band.label} ${band.min}+`).join("、");

/** One line under each banner button: how big it is and how its rarity is measured. */
function bannerSubtitle(banner, stats, days) {
  if (!stats) return banner.kind === "standard" ? "全历史赛季卡" : "每周轮换";
  if (banner.kind === "standard") return `${fmt(stats.cards)} 张全历史赛季卡 · 按绝对 OVR 分档`;
  return `${fmt(stats.cards)} 张 · ${fmt(stats.people)} 人 · 池内排名分档 · ${days} 天后轮换`;
}

export function bannerPickerHtml(banners, selectedId, esc, view = {}) {
  return banners
    .map((banner) => `<button type="button" class="draw-banner${banner.id === selectedId ? " active" : ""}" data-banner="${banner.id}" aria-pressed="${banner.id === selectedId}">
        <strong>${esc(banner.name)}</strong>
        <span class="tiny">${esc(bannerSubtitle(banner, view.stats?.[banner.id], view.days))}</span>
      </button>`)
    .join("");
}

function wishLine(stats, wishName, esc) {
  if (!wishName) return "还没设心愿球员——设了之后，这里会告诉你他在不在这个池里。";
  const name = esc(wishName);
  return stats.wishCards > 0
    ? `心愿球员 <strong>${name}</strong>：本池有 ${stats.wishCards} 张他的卡 ✔`
    : `心愿球员 <strong>${name}</strong>：本池<strong>没有</strong>他的卡——换个池抽。`;
}

/** What the selected banner means. Headline + wish stay visible; the how-it-works part folds away. */
export function bannerExplainHtml(banner, stats, { days, wishName } = {}, esc = (x) => x) {
  if (!banner || !stats) return "";
  const best = stats.top.map((t) => `${esc(t.name)} ${t.season}（OVR ${t.ovr}）`).join(" · ");
  const standard = banner.kind === "standard";
  const headline = standard
    ? `<strong>${esc(banner.name)}</strong>：${fmt(stats.cards)} 张赛季卡、${fmt(stats.people)} 位球员。`
    : `<strong>${esc(banner.name)}</strong>：${fmt(stats.cards)} 张赛季卡、${fmt(stats.people)} 位球员，还剩 ${days} 天轮换。`;
  const how = standard
    ? `稀有度按<strong>绝对 OVR</strong> 分档（${bandFloors()}）。`
    : `稀有度按<strong>「本池内排名」</strong>换算：本池最强的那批出神话档——所以弱年代也有高档位，强年代整体更强。但档位只表示「这个池里的位置」，不等于 OVR 96+。抽到的卡会标「池内 X 档」。<br/>本池最强：${best}`;
  return `<div class="banner-explain" role="region" aria-label="卡池说明">
      <p class="tiny">${headline}</p>
      <p class="tiny">${wishLine(stats, wishName, esc)}</p>
      <details class="banner-more">
        <summary>稀有度怎么算${standard ? "" : " · 本池最强"}</summary>
        <p class="tiny">${how}</p>
        <p class="tiny muted">新手保底那一抽不论选哪个池，都从常驻池出。</p>
      </details>
    </div>`;
}

export function drawStatusHtml(account, availability, wishName, esc) {
  const gacha = account.gacha || {};
  const toAllstar = PITY.allstarEvery - (gacha.sinceAllstar || 0);
  const toLegend = PITY.legendAt - (gacha.sinceLegend || 0);
  const pull = availability.free
    ? "今日免费抽可用"
    : availability.tickets > 0
      ? `抽卡券 ${availability.tickets} 张可用`
      : availability.extraLeft > 0
      ? `加抽 ¤${availability.cost}（今日还剩 ${availability.extraLeft} 次）`
      : "今日抽卡次数已用完";
  return `<div class="draw-status">
      <span>金币 ¤${account.gold || 0}</span>
      <span>抽卡券 ${availability.tickets || 0}</span>
      <span>卡库 ${(account.playerIds || []).length}/${MAX_CARDS}</span>
      <span>${pull}</span>
      <span>全明星保底还差 ${toAllstar} 抽</span>
      <span>传奇保底还差 ${toLegend} 抽</span>
      <span>心愿单：${wishName ? esc(wishName) : "未设置"}</span>
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

/** What this draw cost — shown for coach and player reveals alike. */
function paymentFlagsHtml(result) {
  return [
    result.usedTicket ? '<span class="draw-flag">抽卡券 −1</span>' : "",
    result.paidGold ? `<span class="draw-flag">加抽 −¤${result.paidGold}</span>` : "",
  ].join("");
}

export function drawRevealHtml(result, view) {
  const { esc, photoImg, rarityClass, skillChipsHtml } = view;
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
    result.pityHit ? '<span class="draw-flag">保底触发</span>' : "",
    result.newbieStandard ? '<span class="draw-flag">新手保底 · 从常驻池出</span>' : "",
    result.poolBand ? `<span class="draw-flag">池内 ${esc(result.poolBand)} 档</span>` : "",
    result.wishHit ? '<span class="draw-flag wish">心愿命中</span>' : "",
    paymentFlagsHtml(result),
    result.goldGain ? `<span class="draw-flag">+¤${result.goldGain}</span>` : "",
  ].join("");
  return `<div class="draw-reveal">
      ${photoImg(p, "headshot xl")}
      <div class="name">${esc(p.name)}${result.rarity ? ` <span class="rarity-tag ${rarityClass(result.ovr)}">${esc(result.rarity)}</span>` : ""}</div>
      <div class="meta">${p.season} · ${p.pos} · OVR ${result.ovr} · ${esc(result.banner?.name || "")}</div>
      <div class="draw-flags">${flags}</div>
      <p class="tiny">${OUTCOME_TEXT[result.outcome](result)}</p>
      <div>${hiddenBadgesHtml(p, esc)}</div>
      ${skillChipsHtml(p)}
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

/** Daily tasks + win milestone. Tickets are the reward, shown up front. */
export function tasksHtml(board) {
  const rows = board.tasks
    .map((task) => `<li class="${task.claimed ? "done" : ""}"><span aria-hidden="true">${task.claimed ? "✅" : "⬜"}</span> ${task.label} <span class="tiny">→ 抽卡券 +${task.tickets}${task.claimed ? "（已领）" : ""}</span></li>`)
    .join("");
  const challenge = board.challenge;
  const challengeRow = challenge
    ? `<li class="${challenge.claimed ? "done" : ""}"><span aria-hidden="true">${challenge.claimed ? "✅" : "🏆"}</span> 今日挑战：${challenge.label} <span class="tiny">→ 抽卡券 +${challenge.tickets}${challenge.claimed ? "（已领）" : ""}</span></li>`
    : "";
  return `<div class="draw-tasks">
      <strong>每日任务</strong>
      <ul>${rows}${challengeRow}<li><span aria-hidden="true">🎯</span> 排位累计 ${board.milestone.next} 胜 <span class="tiny">→ 抽卡券 +1（现在 ${board.milestone.wins} 胜，每 ${board.milestone.perTicket} 胜一张）</span></li></ul>
    </div>`;
}
