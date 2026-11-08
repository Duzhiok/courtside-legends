/**
 * My Team lineup editor controller (ADR-010 T1). Owns only the in-memory draft.
 * Opening / re-rendering / editing / auto-picking NEVER writes the account: the single write path is the
 * explicit Save (or Clear) button, delegated to the injected store functions.
 */
import { MY_TEAM_RULES, autoLineup, ownedCards, resolveSavedLineup, toggleRoster, toggleStarter, validateMyTeamLineup } from "../myteam/lineup.js";
import { issueText, myTeamLineupHtml } from "./myTeamLineupView.js";

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export function createMyTeamLineup({
  el,
  getLang,
  getAccount,
  saveLineup, // (accountId, draft) => { ok }   explicit save only
  clearLineup, // (accountId) => { ok }          explicit reset only
  onOpenAccounts = () => {},
}) {
  if (!el) return { open() {}, refresh() {} };
  let base = null; // what was loaded (saved or auto); `dirty` = draft differs from it
  let draft = null;
  let source = "auto";
  let notice = "";
  let ownerId = null;

  function load() {
    const account = getAccount();
    ownerId = account?.id || null;
    const resolved = resolveSavedLineup(account);
    draft = resolved.draft;
    base = structuredClone(resolved.draft);
    source = resolved.source;
    notice = "";
  }

  function render() {
    const account = getAccount();
    // Account switched under an open editor: never carry one account's draft into another.
    if ((account?.id || null) !== ownerId) load();
    const lang = getLang();
    el.innerHTML = myTeamLineupHtml({
      lang,
      account,
      cards: ownedCards(account),
      draft,
      validation: validateMyTeamLineup(account, draft),
      source,
      dirty: !same(draft, base),
      hasSaved: !!account?.myTeamLineup,
      notice,
    });
  }

  function apply(result) {
    if (result.blocked) notice = issueText({ code: result.blocked }, getLang());
    else { draft = result.draft; notice = ""; }
    render();
  }

  el.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-act]");
    if (!btn || btn.disabled) return;
    const account = getAccount();
    const cardId = btn.closest("[data-card]")?.dataset.card;
    const lang = getLang();
    switch (btn.dataset.act) {
      case "roster": return apply(toggleRoster(account, draft, cardId, MY_TEAM_RULES));
      case "starter": return apply(toggleStarter(draft, cardId, MY_TEAM_RULES));
      case "auto":
        draft = autoLineup(account);
        notice = lang === "en" ? "Auto lineup filled in. Save to keep it." : "已填入自动推荐，点保存才会生效。";
        return render();
      case "save": {
        const res = account ? saveLineup(account.id, draft) : { ok: false };
        if (res.ok) { base = structuredClone(draft); source = "saved"; notice = lang === "en" ? "Lineup saved." : "阵容已保存。"; }
        else notice = lang === "en" ? "Could not save the lineup." : "保存失败。";
        return render();
      }
      case "reset": {
        const res = account ? clearLineup(account.id) : { ok: false };
        if (res.ok) { load(); notice = lang === "en" ? "Saved lineup cleared; showing the automatic one." : "已清除保存的阵容，显示自动推荐。"; }
        return render();
      }
      case "accounts": return onOpenAccounts();
      default:
    }
  });

  return {
    /** Entering the screen: load a fresh draft from the account (read-only). */
    open() { load(); render(); },
    /** Language flip / account change: re-render, keeping the draft unless the account changed. */
    refresh() { if (draft) render(); },
  };
}
