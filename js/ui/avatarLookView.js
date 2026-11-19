/**
 * "Edit look" panel (ADR-008a N-1f step 2): pure HTML, no DOM, no storage. It has no stage of its own: the live 3D figure is
 * the hero's showcase (#mw-showcase-stage), so the player watches every swatch change it. The swatches still work and still
 * save when the 3D figure can't load.
 */
import { PORTRAIT_PRESETS } from "../data/avatarPortrait.js";
import { presetPortraitUri } from "./avatarPortraitArt.js";
import { BODY_PRESETS, FIGURE_STYLES, HAIR_COLORS, HAIR_STYLES, OUTFIT_CUTS, OUTFITS, PRESENTATIONS, SKIN_TONES, sanitizeLook } from "../data/avatarLook.js";
import { AGE } from "../data/avatarAge.js";
import { HEIGHT_CM, SLIDER, buildFromShape } from "../data/avatarBuild.js";
import { AVATAR_ACTIONS } from "./avatar3d.js";
import { esc } from "../core/html.js";
import { TL } from "../i18n.js";


/** The five pages of the editor. Every control sits on exactly one of them. */
export const LOOK_TABS = Object.freeze([
  { id: "identity", zh: "身份", en: "Identity" },
  { id: "face", zh: "面部", en: "Face" },
  { id: "body", zh: "身材", en: "Body" },
  { id: "hair", zh: "发型", en: "Hair" },
  { id: "outfit", zh: "服装", en: "Outfit" },
]);

const GROUPS = [
  { tab: "identity", key: "presentation", zh: "角色形象", en: "Character", items: PRESENTATIONS, swatch: null },
  { tab: "identity", key: "figure", zh: "形象风格", en: "Character style", items: FIGURE_STYLES, swatch: null },
  { tab: "identity", key: "skin", zh: "肤色", en: "Skin", items: SKIN_TONES, swatch: (i) => i.hex },
  { tab: "hair", key: "style", zh: "发型", en: "Hairstyle", items: HAIR_STYLES, swatch: null },
  { tab: "hair", key: "hair", zh: "发色", en: "Hair", items: HAIR_COLORS, swatch: (i) => i.hex },
  { tab: "outfit", key: "cut", zh: "服装款式", en: "Outfit cut", items: OUTFIT_CUTS, swatch: null },
  { tab: "outfit", key: "outfit", zh: "服装配色", en: "Outfit colours", items: OUTFITS, swatch: (i) => `linear-gradient(135deg, ${i.shirt} 50%, ${i.pants} 50%)` },
  { tab: "body", key: "body", zh: "体型预设", en: "Build preset", items: BODY_PRESETS, swatch: null },
];

/** The five build sliders: what each one moves, in the editor's words. `unit` is shown after the number. */
const BUILD_SLIDERS = Object.freeze([
  { key: "height", zh: "身高", en: "Height", min: HEIGHT_CM.min, max: HEIGHT_CM.max, unit: "cm" },
  { key: "shoulders", zh: "肩宽", en: "Shoulders", min: SLIDER.min, max: SLIDER.max, unit: "" },
  { key: "waist", zh: "腰围", en: "Waist", min: SLIDER.min, max: SLIDER.max, unit: "" },
  { key: "arms", zh: "手臂粗细", en: "Arms", min: SLIDER.min, max: SLIDER.max, unit: "" },
  { key: "legs", zh: "腿部粗细", en: "Legs", min: SLIDER.min, max: SLIDER.max, unit: "" },
]);

/** What the sliders show: the look's own build if it has one, else the figure its preset draws (so the editor opens on what you see). */
export function effectiveBuild(rawLook) {
  const look = sanitizeLook(rawLook);
  return look.build || buildFromShape(BODY_PRESETS.find((b) => b.id === look.body)?.shape);
}

