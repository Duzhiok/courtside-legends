/**
 * Generated avatars for cards that have no licensed photo or local illustration.
 *
 * A neutral head-and-shoulders silhouette on the team's colours, wearing a jersey with
 * the player's initials where a number would be (the roster has no jersey numbers, and
 * we do not invent one). It depicts nobody: one fixed silhouette, no skin tone, no hair,
 * no logos. Pure and deterministic; nothing is fetched from anywhere.
 */
import { teamColors } from "./teamColors.js";

const NAME_SUFFIXES = new Set(["JR", "JR.", "SR", "SR.", "II", "III", "IV", "V"]);

/** "Jeremy Lamb" → "JL", "Karl-Anthony Towns" → "KT", "Nene" → "NE", "姚明" → "姚明". */
export function initialsOf(name) {
  const words = String(name || "")
    .replace(/[()]/g, " ")
    .split(/\s+/)
    .filter((word) => word && !NAME_SUFFIXES.has(word.toUpperCase()));
  if (!words.length) return "?";
  const first = [...words[0]];
  if (words.length === 1) return first.slice(0, 2).join("").toUpperCase();
  const lastWord = words[words.length - 1];
  return (first[0] + [...lastWord][0]).toUpperCase();
}

const channel = (value) => {
  const s = value / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};

function luminance(hex) {
  const n = parseInt(hex.slice(1), 16);
  return 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

export function contrastRatio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Whichever of near-black / white reads better on this colour. */
export function inkOn(hex) {
  return contrastRatio(hex, "#111111") >= contrastRatio(hex, "#FFFFFF") ? "#111111" : "#FFFFFF";
}

function shade(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c) => Math.max(0, Math.min(255, Math.round(c + (amount < 0 ? c : 255 - c) * amount)));
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(mix);
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

const toRgb = (hex) => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};
const toHex = (rgb) => `#${rgb.map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;
const blend = (base, over, alpha) => toHex(toRgb(base).map((c, i) => c * (1 - alpha) + toRgb(over)[i] * alpha));

/**
 * The head is a translucent overlay on the background. Whichever of a dark or a light
 * overlay contrasts more with the colour behind the head wins — a fixed dark head vanished
 * on navy and black teams. The gradient is ~30% of the way to its dark end by head height.
 */
export function headOverlay(primary, deep) {
  const behind = blend(primary, deep, 0.3);
  const options = [
    { fill: "#000000", opacity: 0.34 },
    { fill: "#FFFFFF", opacity: 0.22 },
  ].map((o) => ({ ...o, ratio: contrastRatio(behind, blend(behind, o.fill, o.opacity)) }));
  return options.sort((a, b) => b.ratio - a.ratio)[0];
}

const escapeXml = (text) => String(text).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[c]);

const isCjk = (text) => /[\u3400-\u9fff]/.test(text);

export function avatarSvg(player) {
  const { primary, secondary } = teamColors(player?.team);
  const letters = initialsOf(player?.name);
  const initials = escapeXml(letters);
  const deep = shade(primary, -0.45);
  const head = headOverlay(primary, deep);
  // Cards are shown in circles on phones: keep everything inside the middle ~80%.
  const fontSize = isCjk(letters) ? 19 : 23;
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120">',
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${primary}"/><stop offset="1" stop-color="${deep}"/></linearGradient></defs>`,
    '<rect width="120" height="120" fill="url(#g)"/>',
    `<circle cx="60" cy="38" r="17" fill="${head.fill}" fill-opacity="${head.opacity}"/>`,
    `<path d="M16 120C16 84 34 66 60 66s44 18 44 54z" fill="${secondary}"/>`,
    `<path d="M49 66l11 9 11-9z" fill="${deep}"/>`,
    `<text x="60" y="101" text-anchor="middle" font-family="system-ui,-apple-system,Segoe UI,Roboto,sans-serif" font-size="${fontSize}" font-weight="800" fill="${inkOn(secondary)}">${initials}</text>`,
    "</svg>",
  ].join("");
}

export function avatarDataUri(player) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarSvg(player))}`;
}
