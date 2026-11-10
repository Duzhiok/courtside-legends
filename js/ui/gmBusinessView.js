/**
 * GM Business View — the Executive Dynasty dashboard (workstream F, user-approved 2026-11-10).
 *
 * Three-layer depth, exactly as the user asked:
 *   Layer 1 (default): stage, franchise snapshot, personal snapshot, board report.
 *   Layer 2: major decisions — ticket price, sponsorship offers, business events,
 *     stage opportunities.
 *   Layer 3 (collapsed behind a toggle): deep management — revenue breakdown, holdings,
 *     debt, future-knowledge clues, medical level, trend focus.
 *
 * The dev entry (?gm-business=1) advances seasons from a clearly-labelled stand-in form
 * (the player enters the real season result) until the real season flow wires in — the
 * view never fabricates a game result itself. Every money figure is $M.
 */
import { attachToCareerRoot, createExecutiveScenario, advanceScenarioSeason, minorityOpportunity } from "../career/gm/businessScenario.js";
import { availableBusinessEvents, applyBusinessEvent, businessEventForInbox } from "../career/gm/businessEvents.js";
import { setTicketPrice, signSponsorship, sponsorshipOffers } from "../career/gm/franchiseBusiness.js";
import { clueView, revealClue, setMedicalLevel, investInTrend, MEDICAL_LEVELS, TRENDS } from "../career/gm/futureKnowledge.js";
import { stageFor, stageLabel, stageOpportunities } from "../career/gm/executiveProgression.js";

const L = (zh, en, lang) => (lang === "en" ? en : zh);

export function ensureGmBusinessScreen() {
  let el = document.querySelector("#screen-gm-business");
  if (el) return el;
  el = document.createElement("main");
  el.id = "screen-gm-business";
  el.className = "screen";
  el.innerHTML = `<div class="panel-head"><button class="nav-back" id="btn-gm-business-back" type="button"><span>返回</span></button><h2>总经理 · 从雇员到帝国</h2></div><div id="gm-business-body"></div>`;
  document.body.appendChild(el);
  return el;
}

function money(v) {
  return `$${Number(v ?? 0).toFixed(1)}M`;
}