/** Preview actions (W3 slice): the model's own celebration/sitting clips. Disabled until the 3D figure loads — the screen enables them, exactly like the "use my 3D look" button. */
function actionsHtml(lang) {
  return `<fieldset class="mw-swatches mw-actions" data-mw-avatar-actions>
    <legend>${TL(lang, "动作预览", "Preview actions")}</legend>
    ${AVATAR_ACTIONS.map((a) => `<button type="button" class="btn ghost" data-mw-action="avatar-action-${a.id}" disabled>${esc(TL(lang, a.zh, a.en))}</button>`).join("")}
    <button type="button" class="btn ghost" data-mw-action="avatar-idle" disabled>${TL(lang, "站好", "Stand")}</button>
    <p class="mw-note">${TL(lang, "3D 形象加载成功后可用；只是预览动作，不影响任何比赛能力。", "Available once the 3D figure loads; just a preview, it never changes any ability.")}</p>
  </fieldset>`;
}

/** Which radio is checked. For the character the radio shows what is DRAWN: a saved presentation with no art yet is drawn as male, so Male is checked (the save is untouched). */
const chosenId = (group, look) => {
  if (group.key !== "presentation") return look[group.key] ?? null;
  const saved = PRESENTATIONS.find((p) => p.id === look.presentation);
  return saved?.art ? saved.id : "male";
};

const groupHtml = (group, look, lang, ownedOutfits = null) => `<fieldset class="mw-swatches" data-mw-look-group="${group.key}">
    <legend>${TL(lang, group.zh, group.en)}</legend>
    ${group.items.map((item) => {
      // Shop-exclusive outfits (item.shop) render locked until owned, so the shop
      // purchase is real: without this the outfit would be pickable here for free.
      const shopLocked = group.key === "outfit" && item.shop && ownedOutfits !== null && !ownedOutfits.includes(item.id);
      const artLocked = group.key === "presentation" && !item.art;   // declared, but there is no art for it yet: shown, honest, not selectable
      const locked = shopLocked || artLocked;
      return `<label class="mw-swatch${group.swatch ? "" : " is-text"}${locked ? " is-locked" : ""}" title="${esc(artLocked ? TL(lang, "美术制作中，暂时不能选", "Art in production, not selectable yet") : shopLocked ? TL(lang, "商城有售", "Available in the Shop") : TL(lang, item.zh, item.en))}">
      <input type="radio" name="mw-look-${group.key}" value="${item.id}" ${chosenId(group, look) === item.id ? "checked" : ""}${locked ? " disabled" : ""} />
      ${group.swatch ? `<span class="mw-swatch-dot" style="background:${group.swatch(item)}"></span>` : ""}
      <span class="mw-swatch-name">${esc(TL(lang, item.zh, item.en))}${locked ? ` <span class="mw-swatch-lock">${esc(artLocked ? TL(lang, "制作中", "Soon") : TL(lang, "商城", "Shop"))}</span>` : ""}</span>
    </label>`;
    }).join("")}
  </fieldset>`;

