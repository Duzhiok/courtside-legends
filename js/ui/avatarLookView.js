/**
 * "Edit look" panel (ADR-008a N-1f step 2): pure HTML, no DOM, no storage. It has no stage of its own: the live 3D figure is
 * the hero's showcase (#mw-showcase-stage), so the player watches every swatch change it. The swatches still work and still
 * save when the 3D figure can't load.
 */
import { PORTRAIT_PRESETS } from "../data/avatarPortrait.js";
import { presetPortraitUri } from "./avatarPortraitArt.js";
import { BODY_PRESETS, FIGURE_STYLES, HAIR_COLORS, HAIR_STYLES, OUTFIT_CUTS, OUTFITS, SKIN_TONES, sanitizeLook } from "../data/avatarLook.js";
import { AVATAR_ACTIONS } from "./avatar3d.js";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const T = (lang, zh, en) => (lang === "en" ? en : zh);

const GROUPS = [
  { key: "figure", zh: "形象风格", en: "Character style", items: FIGURE_STYLES, swatch: null },
  { key: "skin", zh: "肤色", en: "Skin", items: SKIN_TONES, swatch: (i) => i.hex },
  { key: "style", zh: "发型", en: "Hairstyle", items: HAIR_STYLES, swatch: null },
  { key: "hair", zh: "发色", en: "Hair", items: HAIR_COLORS, swatch: (i) => i.hex },
  { key: "cut", zh: "服装款式", en: "Outfit cut", items: OUTFIT_CUTS, swatch: null },
  { key: "outfit", zh: "服装配色", en: "Outfit colours", items: OUTFITS, swatch: (i) => `linear-gradient(135deg, ${i.shirt} 50%, ${i.pants} 50%)` },
  { key: "body", zh: "体型", en: "Build", items: BODY_PRESETS, swatch: null },
];

/** Preview actions (W3 slice): the model's own celebration/sitting clips. Disabled until the 3D figure loads — the screen enables them, exactly like the "use my 3D look" button. */
function actionsHtml(lang) {
  return `<fieldset class="mw-swatches mw-actions" data-mw-avatar-actions>
    <legend>${T(lang, "动作预览", "Preview actions")}</legend>
    ${AVATAR_ACTIONS.map((a) => `<button type="button" class="btn ghost" data-mw-action="avatar-action-${a.id}" disabled>${esc(T(lang, a.zh, a.en))}</button>`).join("")}
    <button type="button" class="btn ghost" data-mw-action="avatar-idle" disabled>${T(lang, "站好", "Stand")}</button>
    <p class="mw-note">${T(lang, "3D 形象加载成功后可用；只是预览动作，不影响任何比赛能力。", "Available once the 3D figure loads; just a preview, it never changes any ability.")}</p>
  </fieldset>`;
}

const groupHtml = (group, look, lang, ownedOutfits = null) => `<fieldset class="mw-swatches" data-mw-look-group="${group.key}">
    <legend>${T(lang, group.zh, group.en)}</legend>
    ${group.items.map((item) => {
      // Shop-exclusive outfits (item.shop) render locked until owned, so the shop
      // purchase is real: without this the outfit would be pickable here for free.
      const locked = group.key === "outfit" && item.shop && ownedOutfits !== null && !ownedOutfits.includes(item.id);
      return `<label class="mw-swatch${group.swatch ? "" : " is-text"}${locked ? " is-locked" : ""}" title="${esc(locked ? T(lang, "商城有售", "Available in the Shop") : T(lang, item.zh, item.en))}">
      <input type="radio" name="mw-look-${group.key}" value="${item.id}" ${look[group.key] === item.id ? "checked" : ""}${locked ? " disabled" : ""} />
      ${group.swatch ? `<span class="mw-swatch-dot" style="background:${group.swatch(item)}"></span>` : ""}
      <span class="mw-swatch-name">${esc(T(lang, item.zh, item.en))}${locked ? ` <span class="mw-swatch-lock">${esc(T(lang, "商城", "Shop"))}</span>` : ""}</span>
    </label>`;
    }).join("")}
  </fieldset>`;

