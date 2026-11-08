/**
 * My Team lineup editor view (ADR-010 T1): a pure string renderer. No DOM access, no storage, no state.
 * Every user-controlled string is escaped; copy is bilingual at the source (the static phrase table is for index.html only).
 */
import { overall } from "../data/players.js";
import { photoImg } from "../data/photo.js";
import { MY_TEAM_RULES } from "../myteam/lineup.js";
import { playerSlotPos } from "../engine/gameplan.js";

const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** Plain-language text for a validation issue (or a blocked editor action). */
export function issueText(issue, lang = "zh") {
  const L = (zh, en) => (lang === "en" ? en : zh);
  switch (issue.code) {
    case "guest": return L("登录或创建账号后，才能用你的收藏组建 My Team 球队。", "Sign in or create an account to build a My Team lineup from your collection.");
    case "not_owned": return L("名单里有不属于你收藏的球员卡。", "The roster contains cards that are not in your collection.");
    case "duplicate_person": return L("同一位球员只能选一张赛季卡。", "Only one season card per player.");
    case "roster_small": return L(`名单还差 ${issue.min - issue.have} 人（至少 ${issue.min} 人才能开赛季，现有 ${issue.have}）。`, `Add ${issue.min - issue.have} more (a season needs at least ${issue.min}; you have ${issue.have}).`);
    case "roster_large": return L(`名单最多 ${issue.max} 人，现有 ${issue.have}。`, `At most ${issue.max} players; you have ${issue.have}.`);
    case "starters_count": return L(`需要正好 ${issue.need} 名首发，现有 ${issue.have}。`, `Exactly ${issue.need} starters needed; you have ${issue.have}.`);
    case "starter_not_in_roster": return L("有首发不在名单内。", "A starter is not on the roster.");
    case "coach_not_owned": return L("当前教练不在你的收藏里，请到收藏页重新选择教练。", "The selected coach is not in your collection; pick a coach in the collection.");
    case "position_stack": return L(`首发里有 ${issue.count} 人挤在 ${issue.slot}，可能不平衡（不影响开赛）。`, `${issue.count} starters share ${issue.slot}; may feel lopsided (does not block).`);
    case "no_guard": return L("首发里没有后卫，持球和外线可能吃紧（不影响开赛）。", "No guard in the starting five; ball handling may suffer (does not block).");
    case "roster_full": return L(`名单已满（最多 ${MY_TEAM_RULES.maxRoster} 人），先移出一人。`, `Roster is full (max ${MY_TEAM_RULES.maxRoster}); remove someone first.`);
    case "starters_full": return L(`首发已满 ${MY_TEAM_RULES.starters} 人，先取消一人。`, `Starting five is full; unmark someone first.`);
    case "not_on_roster": return L("先把他加入名单，才能设为首发。", "Add him to the roster before making him a starter.");
    default: return "";
  }
}

const SOURCE_NOTE = {
  auto: ["当前是自动推荐阵容（还没有保存过）。", "This is the automatic lineup (nothing saved yet)."],
  saved: ["已载入你保存的阵容。", "Loaded your saved lineup."],
  repaired: ["你收藏变了，已自动移除失效的卡；点保存才会写入。", "Your collection changed; stale cards were dropped. Save to keep it."],
};

function rowHtml(card, { inRoster, isStarter, lang }) {
  const en = lang === "en";
  const name = en ? card.nameEn || card.name : card.name;
  return `<li class="mtl-row${inRoster ? " in" : ""}${isStarter ? " start" : ""}" data-card="${esc(card.id)}">
    <button type="button" class="mtl-pick" data-act="roster" aria-pressed="${inRoster}" aria-label="${esc(en ? `${inRoster ? "Remove" : "Add"} ${name}` : `${inRoster ? "移出" : "加入"} ${name}`)}">
      <span class="mtl-photo">${photoImg(card, "headshot")}</span>
      <span class="mtl-name"><strong>${esc(name)}</strong><small>${esc(card.season)} · ${esc(card.team)} · ${esc(playerSlotPos(card))}</small></span>
      <span class="mtl-ovr">${overall(card)}</span>
    </button>
    <button type="button" class="mtl-star" data-act="starter" aria-pressed="${isStarter}" ${inRoster ? "" : "disabled"} aria-label="${esc(en ? `Starter: ${name}` : `首发：${name}`)}">${isStarter ? "★" : "☆"}</button>
  </li>`;
}

