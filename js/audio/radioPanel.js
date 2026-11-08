/**
 * Courtside Radio: the compact player. Mode (dynamic / my playlist / off), transport, volumes, and the player's
 * imported songs. Everything user-controlled (file names) is escaped. Songs never leave this device.
 */
import * as manager from "./audioManager.js";
import * as library from "./playlistStore.js";
import * as playlist from "./playlistPlayer.js";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const REASON = {
  "not-audio": ["不是音频文件", "not an audio file"],
  "too-big": ["超过 30MB", "over 30MB"],
  full: ["歌单已满（最多 30 首）", "playlist full (30 max)"],
};

export function createRadio({ setMode, getLang = () => "zh" }) {
  let dialog = null;
  let status = "";
  const T = (zh, en) => (getLang() === "en" ? en : zh);

  const sliderRow = (id, label, value) =>
    `<label class="radio-vol"><span>${label}</span><input type="range" min="0" max="100" value="${Math.round(value * 100)}" data-vol="${id}" aria-label="${label}"><output>${Math.round(value * 100)}%</output></label>`;

  function build() {
    dialog = document.createElement("dialog");
    dialog.id = "radio-dialog";
    dialog.className = "radio-dialog";
    dialog.setAttribute("aria-label", "Courtside Radio");
    dialog.innerHTML = `
      <div class="radio-head"><h3>🎧 Courtside Radio</h3><button type="button" class="btn small ghost" data-radio="close" aria-label="${T("关闭", "Close")}">✕</button></div>
      <div class="radio-sliders"></div>
      <div class="radio-dyn"></div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener("click", onClick);
    dialog.addEventListener("input", onInput);
    dialog.addEventListener("change", onChange);
    manager.onChange(() => { if (dialog?.open) paint(); });
  }

  async function paint() {
    if (!dialog) return;
    const s = manager.getSettings();
    const playing = manager.nowPlaying();
    const items = playlist.isActive() ? playlist.queueSnapshot() : null;
    const mine = await library.listTracks(manager.getProfile());
    const list = (mine.length ? mine.map((t) => ({ id: t.id, name: t.name, source: "mine" })) : []).map((t) => ({ ...t, missing: items?.find((q) => q.id === t.id)?.missing }));
    const modes = [["dynamic", T("动态音乐", "Dynamic")], ["playlist", T("我的歌单", "My playlist")], ["off", T("关闭", "Off")]];
    const transportOff = s.mode !== "playlist";
    dialog.querySelector(".radio-dyn").innerHTML = `
      <div class="radio-modes" role="group" aria-label="${T("播放模式", "Mode")}">${modes.map(([id, l]) => `<button type="button" class="btn small ${s.mode === id ? "primary" : "ghost"}" data-mode="${id}" aria-pressed="${s.mode === id}">${l}</button>`).join("")}</div>
      <p class="radio-hint">${s.mode === "dynamic" ? T("随场景、时代和比赛局势自动切换。", "Follows the scene, era and the state of the game.") : s.mode === "playlist" ? T("始终播放你选择的音乐。", "Always plays your own picks.") : T("背景音乐已关闭（音效仍可用）。", "Music is off (sound effects stay on).")}</p>
      <div class="radio-now" aria-live="polite"><span class="radio-note">♪</span> <strong>${playing ? esc(playing.name) : "—"}</strong></div>
      <div class="radio-transport">
        <button type="button" class="btn small ghost" data-radio="prev" ${transportOff ? "disabled" : ""} aria-label="${T("上一首", "Previous")}">⏮</button>
        <button type="button" class="btn small primary" data-radio="toggle" aria-label="${s.mode === "off" ? T("播放", "Play") : T("暂停", "Pause")}">${s.mode === "off" ? "▶" : "⏸"}</button>
        <button type="button" class="btn small ghost" data-radio="next" ${transportOff ? "disabled" : ""} aria-label="${T("下一首", "Next")}">⏭</button>
        <button type="button" class="btn small ${s.shuffle ? "primary" : "ghost"}" data-radio="shuffle" aria-pressed="${s.shuffle}" aria-label="${T("随机", "Shuffle")}">🔀</button>
        <button type="button" class="btn small ghost" data-radio="repeat" aria-label="${T("循环", "Repeat")}">${s.repeat === "one" ? "🔂" : s.repeat === "off" ? "➡" : "🔁"}</button>
      </div>
      <h4>${T("我的歌单", "My songs")}</h4>
      ${list.length ? `<ul class="radio-list">${list.map((t) => `<li class="${t.missing ? "is-missing" : ""}"><button type="button" class="radio-track" data-play="${esc(t.id)}">${esc(t.name)}</button>${t.missing ? `<em>${T("文件已不可用", "file unavailable")}</em>` : ""}<button type="button" class="btn small ghost" data-remove="${esc(t.id)}" aria-label="${T("删除", "Remove")} ${esc(t.name)}">✕</button></li>`).join("")}</ul>` : `<p class="radio-hint">${T("还没有导入歌曲。导入后会自动切到「我的歌单」。", "Nothing imported yet. Importing switches to My playlist.")}</p>`}
      <div class="radio-import"><button type="button" class="btn small" data-radio="import">${T("导入本地音乐", "Import local music")}</button><input type="file" accept="audio/*,.mp3,.m4a,.ogg,.wav,.flac" multiple hidden data-radio-file></div>
      <p class="radio-hint">${T("只保存在这台设备的浏览器里，不会上传。", "Stored in this browser only — never uploaded.")}${library.isPersistent() ? "" : " " + T("（本次会话有效）", "(this session only)")}</p>
      <p class="radio-status" role="status">${esc(status)}</p>`;
  }

  function paintSliders() {
    const s = manager.getSettings();
    dialog.querySelector(".radio-sliders").innerHTML = sliderRow("music", T("音乐音量", "Music"), s.music) + sliderRow("sfx", T("音效音量", "Effects"), s.sfx);
  }

  async function onClick(e) {
    const b = e.target.closest("button");
    if (!b) return;
    if (b.dataset.mode) return void setMode(b.dataset.mode);
    if (b.dataset.play) { if (manager.getSettings().mode !== "playlist") await setMode("playlist"); return void playlist.playById(b.dataset.play); }
    if (b.dataset.remove) { await library.removeTrack(manager.getProfile(), b.dataset.remove); await playlist.refreshQueue(); return void paint(); }
    switch (b.dataset.radio) {
      case "close": return dialog.close();
      case "prev": return void playlist.go(-1);
      case "next": return void playlist.go(1);
      case "toggle": return void setMode(manager.getSettings().mode === "off" ? manager.getSettings().lastMode : "off");
      case "shuffle": return manager.updateSettings({ shuffle: !manager.getSettings().shuffle });
      case "repeat": return manager.updateSettings({ repeat: { all: "one", one: "off", off: "all" }[manager.getSettings().repeat] });
      case "import": return void dialog.querySelector("[data-radio-file]").click();
    }
  }

  function onInput(e) {
    const r = e.target.closest("input[data-vol]");
    if (!r) return;
    r.nextElementSibling.textContent = `${r.value}%`;
    manager.updateSettings({ [r.dataset.vol]: Number(r.value) / 100 });
  }

  async function onChange(e) {
    const f = e.target.closest("input[data-radio-file]");
    if (!f?.files?.length) return;
    const { added, rejected } = await library.addFiles(manager.getProfile(), f.files);
    f.value = "";
    const why = rejected.map((r) => `${r.name}: ${REASON[r.reason]?.[getLang() === "en" ? 1 : 0] || r.reason}`).join("; ");
    status = `${added.length ? T(`已导入 ${added.length} 首。`, `Imported ${added.length}.`) : ""} ${why}`.trim();
    await playlist.refreshQueue();
    if (added.length) await setMode("playlist");
    paint();
  }

  return {
    async open() {
      if (!dialog) build();
      status = "";
      paintSliders();
      await paint();
      if (!dialog.open) dialog.showModal();
    },
    close: () => dialog?.close(),
    isOpen: () => !!dialog?.open,
  };
}