/** Profile-picture chooser: the preset busts, plus "use my 3D look" (enabled by the screen once the 3D figure is up). */
function portraitHtml(portrait, lang) {
  const picked = portrait?.kind === "preset" && portrait.chosen ? portrait.presetId : null;
  const is3d = portrait?.kind === "3d";
  const isPhoto = portrait?.kind === "photo";
  const note = portrait?.stale
    ? TL(lang, "外观改过了，旧的 3D 头像已不再显示；点下面的按钮重新用当前形象。", "Your look changed, so the old 3D picture is hidden. Use the button below to take a new one.")
    : TL(lang, "3D 头像是实验功能（人物模型正在重做），建议先用上面的插画头像。", "The 3D picture is experimental (the character model is being redone); the illustrations above are the recommended choice.");
  return `<fieldset class="mw-swatches mw-portraits" data-mw-portrait-group>
    <legend>${TL(lang, "头像", "Profile picture")}</legend>
    ${PORTRAIT_PRESETS.map((p) => `<label class="mw-portrait-opt" title="${esc(TL(lang, p.zh, p.en))}">
      <input type="radio" name="mw-portrait" value="${p.id}" ${picked === p.id ? "checked" : ""} />
      <img src="${presetPortraitUri(p)}" alt="${esc(TL(lang, p.zh, p.en))}" width="44" height="44" />
    </label>`).join("")}
    <button type="button" class="btn ghost mw-use3d" data-mw-action="use-3d-portrait" aria-pressed="${is3d}" disabled>${TL(lang, is3d ? "✓ 正在使用我的 3D 形象" : "用我的 3D 形象作头像", is3d ? "✓ Using my 3D look" : "Use my 3D look")}</button>
    <button type="button" class="btn ghost mw-photo-btn" data-mw-action="pick-photo" aria-pressed="${isPhoto}">${TL(lang, isPhoto ? "✓ 正在使用我的照片（点此更换）" : "上传我的照片", isPhoto ? "✓ Using my photo (tap to change)" : "Upload my photo")}</button>
    <input type="file" class="mw-photo-input" id="mw-photo-input" accept="image/png,image/jpeg,image/webp" hidden />
    <p class="mw-note">${note} ${TL(lang, "照片只在这台设备上裁成方形保存，不会上传。", "A photo is cropped to a square and kept on this device only; it is never uploaded.")}</p>
  </fieldset>`;
}

const sliderHtml = (def, value, lang) => `<label class="mw-slider">
      <span class="mw-slider-name">${esc(TL(lang, def.zh, def.en))}</span>
      <input type="range" name="mw-build-${def.key}" data-key="${def.key}" min="${def.min}" max="${def.max}" step="1" value="${value}" aria-label="${esc(TL(lang, def.zh, def.en))}" />
      <output class="mw-slider-value" data-out="${def.key}">${value}${def.unit ? ` ${def.unit}` : ""}</output>
    </label>`;

const groupsOf = (tab, look, lang, ownedOutfits) => GROUPS.filter((g) => g.tab === tab).map((g) => groupHtml(g, look, lang, ownedOutfits)).join("");

/** Identity: who the figure is (character, style, skin) and how old it looks. The look's age is separate from a career's real age. */
function identityPane(look, lang, ownedOutfits) {
  const age = look.appearanceAge ?? AGE.default;
  return `${groupsOf("identity", look, lang, ownedOutfits)}
    <fieldset class="mw-swatches mw-age" data-mw-age>
      <legend>${TL(lang, "外观年龄", "Appearance age")}</legend>
      <label class="mw-slider">
        <span class="mw-slider-name">${TL(lang, "年龄", "Age")}</span>
        <input type="range" name="mw-age" min="${AGE.min}" max="${AGE.max}" step="1" value="${age}" aria-label="${TL(lang, "外观年龄", "Appearance age")}" />
        <output class="mw-slider-value" data-out="age">${age}</output>
      </label>
      <p class="mw-note">${TL(lang, "现在只会让头发和眉毛逐渐变灰白（约 35 岁起）；皱纹、肤质和发际线需要新的美术，还没有。它和生涯里的真实年龄无关。", "For now this only turns the hair and eyebrows grey (from about 35). Wrinkles, skin and hairline need new art that does not exist yet. It is separate from a career's real age.")}</p>
    </fieldset>`;
}

