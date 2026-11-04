/**
 * B1 — 播报三级视觉权重：normal（统一文字色 + 小队标）/ important（淡底色 + 加粗）/ legend（独立高光卡）。
 * 只有真正改变比赛走势的事件才升级，普通事件保持克制，否则"全是重点"等于没有重点。
 * 纯函数，只读事件自带的快照（比分是出手后的比分），不依赖随机。
 */

export const CLUTCH_SECONDS = 24; // 第四节/加时最后 24 秒
export const BUZZER_SECONDS = 3;

const BLOCK_RE = /盖帽|\bblocks?\b/i;

/** @returns {{ tier: "normal"|"important"|"legend", kind: string|null }} */
export function feedEventTier(ev) {
  const normal = { tier: "normal", kind: null };
  if (!ev || ev.type === "coach") return normal;

  const shot = ev.meta?.shot;
  const side = ev.possession === "home" || ev.possession === "away" ? ev.possession : null;
  if (ev.type === "score" && shot?.made && side && ev.score) {
    const opp = side === "home" ? "away" : "home";
    const after = ev.score[side] - ev.score[opp];
    const before = after - (shot.pts || 0);
    const goAhead = before <= 0 && after > 0; // 平局或落后 → 反超
    const late = ev.quarter >= 4 && ev.clock <= CLUTCH_SECONDS;
    if (goAhead && late) return { tier: "legend", kind: ev.clock <= BUZZER_SECONDS ? "buzzer" : "goahead" };
    if (goAhead && ev.quarter >= 3) return { tier: "important", kind: "lead" };
    if (shot.pts === 3 && ev.quarter >= 4 && Math.abs(after) <= 6) return { tier: "important", kind: "clutch3" };
    return normal;
  }

  if (ev.type === "miss" && BLOCK_RE.test(ev.text || "")) return { tier: "important", kind: "block" };
  return normal;
}

const HEADLINES = {
  buzzer: { zh: "压哨反超！", en: "Buzzer-beater!" },
  goahead: { zh: "关键反超！", en: "Go-ahead shot!" },
};

/** Big title for a legend card (only legend kinds have one). */
export function legendHeadline(kind, lang = "zh") {
  const h = HEADLINES[kind];
  return h ? h[lang === "en" ? "en" : "zh"] : "";
}
