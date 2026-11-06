/**
 * My World controller (ADR-008 N-1): renders myWorldView into one root element and wires its buttons.
 * Owns no game state: everything it shows is read fresh from the account store / root save on refresh(),
 * and every action is delegated to the app's existing flows (resume career, open collection, accounts).
 */
import { readIdentity, saveIdentity } from "../data/profile.js";
import { feedbackTemplate, journeyFromRoot, legacyFromAccount, myWorldHtml } from "./myWorldView.js";

export function createMyWorld({
  el,
  getLang,
  getAccount,
  readRootSave,
  topCards = () => [],
  onResumeCareer,
  onOpenCollection,
  onOpenAccounts,
  onStartCareer,
  onIdentitySaved = () => {},
}) {
  if (!el) return { refresh() {} };

  function render() {
    const lang = getLang();
    const account = getAccount();
    let frames = [];
    try {
      frames = account ? topCards(account) : []; // roster may still be loading: an empty room is honest
    } catch {
      frames = [];
    }
    el.innerHTML = myWorldHtml(
      { identity: readIdentity(account), journey: journeyFromRoot(readRootSave()), legacy: legacyFromAccount(account), frames },
      lang,
    );
  }

  const form = () => el.querySelector("#mw-identity-form");
  const say = (node, zh, en) => {
    if (node) node.textContent = getLang() === "en" ? en : zh;
  };

  async function copyFeedback() {
    const lang = getLang();
    const note = el.querySelector("#mw-feedback-note")?.value || "";
    const text = feedbackTemplate({ note, lang, userAgent: globalThis.navigator?.userAgent || "" });
    const status = el.querySelector("#mw-feedback-status");
    const box = el.querySelector("#mw-feedback-template");
    try {
      await globalThis.navigator.clipboard.writeText(text);
      say(status, "已复制。打开 GitHub 粘贴提交即可。", "Copied. Open GitHub and paste it in.");
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

  const actions = {
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
    "start-career": () => onStartCareer?.(),
    "open-collection": () => onOpenCollection?.(),
    "open-accounts": () => onOpenAccounts?.(),
    "copy-feedback": () => copyFeedback(),
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
