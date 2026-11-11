/**
 * Player Cards v2 (Workstream A, Visual Quality Standard §4–5): ONE premium reusable
 * player-card template. Pure HTML builders, no DOM — tested in isolation.
 *
 * Layered structure (background / portrait / lighting-gradient overlay / rarity frame /
 * identity info / optional effect):
 *   .player-card.card-v2[.rarity-<tier>][.legend-season][.selected][.view-only]
 *     .card-face (aspect 3/4 — the portrait dominates the card face)
 *       .photo-wrap > img.card-portrait (photoImg, same source as everywhere — swappable)
 *       .card-face-shade (bottom gradient so the info stays readable)
 *       .card-ovr (OVR badge, top-right)
 *       .card-info (name + rarity tag + season · team · pos)
 *     .card-foot? (caller-supplied management UI: chips, buttons — collection only)
 *
 * Visuals only: OVR / skills / draw odds are never changed here — the helper only
 * receives an already-computed `ovr` and displays it. The rarity tag's identity tiers
 * come from the existing playerLegacyBadge (same tiers the old template used).
 * Shine is CSS-only and limited to myth + legend frames (one-time sweep, same as the
 * existing legend-season treatment); every other tier gets a distinct static frame.
 * The card-foot is NOT part of the face: onboarding cards render face-only, the
 * collection wall adds its management strip below the face.
 */
import { photoImg } from "../data/photo.js";
import { playerLegacyBadge } from "../data/playerLegacy.js";
import { esc, T } from "./myTeamViewKit.js";

/** Rarity tier -> card frame class. "" = no tier (plain base frame). */
export function rarityFrameClass(badge) {
  const cls = badge?.cls || "";
  return cls ? `rarity-${cls}` : "";
}

/** The badge's display label in the requested language. */
export function rarityLabel(badge, lang) {
  if (!badge?.label) return "";
  return lang === "en" ? badge.labelEn || badge.label : badge.label;
}

/**
 * Career-phase labels (js/data/careerArc.js PHASE_LABEL) are Chinese-only data;
 * the card template localises them so the English UI has no Chinese residue.
 * Unknown labels pass through unchanged.
 */
const PHASE_LABEL_EN = {
  "新秀成长期": "Rising prospect",
  "上升期": "Ascending",
  "巅峰期": "Prime",
  "老将期": "Veteran",
  "生涯末期": "Late career",
};
export function careerPhaseLabelL(label, lang) {
  if (!label) return "";
  return lang === "en" ? PHASE_LABEL_EN[label] || label : label;
}

/**
 * The card face: portrait-first, identity overlaid on the bottom gradient.
 * `p` is a card-player record (same shape the old template used); `ovr` is the
 * already-computed OVR to display — it is never recomputed here.
 */
export function playerCardFaceHtml(p, { ovr, lang = "zh" } = {}) {
  const badge = playerLegacyBadge(p, ovr);
  const label = rarityLabel(badge, lang);
  const tag = label ? ` <span class="rarity-tag ${badge.cls}">${esc(label)}</span>` : "";
  const twilight = p?.twilight
    ? ` <span class="tag-twilight">${T(lang, "生涯末期", "Late career")}</span>`
    : "";
  const meta = [p?.season, p?.teamLabel || p?.team || "", p?.pos].filter(Boolean).join(" · ");
  return `<div class="card-face">${photoImg(p, "card-portrait")}<div class="card-face-shade" aria-hidden="true"></div><div class="card-ovr"><span>OVR</span><strong>${esc(ovr)}</strong></div><div class="card-info"><div class="name">${esc(p?.name)}${tag}${twilight}</div><div class="meta">${esc(meta)}</div></div></div>`;
}

/**
 * The full card. `tag` is "div" (collection) or "button" (onboarding pick);
 * `attrs` is raw attribute markup the caller is responsible for escaping
 * (e.g. `type="button" data-pick="..."`); `extra` is the optional .card-foot
 * content (collection management strip). No foot is rendered when `extra` is "".
 */
export function playerCardHtml(p, { ovr, lang = "zh", tag = "div", attrs = "", extra = "", selected = false, viewOnly = false } = {}) {
  const badge = playerLegacyBadge(p, ovr);
  const classes = [
    "player-card", "card-v2", rarityFrameClass(badge),
    badge.cardStyle ? "legend-season" : "",
    selected ? "selected" : "", viewOnly ? "view-only" : "",
  ].filter(Boolean).join(" ");
  const styleAttr = badge.cardStyle ? ` style="${badge.cardStyle}"` : "";
  const foot = extra ? `<div class="card-foot">${extra}</div>` : "";
  return `<${tag} class="${classes}"${styleAttr}${attrs ? ` ${attrs}` : ""}>${playerCardFaceHtml(p, { ovr, lang })}${foot}</${tag}>`;
}
