// U-P2-2 / U-P2-3 — the third i18n batch: English mode must not leak
// full-width punctuation, and no view may show a raw id where a label exists.
//
// Pins: (1) missingLabel localizes every `missing` reason kind
// (reputation/experience/achievement/fromRole) in both languages and falls
// back to the raw string for unknown shapes; networkBoardHtml renders those
// labels instead of `reputation:60` strings, with per-language separators
// and no full-width parens in en mode. (2) The network accept result shows
// the role label, not `transition.to` — the handler is DOM-only, so it is
// pinned by a source assertion. (3) gmBusinessHtml localizes sponsor kinds
// in both languages (offers and signed deals), joins signed sponsors /
// equity per language, and renders the board report and debt line with
// per-language punctuation. (4) rebornIdentityHtml shows the contract
// status label (`camp` included) and careerTimelineHtml renders contract /
// season-start lines with per-language punctuation. (5) scoutingView
// renders the tryout button, negotiation counter line, pick list, bref and
// review diff with per-language punctuation, and the gamble title is
// single-language. (6) relationshipsView localizes person kind, promise
// status and role selects — the view is DOM-only, so it is pinned by
// source assertions. (7) describeHistoryEntry renders the inbox event
// title + choice label instead of `eventId → choiceId`, with per-language
// trust parens, and falls back to the raw ids for unknown events.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEMO_JOB_BOARD,
  networkBoardHtml,
} from "../js/ui/networkViews.js";
import {
  emptyNetworkProfile,
  generateOpportunities,
  missingLabel,
} from "../js/career/network/careerOpportunities.js";
import { gmBusinessHtml } from "../js/ui/gmBusinessView.js";
import { createExecutiveScenario } from "../js/career/gm/businessScenario.js";
import {
  careerTimelineHtml,
  rebornIdentityHtml,
} from "../js/ui/reborn/rebornView.js";
import { contractStatusLabel } from "../js/reborn/contract.js";
import {
  GAMBLE_SEED_DEFAULT,
  SLOT_ORDER,
  buildGamble,
} from "../js/career/gm/scoutingIntel.js";
import {
  assignPersonas,
  negotiateRound,
  startNegotiation,
} from "../js/career/gm/negotiation.js";
import {
  negotiationHtml,
  reviewHtml,
  scoutBoardHtml,
} from "../js/ui/scoutingView.js";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import { FEATURED_BOARD, GAMBLE_TEAM_ID, DRAFT_YEAR } from "../js/career/gm/scoutingIntel.js";
import { describeHistoryEntry } from "../js/career/careerHistory.js";

const NETWORK_SRC = readFileSync(new URL("../js/ui/networkViews.js", import.meta.url), "utf8");
const REL_SRC = readFileSync(new URL("../js/ui/relationshipsView.js", import.meta.url), "utf8");
const SCOUTING_SRC = readFileSync(new URL("../js/ui/scoutingView.js", import.meta.url), "utf8");

const CJK = /[\u4e00-\u9fff]/;
const FULLWIDTH = /[（）、，。；：]/;
// Full-width punctuation except the label colon `：`, which is the codebase-wide
// label separator and outside this batch's scope (U-P2-2 lists parens/commas/periods/joins).
const FULLWIDTH_NO_COLON = /[（）、，。；]/;

test("U-P2-3: missingLabel localizes every requirement kind in both languages", () => {
  assert.equal(missingLabel("reputation:60", "zh"), "声望 60");
  assert.equal(missingLabel("reputation:60", "en"), "Reputation 60");
  assert.equal(missingLabel("experience:2", "zh"), "经验 2 季");
  assert.equal(missingLabel("experience:2", "en"), "Experience 2 seasons");
  assert.equal(missingLabel("achievement:all-star", "zh"), "成就 all-star");
  assert.equal(missingLabel("achievement:all-star", "en"), "Achievement all-star");
  assert.equal(missingLabel("fromRole:assistantCoach", "zh"), "助教");
  assert.equal(missingLabel("fromRole:assistantCoach", "en"), "Assistant Coach");
  assert.equal(missingLabel("fromRole:nope", "en"), "nope");
  assert.equal(missingLabel("weird-shape", "en"), "weird-shape");
});

