/**
 * My World controller (ADR-008 N-1): renders myWorldView into one root element and wires its buttons.
 * Owns no game state: everything it shows is read fresh from the account store / root save on refresh(),
 * and every action is delegated to the app's existing flows (resume career, open collection, accounts).
 */
import { readIdentity, saveIdentity } from "../data/profile.js";
import { careerSig, claimSave, saveVisibility, sessionSig } from "../data/saveOwnership.js";
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
    el.innerHTML = myWorldHtml({ identity: readIdentity(account), games: visibleGames(account, lang), legacy: legacyFromAccount(account), frames }, lang);
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
    "resume-session": () => onResumeSession?.(),
    "claim-career": () => claim("career"),
    "claim-session": () => claim("session"),
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
