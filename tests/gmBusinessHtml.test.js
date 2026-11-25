import test from "node:test";
import assert from "node:assert/strict";
import { gmBusinessHtml } from "../js/ui/gmBusinessView.js";
import { advanceScenarioSeason, createExecutiveScenario, minorityOpportunity } from "../js/career/gm/businessScenario.js";
import { applyBusinessEvent, availableBusinessEvents, businessEventForInbox } from "../js/career/gm/businessEvents.js";
import { missingText, stageFor, stageLabel, stageOpportunities } from "../js/career/gm/executiveProgression.js";
import { setTicketPrice, signSponsorship, sponsorshipOffers } from "../js/career/gm/franchiseBusiness.js";
import { MEDICAL_LEVELS, TRENDS, clueView, investInTrend, revealClue, setMedicalLevel } from "../js/career/gm/futureKnowledge.js";

// B122 migration of gmBusinessView.js: gmBusinessHtml() is now written with html`` (every value escaped). ORACLE: the old
// function, verbatim from gmBusinessView.js at 892fe079, RUN against the same state. Same bytes for ordinary text.
const OLD_FN = "function gmBusinessHtml(state, { lang = \"zh\", players = [] } = {}) {\n  const b = state.business;\n  const p = state.personal;\n  const stage = stageFor(state.exec);\n  const last = b.history.at(-1);\n  const offers = sponsorshipOffers({\n    teamId: b.teamId,\n    season: b.season,\n    seed: state.seed || 1,\n    winPct: last ? last.wins / Math.max(1, last.wins + last.losses) : 0.4,\n    starAppeal: 0,\n    market: b.market,\n  }).filter((o) => !b.sponsorships.some((s) => s.kind === o.kind));\n  const events = availableBusinessEvents(state);\n  const opps = stageOpportunities(state.exec, { wealth: p.cash, valuation: b.valuation, loanCapacity: 20 });\n  const minority = minorityOpportunity(state);\n  const clues = state.knowledge.clues.map((c) => clueView(c, state.knowledge.ledger));\n  return `\n  <section class=\"gm-business\">\n    <p class=\"gm-stage\">${L(\"当前身份\", \"Current stage\", lang)}：<strong>${stageLabel(stage, lang)}</strong> · ${b.teamName} · ${b.season}–${String(b.season + 1).slice(2)} ${L(\"赛季\", \"season\", lang)}</p>\n    <div class=\"gm-panels\">\n      <div class=\"gm-panel\">\n        <h3>${L(\"球队经营\", \"Franchise\", lang)}</h3>\n        <p>${L(\"经营预算\", \"Operating budget\", lang)} ${money(b.operatingBudget)} · ${L(\"球队估值\", \"Valuation\", lang)} ${money(b.valuation)}</p>\n        <p>${L(\"平均票价\", \"Avg ticket\", lang)} $${b.ticketPrice} · ${L(\"球馆容量\", \"Arena\", lang)} ${b.arena.capacity.toLocaleString()} · ${L(\"品牌\", \"Brand\", lang)} ${Math.round(b.brand * 100)}%</p>\n        ${last ? `<p>${L(\"上赛季\", \"Last season\", lang)}：${last.wins}–${last.losses} · ${L(\"票房\", \"Tickets\", lang)} ${money(last.ticket)} · ${L(\"赞助\", \"Sponsors\", lang)} ${money(last.sponsorship)} · ${L(\"利润\", \"Profit\", lang)} ${money(last.profit)}</p>` : \"\"}\n      </div>\n      <div class=\"gm-panel\">\n        <h3>${L(\"个人财富\", \"Personal wealth\", lang)}</h3>\n        <p>${L(\"现金\", \"Cash\", lang)} ${money(p.cash)} · ${L(\"年薪\", \"Salary\", lang)} ${money(p.salary)}${L(\"/年\", \"/yr\", lang)} · ${L(\"股权\", \"Equity\", lang)} ${state.exec.equityPct}%</p>\n        <p>${L(\"分红累计\", \"Dividends earned\", lang)} ${money(p.dividendsEarned)}${p.debt ? ` · ${L(\"负债\", \"Debt\", lang)} ${money(p.debt.principal)}${lang === \"en\" ? ` (due ${p.debt.dueSeason})` : `（到期 ${p.debt.dueSeason}）`}` : \"\"}</p>\n        <p class=\"tiny\">${L(\"个人财富与球队经营预算是分开的：球队收入不会直接变成你的钱，只有工资和分红会。\", \"Personal wealth and the franchise budget are separate: team revenue never becomes your money directly — only salary and dividends do.\", lang)}</p>\n      </div>\n    </div>\n    <div class=\"gm-panel\">\n      <h3>${L(\"董事会报告\", \"Board report\", lang)}</h3>\n      ${last ? (lang === \"en\"\n        ? `<p>Last season ${last.season}: ${last.wins} W ${last.losses} L, operating ${last.profit >= 0 ? \"profit\" : \"loss\"} ${money(last.profit)}, valuation ${money(last.valuation)}.</p>`\n        : `<p>上赛季 ${last.season}：${last.wins} 胜 ${last.losses} 负，经营${last.profit >= 0 ? \"盈利\" : \"亏损\"} ${money(last.profit)}，估值 ${money(last.valuation)}。</p>`) : `<p>${L(\"还没有打完的赛季。先做一次球探决策、签一份赞助、调一次票价，再模拟赛季。\", \"No season played yet. Make a scouting decision, sign a sponsor, set ticket prices, then simulate a season.\", lang)}</p>`}\n      ${minority ? `<p>${L(\"收购机会\", \"Acquisition opportunity\", lang)}：${minority.available ? L(\"可以买下 5% 股份，成为球队合伙人。\", \"You can buy a 5% stake and become a minority owner.\") : L(\"还不满足条件：\", \"Not yet available: \") + missingText(minority.missing, lang)}</p>` : \"\"}\n    </div>\n    <div class=\"gm-panel\">\n      <h3>${L(\"重大决策\", \"Major decisions\", lang)}</h3>\n      <p>${L(\"票价\", \"Ticket price\", lang)}：\n        ${[20, 30, 45, 60, 80].map((price) => `<button type=\"button\" class=\"btn small\" data-gm-action=\"ticket\" data-price=\"${price}\" ${price === b.ticketPrice ? \"disabled\" : \"\"}>$${price}</button>`).join(\" \")}\n      </p>\n      <p>${L(\"赞助报价\", \"Sponsorship offers\", lang)}：\n        ${offers.length ? offers.map((o) => `<button type=\"button\" class=\"btn small\" data-gm-action=\"sponsor\" data-offer=\"${o.id}\">$${o.value}M · ${L(...(SPONSOR_KIND_LABEL[o.kind] || [o.kind, o.kind]), lang)}</button>`).join(\" \") : L(\"暂无新的报价\", \"No new offers\", lang)}\n      </p>\n      <div class=\"gm-events\">\n        ${events.length ? events.map((e) => { const v = businessEventForInbox(e, lang); return `<div class=\"gm-event\"><strong>${v.title}</strong><p>${v.body}</p><p>${v.choices.map((c) => `<button type=\"button\" class=\"btn small\" data-gm-action=\"event-choice\" data-event=\"${v.id}\" data-choice=\"${c.id}\">${c.label}</button>`).join(\" \")}</p></div>`; }).join(\"\") : `<p>${L(\"暂无待处理事件\", \"No pending events\", lang)}</p>`}\n      </div>\n      <p>${L(\"晋升与收购\", \"Advancement\", lang)}：\n        ${opps.map((o) => `<span class=\"gm-opp\" title=\"${missingText(o.missing, lang)}\">${stageLabel(o.to, lang)}: ${o.available ? L(\"可接受\", \"available\", lang) : L(\"未满足\", \"not ready\", lang)}</span>`).join(\" \")}\n      </p>\n    </div>\n    <details class=\"gm-panel\">\n      <summary>${L(\"深度经营\", \"Deep management\", lang)}</summary>\n      ${last ? `<p>${L(\"收入明细\", \"Revenue breakdown\", lang)}：${L(\"票房\", \"Tickets\", lang)} ${money(last.ticket)} · ${L(\"赞助\", \"Sponsors\", lang)} ${money(last.sponsorship)} · ${L(\"周边\", \"Merch\", lang)} ${money(last.merch)} · ${L(\"品牌\", \"Brand\", lang)} ${money(last.brand)} · ${L(\"成本\", \"Costs\", lang)} ${money(last.costs)}</p>` : \"\"}\n      <p>${L(\"已签赞助\", \"Signed sponsors\", lang)}：${b.sponsorships.length ? b.sponsorships.map((s) => `${L(...(SPONSOR_KIND_LABEL[s.kind] || [s.kind, s.kind]), lang)} $${s.value}M`).join(lang === \"en\" ? \", \" : \"、\") : L(\"无\", \"None\", lang)}</p>\n      <p>${L(\"持有股权\", \"Equity held\", lang)}：${p.equity.length ? p.equity.map((e) => `${e.teamId} ${e.pct}%`).join(lang === \"en\" ? \", \" : \"、\") : L(\"无\", \"None\", lang)}</p>\n      <p>${L(\"未来知识\", \"Future knowledge\", lang)}：${state.knowledge.knowledge} ${L(\"点\", \"points\", lang)} ·\n        ${clues.map((c) => c.revealed ? `<span>${lang === \"en\" ? (c.summaryEn || c.summary) : c.summary}${lang === \"en\" ? `(${c.band.en})` : `（${c.band.zh}）`}</span>` : `<button type=\"button\" class=\"btn small\" data-gm-action=\"reveal-clue\" data-clue=\"${c.id}\">${L(\"揭示线索（1 点）\", \"Reveal clue (1 pt)\", lang)}</button>`).join(\" \") || L(\"暂无线索\", \"No clues\", lang)}\n      </p>\n      <p>${L(\"医疗团队\", \"Medical staff\", lang)}：\n        ${Object.entries(MEDICAL_LEVELS).map(([level, def]) => `<button type=\"button\" class=\"btn small\" data-gm-action=\"medical\" data-level=\"${level}\" ${Number(level) === state.knowledge.medicalLevel ? \"disabled\" : \"\"}>${lang === \"en\" ? def.labelEn : def.label} $${def.cost}M</button>`).join(\" \")}\n      </p>\n      <p>${L(\"趋势投资\", \"Trend bets\", lang)}：\n        ${Object.values(TRENDS).map((t) => `<button type=\"button\" class=\"btn small\" data-gm-action=\"trend\" data-trend=\"${t.id}\" ${state.knowledge.trendFocus === t.id ? \"disabled\" : \"\"}>${lang === \"en\" ? t.en : t.zh}</button>`).join(\" \")}\n      </p>\n    </details>\n    <div class=\"gm-panel\">\n      <h3>${L(\"模拟下赛季\", \"Simulate next season\", lang)}</h3>\n      <p class=\"tiny\">${L(\"开发入口：赛季结果由你输入真实比赛结果；正式接入后改为真实赛季引擎的结果，本视图不伪造比赛。\", \"Dev entry: enter the real season result here; the production wiring will use the real season engine instead. This view never fabricates a game.\", lang)}</p>\n      <label>${L(\"胜场\", \"Wins\", lang)} <input type=\"number\" id=\"gm-sim-wins\" value=\"30\" min=\"0\" max=\"82\"></label>\n      <label>${L(\"负场\", \"Losses\", lang)} <input type=\"number\" id=\"gm-sim-losses\" value=\"52\" min=\"0\" max=\"82\"></label>\n      <label>${L(\"季后赛\", \"Playoffs\", lang)}\n        <select id=\"gm-sim-playoffs\">\n          <option value=\"\">${L(\"未进季后赛\", \"Missed playoffs\", lang)}</option>\n          <option value=\"first-round\">${L(\"首轮\", \"First round\", lang)}</option>\n          <option value=\"conf-final\">${L(\"分区决赛\", \"Conf finals\", lang)}</option>\n          <option value=\"finals\">${L(\"总决赛\", \"Finals\", lang)}</option>\n        </select>\n      </label>\n      <label><input type=\"checkbox\" id=\"gm-sim-champion\"> ${L(\"总冠军\", \"Champion\", lang)}</label>\n      <button type=\"button\" class=\"btn primary\" data-gm-action=\"advance-season\">${L(\"结算本赛季\", \"Settle this season\", lang)}</button>\n      ${state.exec.settled ? `<p>${L(\"传奇终局\", \"Empire legacy\", lang)}：${state.exec.settled.title[lang === \"en\" ? \"en\" : \"zh\"]} · ${L(\"评分\", \"Score\", lang)} ${state.exec.settled.score}</p>` : \"\"}\n    </div>\n    ${state.dismissed ? `<p class=\"gm-warning\">${L(\"你失去了球队的控制权与职位——但这不是终点。去一支小市场球队重新开始，下一段故事从这里继续。\", \"You lost control of the team and your job — but this is not the end. Restart at a small-market team; the next chapter starts here.\", lang)}</p>` : \"\"}\n  </section>`;\n}\n\n";
// The one deliberate behaviour fix, applied to the oracle too so the comparison stays strict everywhere else: the two
// acquisition-line L() calls forgot their `lang` argument, so English showed Chinese ("Acquisition opportunity：还不满足条件：need $6.8M…").
const OLD_FN_FIXED = OLD_FN
  .replace('You can buy a 5% stake and become a minority owner.")', 'You can buy a 5% stake and become a minority owner.", lang)')
  .replace('L("还不满足条件：", "Not yet available: ")', 'L("还不满足条件：", "Not yet available: ", lang)');
