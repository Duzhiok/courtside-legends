/**
 * Legend Duel UI: challenger/legend select -> 1v1 duel screen -> result screen.
 *
 * The duel screen is created dynamically (no index.html change): ensureDuelScreen()
 * appends <main id="screen-duel"> once, and app.js registers it in its screens map.
 * app.js passes show()/goBack() in via initDuelView(); until then the view is
 * inert and openDuelChallenge() returns false (the Gallery falls back to the
 * player profile in that case).
 *
 * Text is zh/en through L() at the source (JS-rendered copy does not belong in
 * the static PHRASES table). Portraits reuse resolveCardPhoto(); a legend with
 * only a generated silhouette gets no photo (same rule as the home wall).
 */
import { L, getLang, skillNameL } from "../i18n.js";
import { SKILL_PACKS } from "../data/skills.js";
import { GALLERY_LEGENDS, eraLabel, legendName } from "./homeShowcase.js";
import { resolveCardPhoto } from "../data/photo.js";
import { getAccount } from "../data/account.js";
import { readIdentity } from "../data/profile.js";
import { BODY_PRESETS, readLook } from "../data/avatarLook.js";
import { mountAvatar3d } from "./avatar3d.js";
import { portraitFor } from "./portraitFor.js";
import { createDuel, playPossession, DUEL_DIFFICULTIES } from "../duel/duelSim.js";
import { createTakeover, applyPossession, spacingByOffense, OFFENSE_LABEL, DEFENSE_LABEL } from "../duel/duelTakeover.js";
import { mountDuelCourt } from "./duelCourtView.js";
import { duelSpriteHtml } from "./duelSprites.js";
import {
  avatarChallengerKey,
  avatarToDuelist,
  getOrCreateAvatarDuelist,
  hasAvatar,
} from "../duel/duelAvatar.js";
import {
  legendById,
  legendCard,
  cardToDuelist,
  ownedDuelists,
  legendDuelists,
  readDuelRecord,
  recordDuelResult,
} from "../duel/duelStore.js";

const DIFFICULTY_LABEL = {
  rookie: ["新手", "Rookie", "传奇状态一般，防守很少针对你", "The legend plays loose and rarely counters you"],
  pro: ["职业", "Pro", "传奇正常发挥，会针对你的习惯", "The legend plays true to form and counters your habits"],
  legend: ["传奇", "Legend", "传奇全力以赴，针对性极强", "The legend brings everything and counters sharply"],
};

let showFn = null;
let goBackFn = null;
let current = null; // { state, challenger, legend, difficulty, takeover }
let courtController = null; // mountDuelCourt handle for the live match screen
let selection = { challengerKind: "owned", challengerId: null, legendId: null, difficulty: "pro" };
let avatarViewer = null; // mountAvatar3d handle for the select screen's preview
let avatarViewerToken = 0;

/** Drop the live court (keyboard + pointer listeners) when leaving the match. */
function destroyCourtController() {
  courtController?.destroy();
  courtController = null;
}

export function initDuelView({ show, goBack }) {
  showFn = show;
  goBackFn = goBack;
}

export function duelReady() {
  return !!showFn && !!document.querySelector("#screen-duel");
}

export function ensureDuelScreen() {
  let el = document.querySelector("#screen-duel");
  if (el) return el;
  el = document.createElement("main");
  el.id = "screen-duel";
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-duel-back" type="button"><span>${L("返回", "Back")}</span></button><h2>${L("传奇单挑 · Legend Duel", "Legend Duel")}</h2></div><div id="duel-body"></div>`;
  document.body.appendChild(el);
  el.querySelector("#btn-duel-back").addEventListener("click", () => {
    destroyCourtController();
    if (goBackFn) goBackFn();
    else if (showFn) showFn("home");
  });
  return el;
}

