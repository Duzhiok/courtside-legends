/**
 * Collection filter + sort for a binder of up to 60 cards. Pure data in, pure
 * data out; the DOM wiring lives in app.js.
 */
import { bandOf } from "../data/gacha.js";
import { matchesQuery } from "../data/cardSearch.js";

export const SORTS = [
  { id: "ovr", label: "OVR 高→低", labelEn: "OVR high → low" },
  { id: "hidden", label: "隐藏能力 高→低", labelEn: "Hidden trait high → low" },
  { id: "recent", label: "最近获得", labelEn: "Recently acquired" },
  { id: "season", label: "年代 新→旧", labelEn: "Era new → old" },
  { id: "stars", label: "星级 高→低", labelEn: "Stars high → low" },
];

export const BANDS = [
  { id: "all", label: "全部稀有度", labelEn: "All rarities" },
  { id: "star", label: "全明星以上", labelEn: "All-Star+" },
  { id: "mid", label: "先发 / 轮换", labelEn: "Starter / Rotation" },
  { id: "low", label: "普通", labelEn: "Common" },
];

export const GRADES = ["S", "A", "B", "C", "D"];

export function freshFilter() {
  return { sort: "ovr", band: "all", grade: "all", decade: "all", redundantOnly: false, junkOnly: false, query: "" };
}

function bandGroup(ovr) {
  const id = bandOf(ovr).id;
  if (["myth", "legend", "superstar", "allstar"].includes(id)) return "star";
  return ["starter", "rotation"].includes(id) ? "mid" : "low";
}

/**
 * ctx: { ovrOf, hiddenOf, redundant:Set<id>, junk:Set<id>, order:Map<id, index> }
 * `order` is acquisition order (higher = newer).
 */
export function applyCollectionView(cards, filter, ctx) {
  const decade = filter.decade === "all" ? null : Number(filter.decade);
  const kept = cards.filter((card) => {
    if (filter.band !== "all" && bandGroup(ctx.ovrOf(card)) !== filter.band) return false;
    if (filter.grade !== "all" && card.hiddenRoll?.grade !== filter.grade) return false;
    if (decade != null && Math.floor(card.season / 10) * 10 !== decade) return false;
    if (filter.redundantOnly && !ctx.redundant.has(card.id)) return false;
    if (filter.junkOnly && !ctx.junk.has(card.id)) return false;
    return !filter.query.trim() || matchesQuery(card, filter.query);
  });
  const by = {
    ovr: (a, b) => ctx.ovrOf(b) - ctx.ovrOf(a),
    hidden: (a, b) => (ctx.hiddenOf(b) ?? 0) - (ctx.hiddenOf(a) ?? 0),
    recent: (a, b) => (ctx.order.get(b.id) ?? 0) - (ctx.order.get(a.id) ?? 0),
    season: (a, b) => b.season - a.season,
    stars: (a, b) => (b.mergeLevel || 0) - (a.mergeLevel || 0),
  }[filter.sort] || ((a, b) => ctx.ovrOf(b) - ctx.ovrOf(a));
  // OVR is the stable tie-break so equal keys never shuffle between renders
  return [...kept].sort((a, b) => by(a, b) || ctx.ovrOf(b) - ctx.ovrOf(a) || String(a.id).localeCompare(String(b.id)));
}

/** Second version of a person who is not the best copy — the cards that never play. */
export function redundantIds(cards, ovrOf) {
  const best = new Map();
  for (const card of cards) {
    const top = best.get(card.bref);
    if (!top || ovrOf(card) > ovrOf(top)) best.set(card.bref, card);
  }
  return new Set(cards.filter((card) => best.get(card.bref).id !== card.id).map((card) => card.id));
}

export function decadesOf(cards) {
  return [...new Set(cards.map((card) => Math.floor(card.season / 10) * 10))].sort((a, b) => b - a);
}

export function filterBarHtml(filter, { shown, total, decades }, esc, lang = "zh") {
  const en = lang === "en";
  const L = (zh, labelEn) => (en ? labelEn : zh);
  const sortLabel = (s) => L(s.label, s.labelEn || s.label);
  const bandLabel = (b) => L(b.label, b.labelEn || b.label);
  const option = (value, label, current) => `<option value="${value}" ${String(current) === String(value) ? "selected" : ""}>${esc(label)}</option>`;
  return `<div class="collection-filter" role="search" aria-label="${en ? "Filter and sort collection" : "筛选和排序卡库"}">
      <span class="search-wrap cf-query"><input type="search" data-cf="query" value="${esc(filter.query)}" placeholder="${en ? "Search player / year / nickname" : "搜球员 / 年份 / 外号"}" aria-label="${en ? "Search collection" : "搜索卡库"}" /><button type="button" class="search-clear" data-cf-clear aria-label="${en ? "Clear search" : "清空搜索"}" title="${en ? "Clear search" : "清空搜索"}"${filter.query ? "" : " hidden"}>×</button></span>
      <select data-cf="sort" aria-label="${en ? "Sort" : "排序"}">${SORTS.map((s) => option(s.id, sortLabel(s), filter.sort)).join("")}</select>
      <select data-cf="band" aria-label="${en ? "Rarity" : "稀有度"}">${BANDS.map((b) => option(b.id, bandLabel(b), filter.band)).join("")}</select>
      <select data-cf="grade" aria-label="${en ? "Grade" : "成色"}">${option("all", en ? "All grades" : "全部成色", filter.grade)}${GRADES.map((g) => option(g, en ? `Grade ${g}` : `成色 ${g}`, filter.grade)).join("")}</select>
      <select data-cf="decade" aria-label="${en ? "Era" : "年代"}">${option("all", en ? "All eras" : "全部年代", filter.decade)}${decades.map((d) => option(d, en ? `${d}s` : `${d} 年代`, filter.decade)).join("")}</select>
      <label class="tiny"><input type="checkbox" data-cf="redundantOnly" ${filter.redundantOnly ? "checked" : ""} /> ${en ? "Only duplicate-person versions" : "只看同人冗余版本"}</label>
      <label class="tiny"><input type="checkbox" data-cf="junkOnly" ${filter.junkOnly ? "checked" : ""} /> ${en ? "Only one-tap recyclable" : "只看可一键分解"}</label>
      <span class="tiny" role="status" data-cf-count>${en ? `Showing ${shown}/${total}` : `显示 ${shown}/${total} 张`}</span>
    </div>`;
}
