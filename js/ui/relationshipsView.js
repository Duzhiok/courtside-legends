/**
 * Career Relationships dev panel (workstream E, Career 2.0).
 *
 * A clearly-marked DEV surface, opened with ?relationships=1. It reads
 * the active account's careerRelationships store and lets a tester run
 * the full loop by hand: add people and relationships, make promises,
 * feed in real season state, resolve due promises, and watch the trust
 * effect land on the live Reborn run (or stay pending when no run is
 * loaded). It is not a player-facing screen — the real consumers are
 * the inbox (A), negotiation (C) and takeover (A) flows, which read the
 * same module. It never invents offers or transitions: transitions are
 * recorded by the Opportunity engine (workstream G) and read here.
 */
import {
  RELATIONSHIP_KINDS,
  addRelationship,
  applyPromiseTrustToRoot,
  legacySummaryFor,
  makePromise,
  markTrustEffectsApplied,
  negotiationStanding,
  pendingTrustEffects,
  recordDivergence,
  recordPerson,
  recordRivalryGame,
  relationshipsStore,
  resolveDuePromises,
  rivalryStakes,
} from "../career/careerRelationships.js";

export function ensureRelationshipsScreen() {
  let el = document.querySelector("#screen-relationships");
  if (el) return el;
  el = document.createElement("main");
  el.id = "screen-relationships";
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-relationships-back" type="button"><span>返回</span></button><h2>职业关系 · Relationships (DEV)</h2></div><div id="relationships-body"></div>`;
  document.body.appendChild(el);
  return el;
}

const L = (zh, en, lang) => (lang === "en" ? en : zh);
const esc = (v) =>
  String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const KIND_LABEL = {
  rivalry: ["宿敌", "Rivalry"],
  mentorship: ["师徒", "Mentorship"],
  "coaching-trust": ["教练信任", "Coaching trust"],
  management: ["管理关系", "Management"],
  owner: ["老板关系", "Owner"],
};
const PROMISE_KIND_LABEL = {
  minutes: ["上场时间", "Minutes"],
  role: ["轮换角色", "Role"],
  start: ["首发机会", "Start"],
  trade: ["交易", "Trade"],
  contract: ["合同", "Contract"],
};
const ROLE_OPTIONS = ["dnp", "garbage", "bench", "rotation", "starter"];

