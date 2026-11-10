/**
 * View tests for the 1996 draft gamble (workstream C).
 *
 * The HTML builders are pure functions of (gamble, state) — no DOM needed.
 * Two pins matter most: (1) no hidden-potential number is ever rendered
 * as a labelled claim; (2) the review is labelled a projection, and the
 * counter UI tells the player exactly what extra chip the slice accepts
 * (the other 1996 pick), not the module's general sweetener text.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { seasonToCard } from "../js/data/players.js";
import { buildCareerSpanIndex } from "../js/data/careerArc.js";
import {
  advanceDraftToUserPick,
  selectDraftProspect,
} from "../js/engine/leagueDraft.js";
import {
  DRAFT_YEAR,
  FEATURED_BOARD,
  GAMBLE_SEED_DEFAULT,
  GAMBLE_TEAM_ID,
  SLOT_ORDER,
  TRYOUT_BUDGET,
  buildGamble,
  projectThreeYears,
  runTryout,
  validGambleState,
} from "../js/career/gm/scoutingIntel.js";
import {
  assignPersonas,
  negotiateRound,
  startNegotiation,
} from "../js/career/gm/negotiation.js";
import {
  draftBoardHtml,
  negotiationHtml,
  reviewHtml,
  scoutBoardHtml,
  userPickHtml,
} from "../js/ui/scoutingView.js";

const SEED = GAMBLE_SEED_DEFAULT;

/** Real 1996-class cards: the 14 featured ladders + the 1997 CHH roster. */
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
    seed: SEED,
    phase: "scout",
    tryoutsUsed: {},
    injuryFlags: {},
    ledger: {},
    personas: assignPersonas([...new Set(SLOT_ORDER)], SEED),
    pickOwnership,
    draft: gamble.draft,
    season: gamble.season,
    picked: [],
    review: null,
  };
}

test("scout board: all 14 prospects, bands only, no hidden number anywhere", () => {
  const gamble = buildGamble({ players: loadRealPlayers(), seed: SEED });
  const state = freshState(gamble);
  assert.ok(validGambleState(state));
  const html = scoutBoardHtml({ gamble, state, lang: "zh" });
  for (const prospect of gamble.prospects) {
    const info = prospect.player;
    assert.ok(html.includes(info.name), `board names ${info.name}`);
    // The hidden potential must never be rendered as a labelled number.
    const hidden = gamble.hiddenByBref[prospect.bref].potential;
    assert.ok(!html.includes(`潜力 ${hidden}`), `no 潜力 ${hidden} for ${info.name}`);
    assert.ok(!html.includes(`data-potential`), "no data-potential attribute");
  }
  // Every scout report shows a range with an en dash, never a bare number.
  assert.ok(html.includes("–"), "report ranges use an en dash");
  assert.ok(html.includes(`试训（剩余${TRYOUT_BUDGET}）`), "tryout budget is shown");
  const en = scoutBoardHtml({ gamble, state, lang: "en" });
  assert.ok(en.includes("Potential is shown as a range only"), "en copy states the range rule");
});

test("scout board: a tryout result shows the narrow band and its clues", () => {
  const gamble = buildGamble({ players: loadRealPlayers(), seed: SEED });
  const state = freshState(gamble);
  const kobe = gamble.prospects.find((p) => p.bref === "bryanko01");
  state.tryoutsUsed.bryanko01 = runTryout(kobe.player, gamble.hiddenByBref.bryanko01, SEED);
  const html = scoutBoardHtml({ gamble, state, lang: "zh" });
  assert.ok(html.includes("试训"), "tryout block renders");
  assert.ok(html.includes(`试训（剩余${TRYOUT_BUDGET - 1}）`), "budget drops by one");
  const tryout = state.tryoutsUsed.bryanko01;
  assert.ok(html.includes(`${tryout.range.min}–${tryout.range.max}`), "narrow band renders");
  assert.ok(html.includes(tryout.clues.workEthic.zh), "work-ethic clue renders");
});

