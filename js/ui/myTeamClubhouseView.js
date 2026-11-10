/**
 * My Team Clubhouse (integration sprint, workstream D): pure HTML builders, no DOM, no storage.
 *
 * Honesty rules (same as My World): every number comes from real account / season data —
 * championship counts from `account.myTeamSeasons`, the latest W-L from the newest record,
 * the MVP only from the current season's live report (`st.awards.mvp`). Nothing is
 * invented: no seasons means an honest empty state, a past season's MVP is not shown
 * (records don't store it), and past-season lineups are not shown (records don't store
 * them either) — the Honours room lists per-season results and star scorers instead.
 */
import { overall } from "../data/players.js";
import { photoImg } from "../data/photo.js";
import { skillNameL } from "../i18n.js";
import { SKILL_PACKS, poolRoleLine } from "../data/skills.js";
import { playerSlotPos } from "../engine/gameplan.js";
import { myTeamHistory, myTeamSeasonLine } from "./myWorldView.js";
import { ownedCards, resolveSavedLineup, validateMyTeamLineup } from "../myteam/lineup.js";
import { seasonRecordSummary } from "../myteam/seasonRecord.js";
import { reportHtml } from "./myTeamReportView.js";
import { issueText } from "./myTeamLineupView.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const T = (lang, zh, en) => (lang === "en" ? en : zh);

const SLOT_ORDER = ["PG", "SG", "SF", "PF", "C"];
/** Fixed half-court spots (basket at the top): C under the rim, wings, guards at the bottom. */
const COURT_SPOTS = [
  { left: 50, top: 10 }, // C
  { left: 24, top: 30 }, // PF
  { left: 76, top: 30 }, // SF
  { left: 14, top: 62 }, // SG
  { left: 50, top: 82 }, // PG
];

/** Everything the clubhouse renders, derived from the account + the live season only. Pure. */
export function clubhouseSummary(account, { season = null, report = null } = {}) {
  const cards = ownedCards(account);
  const resolved = resolveSavedLineup(account);
  const validation = validateMyTeamLineup(account, resolved.draft);
  const history = myTeamHistory(account?.myTeamSeasons);
  const seasons = Array.isArray(account?.myTeamSeasons) ? account.myTeamSeasons : [];
  const bench = validation.roster.filter((c) => !validation.starters.some((s) => s.id === c.id));
  return {
    guest: !account,
    cards,
    draft: resolved.draft,
    draftSource: resolved.source,
    validation,
    starters: validation.starters,
    bench,
    titles: history.titles,
    played: history.played,
    seasons,
    latest: seasons[0] || null,
    champions: seasons.filter((r) => r.champion),
    finals: seasons.filter((r) => r.finish === "finals").length,
    playoffs: seasons.filter((r) => ["playoffs", "finals", "champion"].includes(r.finish)).length,
    season: season ? { finished: !!season.myTeam?.result, report, gold: { total: season.myTeam?.goldEarned || 0, parts: season.myTeam?.goldParts || null } } : null,
  };
}

/** Up to two skill names from the card's real skill ids (Chinese names resolve via the i18n table). */
export function cardSkillNames(card, lang = "zh") {
  return (card?.skills || []).filter((id) => SKILL_PACKS[id]).slice(0, 2).map((id) => skillNameL(SKILL_PACKS[id].name, lang));
}

