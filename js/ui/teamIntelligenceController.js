/**
 * Team Intelligence controller (v3). Holds only PREVIEW state (which system is being looked at, manual role overrides).
 * It writes exactly three things, each on an explicit click: the active coach, the active tactic, the starting five.
 */
import { resolveCoach, ownedCoaches, saveAccount, setAccountCoach, setAccountTactic } from "../data/account.js";
import { coachTactics } from "../data/coaches.js";
import { coachProfile, selectableSystems, defaultSystem } from "../coaching/coachTacticalProfile.js";
import { ensureStarterCoach } from "../coaching/starterCoach.js";
import { analyzeTeam } from "../myteam/coachDrivenAnalysis.js";
import { recommendLineups } from "../myteam/lineupRecommendations.js";
import { teamIntelligenceHtml } from "./teamIntelligenceView.js";

export function createTeamIntelligence({ getLang, getAccount, saveLineup }) {
  let ownerId = null;
  let previewTactic = null;
  let roles = {};
  let notice = "";

  const L = (zh, en) => (getLang() === "en" ? en : zh);
  function reset() { previewTactic = null; roles = {}; notice = ""; }

  /** Switching coach keeps the active tactic only if the new coach (or the roster) can still run it. */
  function switchCoach(account, coachId) {
    setAccountCoach(account, coachId);
    const book = coachTactics(resolveCoach(coachId)).map((t) => t.id);
    if (book.length && !book.includes(account.tacticId)) setAccountTactic(account, book[0]);
  }

  function html(summary) {
    const account = getAccount();
    if (!account || summary.guest) return "";
    if ((account.id || null) !== ownerId) { ownerId = account.id || null; reset(); }
    ensureStarterCoach(account, saveAccount);
    const card = resolveCoach(account.coachId);
    if (!card || summary.starters.length < 5) return "";
    const roster = summary.validation.roster;
    const systems = selectableSystems(card, roster);
    const active = systems.some((s) => s.id === account.tacticId) ? account.tacticId : defaultSystem(card, roster);
    const tacticId = systems.some((s) => s.id === previewTactic) ? previewTactic : active;
    const analysis = analyzeTeam({ coach: card, tacticalSystem: tacticId, starters: summary.starters, bench: summary.bench, playerRoles: roles });
    const rec = recommendLineups({ coach: card, tacticalSystem: tacticId, roster, currentIds: summary.starters.map((c) => c.id) }); // overrides never enter the recommendation
    return teamIntelligenceHtml({
      lang: getLang(), coach: { card, profile: coachProfile(card) }, owned: ownedCoaches(account), systems, tacticId, activeTacticId: account.tacticId,
      starters: summary.starters, cards: summary.cards, analysis, rec, notice,
    });
  }

  /** @returns {boolean} true when the click was ours (caller re-renders). */
  function onClick(btn, summary) {
    const account = getAccount();
    const act = btn.dataset.act;
    if (!account || !act?.startsWith("intel-")) return false;
    notice = "";
    if (act === "intel-tactic") { previewTactic = btn.dataset.tactic; roles = {}; }
    else if (act === "intel-coach") { switchCoach(account, btn.dataset.coach); previewTactic = null; roles = {}; notice = L("已更换主教练；球员属性没有改变。", "Coach changed; player attributes are untouched."); }
    else if (act === "intel-set-tactic") {
      if (previewTactic) { setAccountTactic(account, previewTactic); notice = L("已设为当前战术。", "Set as the active tactic."); }
    } else if (act === "intel-reset-roles") { roles = {}; notice = L("已恢复自动分配的职责。", "Back to the automatic roles."); }
    else if (act === "intel-apply") {
      const card = resolveCoach(account.coachId);
      const rec = recommendLineups({ coach: card, tacticalSystem: previewTactic || account.tacticId, roster: summary.validation.roster, currentIds: summary.starters.map((c) => c.id) });
      if (rec?.verdict === "swap" && saveLineup(account.id, { rosterIds: [...summary.draft.rosterIds], starterIds: rec.best.ids }).ok) notice = L("推荐首发已应用并保存。", "Recommended starters applied and saved.");
      else notice = L("应用失败。", "Could not apply.");
    }
    return true;
  }

  function onRoleChange(select) {
    const id = select.dataset.roleFor;
    if (!id) return false;
    roles = { ...roles, [id]: select.value };
    notice = "";
    return true;
  }

  return { html, onClick, onRoleChange };
}
