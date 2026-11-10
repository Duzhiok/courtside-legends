/**
 * Business Events — the GM career events for the shared Career Inbox (workstream F,
 * user-approved 2026-11-10).
 *
 * This module does NOT build a second inbox. Each event is pure data + a handler the
 * inbox consumes: the inbox renders { title, body, choices } (see businessEventForInbox)
 * and calls applyBusinessEvent(state, eventId, choiceId) with the player's pick.
 * Workstream A owns the inbox itself; until it lands, these events are exposed cleanly
 * here and the scenario drives them directly.
 *
 * The `executive` state these handlers take is the composed shape from businessScenario.js:
 * { business, personal, knowledge, exec, log }. Every choice has a real cost or risk —
 * there is no free "good" option.
 */
import { signSponsorship, sponsorshipOffers } from "./franchiseBusiness.js";
import { buyEquity } from "./ownership.js";
import { recordCausalEvent } from "./futureKnowledge.js";

function log(state, entry) {
  return { ...state, log: [...(state.log || []), { ...entry, at: Date.now() }] };
}

/** A fresh sponsor offer for this team/season, of a kind not already signed. */
export function nextSponsorshipOffer(state) {
  const offers = sponsorshipOffers({
    teamId: state.business.teamId,
    season: state.business.season,
    seed: state.seed || 1,
    winPct: 0.4,
    starAppeal: 0,
    market: state.business.market,
  });
  return offers.find((o) => !state.business.sponsorships.some((s) => s.kind === o.kind)) || null;
}

