/**
 * Player Voice views (pure HTML builders, no DOM access): the one game-wide feedback dialog's content.
 * Type (idea / bug / rating), optional feedback module, optional 1-5 rating, a note, screenshots + one video, and a
 * local draft. "Submit" exists but stays disabled until a real transport is registered, and the panel says so plainly:
 * nothing here ever claims feedback was sent. Copy / GitHub are secondary fallbacks.
 */
import { FEEDBACK_MODULES, normalizeDraft } from "../data/feedbackDraft.js";
import { FEEDBACK_IMAGE_MAX } from "../data/feedbackImages.js";
import { FEEDBACK_VIDEO_BYTES, FEEDBACK_VIDEO_MAX } from "../data/feedbackVideo.js";

export const FEEDBACK_URL = "https://github.com/Duzhiok/courtside-legends/issues/new";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
export const T = (lang, zh, en) => (lang === "en" ? en : zh);
const kb = (n) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

const CATEGORY_LABEL = { suggestion: ["建议", "Idea"], bug: ["问题", "Bug"], rating: ["评价", "Rating"] };
const categoryLabel = (id, lang) => T(lang, ...(CATEGORY_LABEL[id] || CATEGORY_LABEL.suggestion));

export const MODULE_LABEL = {
  game: ["整个游戏", "Entire Game"],
  world: ["My World", "My World"],
  myteam: ["My Team", "My Team"],
  career: ["职业 / Reborn", "Career / Reborn"],
  gameplay: ["比赛玩法", "Gameplay"],
  custom: ["自定义 / 游乐场", "Custom / Playground"],
  account: ["账号 / 联机", "Account / Online"],
  other: ["其他", "Other"],
};
export const moduleLabel = (id, lang) => T(lang, ...(MODULE_LABEL[id] || MODULE_LABEL.game));

/** What the note box asks for, by type. */
export const notePlaceholder = (category, lang) =>
  ({
    bug: T(lang, "哪里出了问题？怎么复现？附上截图或录屏更好。", "What went wrong, and how can we reproduce it? A screenshot or recording helps."),
    rating: T(lang, "说说你对游戏的整体感受。", "Tell us how the game feels overall."),
  })[category] || T(lang, "你希望游戏还能做什么？", "What should the game do next?");

/** Plain-text feedback the player can copy. Holds only what they chose or typed, plus version info. */
export function feedbackTemplate({ note = "", category = "suggestion", module = "game", stars = 0, lang = "zh", userAgent = "", screen = "", imageCount = 0, videoCount = 0 } = {}) {
  const lines = [
    T(lang, "【Courtside Legends 玩家反馈】", "[Courtside Legends player feedback]"),
    `${T(lang, "类型", "Type")}: ${categoryLabel(category in CATEGORY_LABEL ? category : "suggestion", lang)}`,
    `${T(lang, "反馈模块", "Module")}: ${moduleLabel(module, lang)}`,
  ];
  if (screen) lines.push(`${T(lang, "所在页面", "Screen")}: ${screen}`);
  if (stars >= 1 && stars <= 5) lines.push(`${T(lang, "游戏体验评分", "Game experience rating")}: ${stars}/5`);
  lines.push(
    `${T(lang, "我的想法", "My note")}: ${String(note).trim() || T(lang, "（在这里写下你的反馈）", "(write your feedback here)")}`,
    `${T(lang, "界面语言", "UI language")}: ${lang}`,
  );
  if (userAgent) lines.push(`${T(lang, "浏览器", "Browser")}: ${userAgent}`);
  if (imageCount + videoCount > 0) {
    lines.push(T(lang, `附件：截图 ${imageCount} 张、录屏 ${videoCount} 段（复制的文字不含文件，请到 GitHub 页面再手动拖入）`, `Attachments: ${imageCount} screenshot(s), ${videoCount} video(s) (copied text does not include files; drag them into the GitHub page by hand)`));
  }
  return lines.join("\n");
}

const REASON_TEXT = {
  limit: [`已经有 ${FEEDBACK_IMAGE_MAX} 张了，先移除一张再添加`, `Already ${FEEDBACK_IMAGE_MAX} images: remove one first`],
  type: ["不是 PNG/JPEG/WebP 图片", "Not a PNG/JPEG/WebP image"],
  empty: ["文件是空的", "The file is empty"],
  huge: ["文件太大（超过 30MB）", "File too large (over 30 MB)"],
  toobig: ["压缩后仍超过 2MB，请换一张小一点的", "Still over 2 MB after shrinking; try a smaller one"],
  unreadable: ["读不出这张图片", "Could not read this image"],
};
const VIDEO_REASON_TEXT = {
  type: ["不是 MP4 / WebM 视频（手机录屏如果是 .mov，请先转成 MP4）", "Not an MP4 / WebM video (convert a phone .mov to MP4 first)"],
  empty: ["文件是空的", "The file is empty"],
  huge: [`视频超过 ${FEEDBACK_VIDEO_BYTES / 1048576}MB，请剪短或压缩后再选`, `Video is over ${FEEDBACK_VIDEO_BYTES / 1048576} MB; trim or compress it first`],
};
export function attachReasonText(reason, lang, kind = "image") {
  const table = kind === "video" ? VIDEO_REASON_TEXT : REASON_TEXT;
  const row = table[reason] || (kind === "video" ? VIDEO_REASON_TEXT.type : REASON_TEXT.unreadable);
  return T(lang, ...row);
}