function esc(text) {
  return String(text ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
}

/** Real art for a duelist, or null when only a generated silhouette exists. */
function duelistPhoto(duelist) {
  if (duelist?.photo) return duelist.photo; // D2 avatar: its My World portrait
  if (!duelist?.bref) return null;
  const { photo, photoSource } = resolveCardPhoto({ bref: duelist.bref, season: duelist.season });
  return photoSource === "generated" ? null : photo;
}

function photoHtml(duelist, size = 72) {
  const src = duelistPhoto(duelist);
  if (!src) {
    return `<span class="duel-photo-fallback" style="display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;border-radius:50%;background:#123f2a;color:#e8c15a;font-weight:700;font-size:20px;">${esc((duelist?.name || "?").slice(0, 1))}</span>`;
  }
  return `<img src="${esc(src)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" style="width:${size}px;height:${size}px;border-radius:50%;object-fit:cover;" onerror="this.remove()">`;
}

function duelistLine(duelist) {
  const name = duelist.displayName || duelist.name;
  return `${esc(name)} · ${esc(duelist.pos || "")} · OVR ${esc(duelist.ovr)}`;
}

function bodyEl() {
  return document.querySelector("#duel-body");
}

function disposeAvatarViewer() {
  avatarViewerToken += 1;
  if (avatarViewer) {
    try {
      avatarViewer.dispose();
    } catch {
      // Already gone; the static portrait stays.
    }
    avatarViewer = null;
  }
}

/** The account's avatar as a duelist (D2), or null when no avatar exists yet. */
function avatarDuelist(account) {
  if (!account && !hasAvatar(null)) return null;
  const name = readIdentity(account).name || L("我的头像", "My Avatar");
  return getOrCreateAvatarDuelist(account, { name });
}

/** Open the select screen. `legendId` preselects a legend (Gallery challenge). */
export function openDuelSelect({ legendId = null, challengerId = null, challengerKind = null } = {}) {
  ensureDuelScreen();
  if (!duelReady()) return false;
  const legend = legendId ? legendById(legendId) : null;
  selection = {
    challengerKind: challengerKind || selection.challengerKind || "owned",
    challengerId: challengerId || selection.challengerId || null,
    legendId: legend ? legend.bref : selection.legendId || null,
    difficulty: selection.difficulty || "pro",
  };
  renderSelect();
  showFn("duel");
  return true;
}

/** Gallery entry: challenge one legend. False when not ready / unknown legend. */
export function openDuelChallenge(legendId, { challengerKind = null } = {}) {
  if (!duelReady()) return false;
  const legend = legendById(legendId);
  if (!legend) return false;
  selection.legendId = legend.bref;
  return openDuelSelect({ legendId: legend.bref, challengerKind });
}

/** Gallery entry: challenge one legend with My Avatar (D2). */
export function openDuelAvatarChallenge(legendId) {
  return openDuelChallenge(legendId, { challengerKind: "avatar" });
}

function renderSelect() {
  const body = bodyEl();
  if (!body) return;
  destroyCourtController();
  disposeAvatarViewer();
  const account = getAccount();
  const owned = ownedDuelists(account);
  const legends = legendDuelists();
  const record = readDuelRecord(account);
  const defeated = new Set(record.defeated || []);

  // D2: the avatar tab shows the player's own Duel Profile (derived from the
  // avatar look, never from a card). Display only derives it — the profile is
  // created + stored when the challenge actually starts (resolveSelection).
  const avatarName = readIdentity(account).name || L("我的头像", "My Avatar");
  const avatar = selection.challengerKind === "avatar" && hasAvatar(account)
    ? avatarToDuelist(readLook(account), { ownerId: account?.id || "guest", name: avatarName })
    : null;
  if (selection.challengerKind === "avatar" && avatar && !selection.challengerId?.startsWith("avatar:")) {
    selection.challengerId = avatarChallengerKey(account);
  }

  const challengerList = selection.challengerKind === "legend"
    ? legends.map((d) => ({ duelist: d, key: `legend:${d.bref}` }))
    : selection.challengerKind === "avatar"
      ? (avatar ? [{ duelist: avatar, key: avatarChallengerKey(account) }] : [])
      : owned.map((d) => ({ duelist: d, key: `owned:${d.id}` }));
  const avatarBody = avatar ? BODY_PRESETS.find((b) => b.id === avatar.body) : null;
  const avatarSkills = avatar ? avatar.skills.map((id) => (SKILL_PACKS[id]?.name ? skillNameL(SKILL_PACKS[id].name, getLang()) : id)).join(getLang() === "zh" ? "、" : ", ") : "";

  body.innerHTML = `
    <p class="tiny">${esc(L("半场 1v1，先到 11 分且领先 2 分获胜；内线 1 分，外线 2 分。胜了不送传奇卡——传奇还得靠抽卡。", "Half-court 1v1, first to 11 and win by 2; 1 point inside, 2 outside. Winning does not gift the legend card — legends still come from pulls."))}</p>
    <h3>${esc(L("你的挑战者", "Your challenger"))}</h3>
    <div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;">
      <button type="button" class="btn small${selection.challengerKind === "owned" ? " active" : ""}" data-challenger-kind="owned">${esc(L("我的球员", "My Team card"))}</button>
      <button type="button" class="btn small${selection.challengerKind === "avatar" ? " active" : ""}" data-challenger-kind="avatar">${esc(L("我的头像", "My Avatar"))}</button>
      <button type="button" class="btn small${selection.challengerKind === "legend" ? " active" : ""}" data-challenger-kind="legend">${esc(L("传奇对传奇", "Legend vs Legend"))}</button>
    </div>
    ${selection.challengerKind === "avatar" && !avatar ? `
      <p class="tiny">${esc(L("还没有创建头像——先去我的世界捏一个头像，再回来挑战传奇。", "No avatar yet — create one in My World first, then come back to challenge a legend."))}</p>
      <p><button type="button" class="btn small" id="btn-duel-goto-avatar">${esc(L("去我的世界创建头像", "Create my avatar in My World"))}</button></p>
    ` : ""}
    ${selection.challengerKind === "avatar" && avatar ? `
      <div id="duel-avatar-stage" style="height:200px;max-width:220px;margin:0 auto 8px;display:flex;align-items:center;justify-content:center;">
        <img class="duel-avatar-static" src="${esc(portraitFor(account)?.src || "")}" alt="" width="120" height="120" style="border-radius:50%;object-fit:cover;" />
      </div>
      <p class="tiny" style="text-align:center;">${esc(L(`体型：${avatarBody ? L(avatarBody.zh, avatarBody.en) : ""} · 位置 ${avatar.pos} · 投篮 ${avatar.shooting} 终结 ${avatar.finishing} 控球 ${avatar.handles} 防守 ${avatar.defense} 力量 ${avatar.strength} 速度 ${avatar.speed} 体力 ${avatar.stamina}${avatarSkills ? ` · 技能：${avatarSkills}` : ""}`, `Build: ${avatarBody ? L(avatarBody.zh, avatarBody.en) : ""} · ${avatar.pos} · Shooting ${avatar.shooting} Finishing ${avatar.finishing} Handles ${avatar.handles} Defense ${avatar.defense} Strength ${avatar.strength} Speed ${avatar.speed} Stamina ${avatar.stamina}${avatarSkills ? ` · Skill: ${avatarSkills}` : ""}`))}</p>
    ` : ""}
    <div class="mode-grid" style="margin-bottom:12px;">
      ${challengerList.length ? challengerList.map(({ duelist, key }) => `
        <button type="button" class="mode-card" data-challenger="${esc(key)}" style="${selection.challengerId === key ? "outline:2px solid #e8c15a;" : ""}">
          <strong>${esc(duelist.displayName || duelist.name)}</strong>
          <span>${esc(duelist.pos || "")} · OVR ${esc(duelist.ovr)}${duelist.era ? ` · ${esc(duelist.era)}` : ""}</span>
        </button>`).join("") : (selection.challengerKind === "avatar" ? "" : `<p class="tiny">${esc(selection.challengerKind === "owned" ? L("还没有自己的球员卡——先去抽卡，或者选“传奇对传奇”。", "No owned cards yet — go pull some cards, or pick Legend vs Legend.") : L("名册加载中，稍后再试。", "Roster still loading, try again in a moment."))}</p>`)}
    </div>
    ${selection.challengerKind === "owned" && !owned.length ? `<p><button type="button" class="btn small" id="btn-duel-goto-draw">${esc(L("去抽卡", "Go pull cards"))}</button></p>` : ""}
    <h3>${esc(L("传奇守关者", "Legend defender"))}</h3>
    <div class="mode-grid" style="margin-bottom:12px;">
      ${legends.map((d) => `
        <button type="button" class="mode-card" data-legend="${esc(d.bref)}" style="${selection.legendId === d.bref ? "outline:2px solid #e8c15a;" : ""}">
          <strong>${esc(d.displayName || d.name)}${defeated.has(d.bref) ? ` ${esc(L("✓ 已击败", "✓ Beaten"))}` : ""}</strong>
          <span>${esc(eraLabel(d.season, getLang()))} · OVR ${esc(d.ovr)}</span>
        </button>`).join("")}
    </div>
    <h3>${esc(L("难度", "Difficulty"))}</h3>
    <div style="display:flex;gap:8px;margin-bottom:12px;">
      ${DUEL_DIFFICULTIES.map((diff) => `
        <button type="button" class="btn small${selection.difficulty === diff ? " active" : ""}" data-difficulty="${diff}">${esc(L(DIFFICULTY_LABEL[diff][0], DIFFICULTY_LABEL[diff][1]))}</button>`).join("")}
    </div>
    <p class="tiny">${esc(L(DIFFICULTY_LABEL[selection.difficulty][2], DIFFICULTY_LABEL[selection.difficulty][3]))}</p>
    <p><button type="button" class="btn" id="btn-duel-start" ${selection.challengerId && selection.legendId ? "" : "disabled"}>${esc(L("开始单挑", "Start the duel"))}</button></p>
    <p class="tiny">${esc(L(`战绩：${record.wins} 胜 ${record.losses} 负 · 已击败 ${record.defeated.length} 位传奇`, `Record: ${record.wins}W ${record.losses}L · ${record.defeated.length} legends beaten`))}</p>
  `;

  body.querySelectorAll("[data-challenger-kind]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selection.challengerKind = btn.getAttribute("data-challenger-kind");
      selection.challengerId = null;
      renderSelect();
    });
  });
  body.querySelectorAll("[data-challenger]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selection.challengerId = btn.getAttribute("data-challenger");
      renderSelect();
    });
  });
  body.querySelectorAll("[data-legend]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selection.legendId = btn.getAttribute("data-legend");
      renderSelect();
    });
  });
  body.querySelectorAll("[data-difficulty]").forEach((btn) => {
    btn.addEventListener("click", () => {
      selection.difficulty = btn.getAttribute("data-difficulty");
      renderSelect();
    });
  });
  body.querySelector("#btn-duel-goto-draw")?.addEventListener("click", () => showFn("draw"));
  body.querySelector("#btn-duel-goto-avatar")?.addEventListener("click", () => showFn("home"));
  body.querySelector("#btn-duel-start")?.addEventListener("click", () => startDuel());
  // D2: 3D preview of the avatar on its own tab. WebGL/model failure is not
  // fatal — the static portrait rendered inside the stage stays visible.
  const stage = body.querySelector("#duel-avatar-stage");
  if (stage) {
    const token = ++avatarViewerToken;
    mountAvatar3d(stage, { look: readLook(getAccount()) }).then((handle) => {
      if (token !== avatarViewerToken || !stage.isConnected) return handle.dispose();
      avatarViewer = handle;
      stage.querySelector(".duel-avatar-static")?.setAttribute("hidden", "");
    }).catch(() => {
      // No WebGL / model failed to load: keep the static portrait.
    });
  }
}

