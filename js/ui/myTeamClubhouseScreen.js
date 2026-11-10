/**
 * My Team Clubhouse controller (integration sprint, workstream D): renders the clubhouse view
 * into one root element and wires its buttons. Owns no game state beyond the open swap picker:
 * everything shown is read fresh from the account / the live season on render, and every
 * action is delegated to the app's existing flows (lineup editor, season start/resume,
 * collection, accounts). A bench swap is an explicit save through the same saveLineup
 * path the lineup editor uses — it never writes silently.
 */
import { toggleStarter } from "../myteam/lineup.js";
import { MY_TEAM_RULES } from "../myteam/lineup.js";
import { clubhouseHtml, clubhouseSummary } from "./myTeamClubhouseView.js";
import { seasonReport } from "../myteam/seasonReport.js";

export function createMyTeamClubhouse({
  el,
  getLang,
  getAccount,
  saveLineup, // (accountId, draft) => { ok }   the swap's only write path
  getResume = () => null, // () => label | null : this player's My Team season in progress
  getSeason = () => null, // () => the live My Team season save (or null)
  onStartSeason = async () => {}, // (variant) => void
  onResumeSeason = () => {},
  onOpenLineup = () => {},
  onOpenCollection = () => {},
  onOpenAccounts = () => {},
}) {
  if (!el) return { open() {}, refresh() {} };
  let swapFor = null;
  let notice = "";
  let ownerId = null;

  function summary() {
    const account = getAccount();
    const season = getSeason();
    let report = null;
    try { report = season ? seasonReport(season) : null; } catch { report = null; }
    return clubhouseSummary(account, { season, report });
  }

  function render() {
    const account = getAccount();
    if ((account?.id || null) !== ownerId) { swapFor = null; notice = ""; }
    ownerId = account?.id || null;
    el.innerHTML = clubhouseHtml({ summary: summary(), resume: getResume(), swapFor, notice, lang: getLang() });
  }

  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const lang = getLang();
    const account = getAccount();
    switch (btn.dataset.act) {
      case "accounts": return onOpenAccounts();
      case "open-collection": return onOpenCollection();
      case "edit-lineup": return onOpenLineup();
      case "start-quick": return onStartSeason("quick");
      case "start-full": return onStartSeason("full");
      case "resume-season": return onResumeSeason();
      case "swap": {
        swapFor = btn.dataset.card || null;
        notice = "";
        return render();
      }
      case "cancel-swap": {
        swapFor = null;
        notice = "";
        return render();
      }
      case "pick-bench": {
        const benchId = btn.dataset.card;
        const outId = btn.dataset.out;
        if (!account || !benchId || !outId) return;
        const s = summary();
        const draft = { rosterIds: [...s.draft.rosterIds], starterIds: [...s.draft.starterIds] };
        // Bench card must actually be on the roster; the outgoing starter must be starting.
        if (!draft.rosterIds.includes(benchId) || !draft.starterIds.includes(outId)) return;
        const stepped = toggleStarter(draft, outId, MY_TEAM_RULES); // remove the outgoing starter
        if (stepped.blocked) return;
        const swapped = toggleStarter(stepped.draft, benchId, MY_TEAM_RULES); // bring the bench player in
        if (swapped.blocked) { notice = lang === "en" ? "Couldn't swap — the lineup is full." : "换人失败，首发已满。"; return render(); }
        const res = saveLineup(account.id, swapped.draft);
        if (res.ok) {
          const name = (s.cards.find((c) => c.id === benchId)?.name) || benchId;
          swapFor = null;
          notice = lang === "en" ? `Swapped in ${name}. Lineup saved.` : `已换上 ${name}，阵容已保存。`;
        } else {
          notice = lang === "en" ? "Couldn't save the lineup." : "保存阵容失败。";
        }
        return render();
      }
      default:
    }
  });

  return {
    /** Entering the screen: read fresh data from the account (read-only). */
    open() { swapFor = null; notice = ""; render(); },
    /** Language flip / account change: re-render, dropping the open picker on account switch. */
    refresh() { render(); },
  };
}
