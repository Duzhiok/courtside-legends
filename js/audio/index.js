/**
 * Public face of the audio system. app.js talks only to this: screen/tab changes, game snapshots, outcomes.
 * Browsers need a user gesture first: until then everything is remembered and applied on the first tap/key.
 */
import * as manager from "./audioManager.js";
import * as playlist from "./playlistPlayer.js";
import { createDirector, sceneForScreen } from "./musicDirector.js";
import { asTrack, synthTrackById } from "./synthTracks.js";
import { sfx } from "./soundEffects.js";
import { createRadio } from "./radioPanel.js";
import { bandOf } from "../data/gacha.js";

let director = null;
let radio = null;
let getProfileId = () => null;
let getLang = () => "zh";
let homeTab = "career";
let screenName = null;
let inited = false;

/** Make the player's chosen mode true: dynamic follows the director, playlist plays the queue, off is silent. */
async function applyMode() {
  const { mode } = manager.getSettings();
  if (!manager.isUnlocked()) return;
  if (mode === "off") { playlist.stop(); manager.stopMusic(0.6); director.reset(); return; }
  if (mode === "playlist") { if (!playlist.isActive()) await playlist.start(); return; }
  if (playlist.isActive()) playlist.stop();
  director.reset();
}

async function setMode(mode) {
  manager.updateSettings({ mode });
  await applyMode();
}

/** A different account (or the guest) is active: use its own settings and playlist. */
function syncProfile() {
  if (!manager.useProfile(getProfileId())) return;
  playlist.stop();
  applyMode();
}

function paintTopButton() {
  const btn = document.getElementById("btn-bgm");
  if (!btn) return;
  const on = manager.getSettings().mode !== "off";
  btn.classList.toggle("is-on", on);
  btn.setAttribute("aria-pressed", String(on));
  btn.textContent = on ? "♪ 音乐开" : "♪ 音乐";
  btn.title = on ? "关闭背景音乐" : "开启背景音乐";
}

function bindUnlock() {
  const events = ["pointerdown", "touchend", "keydown", "click"];
  const handler = async () => {
    if (!(await manager.unlock())) return;
    events.forEach((e) => document.removeEventListener(e, handler, true));
    await applyMode();
    director.reset();
  };
  events.forEach((e) => document.addEventListener(e, handler, true));
}

export const audio = {
  sfx,
  radio: () => radio,
  manager,
  director: () => director,
  setMode,
  toggle: () => setMode(manager.getSettings().mode === "off" ? manager.getSettings().lastMode : "off"),

  init({ getProfileId: gp, getLang: gl } = {}) {
    if (inited) return;
    inited = true;
    getProfileId = gp || getProfileId;
    getLang = gl || getLang;
    manager.useProfile(getProfileId());
    director = createDirector({
      player: {
        mode: () => manager.getSettings().mode,
        play: (track, opts) => manager.playTrack(track, opts),
      },
      resolve: (id) => asTrack(synthTrackById(id)),
    });
    radio = createRadio({ setMode, getLang });
    document.getElementById("btn-bgm")?.addEventListener("click", () => audio.toggle());
    document.getElementById("btn-bgm-pick")?.addEventListener("click", () => radio.open());
    manager.onChange(paintTopButton);
    paintTopButton();
    bindUnlock();
    document.addEventListener("visibilitychange", () => manager.setSuspended(document.hidden));
    document.addEventListener("click", (e) => {
      const b = e.target.closest?.("button, .mode-card, .home-tab");
      if (b && !b.disabled) sfx.click();
    });
  },

  /** A screen was shown. `year` (season screens) selects the era soundtrack. */
  screen(name, { year } = {}) {
    if (!director) return;
    screenName = name;
    syncProfile();
    director.setScene(sceneForScreen(name, { homeTab }), { year });
  },
  homeTab(id) {
    homeTab = id;
    if (screenName === "home") audio.screen("home");
  },
  era: (year) => director?.setEra(year),
  game: (snap) => director?.onGameSnapshot(snap),

  outcome: (won) => (won ? sfx.victory() : sfx.defeat()),
  champion: () => sfx.champion(),
  clutch: (made) => (made ? sfx.clutchMade() : sfx.clutchMiss()),
  reveal: (result) => sfx.reveal(result?.kind === "coach" ? "allstar" : bandOf(result?.ovr || 0).id),
};
