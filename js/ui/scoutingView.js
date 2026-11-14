/**
 * GM draft gamble — the playable 1996 scouting/draft slice (workstream C).
 *
 * You are the Charlotte Hornets GM in the 1996 draft, holding picks #8 and
 * #13. Three phases: scout (read three scouts' reports, spend 3 tryouts,
 * negotiate pick trades with AI GMs) → draft (14 lottery slots, CPU teams
 * pick by the existing frontOfficePick consensus) → review (a labelled
 * three-year PROJECTION of growth, team record and the cost of the players
 * you passed on).
 *
 * Potential is never shown as a number anywhere in this view — only bands
 * (see scoutingIntel.js). The review is a projection, not GameSim results.
 * State persists to root.gmDraftGamble (additive, v3 stays) when a root
 * save is open; an invalid saved state is discarded.
 */
import {
  GAMBLE_SEED_DEFAULT,
  GAMBLE_TEAM_ID,
  GAMBLE_TEAM_NAME,
  GAMBLE_TEAM_NAME_ZH,
  POTENTIAL_BANDS,
  ROLE_LABEL,
  SCOUTS,
  SLOT_ORDER,
  TRYOUT_BUDGET,
  buildGamble,
  projectThreeYears,
  publicInfo,
  runTryout,
  validGambleState,
} from "../career/gm/scoutingIntel.js";
import {
  GM_PERSONAS,
  assignPersonas,
  negotiateRound,
  personaById,
  recordNegotiationOutcome,
  startNegotiation,
} from "../career/gm/negotiation.js";
import {
  advanceDraftToUserPick,
  forfeitDraftPick,
  selectDraftProspect,
} from "../engine/leagueDraft.js";
import { PLAYERS } from "../data/players.js";
import { esc } from "../core/html.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);

export function ensureDraftGambleScreen() {
  let el = document.querySelector("#screen-draft-gamble");
  if (el) return el;
  el = document.createElement("main");
  el.id = "screen-draft-gamble";
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-draft-gamble-back" type="button"><span>返回</span></button><h2>1996 选秀赌局 · Draft Gamble</h2></div><div id="draft-gamble-body"></div>`;
  document.body.appendChild(el);
  return el;
}

function bandLabel(bandId, lang) {
  const band = POTENTIAL_BANDS.find((b) => b.id === bandId) || POTENTIAL_BANDS[0];
  return lang === "en" ? band.en : band.zh;
}

function scoutName(scout, lang) {
  return lang === "en" ? scout.nameEn : scout.name;
}

function personaLabel(personaId, lang) {
  const persona = GM_PERSONAS.find((p) => p.id === personaId);
  if (!persona) return personaId;
  return lang === "en" ? persona.labelEn : persona.label;
}

