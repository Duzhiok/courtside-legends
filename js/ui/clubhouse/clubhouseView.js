/**
 * My Team Clubhouse view: pure string renderers (no DOM access, no storage, no state). Every user-controlled string
 * is escaped; copy is bilingual at the source. Real data only: nothing is shown that the model did not read from
 * the account (a missing photo falls back to the generated avatar; a missing skill shows nothing).
 */
import { overall } from "../../data/players.js";
import { photoUrl } from "../../data/photo.js";
import { avatarDataUri } from "../../data/avatarArt.js";
import { teamColors } from "../../data/teamColors.js";
import { bandOf } from "../../data/gacha.js";
import { roleFamilyOf } from "../../data/skills.js";
import { playerSlotPos } from "../../engine/gameplan.js";
import { issueText } from "../myTeamLineupView.js";
import { FILTER_DEFAULT, SLOTS, roleOf, skillNames } from "./clubhouseModel.js";

export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
const nameOf = (c, lang) => (lang === "en" ? c.nameEn || c.name : c.name);
const FAMILY = { shooter: ["🎯", "射手", "Shooter"], rebounder: ["⬆", "篮板", "Rebounder"], defender: ["🛡", "防守", "Defender"], playmaker: ["✦", "组织", "Playmaker"], energy: ["⚡", "冲击力", "Energy"] };
const FINISH = { champion: ["总冠军", "Champions"], finals: ["总决赛", "Finals"], playoffs: ["季后赛", "Playoffs"], missed: ["未进季后赛", "Missed playoffs"], pending: ["进行中", "In progress"] };

const trophySvg = `<svg class="ch-trophy" viewBox="0 0 64 64" aria-hidden="true"><path fill="#f6c453" d="M18 8h28v4h8c0 10-5 17-13 18-1.5 3-4 5-7 5.7V44h8v6H22v-6h8v-8.3c-3-.7-5.5-2.7-7-5.7C15 29 10 22 10 12h8V8zm-4 8c.5 6 3 10 7 12-1.5-3-2.5-7-2.7-12H14zm36 0h-4.3c-.2 5-1.2 9-2.7 12 4-2 6.500-6 7-12z"/><rect x="20" y="50" width="24" height="6" rx="2" fill="#c9962a"/></svg>`;

function portrait(card) {
  const src = photoUrl(card);
  const avatar = avatarDataUri(card);
  const fb = src === avatar ? "" : ` data-fb="${avatar}" onerror="if(this.dataset.fb){this.src=this.dataset.fb;this.dataset.fb='';}"`;
  return `<img src="${src}" alt="${esc(card.name)}" loading="lazy" referrerpolicy="no-referrer"${fb}>`;
}

/** One collectible card. `compact` is the court version (smaller text, no skills). */
export function cardHtml(card, { lang, starter = false, compact = false, slot = "" } = {}) {
  const c = teamColors(card.team);
  const ovr = overall(card);
  const fam = FAMILY[roleFamilyOf(card)];
  const role = roleOf(card, lang);
  const skills = compact ? [] : skillNames(card, lang, 2);
  const en = lang === "en";
  return `<article class="ch-card tier-${bandOf(ovr).id}${starter ? " is-starter" : ""}${compact ? " compact" : ""}" style="--c1:${esc(c.primary)};--c2:${esc(c.secondary)}" data-card="${esc(card.id)}">
    <div class="ch-card-photo">${portrait(card)}${fam ? `<span class="ch-role" title="${esc(en ? fam[2] : fam[1])}" role="img" aria-label="${esc(en ? fam[2] : fam[1])}">${fam[0]}</span>` : ""}${slot ? `<span class="ch-slotpill">${esc(slot)}</span>` : ""}</div>
    <div class="ch-card-info">
      <div class="ch-card-top"><b class="ch-ovr">${ovr}</b><small>${esc(card.season)} · ${esc(card.team)}</small></div>
      <strong class="ch-name">${esc(nameOf(card, lang))}</strong>
      <small class="ch-sub">${esc(playerSlotPos(card))}${role ? ` · ${esc(role)}` : ""}</small>
      ${skills.length ? `<div class="ch-skills">${skills.map((s) => `<i>${esc(s)}</i>`).join("")}</div>` : ""}
    </div>
  </article>`;
}