function boardHtml(lang) {
  const profile = emptyNetworkProfile({ role: "scout", team: "LAL" });
  const { offers } = generateOpportunities(profile, DEMO_JOB_BOARD, { seed: 5 });
  return networkBoardHtml({ profile, offers, unemployedNote: null, lang });
}

test("U-P2-2/U-P2-3: network board renders localized missing reasons, no raw ids or full-width parens in en mode", () => {
  const en = boardHtml("en");
  assert.ok(en.includes("Reputation 70"), "reputation requirement is labelled in en");
  assert.ok(en.includes("Experience 5 seasons"), "experience requirement is labelled in en");
  assert.ok(!en.includes("reputation:"), "no raw reputation: string in en mode");
  assert.ok(!en.includes("experience:"), "no raw experience: string in en mode");
  assert.ok(!FULLWIDTH.test(en), "no full-width punctuation in the en board");
  const zh = boardHtml("zh");
  assert.ok(zh.includes("声望 70"), "reputation requirement is labelled in zh");
  assert.ok(zh.includes("经验 5 季"), "experience requirement is labelled in zh");
  assert.ok(!zh.includes("reputation:"), "no raw reputation: string in zh mode");
});

test("U-P2-3: network accept result shows the role label, not transition.to", () => {
  assert.ok(NETWORK_SRC.includes("NETWORK_ROLES[transition.to]"), "accept handler looks up the role label");
  assert.ok(!NETWORK_SRC.includes(": ${transition.to} ·"), "no raw transition.to in the result line");
});

function businessState() {
  const s = createExecutiveScenario({ players: [] });
  s.business.history.push({
    season: 1996, wins: 50, losses: 32, ticket: 10, sponsorship: 5,
    merch: 2, brand: 1, costs: 8, profit: 10, valuation: 100,
  });
  s.business.sponsorships = [{ kind: "jersey", value: 3, signedSeason: 1996 }];
  s.personal.equity = [{ teamId: "CHI", pct: 5, costBasis: 4, acquiredSeason: 1996 }];
  s.personal.debt = { principal: 2, rate: 0.05, dueSeason: 1998, seasonsOverdue: 0 };
  return s;
}

test("U-P2-2/U-P2-3: GM dashboard localizes sponsor kinds and punctuation in both languages", () => {
  const en = gmBusinessHtml(businessState(), { lang: "en" });
  assert.ok(en.includes("Jersey ads $3M"), "signed jersey deal uses the label in en");
  assert.ok(!en.includes("jersey $3M") && !en.includes(">jersey<"), "no raw jersey kind id in en");
  assert.ok(en.includes("Arena naming") || en.includes("Brand deal"), "an open offer uses the label in en");
  assert.ok(!en.includes("$5M · arena") && !en.includes("$5M · brand"), "no raw kind id in an offer button");
  assert.ok(en.includes("Last season 1996: 50 W 32 L, operating profit $10.0M, valuation $100.0M."), "board report uses en punctuation");
  assert.ok(en.includes("(due 1998)"), "debt line uses half-width parens in en");
  assert.ok(en.includes("CHI 5%"), "equity line renders");
  assert.ok(!FULLWIDTH_NO_COLON.test(en), "no full-width parens/commas/periods in the en dashboard");
  const zh = gmBusinessHtml(businessState(), { lang: "zh" });
  assert.ok(zh.includes("球衣广告 $3M"), "signed jersey deal uses the label in zh");
  assert.ok(zh.includes("50 胜 32 负，经营盈利 $10.0M，估值 $100.0M。"), "board report keeps zh punctuation");
  assert.ok(zh.includes("（到期 1998）"), "debt line keeps full-width parens in zh");
});

test("U-P2-3: contractStatusLabel covers camp and falls back to the raw id", () => {
  assert.equal(contractStatusLabel("camp", "zh"), "试训期");
  assert.equal(contractStatusLabel("camp", "en"), "Camp");
  assert.equal(contractStatusLabel("resign", "en"), "Re-signed");
  assert.equal(contractStatusLabel("weird", "en"), "weird");
});