/** Pure HTML for the dashboard. `players` is the loaded roster (star/payroll figures). */
export function gmBusinessHtml(state, { lang = "zh", players = [] } = {}) {
  const b = state.business;
  const p = state.personal;
  const stage = stageFor(state.exec);
  const last = b.history.at(-1);
  const offers = sponsorshipOffers({
    teamId: b.teamId,
    season: b.season,
    seed: state.seed || 1,
    winPct: last ? last.wins / Math.max(1, last.wins + last.losses) : 0.4,
    starAppeal: 0,
    market: b.market,
  }).filter((o) => !b.sponsorships.some((s) => s.kind === o.kind));
  const events = availableBusinessEvents(state);
  const opps = stageOpportunities(state.exec, { wealth: p.cash, valuation: b.valuation, loanCapacity: 20 });
  const minority = minorityOpportunity(state);
  const clues = state.knowledge.clues.map((c) => clueView(c, state.knowledge.ledger));
  return `
  <section class="gm-business">
    <p class="gm-stage">${L("当前身份", "Current stage", lang)}：<strong>${stageLabel(stage, lang)}</strong> · ${b.teamName} · ${b.season}–${String(b.season + 1).slice(2)} ${L("赛季", "season", lang)}</p>
    <div class="gm-panels">
      <div class="gm-panel">
        <h3>${L("球队经营", "Franchise", lang)}</h3>
        <p>${L("经营预算", "Operating budget", lang)} ${money(b.operatingBudget)} · ${L("球队估值", "Valuation", lang)} ${money(b.valuation)}</p>
        <p>${L("平均票价", "Avg ticket", lang)} $${b.ticketPrice} · ${L("球馆容量", "Arena", lang)} ${b.arena.capacity.toLocaleString()} · ${L("品牌", "Brand", lang)} ${Math.round(b.brand * 100)}%</p>
        ${last ? `<p>${L("上赛季", "Last season", lang)}：${last.wins}–${last.losses} · ${L("票房", "Tickets", lang)} ${money(last.ticket)} · ${L("赞助", "Sponsors", lang)} ${money(last.sponsorship)} · ${L("利润", "Profit", lang)} ${money(last.profit)}</p>` : ""}
      </div>
      <div class="gm-panel">
        <h3>${L("个人财富", "Personal wealth", lang)}</h3>
        <p>${L("现金", "Cash", lang)} ${money(p.cash)} · ${L("年薪", "Salary", lang)} ${money(p.salary)}${L("/年", "/yr", lang)} · ${L("股权", "Equity", lang)} ${state.exec.equityPct}%</p>
        <p>${L("分红累计", "Dividends earned", lang)} ${money(p.dividendsEarned)}${p.debt ? ` · ${L("负债", "Debt", lang)} ${money(p.debt.principal)}（${L("到期", "due", lang)} ${p.debt.dueSeason}）` : ""}</p>
        <p class="tiny">${L("个人财富与球队经营预算是分开的：球队收入不会直接变成你的钱，只有工资和分红会。", "Personal wealth and the franchise budget are separate: team revenue never becomes your money directly — only salary and dividends do.", lang)}</p>
      </div>
    </div>
    <div class="gm-panel">
      <h3>${L("董事会报告", "Board report", lang)}</h3>
      ${last ? `<p>${L("上赛季", "Last season", lang)} ${last.season}：${last.wins} ${L("胜", "W", lang)} ${last.losses} ${L("负", "L", lang)}，${L("经营", "operating", lang)}${last.profit >= 0 ? L("盈利", "profit", lang) : L("亏损", "loss", lang)} ${money(last.profit)}，${L("估值", "valuation", lang)} ${money(last.valuation)}。</p>` : `<p>${L("还没有打完的赛季。先做一次球探决策、签一份赞助、调一次票价，再模拟赛季。", "No season played yet. Make a scouting decision, sign a sponsor, set ticket prices, then simulate a season.", lang)}</p>`}
      ${minority ? `<p>${L("收购机会", "Acquisition opportunity", lang)}：${minority.available ? L("可以买下 5% 股份，成为球队合伙人。", "You can buy a 5% stake and become a minority owner.") : L("还不满足条件：", "Not yet available: ") + minority.missing.join("；")}</p>` : ""}
    </div>
    <div class="gm-panel">
      <h3>${L("重大决策", "Major decisions", lang)}</h3>
      <p>${L("票价", "Ticket price", lang)}：
        ${[20, 30, 45, 60, 80].map((price) => `<button type="button" class="btn small" data-gm-action="ticket" data-price="${price}" ${price === b.ticketPrice ? "disabled" : ""}>$${price}</button>`).join(" ")}
      </p>
      <p>${L("赞助报价", "Sponsorship offers", lang)}：
        ${offers.length ? offers.map((o) => `<button type="button" class="btn small" data-gm-action="sponsor" data-offer="${o.id}">$${o.value}M · ${lang === "en" ? o.kind : { jersey: "球衣广告", arena: "球馆冠名", brand: "品牌合作" }[o.kind]}</button>`).join(" ") : L("暂无新的报价", "No new offers", lang)}
      </p>
      <div class="gm-events">
        ${events.length ? events.map((e) => { const v = businessEventForInbox(e, lang); return `<div class="gm-event"><strong>${v.title}</strong><p>${v.body}</p><p>${v.choices.map((c) => `<button type="button" class="btn small" data-gm-action="event-choice" data-event="${v.id}" data-choice="${c.id}">${c.label}</button>`).join(" ")}</p></div>`; }).join("") : `<p>${L("暂无待处理事件", "No pending events", lang)}</p>`}
      </div>
      <p>${L("晋升与收购", "Advancement", lang)}：
        ${opps.map((o) => `<span class="gm-opp" title="${o.missing.join("；") || ""}">${o.id}: ${o.available ? L("可接受", "available", lang) : L("未满足", "not ready", lang)}</span>`).join(" ")}
      </p>
    </div>
    <details class="gm-panel">
      <summary>${L("深度经营", "Deep management", lang)}</summary>
      ${last ? `<p>${L("收入明细", "Revenue breakdown", lang)}：${L("票房", "Tickets", lang)} ${money(last.ticket)} · ${L("赞助", "Sponsors", lang)} ${money(last.sponsorship)} · ${L("周边", "Merch", lang)} ${money(last.merch)} · ${L("品牌", "Brand", lang)} ${money(last.brand)} · ${L("成本", "Costs", lang)} ${money(last.costs)}</p>` : ""}
      <p>${L("已签赞助", "Signed sponsors", lang)}：${b.sponsorships.length ? b.sponsorships.map((s) => `${s.kind} $${s.value}M`).join("、") : L("无", "None", lang)}</p>
      <p>${L("持有股权", "Equity held", lang)}：${p.equity.length ? p.equity.map((e) => `${e.teamId} ${e.pct}%`).join("、") : L("无", "None", lang)}</p>
      <p>${L("未来知识", "Future knowledge", lang)}：${state.knowledge.knowledge} ${L("点", "points", lang)} ·
        ${clues.map((c) => c.revealed ? `<span>${c.summary}（${c.band[lang === "en" ? "en" : "zh"]}）</span>` : `<button type="button" class="btn small" data-gm-action="reveal-clue" data-clue="${c.id}">${L("揭示线索（1 点）", "Reveal clue (1 pt)", lang)}</button>`).join(" ") || L("暂无线索", "No clues", lang)}
      </p>
      <p>${L("医疗团队", "Medical staff", lang)}：
        ${Object.entries(MEDICAL_LEVELS).map(([level, def]) => `<button type="button" class="btn small" data-gm-action="medical" data-level="${level}" ${Number(level) === state.knowledge.medicalLevel ? "disabled" : ""}>${lang === "en" ? def.labelEn : def.label} $${def.cost}M</button>`).join(" ")}
      </p>
      <p>${L("趋势投资", "Trend bets", lang)}：
        ${Object.values(TRENDS).map((t) => `<button type="button" class="btn small" data-gm-action="trend" data-trend="${t.id}" ${state.knowledge.trendFocus === t.id ? "disabled" : ""}>${lang === "en" ? t.en : t.zh}</button>`).join(" ")}
      </p>
    </details>
    <div class="gm-panel">
      <h3>${L("模拟下赛季", "Simulate next season", lang)}</h3>
      <p class="tiny">${L("开发入口：赛季结果由你输入真实比赛结果；正式接入后改为真实赛季引擎的结果，本视图不伪造比赛。", "Dev entry: enter the real season result here; the production wiring will use the real season engine instead. This view never fabricates a game.", lang)}</p>
      <label>${L("胜场", "Wins", lang)} <input type="number" id="gm-sim-wins" value="30" min="0" max="82"></label>
      <label>${L("负场", "Losses", lang)} <input type="number" id="gm-sim-losses" value="52" min="0" max="82"></label>
      <label>${L("季后赛", "Playoffs", lang)}
        <select id="gm-sim-playoffs">
          <option value="">${L("未进季后赛", "Missed playoffs", lang)}</option>
          <option value="first-round">${L("首轮", "First round", lang)}</option>
          <option value="conf-final">${L("分区决赛", "Conf finals", lang)}</option>
          <option value="finals">${L("总决赛", "Finals", lang)}</option>
        </select>
      </label>
      <label><input type="checkbox" id="gm-sim-champion"> ${L("总冠军", "Champion", lang)}</label>
      <button type="button" class="btn primary" data-gm-action="advance-season">${L("结算本赛季", "Settle this season", lang)}</button>
      ${state.exec.settled ? `<p>${L("传奇终局", "Empire legacy", lang)}：${state.exec.settled.title[lang === "en" ? "en" : "zh"]} · ${L("评分", "Score", lang)} ${state.exec.settled.score}</p>` : ""}
    </div>
    ${state.dismissed ? `<p class="gm-warning">${L("你失去了球队的控制权与职位——但这不是终点。去一支小市场球队重新开始，下一段故事从这里继续。", "You lost control of the team and your job — but this is not the end. Restart at a small-market team; the next chapter starts here.", lang)}</p>` : ""}
  </section>`;
}

