import { teamColors } from "../data/teamColors.js";
import { FRANCHISES } from "../data/franchises.js";

/**
 * 文字播报的球队颜色系统（R48）。
 *
 * 旧播报只按事件类型上色（得分金、篮板绿、教练蓝），看不出是哪队打的——
 * 要认人才能跟上比赛。新规则：每条实况按「当时的进攻方」上色，
 * 颜色取该队的球队色（历史队 = 真队色；联队 = 首发众数队色），
 * 得分条额外带比分牌。引擎事件自带 possession/score（emit 时的快照），
 * 实测 111/111 条得分事件的 possession 与得分方完全一致，0 矛盾。
 * 教练/系统消息不属于任何一队，保持中性色。
 */

export const FEED_BG = "#102319"; // .play-feed 的背景色，文字色按它调可读性

const rgbOf = (hex) => {
  const h = String(hex || "").replace("#", "");
  const v = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padStart(6, "0").slice(0, 6);
  return [parseInt(v.slice(0, 2), 16), parseInt(v.slice(2, 4), 16), parseInt(v.slice(4, 6), 16)];
};

const toHex = (r, g, b) =>
  `#${[r, g, b].map((n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, "0")).join("")}`;

/** Mix two hex colours: t=0 → a, t=1 → b. */
export function mixHex(a, b, t) {
  const [r1, g1, b1] = rgbOf(a);
  const [r2, g2, b2] = rgbOf(b);
  return toHex(r1 + (r2 - r1) * t, g1 + (g2 - g1) * t, b1 + (b2 - b1) * t);
}

/** rgba() string for tinting a feed row with the raw team colour. */
export function withAlpha(hex, alpha) {
  const [r, g, b] = rgbOf(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function luminance(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Team colours are picked for jerseys, not for dark UI: Spurs black and
 * Nets black vanish on the feed's dark green. Lighten toward white until
 * the text is readable on FEED_BG (raw colour still shows in the side bar
 * and legend dot, so identity is not lost).
 */
export function readableTextColor(hex, bg = FEED_BG) {
  let out = hex;
  for (let t = 0; t <= 0.8 && contrastRatio(out, bg) < 4.2; t += 0.1) {
    out = mixHex(hex, "#FFFFFF", Math.min(0.8, t + 0.1));
  }
  return out;
}

function hueOf(hex) {
  const [r, g, b] = rgbOf(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return -1; // grey: no hue
  const d = max - min;
  let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}

/** Two colours read as "different teams" when hue or lightness separates them. */
export function colorsDistant(a, b) {
  const ha = hueOf(a);
  const hb = hueOf(b);
  const hueGap = ha < 0 || hb < 0 ? 180 : Math.min(Math.abs(ha - hb), 360 - Math.abs(ha - hb));
  return hueGap >= 28 || Math.abs(luminance(a) - luminance(b)) >= 0.06;
}

/**
 * Which roster team code represents this match team?
 * Real/historical team → its own code or franchise. Mixed 联队 → the
 * plurality code among its five best players (its "face"), stable enough
 * across a tournament because starters rarely turn over wholesale.
 */
export function teamCodeOf(team) {
  if (!team) return null;
  if (team.code && teamColors(team.code)) return team.code;
  if (team.teamCode) return team.teamCode;
  if (team.franchiseId) {
    const fr = FRANCHISES.find((f) => f.id === team.franchiseId);
    if (fr) return fr.aliases?.[0] || fr.id;
    return team.franchiseId;
  }
  const players = team.onCourt || team.roster || team.players || [];
  const starters = [...players]
    .sort((a, b) => (b.ovr2k ?? b.rating ?? 0) - (a.ovr2k ?? a.rating ?? 0))
    .slice(0, 5);
  const counts = new Map();
  for (const p of starters) {
    if (p?.team) counts.set(p.team, (counts.get(p.team) || 0) + 1);
  }
  let best = null;
  let bestN = 0;
  for (const [code, n] of counts) {
    if (n > bestN) {
      best = code;
      bestN = n;
    }
  }
  return best;
}

/**
 * Per-match colour assignment. If the two primaries clash (Celtics vs
 * Bucks greens, Bulls vs Hawks reds), the away side falls back to its
 * secondary colour, then to a lightened primary — the pair must always
 * be distinguishable at a glance, that is the whole point of the feed.
 */
export function resolveMatchColors(homeTeam, awayTeam) {
  const mk = (team) => {
    const code = teamCodeOf(team);
    const pair = teamColors(code);
    return { code, color: pair.primary, secondary: pair.secondary };
  };
  const home = mk(homeTeam);
  const away = mk(awayTeam);
  if (!colorsDistant(home.color, away.color)) {
    if (colorsDistant(home.color, away.secondary)) away.color = away.secondary;
    else away.color = mixHex(away.color, "#FFFFFF", 0.45);
  }
  for (const side of [home, away]) side.text = readableTextColor(side.color);
  return { home, away };
}

/** The side a sim event belongs to: the team attacking when it was emitted. */
export function feedEventSide(ev) {
  return ev?.possession === "home" || ev?.possession === "away" ? ev.possession : null;
}

/** Made-shot text already ends with "78-75"; the score chip replaces it. */
export function stripTrailingScore(text) {
  return String(text || "").replace(/\s*\d+\s*[-–]\s*\d+\s*$/, "");
}

/** "Q3 5:24" / "OT 1:03" prefix for a feed row. */
export function clockLabel(ev) {
  if (!ev || ev.quarter == null || ev.clock == null) return "";
  const s = Math.max(0, Math.floor(ev.clock));
  const clock = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  return `${ev.quarter > 4 ? "OT" : `Q${ev.quarter}`} ${clock}`;
}