function resolveSelection() {
  const account = getAccount();
  let challenger = null;
  let challengerKind = selection.challengerKind;
  if (selection.challengerId?.startsWith("legend:")) {
    const bref = selection.challengerId.slice("legend:".length);
    challenger = legendDuelists().find((d) => d.bref === bref) || null;
    challengerKind = "legend";
  } else if (selection.challengerId?.startsWith("avatar:")) {
    // D2: creates + stores the Duel Profile on the first Avatar challenge.
    challenger = avatarDuelist(account);
    challengerKind = "avatar";
  } else if (selection.challengerId?.startsWith("owned:")) {
    const id = selection.challengerId.slice("owned:".length);
    challenger = ownedDuelists(account).find((d) => d.id === id) || null;
    challengerKind = "owned";
  }
  if (challenger && challengerKind === "avatar") {
    // The avatar has no card photo: show its My World portrait instead.
    challenger = { ...challenger, photo: portraitFor(account)?.src || null };
  }
  const legendEntry = legendById(selection.legendId);
  const legendCardObj = legendEntry ? legendCard(legendEntry) : null;
  const legend = legendCardObj ? { ...cardToDuelist(legendCardObj), displayName: legendName(legendEntry, getLang()) } : null;
  return { challenger, challengerKind, legend, legendEntry };
}

