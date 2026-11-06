/**
 * My World / 我的篮球人生 (ADR-008 N-1): pure HTML builders, no DOM, no storage -- tested in isolation.
 *
 * Honesty rules (product owner): every number comes from a real account or career save; no data means an
 * honest empty state (never a fake trophy, never simulated social activity); every button rendered here has
 * a real handler in myWorldScreen.js (`data-mw-action`). Account identity only -- Reborn career identities
 * stay inside their career saves.
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

export function identityCardHtml(identity, lang) {
  const name = identity.name || T(lang, "访客球员", "Guest player");
  const facts = [
    identity.hometown ? `${T(lang, "来自", "From")} ${esc(identity.hometown)}` : T(lang, "家乡未填写", "Hometown not set"),
  ];
  const note = identity.guest
    ? `<p class="mw-note">${T(lang, "访客资料只保存在这台设备的浏览器里。创建账号后，在账号下重新编辑即可保存到账号。", "Guest profiles live only in this browser on this device. Create an account and edit again to keep it with the account.")}</p>`
    : "";
  return `<section class="mw-identity" aria-labelledby="mw-identity-title">
    <img class="mw-avatar" src="${avatarDataUri({ name, team: "NBA" })}" alt="" width="96" height="96" />
    <div class="mw-identity-body">
      <p class="mw-kicker">MY IDENTITY</p>
      <h3 id="mw-identity-title">${esc(name)}</h3>
      <p class="mw-facts">${facts.join(" · ")}</p>
      <p class="mw-bio">${identity.bio ? esc(identity.bio) : T(lang, "还没有个人简介。写一句话介绍你的篮球人生。", "No bio yet. Write one line about your basketball life.")}</p>
      ${action("edit-identity", T(lang, "编辑个人资料", "Edit profile"), "btn small mw-on-dark")}
      ${note}
      <form class="mw-form" id="mw-identity-form" hidden>
        <label>${T(lang, "昵称", "Display name")}<input name="name" maxlength="${PROFILE_LIMITS.name}" value="${esc(identity.name)}" /></label>
        <label>${T(lang, "家乡", "Hometown")}<input name="hometown" maxlength="${PROFILE_LIMITS.hometown}" value="${esc(identity.hometown)}" /></label>
        <label>${T(lang, "个人简介", "Bio")}<textarea name="bio" rows="2" maxlength="${PROFILE_LIMITS.bio}">${esc(identity.bio)}</textarea></label>
        <div class="btn-row">
          <button type="submit" class="btn small">${T(lang, "保存", "Save")}</button>
          ${action("cancel-identity", T(lang, "取消", "Cancel"), "btn small ghost mw-on-dark")}
        </div>
        <p class="mw-status" role="status" aria-live="polite"></p>
      </form>
    </div>
  </section>`;
}

export function journeyHtml(journey, lang) {
  if (!journey) {
    return `<section class="mw-card"><h3>${T(lang, "我的旅程", "My Journey")}</h3>
      <p class="mw-empty">${T(lang, "还没有进行中的生涯。", "No career in progress yet.")}</p>
      ${action("start-career", T(lang, "去开始一段生涯", "Start a career"))}</section>`;
  }
  const kind = journey.kind === "timeTravel" ? T(lang, "穿越生涯", "Time-Travel Career") : T(lang, "联盟经理", "Franchise");
  const team = journey.teamName ? teamNameL(journey.teamName, lang) : T(lang, "未命名球队", "Unnamed team");
  return `<section class="mw-card"><h3>${T(lang, "我的旅程", "My Journey")}</h3>
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
    ? `<p class="mw-line">${T(lang, `球员卡 ${legacy.cards} 张 · 图鉴 ${legacy.codex} 人 · 排位 ${legacy.rankedWins} 胜 ${legacy.rankedLosses} 负`, `${legacy.cards} cards · ${legacy.codex} in codex · Ranked ${legacy.rankedWins}-${legacy.rankedLosses}`)}</p>
       ${legacy.cards ? action("open-collection", T(lang, "打开我的球员卡", "Open my cards")) : `<p class="mw-empty">${T(lang, "还没有球员卡。", "No cards yet.")}</p>`}`
    : `<p class="mw-empty">${T(lang, "访客没有永久收藏。创建账号后可以收集球员卡。", "Guests have no permanent collection. Create an account to collect cards.")}</p>
       ${action("open-accounts", T(lang, "创建或切换账号", "Create or switch account"))}`;
  return `<section class="mw-card"><h3>${T(lang, "传奇荣誉", "Legacy")}</h3>${trophyLine}${collection}</section>`;
}

/** A fixed CSS room. Frames hold your real top cards; empty frames say so. Trophies come from the career save. */
export function homeSceneHtml({ identity, frames = [], trophyCount = 0 }, lang) {
  const frameHtml = [0, 1, 2]
    .map((i) => {
      const player = frames[i];
      return player
        ? `<figure class="mw-frame">${photoImg(player, "mw-frame-photo")}<figcaption>${esc(player.name)}</figcaption></figure>`
        : `<figure class="mw-frame is-empty"><span>${T(lang, "空相框", "Empty frame")}</span></figure>`;
    })
    .join("");
  const shelf = trophyCount
    ? `<div class="mw-shelf" aria-label="${T(lang, `${trophyCount} 座冠军奖杯`, `${trophyCount} championship trophies`)}">${"🏆".repeat(Math.min(trophyCount, 5))}${trophyCount > 5 ? ` ×${trophyCount}` : ""}</div>`
    : `<div class="mw-shelf is-empty">${T(lang, "奖杯架（空）", "Trophy shelf (empty)")}</div>`;
  const plate = identity.name || T(lang, "访客球员", "Guest player");
  return `<section class="mw-card mw-home"><h3>${T(lang, "我的家 · My Home", "My Home")}</h3>
    <div class="mw-room" role="img" aria-label="${T(lang, "我的篮球房间", "My basketball room")}">
      <div class="mw-wall"><div class="mw-window"></div><div class="mw-hoop"><span class="mw-rim"></span></div><div class="mw-frames">${frameHtml}</div></div>
      <div class="mw-floor">${shelf}<div class="mw-plate">${esc(plate)}</div></div>
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

export function feedbackHtml(lang) {
  return `<section class="mw-card mw-feedback"><h3>${T(lang, "Community · 玩家建议", "Community · Feedback")}</h3>
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
  return `<header class="mw-head"><p class="mw-kicker">COURTSIDE LEGENDS · MY WORLD</p>
      <h2>${T(lang, "我的篮球人生", "My Basketball Life")}</h2></header>
    ${identityCardHtml(identity, lang)}
    <div class="mw-grid">${journeyHtml(journey, lang)}${legacyHtml(legacy, journey, lang)}</div>
    ${homeSceneHtml({ identity, frames, trophyCount: journey?.trophies?.length || 0 }, lang)}
    ${feedbackHtml(lang)}`;
}
