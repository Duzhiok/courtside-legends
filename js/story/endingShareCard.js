/**
 * Five-year ending share card: a compact, screenshot-friendly summary of a
 * time-travel tenure. Pure builders only — rendering returns an HTML string.
 */
import { buildCareerReport } from "./eventEngine.js";

const MAX_SIGNATURE_TRADES = 3;
const FINISH_LABELS = {
  champion: "🏆 夺冠",
  finals: "总决赛",
  playoffs: "季后赛",
  lottery: "未进季后赛",
};

export function finishLabel(season) {
  if (season?.champion) return FINISH_LABELS.champion;
  return FINISH_LABELS[season?.finish] || season?.finish || "—";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function contractResult(employment) {
  switch (employment?.status) {
    case "renewed": {
      const offer = employment.offer || {};
      return {
        tone: "success",
        text: `接受「${offer.title}」：${offer.years} 年 · 薪资 ${offer.salary} · 权限 ${offer.authority}`,
        privileges: [...(offer.privileges || [])],
      };
    }
    case "departed":
      return { tone: "neutral", text: "拒绝续约，带着成果离开", privileges: [] };
    case "fired":
      return { tone: "hard", text: "连续两季胜率低于 40%，被球队解雇", privileges: [] };
    case "renewal":
      return { tone: "neutral", text: "续约谈判进行中", privileges: [] };
    default:
      return { tone: "neutral", text: "任期仍在进行", privileges: [] };
  }
}

function signatureTrades(history) {
  return history
    .flatMap((summary) => (summary.transactions || [])
      .filter((entry) => entry.type === "trade")
      .map((entry) => ({ year: entry.year ?? summary.year, description: entry.description })))
    .slice(0, MAX_SIGNATURE_TRADES);
}

export function buildEndingShareCard(root) {
  const report = buildCareerReport(root);
  if (!report.ending) return null;
  const history = root.leagueCareer?.management?.seasonHistory || [];
  const wins = report.seasons.reduce((sum, season) => sum + (season.record?.w || 0), 0);
  const losses = report.seasons.reduce((sum, season) => sum + (season.record?.l || 0), 0);
  const lastSeason = report.seasons.at(-1);
  return {
    ending: { ...report.ending },
    teamName: lastSeason?.teamName || report.seasons[0]?.teamName || "我的球队",
    yearSpan: `${report.startYear}–${lastSeason?.year ?? report.currentYear}`,
    seasonCount: report.seasonCount,
    record: { w: wins, l: losses, pct: wins + losses ? wins / (wins + losses) : 0 },
    championships: report.championships,
    bestSeason: report.bestSeason ? { ...report.bestSeason, record: { ...report.bestSeason.record } } : null,
    seasons: report.seasons.map((season) => ({ ...season })),
    historyChanges: report.historyChanges.length,
    signatureTrades: signatureTrades(history),
    contract: contractResult(root.story.employment),
    story: {
      trust: report.frontOfficeTrust,
      pressure: report.mediaPressure,
      divergence: report.timelineDivergence,
    },
  };
}

export function shareCardText(card, lang = "zh") {
  if (!card) return "";
  const en = lang === "en";
  const lines = [
    en ? `[Courtside Legends · Five-Year Journey] ${card.ending.labelEn || card.ending.label}` : `【场边传奇 · 穿越五年】${card.ending.label}`,
    `${card.teamName} · ${card.yearSpan} · ${card.seasonCount} 个赛季`,
    `总战绩 ${card.record.w}胜${card.record.l}负（胜率 ${(card.record.pct * 100).toFixed(1)}%）· 总冠军 ${card.championships} 次`,
  ];
  if (card.bestSeason) {
    lines.push(`最佳赛季 ${card.bestSeason.year}：${card.bestSeason.record.w}胜${card.bestSeason.record.l}负`);
  }
  if (card.historyChanges) lines.push(`改写史实冠军 ${card.historyChanges} 次`);
  for (const trade of card.signatureTrades) lines.push(`标志性交易 ${trade.year}：${trade.description}`);
  lines.push(`合同结果：${card.contract.text}`);
  return lines.join("\n");
}

export function renderEndingShareCardHtml(card, lang = "zh") {
  if (!card) return "";
  const en = lang === "en";
  const seasonRows = card.seasons
    .map((season) => `<li><span>${escapeHtml(season.year)}</span><span>${season.record ? `${season.record.w}-${season.record.l}` : "—"}</span><span>${escapeHtml(finishLabel(season))}</span></li>`)
    .join("");
  const trades = card.signatureTrades.length
    ? card.signatureTrades.map((trade) => `<li>${escapeHtml(trade.year)}：${escapeHtml(trade.description)}</li>`).join("")
    : "<li>五年里没有完成交易，坚持原班底。</li>";
  const privileges = card.contract.privileges.length
    ? `<div class="share-card-privileges">${card.contract.privileges.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>`
    : "";
  return `<article class="ending-share-card tone-${escapeHtml(card.ending.tone)}" aria-label="${en ? "Five-year tenure ending card" : "五年任期结局卡"}">
    <header>
      <div class="share-card-kicker">${en ? "Courtside Legends · Five-Year Journey" : "场边传奇 · 穿越五年"}</div>
      <h3>${escapeHtml(card.ending.labelEn && en ? card.ending.labelEn : card.ending.label)}</h3>
      <p>${escapeHtml(card.teamName)} · ${escapeHtml(card.yearSpan)}</p>
    </header>
    <div class="share-card-stats">
      <div><strong>${card.record.w}-${card.record.l}</strong><span>${en ? "Record" : "总战绩"}</span></div>
      <div><strong>${(card.record.pct * 100).toFixed(1)}%</strong><span>${en ? "Win %" : "胜率"}</span></div>
      <div><strong>${card.championships}</strong><span>总冠军</span></div>
      <div><strong>${card.historyChanges}</strong><span>改写史实</span></div>
    </div>
    <h4>逐季战绩</h4>
    <ul class="share-card-seasons">${seasonRows}</ul>
    <h4>标志性交易</h4>
    <ul class="share-card-trades">${trades}</ul>
    <h4>合同结果</h4>
    <p class="share-card-contract tone-${escapeHtml(card.contract.tone)}">${escapeHtml(card.contract.text)}</p>
    ${privileges}
    <footer>管理层信任 ${card.story.trust} · 媒体压力 ${card.story.pressure} · 时间线偏离 ${card.story.divergence}</footer>
  </article>`;
}