/** The attachment rows: screenshot thumbnails and the one video with a real player. `urls[i]` is the object URL for list[i]. */
export function mediaListHtml(list, urls, lang) {
  return list
    .map((a, i) => {
      const url = esc(urls[i] || "");
      const isVideo = a.kind === "video";
      const preview = isVideo
        ? `<video class="pv-player" controls preload="metadata" playsinline src="${url}" aria-label="${esc(a.name)}"></video>`
        : `<img src="${url}" alt="${esc(a.name)}" />`;
      const swap = isVideo ? "pick-video" : "replace-image";
      return `<li class="pv-media${isVideo ? " pv-video" : ""}" data-id="${esc(a.id)}">
    ${preview}
    <span class="pv-media-meta"><span class="pv-media-name">${esc(a.name)}</span><small>${isVideo ? T(lang, "录屏 · ", "Video · ") : ""}${kb(a.size)}</small></span>
    <span class="pv-media-btns">
      <button type="button" class="btn small ghost" data-pv-action="${swap}" data-id="${esc(a.id)}">${T(lang, "替换", "Replace")}</button>
      <button type="button" class="btn small ghost" data-pv-action="remove-media" data-id="${esc(a.id)}" aria-label="${T(lang, "移除 ", "Remove ")}${esc(a.name)}">${T(lang, "移除", "Remove")}</button>
    </span>
  </li>`;
    })
    .join("");
}

export const attachCountText = (list, lang) => {
  const images = list.filter((a) => a.kind !== "video").length;
  const videos = list.length - images;
  return T(lang, `图片 ${images}/${FEEDBACK_IMAGE_MAX} · 视频 ${videos}/${FEEDBACK_VIDEO_MAX}`, `Images ${images}/${FEEDBACK_IMAGE_MAX} · Video ${videos}/${FEEDBACK_VIDEO_MAX}`);
};

export const ratingStateText = (stars, lang) => (stars ? `${stars}/5` : T(lang, "未评分", "Not rated"));

const starRadio = (n, stars, lang) => `<label class="pv-star${n <= stars ? " on" : ""}"><input type="radio" name="pv-stars" value="${n}"${n === stars ? " checked" : ""} />
  <span class="pv-glyph" aria-hidden="true"></span><span class="pv-sr">${T(lang, `${n} 星`, `${n} star${n > 1 ? "s" : ""}`)}</span></label>`;

/**
 * The dialog content. `context.suggested` = the module was pre-picked from the screen the player came from (said once,
 * and the player can still change it). `canSubmit` = a real transport is registered.
 */
