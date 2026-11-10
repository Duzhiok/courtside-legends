/**
 * Preset portrait art (ADR-008a addendum W1): small hand-drawn SVG busts, deterministic, no network, no real person.
 * Every value interpolated into the SVG comes from the frozen PORTRAIT_PRESETS / colour tables, never from user input.
 */
import { HAIR_COLORS, SKIN_TONES } from "../data/avatarLook.js";
import { PORTRAIT_PRESETS } from "../data/avatarPortrait.js";

const SIZE = 96;
const hex = (list, id) => (list.find((i) => i.id === id) || list[0]).hex;

const HAIR_BACK = { round: (c) => `<ellipse cx="48" cy="30" rx="22" ry="20" fill="${c}"/>` };
const HAIR_FRONT = {
  short: (c) => `<path d="M31 39C30 21 40 16 48 16C58 16 67 21 65 39C62 31 56 27 48 27C40 27 34 31 31 39Z" fill="${c}"/>`,
  round: (c) => `<path d="M32 36C36 28 42 26 48 26C54 26 60 28 64 36C58 31 38 31 32 36Z" fill="${c}"/>`,
  shaved: (c) => `<path d="M31 39C30 21 40 16 48 16C58 16 67 21 65 39C62 31 56 27 48 27C40 27 34 31 31 39Z" fill="${c}" opacity=".28"/>`,
};

export function presetPortraitSvg(preset) {
  const p = PORTRAIT_PRESETS.find((x) => x.id === preset?.id) || PORTRAIT_PRESETS[0];
  const skin = hex(SKIN_TONES, p.skin);
  const hair = hex(HAIR_COLORS, p.hair);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}">
<defs><clipPath id="c"><circle cx="48" cy="48" r="48"/></clipPath></defs>
<g clip-path="url(#c)"><rect width="${SIZE}" height="${SIZE}" fill="${p.bg}"/>
<path d="M6 100C6 76 26 68 48 68C70 68 90 76 90 100Z" fill="${p.shirt}"/>
${HAIR_BACK[p.cut]?.(hair) || ""}
<rect x="41" y="52" width="14" height="20" rx="5" fill="${skin}"/>
<ellipse cx="48" cy="41" rx="17" ry="20" fill="${skin}"/>
${HAIR_FRONT[p.cut](hair)}
<circle cx="41" cy="43" r="1.9" fill="#1b1b1b"/><circle cx="55" cy="43" r="1.9" fill="#1b1b1b"/>
<path d="M43 51Q48 55 53 51" fill="none" stroke="#1b1b1b" stroke-width="1.6" stroke-linecap="round"/></g></svg>`;
}

export const presetPortraitUri = (preset) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(presetPortraitSvg(preset))}`;

/** <img src> for a resolvePortrait() result. */
export function portraitSrc(resolved) {
  if ((resolved.kind === "3d" || resolved.kind === "photo") && resolved.image) return resolved.image;
  return presetPortraitUri(PORTRAIT_PRESETS.find((p) => p.id === resolved.presetId));
}
