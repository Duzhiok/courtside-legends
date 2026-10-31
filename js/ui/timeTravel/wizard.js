import { icon } from "./icons.js";
import { esc, tr } from "./format.js";

/** One-line flavour per decade, shown under the year dial. Trivia, not mechanics. */
const ERA_NOTES = {
  1950: ["黎明年代：没有三分线，24 秒刚被发明", "The dawn: no three-point line, the shot clock just invented"],
  1960: ["凯尔特人王朝与张伯伦的统治", "Celtics dynasty and Wilt's dominance"],
  1970: ["ABA 合并，联盟在乱世里重组", "The ABA merger and a league in flux"],
  1980: ["魔术师、大鸟与乔丹的崛起", "Magic, Bird and the rise of Jordan"],
  1990: ["乔丹的年代，防守与对抗至上", "The Jordan era: defence and physicality"],
  2000: ["马刺与湖人的王朝，慢节奏半场", "Spurs and Lakers dynasties, half-court grind"],
  2010: ["三分革命，小球席卷联盟", "The three-point revolution and small ball"],
  2020: ["无位置篮球与全能球员", "Positionless basketball and do-it-all stars"],
};

export const decadeOf = (year) => Math.floor(Number(year) / 10) * 10;

export function eraNote(year, lang = "zh") {
  const note = ERA_NOTES[decadeOf(year)];
  return note ? tr(lang, note[0], note[1]) : "";
}

/** Quick-jump chips: the first available year of each decade present in `years`. */
export function decadeChipsHtml(years, selectedYear, lang = "zh") {
  const firstOfDecade = new Map();
  for (const year of [...years].sort((a, b) => a - b)) {
    if (!firstOfDecade.has(decadeOf(year))) firstOfDecade.set(decadeOf(year), year);
  }
  const active = decadeOf(selectedYear);
  return [...firstOfDecade].map(([decade, year]) => {
    const on = decade === active;
    return `<button type="button" class="tt-chip${on ? " is-on" : ""}" data-decade-year="${year}" aria-pressed="${on}">${esc(tr(lang, `${decade}年代`, `${decade}s`))}</button>`;
  }).join("");
}

/**
 * Coaching philosophy today only decides WHICH three teams call you (it seeds the interview draw);
 * it has no in-game effect yet. The blurbs are flavour and the group note says so honestly.
 */
const PHILOSOPHIES = [
  { id: "analytics", ico: "chart", zh: "数据分析", en: "Analytics", blurbZh: "相信数字，用数据说服老板", blurbEn: "Trust the numbers; win the owner with data" },
  { id: "relationships", ico: "users", zh: "关系经营", en: "Relationships", blurbZh: "更衣室第一，人心稳了成绩自来", blurbEn: "Locker room first; results follow trust" },
  { id: "tactics", ico: "scroll", zh: "战术大师", en: "Tactician", blurbZh: "战术板就是你的武器", blurbEn: "The whiteboard is your weapon" },
  { id: "scouting", ico: "eye", zh: "球探眼光", en: "Scouting", blurbZh: "永远盯着下一个未被发现的明星", blurbEn: "Always chasing the next unseen star" },
];

export function philosophyCardsHtml(selected, lang = "zh") {
  return PHILOSOPHIES.map((p) => {
    const on = p.id === selected;
    return `<button type="button" class="tt-pick${on ? " is-on" : ""}" role="radio" aria-checked="${on}" data-philosophy="${p.id}">
      <span class="tt-pick-ico">${icon(p.ico, { size: 20 })}</span>
      <span class="tt-pick-text"><strong>${esc(tr(lang, p.zh, p.en))}</strong><span>${esc(tr(lang, p.blurbZh, p.blurbEn))}</span></span>
    </button>`;
  }).join("");
}

const SIGNED = (n) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

/** Origin tweaks are real, exact numbers (unlike story choices), so show them as they are. */
export function originDeltasHtml(origin, lang = "zh") {
  const rows = [
    ["reputationDelta", tr(lang, "声望", "Reputation"), 1],
    ["trustDelta", tr(lang, "信任", "Trust"), 1],
    ["authorityDelta", tr(lang, "权限", "Authority"), 1],
    ["pressureDelta", tr(lang, "压力", "Pressure"), -1],
  ];
  const chips = rows
    .filter(([key]) => origin[key])
    .map(([key, label, goodSign]) => {
      const tone = Math.sign(origin[key]) === goodSign ? "good" : "bad";
      return `<span class="tt-eff tt-eff-${tone}"><span class="tt-eff-name">${esc(label)}</span><span class="tt-eff-num">${SIGNED(origin[key])}</span></span>`;
    });
  return chips.length
    ? `<span class="tt-effects">${chips.join("")}</span>`
    : `<span class="tt-faint">${esc(tr(lang, "没有任何加成或惩罚", "No bonuses or penalties"))}</span>`;
}

export function originChipsHtml(origins, selected, lang = "zh") {
  return origins.map((origin) => {
    const on = origin.id === selected;
    return `<button type="button" class="tt-chip tt-chip-origin${on ? " is-on" : ""}" role="radio" aria-checked="${on}" data-origin="${esc(origin.id)}">${esc(tr(lang, origin.label, origin.labelEn))}</button>`;
  }).join("");
}
