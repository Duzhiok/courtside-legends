/**
 * Player Voice controller: ONE game-wide feedback dialog, opened from the top bar on every screen.
 * It owns the draft (text/type/module/rating in localStorage, screenshots + video in IndexedDB, both per account or
 * guest) and the submit flow. A failed or unavailable send changes nothing; success is only reported after the
 * injected sender confirms it. The browser parts (storage backend, image codec) are injectable for tests.
 */
import { clearDraft, isBlankDraft, normalizeDraft, readDraft, writeDraft } from "../data/feedbackDraft.js";
import { clearAttachments, readAttachments, writeAttachments } from "../data/feedbackAttachments.js";
import { addImages, browserImageDeps, replaceImage } from "../data/feedbackImages.js";
import { setVideo } from "../data/feedbackVideo.js";
import { moduleForScreen } from "../data/feedbackContext.js";
import { getFeedbackTransport } from "../data/feedbackTransport.js";
import { T, attachCountText, attachReasonText, feedbackTemplate, mediaListHtml, notePlaceholder, playerVoiceHtml, ratingStateText } from "./playerVoiceView.js";

const isVideo = (a) => a.kind === "video";
const videoLike = (f) => /^video\//.test(f?.type || "") || /\.(mp4|webm|mov|m4v)$/i.test(f?.name || "");