export const BUSINESS_EVENT_TYPES = [
  {
    id: "sponsorship-offer",
    kind: "sponsorship-offer",
    title: "赞助商报价",
    titleEn: "Sponsorship offer",
    body: "一家品牌方希望把名字印上球队，希望你尽快决定。",
    bodyEn: "A brand wants its name on the team and needs an answer soon.",
    available: (s) => !!nextSponsorshipOffer(s),
    choices: [
      {
        id: "sign",
        label: "签下合同",
        labelEn: "Sign the deal",
        apply: (s) => {
          const offer = nextSponsorshipOffer(s);
          if (!offer) return { state: s, effects: "no offer available" };
          const next = log({ ...s, business: signSponsorship(s.business, offer) }, { type: "sponsorship-signed", kind: offer.kind, value: offer.value });
          return { state: next, effects: `+$${offer.value}M / season` };
        },
      },
      {
        id: "decline",
        label: "拒绝，等待更好的报价",
        labelEn: "Decline and wait for a better offer",
        apply: (s) => ({ state: log(s, { type: "sponsorship-declined" }), effects: "no income, no obligation" }),
      },
    ],
  },
  {
    id: "ownership-dispute",
    kind: "ownership-dispute",
    title: "股东质疑你的建队方向",
    titleEn: "Shareholder challenges your direction",
    body: "一位小股东公开质疑你围绕年轻球员建队，认为球队应该立刻争冠。",
    bodyEn: "A minority shareholder publicly questions building around young players and wants to win now.",
    available: (s) => (s.exec?.equityPct ?? 0) > 0 || s.business.history.length >= 1,
    choices: [
      {
        id: "buy-out",
        label: "出资回购他的股份",
        labelEn: "Buy out his shares",
        apply: (s) => {
          const cost = 3;
          if (s.personal.cash < cost) return { state: s, effects: "not enough personal cash", error: "not enough personal cash" };
          const next = log(
            { ...s, personal: { ...s.personal, cash: Math.round((s.personal.cash - cost) * 100) / 100 } },
            { type: "shareholder-bought-out", cost },
          );
          return { state: next, effects: `-$${cost}M personal cash, dispute ends` };
        },
      },
      {
        id: "compromise",
        label: "让步：承诺下赛季冲击季后赛",
        labelEn: "Compromise: promise a playoff push next season",
        apply: (s) => {
          const exec = { ...s.exec, boardTrust: Math.max(0, (s.exec?.boardTrust ?? 50) - 5) };
          return { state: log({ ...s, exec }, { type: "shareholder-compromise" }), effects: "board trust -5, a promise is now on the record" };
        },
      },
    ],
  },
  {
    id: "star-marketing",
    kind: "star-marketing",
    title: "球星营销机会",
    titleEn: "Star marketing opportunity",
    body: "球队核心的球衣销量在涨，城市里到处是他的海报。市场部想趁热打铁，做一波全城营销。",
    bodyEn: "The star's jerseys are selling and his face is all over town. Marketing wants a city-wide campaign.",
    available: (s) => s.business.brand < 1,
    choices: [
      {
        id: "campaign",
        label: "投入 $2M 做全城营销",
        labelEn: "Spend $2M on a city campaign",
        apply: (s) => {
          if (s.business.operatingBudget < 2) return { state: s, effects: "operating budget cannot cover it", error: "operating budget cannot cover it" };
          const business = {
            ...s.business,
            operatingBudget: Math.round((s.business.operatingBudget - 2) * 100) / 100,
            brand: Math.min(1, s.business.brand + 0.08),
          };
          return { state: log({ ...s, business }, { type: "marketing-campaign", cost: 2 }), effects: "-$2M operating budget, brand +0.08" };
        },
      },
      {
        id: "decline",
        label: "先不花这笔钱",
        labelEn: "Hold the money for now",
        apply: (s) => ({ state: log(s, { type: "marketing-declined" }), effects: "no cost, no brand gain" }),
      },
    ],
  },
  {
    id: "financial-crisis",
    kind: "financial-crisis",
    title: "球馆突发维修：$8M 缺口",
    titleEn: "Arena emergency: an $8M gap",
    body: "球馆屋顶漏水，季票持有者已经在抱怨。维修不能等，但账上并不宽裕。",
    bodyEn: "The arena roof is leaking and season-ticket holders are complaining. The repair cannot wait.",
    available: () => true,
    choices: [
      {
        id: "pay",
        label: "从经营预算支付 $8M",
        labelEn: "Pay $8M from the operating budget",
        apply: (s) => {
          if (s.business.operatingBudget < 8) return { state: s, effects: "operating budget cannot cover it", error: "operating budget cannot cover it" };
          const business = { ...s.business, operatingBudget: Math.round((s.business.operatingBudget - 8) * 100) / 100 };
          return { state: log({ ...s, business }, { type: "crisis-paid", cost: 8 }), effects: "-$8M operating budget, fans reassured" };
        },
      },
      {
        id: "defer",
        label: "推迟维修，先应付一个赛季",
        labelEn: "Defer the repair for a season",
        apply: (s) => {
          const business = { ...s.business, fanLoyalty: Math.max(0.2, s.business.fanLoyalty - 0.1) };
          return { state: log({ ...s, business }, { type: "crisis-deferred" }), effects: "no cost now, fan loyalty -0.10" };
        },
      },
    ],
  },
  {
    id: "arena-negotiation",
    kind: "arena-negotiation",
    title: "市政府的球馆合作方案",
    titleEn: "City arena partnership",
    body: "市政府愿意分担一半翻新费用，条件是球队承诺十年内不搬迁。",
    bodyEn: "The city will cover half the renovation cost if the team commits to staying ten years.",
    available: (s) => s.business.arena.level < 2,
    choices: [
      {
        id: "accept",
        label: "接受：翻新费用减半，承诺留守",
        labelEn: "Accept: half-price renovation, ten-year stay",
        apply: (s) => {
          const cost = 6;
          if (s.business.operatingBudget < cost) return { state: s, effects: "operating budget cannot cover it", error: "operating budget cannot cover it" };
          const business = {
            ...s.business,
            operatingBudget: Math.round((s.business.operatingBudget - cost) * 100) / 100,
            arena: { ...s.business.arena, level: 2 },
            brand: Math.min(1, s.business.brand + 0.05),
          };
          return { state: log({ ...s, business }, { type: "arena-deal-accepted", cost }), effects: `-$${cost}M, arena renovated, ten-year stay promised` };
        },
      },
      {
        id: "decline",
        label: "拒绝，不想被绑住",
        labelEn: "Decline — do not want to be tied down",
        apply: (s) => ({ state: log(s, { type: "arena-deal-declined" }), effects: "no deal, relocation stays an option" }),
      },
    ],
  },
  {
    id: "relocation-proposal",
    kind: "relocation-proposal",
    title: "另一座城市的搬迁邀请",
    titleEn: "Relocation invitation from another city",
    body: "一座更大的城市开出优厚条件，希望你把球队搬过去。当地球迷会怎么想，你很清楚。",
    bodyEn: "A bigger city offers generous terms to move the team. You know exactly what local fans would think.",
    available: (s) => s.business.market !== "large",
    choices: [
      {
        id: "explore",
        label: "认真考虑搬迁（大市场）",
        labelEn: "Seriously consider the move (large market)",
        apply: (s) => {
          const cost = 40;
          if (s.business.operatingBudget < cost) return { state: s, effects: "operating budget cannot cover it", error: "operating budget cannot cover it" };
          const business = {
            ...s.business,
            operatingBudget: Math.round((s.business.operatingBudget - cost) * 100) / 100,
            market: "large",
            fanLoyalty: Math.max(0.2, s.business.fanLoyalty - 0.25),
            relocationHangover: 2,
            arena: { ...s.business.arena, level: 1 },
          };
          const knowledge = recordCausalEvent(s.knowledge, { id: `relocate-${s.business.season}`, kind: "relocation", subject: s.business.teamId, season: s.business.season, label: "team relocated" });
          return { state: log({ ...s, business, knowledge }, { type: "team-relocated", cost }), effects: `-$${cost}M, large market, fan loyalty -0.25, demand soft for 2 seasons` };
        },
      },
      {
        id: "decline",
        label: "拒绝，留下来",
        labelEn: "Decline and stay",
        apply: (s) => {
          const business = { ...s.business, fanLoyalty: Math.min(1, s.business.fanLoyalty + 0.03) };
          return { state: log({ ...s, business }, { type: "relocation-declined" }), effects: "fans notice the loyalty, +0.03" };
        },
      },
    ],
  },
  {
    id: "acquisition-opportunity",
    kind: "acquisition-opportunity",
    title: "收购球队股份的机会",
    titleEn: "Chance to buy team equity",
    body: "一位老股东想退出，愿意出售 5% 的球队股份。价格按当前估值计算。",
    bodyEn: "An old shareholder wants out and will sell a 5% stake, priced at the current valuation.",
    available: (s) => (s.personal?.cash ?? 0) >= (s.business?.valuation ?? 150) * 0.05 * 0.5,
    choices: [
      {
        id: "buy",
        label: "买下这 5% 股份",
        labelEn: "Buy the 5% stake",
        apply: (s) => {
          const pricePerPct = s.business.valuation / 100;
          const personal = buyEquity(s.personal, { teamId: s.business.teamId, pct: 5, pricePerPct, season: s.business.season });
          const exec = { ...s.exec, equityPct: (s.exec?.equityPct ?? 0) + 5 };
          return { state: log({ ...s, personal, exec }, { type: "equity-bought", pct: 5, cost: 5 * pricePerPct }), effects: `bought 5% for $${(5 * pricePerPct).toFixed(1)}M personal cash` };
        },
      },
      {
        id: "pass",
        label: "先不买",
        labelEn: "Pass for now",
        apply: (s) => ({ state: log(s, { type: "equity-passed" }), effects: "the seller may not wait" }),
      },
    ],
  },
  {
    id: "executive-employment",
    kind: "executive-employment",
    title: "董事会年度评估",
    titleEn: "Annual board review",
    body: "董事会正在评估你的工作。战绩、利润和球迷情绪都在桌上。",
    bodyEn: "The board is reviewing your work. Wins, profit and fan sentiment are all on the table.",
    available: (s) => s.business.history.length >= 1,
    choices: [
      {
        id: "stay",
        label: "接受评估，继续留任",
        labelEn: "Accept the review and stay",
        apply: (s) => {
          const last = s.business.history.at(-1);
          const trustDelta = last && last.profit >= 0 ? 5 : -5;
          const exec = { ...s.exec, boardTrust: Math.max(0, Math.min(100, (s.exec?.boardTrust ?? 50) + trustDelta)) };
          return { state: log({ ...s, exec }, { type: "board-review", trustDelta }), effects: `board trust ${trustDelta >= 0 ? "+" : ""}${trustDelta}` };
        },
      },
      {
        id: "raise",
        label: "要求加薪：成绩和利润都证明了价值",
        labelEn: "Ask for a raise",
        apply: (s) => {
          const last = s.business.history.at(-1);
          const earned = last && last.profit >= 0 && last.wins >= 40;
          const personal = earned ? { ...s.personal, salary: Math.round((s.personal.salary + 0.2) * 100) / 100 } : s.personal;
          const exec = { ...s.exec, boardTrust: Math.max(0, (s.exec?.boardTrust ?? 50) - (earned ? 0 : 5)) };
          return { state: log({ ...s, personal, exec }, { type: "raise-asked", earned }), effects: earned ? "salary +$0.2M/yr" : "board unimpressed, trust -5" };
        },
      },
    ],
  },
];

