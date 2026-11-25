/**
 * Market player cards (B61 step 4: moved out of app.js, no behaviour change). Pure HTML builders: a player (and, for the shop card, the
 * market context) in, a string out. Nothing here touches the DOM, the game state or storage.
 */
import { getLang } from "../i18n.js";
import { POS_SLOTS } from "../data/franchises.js";
import { esc } from "../core/html.js";
import { marketMeta, playerPrice, topIntangibles } from "../data/intangibles.js";
import { photoImg } from "../data/photo.js";
import { attributeChipsHtml } from "../ui/rotationBoard.js";
import { valueBadge, valueBadgeHtml } from "../ui/valueBadge.js";
import { shortfallLabel } from "../ui/shortfall.js";
import { overall, physiqueLabel, tendencyLabel } from "../data/players.js";
import { purchasedSkillsRefund, skillChipsHtml } from "../data/skills.js";
import { rosterFitDelta, rosterFitTier } from "../engine/careerEconomy.js";
import { normalizePos } from "../data/positions.js";
import { confidenceLabel, formatGameLine, summarizeRecentForm, tacticalLabel } from "../engine/form.js";

export function marketFormBlock(p) {
  const conf = Number(p.confidence);
  const tac = Number(p.tacticalStatus);
  const recent = summarizeRecentForm(p);
  const games = Array.isArray(p.recentGames)
    ? p.recentGames
    : p.lastGame
      ? [p.lastGame]
      : [];
  const cardAvg = p.raw
    ? `卡面赛季 ${Number(p.raw.ppg || 0).toFixed(1)}分 ${Number(p.raw.rpg || 0).toFixed(1)}板 ${Number(
        p.raw.apg || 0
      ).toFixed(1)}助`
    : "";
  if (!recent && !Number.isFinite(conf) && !cardAvg) {
    return `<div class="tiny market-form muted">本模式尚未出战 · 暂无近况</div>`;
  }
  const mood =
    Number.isFinite(conf) || Number.isFinite(tac)
      ? `<div class="tiny market-form-mood">状态 ${
          Number.isFinite(conf) ? confidenceLabel(conf) + conf : "—"
        } · ${Number.isFinite(tac) ? tacticalLabel(tac) : "—"}</div>`
      : "";
  const avgLine = recent
    ? `<div class="tiny market-form-avg"><strong>近${recent.games}场</strong> ${recent.ppg}分 ${recent.rpg}板 ${recent.apg}助${
        recent.spg ? ` ${recent.spg}断` : ""
      }${        recent.bpg ? ` ${recent.bpg}帽` : ""} · ${recent.mpg}分钟${
        recent.wins + recent.losses
          ? ` · ${recent.wins}胜${recent.losses}负`
          : ""
      }${recent.avgRating != null ? ` · 平均评分 ${recent.avgRating > 0 ? "+" : ""}${recent.avgRating}` : ""}</div>`
    : "";
  const log =
    games.length > 0
      ? `<ul class="market-form-log">${games
          .slice()
          .reverse()
          .map((g, i) => {
            const label = i === 0 ? "上场" : `${i + 1}场前`;
            return `<li><span class="form-when">${label}</span> ${formatGameLine(g)}</li>`;
          })
          .join("")}</ul>`
      : "";
  const cardLine = cardAvg ? `<div class="tiny market-form-card">${cardAvg}</div>` : "";
  return `<div class="market-form">${mood}${avgLine}${log}${cardLine}</div>`;
}

