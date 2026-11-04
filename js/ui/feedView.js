import { teamColors } from "../data/teamColors.js";
import { FRANCHISES } from "../data/franchises.js";
import { feedEventTier } from "./feedTier.js";
import { legendCardHtml } from "./feedLegend.js";

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
/** A named team (real/historical franchise) as opposed to an ad-hoc 联队 whose "code" is only a
 *  plurality guess over its starters' own teams — that guess is not any one player's real team. */
export function isNamedTeam(team) {
  return !!(team && ((team.code && teamColors(team.code)) || team.teamCode || team.franchiseId));
}

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
  // R134: the code is now printed as literal text on every feed row (teamChipHtml), not just
  // used to pick a dot colour. Two ad-hoc all-era squads both fall back to the same generic
  // code ("NBA" from NEUTRAL_TEAMS) far more often than two REAL franchises ever share one —
  // and "NBA" vs "NBA" on two differently-coloured chips reads as a typo, not as two teams.
  // H/A is lang-neutral (already sim.js's own English fallback for this exact situation) and
  // only kicks in on that collision; real matchups keep their real codes untouched.
  if (home.code === away.code) {
    home.code = "H";
    away.code = "A";
  }
  // A 联队's guessed code (e.g. CHI over a squad whose Shaq card is a MIA season) names no real
  // team, so it prints the side instead; real teams keep their code. Colour is unchanged.
  if (!isNamedTeam(homeTeam)) home.code = "H";
  if (!isNamedTeam(awayTeam)) away.code = "A";
  for (const side of [home, away]) side.text = readableTextColor(side.color);
  return { home, away };
}

/**
 * The side a sim event belongs to: the team attacking when it was emitted -- except a block, which belongs
 * to the BLOCKER (meta.block.side). The sim emits it while the other team is attacking, and the row's
 * chip, colour and avatar must all describe the same player.
 */
export function feedEventSide(ev) {
  const blocker = ev?.meta?.block?.side;
  if (blocker === "home" || blocker === "away") return blocker;
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

/**
 * Feed redesign (R134-code): the old row stacked FOUR signals for one bit of
 * information (which team) — a coloured left border, a tinted background, text
 * painted in the team's raw colour, AND a "主/客" label — plus a legend bar above
 * the feed just to explain the colours. Busy, and team colours that are dark
 * (Spurs black, Nets black) still read badly as BODY TEXT even after the
 * contrast-corrected tint.
 *
 * New rule: ONE unambiguous identity marker per row — a solid team-code chip
 * ("LAL", not an unlabelled dot) — plus a thin border for fast scanning. Body
 * text stays one neutral, always-readable colour. No legend needed: the chip
 * already says which team in letters, and its colour matches the scoreboard
 * header above the court (same resolveMatchColors() call), so the mapping is
 * free to learn by just glancing up once.
 */
const escText = (s) => String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]);

/** Which of near-black/white reads better as TEXT painted on a chip whose background is the
 *  team's own (often saturated) colour — not the feed's dark background, readableTextColor()
 *  already covers that case for body text. */
export function chipTextOn(hex) {
  return contrastRatio(hex, "#0b1a13") >= contrastRatio(hex, "#f4f7f2") ? "#0b1a13" : "#f4f7f2";
}

/** A solid team-code chip, e.g. "LAL" on gold. `side` is one entry of resolveMatchColors()'s
 *  { home, away } (needs .color and .code). Returns "" when there is no side to show. */
export function teamChipHtml(side) {
  if (!side?.color || !side?.code) return "";
  return `<i class="feed-chip-team" style="background:${side.color};color:${chipTextOn(side.color)}">${escText(side.code)}</i>`;
}

/**
 * The player id this row is "about", for the feed avatar — in priority order: an explicit
 * actorId (free throws, rebounds, charges — sim.js attaches this where no other field would
 * carry an id), the jump-shot shooter, the dunker, or the player flashing a signature skill.
 * Events with none of these (most "coach" lines, like substitutions) simply get no avatar.
 */
export function feedActorId(ev) {
  const m = ev?.meta;
  return m?.actorId ?? m?.shot?.shooterId ?? m?.player?.id ?? m?.skill?.playerId ?? null;
}

const AV_MARK = "\u0001";