test("negotiation panel: your picks, targets, and the counter's honest terms", () => {
  const gamble = buildGamble({ players: loadRealPlayers(), seed: SEED });
  const state = freshState(gamble);
  const base = negotiationHtml({ state, neg: null, lang: "zh" });
  assert.ok(base.includes("#8") && base.includes("#13"), "your two picks are listed");
  assert.ok(base.includes("#5"), "a target slot is offered");
  // Find a target where giving #13 alone draws a counter (value shortfall
  // but within 75% of demand) — the exact slot depends on the seeded
  // persona assignment, so search rather than hard-coding it.
  let counterCase = null;
  for (const slot of [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 14]) {
    const owner = state.pickOwnership[slot];
    const machine = startNegotiation({ gmId: owner, personaId: state.personas[owner], seed: SEED });
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
  const html = negotiationHtml({ state, neg, lang: "zh" });
  assert.ok(html.includes("接受条件（再加 #8）"), "accept-counter names the other pick");
  assert.ok(html.includes("另一个签位"), "the slice note says the extra chip is the other pick");
  assert.ok(!html.includes("1997 年首轮签"), "no 1997-pick promise in the slice UI");
});

test("negotiation: both picks for a top slot is accepted", () => {
  const gamble = buildGamble({ players: loadRealPlayers(), seed: SEED });
  const state = freshState(gamble);
  const owner = state.pickOwnership[5];
  const machine = startNegotiation({ gmId: owner, personaId: state.personas[owner], seed: SEED });
  const next = negotiateRound(machine, {
    type: "offer",
    give: { players: [], picks: [{ year: 1996, round: 1, slot: 8 }, { year: 1996, round: 1, slot: 13 }] },
    ask: { players: [], picks: [{ year: 1996, round: 1, slot: 5 }] },
  }, { ledger: state.ledger, currentYear: 1996, lang: "zh" });
  assert.equal(next.status, "accepted");
  assert.equal(next.lastResult.verdict, "accept");
});

test("full flow: scout → draft (Kobe #8, best remaining sleeper #13) → review is a labelled projection", () => {
  const players = loadRealPlayers();
  const gamble = buildGamble({ players, seed: SEED });
  const state = freshState(gamble);
  state.phase = "draft";
  state.draft = advanceDraftToUserPick(state.draft, state.season);
  const board = draftBoardHtml({ state, lang: "zh" });
  assert.ok(board.includes("#8") && board.includes("你"), "your slot is marked");
  const pickPanel = userPickHtml({ state, gamble, lang: "zh" });
  assert.ok(pickPanel.includes("轮到你了"), "the user pick panel renders at #8");
  const kobe = state.draft.prospects.find((p) => p.bref === "bryanko01");
  assert.ok(kobe, "Kobe is still on the board at #8");
  const picked = [];
  let draft = selectDraftProspect(state.draft, state.season, kobe.prospectId);
  picked.push({ prospectId: kobe.prospectId, bref: "bryanko01", pickNumber: 8 });
  draft = advanceDraftToUserPick(draft, state.season);
  // By #13 the CPU consensus may already have taken the obvious names
  // (Nash goes in the #9–12 window at this seed) — so take the best
  // remaining sleeper by hidden potential, which is the slice's whole point.
  const sleeper = [...draft.prospects].sort(
    (a, b) => gamble.hiddenByBref[b.bref].potential - gamble.hiddenByBref[a.bref].potential,
  )[0];
  draft = selectDraftProspect(draft, state.season, sleeper.prospectId);
  picked.push({ prospectId: sleeper.prospectId, bref: sleeper.bref, pickNumber: 13 });
  draft = advanceDraftToUserPick(draft, state.season);
  assert.equal(draft.status, "complete");
  assert.equal(draft.selections.length, 14);
  assert.equal(new Set(draft.selections.map((s) => s.bref)).size, 14);
  const chh = draft.selections.filter((s) => s.teamId === GAMBLE_TEAM_ID);
  assert.deepEqual(chh.map((s) => s.bref).sort(), ["bryanko01", sleeper.bref].sort());
  const drafted = picked.map((p) => ({
    card: state.season.teams[GAMBLE_TEAM_ID].players.find((c) => c.bref === p.bref),
    pickNumber: p.pickNumber,
  }));
  const passed = draft.selections
    .filter((s) => s.teamId !== GAMBLE_TEAM_ID && s.bref)
    .map((s) => ({ card: gamble.prospects.find((p) => p.bref === s.bref).player }))
    .sort((a, b) => gamble.hiddenByBref[b.card.bref].potential - gamble.hiddenByBref[a.card.bref].potential)
    .slice(0, 3);
  const review = projectThreeYears({ drafted, passed, roster: gamble.roster, seed: SEED, injuryFlags: {}, players });
  const html = reviewHtml({ review, lang: "zh" });
  assert.ok(html.includes("推演"), "the review is labelled a projection");
  assert.ok(html.includes("不是真实比赛结果"), "the projection disclaimer renders");
  assert.ok(html.includes("评级"), "a verdict grade renders");
  assert.ok(html.includes("1997"), "the projection years render");
});