function startDuel() {
  const { challenger, challengerKind, legend, legendEntry } = resolveSelection();
  if (!challenger || !legend) return;
  const state = createDuel({ challenger, legend, difficulty: selection.difficulty });
  current = { state, challenger, challengerKind, legend, legendEntry, difficulty: selection.difficulty, takeover: createTakeover() };
  renderDuel();
}

/**
 * D3: the match screen is the 2D takeover court (js/ui/duelCourtView.js).
 * The court is presentation only — a choice resolves through playPossession
 * in the onChoice callback below, and movement only moves markers. The
 * result screen (finishDuel) is unchanged.
 */
function renderDuel() {
  const body = bodyEl();
  if (!body || !current) return;
  destroyCourtController();
  courtController = mountDuelCourt(body, {
    getState: () => current.state,
    getTakeover: () => current.takeover,
    setTakeover: (t) => { current.takeover = t; },
    challenger: current.challenger,
    legend: current.legend,
    photoHtml,
    onChoice: (choice) => {
      if (!current || current.state.over) return;
      const myBall = current.state.possession === "a";
      // D3.1: the live court state feeds the spacing map — the resolved
      // offense's term applies. With no map the duel would resolve exactly
      // as before; the map is what makes positioning matter.
      const event = playPossession(current.state, myBall ? { offense: choice } : { defense: choice }, { spacing: spacingByOffense(current.takeover) });
      current.takeover = applyPossession(current.takeover, current.state, event);
      if (current.state.over) finishDuel();
      else renderDuel();
    },
    onQuit: () => {
      destroyCourtController();
      current = null;
      openDuelSelect({});
    },
  });
}

