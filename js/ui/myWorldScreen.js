/**
 * My World controller (ADR-008 N-1): renders myWorldView into one root element and wires its buttons.
 * Owns no game state: everything it shows is read fresh from the account store / root save on refresh(),
 * and every action is delegated to the app's existing flows (resume career, open collection, accounts).
 */
import { claimLevelReward, levelSnapshot } from "../data/accountLevel.js";
import { readLook, saveLook } from "../data/avatarLook.js";
import { lookSignature, readPortrait, savePortrait } from "../data/avatarPortrait.js";
import { portraitFor } from "./portraitFor.js";
import { readIdentity, saveIdentity } from "../data/profile.js";
import { mountAvatar3d, AVATAR_ACTIONS } from "./avatar3d.js";
import { careerSig, claimSave, saveVisibility, seasonSig, sessionSig } from "../data/saveOwnership.js";
import { clearDraft, isBlankDraft, normalizeDraft, readDraft, writeDraft } from "../data/feedbackDraft.js";
import { clearAttachments, readAttachments, writeAttachments } from "../data/feedbackAttachments.js";
import { FEEDBACK_IMAGE_MAX, addImages, browserImageDeps, replaceImage } from "../data/feedbackImages.js";
import { getFeedbackTransport } from "../data/feedbackTransport.js";
import { attachReasonText, feedbackTemplate, journeyFromRoot, legacyFromAccount, myWorldHtml, thumbsHtml } from "./myWorldView.js";

