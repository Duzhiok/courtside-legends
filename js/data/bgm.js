/**
 * 背景音乐（需自备合法音源）。
 * 默认路径：assets/audio/basketball-bgm.mp3
 * 推荐曲目：Kurtis Blow — Basketball（请自行合法取得后放入上述路径，或点「选曲」从本机加载）
 * 本仓库不收录受版权保护的原曲文件。
 */

const DEFAULT_SRC = "assets/audio/basketball-bgm.mp3";
const LS_ON = "courtside-bgm-on";
const LS_VOL = "courtside-bgm-vol";

let audio = null;
let objectUrl = null;
let preferredOn = false;

function readOn() {
  try {
    return localStorage.getItem(LS_ON) !== "0";
  } catch {
    return true;
  }
}

function writeOn(on) {
  try {
    localStorage.setItem(LS_ON, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

function readVol() {
  try {
    const v = Number(localStorage.getItem(LS_VOL));
    if (Number.isFinite(v) && v >= 0 && v <= 1) return v;
  } catch {
    /* ignore */
  }
  return 0.32;
}

function writeVol(v) {
  try {
    localStorage.setItem(LS_VOL, String(v));
  } catch {
    /* ignore */
  }
}

function ensureAudio() {
  if (audio) return audio;
  audio = new Audio();
  audio.loop = true;
  audio.preload = "auto";
  audio.volume = readVol();
  audio.src = DEFAULT_SRC;
  audio.addEventListener("error", () => {
    /* 缺文件时静默；点开机会提示 */
  });
  return audio;
}

function revokeObjectUrl() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = null;
  }
}

async function tryPlay() {
  const a = ensureAudio();
  try {
    await a.play();
    preferredOn = true;
    writeOn(true);
    return true;
  } catch {
    return false;
  }
}

function pauseBgm() {
  if (!audio) return;
  audio.pause();
  preferredOn = false;
  writeOn(false);
}

function paintButton() {
  const btn = document.getElementById("btn-bgm");
  if (!btn) return;
  const on = !!(audio && !audio.paused);
  btn.classList.toggle("is-on", on);
  btn.setAttribute("aria-pressed", on ? "true" : "false");
  btn.title = on
    ? "关闭背景音乐"
    : "开启背景音乐（Kurtis Blow — Basketball · 需自备音源）";
  btn.textContent = on ? "♪ 音乐开" : "♪ 音乐";
}

async function probeDefaultSrc() {
  try {
    const res = await fetch(DEFAULT_SRC, { method: "HEAD", cache: "no-store" });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * 打开本机选曲（mp3/ogg/m4a 等），会话内循环播放。
 */
export function pickLocalBgmFile() {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "audio/*,.mp3,.m4a,.ogg,.wav,.flac";
  input.onchange = async () => {
    const file = input.files?.[0];
    if (!file) return;
    revokeObjectUrl();
    objectUrl = URL.createObjectURL(file);
    const a = ensureAudio();
    a.src = objectUrl;
    a.load();
    const ok = await tryPlay();
    paintButton();
    if (!ok) {
      alert("浏览器拦截了自动播放——再点一次「♪ 音乐」即可开始。");
    }
  };
  input.click();
}

export async function toggleBgm() {
  const a = ensureAudio();
  if (!a.paused) {
    pauseBgm();
    paintButton();
    return;
  }

  const hasCustom = !!objectUrl;
  if (!hasCustom) {
    const okFile = await probeDefaultSrc();
    if (!okFile) {
      const go = confirm(
        "未找到背景音乐文件。\n\n请把合法取得的 Kurtis Blow — Basketball 放到：\nassets/audio/basketball-bgm.mp3\n\n或点「确定」从本机选择音源文件。"
      );
      if (go) {
        pickLocalBgmFile();
        return;
      }
      paintButton();
      return;
    }
    if (!a.src.endsWith("basketball-bgm.mp3") && !a.src.includes("basketball-bgm.mp3")) {
      a.src = DEFAULT_SRC;
      a.load();
    }
  }

  const ok = await tryPlay();
  paintButton();
  if (!ok) {
    alert("需要先点击一次页面才能播放音乐，请再点一次「♪ 音乐」。");
  }
}

export function setBgmVolume(v) {
  const vol = Math.max(0, Math.min(1, Number(v) || 0));
  writeVol(vol);
  if (audio) audio.volume = vol;
}

export function initBgm() {
  preferredOn = readOn();
  ensureAudio();
  paintButton();

  const btn = document.getElementById("btn-bgm");
  const pick = document.getElementById("btn-bgm-pick");
  btn?.addEventListener("click", () => toggleBgm());
  pick?.addEventListener("click", () => pickLocalBgmFile());

  // 首次用户手势后，若偏好为开且已有音源，自动续播
  const unlock = async () => {
    document.removeEventListener("pointerdown", unlock);
    document.removeEventListener("keydown", unlock);
    if (!preferredOn || !readOn()) return;
    const okFile = objectUrl || (await probeDefaultSrc());
    if (!okFile) return;
    await tryPlay();
    paintButton();
  };
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("keydown", unlock, { once: true });

  if (audio) {
    audio.addEventListener("play", paintButton);
    audio.addEventListener("pause", paintButton);
  }
}
