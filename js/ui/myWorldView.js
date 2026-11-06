/**
 * My World / 我的篮球人生 (ADR-008 N-1): pure HTML builders, no DOM, no storage -- tested in isolation.
 *
 * Honesty rules (product owner): every number comes from a real account or career save; no data means an
 * honest empty state (never a fake trophy, never simulated social activity); every button rendered here has
 * a real handler in myWorldScreen.js (`data-mw-action`). Account identity only -- Reborn career identities
 * stay inside their career saves.
 * Visual redesign (R167): one page title, compact identity hero, compact cards, an illustrated room, and a small
 * corner feedback entry. Presentation only -- same data, same actions.
 */
import { avatarDataUri } from "../data/avatarArt.js";
import { photoImg } from "../data/photo.js";
import { PROFILE_LIMITS } from "../data/profile.js";
import { teamNameL } from "../i18n.js";

/** A real, public feedback channel: the project's own GitHub issue tracker. */
export const FEEDBACK_URL = "https://github.com/Duzhiok/courtside-legends/issues/new";

const esc = (value) =>
  String(value ?? "").replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);
const T = (lang, zh, en) => (lang === "en" ? en : zh);
const action = (name, label, cls = "btn small") => `<button type="button" class="${cls}" data-mw-action="${name}">${label}</button>`;

/** The ongoing long career, read straight from the root save. null = no career yet. */
export function journeyFromRoot(root) {
  const career = root?.leagueCareer;
  const season = career?.season;
  if (!season) return null;
  const history = career.management?.seasonHistory || [];
  return {
    kind: career.kind === "timeTravel" ? "timeTravel" : "franchise",
    teamName: season.teams?.[season.userTeamId]?.name || null,
    startYear: root.story?.startYear ?? season.year ?? null,
    year: season.year ?? null,
    seasonsDone: history.length,
    trophies: history.filter((s) => s?.trophy).map((s) => ({ year: s.year, teamName: s.teamName })),
  };
}

/** Permanent-collection facts from the account. null = guest (no collection exists). */
export function legacyFromAccount(account) {
  if (!account) return null;
  const owned = account.playerIds || [];
  return {
    cards: owned.length,
    codex: new Set([...(account.codex || []), ...owned]).size,
    rankedWins: account.rankedWins || 0,
    rankedLosses: account.rankedLosses || 0,
  };
}