export function marketOwnedCard(p, canSell, sideLabel = "") {
  const buy = playerPrice(p);
  const bodySell = Math.round(buy * 0.65);
  const skillRefund = purchasedSkillsRefund(p);
  const sell = bodySell + skillRefund.gold;
  const skillBit =
    skillRefund.gold > 0
      ? `（含技能变现 ¤${skillRefund.gold}）`
      : "";
  const badge = valueBadge(p, { owned: true });
  const v = badge?.text;
  const tips = topIntangibles(p, 3)
    .map((t) => `${t.name}${t.value}`)
    .join(" · ");
  const inj =
    p.injuredGames > 0 ? ` · <em class="inj">${p.injuryStatus || "伤停"}${p.injuredGames}场</em>` : "";
  const tags = (p.tags || [])
    .filter((t) => t !== "妖人")
    .slice(0, 2)
    .map((t) => `<span class="chip warn">${t}</span>`)
    .join("");
  const boost = p._posBoostNote
    ? `<div class="tiny pos-boost-note">↑ ${esc(p._posBoostNote)}</div>`
    : "";
  const posCtrl = posSelectHtml(p).replace(
    'class="pos-select"',
    'class="pos-select market-pos-select"'
  );
  return `<div class="market-row owned editable" draggable="true" data-drag-id="${p.id}" data-side="${sideLabel}">
    ${photoImg(p)}
    <div class="market-owned-body">
      <div class="market-owned-head">
        <strong>${esc(p.name)}${v ? ` ${valueBadgeHtml(badge)}` : ""}</strong>
        ${posCtrl}
      </div>
      <div class="tiny">${p.season} · 原${p.pos} · OVR ${overall(p)}${inj}${
        physiqueLabel(p) ? ` · ${physiqueLabel(p)}` : ""
      }</div>
      ${boost}
      <div class="tiny market-stats">攻${p.scoring} 防${p.defense} 传${p.pass} 板${p.rebound} 断${p.steal ?? "-"} 帽${p.block ?? "-"} 速${p.speed} 力${p.strength ?? "-"}</div>
      ${marketFormBlock(p)}
      <div class="tiny">${tendencyLabel(p)}</div>
      <div class="tiny">暗属性 ${tips || "—"}</div>
      <div class="tiny">${marketMeta(p)}</div>
      ${p.skills?.length ? `<div class="skill-row">${skillChipsHtml(p, getLang())}</div>` : ""}
      <div class="tiny">估价 ¤${buy} · <strong>卖出 ¤${sell}</strong>${skillBit}${
        v === "高薪低能" ? " · 可考虑卖出腾薪资" : ""
      }</div>
      <div class="stat-chips">${tags}</div>
    </div>
    ${
      canSell
        ? `<button class="btn small" data-sell="${p.id}" data-side="${sideLabel}">卖出 ¤${sell}</button>`
        : ""
    }
  </div>`;
}

export function posSelectHtml(player, { selectedPos = null, disabled = false } = {}) {
  const cur = normalizePos(selectedPos || player.playPos || player.pos);
  const opts = POS_SLOTS.map(
    (s) =>
      `<option value="${s.id}" ${s.id === cur ? "selected" : ""}>${s.id}${
        s.id === normalizePos(player.pos) ? "·本职" : ""
      }</option>`
  ).join("");
  return `<select class="pos-select" data-id="${player.id}" ${disabled ? "disabled" : ""} title="指定场上位置（错位降低适配度）">${opts}</select>`;
}

/** The badge on a shop card: what the scout (if hired) lets the player see about value. */
function shopRevealBadge(p, scoutActive) {
  return valueBadgeHtml(valueBadge(p, { scouted: scoutActive }));
}

export function playerMarketCardHtml(p, c, { duel = false, scoutOn = false, fitOn = scoutOn, homeTactic = null, budget = 0 } = {}) {
  const price = playerPrice(p);
  const afford = price <= budget;
  const badge = shopRevealBadge(p, scoutOn);
  const fitTier = fitOn
    ? rosterFitTier(rosterFitDelta(p, c.team?.players || [], c.team?.coach, homeTactic))
    : null;
  const fitBadge = fitTier === "great"
    ? ` <span class="fit-badge tactic">${getLang() === "en" ? "Analyst: great fit" : "数据分析师：极佳适配"}</span>`
    : fitTier === "good"
      ? ` <span class="fit-badge need">${getLang() === "en" ? "Analyst: good fit" : "数据分析师：适配良好"}</span>`
      : "";
  return `<div class="market-row ${afford ? "" : "unaffordable"}">
    ${photoImg(p)}
    <div style="flex:1">
      <strong>${esc(p.name)}${badge ? ` ${badge}` : ""}${fitBadge}</strong>
      <div class="tiny">${p.season} ${p.pos} · OVR ${overall(p)} · <strong>¤${price}</strong>${
        afford ? "" : " · 超出预算"
      }${physiqueLabel(p) ? ` · ${physiqueLabel(p)}` : ""}</div>
      <div class="tiny">${marketMeta(p)}</div>
      <div class="rot-attrs">${attributeChipsHtml(p, getLang())}</div>
      ${p.skills?.length ? `<div class="skill-row">${skillChipsHtml(p, getLang())}</div>` : ""}
    </div>
    ${
      duel
        ? `<button class="btn small" data-bid="${p.id}">加入竞价</button>`
        : `<button class="btn small ${afford ? "" : "buy-disabled"}" data-buy="${p.id}" ${
            afford ? "" : "disabled"
          }>${afford ? "买入" : shortfallLabel(price, budget)}</button>`
    }
  </div>`;
}