/** One prospect's public line + scout reports + tryout (scout phase). */
export function prospectCardHtml({ prospect, reports, tryout, tryoutsLeft, lang = "zh" } = {}) {
  const card = prospect?.player || prospect;
  const info = publicInfo(card);
  if (!info) return "";
  const line = info.line;
  const stats = [line.ppg, line.rpg, line.apg].map((v) => (v == null ? "—" : v)).join(" / ");
  const reportRows = (reports || []).map((report) => {
    const scout = SCOUTS.find((s) => s.id === report.scoutId) || {};
    const confidence = report.confidence === "low"
      ? L("信心低", "Low confidence", lang)
      : L("信心中", "Medium confidence", lang);
    return `<li><strong>${esc(scoutName(scout, lang))}</strong>：${report.range.min}–${report.range.max} · ${esc(bandLabel(report.band, lang))}（${confidence}）<br><span class="dg-note">${esc(report.note[lang === "en" ? "en" : "zh"])}</span></li>`;
  }).join("");
  const tryoutBlock = tryout
    ? `<p class="dg-tryout">🔬 ${L("试训", "Tryout", lang)}：${tryout.range.min}–${tryout.range.max} · ${esc(bandLabel(tryout.band, lang))}<br>`
      + `· ${esc(tryout.clues.workEthic[lang === "en" ? "en" : "zh"])}<br>`
      + `· ${esc(tryout.clues.injury[lang === "en" ? "en" : "zh"])}<br>`
      + `· ${esc(tryout.clues.character[lang === "en" ? "en" : "zh"])}</p>`
    : (tryoutsLeft > 0
      ? `<button type="button" class="btn small" data-action="tryout" data-bref="${esc(info.bref)}">🔬 ${L("试训（剩余", "Tryout (", lang)}${tryoutsLeft}）</button>`
      : "");
  return `<article class="dg-prospect" data-bref="${esc(info.bref)}">`
    + `<h4>${esc(info.name)} <span class="dg-pos">${esc(info.pos)}</span> <span class="dg-ovr">OVR ${info.ovr}</span></h4>`
    + `<p>${info.age != null ? `${info.age}${L("岁", " yrs", lang)} · ` : ""}${info.heightCm ? `${info.heightCm}cm · ` : ""}${info.weightKg ? `${info.weightKg}kg` : ""}</p>`
    + `<p>${L("数据", "Line", lang)}：${stats} · ${line.mpg != null ? `${line.mpg}${L("分钟", " min", lang)}` : ""}</p>`
    + `<ul class="dg-reports">${reportRows}</ul>`
    + tryoutBlock
    + `</article>`;
}

/** The scout-phase board: all 14 prospects with their reports. */
export function scoutBoardHtml({ gamble, state, lang = "zh" } = {}) {
  const tryoutsLeft = TRYOUT_BUDGET - Object.keys(state?.tryoutsUsed || {}).length;
  const cards = (gamble?.prospects || []).map((prospect) => prospectCardHtml({
    prospect,
    reports: gamble.reports[prospect.bref] || [],
    tryout: state?.tryoutsUsed?.[prospect.bref] || null,
    tryoutsLeft,
    lang,
  })).join("");
  return `<section class="dg-board"><h3>${L("新秀名单 · 1996 届", "Prospect board · 1996 class", lang)}</h3>`
    + `<p>${L("公开信息免费；三位球探的判断可能互相矛盾；试训名额有限（", "Public info is free; the three scouts may disagree; tryouts are limited (", lang)}${tryoutsLeft}${L(" 次剩余）。潜力只显示区间，永远不显示具体数字。", " left). Potential is shown as a range only, never as a number.", lang)}</p>`
    + `<div class="dg-grid">${cards}</div></section>`;
}

