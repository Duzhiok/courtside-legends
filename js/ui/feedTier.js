/**
 * B1 — 播报三级视觉权重：normal（统一文字色 + 小队标）/ important（淡底色 + 加粗）/ legend（独立高光卡）。
 * 只有真正改变比赛走势的事件才升级，普通事件保持克制，否则"全是重点"等于没有重点。
 * 纯函数，只读事件自带的快照（比分是出手后的比分）与调用方传入的 run 里程碑，不依赖随机。
 * 连续得分（run）需要事件历史，所以由 feedRuns.js 的 tracker 在渲染层统计后传进来，
 * 这个函数本身仍然一次只看一个事件。
 */

export const CLUTCH_SECONDS = 24; // 第四节/加时最后 24 秒
export const BUZZER_SECONDS = 3;
export const CLUTCH_BLOCK_MARGIN = 3; // 关键封盖：此时分差不超过 3 分

const BLOCK_RE = /盖帽|\bblocks?\b/i;

/** @returns {{ tier: "normal"|"important"|"legend", kind: string|null }} */
export function feedEventTier(ev, { run = null } = {}) {
  const normal = { tier: "normal", kind: null };
  if (!ev || ev.type === "coach") return normal;

  const shot = ev.meta?.shot;
  const side = ev.possession === "home" || ev.possession === "away" ? ev.possession : null;
  const late = ev.quarter >= 4 && ev.clock <= CLUTCH_SECONDS;
  if (ev.type === "score" && shot?.made && side && ev.score) {
    const opp = side === "home" ? "away" : "home";
    const after = ev.score[side] - ev.score[opp];
    const before = after - (shot.pts || 0);
    const goAhead = before <= 0 && after > 0; // 平局或落后 → 反超
    if (goAhead && late) return { tier: "legend", kind: ev.clock <= BUZZER_SECONDS ? "buzzer" : "goahead" };
    if (run?.milestone && run.side === side) return { tier: "legend", kind: "run" };
    if (goAhead && ev.quarter >= 3) return { tier: "important", kind: "lead" };
    if (shot.pts === 3 && ev.quarter >= 4 && Math.abs(after) <= 6) return { tier: "important", kind: "clutch3" };
    return normal;
  }
  // A run milestone can also land on a plain made shot without shot meta (e.g. free throws).
  if (ev.type === "score" && run?.milestone && run.side === side) return { tier: "legend", kind: "run" };

  if (ev.type === "miss" && BLOCK_RE.test(ev.text || "")) {
    const close = ev.score && Math.abs(ev.score.home - ev.score.away) <= CLUTCH_BLOCK_MARGIN;
    return late && close ? { tier: "legend", kind: "block" } : { tier: "important", kind: "block" };
  }
  return normal;
}

const HEADLINES = {
  buzzer: { zh: "压哨反超！", en: "Buzzer-beater!" },
  goahead: { zh: "关键反超！", en: "Go-ahead shot!" },
  block: { zh: "关键封盖！", en: "Clutch block!" },
};

/** Big title for a legend card (only legend kinds have one). `points` is the run length for kind "run". */
export function legendHeadline(kind, lang = "zh", { points = 0 } = {}) {
  const en = lang === "en";
  if (kind === "run") return en ? `${points}-0 run!` : `${points}-0 攻击波！`;
  const h = HEADLINES[kind];
  return h ? h[en ? "en" : "zh"] : "";
}