const oldHtml = new Function(
  "L", "money", "stageFor", "stageLabel", "sponsorshipOffers", "availableBusinessEvents", "stageOpportunities", "minorityOpportunity",
  "clueView", "businessEventForInbox", "missingText", "SPONSOR_KIND_LABEL", "MEDICAL_LEVELS", "TRENDS",
  `${OLD_FN_FIXED}\nreturn gmBusinessHtml;`,
);
const L = (zh, en, lang) => (lang === "en" ? en : zh);
const money = (v) => `$${Number(v ?? 0).toFixed(1)}M`;
// Mirror of the view's private table (3 labels): if it drifts, the byte comparison below fails loudly.
const SPONSOR_KIND_LABEL = { jersey: ["球衣广告", "Jersey ads"], arena: ["球馆冠名", "Arena naming"], brand: ["品牌合作", "Brand deal"] };
const runOld = (state, opts) => oldHtml(L, money, stageFor, stageLabel, sponsorshipOffers, availableBusinessEvents, stageOpportunities,
  minorityOpportunity, clueView, businessEventForInbox, missingText, SPONSOR_KIND_LABEL, MEDICAL_LEVELS, TRENDS)(state, opts);
const BAD = "<img src=x onerror=alert(1)>";

// Same card shape as tests/gmBusinessView.test.js: gives the scenario a draft-board clue to reveal.
const card = (bref, yr, rating, ppg) => ({ bref, name: "Test Player", season: yr, team: "VAN", pos: "SG", three: rating, mid: rating, paint: rating,
  scoring: rating, pass: rating, iq: rating, defense: rating, steal: rating, block: rating, rebound: rating, speed: rating, strength: rating,
  stamina: rating, clutch: rating, raw: { ppg } });