/** The pre-draft negotiation panel (pick-for-pick trades only in this slice). */
export function negotiationHtml({ state, neg, lang = "zh" } = {}) {
  const mySlots = Object.entries(state?.pickOwnership || {})
    .filter(([, owner]) => owner === GAMBLE_TEAM_ID)
    .map(([slot]) => Number(slot))
    .sort((a, b) => a - b);
  const targets = Object.entries(state?.pickOwnership || {})
    .filter(([, owner]) => owner !== GAMBLE_TEAM_ID)
    .map(([slot, owner]) => ({ slot: Number(slot), owner }))
    .sort((a, b) => a.slot - b.slot);
  const targetOptions = targets.map(({ slot, owner }) => {
    const persona = state?.personas?.[owner];
    return `<button type="button" class="btn small${neg?.targetSlot === slot ? " active" : ""}" data-action="neg-target" data-slot="${slot}">#${slot} · ${esc(owner)}（${esc(personaLabel(persona, lang))}）</button>`;
  }).join(" ");
  const giveOptions = mySlots.map((slot) => {
    const selected = (neg?.giveSlots || []).includes(slot);
    return `<button type="button" class="btn small${selected ? " active" : ""}" data-action="neg-give" data-slot="${slot}">#${slot}</button>`;
  }).join(" ");
  let result = "";
  if (neg?.lastResult) {
    const r = neg.lastResult;
    if (r.verdict === "counter" && neg?.state?.status === "open") {
      // Slice-level counter line, numbers only: the module's reason embeds
      // its general sweetener label (e.g. a 1997 first-rounder), which does
      // not exist in this draft. The only extra chip here is your other
      // 1996 pick — say so explicitly.
      const sliceNote = L("接受条件需要再加你的另一个签位。", "Accepting means adding your other pick.", lang);
      result = `<p class="dg-neg-result">${L("对方还价：你送出价值", "They counter: you offer ", lang)} ${r.valueIn}，${L("对方要", "they want ", lang)} ${r.demand}。${sliceNote}</p>`;
      const otherPick = mySlots.find((s) => !(neg.giveSlots || []).includes(s));
      result += otherPick
        ? `<p><button type="button" class="btn small" data-action="neg-accept-counter">${L("接受条件（再加 #", "Accept (add #", lang)}${otherPick}）</button> <button type="button" class="btn small" data-action="neg-walk">${L("放弃谈判", "Walk away", lang)}</button></p>`
        : `<p>${L("你已经没有更多签位可加了。", "You have no more picks to add.", lang)} <button type="button" class="btn small" data-action="neg-walk">${L("放弃谈判", "Walk away", lang)}</button></p>`;
    } else {
      result = `<p class="dg-neg-result">${esc(r.reason)}</p>`;
    }
    if (neg?.state?.status === "accepted") {
      result += `<p>✅ ${L("交易达成。", "Deal done.", lang)}</p>`;
    }
    if (neg?.state?.status === "broke") {
      result += `<p>❌ ${L("谈判破裂，对方记住了这次经历。", "Talks broke down — they'll remember this.", lang)}</p>`;
    }
  }
  return `<section class="dg-neg"><h3>${L("交易谈判 · 选秀权互换", "Trade talks · pick swaps", lang)}</h3>`
    + `<p>${L("你手里的签位：", "Your picks: ", lang)}${mySlots.map((s) => `#${s}`).join("、") || L("无", "none", lang)}。${L("想往上换一个签位？先选目标，再选你要送出的签。", "Want to move up? Pick a target, then the picks you'll send.", lang)}</p>`
    + `<p>${targetOptions}</p>`
    + (neg?.targetSlot ? `<p>${L("送出：", "Send: ", lang)}${giveOptions}</p><p><button type="button" class="btn" data-action="neg-offer" ${!(neg.giveSlots || []).length ? "disabled" : ""}>${L("提出报价", "Make the offer", lang)}</button> <button type="button" class="btn small" data-action="neg-walk">${L("取消", "Cancel", lang)}</button></p>` : "")
    + result
    + `</section>`;
}

/** The draft board: 14 slots with owners and selections. */
export function draftBoardHtml({ state, lang = "zh" } = {}) {
  const draft = state?.draft;
  if (!draft) return "";
  const rows = draft.order.map((teamId, index) => {
    const slot = index + 1;
    const selection = (draft.selections || []).find((s) => s.pickNumber === slot);
    const isUser = teamId === GAMBLE_TEAM_ID;
    const pickText = selection
      ? selection.forfeited
        ? L("跳过", "Passed", lang)
        : `${esc(selection.name)}${selection.bref ? `（${esc(selection.bref)}）` : ""}`
      : (draft.currentPick === index && draft.status === "in_progress"
        ? L("正在选……", "On the clock…", lang)
        : L("待选", "Pending", lang));
    return `<li class="${isUser ? "dg-user-slot" : ""}">#${slot} · ${esc(teamId)}${isUser ? ` (${L("你", "You", lang)})` : ""} — ${pickText}</li>`;
  }).join("");
  return `<section class="dg-board"><h3>${L("选秀板 · 首轮 14 顺位", "Draft board · Round 1, 14 picks", lang)}</h3><ol class="dg-slots">${rows}</ol></section>`;
}

