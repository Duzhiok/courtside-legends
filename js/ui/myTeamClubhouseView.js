/**
 * My Team Clubhouse (integration sprint, workstream D): pure HTML builders, no DOM, no storage.
 *
 * Honesty rules (same as My World): every number comes from real account / season data —
 * championship counts from `account.myTeamSeasons`, the latest W-L from the newest record,
 * the MVP only from the current season's live report (`st.awards.mvp`). Nothing is
 * invented: no seasons means an honest empty state, a past season's MVP is not shown
 * (records don't store it). A past season's starting five is shown only when that season's
 * record actually saved it (see seasonRecord.startingFiveSnapshot); older seasons just show their
 * result — nothing is reconstructed from today's collection.
 */
import { overall } from "../data/players.js";
import { photoImg } from "../data/photo.js";
import { skillNameL } from "../i18n.js";
import { SKILL_PACKS, poolRoleLine } from "../data/skills.js";
import { playerSlotPos } from "../engine/gameplan.js";
import { myTeamHistory } from "./myWorldView.js";
import { ownedCards, resolveSavedLineup, validateMyTeamLineup } from "../myteam/lineup.js";
import { recordLineup } from "../myteam/seasonRecord.js";
import { reportHtml } from "./myTeamReportView.js";
import { issueText } from "./myTeamLineupView.js";
import { esc, T, displayName } from "./myTeamViewKit.js";
import { courtHtml } from "./myTeamCourtView.js";
import { honoursHtml } from "./myTeamHonoursView.js";

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
    finals: seasons.filter((r) => ["finals", "champion"].includes(r.finish)).length, // a champion has played the Finals too
    playoffs: seasons.filter((r) => ["playoffs", "finals", "champion"].includes(r.finish)).length,
    season: season ? { finished: !!season.myTeam?.result, report, gold: { total: season.myTeam?.goldEarned || 0, parts: season.myTeam?.goldParts || null } } : null,
  };
}

/** Up to two skill names from the card's real skill ids (Chinese names resolve via the i18n table). */
export function cardSkillNames(card, lang = "zh") {
  return (card?.skills || []).filter((id) => SKILL_PACKS[id]).slice(0, 2).map((id) => skillNameL(SKILL_PACKS[id].name, lang));
}

/** The one thing to do next, from the real state: continue a live season, fix a lineup that can't play, or play on. */
function heroAction(s, resume, lang) {
  if (resume || (s.season && !s.season.finished)) {
    return { act: "resume-season", label: T(lang, "继续我的赛季", "Continue my season"), sub: resume || "" };
  }
  if (!s.validation.eligible) return { act: "edit-lineup", label: T(lang, "去补齐阵容", "Fix the lineup"), sub: "" };
  const full = s.latest?.variant === "full";
  const len = full ? T(lang, "82 场", "82 games") : T(lang, "20 场", "20 games");
  const first = !s.latest && !s.season?.finished;
  return {
    act: full ? "start-full" : "start-quick",
    label: first ? T(lang, `开始我的第一个赛季 · ${len}`, `Start my first season · ${len}`) : T(lang, `再来一季 · ${len}`, `Play another season · ${len}`),
    sub: "",
  };
}

/**
 * Whose portrait fronts the hero. After a title it is that season's best starter — but only when the record saved the
 * lineup; otherwise (and before any title) it is today's best starter, labelled as such, never passed off as the champion.
 */
function featuredPlayer(s, lang) {
  const five = s.latest?.champion ? recordLineup(s.latest) : [];
  if (five.length) {
    const top = [...five].sort((a, b) => b.ovr - a.ovr)[0];
    return { player: { id: top.id, bref: top.bref, name: top.name, nameEn: top.nameEn, season: top.season, team: top.team }, ovr: top.ovr, tag: T(lang, "冠军核心", "Title core") };
  }
  const top = [...s.starters].sort((a, b) => overall(b) - overall(a))[0];
  if (!top) return null;
  return { player: top, ovr: overall(top), tag: s.titles ? T(lang, "当前头号球星", "Top player now") : T(lang, "头号球星", "Top player") };
}

const TROPHY = '<svg class="mtc-trophy" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M8 4h8v5a4 4 0 01-8 0V4zM8 6H5v2a3 3 0 003 3m8-5h3v2a3 3 0 01-3 3M12 13v4m-3 3h6M10 17h4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';