function heroHtml(m, L) {
  const { hero, primary, season, account } = m;
  const champ = hero.titles > 0;
  const latest = hero.latest;
  const ace = hero.featured || m.starters.map((s) => s.card).filter(Boolean).sort((a, b) => overall(b) - overall(a))[0] || null;
  const variantChip = (n, zh, en) => (n ? `<span class="ch-chip">${L(zh, en)} ×${n}</span>` : "");
  const team = account ? L(`${account.name || "教练"} 的球队`, `${account.name || "Coach"}'s team`) : L("访客模式", "Guest mode");
  const btn = {
    signin: [L("创建账号开始", "Create an account"), "signin"],
    resume: [L("继续赛季", "Continue season"), "resume"],
    again: [L("再来一季", "Play another season"), "again"],
    start: [L("开始赛季 · 20 场", "Start season · 20 games"), "start"],
    build: [L("组建阵容", "Build your lineup"), "lineup"],
    draw: [L(`去抽卡 · 还差 ${primary.needed} 张解锁赛季`, `Draw cards · ${primary.needed} more to unlock`), "draw"],
  }[primary.kind];
  const sub = season?.exists && !season.done ? season.label : "";
  return `<section class="ch-hero${champ ? " is-champ" : ""}" aria-label="${L("球队总览", "Team overview")}">
    <div class="ch-hero-main">
      <p class="ch-kicker">MY TEAM · CLUBHOUSE</p>
      <h2>${champ ? L("冠军王朝", "Championship dynasty") : L("建立你的王朝", "Build your dynasty")}</h2>
      <p class="ch-teamname">${esc(team)}</p>
      <div class="ch-trophy-row">${trophySvg}<div><b class="ch-titles">${hero.titles}</b><span>${L("座冠军", hero.titles === 1 ? "title" : "titles")}</span></div></div>
      ${champ && latest
        ? `<p class="ch-latest">${L("最近夺冠", "Latest title")}：${latest.year ? `${latest.year} · ` : ""}${latest.w}${L("胜", "W")}${latest.l}${L("负", "L")} · ${L(`${latest.games} 场赛季`, `${latest.games}-game season`)}</p>
           <div class="ch-chips">${variantChip(hero.byVariant.quick, "20 场", "20-game")}${variantChip(hero.byVariant.full, "82 场", "82-game")}</div>`
        : `<p class="ch-latest">${hero.played ? L(`已打 ${hero.played} 个赛季，还没有冠军。下一个就是你的。`, `${hero.played} season(s) played, no title yet. The next one could be yours.`) : L("打完一个赛季，你的成绩就会留在这里。", "Finish a season and your results live here.")}</p>`}
      <div class="ch-actions">
        <button type="button" class="btn primary ch-primary" data-act="${btn[1]}" data-variant="${esc(primary.variant || "")}">${btn[0]}</button>
        ${season?.exists && season.done ? `<button type="button" class="btn" data-act="resume">${L("查看赛季战报", "View season report")}</button>` : ""}
      </div>
      ${sub ? `<p class="ch-sub-note">${esc(sub)}</p>` : ""}
    </div>
    <div class="ch-hero-art">${ace
      ? `${cardHtml(ace, { lang: m.lang })}<p class="ch-art-cap">${hero.featured ? L("冠军球星", "Title-run star") : L("你的王牌", "Your ace")}${hero.featured && latest?.star ? ` · ${latest.star.ppg} ${L("分/场", "ppg")}` : ""}</p>`
      : `<div class="ch-art-empty">${L("抽到球员后，王牌会出现在这里。", "Draw players and your ace appears here.")}</div>`}</div>
  </section>`;
}

function pickerHtml(m, pick, L) {
  if (!pick) return "";
  const startIds = new Set(m.draft.starterIds);
  const onRoster = new Set(m.draft.rosterIds);
  const seen = new Set();
  const cands = m.cards
    .filter((c) => !startIds.has(c.id))
    .filter((c) => { const k = c.bref || c.id; if (seen.has(k)) return false; seen.add(k); return true; })
    .sort((a, b) => Number(onRoster.has(b.id)) - Number(onRoster.has(a.id)) || overall(b) - overall(a))
    .slice(0, 24);
  const out = pick.outId ? m.cards.find((c) => c.id === pick.outId) : null;
  return `<div class="ch-picker" role="dialog" aria-label="${L("选择首发", "Choose a starter")}">
    <div class="ch-picker-head"><strong>${out ? L(`换下 ${nameOf(out, m.lang)}：选一位替补`, `Replace ${nameOf(out, m.lang)}: pick a player`) : L(`补上 ${pick.slot} 首发`, `Fill the ${pick.slot} spot`)}</strong><button type="button" class="btn small ghost" data-act="pick-cancel">${L("取消", "Cancel")}</button></div>
    <div class="ch-picker-row">${cands.length ? cands.map((c) => `<button type="button" class="ch-pick" data-act="swap" data-in="${esc(c.id)}" aria-label="${esc(nameOf(c, m.lang))}">${cardHtml(c, { lang: m.lang, compact: true })}<small>${onRoster.has(c.id) ? L("名单内", "On roster") : L("需加入名单", "Adds to roster")}</small></button>`).join("") : `<p class="tiny">${L("没有可换的球员。", "No one to swap in.")}</p>`}</div>
  </div>`;
}