export function createRelationshipsView({ getLang, getAccount, saveAccount, readRootSave, writeRootSave, show, goBack } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  let el = null;
  let body = null;
  let lastResult = "";
  let backWired = false;

  const personOptions = (store, selectedId = "") =>
    store.people
      .map((p) => `<option value="${esc(p.id)}" ${p.id === selectedId ? "selected" : ""}>${esc(p.name)} (${esc(p.id)})</option>`)
      .join("");

  function render() {
    const account = typeof getAccount === "function" ? getAccount() : null;
    if (!el) el = document.querySelector("#screen-relationships");
    if (!body) body = document.querySelector("#relationships-body");
    if (!el || !body) return;
    if (!account) {
      body.innerHTML = `<p>${L("请先创建或选择一个账号。", "Create or pick an account first.", lang())}</p>`;
      return;
    }
    const store = relationshipsStore(account);
    const summary = legacySummaryFor(account);
    const pending = pendingTrustEffects(account);
    const root = typeof readRootSave === "function" ? readRootSave() : null;
    const liveTrust = root?.reborn?.player?.coachTrust;

    const peopleHtml = store.people.length
      ? store.people
          .map((p) => {
            const standing = p.kind === "coach" || p.kind === "gm" || p.kind === "owner" ? negotiationStanding(account, p.id) : null;
            return `<li>${esc(p.name)} <span class="tiny">${esc(p.kind)} · ${esc(p.id)}${p.bref ? ` · ${esc(p.bref)}` : ""}${standing ? ` · ${L("谈判", "Negotiation", lang())} ${standing.modifier >= 0 ? "+" : ""}${standing.modifier}` : ""}</span></li>`;
          })
          .join("")
      : `<li class="tiny">${L("还没有人物。先加两个人，再建立关系或承诺。", "No people yet. Add two people, then a relationship or a promise.", lang())}</li>`;

    const relsHtml = store.relationships.length
      ? store.relationships
          .map((r) => {
            const a = store.people.find((p) => p.id === r.aId);
            const b = store.people.find((p) => p.id === r.bId);
            const rivalBtns =
              r.kind === "rivalry" && r.state === "active"
                ? ` <button type="button" data-action="rivalry-game" data-opp="${esc(b?.bref || b?.id || "")}" data-won="1">${L("赢了宿敌", "Beat rival", lang())}</button>
                    <button type="button" data-action="rivalry-game" data-opp="${esc(b?.bref || b?.id || "")}" data-won="0">${L("输给宿敌", "Lost to rival", lang())}</button>`
                : "";
            return `<li>${esc(a?.name || r.aId)} ↔ ${esc(b?.name || r.bId)} · ${L(...(KIND_LABEL[r.kind] || [r.kind, r.kind]), lang())} · ${r.strength}/100${rivalBtns}</li>`;
          })
          .join("")
      : `<li class="tiny">${L("还没有关系。", "No relationships yet.", lang())}</li>`;

    const promisesHtml = store.promises.length
      ? store.promises
          .map((p) => `<li>${esc(p.text)} <span class="tiny">· ${L(...(PROMISE_KIND_LABEL[p.kind] || [p.kind, p.kind]), lang())} · ${p.status}${p.effect ? ` · ${L("信任", "Trust", lang())} ${p.effect.trustDelta >= 0 ? "+" : ""}${p.effect.trustDelta}${p.effect.applied ? L("（已应用）", " (applied)", lang()) : L("（待应用）", " (pending)", lang())}` : ""}</span></li>`)
          .join("")
      : `<li class="tiny">${L("还没有承诺。", "No promises yet.", lang())}</li>`;

    const headlinesHtml = summary.headlines.length
      ? summary.headlines.map((h) => `<li>${esc(lang() === "en" ? h.en : h.zh)} <span class="tiny">· ${h.season ?? "?"} · ${esc(h.type)}</span></li>`).join("")
      : `<li class="tiny">${L("还没有 legacy 记录。承诺结算、宿敌对决和历史偏离会写在这里。", "No legacy records yet. Resolved promises, rivalry games and divergences land here.", lang())}</li>`;

    body.innerHTML = `
      <p class="tiny">${L(
        "开发面板：关系 / 承诺 / legacy 记录。承诺结算会把信任变化写进正在进行的 Reborn 生涯（没有生涯时先挂起，待应用）。",
        "Dev panel: relationships / promises / legacy. Resolving promises applies the trust change to the live Reborn run (or leaves it pending when no run is loaded).",
        lang(),
      )}</p>
      ${lastResult ? `<p data-testid="rel-result"><strong>${esc(lastResult)}</strong></p>` : ""}
      <p class="tiny">${L("当前账号", "Account", lang())}: ${esc(account.name || account.id)} · ${L("人物", "People", lang())} ${summary.people} · ${L("宿敌", "Rivalries", lang())} ${summary.rivalries} · ${L("承诺", "Promises", lang())} ${summary.promises.open}${L("待处理", " open", lang())} / ${summary.promises.fulfilled}${L("兑现", " kept", lang())} / ${summary.promises.broken}${L("落空", " broken", lang())} · ${L("待应用信任变化", "Pending trust effects", lang())} ${pending.length}${Number.isFinite(liveTrust) ? ` · ${L("当前 Reborn 信任", "Live Reborn trust", lang())} ${liveTrust}` : ""}</p>
      <section data-testid="rel-people"><h3>${L("人物", "People", lang())}</h3><ul>${peopleHtml}</ul>
        <p><input id="rel-person-id" placeholder="id (e.g. bryanko01)" size="14" /> <input id="rel-person-name" placeholder="${L("名字", "Name", lang())}" size="12" /> <input id="rel-person-bref" placeholder="bref (optional)" size="12" />
        <select id="rel-person-kind"><option value="player">${L("球员", "Player", lang())}</option><option value="coach">${L("教练", "Coach", lang())}</option><option value="gm">${L("经理", "GM", lang())}</option><option value="owner">${L("老板", "Owner", lang())}</option><option value="media">${L("媒体", "Media", lang())}</option></select>
        <button type="button" data-action="add-person">${L("添加人物", "Add person", lang())}</button></p></section>
      <section data-testid="rel-relationships"><h3>${L("关系", "Relationships", lang())}</h3><ul>${relsHtml}</ul>
        <p><select id="rel-a">${personOptions(store)}</select> ↔ <select id="rel-b">${personOptions(store)}</select>
        <select id="rel-kind">${RELATIONSHIP_KINDS.map((k) => `<option value="${k}">${L(...(KIND_LABEL[k] || [k, k]), lang())}</option>`).join("")}</select>
        <input id="rel-strength" type="number" min="0" max="100" value="50" style="width:4em" />
        <button type="button" data-action="add-relationship">${L("建立关系", "Add relationship", lang())}</button></p></section>
      <section data-testid="rel-promises"><h3>${L("承诺", "Promises", lang())}</h3><ul>${promisesHtml}</ul>
        <p><select id="rel-maker">${personOptions(store)}</select> → <select id="rel-target">${personOptions(store)}</select>
        <select id="rel-promise-kind">${Object.keys(PROMISE_KIND_LABEL).map((k) => `<option value="${k}">${L(...PROMISE_KIND_LABEL[k], lang())}</option>`).join("")}</select>
        <input id="rel-promise-text" placeholder="${L("承诺内容", "Promise text", lang())}" size="20" /></p>
        <p class="tiny">${L("检查参数（按种类取用）：", "Check params (used per kind):", lang())}
        <label>${L("场次", "Games", lang())} <input id="rel-min-games" type="number" value="5" style="width:3em" /></label>
        <label>MPG <input id="rel-min-mpg" type="number" value="20" style="width:3em" /></label>
        <label>${L("期限（场）", "Due in (games)", lang())} <input id="rel-due-games" type="number" value="5" style="width:3em" /></label>
        <label>${L("角色", "Role", lang())} <select id="rel-role">${ROLE_OPTIONS.map((r) => `<option value="${r}">${r}</option>`).join("")}</select></label>
        <label>${L("期限（赛季）", "Due season", lang())} <input id="rel-due-season" type="number" value="1997" style="width:4em" /></label>
        <button type="button" data-action="make-promise">${L("立下承诺", "Make promise", lang())}</button></p>
        <h4>${L("当前赛季状态（结算用）", "Current season state (for settlement)", lang())}</h4>
        <p><label>${L("赛季", "Season", lang())} <input id="rel-state-season" type="number" value="1996" style="width:4em" /></label>
        <label>${L("场次", "Game", lang())} <input id="rel-state-game" type="number" value="0" style="width:3em" /></label>
        <label>${L("已打场次", "Games played", lang())} <input id="rel-state-played" type="number" value="0" style="width:3em" /></label>
        <label>MPG <input id="rel-state-mpg" type="number" value="0" style="width:3em" /></label>
        <label>${L("角色", "Role", lang())} <select id="rel-state-role">${ROLE_OPTIONS.map((r) => `<option value="${r}">${r}</option>`).join("")}</select></label>
        <label><input id="rel-state-started" type="checkbox" /> ${L("首发过", "Started", lang())}</label>
        <label><input id="rel-state-traded" type="checkbox" /> ${L("已交易", "Traded", lang())}</label>
        <label><input id="rel-state-signed" type="checkbox" /> ${L("已续约", "Signed", lang())}</label>
        <button type="button" data-action="resolve" data-testid="rel-resolve">${L("检查并结算到期承诺", "Check & settle due promises", lang())}</button></p></section>
      <section data-testid="rel-legacy"><h3>${L("Legacy 记录", "Legacy record", lang())}</h3><ul>${headlinesHtml}</ul>
        <p><input id="rel-dv-subject" placeholder="${L("偏离主题", "Divergence subject", lang())}" size="16" /> <input id="rel-dv-real" placeholder="${L("真实历史", "Real history", lang())}" size="16" /> <input id="rel-dv-new" placeholder="${L("这条时间线", "This timeline", lang())}" size="16" /> <input id="rel-dv-cause" placeholder="${L("原因", "Cause", lang())}" size="12" />
        <button type="button" data-action="record-divergence">${L("记录历史偏离", "Record divergence", lang())}</button></p></section>`;
  }

  function readState() {
    const num = (id, fallback = 0) => {
      const v = Number(document.querySelector(id)?.value);
      return Number.isFinite(v) ? v : fallback;
    };
    return {
      season: num("#rel-state-season", 1996),
      game: num("#rel-state-game", 0),
      gamesPlayed: num("#rel-state-played", 0),
      mpg: num("#rel-state-mpg", 0),
      role: document.querySelector("#rel-state-role")?.value || "bench",
      started: !!document.querySelector("#rel-state-started")?.checked,
      traded: !!document.querySelector("#rel-state-traded")?.checked,
      signed: !!document.querySelector("#rel-state-signed")?.checked,
    };
  }

  function handleClick(event) {
    const btn = event.target.closest("[data-action]");
    if (!btn) return;
    const account = typeof getAccount === "function" ? getAccount() : null;
    if (!account) return;
    const action = btn.dataset.action;
    const val = (id) => document.querySelector(id)?.value?.trim() || "";
    const num = (id, fallback) => {
      const v = Number(document.querySelector(id)?.value);
      return Number.isFinite(v) ? v : fallback;
    };
    try {
      if (action === "add-person") {
        const id = val("#rel-person-id");
        if (!id) return;
        recordPerson(account, { id, kind: val("#rel-person-kind") || "player", name: val("#rel-person-name") || id, bref: val("#rel-person-bref") || undefined });
        lastResult = L(`已添加 ${id}`, `Added ${id}`, lang());
      } else if (action === "add-relationship") {
        const rel = addRelationship(account, {
          aId: val("#rel-a"),
          bId: val("#rel-b"),
          kind: val("#rel-kind") || "rivalry",
          strength: num("#rel-strength", 50),
          season: num("#rel-state-season", 1996),
        });
        lastResult = rel ? L("关系已建立", "Relationship added", lang()) : L("建立失败：检查双方和种类", "Failed: check both people and kind", lang());
      } else if (action === "make-promise") {
        const kind = val("#rel-promise-kind") || "minutes";
        const check =
          kind === "minutes"
            ? { type: "minutes", minGames: num("#rel-min-games", 5), minMpg: num("#rel-min-mpg", 20), dueAfterGames: num("#rel-due-games", 5) }
            : kind === "role"
              ? { type: "role", role: val("#rel-role") || "rotation", dueAfterGames: num("#rel-due-games", 5) }
              : kind === "start"
                ? { type: "start", dueAfterGames: num("#rel-due-games", 5) }
                : kind === "trade"
                  ? { type: "trade", dueSeason: num("#rel-due-season", 1997) }
                  : { type: "contract", dueSeason: num("#rel-due-season", 1997) };
        const p = makePromise(account, {
          makerId: val("#rel-maker"),
          targetId: val("#rel-target"),
          kind,
          text: val("#rel-promise-text") || L("承诺", "Promise", lang()),
          madeSeason: num("#rel-state-season", 1996),
          madeGame: num("#rel-state-game", 0),
          check,
        });
        lastResult = L(`已立下承诺：${p.text}`, `Promise made: ${p.text}`, lang());
      } else if (action === "resolve") {
        const state = readState();
        const { resolved, count } = resolveDuePromises(account, state);
        let trustNote = "";
        if (count > 0) {
          const pending = pendingTrustEffects(account);
          const root = typeof readRootSave === "function" ? readRootSave() : null;
          if (root?.reborn?.player && pending.length) {
            const before = root.reborn.player.coachTrust;
            const next = applyPromiseTrustToRoot(root, pending);
            if (next !== root) {
              if (typeof writeRootSave === "function") writeRootSave(next);
              markTrustEffectsApplied(account, pending.map((e) => e.promiseId));
              trustNote = L(`信任 ${before} → ${next.reborn.player.coachTrust}`, `Trust ${before} → ${next.reborn.player.coachTrust}`, lang());
            }
          } else if (pending.length) {
            trustNote = L(`信任变化已记录，待 Reborn 生涯加载后应用（${pending.length} 条）`, `Trust effects recorded, pending a loaded Reborn run (${pending.length})`, lang());
          }
        }
        lastResult =
          count === 0
            ? L("没有到期的承诺。", "No promises due.", lang())
            : L(`结算 ${count} 条承诺${trustNote ? `。${trustNote}` : ""}`, `Settled ${count} promise(s)${trustNote ? `. ${trustNote}` : ""}`, lang());
      } else if (action === "rivalry-game") {
        const opp = btn.dataset.opp || "";
        const rel = recordRivalryGame(account, { season: num("#rel-state-season", 1996), opponentBref: opp, won: btn.dataset.won === "1" });
        if (rel) {
          const stakes = rivalryStakes(account, opp);
          lastResult = L(`宿敌对决已记录，关系强度 ${rel.strength}，下场关键战信任赌注 ${stakes.trustSwing}`, `Rivalry game recorded, strength ${rel.strength}, next key game stakes ${stakes.trustSwing} trust`, lang());
        } else {
          lastResult = L("没有找到这名对手的宿敌关系。", "No active rivalry with that opponent.", lang());
        }
      } else if (action === "record-divergence") {
        const subject = val("#rel-dv-subject");
        if (!subject) return;
        recordDivergence(account, {
          season: num("#rel-state-season", 1996),
          subject,
          realOutcome: val("#rel-dv-real") || "—",
          newOutcome: val("#rel-dv-new") || "—",
          cause: val("#rel-dv-cause") || null,
        });
        lastResult = L(`已记录历史偏离：${subject}`, `Divergence recorded: ${subject}`, lang());
      } else {
        return;
      }
      if (typeof saveAccount === "function") saveAccount(account);
    } catch (e) {
      lastResult = L(`失败：${e?.message || e}`, `Failed: ${e?.message || e}`, lang());
    }
    render();
  }

  function open() {
    ensureRelationshipsScreen();
    el = document.querySelector("#screen-relationships");
    body = document.querySelector("#relationships-body");
    if (!body) return;
    body.removeEventListener("click", handleClick);
    body.addEventListener("click", handleClick);
    if (!backWired) {
      backWired = true;
      el.querySelector("#btn-relationships-back")?.addEventListener("click", () => {
        if (typeof goBack === "function") goBack();
        else el.classList.remove("active");
      });
    }
    lastResult = "";
    render();
    if (typeof show === "function") show("relationships");
    else el.classList.add("active");
  }

  return { open, render };
}