export function createPlayerVoice({
  doc = globalThis.document,
  getLang = () => "zh",
  getAccount = () => null,
  getContext, // () => ({ screen, hint }); defaults to the active screen + active home tab
  submitFeedback = null, // async (payload) => boolean. Falls back to the registered transport; with neither, Submit stays disabled.
  attachmentBackend, // injectable store for attachment drafts (default: IndexedDB; tests pass a memory backend)
  imageDeps, // injectable decode/encode for screenshots (default: canvas)
} = {}) {
  const who = () => getAccount()?.id || "guest";
  const sender = () => submitFeedback || getFeedbackTransport();
  const context = getContext || (() => ({
    screen: doc.querySelector("main.screen.active")?.id || "",
    hint: doc.querySelector(".home-tab.active")?.dataset?.category || "",
  }));

  let dlg = null;
  let opener = null;
  let attachments = [];
  let attachOwner;
  let busy = false;
  let submitting = false;
  let urls = [];
  let replaceTarget = null;
  let where = { screen: "", hint: "" }; // where the player was when they opened it (sent with the feedback)

  const q = (sel) => dlg?.querySelector(sel);
  const say = (node, zh, en) => {
    if (node) node.textContent = T(getLang(), zh, en);
  };

  // ---------------------------------------------------------------- draft (text, type, module, rating)
  function currentDraft() {
    if (!dlg?.querySelector("#pv-note")) return normalizeDraft(null);
    return normalizeDraft({
      category: q('input[name="pv-category"]:checked')?.value,
      module: q("#pv-module")?.value,
      stars: q('input[name="pv-stars"]:checked')?.value,
      note: q("#pv-note")?.value,
    });
  }

  function paintStars(stars) {
    dlg.querySelectorAll(".pv-star").forEach((label, i) => label.classList.toggle("on", i < stars));
    const state = q("#pv-rate-state");
    if (state) state.textContent = ratingStateText(stars, getLang());
  }

  function saveDraft() {
    const draft = currentDraft();
    paintStars(draft.stars);
    const ok = writeDraft(who(), draft);
    const note = q("#pv-draft");
    if (!ok) say(note, "这台设备不允许保存草稿（浏览器存储被关闭）。", "This device can't save the draft (browser storage is disabled).");
    else if (isBlankDraft(draft)) say(note, "", "");
    else say(note, "草稿已自动保存在这台设备上。", "Draft saved on this device.");
  }

  // ---------------------------------------------------------------- attachments (3 screenshots + 1 video)
  function paintMedia() {
    const box = q("#pv-media");
    if (!box) return;
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = attachments.map((a) => URL.createObjectURL(a.blob));
    box.innerHTML = mediaListHtml(attachments, urls, getLang());
    const count = q("#pv-attach-count");
    if (count) count.textContent = attachCountText(attachments, getLang());
    const images = attachments.filter((a) => !isVideo(a)).length;
    const pickImage = q("#pv-pick-image");
    if (pickImage) pickImage.disabled = images >= 3 || busy;
    const pickVideo = q("#pv-pick-video");
    if (pickVideo) pickVideo.disabled = busy;
  }

  async function restoreAttachments() {
    const owner = who();
    if (attachOwner !== owner) {
      attachments = [];
      attachOwner = owner;
    }
    if (!attachments.length) {
      const saved = await readAttachments(owner, attachmentBackend);
      if (who() !== owner) return; // the player switched account while we were reading
      attachments = saved;
    }
    paintMedia();
    if (attachments.length) say(q("#pv-attach-status"), "已恢复你在这台设备上的附件草稿。", "Restored your attachment draft from this device.");
  }

  /** images and the video are handled by separate rules, so the image helpers only ever see images. */
  const split = (list) => ({ images: list.filter((a) => !isVideo(a)), videos: list.filter(isVideo) });

  // Picks / drops that land while a batch is still processing wait their turn instead of being silently dropped.
  let queue = Promise.resolve();
  function handleFiles(files, opts) {
    queue = queue.catch(() => {}).then(() => processFiles(files, opts)); // one failed batch must not block the next
    return queue;
  }

  async function processFiles(files, { replaceId = null, only = null } = {}) {
    if (!files.length) return;
    const status = q("#pv-attach-status");
    const lang = getLang();
    const vids = only === "image" ? [] : files.filter(videoLike);
    const imgs = only === "video" ? [] : files.filter((f) => !videoLike(f));
    busy = true;
    paintMedia();
    say(status, "正在处理文件…", "Processing files…");
    const rejected = [];
    try {
      let { images, videos } = split(attachments);
      if (imgs.length) {
        const r = replaceId ? await replaceImage(images, replaceId, imgs[0], imageDeps || browserImageDeps()) : await addImages(images, imgs, imageDeps || browserImageDeps());
        images = r.list;
        rejected.push(...r.rejected.map((x) => ({ ...x, kind: "image" })));
      }
      if (vids.length) {
        const r = await setVideo(videos, vids[0]);
        videos = r.list;
        rejected.push(...r.rejected.map((x) => ({ ...x, kind: "video" })));
        if (vids.length > 1) rejected.push(...vids.slice(1).map((f) => ({ name: f.name, reason: "limit", kind: "video" })));
      }
      attachments = [...images, ...videos];
      const saved = await writeAttachments(who(), attachments, attachmentBackend);
      busy = false;
      paintMedia();
      const why = (r) => (r.reason === "limit" && r.kind === "video" ? T(lang, "只能附 1 段视频", "Only 1 video can be attached") : attachReasonText(r.reason, lang, r.kind));
      const bad = rejected.slice(0, 3).map((r) => `${r.name || "?"}: ${why(r)}`).join(T(lang, "；", "; "));
      const nImg = attachments.filter((a) => !isVideo(a)).length;
      if (!saved && attachments.length) say(status, `${bad ? `${bad}。` : ""}这台设备不允许保存附件草稿，刷新页面后附件会丢失。`, `${bad ? `${bad}. ` : ""}This device can't save the attachment draft; the files will be lost on refresh.`);
      else if (rejected.length) say(status, `有文件没加上：${bad}${rejected.length > 3 ? ` 等 ${rejected.length} 个` : ""}`, `Some files were not added: ${bad}${rejected.length > 3 ? ` (+${rejected.length - 3} more)` : ""}`);
      else say(status, `已添加：${nImg} 张图片、${attachments.length - nImg} 段视频，草稿保存在这台设备上。`, `Added: ${nImg} image(s), ${attachments.length - nImg} video(s), saved as a draft on this device.`);
    } finally {
      busy = false;
      paintMedia();
    }
  }

  async function removeMedia(id) {
    attachments = attachments.filter((a) => a.id !== id);
    await writeAttachments(who(), attachments, attachmentBackend);
    paintMedia();
    say(q("#pv-attach-status"), "已移除。", "Removed.");
  }

  // ---------------------------------------------------------------- submit / copy
  async function submitDraft() {
    const send = sender();
    if (typeof send !== "function" || submitting) return; // the button is disabled too; never pretend
    const draft = currentDraft();
    const status = q("#pv-status");
    if (busy) return say(status, "文件还在处理，稍等一下再提交。", "Files are still being processed; submit in a moment.");
    if (isBlankDraft(draft)) return say(status, "先写点内容，或选一个评分。", "Write something or pick a rating first.");
    submitting = true;
    say(status, attachments.length ? "正在提交（含附件）…" : "正在提交…", attachments.length ? "Submitting (with attachments)…" : "Submitting…");
    let ok = false;
    try {
      const files = attachments.map(({ id, kind, name, type, size, width, height, blob }) => ({ id, kind, name, type, size, width, height, blob }));
      ok = (await send({ ...draft, lang: getLang(), owner: who(), context: { ...where }, attachments: files })) === true;
    } catch {
      ok = false;
    } finally {
      submitting = false;
    }
    // A failed send changes nothing: text, rating and every attachment stay exactly as they were, ready to retry.
    if (!ok) return say(status, attachments.length ? "没有提交成功，文字、评分和附件都还在，稍后可以再试。" : "没有提交成功，你的草稿还在，稍后可以再试。", attachments.length ? "That did not go through. Your text, rating and attachments are all still here; try again later." : "That did not go through. Your draft is still here; try again later.");
    clearDraft(who());
    await clearAttachments(who(), attachmentBackend);
    attachments = [];
    render();
    say(q("#pv-status"), "已提交，谢谢！", "Submitted, thank you!");
  }

  async function copyFeedback() {
    const lang = getLang();
    const list = split(attachments);
    const text = feedbackTemplate({ ...currentDraft(), lang, userAgent: globalThis.navigator?.userAgent || "", screen: where.screen, imageCount: list.images.length, videoCount: list.videos.length });
    const status = q("#pv-status");
    const box = q("#pv-template");
    try {
      await globalThis.navigator.clipboard.writeText(text);
      say(status, "已复制到剪贴板。", "Copied to the clipboard.");
      if (box) box.hidden = true;
    } catch {
      // No clipboard permission: show the text selected so the player can copy it by hand.
      if (box) {
        box.value = text;
        box.hidden = false;
        box.focus();
        box.select();
      }
      say(status, "浏览器不允许自动复制，已选中下面的文字，请手动复制。", "This browser blocked auto-copy. The text below is selected, copy it by hand.");
    }
  }

  // ---------------------------------------------------------------- dialog
  function render() {
    const lang = getLang();
    const ctx = context() || {};
    where = { screen: String(ctx.screen || ""), hint: String(ctx.hint || "") };
    const stored = readDraft(who());
    const suggested = moduleForScreen(where.screen, where.hint);
    // An empty draft takes the module of the page the player came from; a draft they already wrote keeps its own.
    const fresh = isBlankDraft(stored);
    const draft = fresh ? { ...stored, module: suggested } : stored;
    q("#pv-body").innerHTML = playerVoiceHtml(lang, draft, { canSubmit: typeof sender() === "function", context: { suggested: fresh && suggested !== "game" } });
    restoreAttachments();
  }

  function ensureDialog() {
    if (dlg) return;
    dlg = doc.createElement("dialog");
    dlg.id = "player-voice";
    dlg.className = "pv-dialog";
    dlg.setAttribute("aria-labelledby", "pv-title");
    dlg.setAttribute("data-no-i18n", ""); // every string here is already built per language
    dlg.innerHTML = '<div class="pv-form" id="pv-body"></div>';
    doc.body.appendChild(dlg);
    wire();
  }

  function close() {
    if (!dlg) return;
    urls.forEach((u) => URL.revokeObjectURL(u));
    urls = [];
    if (dlg.open) dlg.close();
    opener?.focus?.();
    opener = null;
  }

  const actions = {
    close,
    submit: submitDraft,
    copy: copyFeedback,
    "pick-image": () => q("#pv-image-input")?.click(),
    "pick-video": () => q("#pv-video-input")?.click(),
    "remove-media": (btn) => removeMedia(btn.dataset.id),
    "replace-image": (btn) => {
      replaceTarget = btn.dataset.id;
      q("#pv-image-replace")?.click();
    },
    "clear-stars": () => {
      const on = q('input[name="pv-stars"]:checked');
      if (on) on.checked = false;
      saveDraft();
    },
  };

  function wire() {
    dlg.addEventListener("click", (event) => {
      if (event.target === dlg) return close(); // a click on the dim backdrop
      const btn = event.target.closest?.("[data-pv-action]");
      if (btn && actions[btn.dataset.pvAction]) actions[btn.dataset.pvAction](btn);
    });
    dlg.addEventListener("cancel", (event) => {
      event.preventDefault(); // Esc: close through our own path so focus returns and object URLs are freed
      close();
    });
    dlg.addEventListener("change", (event) => {
      const t = event.target;
      if (t?.matches?.("#pv-image-input, #pv-image-replace, #pv-video-input")) {
        const files = Array.from(t.files || []);
        const target = t.id === "pv-image-replace" ? replaceTarget : null;
        const only = t.id === "pv-video-input" ? "video" : "image";
        t.value = ""; // picking the same file twice must fire change again
        replaceTarget = null;
        handleFiles(files, { replaceId: target, only });
        return;
      }
      if (t?.matches?.('input[name="pv-category"]')) {
        const cat = t.value;
        const note = q("#pv-note");
        if (note) note.placeholder = notePlaceholder(cat, getLang());
        if (cat === "rating") q("#pv-rate")?.setAttribute("open", "");
      }
      if (t?.id === "pv-module") q("#pv-ctx")?.setAttribute("hidden", "");
    });
    for (const type of ["input", "change"]) {
      dlg.addEventListener(type, (event) => {
        if (event.target?.matches?.("textarea, select, input[name]")) saveDraft();
      });
    }
    // Drag-and-drop onto the attachment box (the Choose buttons cover phones: the OS offers photos / camera).
    const zone = (event) => event.target?.closest?.("#pv-drop");
    dlg.addEventListener("dragover", (event) => {
      const z = zone(event);
      if (!z) return;
      event.preventDefault();
      z.classList.add("is-over");
    });
    dlg.addEventListener("dragleave", (event) => zone(event)?.classList.remove("is-over"));
    dlg.addEventListener("drop", (event) => {
      const z = zone(event);
      if (!z) return;
      event.preventDefault();
      z.classList.remove("is-over");
      handleFiles(Array.from(event.dataTransfer?.files || []));
    });
  }

  /** Open the one dialog from anywhere. `from` is the control to give focus back to on close. */
  function open(from = doc.activeElement) {
    ensureDialog();
    opener = from;
    render();
    if (!dlg.open) (dlg.showModal ? dlg.showModal() : dlg.setAttribute("open", ""));
    q("#pv-note")?.focus();
  }

  return { open, close, refresh: () => dlg?.open && render(), isOpen: () => !!dlg?.open };
}