/** Profile-picture chooser: the preset busts, plus "use my 3D look" (enabled by the screen once the 3D figure is up). */
function portraitHtml(portrait, lang) {
  const picked = portrait?.kind === "preset" && portrait.chosen ? portrait.presetId : null;
  const is3d = portrait?.kind === "3d";
  const isPhoto = portrait?.kind === "photo";
  const note = portrait?.stale
    ? T(lang, "外观改过了，旧的 3D 头像已不再显示；点下面的按钮重新用当前形象。", "Your look changed, so the old 3D picture is hidden. Use the button below to take a new one.")
    : T(lang, "3D 头像是实验功能（人物模型正在重做），建议先用上面的插画头像。", "The 3D picture is experimental (the character model is being redone); the illustrations above are the recommended choice.");
  return `<fieldset class="mw-swatches mw-portraits" data-mw-portrait-group>
    <legend>${T(lang, "头像", "Profile picture")}</legend>
    ${PORTRAIT_PRESETS.map((p) => `<label class="mw-portrait-opt" title="${esc(T(lang, p.zh, p.en))}">
      <input type="radio" name="mw-portrait" value="${p.id}" ${picked === p.id ? "checked" : ""} />
      <img src="${presetPortraitUri(p)}" alt="${esc(T(lang, p.zh, p.en))}" width="44" height="44" />
    </label>`).join("")}
    <button type="button" class="btn ghost mw-use3d" data-mw-action="use-3d-portrait" aria-pressed="${is3d}" disabled>${T(lang, is3d ? "✓ 正在使用我的 3D 形象" : "用我的 3D 形象作头像", is3d ? "✓ Using my 3D look" : "Use my 3D look")}</button>
    <button type="button" class="btn ghost mw-photo-btn" data-mw-action="pick-photo" aria-pressed="${isPhoto}">${T(lang, isPhoto ? "✓ 正在使用我的照片（点此更换）" : "上传我的照片", isPhoto ? "✓ Using my photo (tap to change)" : "Upload my photo")}</button>
    <input type="file" class="mw-photo-input" id="mw-photo-input" accept="image/png,image/jpeg,image/webp" hidden />
    <p class="mw-note">${note} ${T(lang, "照片只在这台设备上裁成方形保存，不会上传。", "A photo is cropped to a square and kept on this device only; it is never uploaded.")}</p>
  </fieldset>`;
}

/**
 * The avatar customizer (all outfit / body / hair / skin / style / figure options).
 *
 * @param {string[]|null} ownedOutfits — shop-owned outfit ids; null disables shop
 *   locking (backward-compatible for callers that don't know the shop), while a list
 *   locks every shop-exclusive outfit not in it (disabled radio + "商城" tag).
 */
export function lookPanelHtml(rawLook, name, lang, portrait = null, ownedOutfits = null) {
  const look = sanitizeLook(rawLook);
  return `<section class="mw-look" id="mw-look" aria-label="${T(lang, "编辑形象", "Edit look")}" hidden>
    <div class="mw-look-head">
      <h3>${T(lang, "编辑形象", "Edit look")}</h3>
      <button type="button" class="btn small mw-gold" data-mw-action="close-look">${T(lang, "完成", "Done")}</button>
    </div>
    <div class="mw-look-controls">
      ${GROUPS.map((g) => groupHtml(g, look, lang, ownedOutfits)).join("")}
      ${actionsHtml(lang)}
      ${portraitHtml(portrait, lang)}
      <p class="mw-note">${T(lang, "只是外观，不影响任何比赛能力。左边的形象会实时变化，拖动可以旋转。", "Cosmetic only; it never changes any ability. The figure beside it updates live; drag it to turn.")}</p>
      <p class="mw-status" id="mw-look-status" role="status" aria-live="polite"></p>
    </div>
  </section>`;
}