function rebornFixture() {
  return {
    identity: { revealed: false, name: "Test", hints: [] },
    player: { coachTrust: 80, contractStatus: "camp", teamId: "CHI" },
    timeline: {
      events: [
        { event: "contract", year: 1997, outcome: "resign", trust: 80, games: 82, avgMin: 32 },
        { event: "season_start", year: 1998, trust: 80 },
      ],
    },
  };
}

test("U-P2-2/U-P2-3: Reborn identity and timeline localize the contract status and punctuation", () => {
  const en = rebornIdentityHtml({ reborn: rebornFixture(), card: null, lang: "en" });
  assert.ok(en.includes("Camp"), "camp status is labelled in en");
  assert.ok(!en.includes(">camp<") && !en.includes("· camp"), "no raw camp id in en");
  const zh = rebornIdentityHtml({ reborn: rebornFixture(), card: null, lang: "zh" });
  assert.ok(zh.includes("试训期"), "camp status is labelled in zh");
  const enTl = careerTimelineHtml({ reborn: rebornFixture(), lang: "en" });
  assert.ok(enTl.includes("1997 season: Re-signed (trust 80, 82 games, 32 min/game)"), "contract line uses en punctuation");
  assert.ok(enTl.includes("1998 season starts (trust 80)"), "season-start line uses en parens");
  assert.ok(!FULLWIDTH.test(enTl), "no full-width punctuation in the en timeline");
  const zhTl = careerTimelineHtml({ reborn: rebornFixture(), lang: "zh" });
  assert.ok(zhTl.includes("1997 赛季：续约（信任 80，出战 82 场，场均 32 分钟）"), "contract line keeps zh punctuation");
  assert.ok(zhTl.includes("1998 赛季开始（信任 80）"), "season-start line keeps zh parens");
});

/** Real 1996-class cards, same loader as gmDraftGambleView.test.js. */
let realPlayers = null;
function loadRealPlayers() {
  if (realPlayers) return realPlayers;
  const rows = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
  buildCareerSpanIndex(rows);
  const wanted = new Set(FEATURED_BOARD);
  const picked = rows.filter(
    (r) => wanted.has(r.bref) || (Number(r.season) === DRAFT_YEAR + 1 && r.team === GAMBLE_TEAM_ID),
  );
  realPlayers = picked.map((r) => seasonToCard(r));
  return realPlayers;
}

function freshState(gamble) {
  const pickOwnership = {};
  SLOT_ORDER.forEach((teamId, index) => { pickOwnership[index + 1] = teamId; });
  return {
    version: 1,
    seed: GAMBLE_SEED_DEFAULT,
    phase: "scout",
    tryoutsUsed: {},
    injuryFlags: {},
    ledger: {},
    personas: assignPersonas([...new Set(SLOT_ORDER)], GAMBLE_SEED_DEFAULT),
    pickOwnership,
    draft: gamble.draft,
    season: gamble.season,
    picked: [],
    review: null,
  };
}

test("U-P2-2: scout board tryout button uses per-language parens", () => {
  const gamble = buildGamble({ players: loadRealPlayers(), seed: GAMBLE_SEED_DEFAULT });
  const state = freshState(gamble);
  const en = scoutBoardHtml({ gamble, state, lang: "en" });
  assert.ok(en.includes("Tryout (3)"), "tryout budget uses half-width parens in en");
  assert.ok(!en.includes("）"), "no full-width close paren in the en board");
  const zh = scoutBoardHtml({ gamble, state, lang: "zh" });
  assert.ok(zh.includes("试训（剩余3）"), "tryout budget keeps full-width parens in zh");
});

