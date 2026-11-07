/**
 * My World controller (ADR-008 N-1): renders myWorldView into one root element and wires its buttons.
 * Owns no game state: everything it shows is read fresh from the account store / root save on refresh(),
 * and every action is delegated to the app's existing flows (resume career, open collection, accounts).
 */
import { readLook, saveLook } from "../data/avatarLook.js";
import { readIdentity, saveIdentity } from "../data/profile.js";
import { mountAvatar3d } from "./avatar3d.js";
import { careerSig, claimSave, saveVisibility, sessionSig } from "../data/saveOwnership.js";
import { clearDraft, isBlankDraft, normalizeDraft, readDraft, writeDraft } from "../data/feedbackDraft.js";
import { feedbackTemplate, journeyFromRoot, legacyFromAccount, myWorldHtml } from "./myWorldView.js";

export function createMyWorld({
  el,
  getLang,
  getAccount,
  readRootSave,
  readSession = () => null,
  sessionLabel = () => "",
  confirm = async () => false,
  topCards = () => [],
  onResumeCareer,
  onResumeSession,
  onClaimed = () => {},
  submitFeedback = null, // async (draft) => boolean. Absent until a real endpoint exists: Submit stays disabled.
  onOpenCollection,
  onOpenAccounts,
  onStartCareer,
  onIdentitySaved = () => {},
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
    el.innerHTML = myWorldHtml({ identity: readIdentity(account), games: visibleGames(account, lang), legacy: legacyFromAccount(account), frames, draft: readDraft(ownerOf(account)), look: readLook(account), canSubmitFeedback: typeof submitFeedback === "function" }, lang);
  }

  /** Only saves this player may see: theirs, or unassociated local ones. Another account's saves never render. */
  function visibleGames(account, lang) {
    const root = readRootSave();
    const careerState = saveVisibility("career", careerSig(root));
    const journey = careerState === "mine" || careerState === "unassociated" ? journeyFromRoot(root) : null;
    const session = readSession();
    const sessionState = saveVisibility("session", sessionSig(session));
    return {
      career: journey ? { journey, state: careerState } : null,
      session: sessionState === "mine" || sessionState === "unassociated" ? { label: sessionLabel(session, lang), state: sessionState } : null,
      canClaim: !!account,
    };
  }

  async function claim(slot) {
    const sig = slot === "career" ? careerSig(readRootSave()) : sessionSig(readSession());
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
    if (typeof submitFeedback !== "function") return; // the button is disabled too; never pretend
    const draft = currentDraft();
    const status = el.querySelector("#mw-feedback-status");
    if (isBlankDraft(draft)) return say(status, "先写点内容，或选一个评分。", "Write something or pick a rating first.");
    let ok = false;
    try {
      ok = (await submitFeedback({ ...draft, lang: getLang(), owner: ownerOf(getAccount()) })) === true;
    } catch {
      ok = false;
    }
    if (!ok) return say(status, "没有提交成功，你的草稿还在，稍后可以再试。", "That did not go through. Your draft is still here; try again later.");
    clearDraft(ownerOf(getAccount()));
    render();
    say(el.querySelector("#mw-feedback-status"), "已提交，谢谢！", "Submitted, thank you!");
  }

  async function copyFeedback() {
    const lang = getLang();
    const text = feedbackTemplate({ ...currentDraft(), lang, userAgent: globalThis.navigator?.userAgent || "" });
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
    } catch {
      if (token === viewerToken) say(status, "3D 形象在这台设备上暂时无法显示。你仍可以选择外观，它会被保存。", "The 3D figure can't be shown on this device right now. You can still pick a look and it will be saved.");
    }
  }

  function toggleLook() {
    const panel = el.querySelector("#mw-look");
    if (!panel) return;
    panel.hidden = !panel.hidden;
    if (panel.hidden) {
      disposeViewer();
      panel.querySelector(".mw-look-static")?.removeAttribute("hidden");
      return;
    }
    openViewer();
  }

  function pickLook(input) {
    const group = input.name.replace("mw-look-", "");
    const saved = saveLook(getAccount(), { [group]: input.value });
    const status = el.querySelector("#mw-look-status");
    if (!saved.saved) return say(status, "这台设备不允许保存（浏览器存储被关闭），外观只在这次打开期间有效。", "This device can't save (browser storage is disabled); the look only lasts while this page is open.");
    viewer?.setLook(saved);
    say(status, "已保存。", "Saved.");
  }

  const actions = {
    "toggle-look": toggleLook,
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
    "start-career": () => onStartCareer?.(),
    "open-collection": () => onOpenCollection?.(),
    "open-accounts": () => onOpenAccounts?.(),
    "copy-feedback": () => copyFeedback(),
    "submit-feedback": () => submitDraft(),
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
    if (btn && actions[btn.dataset.mwAction]) actions[btn.dataset.mwAction]();
  });

  el.addEventListener("change", (event) => {
    if (event.target?.matches?.('#mw-look input[type="radio"]')) pickLook(event.target);
  });

  for (const type of ["input", "change"]) {
    el.addEventListener(type, (event) => {
      if (event.target?.closest?.("#mw-feedback") && event.target.matches("textarea, input")) saveDraft();
    });
  }

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