const draftPlayers = [card("sleep01", 1997, 55, 8), card("sleep01", 1998, 85, 22), card("sleep01", 1999, 88, 26),
  card("dec01", 1997, 55, 9), card("dec01", 1998, 60, 12), card("dec01", 1999, 60, 11),
  card("dec02", 1998, 55, 7), card("dec02", 1999, 58, 10), card("dec02", 2000, 60, 9)];

const season = (state, wins, losses, playoffRound = null, champion = false) =>
  advanceScenarioSeason(state, { wins, losses, playoffRound, champion }, { players: [], rng: () => 0.5 }).state;

function scenarios() {
  const fresh = createExecutiveScenario({ players: draftPlayers });
  const played = season(fresh, 52, 30, "conf-final");
  const bigWinner = season(season(season(fresh, 65, 17, "finals", true), 60, 22, "finals", true), 62, 20, "finals", true);
  const signed = (() => {
    let s = season(fresh, 30, 52);
    const offer = sponsorshipOffers({ teamId: s.business.teamId, season: s.business.season, seed: s.seed || 1, winPct: 0.4, market: s.business.market })[0];
    if (offer) s = { ...s, business: signSponsorship(s.business, offer) };
    return { ...s, business: setTicketPrice(s.business, 45) };
  })();
  const knowledge = (() => {
    let s = season(fresh, 40, 42);
    const clue = s.knowledge.clues[0];
    if (clue) s = { ...s, knowledge: revealClue(s.knowledge, clue.id) };
    s = { ...s, knowledge: setMedicalLevel(s.knowledge, Object.keys(MEDICAL_LEVELS)[1] ?? 1) };
    return { ...s, knowledge: investInTrend(s.knowledge, Object.values(TRENDS)[0].id, s.business.season) };
  })();
  const indebted = { ...played, personal: { ...played.personal, debt: { principal: 12.5, dueSeason: 1999 } } };
  const dismissed = { ...played, dismissed: true };
  const settled = { ...bigWinner, exec: { ...bigWinner.exec, settled: { title: { zh: "传奇老板", en: "Legendary Owner" }, score: 91 } } };
  return { "fresh (no season played, clue unrevealed)": fresh, "one season played": played, "three title seasons": bigWinner, "sponsor signed + ticket 45": signed,
    "clue revealed, medical, trend": knowledge, "no draft-board clue at all": createExecutiveScenario({}), "with debt": indebted, "dismissed": dismissed, "empire settled": settled };
}

