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
import { challengeTierName } from "../data/careerChallenges.js";
import { photoImg } from "../data/photo.js";
import { recordLineup } from "../myteam/seasonRecord.js";
import { FIGURE_STYLES } from "../data/avatarLook.js";
import { architectProgress, architectTitlesFor } from "../career/careerAchievements.js";
import { getShop, equippedClothingItemId } from "../data/shop.js";
import { SHOP_ITEMS, itemById, itemName } from "../data/shopCatalog.js";
import { lockerRoomSvg } from "./myWorldStage.js";
import { titleIconOf } from "./legacyMuseumView.js";
import { lookPanelHtml } from "./avatarLookView.js";
import { resolveHome } from "../data/homeLayout.js";
import { renderIsoRoom } from "./myHome/isoRoom.js";
import { PROFILE_LIMITS } from "../data/profile.js";
import { teamNameL } from "../i18n.js";

/** A real, public feedback channel: the project's own GitHub issue tracker. */
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
    myTeam: myTeamHistory(account.myTeamSeasons),
    // Prestige titles, derived from the account's completed-career records (E).
    architect: { earned: architectTitlesFor(account), progress: architectProgress(account) },
  };
}

/** My Team Season honours from the account's finished-season list (newest first). Titles are counted, never summed across 20/82. */
export function myTeamHistory(list) {
  const seasons = (Array.isArray(list) ? list : []).filter((r) => r && r.seasonId);
  return { titles: seasons.filter((r) => r.champion).length, played: seasons.length, recent: seasons.slice(0, 3) };
}

const FINISH_TEXT = { champion: ["总冠军", "Champions"], finals: ["总决赛", "Finals"], playoffs: ["季后赛", "Playoffs"], missed: ["未进季后赛", "Missed playoffs"] };
export function myTeamSeasonLine(r, lang) {
  const f = FINISH_TEXT[r.finish || (r.champion ? "champion" : "missed")] || FINISH_TEXT.missed;
  const len = r.variant === "full" ? T(lang, "82 场", "82 games") : T(lang, "20 场", "20 games");
  const star = r.star?.name ? ` · ${esc(r.star.name)} ${esc(r.star.ppg)}` : "";
  return `${len} · ${esc(r.w)}-${esc(r.l)} · ${T(lang, f[0], f[1])}${star}`;
}

/**
 * Championship celebration data for the identity Hero (Workstream A). Honest by
 * construction: null when the account has no titles at all. `five` is the saved
 * starting five of the most recent My Team title — recordLineup() returns [] when
 * the record has no full five (e.g. an older title outside the 3-season recent
 * window), so a title never invents its heroes. Career-only titles celebrate
 * with the trophy count and no five.
 */
export function championCelebration(legacy, careerTrophies = 0, lang = "zh") {
  const myTeamTitles = legacy?.myTeam?.titles || 0;
  const titles = myTeamTitles + (careerTrophies || 0);
  if (!titles) return null;
  const champ = (legacy?.myTeam?.recent || []).find((r) => r.champion);
  return {
    titles,
    five: champ ? recordLineup(champ) : [],
    line: champ ? myTeamSeasonLine(champ, lang) : "",
  };
}

function championBandHtml(champ, lang) {
  const five = champ.five.length
    ? `<ul class="mw-champion-five">${champ.five
        .map((c) => `<li>${photoImg(c, "headshot sm")}<span class="mw-champ-name">${esc(c.name)}</span><span class="mw-champ-meta">${esc(c.pos)} · OVR ${esc(c.ovr)}</span></li>`)
        .join("")}</ul>`
    : "";
  return `<div class="mw-champion" role="group" aria-label="${T(lang, "总冠军庆祝", "Championship celebration")}">
    <p class="mw-champion-title">🏆 ${T(lang, `总冠军 ×${champ.titles}`, `Champions ×${champ.titles}`)}</p>
    ${champ.line ? `<p class="mw-champion-line">${esc(champ.line)}</p>` : ""}
    ${five}
  </div>`;
}

const ICONS = {
  games: '<path d="M12 3a9 9 0 100 18 9 9 0 000-18zm0 0v18M3 12h18M6 5.5c3 3 3 10 0 13m12-13c-3 3-3 10 0 13" />',
  legacy: '<path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5v2a3 3 0 003 3m8-5h3v2a3 3 0 01-3 3M12 13v4m-3 3h6M10 17h4" />',
};
const icon = (name) => `<svg class="mw-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false">${ICONS[name]}</svg>`;

