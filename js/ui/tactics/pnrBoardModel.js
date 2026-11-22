// The pick-and-roll roles panel of the tactics board (tactics-pnr-roles-design.md §3). Pure view model: no DOM, no storage, no dice.
//
// A choice the coach has not made is shown as the recommendation (`recommended`) and is NOT written to the plan: it plays the engine's own
// automatic behaviour, which is where the recommendation comes from. A choice he has made is `changed`.
// No option is flagged as a risk: with every handler really on the pick and roll, slip and ghost measure within noise of "roll" (design doc section 8),
// so the hints say only what the engine does.
import { PNR_AFTER, PNR_FINISH, cleanPnrPlan, recommendPnrPlan, recommendedOffBall } from "../../engine/pnrPlan.js";
import { normalizePos } from "../../data/positions.js";
import { ovr } from "../../myteam/playerRoleFit.js";
import { pnrIsActive } from "./tacticalDraft.js";

const pick = (lang, zh, en) => (lang === "en" ? en : zh);
const posOf = (p) => normalizePos(p?.playPos || p?.pos);
const shortName = (p) => {
  const parts = String(p.name || "").trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
};

const AFTER = {
  roll: { zh: "下顺", en: "Roll", hintZh: "掩护后切向篮下，持球人找他。", hintEn: "Rolls to the rim; the handler looks for him." },
  pop: { zh: "外拆", en: "Pop", hintZh: "掩护后拉到外线接球投篮，适合会投的大个子。", hintEn: "Pops out for the jumper; best with a shooter." },
  slip: { zh: "假掩护", en: "Slip", hintZh: "掩护没做完就切走：没有掩护带来的传球加成，但他接球时更空、出手更多。", hintEn: "Leaves before the screen: no screen pass bonus, but he catches the ball more open and shoots more." },
  ghost: { zh: "幽灵跑位", en: "Ghost", hintZh: "根本不设掩护：挡拆的加成全部没有，他直接溜向空位。目前对全队得分的影响很小。", hintEn: "No screen at all: every pick-and-roll bonus is gone and he drifts to open space. The measured effect on team scoring is small." },
};
const FINISH = {
  mid: { zh: "中投", en: "Pull-up", hintZh: "持球人拉起投中距离。", hintEn: "The handler pulls up for the mid-range shot." },
  drive: { zh: "突破", en: "Drive", hintZh: "持球人突破上篮。", hintEn: "The handler attacks the rim." },
  fake_kick: { zh: "假突真传", en: "Fake & kick", hintZh: "先做突破假动作再分球：更常把球分给队友，不会被推荐。", hintEn: "Fakes the drive, then kicks out: passes more often; never recommended." },
};
const OFF_BALL = { spot: { zh: "定点", en: "Spot up" }, cut: { zh: "空切", en: "Cut" } };

const option = (table, id, lang, { eff, rec, explicit }) => ({
  id, label: pick(lang, table[id].zh, table[id].en), hint: pick(lang, table[id].hintZh, table[id].hintEn),
  selected: id === eff, recommended: id === rec, changed: id === explicit,
});

/** null unless the ball handler's play is the pick and roll (the roles do nothing for any other play). */
export function buildPnrBoardModel({ team, draft, starters, lang = "zh" }) {
  if (!pnrIsActive(draft, team)) return null;
  const handler = (team.players || []).find((p) => p.id === draft.ballHandlerId);
  const men = starters.filter((p) => p.id !== handler.id);
  const rec = recommendPnrPlan(starters, handler);
  const ex = cleanPnrPlan(draft.pnr) || { screenerId: null, afterScreen: null, offBall: {}, finish: null };
  const screenerId = men.some((p) => p.id === ex.screenerId) ? ex.screenerId : rec.screenerId;
  const afterScreen = ex.afterScreen || rec.afterScreen;
  const chip = (p) => ({ id: p.id, name: p.name, short: shortName(p), pos: posOf(p), ovr: ovr(p) });
  // A ghosting screener is just another man off the ball, so he gets an off-ball choice too.
  const offMen = men.filter((p) => p.id !== screenerId || afterScreen === "ghost");
  return {
    handlerName: handler.name,
    screener: men.map((p) => ({ ...chip(p), selected: p.id === screenerId, recommended: p.id === rec.screenerId, changed: p.id === ex.screenerId })),
    afterScreen: PNR_AFTER.map((id) => option(AFTER, id, lang, { eff: afterScreen, rec: rec.afterScreen, explicit: ex.afterScreen })),
    offBall: offMen.map((p) => {
      const recommended = rec.offBall[p.id] || recommendedOffBall(p);
      const value = ex.offBall[p.id] || recommended;
      return { ...chip(p), changed: !!ex.offBall[p.id], choices: Object.keys(OFF_BALL).map((id) => ({ id, label: pick(lang, OFF_BALL[id].zh, OFF_BALL[id].en), selected: id === value, recommended: id === recommended })) };
    }),
    finish: PNR_FINISH.map((id) => option(FINISH, id, lang, { eff: ex.finish || rec.finish, rec: rec.finish, explicit: ex.finish })),
    anyChanged: !!draft.pnr,
  };
}