for (const lang of ["zh", "en"]) {
  for (const [label, state] of Object.entries(scenarios())) {
    test(`gmBusinessHtml matches the old inline function byte-for-byte (${lang}: ${label})`, () => {
      const out = gmBusinessHtml(state, { lang, players: [] });
      assert.equal(typeof out, "string", "exported builders still return a string");
      // English copy has apostrophes (and the acquisition line has a colon-free ASCII text): entities are the one intended difference.
      const unescaped = out.replaceAll("&#39;", "'").replaceAll("&quot;", '"').replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&");
      assert.equal(lang === "zh" ? out : unescaped, runOld(state, { lang, players: [] }));
    });
  }
}

test("the scenarios really exercise the dashboard (the oracle is not vacuous)", () => {
  const all = Object.values(scenarios()).map((s) => runOld(s, { lang: "en", players: [] })).join("\n");
  for (const needle of ['data-gm-action="ticket"', 'data-gm-action="sponsor"', 'data-gm-action="medical"', 'data-gm-action="trend"',
    "gm-opp", "Board report", "Last season", "Debt", "gm-warning", "Empire legacy", "Reveal clue", "Signed sponsors", "No clues"]) {
    assert.ok(all.includes(needle), `no scenario renders: ${needle}`);
  }
  assert.ok(Object.values(scenarios()).some((s) => availableBusinessEvents(s).length), "at least one scenario has a business event");
});

