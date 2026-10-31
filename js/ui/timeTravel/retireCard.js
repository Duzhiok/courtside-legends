/**
 * B7: the "hang up the whistle?" card. A quiet, always-available exit rather than a decision that
 * interrupts you: it only appears when retiring is actually allowed (between jobs, or in a job
 * before the first game with a clear desk), and retiring is irreversible, so it asks first.
 */
import { retireCoach, retirementBlocker, previewLegacy } from "../../modes/retirement.js";
import { confirmAction } from "../confirmModal.js";
import { $ } from "./dom.js";
import { tr } from "./format.js";
import { legacyTierLabel, retirePreviewHtml } from "./legacy.js";

export function createRetireCard({ lang, setStatus, commit, currentRootState, renderScreen }) {
  function render(root) {
    const card = $("#tt-retire");
    const open = retirementBlocker(root) === null;
    card.hidden = !open;
    if (!open) return;
    const l = lang();
    const legacy = previewLegacy(root);
    $("#tt-retire-note").textContent = tr(
      l,
      "不想再回到场边了？随时可以挂靴。这是最终决定：生涯会按全部执教经历封存，不能反悔。",
      "Done with the sideline? You can hang up the whistle any time. It's final: your career is sealed as it stands, with no coming back.",
    );
    $("#tt-retire-preview").innerHTML = retirePreviewHtml(legacy, l);
  }

  async function retire() {
    const l = lang();
    const legacy = previewLegacy(currentRootState());
    if (!(await confirmAction(
      tr(
        l,
        `挂靴退休后生涯就此封存，评级为「${legacyTierLabel(legacy.tier, l)}」（评分 ${legacy.score}），不能撤销。确定吗？`,
        `Retiring seals your career as "${legacyTierLabel(legacy.tier, l)}" (score ${legacy.score}). It can't be undone. Sure?`,
      ),
      { title: tr(l, "挂靴退休？", "Hang up the whistle?"), acceptLabel: tr(l, "确认退休", "Retire") },
    ))) return;
    try {
      const root = retireCoach(currentRootState(), "voluntary");
      commit(root, tr(l, "存档写入失败，尚未退休", "Save failed — you haven't retired yet"), { full: false });
      setStatus(tr(l, "你挂靴了。这一生的执教，都记在下面了。", "You hung up the whistle. A whole career, written up below."));
      renderScreen();
      window.scrollTo?.({ top: 0, behavior: "smooth" });
    } catch (error) {
      setStatus(error?.message || tr(l, "现在还不能退休", "You can't retire right now"), true);
      renderScreen();
    }
  }

  function wire() {
    $("#btn-retire")?.addEventListener("click", retire);
  }

  return { render, wire };
}