function courtHtml(m, pick, notice, L) {
  const v = m.validation;
  const issue = v.issues.find((i) => i.level === "block") || v.issues[0];
  const note = notice || (issue ? issueText(issue, m.lang) : "");
  const seasonLive = m.season?.exists && !m.season.done;
  return `<section class="ch-section" aria-label="${L("首发五虎", "Starting five")}">
    <div class="ch-section-head"><h3>${L("首发五虎", "Starting five")}</h3><span class="tiny">${L(`名单 ${v.counts.roster}/${m.rules.maxRoster} · 首发 ${v.counts.starters}/5`, `Roster ${v.counts.roster}/${m.rules.maxRoster} · Starters ${v.counts.starters}/5`)}</span></div>
    <div class="ch-court" role="group">
      <i class="ch-court-key"></i><i class="ch-court-arc"></i><i class="ch-court-mid"></i>
      ${m.starters.map(({ slot, card }) => `<div class="ch-slot" data-slot="${slot}">${card
        ? `<button type="button" class="ch-slot-btn" data-act="pick" data-slot="${slot}" data-out="${esc(card.id)}" aria-label="${esc(L(`更换 ${nameOf(card, m.lang)}`, `Change ${nameOf(card, m.lang)}`))}">${cardHtml(card, { lang: m.lang, compact: true, starter: true, slot })}</button>`
        : `<button type="button" class="ch-slot-empty" data-act="pick" data-slot="${slot}"><b>+</b><span>${slot}</span></button>`}</div>`).join("")}
    </div>
    ${pickerHtml(m, pick, L)}
    ${note ? `<p class="ch-note" role="status">${esc(note)}</p>` : ""}
    <div class="ch-court-actions"><button type="button" class="btn small" id="btn-open-my-lineup" data-act="lineup">${L("管理名单 / 自动推荐", "Manage roster / auto-pick")}</button>${seasonLive ? `<span class="tiny">${L("更换会用于下一个赛季；当前赛季阵容已锁定。", "Changes apply to the next season; the current lineup is locked.")}</span>` : ""}</div>
  </section>`;
}

function legacyHtml(m, openId, L) {
  const lv = m.level;
  const recs = m.records;
  const open = recs.find((r) => r.seasonId === openId);
  const label = (r) => FINISH[r.finish]?.[m.lang === "en" ? 1 : 0] || "";
  const detail = open
    ? `<div class="ch-record-detail"><strong>${open.year ? `${open.year} · ` : ""}${esc(label(open))} · ${open.w}${L("胜", "W")}${open.l}${L("负", "L")}</strong>
        ${open.lineup?.length ? `<ul>${open.lineup.map((p) => `<li><b>${esc(p.pos || "")}</b> ${esc(m.lang === "en" ? p.nameEn || p.name : p.name)} <i>${p.ovr}</i></li>`).join("")}</ul>` : `<p class="tiny">${L("这个赛季当时没有记录首发阵容。", "The starting five was not recorded for this season.")}</p>`}
        ${open.star ? `<p class="tiny">${L("全队得分王", "Top scorer")}：${esc(open.star.name)} · ${open.star.ppg} ${L("分/场", "ppg")}</p>` : ""}</div>`
    : "";
  return `<section class="ch-section" aria-label="${L("荣誉室", "Legacy room")}">
    <div class="ch-section-head"><h3>${L("荣誉室", "Legacy room")}</h3>${lv ? `<span class="ch-level">Lv ${lv.level} · ${esc(m.lang === "en" ? lv.titleEn : lv.title)}</span>` : ""}</div>
    ${lv ? `<div class="ch-xp" role="progressbar" aria-valuenow="${lv.pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${lv.pct}%"></i></div><p class="tiny">${lv.isMax ? L("已满级", "Max level") : `${lv.xpIntoLevel}/${lv.xpForNext} XP`}</p>` : ""}
    ${recs.length ? `<div class="ch-shelf">${recs.map((r) => `<button type="button" class="ch-trophy-tile${r.champion ? " won" : ""}${r.seasonId === openId ? " open" : ""}" data-act="record" data-id="${esc(r.seasonId)}" aria-pressed="${r.seasonId === openId}">${r.champion ? "🏆" : "▫"}<b>${r.year || ""}</b><small>${esc(label(r))}</small><small>${r.w}-${r.l}</small></button>`).join("")}</div>${detail}`
      : `<p class="tiny">${L("还没有完成的赛季。打完一季，奖杯和战绩会留在这里，开新赛季也不会消失。", "No finished seasons yet. Trophies and records stay here, even after you start a new season.")}</p>`}
  </section>`;
}

