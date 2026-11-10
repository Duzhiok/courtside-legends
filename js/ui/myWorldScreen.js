/**
 * My World controller (ADR-008 N-1): renders myWorldView into one root element and wires its buttons.
 * Owns no game state: everything it shows is read fresh from the account store / root save on refresh(),
 * and every action is delegated to the app's existing flows (resume career, open collection, accounts).
 */
import { claimLevelReward, levelSnapshot } from "../data/accountLevel.js";
import { readLook, saveLook } from "../data/avatarLook.js";
import { ownedFurnitureIds, ownedOutfitIds, equippedFrameId, equipShopItem, unequipShopItem } from "../data/shop.js";
import { defaultPresetId, lookSignature, readPortrait, savePortrait } from "../data/avatarPortrait.js";
import { photoReasonText, photoToPortrait } from "./portraitPhoto.js";
import { portraitFor } from "./portraitFor.js";
import { readIdentity, saveIdentity } from "../data/profile.js";
import { mountAvatar3d, AVATAR_ACTIONS } from "./avatar3d.js";
import { careerSig, claimSave, saveVisibility, seasonSig, sessionSig } from "../data/saveOwnership.js";
import { readChallengeArchive } from "../data/challengeArchive.js";
import { journeyFromRoot, legacyFromAccount, myWorldHtml, ownedShopSummary } from "./myWorldView.js";

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
  onOpenCollection,
  onOpenAccounts,
  onOpenShop, // (category) => open the Gold Lifestyle Shop dialog at a category
  onOpenLegacyMuseum, // (titleId) => open the Legacy Museum, highlighting that title
  onStartCareer,
  onIdentitySaved = () => {},
  onPortraitChanged = () => {}, // the home bar shows the same picture; it is updated without re-rendering this screen
  mountAvatar = mountAvatar3d, // (container, { look }) => Promise<handle>; injectable so tests need no WebGL
}) {
  if (!el) return { refresh() {} };

  // The 3D viewer exists while My World is shown: it lives in the showcase stage by default
  // (#mw-showcase-stage, always visible) and only falls back to the look panel's stage when
  // the showcase mount failed. `viewerStage` says which stage owns it, so closing the look
  // panel never kills a showcase viewer. Every re-render frees it (innerHTML destroys the
  // stage) and re-mounts it right after.
  let viewer = null;
  let viewerToken = 0;
  let viewerStage = null; // "showcase" | "look" | null
  function disposeViewer() {
    viewerToken += 1; // a mount still in flight must not attach itself to a stale panel
    viewer?.dispose();
    viewer = null;
    viewerStage = null;
  }

  /** Preview-action buttons work only while a viewer is live; otherwise they stay disabled with the panel's note. */
  function setActionButtons(on) {
    el.querySelectorAll('[data-mw-action^="avatar-action-"], [data-mw-action="avatar-idle"]').forEach((b) => {
      if (on) b.removeAttribute("disabled");
      else b.setAttribute("disabled", "");
    });
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
    el.innerHTML = myWorldHtml({ identity: readIdentity(account), games: visibleGames(account, lang), legacy: legacyFromAccount(account), frames, look: readLook(account), portrait: portraitFor(account), level: levelSnapshot(account, lang), furniture: ownedFurnitureIds(account), frame: equippedFrameId(account), ownedOutfits: ownedOutfitIds(account), owned: ownedShopSummary(account) }, lang);
    mountShowcaseViewer();
  }

  /** Mount the 3D figure into the always-visible showcase stage. Failure is silent: the static portrait stays. */
  async function mountShowcaseViewer() {
    const stage = el.querySelector("#mw-showcase-stage");
    if (!stage || viewer) return;
    const token = ++viewerToken;
    try {
      const handle = await mountAvatar(stage, { look: readLook(getAccount()) });
      if (token !== viewerToken || !stage.isConnected) return handle.dispose(); // closed or re-rendered meanwhile
      viewer = handle;
      viewerStage = "showcase";
      stage.querySelector(".mw-showcase-static")?.setAttribute("hidden", "");
      if (handle.capturePortrait) el.querySelector('[data-mw-action="use-3d-portrait"]')?.removeAttribute("disabled");
      setActionButtons(true);
    } catch {
      setActionButtons(false);
    }
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
      archive: readChallengeArchive(account?.id ?? null),
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

  async function openViewer() {
    const stage = el.querySelector("#mw-look-stage");
    const status = el.querySelector("#mw-look-status");
    if (!stage) return;
    if (viewer) { setActionButtons(true); return; } // the showcase already owns a viewer: reuse it, don't mount a second
    const token = ++viewerToken;
    try {
      const handle = await mountAvatar(stage, { look: readLook(getAccount()) });
      if (token !== viewerToken || !stage.isConnected) return handle.dispose(); // closed or re-rendered meanwhile
      viewer = handle;
      viewerStage = "look";
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
    const photoBtn = el.querySelector('[data-mw-action="pick-photo"]');
    if (photoBtn) {
      const en = getLang() === "en";
      photoBtn.setAttribute("aria-pressed", String(p.kind === "photo"));
      photoBtn.textContent = p.kind === "photo" ? (en ? "✓ Using my photo (tap to change)" : "✓ 正在使用我的照片（点此更换）") : (en ? "Upload my photo" : "上传我的照片");
    }
    const btn = el.querySelector('[data-mw-action="use-3d-portrait"]');
    if (btn) {
      const en = getLang() === "en";
      btn.setAttribute("aria-pressed", String(p.kind === "3d"));
      btn.textContent = p.kind === "3d" ? (en ? "✓ Using my 3D look" : "✓ 正在使用我的 3D 形象") : (en ? "Use my 3D look" : "用我的 3D 形象作头像");
    }
    const art = el.querySelector('[data-mw-action="use-preset-portrait"]');
    if (art) art.hidden = p.kind !== "3d";
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

  /** Photo -> square crop -> small JPEG on this device. A bad file changes nothing and says why. */
  async function usePhoto(file) {
    const status = el.querySelector("#mw-look-status");
    say(status, "正在处理照片…", "Processing the photo…");
    const out = await photoToPortrait(file);
    if (!out.ok) return say(status, `没能用这张照片：${photoReasonText(out.reason, "zh")}。`, `Could not use this photo: ${photoReasonText(out.reason, "en")}.`);
    const res = savePortrait(getAccount(), { source: "photo", image: out.image });
    paintPortrait();
    if (res.invalid) return say(status, "这张照片无法保存（格式不对）。", "This photo can't be saved (wrong format).");
    if (!res.saved) return persistFailed(status);
    say(status, "已用你的照片作头像。", "Your photo is now your profile picture.");
  }

  /** Back from the (experimental) 3D picture to an illustration: the owner's stable default preset, one tap, no confirmation needed. */
  function usePresetPortrait() {
    const status = el.querySelector("#mw-hero-status");
    const account = getAccount();
    const res = savePortrait(account, { source: "preset", preset: defaultPresetId(account?.id || "guest") });
    paintPortrait();
    if (res.invalid) return;
    if (!res.saved) return persistFailed(status);
    say(status, "已换成插画头像。", "Switched to an illustration.");
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
      // Only free a viewer the panel itself owns; the showcase viewer stays up.
      if (viewerStage === "look") disposeViewer();
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
    "showcase-figure": (btn) => {
      const figure = btn?.dataset?.figure;
      if (!figure) return;
      const saved = saveLook(getAccount(), { figure });
      const status = () => el.querySelector("#mw-showcase-status");
      if (!saved.saved) return say(status(), "这台设备不允许保存（浏览器存储被关闭），风格只在这次打开期间有效。", "This device can't save (browser storage is disabled); the style only lasts while this page is open.");
      viewer?.setLook(saved);
      render();
      const label = figure === "bobblehead" ? (getLang() === "en" ? "Bobblehead" : "Q 版大头") : (getLang() === "en" ? "Stylized" : "风格化写实");
      say(status(), `已切换到${label}。`, `Switched to ${label}.`);
    },
    /** Equip / take off an owned shop item from the My World owned area (same shop state the shop writes). */
    "equip-owned": (btn) => {
      const itemId = btn?.closest?.("[data-item]")?.dataset?.item;
      if (!itemId) return;
      const status = () => el.querySelector("#mw-owned-status");
      const res = equipShopItem(getAccount(), itemId);
      if (!res.ok) return say(status(), res.reason === "not-owned" ? "这件商品还没买，先去商城看看。" : "穿戴失败。", res.reason === "not-owned" ? "You don't own that item yet — take a look in the Shop." : "Couldn't equip it.");
      render();
      say(status(), getLang() === "en" ? `Equipped ${res.item.en}.` : `已穿戴「${res.item.zh}」。`);
    },
    "unequip-owned": (btn) => {
      const itemId = btn?.closest?.("[data-item]")?.dataset?.item;
      if (!itemId) return;
      const status = () => el.querySelector("#mw-owned-status");
      const res = unequipShopItem(getAccount(), itemId);
      if (!res.ok) return say(status(), "这件商品现在没有在使用。", "That item isn't in use right now.");
      render();
      say(status(), getLang() === "en" ? `Took off ${res.item.en}.` : `已取下「${res.item.zh}」。`);
    },
    "use-3d-portrait": use3dPortrait,
    "use-preset-portrait": usePresetPortrait,
    "pick-photo": () => el.querySelector("#mw-photo-input")?.click(),
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
    "open-shop": (btn) => onOpenShop?.(btn?.dataset?.shopCategory || "home"),
    /** Earned Architect titles open the Legacy Museum (the tapped title's section is highlighted). */
    "open-legacy-museum": (btn) => onOpenLegacyMuseum?.(btn?.dataset?.title || null),
  };

  el.addEventListener("click", (event) => {
    const btn = event.target.closest?.("[data-mw-action]");
    if (btn && actions[btn.dataset.mwAction]) actions[btn.dataset.mwAction](btn);
  });

  el.addEventListener("change", (event) => {
    if (event.target?.matches?.('#mw-look input[name="mw-portrait"]')) pickPortrait(event.target);
    if (event.target?.matches?.("#mw-photo-input")) {
      const file = event.target.files?.[0];
      event.target.value = ""; // lets the same file be picked again
      if (file) usePhoto(file);
    }
    else if (event.target?.matches?.('#mw-look input[type="radio"]')) pickLook(event.target);
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
