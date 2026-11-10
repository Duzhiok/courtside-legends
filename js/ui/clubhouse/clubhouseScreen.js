/**
 * My Team Clubhouse controller. Owns only UI state (open picker, open trophy, collection filter). The lineup it edits
 * is the account's SAVED lineup, changed through the same pure functions and the same single save path the
 * lineup editor uses (toggleRoster / toggleStarter / saveMyTeamLineup): there is no second roster state.
 * Season start/resume/collection/draw are injected callbacks, so this file never touches saves or the engine.
 */
import { overall } from "../../data/players.js";
import { playerSlotPos } from "../../engine/gameplan.js";
import { toggleRoster, toggleStarter } from "../../myteam/lineup.js";
import { issueText } from "../myTeamLineupView.js";
import { FILTER_DEFAULT, buildClubhouse } from "./clubhouseModel.js";
import { clubhouseHtml } from "./clubhouseView.js";

export function createClubhouse({
  el,
  getLang,
  getAccount,
  getSeason = () => null, // () => { exists, done, label, variant } | null   this player's My Team slot
  saveLineup, // (accountId, draft) => { ok }
  onStart = () => {}, // (variant) => void
  onResume = () => {},
  onOpenLineup = () => {},
  onOpenCollection = () => {},
  onOpenDraw = () => {},
  onOpenAccounts = () => {},
}) {
  if (!el) return { render() {}, refresh() {} };
  let ui = { pick: null, notice: "", openRecord: null, filter: { ...FILTER_DEFAULT } };
  let ownerId = null;
  const L = (zh, en) => (getLang() === "en" ? en : zh);
  const model = () => buildClubhouse({ account: getAccount(), lang: getLang(), season: getSeason(), filter: ui.filter });

  function render() {
    const account = getAccount();
    // Account switched under the page: never carry one account's picker/notice into another.
    if ((account?.id || null) !== ownerId) { ownerId = account?.id || null; ui = { pick: null, notice: "", openRecord: null, filter: { ...FILTER_DEFAULT } }; }
    el.innerHTML = clubhouseHtml(model(), ui, L);
  }

  const nameOf = (c) => (getLang() === "en" ? c.nameEn || c.name : c.name);

  /** Put `inId` into the starting five in place of `outId` (or into a free spot). Saves only on success. */
  function swap(inId, outId) {
    const account = getAccount();
    if (!account) return;
    const m = model();
    const card = m.cards.find((c) => c.id === inId);
    const out = outId ? m.cards.find((c) => c.id === outId) : null;
    let d = m.draft;
    const fail = (code) => { ui.notice = issueText({ code }, getLang()); ui.pick = null; render(); };
    const full = d.rosterIds.length >= m.rules.maxRoster && !d.rosterIds.includes(inId);
    if (out) {
      // A full roster loses the replaced card entirely (so the count holds); otherwise he stays on the bench.
      const r = full ? toggleRoster(account, d, outId, m.rules) : toggleStarter(d, outId, m.rules);
      d = r.draft;
    }
    if (!d.rosterIds.includes(inId)) {
      const r = toggleRoster(account, d, inId, m.rules);
      if (r.blocked) return fail(r.blocked);
      d = r.draft;
    }
    const r = toggleStarter(d, inId, m.rules);
    if (r.blocked) return fail(r.blocked);
    const res = saveLineup(account.id, r.draft);
    ui.pick = null;
    if (!res?.ok) ui.notice = L("保存失败。", "Could not save the lineup.");
    else ui.notice = out ? L(`已换上 ${nameOf(card)}，替下 ${nameOf(out)}。`, `${nameOf(card)} starts, ${nameOf(out)} sits.`) : L(`${nameOf(card)} 进入首发。`, `${nameOf(card)} joins the starting five.`);
    render();
  }

  /** From the collection: start him in his own slot, replacing that slot's starter (or the weakest one when the five is full). */
  function promote(inId) {
    const m = model();
    const card = m.cards.find((c) => c.id === inId);
    if (!card) return;
    const starters = m.starters.map((s) => s.card).filter(Boolean);
    let out = starters.find((c) => playerSlotPos(c) === playerSlotPos(card)) || null;
    if (!out && starters.length >= m.rules.starters) out = starters.slice().sort((a, b) => overall(a) - overall(b))[0];
    swap(inId, out?.id || null);
  }

  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled || btn.tagName === "SELECT") return;
    const v = btn.dataset;
    switch (v.act) {
      case "signin": return onOpenAccounts();
      case "lineup": return onOpenLineup();
      case "start": case "again": return onStart(v.variant || "quick");
      case "resume": return onResume();
      case "collection": return onOpenCollection();
      case "draw": return onOpenDraw();
      case "pick": ui.pick = { slot: v.slot, outId: v.out || null }; ui.notice = ""; return render();
      case "pick-cancel": ui.pick = null; return render();
      case "swap": return swap(v.in, ui.pick?.outId || null);
      case "promote": return promote(v.in);
      case "record": ui.openRecord = ui.openRecord === v.id ? null : v.id; return render();
      case "fpos": ui.filter = { ...ui.filter, pos: v.v }; return render();
      case "fview": ui.filter = { ...ui.filter, view: ui.filter.view === "list" ? "grid" : "list" }; return render();
      default:
    }
  });
  el.addEventListener("change", (e) => {
    const sel = e.target.closest("select[data-act]");
    if (!sel) return;
    if (sel.dataset.act === "fdecade") ui.filter = { ...ui.filter, decade: sel.value };
    if (sel.dataset.act === "fsort") ui.filter = { ...ui.filter, sort: sel.value };
    render();
  });

  return { render, refresh: render };
}