/**
 * Escape `text` for HTML, except splice `avatarHtml` in right after the FIRST literal
 * occurrence of `actorName` — "after the name in the broadcast", per spec. Matches on the RAW
 * string before escaping, so a name with an apostrophe (De'Aaron Fox) still matches even though
 * escFn turns that apostrophe into `&#39;`. Falls back to plain escaping when there is no actor,
 * no avatar, or the name genuinely isn't in this line (e.g. a rebound credited to a player whose
 * name was shortened differently in the narrative text).
 */
export function feedTextWithAvatar(text, actorName, avatarHtml, escFn) {
  const raw = String(text ?? "");
  if (!actorName || !avatarHtml || !raw.includes(actorName)) return escFn(raw);
  return escFn(raw.replace(actorName, actorName + AV_MARK)).replace(AV_MARK, avatarHtml);
}

/**
 * Build one play-feed row. Pure given its inputs: DOM creation, live team colours
 * (resolveMatchColors) and the live actor lookup (for the avatar) stay in app.js, which is the
 * only place holding the running GameSim. Returns the pieces app.js needs to paint a <div>,
 * never the element itself — keeps this module DOM-free and unit-testable.
 *
 * @param {object} ev        the sim event ({type, text, meta, quarter, clock, score, possession})
 * @param {object} opts
 * @param {object} [opts.colors]     {home, away} from resolveMatchColors(), or null pre-tip-off
 * @param {string} [opts.actorName]  the resolved actor's display name, for the avatar splice
 * @param {string} [opts.avatarHtml] pre-built <img>/<span> markup for the actor, or null
 * @param {function} opts.escFn      the app's HTML-escaping function
 * @param {object} [opts.run]       run-tracker result for this event (B18, "10-0 run" highlight)
 * @returns {{ className: string, borderColor: string|null, html: string }}
 */
export function feedRowHtml(ev, { colors, actorName, avatarHtml, escFn, lang = "zh", run = null }) {
  const type = ev?.type;
  const side = type !== "coach" ? feedEventSide(ev) : null;
  const sideColors = side && colors ? colors[side] : null;
  const isScore = type === "score";
  if (!sideColors) {
    const kind = type === "score" ? "score" : type === "coach" ? "coach" : type === "miss" ? "miss" : type === "reb" ? "reb" : "";
    return { className: `event ${kind}`, borderColor: null, html: escFn(ev?.text) };
  }
  const meta = clockLabel(ev);
  const metaHtml = meta ? `<span class="feed-meta">${meta}</span>` : "";
  const chip =
    isScore && ev.score
      ? `<span class="feed-score"><b style="color:${colors.home.text}">${ev.score.home}</b><i>–</i><b style="color:${colors.away.text}">${ev.score.away}</b></span>`
      : "";
  const { tier, kind } = feedEventTier(ev, { run });

  if (tier === "legend") {
    return {
      className: `event tm${isScore ? " scored" : ""} tier-legend`,
      borderColor: sideColors.color,
      tint: withAlpha(sideColors.color, 0.32),
      html: legendCardHtml({
        kind, ev, run, side, chipHtml: teamChipHtml(sideColors), metaHtml, scoreHtml: chip,
        actorName, avatarHtml, escFn, lang,
      }),
    };
  }

  const body = feedTextWithAvatar(ev?.text, actorName, avatarHtml, escFn);
  const bodyText = isScore ? stripTrailingScore(body) : body;
  const sub = isScore ? scoreSubLabel(ev, lang) : "";
  const text = `<span class="feed-text">${bodyText}</span>`;
  const html =
    teamChipHtml(sideColors) +
    metaHtml +
    // With a sub-line the score chip rides on THAT line (right-aligned) instead of wrapping onto a
    // third row of its own on a narrow screen -- plain rows must stay the quietest thing in the feed.
    (sub
      ? `<span class="feed-main">${text}<span class="feed-subline"><span class="feed-sub">${escFn(sub)}</span>${chip}</span></span>`
      : text + chip);
  return {
    className: `event tm${isScore ? " scored" : ""}${tier === "normal" ? "" : ` tier-${tier}`}`,
    borderColor: sideColors.color,
    tint: tier === "normal" ? null : withAlpha(sideColors.color, 0.16),
    html,
  };
}

/** The muted second line under a made shot, e.g. "三分命中 · +3". Only when the points are actually known. */
export function scoreSubLabel(ev, lang = "zh") {
  const pts = ev?.meta?.shot?.made ? ev.meta.shot.pts : 0;
  if (pts !== 2 && pts !== 3) return "";
  const en = lang === "en";
  if (pts === 3) return en ? "Three-pointer · +3" : "三分命中 · +3";
  return en ? "Field goal · +2" : "普通得分 · +2";
}