function collectionHtml(m, filter, L) {
  const f = { ...FILTER_DEFAULT, ...filter };
  const list = f.view === "list";
  const chip = (id, label) => `<button type="button" class="ch-fchip${f.pos === id ? " on" : ""}" data-act="fpos" data-v="${id}" aria-pressed="${f.pos === id}">${label}</button>`;
  return `<section class="ch-section" aria-label="${L("球员收藏", "My collection")}">
    <div class="ch-section-head"><h3>${L("我的收藏", "My collection")}</h3><span class="tiny">${L(`共 ${m.owned} 张 · 永久拥有`, `${m.owned} cards · yours to keep`)}</span></div>
    <div class="ch-filters">
      <div class="ch-fchips">${chip("all", L("全部", "All"))}${SLOTS.map((s) => chip(s, s)).join("")}</div>
      <select data-act="fdecade" aria-label="${L("年代", "Era")}"><option value="all">${L("全部年代", "All eras")}</option>${m.decades.map((d) => `<option value="${d}"${String(f.decade) === String(d) ? " selected" : ""}>${d}s</option>`).join("")}</select>
      <select data-act="fsort" aria-label="${L("排序", "Sort")}"><option value="ovr"${f.sort === "ovr" ? " selected" : ""}>${L("OVR 高→低", "OVR high→low")}</option><option value="season"${f.sort === "season" ? " selected" : ""}>${L("年代 新→旧", "Era new→old")}</option></select>
      <button type="button" class="btn small ghost" data-act="fview" aria-pressed="${list}">${list ? L("卡牌墙", "Card wall") : L("紧凑列表", "Compact list")}</button>
    </div>
    ${m.tiles.length ? `<div class="${list ? "ch-list" : "ch-wall"}">${m.tiles.map((t) => `<div class="ch-tile" data-card="${esc(t.card.id)}">${list
      ? `<span class="ch-row"><b>${overall(t.card)}</b><strong>${esc(nameOf(t.card, m.lang))}</strong><small>${esc(t.card.season)} · ${esc(t.card.team)} · ${esc(playerSlotPos(t.card))}</small>${t.starter ? `<em>${L("首发", "Starter")}</em>` : t.onRoster ? `<em class="dim">${L("名单", "Roster")}</em>` : ""}</span>`
      : cardHtml(t.card, { lang: m.lang, starter: t.starter })}
      <div class="ch-tile-foot">${t.starter ? `<em class="ch-state start">${L("首发", "Starter")}</em>` : `<em class="ch-state${t.onRoster ? " bench" : ""}">${t.onRoster ? L("名单内", "On roster") : L("未入名单", "Not on roster")}</em><button type="button" class="btn small ch-promote" data-act="promote" data-in="${esc(t.card.id)}">${L("换上首发", "Start him")}</button>`}</div>
    </div>`).join("")}</div>`
      : `<p class="tiny">${m.owned ? L("没有符合筛选的卡。", "No cards match the filters.") : L("还没有球员卡。去抽卡开启你的收藏。", "No cards yet. Draw some to start your collection.")}</p>`}
    <div class="ch-court-actions"><button type="button" class="btn small" data-act="collection">${L("完整收藏管理", "Full collection")}</button><button type="button" class="btn small" data-act="draw">${L("每日抽卡", "Daily draw")}</button></div>
  </section>`;
}

export function clubhouseHtml(m, ui, L) {
  return `<div class="ch-root">${heroHtml(m, L)}${courtHtml(m, ui.pick, ui.notice, L)}${legacyHtml(m, ui.openRecord, L)}${collectionHtml(m, ui.filter, L)}</div>`;
}
