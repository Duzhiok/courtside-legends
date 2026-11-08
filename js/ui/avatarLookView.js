/**
 * "My look" panel (ADR-008a N-1f step 2): pure HTML, no DOM, no storage. The 3D stage is mounted into
 * #mw-look-stage by myWorldScreen.js; until (or unless) it loads, the static avatar image is what the player sees,
 * and the swatches still work and still save.
 */
import { avatarDataUri } from "../data/avatarArt.js";
import { PORTRAIT_PRESETS } from "../data/avatarPortrait.js";
import { presetPortraitUri } from "./avatarPortraitArt.js";
import { HAIR_COLORS, HAIR_STYLES, OUTFITS, SKIN_TONES, sanitizeLook } from "../data/avatarLook.js";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const T = (lang, zh, en) => (lang === "en" ? en : zh);

const GROUPS = [
  { key: "skin", zh: "肤色", en: "Skin", items: SKIN_TONES, swatch: (i) => i.hex },
  { key: "style", zh: "发型", en: "Hairstyle", items: HAIR_STYLES, swatch: null },
  { key: "hair", zh: "发色", en: "Hair", items: HAIR_COLORS, swatch: (i) => i.hex },
  { key: "outfit", zh: "服装", en: "Outfit", items: OUTFITS, swatch: (i) => `linear-gradient(135deg, ${i.shirt} 50%, ${i.pants} 50%)` },
];

const groupHtml = (group, look, lang) => `<fieldset class="mw-swatches" data-mw-look-group="${group.key}">
    <legend>${T(lang, group.zh, group.en)}</legend>
    ${group.items.map((item) => `<label class="mw-swatch${group.swatch ? "" : " is-text"}" title="${esc(T(lang, item.zh, item.en))}">
      <input type="radio" name="mw-look-${group.key}" value="${item.id}" ${look[group.key] === item.id ? "checked" : ""} />
      ${group.swatch ? `<span class="mw-swatch-dot" style="background:${group.swatch(item)}"></span>` : ""}
      <span class="mw-swatch-name">${esc(T(lang, item.zh, item.en))}</span>
    </label>`).join("")}
  </fieldset>`;

/** Profile-picture chooser: the preset busts, plus "use my 3D look" (enabled by the screen once the 3D figure is up). */
function portraitHtml(portrait, lang) {
  const picked = portrait?.kind === "preset" && portrait.chosen ? portrait.presetId : null;
  const is3d = portrait?.kind === "3d";
  const note = portrait?.stale
    ? T(lang, "外观改过了，旧的 3D 头像已不再显示；点下面的按钮重新用当前形象。", "Your look changed, so the old 3D picture is hidden. Use the button below to take a new one.")
    : T(lang, "3D 头像需要 3D 形象加载成功；不可用时仍可选预设头像。", "A 3D picture needs the 3D figure to load; presets always work.");
  return `<fieldset class="mw-swatches mw-portraits" data-mw-portrait-group>
    <legend>${T(lang, "头像", "Profile picture")}</legend>
    ${PORTRAIT_PRESETS.map((p) => `<label class="mw-portrait-opt" title="${esc(T(lang, p.zh, p.en))}">
      <input type="radio" name="mw-portrait" value="${p.id}" ${picked === p.id ? "checked" : ""} />
      <img src="${presetPortraitUri(p)}" alt="${esc(T(lang, p.zh, p.en))}" width="44" height="44" />
    </label>`).join("")}
    <button type="button" class="btn ghost mw-use3d" data-mw-action="use-3d-portrait" aria-pressed="${is3d}" disabled>${T(lang, is3d ? "✓ 正在使用我的 3D 形象" : "用我的 3D 形象作头像", is3d ? "✓ Using my 3D look" : "Use my 3D look")}</button>
    <p class="mw-note">${note}</p>
  </fieldset>`;
}

export function lookPanelHtml(rawLook, name, lang, portrait = null) {
  const look = sanitizeLook(rawLook);
  return `<section class="mw-look" id="mw-look" aria-label="${T(lang, "我的形象", "My look")}" hidden>
    <div class="mw-look-stage" id="mw-look-stage">
      <img class="mw-look-static" src="${avatarDataUri({ name: name || "Guest", team: "NBA" })}" alt="" width="120" height="120" />
    </div>
    <div class="mw-look-controls">
      <h3>${T(lang, "我的形象", "My look")}</h3>
      ${GROUPS.map((g) => groupHtml(g, look, lang)).join("")}
      ${portraitHtml(portrait, lang)}
      <p class="mw-note">${T(lang, "只是外观，不影响任何比赛能力。拖动形象可以旋转。", "Cosmetic only; it never changes any ability. Drag the figure to turn it.")}</p>
      <p class="mw-status" id="mw-look-status" role="status" aria-live="polite"></p>
    </div>
  </section>`;
}