function finishDuel() {
  const body = bodyEl();
  if (!body || !current) return;
  destroyCourtController();
  const { state, challenger, challengerKind, legend, legendEntry, difficulty } = current;
  const won = state.winner === "a";
  const account = getAccount();
  const { record, xp } = recordDuelResult(account, {
    duelId: state.id,
    legendBref: legend.bref,
    legendName: legend.displayName || legend.name,
    challengerId: challenger.id,
    challengerName: challenger.displayName || challenger.name,
    challengerKind,
    difficulty,
    won,
    scoreA: state.a.score,
    scoreB: state.b.score,
  });
  const nextLegend = nextUndefeatedLegend(record);
  const allBeaten = !nextLegend && GALLERY_LEGENDS.length > 0;
  body.innerHTML = `
    <div style="text-align:center;margin:16px 0;">
      <div class="duel-result-sprite">${duelSpriteHtml(won ? challenger : legend, { action: "celebrate" })}</div>
      <div style="font-size:28px;font-weight:800;">${won ? esc(L("你赢了！", "You win!")) : esc(L("传奇获胜", "The legend wins"))}</div>
      <div style="font-size:40px;font-weight:800;margin:8px 0;">${state.a.score} — ${state.b.score}</div>
      <div class="tiny">${esc(challenger.displayName || challenger.name)} vs ${esc(legend.displayName || legend.name)} · ${esc(L(DIFFICULTY_LABEL[difficulty][0], DIFFICULTY_LABEL[difficulty][1]))}</div>
      <div class="tiny">${esc(L(`投篮 ${state.a.makes}/${state.a.shots} · 传奇 ${state.b.makes}/${state.b.shots}`, `Shooting ${state.a.makes}/${state.a.shots} · Legend ${state.b.makes}/${state.b.shots}`))}</div>
      ${won ? `<p>${esc(L(`+${xp.gained || 0} Account XP（单挑胜利奖励）`, `+${xp.gained || 0} Account XP (duel win bonus)`))}</p>` : ""}
      <p class="tiny">${esc(L(`战绩：${record.wins} 胜 ${record.losses} 负 · 已击败 ${record.defeated.length} 位传奇`, `Record: ${record.wins}W ${record.losses}L · ${record.defeated.length} legends beaten`))}</p>
      ${allBeaten ? `<p>${esc(L(`已击败全部 ${GALLERY_LEGENDS.length} 位传奇！`, `All ${GALLERY_LEGENDS.length} legends beaten!`))}</p>` : ""}
    </div>
    <div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap;">
      <button type="button" class="btn" id="btn-duel-retry">${esc(L("再打一次", "Retry"))}</button>
      ${nextLegend ? `<button type="button" class="btn" id="btn-duel-next">${esc(L(`挑战下一位：${nextLegend.name}`, `Next legend: ${nextLegend.name}`))}</button>` : ""}
      <button type="button" class="btn ghost" id="btn-duel-return">${esc(L("返回", "Return"))}</button>
    </div>
  `;
  body.querySelector("#btn-duel-retry")?.addEventListener("click", () => startDuel());
  body.querySelector("#btn-duel-next")?.addEventListener("click", () => {
    selection.legendId = nextLegend.bref;
    openDuelSelect({ legendId: nextLegend.bref });
  });
  body.querySelector("#btn-duel-return")?.addEventListener("click", () => {
    current = null;
    if (goBackFn) goBackFn();
    else if (showFn) showFn("home");
  });
}