/**
 * @param {object} p
 * @param {string} p.lang
 * @param {object|null} p.account          null for a guest
 * @param {object[]} p.cards               owned cards, strongest first
 * @param {{rosterIds: string[], starterIds: string[]}} p.draft
 * @param {object} p.validation            validateMyTeamLineup() result
 * @param {"auto"|"saved"|"repaired"} p.source
 * @param {boolean} p.dirty                draft differs from what was loaded
 * @param {boolean} p.hasSaved             a saved preference exists on the account
 * @param {string} [p.notice]              last blocked-action / save message
 */
export function myTeamLineupHtml({ lang = "zh", account, cards = [], draft, validation, source = "auto", dirty = false, hasSaved = false, notice = "" }) {
  const L = (zh, en) => (lang === "en" ? en : zh);
  if (!account) {
    return `<section class="mtl-guest"><h3>${L("我的阵容", "My lineup")}</h3>
      <p>${esc(issueText({ code: "guest" }, lang))}</p>
      <button type="button" class="btn primary" data-act="accounts">${L("创建 / 登录账号", "Create / sign in")}</button></section>`;
  }
  if (!cards.length) {
    return `<section class="mtl-empty"><h3>${L("我的阵容", "My lineup")}</h3>
      <p>${L("你还没有球员卡。先去抽卡，抽到的球员会出现在这里。", "You have no player cards yet. Draw some and they will appear here.")}</p></section>`;
  }
  const inRoster = new Set(draft.rosterIds);
  const starters = new Set(draft.starterIds);
  const { counts, issues, eligible } = validation;
  const blocking = issues.filter((i) => i.level === "block");
  const warns = issues.filter((i) => i.level === "warn");
  const status = eligible
    ? `<p class="mtl-status ok" role="status">${L("✓ 这份阵容可以开赛季", "✓ This lineup is ready for a season")}</p>`
    : `<p class="mtl-status todo" role="status">${L("还不能开赛季，但可以继续编辑和保存：", "Not ready for a season yet, but you can keep editing and saving:")}</p>`;
  const list = (items) => (items.length ? `<ul class="mtl-issues">${items.map((i) => `<li class="${i.level}">${esc(issueText(i, lang))}</li>`).join("")}</ul>` : "");
  const [zh, en] = SOURCE_NOTE[source] || SOURCE_NOTE.auto;
  return `<section class="mtl">
    <header class="mtl-head">
      <div class="mtl-counts" aria-live="polite"><span>${L("名单", "Roster")} <b>${counts.roster}</b>/${MY_TEAM_RULES.maxRoster}</span><span>${L("首发", "Starters")} <b>${counts.starters}</b>/${MY_TEAM_RULES.starters}</span></div>
    </header>
    <p class="tiny mtl-note">${L(zh, en)} ${L("点球员加入/移出名单，点星标设首发；同一球员只能选一张卡。", "Tap a player to add or remove; tap the star to start him. One card per player.")}</p>
    ${status}${list(eligible ? [] : blocking)}${list(warns)}
    ${notice ? `<p class="mtl-notice" role="status">${esc(notice)}</p>` : ""}
    <div class="mtl-actions">
      <button type="button" class="btn primary" data-act="save" ${dirty ? "" : "disabled"}>${L("保存阵容", "Save lineup")}</button>
      <button type="button" class="btn ghost" data-act="auto">${L("自动推荐", "Auto-pick")}</button>
      <button type="button" class="btn ghost" data-act="reset" ${hasSaved ? "" : "disabled"}>${L("恢复自动并清除保存", "Clear saved lineup")}</button>
    </div>
    <ul class="mtl-list">${cards.map((c) => rowHtml(c, { inRoster: inRoster.has(c.id), isStarter: starters.has(c.id), lang })).join("")}</ul>
  </section>`;
}