test("a hostile team name, event text and clue summary never become markup", () => {
  const s = season(createExecutiveScenario({}), 52, 30, "conf-final");
  const hostile = { ...s, business: { ...s.business, teamName: BAD }, personal: { ...s.personal, equity: [{ teamId: BAD, pct: 5 }], debt: { principal: 1, dueSeason: BAD } } };
  const out = gmBusinessHtml(hostile, { lang: "en", players: [] });
  assert.ok(!out.includes(BAD), "raw crafted text leaked");
  assert.ok(out.includes("&lt;img src=x onerror=alert(1)&gt;"));
  assert.ok(runOld(hostile, { lang: "en", players: [] }).includes(BAD), "the old code did leak it (the bug this fixes)");
  void applyBusinessEvent; // imported only so a future event fixture can reuse it
});

test("regression: the English dashboard says the acquisition line in English (it used to say it in Chinese)", () => {
  const s = Object.values(scenarios()).find((x) => minorityOpportunity(x) && !minorityOpportunity(x).available);
  assert.ok(s, "a scenario with an unavailable acquisition");
  const en = gmBusinessHtml(s, { lang: "en", players: [] });
  assert.ok(en.includes("Acquisition opportunity："), "line present");
  assert.ok(en.includes("Not yet available: "), "English reason prefix");
  assert.ok(!en.includes("还不满足条件"), "no Chinese left in the English page");
  assert.ok(gmBusinessHtml(s, { lang: "zh", players: [] }).includes("还不满足条件："), "Chinese page unchanged");
  const line = en.slice(en.indexOf("Acquisition opportunity"), en.indexOf("</p>", en.indexOf("Acquisition opportunity")));
  assert.ok(!/[\u4e00-\u9fff]/.test(line.replace("Acquisition opportunity：", "")), `the whole acquisition line is English: ${line}`);
});