test("U-P2-2: negotiation counter line and accept button use per-language punctuation", () => {
  const gamble = buildGamble({ players: loadRealPlayers(), seed: GAMBLE_SEED_DEFAULT });
  const state = freshState(gamble);
  let counterCase = null;
  for (const slot of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14]) {
    const owner = state.pickOwnership[slot];
    const machine = startNegotiation({ gmId: owner, personaId: state.personas[owner], seed: GAMBLE_SEED_DEFAULT });
    const next = negotiateRound(machine, {
      type: "offer",
      give: { players: [], picks: [{ year: 1996, round: 1, slot: 13 }] },
      ask: { players: [], picks: [{ year: 1996, round: 1, slot }] },
    }, { ledger: state.ledger, currentYear: 1996, lang: "zh" });
    if (next.lastResult?.verdict === "counter") {
      counterCase = { slot, machine: next };
      break;
    }
  }
  assert.ok(counterCase, "some target counters a single-pick offer");
  const neg = { targetSlot: counterCase.slot, giveSlots: [13], state: counterCase.machine, lastResult: counterCase.machine.lastResult };
  const en = negotiationHtml({ state, neg, lang: "en" });
  assert.match(en, /They counter: you offer\s+[\d.]+, they want [\d.]+\./, "counter line uses en punctuation");
  assert.ok(en.includes("Accept (add #8)"), "accept-counter uses half-width parens in en");
  assert.ok(!en.includes("）") && !en.includes("，") && !en.includes("。"), "no full-width punctuation in the en counter");
  const zh = negotiationHtml({ state, neg, lang: "zh" });
  assert.ok(zh.includes("接受条件（再加 #8）"), "accept-counter keeps full-width parens in zh");
  assert.ok(zh.includes("，对方要"), "counter line keeps the zh comma");
  const baseEn = negotiationHtml({ state, neg: null, lang: "en" });
  assert.ok(baseEn.includes("#8, #13."), "pick list joins with a comma and period in en");
  assert.ok(!baseEn.includes("、") && !baseEn.includes("。"), "no full-width join or period in the en pick list");
});

test("U-P2-2: review diff line uses per-language parens and the gamble title is single-language", () => {
  const review = {
    verdict: { grade: "A", yourSum: 160, missedSum: 150, diff: 10 },
    team: [{ year: 1997, wins: 50, losses: 32, playoffs: true }],
    drafted: [{
      name: "Test", pickNumber: 8, rookieOvr: 70, finalOvr: 85,
      seasons: [{ year: 1997, ovr: 75, role: "starter", games: 82 }],
    }],
    passed: [],
  };
  const en = reviewHtml({ review, lang: "en" });
  assert.ok(en.includes("(diff +10)"), "diff uses half-width parens in en");
  assert.ok(!en.includes("（") && !en.includes("）"), "no full-width parens in the en review");
  const zh = reviewHtml({ review, lang: "zh" });
  assert.ok(zh.includes("（差值 +10）"), "diff keeps full-width parens in zh");
  assert.ok(SCOUTING_SRC.includes("L(GAMBLE_TEAM_NAME_ZH, GAMBLE_TEAM_NAME, l)"), "gamble title picks one language");
});

test("U-P2-3: relationships view localizes person kind, promise status and role selects", () => {
  assert.ok(REL_SRC.includes("PERSON_KIND_LABEL[p.kind]"), "person kind uses the label table");
  assert.ok(REL_SRC.includes("PROMISE_STATUS_LABEL[p.status]"), "promise status uses the label table");
  assert.ok(REL_SRC.includes("ROLE_LABEL[r]"), "role selects use the label table");
  assert.ok(!REL_SRC.includes('`<option value="${r}">${r}</option>`'), "no raw role id in a select option");
  assert.ok(!REL_SRC.includes("${esc(p.kind)}"), "no raw person kind in the people list");
  assert.ok(!REL_SRC.includes("· ${p.status}"), "no raw promise status in the promises list");
});

test("U-P2-3: history entry renders the event title and choice label, and falls back to raw ids", () => {
  const known = {
    type: "story-choice", eventId: "core-demands-touches", choiceId: "promise-touches",
    year: 1997, gameIndex: 0, effects: { trust: 2 },
  };
  assert.match(describeHistoryEntry(known, "zh"), /核心要求更多出手权 → 承诺未来 5 场给他更多出手/);
  assert.match(describeHistoryEntry(known, "en"), /The Core Wants More Touches → Promise him more touches for 5 games/);
  assert.ok(!describeHistoryEntry(known, "en").includes("core-demands-touches"), "no raw event id in en");
  const unknown = {
    type: "story-choice", eventId: "no-such-event", choiceId: "no-such-choice",
    year: 1997, gameIndex: 0, effects: { trust: 1 },
  };
  assert.match(describeHistoryEntry(unknown, "zh"), /no-such-event → no-such-choice/);
});
