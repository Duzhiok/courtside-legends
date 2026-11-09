/**
 * The draft prophecy on screen (D of docs/CAREER_LIFE_ROADMAP.md): the three-name board you pick
 * from right after "share a draft sleeper", and the HQ card that follows the bet until his third
 * season settles it. Numbers come from career/draftProphecy.js and balance.js, never restated here.
 */
import { PROPHECY_HIT, PROPHECY_HIT_OVR, PROPHECY_MISS } from "../../career/balance.js";
import { photoImg } from "../../data/photo.js";
import { esc, tr } from "./format.js";
import { choiceDeckHtml, confirmBarHtml, mountDeck } from "./choices.js";

const signed = (n) => (n > 0 ? `+${n}` : `${n}`);
const portrait = (p, season) => photoImg({ bref: p.bref, name: p.name, season, team: p.team }, "headshot sm");

function lineText(line, lang) {
  if (line?.ppg == null) return tr(lang, "新秀年数据：无记录", "Rookie line: no record");
  return tr(lang, `新秀年场均 ${line.ppg} 分 ${line.rpg ?? "—"} 板 ${line.apg ?? "—"} 助`, `Rookie year: ${line.ppg} pts ${line.rpg ?? "—"} reb ${line.apg ?? "—"} ast`);
}

/** The rules in one place: what you are betting on and what it pays. */
export function prophecyRulesText(lang) {
  return tr(
    lang,
    `他们都是接下来三届真实的新秀。你只记得个大概：区间是你记忆中他前三个赛季的巅峰能力（OVR），记忆可能偏几分。他的第三个赛季结束后，按真实生涯对账：前三季巅峰 ≥ ${PROPHECY_HIT_OVR} 算预言成真（信任 ${signed(PROPHECY_HIT.trust)}、声望 ${signed(PROPHECY_HIT.reputation)}），否则落空（信任 ${signed(PROPHECY_MISS.trust)}）。`,
    `All three are real rookies from the next three drafts. You only half-remember: the band is where you recall his best OVR over his first three seasons, and memory can be a few points off. After his third season his real career settles it: a peak of ${PROPHECY_HIT_OVR}+ makes you a prophet (trust ${signed(PROPHECY_HIT.trust)}, reputation ${signed(PROPHECY_HIT.reputation)}); anything less is a miss (trust ${signed(PROPHECY_MISS.trust)}).`,
  );
}

/** @param {{ lang, scope: Element, onPledge(bref), onBack() }} deps — scope holds .tt-deck + .tt-confirm-slot */
export function createProphecyPicker({ lang, scope, onPledge, onBack }) {
  function open(board) {
    const l = lang();
    scope.hidden = false;
    scope.querySelector(".tt-prophecy-kicker").textContent = tr(l, "说出一个名字", "Name your sleeper");
    scope.querySelector(".tt-prophecy-rules").textContent = prophecyRulesText(l);
    scope.querySelector(".tt-prophecy-back").textContent = tr(l, "换个决定", "Choose something else");
    const deck = scope.querySelector(".tt-deck");
    deck.innerHTML = choiceDeckHtml(board.map((p) => ({ id: p.bref, label: p.name, description: "" })), { attr: "data-bref", lang: l });
    // Dress each plain choice card with the prospect: photo, class, rookie line, the remembered band.
    board.forEach((p) => {
      const body = deck.querySelector(`[data-bref="${CSS.escape(p.bref)}"] .tt-choice-body`);
      body.querySelector(".tt-choice-desc").outerHTML = `<span class="tt-prospect">
        ${portrait(p, p.rookieSeason)}
        <span class="tt-prospect-meta">
          <span>${esc(p.pos)} · ${esc(tr(l, `${p.rookieSeason} 赛季新秀`, `${p.rookieSeason} rookie`))} · ${esc(p.team)}</span>
          <span class="tt-faint">${esc(lineText(p.line, l))}</span>
        </span>
      </span>
      <span class="tt-memory">${esc(tr(l, "记忆中的前三季巅峰", "Remembered 3-year peak"))} <b>${p.low}–${p.high}</b></span>`;
    });
    scope.querySelector(".tt-confirm-slot").innerHTML = confirmBarHtml(l, { confirmLabel: tr(l, "押他", "Back him") });
    scope.querySelector(".tt-prophecy-back").onclick = () => { close(); onBack(); };
    mountDeck(scope, {
      idOf: (el) => el.dataset.bref,
      labelOf: (el) => el.querySelector("strong").textContent,
      confirmText: (name) => tr(l, `向管理层押上 ${name}？说出口就收不回来了。`, `Stake your word on ${name}? You can't take it back.`),
      onConfirm: onPledge,
    });
    scope.scrollIntoView?.({ block: "start", behavior: "smooth" });
  }

  function close() {
    scope.hidden = true;
    scope.querySelector(".tt-deck").innerHTML = "";
    scope.querySelector(".tt-confirm-slot").innerHTML = "";
  }

  return { open, close, isOpen: () => !scope.hidden };
}

/** The HQ card: who you backed and how it turned out. Hidden when there is no prophecy. */
export function renderProphecyCard(card, story, lang) {
  const p = story?.prophecy;
  card.hidden = !p;
  if (!p) return;
  const verdict = {
    pending: [tr(lang, `待验证 · ${p.judgeYear} 赛季结束后揭晓`, `Pending · settled after the ${p.judgeYear} season`), "pending"],
    hit: [tr(lang, `预言成真：前三季巅峰 OVR ${p.best}（信任 ${signed(PROPHECY_HIT.trust)}、声望 ${signed(PROPHECY_HIT.reputation)}）`, `Called it: 3-year peak OVR ${p.best} (trust ${signed(PROPHECY_HIT.trust)}, reputation ${signed(PROPHECY_HIT.reputation)})`), "hit"],
    miss: [tr(lang, `预言落空：前三季巅峰只有 OVR ${p.best}（信任 ${signed(PROPHECY_MISS.trust)}）`, `Missed: his 3-year peak was only OVR ${p.best} (trust ${signed(PROPHECY_MISS.trust)})`), "miss"],
  }[p.status];
  card.dataset.status = verdict[1];
  card.innerHTML = `<div class="tt-card-head"><span class="tt-kicker">${esc(tr(lang, "选秀预言", "Draft prophecy"))}</span></div>
    <div class="tt-prospect">
      ${portrait(p, p.rookieSeason)}
      <span class="tt-prospect-meta">
        <strong>${esc(p.name)}</strong>
        <span class="tt-faint">${esc(tr(lang, `${p.rookieSeason} 赛季新秀 · 你记得他前三季巅峰在 ${p.low}–${p.high}`, `${p.rookieSeason} rookie · you remembered a 3-year peak of ${p.low}–${p.high}`))}</span>
      </span>
    </div>
    <p class="tt-prophecy-verdict">${esc(verdict[0])}</p>`;
}