/** First gallery legend not yet beaten, or null once all are beaten. Exported for tests. */
export function nextUndefeatedLegend(record) {
  const defeated = new Set(record.defeated || []);
  // No fallback to the first legend: once every gallery legend is beaten
  // there is no "next" one, and offering an already-defeated legend as the
  // next challenge is misleading. Callers render no Next button then.
  return GALLERY_LEGENDS.find((l) => !defeated.has(l.bref)) || null;
}

/** My World record block. Re-rendered after every My World refresh (see app.js refreshMyWorld). */
export function paintDuelRecordsIntoMyWorld() {
  const root = document.querySelector("#my-world-root");
  if (!root) return;
  root.querySelector("#duel-records")?.remove();
  const account = getAccount();
  const record = readDuelRecord(account);
  const names = (record.defeated || []).map((bref) => {
    const entry = GALLERY_LEGENDS.find((l) => l.bref === bref);
    return entry ? legendName(entry, getLang()) : bref;
  });
  const section = document.createElement("section");
  section.id = "duel-records";
  section.className = "duel-records";
  section.innerHTML = `
    <h3>${esc(L("传奇单挑", "Legend Duel"))}</h3>
    <p class="tiny">${record.games.length
      ? esc(L(`战绩 ${record.wins} 胜 ${record.losses} 负 · 已击败：${names.length ? names.join("、") : "暂无"}`, `Record ${record.wins}W ${record.losses}L · Beaten: ${names.length ? names.join(", ") : "none yet"}`))
      : esc(L("还没打过单挑——去挑战一位传奇吧。", "No duels yet — go challenge a legend."))}</p>
    <p><button type="button" class="btn small" id="btn-duel-from-world">${esc(L("挑战传奇", "Challenge a legend"))}</button></p>
  `;
  root.appendChild(section);
  section.querySelector("#btn-duel-from-world")?.addEventListener("click", () => openDuelSelect({}));
}