export function createMyWorld({
  el,
  getLang,
  getAccount,
  readRootSave,
  readSession = () => null,
  sessionLabel = () => "",
  readSeason = () => null, // the quick-season save (or null)
  seasonLabel = () => "",
  readMyTeam = () => null, // the My Team season save (or null)
  myTeamLabel = () => "",
  myTeamSigOf = () => null,
  onResumeMyTeam,
  deleteSave = async () => false, // (slot) => confirmed delete of an unlinked save; the app owns confirm + release
  confirm = async () => false,
  topCards = () => [],
  onResumeCareer,
  onResumeSession,
  onClaimed = () => {},
  submitFeedback = null, // async (draft) => boolean. Falls back to the registered transport; with neither, Submit stays disabled.
  attachmentBackend, // injectable store for attachment drafts (default: IndexedDB; tests pass a memory backend)
  imageDeps, // injectable decode/encode for screenshots (default: canvas)
  onOpenCollection,
  onOpenAccounts,
  onStartCareer,
  onIdentitySaved = () => {},
  onPortraitChanged = () => {}, // the home bar shows the same picture; it is updated without re-rendering this screen
  mountAvatar = mountAvatar3d, // (container, { look }) => Promise<handle>; injectable so tests need no WebGL
}) {
  if (!el) return { refresh() {} };

  const ownerOf = (account) => account?.id || "guest";

  // The 3D viewer exists only while the "My look" panel is open; every re-render or close frees it.
  let viewer = null;
  let viewerToken = 0;
  function disposeViewer() {
    viewerToken += 1; // a mount still in flight must not attach itself to a stale panel
    viewer?.dispose();
    viewer = null;
  }

  /** Preview-action buttons work only while a viewer is live; otherwise they stay disabled with the panel's note. */
  function setActionButtons(on) {
    el.querySelectorAll('[data-mw-action^="avatar-action-"], [data-mw-action="avatar-idle"]').forEach((b) => {
      if (on) b.removeAttribute("disabled");
      else b.setAttribute("disabled", "");
    });
  }

  const sender = () => submitFeedback || getFeedbackTransport();

  // ---- Player Voice screenshots: kept in memory + IndexedDB per owner; blobs go to the sender only on Submit ----
  let attachments = [];
  let attachOwner;
  let attachBusy = false;
  let submitting = false;
  let thumbUrls = [];
  let replaceTarget = null;
  const who = () => ownerOf(getAccount());
  const backend = () => attachmentBackend; // undefined -> the module default (IndexedDB) applies

  function paintAttachments() {
    const box = el.querySelector("#mw-thumbs");
    if (!box) return;
    thumbUrls.forEach((u) => URL.revokeObjectURL(u));
    thumbUrls = attachments.map((a) => URL.createObjectURL(a.blob));
    box.innerHTML = thumbsHtml(attachments, thumbUrls, getLang());
    const count = el.querySelector("#mw-attach-count");
    if (count) count.textContent = `${attachments.length}/${FEEDBACK_IMAGE_MAX}`;
    const pick = el.querySelector("#mw-attach-pick");
    if (pick) pick.disabled = attachments.length >= FEEDBACK_IMAGE_MAX || attachBusy;
  }

  async function restoreAttachments() {
    const owner = who();
    if (attachOwner !== owner) { attachments = []; attachOwner = owner; }
    if (!attachments.length) {
      const saved = await readAttachments(owner, backend());
      if (who() !== owner) return; // the player switched account while we were reading
      attachments = saved;
    }
    paintAttachments();
    if (attachments.length) say(el.querySelector("#mw-attach-status"), "已恢复你在这台设备上的截图草稿。", "Restored your screenshot draft from this device.");
  }

  async function handleImages(files, replaceId) {
    if (attachBusy || !files?.length) return;
    const status = el.querySelector("#mw-attach-status");
    attachBusy = true;
    paintAttachments();
    say(status, "正在处理图片…", "Processing images…");
    try {
      const deps = imageDeps || browserImageDeps();
      const res = replaceId ? await replaceImage(attachments, replaceId, files[0], deps) : await addImages(attachments, files, deps);
      attachments = res.list;
      const saved = await writeAttachments(who(), attachments, backend());
      attachBusy = false;
      paintAttachments();
      const lang = getLang();
      const bad = res.rejected.slice(0, 3).map((r) => `${r.name || "?"}: ${attachReasonText(r.reason, lang)}`).join(lang === "en" ? "; " : "；");
      const kept = res.rejected.length === 0;
      if (!saved && attachments.length) say(status, `${bad ? bad + "。" : ""}这台设备不允许保存附件草稿，刷新页面后截图会丢失。`, `${bad ? bad + ". " : ""}This device can't save the attachment draft; the images are lost if you reload.`);
      else if (!kept) say(status, `有图片没加上：${attachReasonText(res.rejected[0].reason, "zh")}（${res.rejected[0].name || "?"}）${res.rejected.length > 1 ? ` 等 ${res.rejected.length} 张` : ""}`, `Some images were not added: ${bad}`);
      else say(status, `已添加，现在共 ${attachments.length} 张，草稿保存在这台设备上。`, `Added. ${attachments.length} image(s) now, saved as a draft on this device.`);
    } finally {
      attachBusy = false;
      paintAttachments();
    }
  }

  async function removeImage(id) {
    attachments = attachments.filter((a) => a.id !== id);
    await writeAttachments(who(), attachments, backend());
    paintAttachments();
    say(el.querySelector("#mw-attach-status"), "已移除。", "Removed.");
  }

  function render() {
    disposeViewer();
    const lang = getLang();
    const account = getAccount();
    let frames = [];
    try {
      frames = account ? topCards(account) : []; // roster may still be loading: an empty room is honest
    } catch {
      frames = [];
    }
    el.innerHTML = myWorldHtml({ identity: readIdentity(account), games: visibleGames(account, lang), legacy: legacyFromAccount(account), frames, draft: readDraft(ownerOf(account)), look: readLook(account), portrait: portraitFor(account), canSubmitFeedback: typeof sender() === "function", level: levelSnapshot(account, lang) }, lang);
    restoreAttachments(); // screenshot draft: async (IndexedDB), paints the thumbnails when it is back
  }

  /**
   * Only saves this player may see: theirs, unassociated local ones, and (signed in) the guest's to claim. Another
   * account's saves never render.
   */
  function visibleGames(account, lang) {
    const shown = (state, ...ok) => ["unassociated", "guest", ...ok].includes(state);
    const root = readRootSave();
    const careerState = saveVisibility("career", careerSig(root));
    const journey = shown(careerState, "mine") ? journeyFromRoot(root) : null;
    const session = readSession();
    const sessionState = saveVisibility("session", sessionSig(session));
    const season = readSeason();
    const seasonState = saveVisibility("season", seasonSig(season));
    const myTeam = readMyTeam();
    const myTeamState = saveVisibility("myteam", myTeamSigOf(myTeam));
    return {
      career: journey ? { journey, state: careerState } : null,
      session: shown(sessionState, "mine") ? { label: sessionLabel(session, lang), state: sessionState } : null,
      season: shown(seasonState) ? { label: seasonLabel(season, lang), state: seasonState } : null,
      myteam: myTeam && shown(myTeamState, "mine") ? { label: myTeamLabel(myTeam, lang), state: myTeamState } : null,
      canClaim: !!account,
    };
  }

  const SIG_OF = { career: () => careerSig(readRootSave()), session: () => sessionSig(readSession()), season: () => seasonSig(readSeason()), myteam: () => myTeamSigOf(readMyTeam()) };

  async function remove(slot) {
    if (saveVisibility(slot, SIG_OF[slot]()) !== "unassociated") return render(); // stale button: nothing to delete
    if (!(await deleteSave(slot))) return;
    render();
    say(el.querySelector("#mw-games-status"), "已删除这份本机存档。", "That local save is deleted.");
  }

  async function claim(slot) {
    const sig = SIG_OF[slot]();
    const ok = await confirm(
      getLang() === "en"
        ? "Link this local save to your account? Other accounts on this device will no longer see it. This cannot prove the save was originally yours."
        : "把这份本机存档关联到你的账号？关联后，本机其他账号将看不到它。注意：认领只管理归属，不能证明你就是原主人。",
    );
    if (!ok) return;
    const res = claimSave(slot, sig);
    if (res.ok) {
      render();
      onClaimed();
      return say(el.querySelector("#mw-games-status"), "已关联到你的账号。", "Linked to your account.");
    }
    const why = {
      claimed: ["这份存档已被其他账号认领。", "Another account already claimed this save."],
      already_yours: ["这份存档已经是你的。", "This save is already yours."],
      guest: ["请先登录账号再认领。", "Sign in to claim a save."],
      storage: ["保存归属失败，存档本身没有改动。", "Could not store the link; the save itself is untouched."],
    }[res.reason] || ["没有找到这份存档。", "That save is gone."];
    render();
    say(el.querySelector("#mw-games-status"), ...why);
  }

  const form = () => el.querySelector("#mw-identity-form");
  const say = (node, zh, en) => {
    if (node) node.textContent = getLang() === "en" ? en : zh;
  };

  /** The draft as it currently looks in the panel (the DOM is the source while the player is typing). */
  function currentDraft() {
    const root = el.querySelector("#mw-feedback");
    if (!root) return normalizeDraft(null);
    return normalizeDraft({
      category: root.querySelector('input[name="mw-fb-category"]:checked')?.value,
      stars: root.querySelector('input[name="mw-fb-stars"]:checked')?.value,
      note: root.querySelector("#mw-feedback-note")?.value,
    });
  }

  function paintStars(stars) {
    el.querySelectorAll("#mw-feedback .mw-star").forEach((label, i) => label.classList.toggle("on", i < stars));
  }

  function saveDraft() {
    const draft = currentDraft();
    paintStars(draft.stars);
    const ok = writeDraft(ownerOf(getAccount()), draft);
    const note = el.querySelector("#mw-feedback-draft");
    if (!ok) say(note, "这台设备不允许保存草稿（浏览器存储被关闭）。", "This device can't save the draft (browser storage is disabled).");
    else if (isBlankDraft(draft)) say(note, "", "");
    else say(note, "草稿已自动保存在这台设备上。", "Draft saved on this device.");
  }

  async function submitDraft() {
    const send = sender();
    if (typeof send !== "function") return; // the button is disabled too; never pretend
    const draft = currentDraft();
    const status = el.querySelector("#mw-feedback-status");
    if (submitting) return;
    if (attachBusy) return say(status, "图片还在处理，稍等一下再提交。", "Images are still being processed; submit in a moment.");
    if (isBlankDraft(draft)) return say(status, "先写点内容，或选一个评分。", "Write something or pick a rating first.");
    submitting = true;
    say(status, attachments.length ? "正在提交（含截图）…" : "正在提交…", attachments.length ? "Submitting (with screenshots)…" : "Submitting…");
    let ok = false;
    try {
      const files = attachments.map(({ id, name, type, size, width, height, blob }) => ({ id, name, type, size, width, height, blob }));
      ok = (await send({ ...draft, lang: getLang(), owner: who(), attachments: files })) === true;
    } catch {
      ok = false;
    } finally {
      submitting = false;
    }
    // A failed send changes nothing: text, rating and every screenshot stay exactly as they were, ready to retry.
    if (!ok) return say(status, attachments.length ? "没有提交成功，文字、评分和截图都还在，稍后可以再试。" : "没有提交成功，你的草稿还在，稍后可以再试。", attachments.length ? "That did not go through. Your text, rating and screenshots are still here; try again later." : "That did not go through. Your draft is still here; try again later.");
    clearDraft(who());
    await clearAttachments(who(), backend());
    attachments = [];
    render();
    say(el.querySelector("#mw-feedback-status"), "已提交，谢谢！", "Submitted, thank you!");
  }

  async function copyFeedback() {
    const lang = getLang();
    const text = feedbackTemplate({ ...currentDraft(), lang, userAgent: globalThis.navigator?.userAgent || "", attachmentCount: attachments.length });
    const status = el.querySelector("#mw-feedback-status");
    const box = el.querySelector("#mw-feedback-template");
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

  async function openViewer() {
    const stage = el.querySelector("#mw-look-stage");
    const status = el.querySelector("#mw-look-status");
    if (!stage || viewer) return;
    const token = ++viewerToken;
    try {
      const handle = await mountAvatar(stage, { look: readLook(getAccount()) });
      if (token !== viewerToken || !stage.isConnected) return handle.dispose(); // closed or re-rendered meanwhile
      viewer = handle;
      stage.querySelector(".mw-look-static")?.setAttribute("hidden", "");
      if (handle.capturePortrait) el.querySelector('[data-mw-action="use-3d-portrait"]')?.removeAttribute("disabled");
      setActionButtons(true);
    } catch {
      setActionButtons(false);
      if (token === viewerToken) say(status, "3D 形象在这台设备上暂时无法显示。你仍可以选择外观，它会被保存。", "The 3D figure can't be shown on this device right now. You can still pick a look and it will be saved.");
    }
  }

  /** Show the resolved portrait everywhere it appears, in place (a re-render would destroy the 3D viewer). */
  function paintPortrait() {
    const account = getAccount();
    const p = portraitFor(account);
    const img = el.querySelector(".mw-avatar");
    if (img) img.src = p.src;
    const picked = p.kind === "preset" && p.chosen ? p.presetId : null;
    for (const radio of el.querySelectorAll('input[name="mw-portrait"]')) radio.checked = radio.value === picked;
    const btn = el.querySelector('[data-mw-action="use-3d-portrait"]');
    if (btn) {
      const en = getLang() === "en";
      btn.setAttribute("aria-pressed", String(p.kind === "3d"));
      btn.textContent = p.kind === "3d" ? (en ? "✓ Using my 3D look" : "✓ 正在使用我的 3D 形象") : (en ? "Use my 3D look" : "用我的 3D 形象作头像");
    }
    onPortraitChanged(account);
    return p;
  }

  const persistFailed = (status) => say(status, "这台设备不允许保存（浏览器存储被关闭），头像只在这次打开期间有效。", "This device can't save (browser storage is disabled); the picture only lasts while this page is open.");

  function pickPortrait(input) {
    const status = el.querySelector("#mw-look-status");
    const res = savePortrait(getAccount(), { source: "preset", preset: input.value });
    paintPortrait();
    if (res.invalid) return;
    if (!res.saved) return persistFailed(status);
    say(status, "头像已保存。", "Profile picture saved.");
  }

  /** Take the portrait from the live 3D figure. Never invents a picture: no viewer / no frame = nothing saved. */
  function use3dPortrait() {
    const status = el.querySelector("#mw-look-status");
    const image = viewer?.capturePortrait?.() ?? null;
    if (!image) return say(status, "3D 形象还没准备好，暂时不能用它做头像。你可以先选一个预设头像。", "The 3D figure isn't ready, so it can't be used as the picture yet. Pick a preset for now.");
    const account = getAccount();
    const res = savePortrait(account, { source: "3d", image, sig: lookSignature(readLook(account)) });
    paintPortrait();
    if (res.invalid) return say(status, "这张头像无法保存（图片太大或格式不对）。", "This picture can't be saved (too large or the wrong format).");
    if (!res.saved) return persistFailed(status);
    say(status, "已用你的 3D 形象作头像。", "Your 3D look is now your profile picture.");
  }

  function toggleLook() {
    const panel = el.querySelector("#mw-look");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (panel.hidden) {
      disposeViewer();
      setActionButtons(false);
      panel.querySelector(".mw-look-static")?.removeAttribute("hidden");
      return;
    }
    openViewer();
  }

  /** Play one of the model's own clips in the preview (or stand back up). Visual only, like everything in this panel. */
  function playPreview(id) {
    const status = el.querySelector("#mw-look-status");
    if (!viewer) return say(status, "3D 形象还没准备好，暂时不能预览动作。", "The 3D figure isn't ready, so actions can't be previewed yet.");
    const ok = id === "idle" ? viewer.playIdle?.() : viewer.playAction?.(id);
    if (ok === false) return say(status, "这个动作暂时放不出来。", "That action can't be played right now.");
    if (id === "idle") return say(status, "回到站立。", "Back to standing.");
    const def = AVATAR_ACTIONS.find((a) => a.id === id);
    say(status, `正在${def ? def.zh : "预览"}。`, `Playing ${def ? def.en : "preview"}…`);
  }

  function pickLook(input) {
    const group = input.name.replace("mw-look-", "");
    const saved = saveLook(getAccount(), { [group]: input.value });
    const status = el.querySelector("#mw-look-status");
    if (!saved.saved) return say(status, "这台设备不允许保存（浏览器存储被关闭），外观只在这次打开期间有效。", "This device can't save (browser storage is disabled); the look only lasts while this page is open.");
    viewer?.setLook(saved);
    // A 3D portrait follows the look: retake it now (the figure is on screen). If it can't be retaken the old picture
    // is already hidden by its signature, so it never shows an avatar that no longer looks like this.
    if (readPortrait(getAccount())?.source === "3d" && viewer?.capturePortrait) {
      const image = viewer.capturePortrait();
      if (image) savePortrait(getAccount(), { source: "3d", image, sig: lookSignature(readLook(getAccount())) });
    }
    paintPortrait();
    say(status, "已保存。", "Saved.");
  }

  const actions = {
    "toggle-level-track": (btn) => {
      const track = el.querySelector("#mw-level-track");
      if (!track) return;
      track.hidden = !track.hidden;
      btn?.setAttribute("aria-expanded", String(!track.hidden));
    },
    "claim-level-reward": (btn) => {
      const level = Number(btn?.dataset?.level || 0);
      const status = () => el.querySelector("#mw-level-status");
      if (!level) return;
      const res = claimLevelReward(getAccount(), level);
      if (res.ok) {
        render();
        const cards = res.cards?.length
          ? getLang() === "en"
            ? ` New cards: ${res.cards.map((c) => c.player.name).join("、")}.`
            : ` 新卡：${res.cards.map((c) => c.player.name).join("、")}。`
          : "";
        say(status(), `已领取 Lv.${level} 的奖励。${cards}`, `Claimed the Lv.${level} reward.${cards}`);
        return;
      }
      if (res.reason === "guest") {
        say(status(), "金币和卡包奖励需要先创建账号。先去创建账号，奖励会一直等你。", "Gold and card packs need an account first — create one and the reward will be waiting.");
        onOpenAccounts?.();
        return;
      }
      if (res.reason === "card-room-full") {
        say(status(), res.message || "卡库已满，先去分解一些卡再来领。", "Your binder is full — recycle some cards first, then claim.");
        return;
      }
      if (res.reason === "claimed") say(status(), "这个奖励已经领过了。", "That reward was already claimed.");
      else if (res.reason === "locked") say(status(), `还没到 Lv.${level}，继续打球升级吧。`, `Not Lv.${level} yet — keep playing to level up.`);
      else say(status(), "这个等级没有奖励。", "There is no reward at that level.");
    },
    "toggle-look": toggleLook,
    "use-3d-portrait": use3dPortrait,
    "avatar-action-clap": () => playPreview("clap"),
    "avatar-action-jump": () => playPreview("jump"),
    "avatar-action-run": () => playPreview("run"),
    "avatar-action-sit": () => playPreview("sit"),
    "avatar-idle": () => playPreview("idle"),
    "edit-identity": () => {
      const f = form();
      if (!f) return;
      f.hidden = false;
      f.querySelector("input")?.focus();
    },
    "cancel-identity": () => {
      if (form()) form().hidden = true;
    },
    "resume-career": () => onResumeCareer?.(),
    "resume-session": () => onResumeSession?.(),
    "claim-career": () => claim("career"),
    "claim-session": () => claim("session"),
    "claim-season": () => claim("season"),
    "claim-myteam": () => claim("myteam"),
    "resume-myteam": () => onResumeMyTeam?.(),
    "delete-myteam": () => remove("myteam"),
    "delete-career": () => remove("career"),
    "delete-session": () => remove("session"),
    "delete-season": () => remove("season"),
    "start-career": () => onStartCareer?.(),
    "open-collection": () => onOpenCollection?.(),
    "open-accounts": () => onOpenAccounts?.(),
    "copy-feedback": () => copyFeedback(),
    "submit-feedback": () => submitDraft(),
    "pick-attach": () => el.querySelector("#mw-attach-input")?.click(),
    "remove-attach": (btn) => removeImage(btn.dataset.id),
    "replace-attach": (btn) => {
      replaceTarget = btn.dataset.id;
      el.querySelector("#mw-attach-replace")?.click();
    },
    "clear-stars": () => {
      const none = el.querySelector('#mw-feedback input[name="mw-fb-stars"]:checked');
      if (none) none.checked = false;
      saveDraft();
    },
    "toggle-feedback": () => {
      const panel = el.querySelector("#mw-feedback");
      const btn = el.querySelector('[data-mw-action="toggle-feedback"]');
      if (!panel) return;
      panel.hidden = !panel.hidden;
      btn?.setAttribute("aria-expanded", String(!panel.hidden));
      if (!panel.hidden) panel.querySelector("textarea")?.focus();
    },
  };

  el.addEventListener("click", (event) => {
    const btn = event.target.closest?.("[data-mw-action]");
    if (btn && actions[btn.dataset.mwAction]) actions[btn.dataset.mwAction](btn);
  });

  el.addEventListener("change", (event) => {
    const t = event.target;
    if (t?.matches?.("#mw-attach-input, #mw-attach-replace")) {
      const files = Array.from(t.files || []);
      const target = t.id === "mw-attach-replace" ? replaceTarget : null;
      t.value = ""; // picking the same file twice must fire change again
      replaceTarget = null;
      handleImages(files, target);
      return;
    }
    if (event.target?.matches?.('#mw-look input[name="mw-portrait"]')) pickPortrait(event.target);
    else if (event.target?.matches?.('#mw-look input[type="radio"]')) pickLook(event.target);
  });

  for (const type of ["input", "change"]) {
    el.addEventListener(type, (event) => {
      if (event.target?.closest?.("#mw-feedback") && event.target.matches("textarea, input")) saveDraft();
    });
  }

  // Drag-and-drop onto the attachment box (the Choose button covers phones: the OS offers photos / camera).
  const dropZone = (event) => event.target?.closest?.("#mw-drop");
  el.addEventListener("dragover", (event) => {
    const z = dropZone(event);
    if (!z) return;
    event.preventDefault();
    z.classList.add("is-over");
  });
  el.addEventListener("dragleave", (event) => dropZone(event)?.classList.remove("is-over"));
  el.addEventListener("drop", (event) => {
    const z = dropZone(event);
    if (!z) return;
    event.preventDefault();
    z.classList.remove("is-over");
    handleImages(Array.from(event.dataTransfer?.files || []), null);
  });

  el.addEventListener("submit", (event) => {
    if (event.target?.id !== "mw-identity-form") return;
    event.preventDefault();
    const data = new FormData(event.target);
    const saved = saveIdentity(getAccount(), {
      name: data.get("name"),
      hometown: data.get("hometown"),
      bio: data.get("bio"),
    });
    if (!saved.saved) {
      say(event.target.querySelector(".mw-status"), "这台设备不允许保存（浏览器存储被关闭）。", "This device can't save (browser storage is disabled).");
      return;
    }
    render();
    onIdentitySaved(saved);
  });

  render();
  return { refresh: render };
}
