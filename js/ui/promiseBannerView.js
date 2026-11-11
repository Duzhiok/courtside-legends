/**
 * Promise-settlement banner: shows, in one place, every promise the unified
 * engine settled — what was promised, kept or broken, and the exact trust /
 * relationship change. Promise text can be player-typed, so it is escaped.
 */
const L = (zh, en, lang) => (lang === "en" ? en : zh);
const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const signed = (n) => (n > 0 ? `+${n}` : String(n));

export function promiseBannerHtml({ settled = [], lang = "zh" } = {}) {
  if (!settled.length) return "";
  const lines = settled
    .map((s) => {
      const kept = s.status === "fulfilled";
      return `<p class="promise-line ${kept ? "kept" : "broken"}">${kept ? "✓" : "✗"} ${esc(lang === "en" ? s.reasonEn : s.reason)} `
        + `（${L("信任", "trust", lang)} ${signed(s.effects?.trust ?? 0)} · ${L("关系", "relationship", lang)} ${signed(s.effects?.relationship ?? 0)}）</p>`;
    })
    .join("");
  return `<section class="reborn-promise-banner"><h3>${L("承诺结算", "Promises settled", lang)}</h3>${lines}</section>`;
}