function heroHtml(s, resume, lang) {
  if (s.guest) {
    return `<section class="mtc-hero"><div class="mtc-hero-main"><h3>${T(lang, "我的球队", "My Team")}</h3>
      <p>${T(lang, "登录或创建账号后，才能用你的收藏组建球队、打赛季、赢冠军。", "Sign in or create an account to build a team from your collection, play seasons, and win titles.")}</p>
      <button type="button" class="btn primary" data-act="accounts">${T(lang, "创建 / 登录账号", "Create / sign in")}</button></div></section>`;
  }
  const act = heroAction(s, resume, lang);
  const feat = featuredPlayer(s, lang);
  const chips = [];
  if (s.titles) chips.push(`<span class="mtc-chip mtc-chip-gold">${T(lang, "冠军 × ", "Titles × ")}<span class="mtc-titles-num">${s.titles}</span></span>`);
  if (s.latest) {
    chips.push(`<span class="mtc-chip">${T(lang, "最近赛季", "Latest")} ${esc(s.latest.w)}–${esc(s.latest.l)}</span>`);
    chips.push(`<span class="mtc-chip">${s.latest.variant === "full" ? T(lang, "82 场赛制", "82-game format") : T(lang, "20 场赛制", "20-game format")}</span>`);
  }
  const lead = s.titles
    ? `<p class="mtc-tagline">${T(lang, "你的球队，你的王朝。", "Your team. Your dynasty.")}</p>`
    : `<p class="mtc-hero-titles is-empty">${T(lang, "还没有总冠军 — 拿下第一座，它会出现在这里。", "No championships yet — win your first and it will show up here.")}</p>`;
  const mvp = s.season?.report?.mvp
    ? `<p class="mtc-hero-mvp">${T(lang, "本季联赛 MVP", "League MVP this season")}：<strong>${esc(s.season.report.mvp.name)}</strong>${s.season.report.mvp.mine ? ` <em>${T(lang, "（是你的球员！）", "(your player!)")}</em>` : ""}</p>`
    : "";
  const figure = feat
    ? `<figure class="mtc-feature"><span class="mtc-feature-photo">${photoImg(feat.player, "headshot")}</span>
        <figcaption><small>${feat.tag}</small><strong>${esc(displayName(feat.player, lang))}</strong><span>OVR ${feat.ovr}</span></figcaption></figure>`
    : "";
  return `<section class="mtc-hero${feat ? " has-feature" : ""}">
    <div class="mtc-hero-main">
      <p class="mtc-kicker">${s.titles ? TROPHY : ""}MY TEAM · DYNASTY</p>
      <h3>${s.titles ? T(lang, "冠军之家", "Championship Clubhouse") : T(lang, "我的球队主场", "My Team Clubhouse")}</h3>
      ${lead}
      ${chips.length ? `<p class="mtc-chips">${chips.join("")}</p>` : ""}
      ${mvp}
      <button type="button" class="btn primary mtc-hero-cta" data-act="${act.act}">${act.label}</button>
      ${act.sub ? `<p class="mtc-hero-sub">${esc(act.sub)}</p>` : ""}
    </div>
    ${figure}
  </section>`;
}

function swapPickerHtml(s, swapFor, lang) {
  if (!swapFor) return "";
  const out = s.starters.find((c) => c.id === swapFor);
  const outName = out ? displayName(out, lang) : swapFor;
  const rows = s.bench.map((card) => {
    const name = displayName(card, lang);
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
  const name = displayName(card, lang);
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
    ${resume ? `<p class="mtc-note"><strong>${esc(resume)}</strong></p>` : ""}
    ${report}
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
export function clubhouseHtml({ summary: s, resume = null, swapFor = null, notice = "", lang = "zh", intel = "" }) {
  if (!s) return "";
  return `<div class="mtc">
    ${heroHtml(s, resume, lang)}
    ${s.guest ? "" : `${courtHtml(s, lang)}${swapPickerHtml(s, swapFor, lang)}${intel}${wallHtml(s, lang)}${seasonCenterHtml(s, resume, lang)}${honoursHtml(s, lang)}`}
    ${notice ? `<p class="mtc-notice" role="status">${esc(notice)}</p>` : ""}
  </div>`;
}