export function businessEventById(id) {
  return BUSINESS_EVENT_TYPES.find((e) => e.id === id) || null;
}

/** Events whose availability predicate passes for this executive state. */
export function availableBusinessEvents(state) {
  return BUSINESS_EVENT_TYPES.filter((e) => e.available(state));
}

/** Apply a player's choice. Returns { state, effects } or { state, effects, error }. */
export function applyBusinessEvent(state, eventId, choiceId) {
  const event = businessEventById(eventId);
  if (!event) throw new RangeError(`unknown business event: ${eventId}`);
  const choice = event.choices.find((c) => c.id === choiceId);
  if (!choice) throw new RangeError(`unknown choice ${choiceId} for event ${eventId}`);
  return choice.apply(state);
}

/**
 * The shape the shared Career Inbox (workstream A) renders: id, kind, title, body and the
 * choice labels only. The inbox calls applyBusinessEvent(state, id, choiceId) with the pick.
 */
export function businessEventForInbox(event, lang = "zh") {
  return {
    id: event.id,
    kind: event.kind,
    title: lang === "en" ? event.titleEn : event.title,
    body: lang === "en" ? event.bodyEn : event.body,
    choices: event.choices.map((c) => ({ id: c.id, label: lang === "en" ? c.labelEn : c.label })),
  };
}