const ICONS = {
  games: '<path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 0v18M3 12h18M6 5.5c3 3 3 10 0 13m12-13c-3 3-3 10 0 13" />',
  legacy: '<path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5v2a3 3 0 003 3m8-5h3v2a3 3 0 01-3 3M12 13v4m-3 3h6M10 17h4" />',
  voice: '<path d="M4 5h16v11H9l-5 4V5z" />',
};
const icon = (name) => `<svg class="mw-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

export function identityCardHtml(identity, lang) {
  const name = identity.name || T(lang, "访客球员", "Guest player");
  const facts = identity.hometown ? `${T(lang, "来自", "From")} ${esc(identity.hometown)}` : T(lang, "家乡未填写", "Hometown not set");
  const note = identity.guest
    ? `<p class="mw-note">${T(lang, "访客资料只保存在这台设备的浏览器里。创建账号后，在账号下重新编辑即可保存到账号。", "Guest profiles live only in this browser on this device. Create an account and edit again to keep it with the account.")}</p>`
    : "";
  return `<section class="mw-identity" aria-labelledby="mw-identity-title">
    <div class="mw-portrait"><img class="mw-avatar" src="${avatarDataUri({ name, team: "NBA" })}" alt="" width="96" height="96" /></div>
    <div class="mw-identity-body">
      <h3 id="mw-identity-title">${esc(name)}</h3>
      <p class="mw-facts">${facts}</p>
      <p class="mw-bio">${identity.bio ? esc(identity.bio) : T(lang, "还没有个人简介。写一句话介绍你的篮球人生。", "No bio yet. Write one line about your basketball life.")}</p>
      ${action("edit-identity", T(lang, "编辑个人资料", "Edit profile"), "btn small mw-gold")}
      ${note}
      <form class="mw-form" id="mw-identity-form" hidden>
        <label>${T(lang, "昵称", "Display name")}<input name="name" maxlength="${PROFILE_LIMITS.name}" value="${esc(identity.name)}" /></label>
        <label>${T(lang, "家乡", "Hometown")}<input name="hometown" maxlength="${PROFILE_LIMITS.hometown}" value="${esc(identity.hometown)}" /></label>
        <label>${T(lang, "个人简介", "Bio")}<textarea name="bio" rows="2" maxlength="${PROFILE_LIMITS.bio}">${esc(identity.bio)}</textarea></label>
        <div class="btn-row">
          <button type="submit" class="btn small mw-gold">${T(lang, "保存", "Save")}</button>
          ${action("cancel-identity", T(lang, "取消", "Cancel"), "btn small ghost mw-on-dark")}
        </div>
        <p class="mw-status" role="status" aria-live="polite"></p>
      </form>
    </div>
  </section>`;
}

const cardHead = (ico, title) => `<h3>${icon(ico)}<span>${title}</span></h3>`;

/** "My Games": what can really be resumed. Today that is the long career in the root save. */
export function journeyHtml(journey, lang) {
  const title = cardHead("games", T(lang, "我的游戏记录", "My Games"));
  if (!journey) {
    return `<section class="mw-card">${title}
      <p class="mw-empty">${T(lang, "还没有进行中的生涯。", "No career in progress yet.")}</p>
      ${action("start-career", T(lang, "去开始一段生涯", "Start a career"))}</section>`;
  }
  const kind = journey.kind === "timeTravel" ? T(lang, "穿越生涯", "Time-Travel Career") : T(lang, "联盟经理", "Franchise");
  const team = journey.teamName ? teamNameL(journey.teamName, lang) : T(lang, "未命名球队", "Unnamed team");
  return `<section class="mw-card">${title}
    <p class="mw-line"><strong>${esc(kind)}</strong> · ${esc(team)}</p>
    <p class="mw-line tiny">${esc(journey.startYear ?? "—")} → ${esc(journey.year ?? "—")} · ${T(lang, `已完成 ${journey.seasonsDone} 个赛季`, `${journey.seasonsDone} season(s) completed`)}</p>
    ${action("resume-career", T(lang, "继续生涯", "Continue career"), "btn small continue")}</section>`;
}

export function legacyHtml(legacy, journey, lang) {
  const trophies = journey?.trophies || [];
  const trophyLine = trophies.length
    ? `<ul class="mw-trophies">${trophies.map((t) => `<li>🏆 ${esc(t.year)} · ${esc(teamNameL(t.teamName || "", lang))}</li>`).join("")}</ul>`
    : `<p class="mw-empty">${T(lang, "还没有冠军。拿下总冠军后会出现在这里。", "No championships yet. Titles you win will show up here.")}</p>`;
  const collection = legacy
    ? `<p class="mw-line tiny">${T(lang, `球员卡 ${legacy.cards} 张 · 图鉴 ${legacy.codex} 人 · 排位 ${legacy.rankedWins} 胜 ${legacy.rankedLosses} 负`, `${legacy.cards} cards · ${legacy.codex} in codex · Ranked ${legacy.rankedWins}-${legacy.rankedLosses}`)}</p>
       ${legacy.cards ? action("open-collection", T(lang, "打开我的球员卡", "Open my cards")) : `<p class="mw-empty">${T(lang, "还没有球员卡。", "No cards yet.")}</p>`}`
    : `<p class="mw-empty">${T(lang, "访客没有永久收藏。创建账号后可以收集球员卡。", "Guests have no permanent collection. Create an account to collect cards.")}</p>
       ${action("open-accounts", T(lang, "创建或切换账号", "Create or switch account"))}`;
  return `<section class="mw-card">${cardHead("legacy", T(lang, "传奇荣誉", "Legacy"))}${trophyLine}${collection}</section>`;
}

/** Lightweight local illustration (inline SVG, no external image). Real data is overlaid as HTML on top of it. */
const ROOM_SVG = `<svg class="mw-room-art" viewBox="0 0 600 240" preserveAspectRatio="xMaxYMid slice" aria-hidden="true" focusable="false">
  <defs>
    <linearGradient id="mw-wall" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f1e6cf"/><stop offset="1" stop-color="#e6d6b6"/></linearGradient>
    <linearGradient id="mw-floor" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#c9954f"/><stop offset="1" stop-color="#a97835"/></linearGradient>
    <radialGradient id="mw-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#ffe9a8" stop-opacity=".75"/><stop offset="1" stop-color="#ffe9a8" stop-opacity="0"/></radialGradient>
  </defs>
  <rect x="-2000" width="4600" height="240" fill="url(#mw-wall)"/>
  <rect x="-2000" y="120" width="4600" height="38" fill="#1f4a35"/>
  <rect x="-2000" y="116" width="4600" height="6" fill="#d6b25a"/>
  <rect x="-2000" y="158" width="4600" height="82" fill="url(#mw-floor)"/>
  <path d="M-2000 176h4600M-2000 196h4600M-2000 218h4600" stroke="#8c6226" stroke-opacity=".35"/>
  <rect x="26" y="26" width="86" height="66" rx="5" fill="#f9f3e4" stroke="#8a6a3a" stroke-width="5"/>
  <rect x="32" y="32" width="74" height="54" fill="#f6c36a"/><circle cx="82" cy="70" r="14" fill="#ffe08a"/><path d="M32 86l22-22 18 14 12-10 22 18z" fill="#2f5a45"/>
  <path d="M470 24h84v44h-84z" fill="#fff" stroke="#303030" stroke-width="5"/><rect x="496" y="42" width="32" height="22" fill="none" stroke="#e2622b" stroke-width="3"/>
  <path d="M492 76q22 10 44 0" fill="none" stroke="#e2622b" stroke-width="4"/><path d="M496 80l6 18m8-17l2 19m8-19l-2 19m8-18l-6 18" stroke="#fff" stroke-opacity=".9" stroke-width="2"/>
  <path d="M300 0v14" stroke="#4a3b24" stroke-width="3"/><path d="M280 14h40l10 16h-60z" fill="#f4d98a"/><ellipse cx="300" cy="0" rx="280" ry="160" fill="url(#mw-glow)"/>
  <g transform="translate(440 96)"><path d="M0 0l12 8h22l12-8 14 16-10 8v34H-4V24l-10-8z" fill="#1f4a35" stroke="#d6b25a" stroke-width="2"/><rect x="6" y="30" width="34" height="5" fill="#d6b25a"/></g>
  <g transform="translate(196 216)"><path d="M0 0c0-10 6-14 14-14h14l8 6c10 0 14 4 14 8z" fill="#fff" stroke="#2a2a2a" stroke-width="2"/><path d="M6 -4h20" stroke="#e2622b" stroke-width="3"/></g>
  <g transform="translate(262 220)"><path d="M0 0c0-10 6-14 14-14h14l8 6c10 0 14 4 14 8z" fill="#fff" stroke="#2a2a2a" stroke-width="2"/><path d="M6 -4h20" stroke="#e2622b" stroke-width="3"/></g>
  <circle cx="356" cy="210" r="15" fill="#e2622b" stroke="#7a2e10" stroke-width="2"/><path d="M356 195v30M341 210h30" stroke="#7a2e10" stroke-width="2"/>
  <rect x="560" y="112" width="20" height="26" rx="3" fill="#7a5230"/><path d="M570 112c-14-8-16-26-4-30m4 30c14-8 16-26 4-30" fill="none" stroke="#3f7a52" stroke-width="5" stroke-linecap="round"/>