function heroHtml(s, lang) {
  const en = lang === "en";
  if (s.guest) {
    return `<section class="mtc-hero"><h3>${T(lang, "我的球队", "My Team")}</h3>
      <p>${T(lang, "登录或创建账号后，才能用你的收藏组建球队、打赛季、赢冠军。", "Sign in or create an account to build a team from your collection, play seasons, and win titles.")}</p>
      <button type="button" class="btn primary" data-act="accounts">${T(lang, "创建 / 登录账号", "Create / sign in")}</button></section>`;
  }
  const titleLine = s.titles
    ? `<p class="mtc-hero-titles"><span class="mtc-trophy-big">🏆</span><span class="mtc-titles-num">${s.titles}</span><span>${T(lang, "座总冠军", s.titles === 1 ? "championship" : "championships")}</span></p>`
    : `<p class="mtc-hero-titles is-empty">${T(lang, "还没有总冠军 — 拿下第一座，它会出现在这里。", "No championships yet — win your first and it will show up here.")}</p>`;
  const latest = s.latest
    ? `<p class="mtc-hero-latest">${T(lang, "最近一季", "Latest season")} · ${myTeamSeasonLine(s.latest, lang)}</p>`
    : `<p class="mtc-hero-latest">${T(lang, "还没有打过我的赛季。", "No My Team season played yet.")}</p>`;
  const perVariant = ["quick", "full"].map((v) => `<span>${esc(seasonRecordSummary(s.seasons, v, lang))}</span>`).join(" · ");
  const mvp = s.season?.report?.mvp
    ? `<p class="mtc-hero-mvp">${T(lang, "本季联赛 MVP", "League MVP this season")}：<strong>${esc(s.season.report.mvp.name)}</strong>${s.season.report.mvp.mine ? ` <em>${T(lang, "（是你的球员！）", "(your player!)")}</em>` : ""}</p>`
    : "";
  const star = s.latest?.star?.name
    ? `<p class="mtc-hero-star">${T(lang, "最近一季球队核心", "Latest season team leader")}：<strong>${esc(s.latest.star.name)}</strong> ${esc(s.latest.star.ppg)} PTS</p>`
    : "";
  return `<section class="mtc-hero">
    <p class="mtc-kicker">MY TEAM · CLUBHOUSE</p>
    <h3>${T(lang, "我的球队主场", "My Team Clubhouse")}</h3>
    ${titleLine}${latest}${star}${mvp}
    <p class="mtc-hero-meta">${perVariant}</p>
  </section>`;
}

function starterCard(card, lang) {
  const name = lang === "en" ? card.nameEn || card.name : card.name;
  return `<div class="mtc-court-card" data-card="${esc(card.id)}">
    <span class="mtc-court-photo">${photoImg(card, "headshot")}</span>
    <span class="mtc-court-name">${esc(name)}</span>
    <span class="mtc-court-meta">${esc(playerSlotPos(card))} · OVR ${overall(card)}</span>
    <button type="button" class="btn small ghost mtc-swap-btn" data-act="swap" data-card="${esc(card.id)}">${T(lang, "换人", "Swap")}</button>
  </div>`;
}