/** The current user pick: remaining prospects to choose from. */
export function userPickHtml({ state, gamble, lang = "zh" } = {}) {
  const draft = state?.draft;
  if (!draft || draft.status !== "in_progress") return "";
  const slot = draft.currentPick + 1;
  if (draft.order[draft.currentPick] !== GAMBLE_TEAM_ID) return "";
  const options = (draft.prospects || []).map((prospect) => {
    const card = prospect.player;
    const info = publicInfo(card);
    const reports = gamble?.reports?.[prospect.bref] || [];
    const bands = reports.map((r) => `${r.range.min}–${r.range.max}`).join(" / ");
    return `<li><button type="button" class="btn small" data-action="pick" data-prospect="${esc(prospect.prospectId)}">${esc(info.name)} · ${esc(info.pos)} · OVR ${info.ovr}</button> <span class="dg-bands">${esc(bands)}</span></li>`;
  }).join("");
  return `<section class="dg-pick"><h3>${L("轮到你了：第", "Your pick: #", lang)}${slot}${L(" 顺位", "", lang)}</h3>`
    + `<ul>${options}</ul>`
    + `<p><button type="button" class="btn small" data-action="forfeit">${L("跳过此签", "Pass on this pick", lang)}</button></p></section>`;
}

/** The three-year review (labelled projection throughout). */
export function reviewHtml({ review, lang = "zh" } = {}) {
  if (!review) return "";
  const gradeLine = {
    A: L("A · 你赌对了，选秀改变了球队。", "A · You called it — the draft changed the franchise."),
    B: L("B · 选秀基本合格，没有错过太多。", "B · A solid draft; little left on the table."),
    C: L("C · 你错过了一位未来的明星。", "C · You passed on a future star."),
    D: L("D · 这次选秀基本打了水漂。", "D · This draft mostly went to waste."),
  }[review.verdict.grade] || "";
  const teamRows = review.team.map((y) => `<tr><td>${y.year}</td><td>${y.wins}–${y.losses}</td><td>${y.playoffs ? L("季后赛", "Playoffs", lang) : "—"}</td></tr>`).join("");
  const playerRows = (list) => list.map((p) => {
    const cells = p.seasons.map((s) => `<td>${s.year}<br>OVR ${s.ovr} · ${esc(ROLE_LABEL[s.role][lang === "en" ? "en" : "zh"])}<br>${s.games}${L("场", " g", lang)}${s.injured ? ` · ${L("伤", "inj", lang)}` : ""}${s.breakout ? ` · ${L("爆发", "breakout", lang)}` : ""}</td>`).join("");
    return `<tr><td>${esc(p.name)}${p.pickNumber ? ` (#${p.pickNumber})` : ""}<br>${L("新秀 OVR", "Rookie OVR", lang)} ${p.rookieOvr} → ${p.finalOvr}</td>${cells}</tr>`;
  }).join("");
  return `<section class="dg-review"><h3>${L("三年推演 · 1997–1999", "Three-year projection · 1997–1999", lang)}</h3>`
    + `<p class="dg-projection-note">⚠️ ${L("以下全部是赛季级推演，不是真实比赛结果。成长按角色分钟、年龄曲线和试训伤病标记推算；球队战绩按前八人实力推算。", "Everything below is a season-level projection, not real game results. Growth follows role minutes, the age curve and tryout injury flags; team record follows top-8 strength.", lang)}</p>`
    + `<p><strong>${L("评级", "Grade", lang)} ${review.verdict.grade}</strong> — ${esc(gradeLine)}</p>`
    + `<p>${L("你的选秀三年后总 OVR", "Your picks after three years", lang)} ${review.verdict.yourSum} · ${L("你错过的最高潜力者", "Best you passed on", lang)} ${review.verdict.missedSum}（${L("差值", "diff", lang)} ${review.verdict.diff >= 0 ? "+" : ""}${review.verdict.diff}）</p>`
    + `<h4>${L("球队战绩（推演）", "Team record (projected)", lang)}</h4><table class="dg-table"><tr><th>${L("赛季", "Season", lang)}</th><th>${L("战绩", "Record", lang)}</th><th>${L("季后赛", "Playoffs", lang)}</th></tr>${teamRows}</table>`
    + `<h4>${L("你选中的球员", "Your picks", lang)}</h4><table class="dg-table"><tr><th>${L("球员", "Player", lang)}</th><th>1997</th><th>1998</th><th>1999</th></tr>${playerRows(review.drafted)}</table>`
    + (review.passed.length ? `<h4>${L("你错过的球员", "The ones that got away", lang)}</h4><table class="dg-table"><tr><th>${L("球员", "Player", lang)}</th><th>1997</th><th>1998</th><th>1999</th></tr>${playerRows(review.passed)}</table>` : "")
    + `</section>`;
}

export function createDraftGambleView({ getLang, readRootSave, writeRootSave, show, goBack } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  let el = null;
  let gamble = null;
  let state = null;
  // Transient negotiation UI (not persisted; a refresh resets the talks).
  let neg = null;

  function persist() {
    if (!state || typeof writeRootSave !== "function") return;
    const root = readRootSave() || {};
    root.gmDraftGamble = state;
    writeRootSave(root);
  }

  function freshState(seed, built) {
    const pickOwnership = {};
    SLOT_ORDER.forEach((teamId, index) => { pickOwnership[index + 1] = teamId; });
    return {
      version: 1,
      seed,
      phase: "scout",
      tryoutsUsed: {},
      injuryFlags: {},
      ledger: {},
      personas: assignPersonas([...new Set(SLOT_ORDER)], seed),
      pickOwnership,
      draft: built.draft,
      season: built.season,
      picked: [],
      review: null,
    };
  }

  function rebuildDraftOrder() {
    if (!state?.draft) return;
    state.draft.order = SLOT_ORDER.map((_, index) => state.pickOwnership[index + 1]);
    state.draft.picks = SLOT_ORDER.map((teamId, index) => ({ sourceTeamId: teamId, ownerTeamId: state.pickOwnership[index + 1] }));
  }

  function myPickSlots() {
    return Object.entries(state?.pickOwnership || {})
      .filter(([, owner]) => owner === GAMBLE_TEAM_ID)
      .map(([slot]) => Number(slot))
      .sort((a, b) => a - b);
  }

  function runReview() {
    const drafted = (state.picked || [])
      .filter((p) => !p.forfeited)
      .map((p) => {
        const card = state.season.teams[GAMBLE_TEAM_ID].players.find((c) => c.bref === p.bref);
        return card ? { card, pickNumber: p.pickNumber } : null;
      })
      .filter(Boolean);
    const passed = (state.draft.selections || [])
      .filter((s) => s.teamId !== GAMBLE_TEAM_ID && s.bref)
      .map((s) => {
        const prospect = gamble.prospects.find((p) => p.bref === s.bref);
        return prospect ? { card: prospect.player } : null;
      })
      .filter(Boolean)
      .sort((a, b) => gamble.hiddenByBref[b.bref].potential - gamble.hiddenByBref[a.bref].potential)
      .slice(0, 3);
    state.review = projectThreeYears({
      drafted,
      passed,
      roster: gamble.roster,
      seed: state.seed,
      injuryFlags: state.injuryFlags,
      players: PLAYERS,
    });
    state.phase = "review";
  }

  function render() {
    const body = el.querySelector("#draft-gamble-body");
    if (!gamble || !state) {
      body.innerHTML = `<p>${L("正在加载名册……", "Loading roster…", lang())}</p>`;
      return;
    }
    const l = lang();
    let html = `<section class="dg-intro"><h3>${esc(GAMBLE_TEAM_NAME_ZH)} · ${esc(GAMBLE_TEAM_NAME)} — 1996</h3>`
      + `<p>${L("你是夏洛特黄蜂的总经理，手握 8 号签和 13 号签。1996 届新秀里有未来的传奇，也有水货——球探们的判断并不一致。选好人，三年后见分晓。", "You are the Charlotte Hornets GM, holding picks #8 and #13. The 1996 class hides future legends and busts alike — and your scouts disagree. Draft well; three years will tell.", l)}</p></section>`;
    if (state.phase === "scout") {
      html += scoutBoardHtml({ gamble, state, lang: l });
      html += negotiationHtml({ state, neg, lang: l });
      html += `<p><button type="button" class="btn" data-action="start-draft">${L("开始选秀", "Start the draft", l)}</button></p>`;
    } else if (state.phase === "draft") {
      html += draftBoardHtml({ state, lang: l });
      html += userPickHtml({ state, gamble, lang: l });
      if (state.draft.status === "complete") {
        html += `<p><button type="button" class="btn" data-action="run-review">${L("推演三年", "Project three years", l)}</button></p>`;
      } else if (state.draft.order[state.draft.currentPick] !== GAMBLE_TEAM_ID) {
        html += `<p><button type="button" class="btn" data-action="advance">${L("继续选秀", "Continue the draft", l)}</button></p>`;
      }
    } else if (state.phase === "review") {
      html += reviewHtml({ review: state.review, lang: l });
      html += `<p><button type="button" class="btn" data-action="restart">${L("换个种子再来一次", "Run it again with a new seed", l)}</button></p>`;
    }
    body.innerHTML = html;
  }

  function wire() {
    el.addEventListener("click", async (event) => {
      const back = event.target.closest("#btn-draft-gamble-back");
      if (back) {
        if (typeof goBack === "function") goBack();
        return;
      }
      const target = event.target.closest("[data-action]");
      if (!target || !state) return;
      const action = target.dataset.action;
      try {
        if (action === "tryout") {
          const bref = target.dataset.bref;
          const used = Object.keys(state.tryoutsUsed).length;
          if (used >= TRYOUT_BUDGET || state.tryoutsUsed[bref] || state.phase !== "scout") return;
          const prospect = gamble.prospects.find((p) => p.bref === bref);
          if (!prospect) return;
          const tryout = runTryout(prospect.player, gamble.hiddenByBref[bref], state.seed);
          state.tryoutsUsed[bref] = tryout;
          if (tryout.injuryRisk) state.injuryFlags[bref] = true;
          persist();
          render();
          return;
        }
        if (action === "neg-target") {
          const slot = Number(target.dataset.slot);
          neg = { targetSlot: slot, giveSlots: [], state: null, lastResult: null };
          render();
          return;
        }
        if (action === "neg-give") {
          if (!neg) return;
          const slot = Number(target.dataset.slot);
          const giveSlots = neg.giveSlots.includes(slot)
            ? neg.giveSlots.filter((s) => s !== slot)
            : [...neg.giveSlots, slot];
          neg = { ...neg, giveSlots };
          render();
          return;
        }
        if (action === "neg-offer") {
          if (!neg?.targetSlot || !neg.giveSlots?.length) return;
          const owner = state.pickOwnership[neg.targetSlot];
          const persona = personaById(state.personas[owner]);
          if (!persona) return;
          const give = { players: [], picks: neg.giveSlots.map((slot) => ({ year: 1996, round: 1, slot })) };
          const ask = { players: [], picks: [{ year: 1996, round: 1, slot: neg.targetSlot }] };
          const machine = neg.state && neg.state.status === "open"
            ? neg.state
            : startNegotiation({ gmId: owner, personaId: persona.id, seed: state.seed });
          const next = negotiateRound(machine, { type: "offer", give, ask }, { ledger: state.ledger, currentYear: 1996, lang: lang() });
          const lastResult = next.lastResult || null;
          neg = { ...neg, state: next, lastResult };
          if (next.status === "accepted" && lastResult?.verdict === "accept") {
            applyTrade(neg.targetSlot, neg.giveSlots, lastResult);
            neg = null;
          } else if (next.status === "broke" && lastResult) {
            // A plain rejection costs -1 goodwill, a counter run that
            // exhausts all three rounds costs -2 (see
            // recordNegotiationOutcome).
            const outcome = lastResult.verdict === "reject" ? "rejected" : "broke";
            state.ledger = recordNegotiationOutcome(state.ledger, owner, { result: outcome });
            persist();
          }
          render();
          return;
        }
        if (action === "neg-accept-counter") {
          if (!neg?.state?.lastCounter) return;
          const otherPick = myPickSlots().find((s) => !neg.giveSlots.includes(s));
          if (otherPick == null) return;
          const giveSlots = [...neg.giveSlots, otherPick];
          applyTrade(neg.targetSlot, giveSlots, neg.state.lastResult);
          neg = null;
          render();
          return;
        }
        if (action === "neg-walk") {
          neg = null;
          render();
          return;
        }
        if (action === "start-draft") {
          state.phase = "draft";
          state.draft = advanceDraftToUserPick(state.draft, state.season);
          persist();
          render();
          return;
        }
        if (action === "advance") {
          state.draft = advanceDraftToUserPick(state.draft, state.season);
          persist();
          render();
          return;
        }
        if (action === "pick") {
          const prospectId = target.dataset.prospect;
          const pickNumber = state.draft.currentPick + 1;
          const before = state.draft.selections.length;
          state.draft = selectDraftProspect(state.draft, state.season, prospectId);
          const selection = state.draft.selections[before];
          if (selection && !selection.forfeited) {
            state.picked.push({ prospectId, bref: selection.bref, pickNumber });
          }
          state.draft = advanceDraftToUserPick(state.draft, state.season);
          persist();
          render();
          return;
        }
        if (action === "forfeit") {
          const pickNumber = state.draft.currentPick + 1;
          state.draft = forfeitDraftPick(state.draft, state.season);
          state.picked.push({ prospectId: null, bref: null, pickNumber, forfeited: true });
          state.draft = advanceDraftToUserPick(state.draft, state.season);
          persist();
          render();
          return;
        }
        if (action === "run-review") {
          runReview();
          persist();
          render();
          return;
        }
        if (action === "restart") {
          if (!window.confirm(L("换个种子重新开始？当前这次选秀的结果会被清除。", "Start over with a new seed? This draft's outcome will be cleared.", lang()))) return;
          const root = readRootSave() || {};
          delete root.gmDraftGamble;
          writeRootSave(root);
          await open(true);
        }
      } catch (e) {
        console.warn(e);
      }
    });
  }

  /** Move pick ownership after an accepted trade and record the ledger. */
  function applyTrade(targetSlot, giveSlots, lastResult) {
    const previousOwner = state.pickOwnership[targetSlot];
    state.pickOwnership[targetSlot] = GAMBLE_TEAM_ID;
    for (const slot of giveSlots) {
      state.pickOwnership[slot] = previousOwner;
    }
    rebuildDraftOrder();
    const lopsided = lastResult?.lopsided === true;
    state.ledger = recordNegotiationOutcome(state.ledger, previousOwner, {
      result: lopsided ? "accepted-lopsided" : "accepted",
      targetSlot,
      giveSlots: [...giveSlots],
    });
    persist();
  }

  async function open(forceNew = false) {
    el = ensureDraftGambleScreen();
    if (!el.__gambleWired) {
      wire();
      el.__gambleWired = true;
    }
    if (!PLAYERS.length) {
      render();
      if (typeof show === "function") show("draft-gamble");
      return;
    }
    const root = readRootSave() || {};
    const saved = root.gmDraftGamble;
    if (forceNew || !validGambleState(saved)) {
      const seed = forceNew
        ? `draft-gamble-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`
        : GAMBLE_SEED_DEFAULT;
      gamble = buildGamble({ players: PLAYERS, seed });
      state = freshState(seed, gamble);
      neg = null;
      persist();
    } else {
      state = saved;
      gamble = buildGamble({ players: PLAYERS, seed: state.seed });
      // The saved draft/season carry the in-progress picks; the rebuilt
      // gamble supplies the full prospect board, reports and hidden
      // potentials (deterministic for the seed).
      gamble.draft = state.draft;
      gamble.season = state.season;
      neg = null;
    }
    render();
    if (typeof show === "function") show("draft-gamble");
  }

  return { open, render };
}
