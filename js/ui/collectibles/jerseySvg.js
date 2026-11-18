/**
 * Original 2D jersey art (J2 placeholder): a silhouette FAMILY + colours + number, drawn as SVG. One function renders every
 * jersey in the game, so adding a jersey is data, not another picture. No logos, no wordmarks, no signatures.
 *
 * A template with `number: null` (an exchange jersey: the data states no number) draws none rather than a guessed one.
 * Pure: returns a string, no DOM, no storage.
 */
import { UNIFORM_FAMILIES } from "../../collectibles/jerseyEras.js";
import { esc } from "../../core/html.js";

const HEX = /^#[0-9a-fA-F]{3,8}$/;
const colour = (c, fallback) => (typeof c === "string" && HEX.test(c) ? c : fallback);
const num = (n) => Math.round(n * 10) / 10;

/** The jersey + shorts as a standalone SVG (viewBox 0 0 64 96). */
export function jerseySvg(template, { size = 96, label = "" } = {}) {
  const fam = UNIFORM_FAMILIES[template?.family] || UNIFORM_FAMILIES.oversized_2000s;
  const primary = colour(template?.colors?.primary, "#1A3A2A");
  const secondary = colour(template?.colors?.secondary, "#F3EFE4");
  const trim = colour(template?.colors?.trim, "#FFFFFF");

  const hw = 11 + 9 * fam.body; // half chest width
  const sx = hw * 0.62; // strap outer offset
  const strap = 3 + 4 * fam.armhole;
  const body = `M${num(32 - sx)} 6 L${num(32 - sx + strap)} 6 Q32 24 ${num(32 + sx - strap)} 6 L${num(32 + sx)} 6 L${num(32 + hw)} 24 L${num(32 + hw - 1)} 56 L${num(32 - hw + 1)} 56 L${num(32 - hw)} 24 Z`;
  const sw = hw * (0.78 + 0.2 * fam.shorts); // shorts half width
  const len = 12 + 18 * fam.shorts;
  const shorts = `M${num(32 - sw)} 58 H${num(32 + sw)} V${num(58 + len)} H35 V${num(58 + len - 8)} H29 V${num(58 + len)} H${num(32 - sw)} Z`;
  const text = String(template?.number ?? "").slice(0, 2);
  const shown = text && /^[0-9]{1,2}$/.test(text);
  const name = label || template?.label?.zh || template?.playerName || "";

  return `<svg class="jersey-svg" viewBox="0 0 64 96" width="${size * (2 / 3)}" height="${size}" role="img" aria-label="${esc(name)}">
    <path d="${shorts}" fill="${secondary}" stroke="#1a1a1a" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="${body}" fill="${primary}" stroke="#1a1a1a" stroke-width="1.2" stroke-linejoin="round"/>
    <path d="M${num(32 - sx + strap)} 6 Q32 24 ${num(32 + sx - strap)} 6" fill="none" stroke="${trim}" stroke-width="1.6"/>
    <path d="M${num(32 - sx)} 6 L${num(32 - hw)} 24 M${num(32 + sx)} 6 L${num(32 + hw)} 24" fill="none" stroke="${trim}" stroke-width="1.6"/>
    <path d="M${num(32 - hw + 1)} 56 H${num(32 + hw - 1)}" stroke="${trim}" stroke-width="1.4"/>
    ${shown ? `<text x="32" y="43" text-anchor="middle" font-family="Impact, 'Arial Black', sans-serif" font-size="${text.length > 1 ? 17 : 20}" fill="${trim}" stroke="${secondary}" stroke-width="0.8" paint-order="stroke">${esc(text)}</text>` : ""}
  </svg>`;
}
