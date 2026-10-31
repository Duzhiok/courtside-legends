/** Small shared helpers for the time-travel views: language pick, escaping, tones, effect chips. */

export const tr = (lang, zh, en) => (lang === "en" ? en : zh);

const ESC = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ESC[char]);

export const clamp = (value, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Number(value) || 0));

/** "good" | "mid" | "bad" for a 0-100 gauge. `higherIsBetter=false` flips it (media pressure). */
export function gaugeTone(value, higherIsBetter = true) {
  const goodness = higherIsBetter ? clamp(value) : 100 - clamp(value);
  if (goodness >= 65) return "good";
  if (goodness >= 35) return "mid";
  return "bad";
}

/** Black or white text for a team-colour background (WCAG relative luminance). */
export function readableInk(hex) {
  const match = /^#?([0-9a-f]{6})$/i.exec(String(hex || ""));
  if (!match) return "#ffffff";
  const channels = [0, 2, 4].map((offset) => {
    const c = parseInt(match[1].slice(offset, offset + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  return luminance > 0.42 ? "#0b1610" : "#ffffff";
}

/**
 * Consequence chips for a choice: direction + rough size, never the exact number (that would turn
 * a dilemma into arithmetic). Only the three meters the player can see are shown -- relationships
 * stay hidden on purpose, they are a slower, subtler consequence.
 *   tone: does this move help (good), hurt (bad), or just change (violet) the career?
 */
const EFFECT_ROWS = [
  { key: "trust", zh: "信任", en: "Trust", tone: (v) => (v > 0 ? "good" : "bad") },
  { key: "mediaPressure", alt: "pressure", zh: "压力", en: "Pressure", tone: (v) => (v > 0 ? "bad" : "good") },
  { key: "divergence", zh: "时间线", en: "Timeline", tone: () => "violet" },
  { key: "knowledge", zh: "未来知识", en: "Foresight", tone: (v) => (v > 0 ? "good" : "warn") },
];

export function magnitudeTier(value) {
  const size = Math.abs(Number(value) || 0);
  if (size === 0) return 0;
  if (size <= 2) return 1;
  if (size <= 5) return 2;
  return 3;
}

export function effectChipsHtml(effects, lang = "zh") {
  if (!effects) return "";
  const words = tr(lang, ["", "小幅", "明显", "大幅"], ["", "slightly", "clearly", "sharply"]);
  const chips = [];
  for (const row of EFFECT_ROWS) {
    const raw = effects[row.key] ?? (row.alt ? effects[row.alt] : 0);
    const tier = magnitudeTier(raw);
    if (!tier) continue;
    const up = raw > 0;
    const arrows = (up ? "▲" : "▼").repeat(tier);
    const name = tr(lang, row.zh, row.en);
    const spoken = `${name} ${words[tier]}${tr(lang, up ? "上升" : "下降", up ? " up" : " down")}`;
    chips.push(
      `<span class="tt-eff tt-eff-${row.tone(raw)}" title="${esc(spoken)}"><span class="tt-eff-name">${esc(name)}</span><span class="tt-eff-arrows" aria-hidden="true">${arrows}</span><span class="tt-sr">${esc(spoken)}</span></span>`,
    );
  }
  return chips.length ? `<span class="tt-effects">${chips.join("")}</span>` : "";
}