function courtHtml(s, lang) {
  const ordered = [...s.starters].sort((a, b) => {
    const ia = SLOT_ORDER.indexOf(playerSlotPos(a));
    const ib = SLOT_ORDER.indexOf(playerSlotPos(b));
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const slots = COURT_SPOTS.map((spot, i) => {
    const card = ordered[i];
    return `<div class="mtc-court-slot" style="left:${spot.left}%;top:${spot.top}%">${card ? starterCard(card, lang) : `<span class="mtc-court-empty">${T(lang, "空缺", "Open")}</span>`}</div>`;
  }).join("");
  const benchNote = s.bench.length
    ? T(lang, `替补 ${s.bench.length} 人 · 点「换人」用替补换下首发`, `${s.bench.length} on the bench · tap Swap to bring one in`)
    : T(lang, "没有替补可换 — 先在收藏里抽卡扩充名单", "No bench players to swap in — draw more cards to grow the roster");
  return `<section class="mtc-card mtc-court-sec">
    <h3>${T(lang, "首发五虎", "Starting Five")}</h3>
    <div class="mtc-court" role="img" aria-label="${T(lang, "首发五虎站位图", "Starting five court diagram")}">
      <div class="mtc-court-paint"></div><div class="mtc-court-arc"></div><div class="mtc-court-hoop"></div>
      ${slots}
    </div>
    <p class="tiny mtc-note">${benchNote}</p>
    <div class="btn-row"><button type="button" class="btn small" data-act="edit-lineup">${T(lang, "编辑阵容", "Edit lineup")}</button></div>
  </section>`;
}

function swapPickerHtml(s, swapFor, lang) {
  if (!swapFor) return "";
  const out = s.starters.find((c) => c.id === swapFor);
  const outName = out ? (lang === "en" ? out.nameEn || out.name : out.name) : swapFor;
  const rows = s.bench.map((card) => {
    const name = lang === "en" ? card.nameEn || card.name : card.name;
    return `<li><button type="button" class="mtc-pick" data-act="pick-bench" data-card="${esc(card.id)}" data-out="${esc(swapFor)}">
      <span class="mtc-pick-photo">${photoImg(card, "headshot")}</span>
      <span class="mtc-pick-name"><strong>${esc(name)}</strong><small>${esc(playerSlotPos(card))} · OVR ${overall(card)}</small></span>
    </button></li>`;
  }).join("");
  return `<section class="mtc-card mtc-picker" aria-label="${T(lang, "换人", "Swap player")}">
    <h3>${T(lang, `换下 ${outName}，换上谁？`, `Replace ${outName} with whom?`)}</h3>
    ${rows ? `<ul class="mtc-pick-list">${rows}</ul>` : `<p class="mtc-empty">${T(lang, "没有替补可换。", "No bench players to swap in.")}</p>`}
    <div class="btn-row"><button type="button" class="btn small ghost" data-act="cancel-swap">${T(lang, "取消", "Cancel")}</button></div>
  </section>`;
}

function wallCardHtml(card, lang) {
  const name = lang === "en" ? card.nameEn || card.name : card.name;
  const role = poolRoleLine(card, lang);
  const skills = cardSkillNames(card, lang);
  return `<li class="mtc-wall-card">
    <span class="mtc-wall-photo">${photoImg(card, "headshot")}</span>
    <span class="mtc-wall-ovr">OVR ${overall(card)}</span>
    <span class="mtc-wall-name"><strong>${esc(name)}</strong><small>${esc(card.season || "")} · ${esc(card.team || "")} · ${esc(playerSlotPos(card))}</small></span>
    ${role.label ? `<span class="mtc-wall-role">${esc(role.label)}</span>` : ""}
    ${skills.length ? `<span class="mtc-wall-skills">${skills.map((n) => esc(n)).join(" · ")}</span>` : ""}
  </li>`;
}

function wallHtml(s, lang) {
  const SHOWN = 12;
  const shown = s.cards.slice(0, SHOWN);
  const body = s.cards.length
    ? `<ul class="mtc-wall">${shown.map((c) => wallCardHtml(c, lang)).join("")}</ul>
       <p class="tiny mtc-note">${T(lang, `共 ${s.cards.length} 张球员卡`, `${s.cards.length} cards in your collection`)}${s.cards.length > SHOWN ? T(lang, ` · 展示最强的 ${SHOWN} 张`, ` · showing the strongest ${SHOWN}`) : ""}</p>
       <div class="btn-row"><button type="button" class="btn small ghost" data-act="open-collection">${T(lang, "打开完整收藏", "Open full collection")}</button></div>`
    : `<p class="mtc-empty">${T(lang, "还没有球员卡。先去抽卡，抽到的球员会出现在这里。", "You have no player cards yet. Draw some and they will appear here.")}</p>`;
  return `<section class="mtc-card"><h3>${T(lang, "收藏卡墙", "Collection Wall")}</h3>${body}</section>`;
}

function seasonCenterHtml(s, resume, lang) {
  const en = lang === "en";
  const season = s.season;
  const startBtns = (disabled) => `<div class="btn-row">
      <button type="button" class="btn primary" data-act="start-quick" ${disabled ? "disabled" : ""}>${T(lang, "快速赛季 · 20 场", "Quick season · 20 games")}</button>
      <button type="button" class="btn" data-act="start-full" ${disabled ? "disabled" : ""}>${T(lang, "完整赛季 · 82 场", "Full season · 82 games")}</button>
    </div>`;
  const blocking = s.validation.issues.filter((i) => i.level === "block");
  if (!season) {
    return `<section class="mtc-card"><h3>${T(lang, "赛季中心", "Season Center")}</h3>
      ${s.validation.eligible
        ? `<p class="mtc-note">${T(lang, "阵容已就绪，可以开赛。", "Your lineup is ready — start a season.")}</p>${startBtns(false)}`
        : `<p class="mtc-note">${T(lang, "阵容还不能开赛季：", "Your lineup isn't ready for a season yet:")}</p>
           <ul class="mtl-issues">${blocking.map((i) => `<li class="${i.level}">${esc(issueText(i, lang))}</li>`).join("")}</ul>
           <div class="btn-row"><button type="button" class="btn small" data-act="edit-lineup">${T(lang, "去补齐阵容", "Fix the lineup")}</button></div>`}
    </section>`;
  }
  const report = season.report ? reportHtml({ report: season.report, gold: season.gold, lang }) : "";
  if (season.finished) {
    return `<section class="mtc-card"><h3>${T(lang, "赛季中心", "Season Center")}</h3>
      ${report}
      <p class="mtc-note">${T(lang, "上个赛季已结束，战绩已记入荣誉室。再来一季？", "The last season is over and recorded in the Honours Room. Play another?")}</p>
      ${startBtns(!s.validation.eligible)}
    </section>`;
  }
  return `<section class="mtc-card"><h3>${T(lang, "赛季中心", "Season Center")}</h3>
    ${resume ? `<p class="mtc-note"><strong>${esc(resume)}</strong></p><div class="btn-row"><button type="button" class="btn primary" data-act="resume-season">${T(lang, "继续我的赛季", "Continue my season")}</button></div>` : ""}
    ${report}
  </section>`;
}

function honoursHtml(s, lang) {
  const champRows = s.champions.map((r) => {
    const date = r.finishedAt ? new Date(r.finishedAt).toLocaleDateString(lang === "en" ? "en-US" : "zh-CN") : "";
    const star = r.star?.name ? ` · ${esc(r.star.name)} ${esc(r.star.ppg)} PTS` : "";
    return `<li>🏆 ${esc(date)} · ${myTeamSeasonLine(r, lang)}${star}</li>`;
  }).join("");
  const body = s.seasons.length
    ? `<ul class="mtc-honours-list">${champRows}</ul>
       <p class="mtc-note">${T(lang, `季后赛 ${s.playoffs} 次 · 总决赛 ${s.finals} 次 · 共打了 ${s.played} 个赛季`, `${s.playoffs} playoff runs · ${s.finals} Finals · ${s.played} seasons played`)}</p>
       <ul class="mtc-honours-list mtc-history">${s.seasons.map((r) => `<li>${myTeamSeasonLine(r, lang)}</li>`).join("")}</ul>`
    : `<p class="mtc-empty">${T(lang, "还没有赛季记录。打完一个我的赛季，战绩与冠军会出现在这里。", "No season records yet. Finish a My Team season and your results and titles will show up here.")}</p>`;
  return `<section class="mtc-card"><h3>${T(lang, "荣誉室", "Honours Room")}</h3>${body}
    <p class="tiny mtc-note">${T(lang, "注：往季的首发阵容没有存档，这里只记战绩与每季核心球员。", "Note: past starting lineups are not stored — only results and each season's team leader are recorded.")}</p>
  </section>`;
}

/**
 * @param {object} p
 * @param {object} p.summary clubhouseSummary() result
 * @param {string|null} [p.resume] label of the My Team season in progress
 * @param {string|null} [p.swapFor] starter card id whose bench picker is open
 * @param {string} [p.notice] last swap / save message
 * @param {string} [p.lang]
 */
export function clubhouseHtml({ summary: s, resume = null, swapFor = null, notice = "", lang = "zh" }) {
  if (!s) return "";
  return `<div class="mtc">
    ${heroHtml(s, lang)}
    ${s.guest ? "" : `${courtHtml(s, lang)}${swapPickerHtml(s, swapFor, lang)}${wallHtml(s, lang)}${seasonCenterHtml(s, resume, lang)}${honoursHtml(s, lang)}`}
    ${notice ? `<p class="mtc-notice" role="status">${esc(notice)}</p>` : ""}
  </div>`;
}