export function playerVoiceHtml(lang, rawDraft = {}, { canSubmit = false, context = {} } = {}) {
  const draft = normalizeDraft(rawDraft); // never trust what a caller (or storage) hands us
  const { category, stars } = draft;
  const seg = Object.keys(CATEGORY_LABEL)
    .map((id) => `<label class="pv-seg-opt"><input type="radio" name="pv-category" value="${id}"${id === category ? " checked" : ""} /><span>${categoryLabel(id, lang)}</span></label>`)
    .join("");
  const modules = FEEDBACK_MODULES.map((id) => `<option value="${id}"${id === draft.module ? " selected" : ""}>${moduleLabel(id, lang)}</option>`).join("");
  const state = canSubmit
    ? T(lang, "写好后点「提交」。", "Press Submit when you are done.")
    : T(lang, "反馈服务还没有上线，所以现在不能提交。你写的内容和附件会自动保存成这台设备上的草稿，服务上线后可以直接提交。", "The feedback service is not online yet, so nothing can be submitted right now. What you write and attach is saved as a draft on this device and can be submitted once the service is up.");
  const hint = context.suggested ? T(lang, `已按你当前所在的页面选了「${moduleLabel(draft.module, lang)}」，可以自己改。`, `Picked "${moduleLabel(draft.module, lang)}" from the page you came from; change it if it is wrong.`) : "";
  const rateOpen = category === "rating" || stars > 0 ? " open" : "";
  return `<div class="pv-head">
    <div><h2 id="pv-title">Player Voice · ${T(lang, "玩家之声", "Your Voice")}</h2>
      <p class="pv-sub">${T(lang, "分享建议、报告问题、评价游戏体验", "Share ideas, report problems, rate the game")}</p></div>
    <button type="button" class="pv-close" data-pv-action="close" aria-label="${T(lang, "关闭", "Close")}">×</button>
  </div>
  <fieldset class="pv-seg"><legend class="pv-sr">${T(lang, "反馈类型", "Feedback type")}</legend>${seg}</fieldset>
  <label class="pv-field"><span>${T(lang, "反馈模块（可选）", "Feedback area (optional)")}</span><select id="pv-module">${modules}</select></label>
  <p class="pv-ctx" id="pv-ctx"${hint ? "" : " hidden"}>${esc(hint)}</p>
  <details class="pv-rate" id="pv-rate"${rateOpen}>
    <summary>${T(lang, "游戏体验评分（可选）", "Rate Your Game Experience (Optional)")} <span class="pv-rate-state" id="pv-rate-state">${ratingStateText(stars, lang)}</span></summary>
    <fieldset class="pv-stars"><legend class="pv-sr">${T(lang, "游戏体验评分（可选）", "Rate Your Game Experience (Optional)")}</legend>
      <span class="pv-star-row">${[1, 2, 3, 4, 5].map((n) => starRadio(n, stars, lang)).join("")}</span>
      <button type="button" class="btn small ghost" data-pv-action="clear-stars">${T(lang, "不评分", "No rating")}</button>
    </fieldset>
  </details>
  <label class="pv-sr" for="pv-note">${T(lang, "你的反馈", "Your feedback")}</label>
  <textarea id="pv-note" rows="4" maxlength="600" placeholder="${esc(notePlaceholder(category, lang))}">${esc(draft.note || "")}</textarea>
  <div class="pv-attach" id="pv-attach">
    <div class="pv-attach-head"><strong>${T(lang, "附上截图或录屏（可选）", "Attach screenshots or a recording (optional)")}</strong><span id="pv-attach-count" aria-live="polite"></span></div>
    <div class="pv-drop" id="pv-drop">
      <button type="button" class="btn small ghost" data-pv-action="pick-image" id="pv-pick-image">${T(lang, "选择图片", "Choose images")}</button>
      <button type="button" class="btn small ghost" data-pv-action="pick-video" id="pv-pick-video">${T(lang, "选择视频", "Choose video")}</button>
      <span class="pv-drop-text"><span class="pv-drag-only">${T(lang, "或把文件拖到这里 · ", "or drop files here · ")}</span>${T(lang, `图片 PNG/JPEG/WebP 最多 ${FEEDBACK_IMAGE_MAX} 张（自动压到 2MB 内）· 视频 MP4/WebM 最多 ${FEEDBACK_VIDEO_MAX} 段、${FEEDBACK_VIDEO_BYTES / 1048576}MB`, `Images PNG/JPEG/WebP, up to ${FEEDBACK_IMAGE_MAX} (each shrunk to 2 MB) · Video MP4/WebM, ${FEEDBACK_VIDEO_MAX} clip, ${FEEDBACK_VIDEO_BYTES / 1048576} MB`)}</span>
    </div>
    <input type="file" id="pv-image-input" class="pv-sr" accept="image/png,image/jpeg,image/webp" multiple tabindex="-1" aria-label="${T(lang, "选择要附上的图片", "Choose images to attach")}" />
    <input type="file" id="pv-image-replace" class="pv-sr" accept="image/png,image/jpeg,image/webp" tabindex="-1" aria-label="${T(lang, "选择替换用的图片", "Choose a replacement image")}" />
    <input type="file" id="pv-video-input" class="pv-sr" accept="video/mp4,video/webm" tabindex="-1" aria-label="${T(lang, "选择要附上的视频", "Choose a video to attach")}" />
    <ul class="pv-media-list" id="pv-media"></ul>
    <p class="pv-status" id="pv-attach-status" role="status" aria-live="polite"></p>
  </div>
  <p class="pv-state" id="pv-state">${state}</p>
  <p class="pv-status pv-draft" id="pv-draft" role="status" aria-live="polite">${draft.note || stars ? T(lang, "已恢复你在这台设备上的草稿。", "Restored your draft from this device.") : ""}</p>
  <div class="btn-row">
    <button type="button" class="btn small" data-pv-action="submit"${canSubmit ? "" : ' disabled aria-disabled="true"'}>${T(lang, "提交", "Submit")}</button>
    <button type="button" class="btn small ghost" data-pv-action="copy">${T(lang, "复制反馈", "Copy feedback")}</button>
    <a class="pv-link" href="${FEEDBACK_URL}" target="_blank" rel="noopener noreferrer">${T(lang, "也可以复制后到 GitHub 提出", "or copy it and post on GitHub")}</a>
  </div>
  <p class="pv-status" id="pv-status" role="status" aria-live="polite"></p>
  <textarea id="pv-template" class="pv-template" rows="4" readonly hidden></textarea>`;
}