</svg>`;

const emptyFrame = (lang) => `<figure class="mw-frame is-empty" aria-label="${T(lang, "空相框", "Empty frame")}"><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="9" r="4"/><path d="M4 22c0-5 4-8 8-8s8 3 8 8z"/></svg></figure>`;

/** Frames hold your real top cards (empty frames are honest); the shelf counts real career trophies. */
export function homeSceneHtml({ identity, frames = [], trophyCount = 0 }, lang) {
  const frameHtml = [0, 1, 2]
    .map((i) => {
      const player = frames[i];
      return player
        ? `<figure class="mw-frame">${photoImg(player, "mw-frame-photo")}<figcaption>${esc(player.name)}</figcaption></figure>`
        : emptyFrame(lang);
    })
    .join("");
  const shelf = trophyCount
    ? `<div class="mw-shelf" aria-label="${T(lang, `${trophyCount} 座冠军奖杯`, `${trophyCount} championship trophies`)}">${"🏆".repeat(Math.min(trophyCount, 5))}${trophyCount > 5 ? ` ×${trophyCount}` : ""}</div>`
    : `<div class="mw-shelf is-empty">${T(lang, "奖杯架还空着", "Trophy shelf is empty")}</div>`;
  const plate = identity.name || T(lang, "访客球员", "Guest player");
  return `<section class="mw-card mw-home"><h3>${T(lang, "我的家 · My Home", "My Home")}</h3>
    <div class="mw-room" role="img" aria-label="${T(lang, "我的篮球房间", "My basketball room")}">
      <div class="mw-stage">
        ${ROOM_SVG}
        <div class="mw-frames">${frameHtml}</div>
        ${shelf}
        <div class="mw-plate">${esc(plate)}</div>
      </div>
    </div>
    <p class="tiny mw-note">${T(lang, "相框挂着你账号里最强的三张球员卡；奖杯来自你的生涯存档。", "Frames hold the three best cards on your account; trophies come from your career save.")}</p>
  </section>`;
}

/** Plain-text feedback the player pastes into the real channel. Holds only what they typed + version info. */
export function feedbackTemplate({ note = "", lang = "zh", userAgent = "" } = {}) {
  const lines = [
    T(lang, "【Courtside Legends 玩家建议】", "[Courtside Legends player feedback]"),
    `${T(lang, "我的想法", "My idea")}: ${String(note).trim() || T(lang, "（在这里写下你的建议）", "(write your suggestion here)")}`,
    `${T(lang, "界面语言", "UI language")}: ${lang}`,
  ];
  if (userAgent) lines.push(`${T(lang, "浏览器", "Browser")}: ${userAgent}`);
  return lines.join("\n");
}

/** Feedback keeps its real behaviour (copy + GitHub); it just lives behind a small corner icon now. */
export function feedbackHtml(lang) {
  return `<section class="mw-feedback" id="mw-feedback" aria-label="${T(lang, "玩家建议", "Feedback")}" hidden>
    <p>${T(lang, "你希望自己的篮球人生还能做什么？写下来，复制后贴到 GitHub 提交。", "What else should your basketball life do? Write it, copy it, and post it on GitHub.")}</p>
    <label class="mw-sr" for="mw-feedback-note">${T(lang, "你的建议", "Your suggestion")}</label>
    <textarea id="mw-feedback-note" rows="3" maxlength="600" placeholder="${T(lang, "分享想法、提出建议、参与未来设计。", "Share ideas, suggest features, help shape what comes next.")}"></textarea>
    <div class="btn-row">
      ${action("copy-feedback", T(lang, "复制反馈", "Copy feedback"))}
      <a class="btn small ghost" href="${FEEDBACK_URL}" target="_blank" rel="noopener noreferrer">${T(lang, "打开 GitHub 提交", "Open GitHub to post")}</a>
    </div>
    <p class="mw-status" id="mw-feedback-status" role="status" aria-live="polite"></p>
    <textarea id="mw-feedback-template" class="mw-template" rows="4" readonly hidden></textarea>
  </section>`;
}

export function myWorldHtml({ identity, journey, legacy, frames }, lang) {
  const label = T(lang, "玩家建议", "Feedback");
  return `<div class="mw-top"><span class="mw-kicker">MY WORLD</span>
      <button type="button" class="mw-voice" data-mw-action="toggle-feedback" aria-expanded="false" aria-controls="mw-feedback" aria-label="${label}" title="${label}">${icon("voice")}</button></div>
    ${feedbackHtml(lang)}
    ${identityCardHtml(identity, lang)}
    <div class="mw-grid">${journeyHtml(journey, lang)}${legacyHtml(legacy, journey, lang)}</div>
    ${homeSceneHtml({ identity, frames, trophyCount: journey?.trophies?.length || 0 }, lang)}`;
}