export function createGmBusinessView({ getLang, show, goBack, readRootSave, writeRootSave } = {}) {
  const lang = () => (typeof getLang === "function" ? getLang() : "zh");
  let el = null;
  let state = null;
  let players = [];

  function persist() {
    try {
      const root = typeof readRootSave === "function" ? readRootSave() : null;
      if (root?.story && typeof writeRootSave === "function") {
        writeRootSave(attachToCareerRoot(root, state));
      }
    } catch {
      // Dev entry without a career root: the scenario lives in memory only.
    }
  }

  function render() {
    if (!el || !state) return;
    el.querySelector("#gm-business-body").innerHTML = gmBusinessHtml(state, { lang: lang(), players });
  }

  function bind() {
    el.querySelector("#btn-gm-business-back")?.addEventListener("click", () => goBack());
    el.querySelector("#gm-business-body")?.addEventListener("click", (event) => {
      const btn = event.target.closest("[data-gm-action]");
      if (!btn || !state) return;
      const action = btn.dataset.gmAction;
      if (action === "ticket") {
        state = { ...state, business: setTicketPrice(state.business, Number(btn.dataset.price)) };
      } else if (action === "sponsor") {
        const offer = sponsorshipOffers({ teamId: state.business.teamId, season: state.business.season, seed: state.seed || 1, winPct: 0.4, market: state.business.market }).find((o) => o.id === btn.dataset.offer);
        if (offer) state = { ...state, business: signSponsorship(state.business, offer) };
      } else if (action === "event-choice") {
        const applied = applyBusinessEvent(state, btn.dataset.event, btn.dataset.choice);
        if (!applied.error) state = applied.state;
      } else if (action === "reveal-clue") {
        try {
          state = { ...state, knowledge: revealClue(state.knowledge, btn.dataset.clue) };
        } catch {
          return;
        }
      } else if (action === "medical") {
        const level = Number(btn.dataset.level);
        const cost = MEDICAL_LEVELS[level].cost;
        if (state.business.operatingBudget < cost) return;
        state = {
          ...state,
          business: { ...state.business, operatingBudget: Math.round((state.business.operatingBudget - cost) * 100) / 100 },
          knowledge: setMedicalLevel(state.knowledge, level),
        };
      } else if (action === "trend") {
        state = { ...state, knowledge: investInTrend(state.knowledge, btn.dataset.trend, state.business.season) };
      } else if (action === "advance-season") {
        const wins = Number(el.querySelector("#gm-sim-wins")?.value ?? 0);
        const losses = Number(el.querySelector("#gm-sim-losses")?.value ?? 0);
        const playoffRound = el.querySelector("#gm-sim-playoffs")?.value || null;
        const champion = !!el.querySelector("#gm-sim-champion")?.checked;
        const { state: next } = advanceScenarioSeason(state, { wins, losses, playoffRound, champion }, { players, rng: Math.random });
        state = next;
      }
      persist();
      render();
    });
  }

  return {
    open(scenario, rosterPlayers = []) {
      el = ensureGmBusinessScreen();
      state = scenario;
      players = rosterPlayers;
      bind();
      render();
      show("gmBusiness");
    },
    createScenario(options) {
      return createExecutiveScenario(options);
    },
    getState() {
      return state;
    },
  };
}