/** Face: there is nothing to adjust yet, and the page says so rather than offering sliders that do nothing. */
function facePane(lang) {
  return `<fieldset class="mw-swatches mw-face">
      <legend>${TL(lang, "面部", "Face")}</legend>
      <p class="mw-note">${TL(lang, "五官定制要把眼睛、眉毛、鼻子、嘴和下颌拆成各自的美术层；现在整张脸是一张图，所以还没有可调的选项，也不放没有效果的滑杆。", "Face editing needs the eyes, brows, nose, mouth and jaw as separate art layers. Today the face is one picture, so there is nothing to adjust yet, and no sliders that do nothing.")}</p>
      <p class="mw-note">${TL(lang, "已经能用的：肤色在“身份”页，发色和眉毛颜色在“发型”页，眉毛会随外观年龄变灰。", "Already available: skin tone on the Identity page, hair and eyebrow colour on the Hair page; the eyebrows grey with appearance age.")}</p>
    </fieldset>`;
}

/** Body: the preset buttons plus the five sliders. The sliders open on the figure you see; the first drag makes the build your own. */
function bodyPane(look, lang, ownedOutfits) {
  const build = effectiveBuild(look);
  return `${groupsOf("body", look, lang, ownedOutfits)}
    <fieldset class="mw-swatches mw-build" data-mw-build>
      <legend>${TL(lang, "身材调整", "Body sliders")}</legend>
      ${BUILD_SLIDERS.map((def) => sliderHtml(def, build[def.key], lang)).join("")}
      <div class="mw-build-foot">
        <button type="button" class="btn ghost" data-mw-action="reset-build">${TL(lang, "恢复默认", "Reset")}</button>
        <span class="mw-build-state" id="mw-build-state" role="status">${look.build ? TL(lang, "自定义身材", "Custom build") : ""}</span>
      </div>
      <p class="mw-note">${TL(lang, "身高只是外观比例，不会改变比赛里的真实身高、篮板、盖帽或任何能力。滑杆画在 2D 形象上；可选的 3D 形象只用上面的体型预设。", "Height is only how the figure is drawn: it never changes in-game height, rebounding, blocking or any ability. The sliders are drawn on the 2D figure; the optional 3D figure only uses the build preset above.")}</p>
    </fieldset>`;
}

function tabsHtml(look, lang, ownedOutfits) {
  const panes = {
    identity: identityPane(look, lang, ownedOutfits),
    face: facePane(lang),
    body: bodyPane(look, lang, ownedOutfits),
    hair: groupsOf("hair", look, lang, ownedOutfits),
    outfit: groupsOf("outfit", look, lang, ownedOutfits),
  };
  return `<div class="mw-tabs" role="tablist" aria-label="${TL(lang, "形象分页", "Look pages")}">
      ${LOOK_TABS.map((t, i) => `<button type="button" role="tab" class="mw-tab" id="mw-tab-${t.id}" data-mw-action="look-tab" data-tab="${t.id}" aria-controls="mw-pane-${t.id}" aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">${TL(lang, t.zh, t.en)}</button>`).join("")}
    </div>
    ${LOOK_TABS.map((t, i) => `<div class="mw-pane" role="tabpanel" id="mw-pane-${t.id}" data-mw-pane="${t.id}" aria-labelledby="mw-tab-${t.id}"${i === 0 ? "" : " hidden"}>${panes[t.id]}</div>`).join("")}`;
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
  return `<section class="mw-look" id="mw-look" aria-label="${TL(lang, "编辑形象", "Edit look")}" hidden>
    <div class="mw-look-head">
      <h3>${TL(lang, "编辑形象", "Edit look")}</h3>
      <button type="button" class="btn small mw-gold" data-mw-action="close-look">${TL(lang, "完成", "Done")}</button>
    </div>
    <div class="mw-look-controls">
      ${tabsHtml(look, lang, ownedOutfits)}
      ${actionsHtml(lang)}
      ${portraitHtml(portrait, lang)}
      <p class="mw-note">${TL(lang, "只是外观，不影响任何比赛能力。左边的形象会实时变化，拖动可以旋转。", "Cosmetic only; it never changes any ability. The figure beside it updates live; drag it to turn.")}</p>
      <p class="mw-status" id="mw-look-status" role="status" aria-live="polite"></p>
    </div>
  </section>`;
}