/** `portrait` is portraitFor()'s result; `frame` is a shop frame id (e.g. "gold") — a CSS class on the portrait wrapper. */
/** One stat in the hero's row; a missing value (guest) is simply not drawn, never a fake 0. */
const heroStat = (value, label) => (value == null ? "" : `<div class="mw-hero-stat"><dt>${label}</dt><dd>${value}</dd></div>`);

/**
 * The player's identity Hero: portrait, name, hometown, level + XP bar, the three headline numbers and the edit
 * actions, in ONE panel (it used to be three: identity card, account-level card and a second name/level in the showcase).
 * `extras.level` = levelSnapshot (or null); `extras.stats` = { titles, cards, rankedWins } (or null for a guest).
 * `extras.champion` = championCelebration() result (or null) — the celebration band renders only then.
 */
export function identityCardHtml(identity, lang, portrait = null, frame = null, extras = {}) {
  const name = identity.name || T(lang, "访客球员", "Guest player");
  const facts = identity.hometown ? `${T(lang, "来自", "From")} ${esc(identity.hometown)}` : T(lang, "家乡未填写", "Hometown not set");
  // M4-A: the three structured identity places (ADR-004 D1). Only set ones are shown; the old hometown
  // free text above is never derived from these and never overwritten by them.
  const places = identity.identityPlaces || {};
  const placeFacts = [
    places.birthplace ? `${T(lang, "出生于", "Born in")} ${esc(places.birthplace)}` : "",
    places.grewUpIn ? `${T(lang, "成长于", "Grew up in")} ${esc(places.grewUpIn)}` : "",
    places.representedCity ? `${T(lang, "代表", "Representing")} ${esc(places.representedCity)}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const placesHtml = placeFacts ? `<p class="mw-facts mw-places">${placeFacts}</p>` : "";
  const note = identity.guest
    ? `<p class="mw-note">${T(lang, "访客资料只保存在这台设备的浏览器里。创建账号后，在账号下重新编辑即可保存到账号。", "Guest profiles live only in this browser on this device. Create an account and edit again to keep it with the account.")}</p>`
    : "";
  const stats = extras.stats
    ? `<dl class="mw-hero-stats">${heroStat(extras.stats.titles, T(lang, "总冠军", "Titles"))}${heroStat(extras.stats.cards, T(lang, "球员卡", "Cards"))}${heroStat(extras.stats.rankedWins, T(lang, "排位胜场", "Ranked wins"))}</dl>`
    : "";
  // The 3D face is still experimental: whoever picked it gets a one-tap way back to an illustration (never forced).
  const backToArt = `<button type="button" class="btn ghost mw-on-dark" data-mw-action="use-preset-portrait"${portrait?.kind === "3d" ? "" : " hidden"}>${T(lang, "换成插画头像", "Use an illustration")}</button>`;
  const editButtons = `${action("toggle-look", T(lang, "编辑形象", "Edit look"), "btn mw-gold")}${action("edit-identity", T(lang, "编辑资料", "Edit profile"), "btn ghost mw-on-dark")}${action("open-home", T(lang, "进入我的家", "Enter My Home"), "btn ghost mw-on-dark")}${backToArt}`;
  return `<section class="mw-identity mw-hero" aria-labelledby="mw-identity-title">
    <div class="mw-hero-stage">${showcaseHtml({ identity, look: extras.look }, lang)}</div>
    <div class="mw-hero-side">
      <div class="mw-hero-info">
        <div class="mw-namebar">
          <div class="mw-portrait${frame ? ` mw-frame-${frame}` : ""}"><img class="mw-avatar" src="${esc(portrait?.src || avatarDataUri({ name, team: "NBA" }))}" alt="" width="56" height="56" /></div>
          <div class="mw-namebar-text">
            <h3 id="mw-identity-title">${esc(name)}</h3>
            <p class="mw-facts">${facts}</p>
            ${placesHtml}
          </div>
        </div>
        ${stats}
        ${levelHtml(extras.level, lang)}
        ${extras.champion ? championBandHtml(extras.champion, lang) : ""}
        <p class="mw-bio">${identity.bio ? esc(identity.bio) : T(lang, "还没有个人简介。写一句话介绍你的篮球人生。", "No bio yet. Write one line about your basketball life.")}</p>
        <div class="mw-hero-actions btn-row">${editButtons}</div>
        <p class="mw-status" id="mw-hero-status" role="status" aria-live="polite"></p>
        ${note}
        <form class="mw-form" id="mw-identity-form" hidden>
          <label>${T(lang, "昵称", "Display name")}<input name="name" maxlength="${PROFILE_LIMITS.name}" value="${esc(identity.name)}" /></label>
          <label>${T(lang, "家乡", "Hometown")}<input name="hometown" maxlength="${PROFILE_LIMITS.hometown}" value="${esc(identity.hometown)}" /></label>
          <label>${T(lang, "出生地", "Birthplace")}<input name="birthplace" maxlength="${PROFILE_LIMITS.identityPlace}" value="${esc(places.birthplace)}" /></label>
          <label>${T(lang, "成长城市", "Grew up in")}<input name="grewUpIn" maxlength="${PROFILE_LIMITS.identityPlace}" value="${esc(places.grewUpIn)}" /></label>
          <label>${T(lang, "代表城市", "Representing")}<input name="representedCity" maxlength="${PROFILE_LIMITS.identityPlace}" value="${esc(places.representedCity)}" /></label>
          <label>${T(lang, "个人简介", "Bio")}<textarea name="bio" rows="2" maxlength="${PROFILE_LIMITS.bio}">${esc(identity.bio)}</textarea></label>
          <div class="btn-row">
            <button type="submit" class="btn small mw-gold">${T(lang, "保存", "Save")}</button>
            ${action("cancel-identity", T(lang, "取消", "Cancel"), "btn small ghost mw-on-dark")}
          </div>
          <p class="mw-status" role="status" aria-live="polite"></p>
        </form>
      </div>
      ${extras.editorHtml || ""}
    </div>
  </section>`;
}

const cardHead = (ico, title) => `<h3>${icon(ico)}<span>${title}</span></h3>`;

const kindLabel = (kind, lang) => (kind === "timeTravel" ? T(lang, "穿越生涯", "Time-Travel Career") : T(lang, "联盟经理", "Franchise"));

/**
 * One save row. Unassociated (pre-ownership local) saves say so and can be continued, claimed or deleted; the
 * guest's save, seen by a signed-in account, can only be claimed (it isn't this account's to play or delete).
 */
function gameRow({ title, sub, state, resume, claim, remove }, canClaim, lang) {
  const local = state === "unassociated";
  const guest = state === "guest";
  const badge = local
    ? `<p class="mw-local">${T(lang, "本机存档 · 未关联账号", "Local save · not linked to an account")}${canClaim ? "" : ` · ${T(lang, "登录账号后可认领", "sign in to claim it")}`}</p>`
    : guest
      ? `<p class="mw-local">${T(lang, "访客存档 · 认领后才能用这个账号继续", "Guest save · claim it to continue on this account")}</p>`
      : "";
  const buttons = [
    !guest && resume ? action(resume, T(lang, "继续", "Continue"), "btn small continue") : "",
    (local || guest) && canClaim ? action(claim, T(lang, "认领到我的账号", "Claim for my account"), "btn small ghost") : "",
    local && remove ? action(remove, T(lang, "删除", "Delete"), "btn small ghost") : "",
  ].join("");
  return `<li class="mw-game"><div class="mw-game-text"><p class="mw-line">${title}</p><p class="mw-line tiny">${sub}</p>${badge}</div>
    <div class="mw-game-actions">${buttons}</div></li>`;
}

const ARCHIVE_SHOWN = 5;

/** A finished gold-challenge run: read-only on purpose (no Continue, no Delete) -- it is a record, not a save. */
function archiveRow(e, lang) {
  const tier = challengeTierName(e.tier === "custom" ? "gold" : e.tier, lang);
  const result = e.outcome === "champion"
    ? T(lang, "通关夺冠", "Champions")
    : e.finals ? T(lang, "总决赛出局", "Lost in the Finals") : T(lang, "淘汰出局", "Eliminated");
  const date = new Date(e.finishedAt).toLocaleDateString(lang === "en" ? "en-US" : "zh-CN");
  const team = e.teamName ? teamNameL(e.teamName, lang) : T(lang, "未命名球队", "Unnamed team");
  const stars = e.roster.length ? ` · ${e.roster.map((p) => esc(p.name)).join(lang === "en" ? ", " : "、")}` : "";
  return `<li class="mw-game mw-archive"><div class="mw-game-text">
    <p class="mw-line"><strong>${esc(tier)}</strong> · ${esc(result)}</p>
    <p class="mw-line tiny">${esc(team)} · ${T(lang, `第 ${e.round} 轮 · 负 ${e.losses} 场`, `Round ${e.round} · ${e.losses} loss(es)`)} · ${esc(date)}${stars}</p>
    <p class="mw-local">${T(lang, "已结束 · 只读记录，不能继续", "Finished · read-only record, cannot be continued")}</p>
  </div></li>`;
}

/**
 * "My Games": every save this player may see -- their own, plus unassociated local saves. Saves owned by
 * another account are never passed in (the screen filters them out), so nothing here can leak them.
 * games = { career: { journey, state } | null, session: { label, state } | null, season: { label, state } | null, canClaim }
 */
export function gamesHtml(games, lang) {
  const title = cardHead("games", T(lang, "我的游戏记录", "My Games"));
  const rows = [];
  const career = games?.career;
  if (career?.journey) {
    const j = career.journey;
    const team = j.teamName ? teamNameL(j.teamName, lang) : T(lang, "未命名球队", "Unnamed team");
    rows.push(gameRow({
      title: `<strong>${esc(kindLabel(j.kind, lang))}</strong> · ${esc(team)}`,
      sub: `${esc(j.startYear ?? "—")} → ${esc(j.year ?? "—")} · ${T(lang, `已完成 ${j.seasonsDone} 个赛季`, `${j.seasonsDone} season(s) completed`)}`,
      state: career.state, resume: "resume-career", claim: "claim-career", remove: "delete-career",
    }, games.canClaim, lang));
  }
  const session = games?.session;
  if (session) {
    rows.push(gameRow({
      title: `<strong>${T(lang, "中途进度", "Game in progress")}</strong>`, sub: esc(session.label || ""),
      state: session.state, resume: "resume-session", claim: "claim-session", remove: "delete-session",
    }, games.canClaim, lang));
  }
  const season = games?.season; // listed only when it is unlinked or the guest's (yours continue from the season screen)
  if (season) {
    rows.push(gameRow({
      title: `<strong>${T(lang, "单赛季", "Single season")}</strong>`, sub: esc(season.label || ""),
      state: season.state, claim: "claim-season", remove: "delete-season",
    }, games.canClaim, lang));
  }
  const myteam = games?.myteam; // My Team season: yours continue here too; unlinked/guest ones can be claimed or deleted
  if (myteam) {
    rows.push(gameRow({
      title: `<strong>${T(lang, "我的赛季", "My Team season")}</strong>`, sub: esc(myteam.label || ""),
      state: myteam.state, resume: "resume-myteam", claim: "claim-myteam", remove: "delete-myteam",
    }, games.canClaim, lang));
  }
  const archive = Array.isArray(games?.archive) ? games.archive : [];
  for (const e of archive.slice(0, ARCHIVE_SHOWN)) rows.push(archiveRow(e, lang));
  if (archive.length > ARCHIVE_SHOWN) rows.push(`<li class="mw-game mw-archive"><p class="mw-line tiny">${T(lang, `另有 ${archive.length - ARCHIVE_SHOWN} 条更早的记录`, `${archive.length - ARCHIVE_SHOWN} older record(s) not shown`)}</p></li>`);
  if (!rows.length) {
    return `<section class="mw-card">${title}
      <p class="mw-empty">${T(lang, "还没有进行中的生涯。", "No career in progress yet.")}</p>
      ${action("start-career", T(lang, "去开始一段生涯", "Start a career"))}</section>`;
  }
  return `<section class="mw-card">${title}<ul class="mw-games">${rows.join("")}</ul>
    <p class="mw-status" id="mw-games-status" role="status" aria-live="polite"></p></section>`;
}

export function legacyHtml(legacy, journey, lang) {
  const trophies = journey?.trophies || [];
  const mt = legacy?.myTeam;
  const mtTitles = mt?.titles ? `<li>🏆 ${T(lang, `我的赛季 · ${mt.titles} 座总冠军`, `My Team seasons · ${mt.titles} title(s)`)}</li>` : "";
  const trophyLine = trophies.length || mtTitles
    ? `<ul class="mw-trophies">${trophies.map((t) => `<li>🏆 ${esc(t.year)} · ${esc(teamNameL(t.teamName || "", lang))}</li>`).join("")}${mtTitles}</ul>`
    : `<p class="mw-empty">${T(lang, "还没有冠军。拿下总冠军后会出现在这里。", "No championships yet. Titles you win will show up here.")}</p>`;
  const mtRecent = mt?.recent?.length
    ? `<p class="mw-line tiny"><strong>${T(lang, "我的赛季记录", "My Team seasons")}</strong></p><ul class="mw-trophies mw-myteam-hist">${mt.recent.map((r) => `<li>${myTeamSeasonLine(r, lang)}</li>`).join("")}</ul>`
    : "";
  const architect = architectTitlesHtml(legacy?.architect, lang);
  const collection = legacy
    ? `<p class="mw-line tiny">${T(lang, `图鉴 ${legacy.codex} 人`, `${legacy.codex} in codex`) /* cards + ranked wins are in the hero; no second copy */}</p>
       ${legacy.cards ? action("open-collection", T(lang, "打开我的球员卡", "Open my cards")) : `<p class="mw-empty">${T(lang, "还没有球员卡。", "No cards yet.")}</p>`}`
    : `<p class="mw-empty">${T(lang, "访客没有永久收藏。创建账号后可以收集球员卡。", "Guests have no permanent collection. Create an account to collect cards.")}</p>
       ${action("open-accounts", T(lang, "创建或切换账号", "Create or switch account"))}`;
  return `<section class="mw-card">${cardHead("legacy", T(lang, "传奇荣誉", "Legacy"))}${trophyLine}${mtRecent}${architect}${collection}</section>`;
}

/**
 * Prestige (Architect) titles on the My World honours wall. `architect` is
 * legacyFromAccount()'s derived summary; null/undefined = guest, no block.
 * Earned titles are lifetime honours; before the unlock the block shows the
 * honest progress (which of the two qualifying careers is done), the same
 * progress the career entry card already shows. Title names come from
 * careerAchievements.js (the Chinese names are still the agent's provisional
 * wording, pending the user's confirmation).
 */
export function architectTitlesHtml(architect, lang) {
  if (!architect) return "";
  const earned = Array.isArray(architect.earned) ? architect.earned : [];
  const head = `<p class="mw-line tiny"><strong>${T(lang, "建筑师称号", "Architect Titles")}</strong></p>`;
  if (earned.length) {
    // Earned titles open the Legacy Museum (the career legacy detail view);
    // locked/progress state has nothing to show, so it stays plain text.
    return `${head}<ul class="mw-trophies">${earned.map((t) => `<li class="mw-title-item"><button type="button" class="mw-title-btn mw-title-btn--${esc(t.id)}" data-mw-action="open-legacy-museum" data-title="${esc(t.id)}" title="${esc(T(lang, "查看生涯传承", "View career legacy"))}"><span aria-hidden="true">${titleIconOf(t.id)}</span> ${esc(lang === "en" ? t.en : t.zh)}</button></li>`).join("")}</ul>`;
  }
  const p = architect.progress || {};
  const mark = (done) => (done ? "✓" : "○");
  return `${head}<p class="mw-line tiny">${T(lang, `教练生涯 ${mark(p.coach)} · 经理生涯 ${mark(p.gm)}`, `Coach career ${mark(p.coach)} · GM career ${mark(p.gm)}`)}<br />${T(lang, "完成一次完整教练生涯与一次完整经理生涯，即可解锁隐藏职业 The Architect。", "Complete one full Coach career and one full GM career to unlock the hidden Architect career.")}</p>`;
}

/**
 * My World keeps a compact preview of the home (the same isometric room as the My Home screen, without hit areas)
 * and a door into the full space. Everything in it is real: trophies from the career save, frames = best cards,
 * furniture = what the shop sold this account, in the layout the player arranged.
 */
export function homeSceneHtml({ identity, frames = [], trophyCount = 0, furniture = [], layout = null, portrait = null }, lang) {
  const placed = resolveHome(furniture, layout);
  const room = renderIsoRoom({
    placed,
    trophyCount,
    cards: frames,
    portrait: portrait?.src || null,
    name: identity.name,
    lang,
  });
  const names = placed.map((p) => SHOP_ITEMS.find((i) => i.effect?.type === "furniture" && i.effect.furnitureId === p.id)).filter(Boolean).map((i) => itemName(i, lang));
  const placedNote = names.length ? `${T(lang, `已摆放${names.join("、")}。`, `Placed: ${names.join(", ")}. `)}` : "";
  return `<section class="mw-card mw-home"><h3>${T(lang, "我的家 · My Home", "My Home")}</h3>
    <div class="mw-room" role="img" aria-label="${T(lang, "我的篮球房间", "My basketball room")}">${room}</div>
    <p class="tiny mw-note">${placedNote}${T(lang, "相框挂着你账号里最强的三张球员卡；奖杯来自你的生涯存档；家具来自商城。", "Frames hold the three best cards on your account; trophies come from your career save; furniture comes from the Shop.")}</p>
    <div class="btn-row"><button type="button" class="btn small mw-gold" data-mw-action="open-home">${T(lang, "🏠 进入我的家", "🏠 Enter My Home")}</button><button type="button" class="btn small ghost" data-mw-action="open-shop" data-shop-category="home">${T(lang, "🛍️ 逛商城 · 家具", "🛍️ Shop · Furniture")}</button></div>
  </section>`;
}

/** Championship count shown in the home: trophies of the player's own career + My Team season titles. */
export function trophyCountOf(games, legacy) {
  const ownedCareer = games?.career?.state === "mine" ? games.career.journey : null; // trophies only from a career that is yours
  return (ownedCareer?.trophies?.length || 0) + (legacy?.myTeam?.titles || 0);
}

/**
 * Account Level card (v1): level badge + title + XP bar + reward track.
 * `snapshot` is accountLevel.levelSnapshot() (null = no data, section omitted).
 * Cosmetic rewards are unlocked entitlements in v1 — claiming records them;
 * gold / packs grant for real. Guests see the card too; gold / pack claims
 * ask them to create an account first (handled by the screen).
 */
/** The level block inside the hero: badge + title, XP bar, one line of numbers, and the (hidden) reward track. */
export function levelHtml(snapshot, lang) {
  if (!snapshot) return "";
  const rows = snapshot.track.map((entry) => {
    const btn = entry.state === "available"
      ? `<button type="button" class="btn small mw-gold" data-mw-action="claim-level-reward" data-level="${entry.level}">${T(lang, "领取", "Claim")}</button>`
      : entry.state === "claimed"
        ? `<span class="mw-level-state">${T(lang, "✓ 已领取", "✓ Claimed")}</span>`
        : `<span class="mw-level-state">${T(lang, `Lv.${entry.level} 解锁`, `Unlocks at Lv.${entry.level}`)}</span>`;
    return `<li class="mw-level-row"><span class="mw-level-lv">Lv.${entry.level}</span><span class="mw-level-reward">${esc(entry.label)}</span>${btn}</li>`;
  }).join("");
  const left = snapshot.xpForNext - snapshot.xpIntoLevel;
  const next = snapshot.isMax
    ? T(lang, "已满级 · 传奇荣誉（Legacy Rank）即将到来", "Max level · Legacy Rank is coming")
    : T(lang, `距 Lv.${snapshot.level + 1} 还差 ${left} XP`, `${left} XP to Lv.${snapshot.level + 1}`);
  return `<div class="mw-hero-level">
    <p class="mw-level-hero"><span class="mw-level-num">Lv.${snapshot.level}</span><span class="mw-level-title">${esc(lang === "en" ? snapshot.titleEn : snapshot.title)}</span></p>
    <div class="mw-level-bar" role="progressbar" aria-valuenow="${snapshot.pct}" aria-valuemin="0" aria-valuemax="100" aria-label="${T(lang, "账号经验进度", "Account XP progress")}"><div class="mw-level-fill" style="width: ${snapshot.pct}%"></div></div>
    <p class="mw-level-line"><span>${snapshot.xpIntoLevel} / ${snapshot.xpForNext} XP</span><span>${next}</span><button type="button" class="mw-link" data-mw-action="toggle-level-track" aria-expanded="false" aria-controls="mw-level-track">${T(lang, "等级奖励", "Rewards")}</button></p>
    <ul class="mw-level-track" id="mw-level-track" hidden>${rows}</ul>
    <p class="mw-status" id="mw-level-status" role="status" aria-live="polite"></p>
  </div>`;
}

export function myWorldHtml({ identity, games, journey, legacy, frames, look, portrait = null, level = null, furniture = [], homeLayout = null, frame = null, ownedOutfits = null, owned = null }, lang) {
  // `journey` alone = the player's own career (kept so callers/tests that predate ownership read the same).
  const g = games ?? { career: journey ? { journey, state: "mine" } : null, session: null, canClaim: !identity?.guest };
  const ownedCareer = g.career?.state === "mine" ? g.career.journey : null; // trophies only from a career that is yours
  const titles = trophyCountOf(g, legacy);
  const stats = legacy ? { titles, cards: legacy.cards, rankedWins: legacy.rankedWins } : null; // a guest has no collection or ranked record
  const champion = championCelebration(legacy, ownedCareer?.trophies?.length || 0, lang);
  return `<div class="mw-top"><span class="mw-kicker">MY WORLD</span></div>
    ${identityCardHtml(identity, lang, portrait, frame, { level, stats, champion, look, editorHtml: lookPanelHtml(look, identity?.name, lang, portrait, ownedOutfits) })}
    <div class="mw-grid">${gamesHtml(g, lang)}${legacyHtml(legacy, ownedCareer, lang)}</div>
    ${homeSceneHtml({ identity, frames, trophyCount: titles, furniture, layout: homeLayout, portrait }, lang)}
    ${ownedShopHtml(owned, lang)}`;
}

/**
 * Character showcase (integration sprint, workstream D): the player's 3D figure, prominent
 * and always visible — the screen mounts the 3D viewer into #mw-showcase-stage on render
 * and the static portrait stays as the honest fallback when WebGL can't run.
 * The Stylized / Bobblehead switch is the same `look.figure` the editor writes, so the
 * switch and the editor can never disagree.
 */
export function showcaseHtml({ identity, look }, lang) {
  const name = identity?.name || T(lang, "访客球员", "Guest player");
  const figure = look?.figure || "stylized";
  const switchBtns = FIGURE_STYLES.map((f) => `<button type="button" class="btn small ${figure === f.id ? "mw-gold" : "ghost mw-on-dark"}" data-mw-action="showcase-figure" data-figure="${f.id}" aria-pressed="${figure === f.id}">${esc(T(lang, f.zh, f.en))}</button>`).join("");
  return `<section class="mw-showcase" aria-label="${T(lang, "我的形象展示", "My character showcase")}">
    <div class="mw-showcase-stage" id="mw-showcase-stage">
      ${lockerRoomSvg()}
      <img class="mw-showcase-static" src="${esc(avatarDataUri({ name, team: "NBA" }))}" alt="" width="140" height="140" />
    </div>
    <div class="mw-showcase-bar">
      <div class="btn-row" role="group" aria-label="${T(lang, "形象风格", "Character style")}">${switchBtns}</div>
      <span class="mw-showcase-hint">${T(lang, "拖动形象可以旋转", "Drag the figure to turn it")}</span>
    </div>
    <p class="mw-status" id="mw-showcase-status" role="status" aria-live="polite"></p>
  </section>`;
}

/**
 * Owned shop items, read from the SAME account.shop state the shop writes
 * (workstream C owns shop.js; this only reads it through its public API).
 * `Object.keys(shop.owned)` keeps insertion order, which is purchase order —
 * that is what "recently bought" means here (the shop stores no timestamps).
 * null = guest (no owned items exist).
 */
export function ownedShopSummary(account) {
  if (!account) return null;
  const shop = getShop(account);
  const items = Object.keys(shop.owned).map((id) => itemById(id)).filter(Boolean);
  const equippedOutfit = equippedClothingItemId(account);
  return {
    recent: items.slice(-3).reverse(),
    outfits: items.filter((i) => i.effect?.type === "outfit").map((i) => ({ item: i, equipped: equippedOutfit === i.id })),
    frames: items.filter((i) => i.effect?.type === "frame").map((i) => ({ item: i, equipped: shop.equippedFrame === i.id })),
    furniture: items.filter((i) => i.effect?.type === "furniture"),
    tickets: shop.tickets,
  };
}

function ownedRow(entry, lang) {
  const { item } = entry;
  const name = esc(itemName(item, lang));
  if (entry.kind === "furniture") {
    return `<li class="mw-owned-row"><span class="mw-owned-name">${name}</span><span class="mw-owned-state">${T(lang, "✓ 已摆放在 My Home", "✓ Placed in My Home")}</span></li>`;
  }
  const equipped = entry.equipped;
  const btn = equipped
    ? action("unequip-owned", T(lang, "取下", "Take off"), "btn small ghost")
    : action("equip-owned", entry.kind === "frame" ? T(lang, "设为头像框", "Set as portrait frame") : T(lang, "穿上", "Wear it"), "btn small mw-gold");
  return `<li class="mw-owned-row"><span class="mw-owned-name">${name}</span>${equipped ? `<span class="mw-owned-state">${T(lang, "✓ 正在使用", "✓ In use")}</span>` : ""}<span class="mw-owned-actions" data-item="${esc(item.id)}">${btn}</span></li>`;
}

export function ownedShopHtml(owned, lang) {
  const head = `<h3>${T(lang, "我的物品 · 已拥有", "My Items · Owned")}</h3>`;
  if (owned === null) {
    return `<section class="mw-card mw-owned">${head}
      <p class="mw-empty">${T(lang, "访客没有已购物品。创建账号后，在商城买的商品会出现在这里，可以直接穿上或摆进房间。", "Guests have no purchased items. Create an account and the things you buy in the Shop will show up here, ready to wear or place in your room.")}</p>
      ${action("open-accounts", T(lang, "创建或切换账号", "Create or switch account"))}</section>`;
  }
  const hasAnything = owned.recent.length || owned.tickets > 0;
  if (!hasAnything) {
    return `<section class="mw-card mw-owned">${head}
      <p class="mw-empty">${T(lang, "还没有在商城买过东西。买到的衣服、头像框、家具会在这里出现，直接穿上或摆进房间。", "Nothing bought in the Shop yet. Clothes, frames and furniture you buy will show up here, ready to wear or place in your room.")}</p>
      ${action("open-shop", T(lang, "🛍️ 去商城看看", "🛍️ Browse the Shop"))}</section>`;
  }
  const recent = owned.recent.length
    ? `<p class="mw-line tiny"><strong>${T(lang, "最近购买", "Recently bought")}</strong></p>
       <ul class="mw-owned-list">${owned.recent.map((item) => {
         const kind = item.effect?.type;
         if (kind === "furniture") return ownedRow({ item, kind }, lang);
         const equipped = kind === "outfit" ? owned.outfits.find((o) => o.item.id === item.id)?.equipped : owned.frames.find((o) => o.item.id === item.id)?.equipped;
         return ownedRow({ item, kind, equipped: !!equipped }, lang);
       }).join("")}</ul>`
    : "";
  const outfits = owned.outfits.length
    ? `<p class="mw-line tiny"><strong>${T(lang, "服装", "Outfits")}</strong></p><ul class="mw-owned-list">${owned.outfits.map((o) => ownedRow({ ...o, kind: "outfit" }, lang)).join("")}</ul>` : "";
  const frames = owned.frames.length
    ? `<p class="mw-line tiny"><strong>${T(lang, "头像框", "Portrait frames")}</strong></p><ul class="mw-owned-list">${owned.frames.map((o) => ownedRow({ ...o, kind: "frame" }, lang)).join("")}</ul>` : "";
  const furniture = owned.furniture.length
    ? `<p class="mw-line tiny"><strong>${T(lang, "家具", "Furniture")}</strong></p><ul class="mw-owned-list">${owned.furniture.map((i) => ownedRow({ item: i, kind: "furniture" }, lang)).join("")}</ul>` : "";
  const tickets = owned.tickets > 0
    ? `<p class="mw-line tiny"><strong>${T(lang, `托管卡 ${owned.tickets} 张`, `${owned.tickets} Auto-Play Ticket(s)`)}</strong> · ${T(lang, "在赛季中心用现有引擎模拟常规赛。", "Use them in the Season Center to simulate regular-season games.")}</p>` : "";
  return `<section class="mw-card mw-owned">${head}${recent}${outfits}${frames}${furniture}${tickets}
    <p class="mw-status" id="mw-owned-status" role="status" aria-live="polite"></p></section>`;
}
