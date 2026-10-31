import test from "node:test";
import assert from "node:assert/strict";
import { YEAR, badSeasons, firedRoot, hiredRoot, withHistory } from "./helpers/careerFixtures.js";
import { REEMPLOYMENT_FULL_BOARD_REPUTATION, REEMPLOYMENT_LIMITED_BOARD_REPUTATION } from "../js/career/balance.js";
import {
  declineCareerContracts, evaluateCareerEmployment,
} from "../js/modes/careerContract.js";
import { futureKnowledgeEffects, generateReemploymentOffers, resolveFutureKnowledgeChoice } from "../js/modes/timeTravelCareer.js";
import { buildCareerReport } from "../js/story/eventEngine.js";
import { INTRO_CHOICES } from "../js/ui/timeTravel/copy.js";
import { effectChipsHtml, esc, magnitudeTier } from "../js/ui/timeTravel/format.js";
import { choiceDeckHtml } from "../js/ui/timeTravel/choices.js";
import { timelineHtml } from "../js/ui/timeTravel/hq.js";
import { contractOfferCardHtml, jobBoardHtml } from "../js/ui/timeTravel/offers.js";
import { reasonLabel, stintCardHtml } from "../js/ui/timeTravel/epilogue.js";
import { hqModel, kpiModel, onThinIce } from "../js/ui/timeTravel/viewModel.js";
import { careerStateNotice } from "../js/ui/timeTravel/screen.js";

const seasonRow = (offset, w, l, teamId) => ({
  year: YEAR + offset, teamId, teamName: "T", record: { w, l }, finish: "playoffs", championId: "OTHER",
});

// ---------------------------------------------------------------- format
test("esc neutralises all five HTML-significant characters and tolerates null", () => {
  assert.equal(esc(`<img src=x onerror="a('b')">&`), "&lt;img src=x onerror=&quot;a(&#39;b&#39;)&quot;&gt;&amp;");
  assert.equal(esc(null), "");
  assert.equal(esc(undefined), "");
});

test("magnitudeTier buckets effect sizes into none / small / clear / sharp", () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6, -8].map(magnitudeTier), [0, 1, 1, 2, 2, 3, 3]);
});

test("effect chips: direction + size only (never the raw number), tone follows good/bad semantics", () => {
  const html = effectChipsHtml({ trust: 8, mediaPressure: 5, divergence: 4, knowledge: -1 }, "zh");
  assert.match(html, /tt-eff-good[^>]*>.*信任.*▲▲▲/s, "trust +8 is a sharp, good rise");
  assert.match(html, /tt-eff-bad[^>]*>.*压力.*▲▲/s, "pressure going UP is bad");
  assert.match(html, /tt-eff-violet/, "timeline drift is neither good nor bad");
  assert.match(html, /tt-eff-warn[^>]*>.*未来知识.*▼/s, "spending foresight is a cost");
  assert.doesNotMatch(html, />\s*8\s*</, "the exact number must stay hidden");
  assert.equal(effectChipsHtml(null), "");
  assert.equal(effectChipsHtml({ trust: 0 }), "", "no-op effects render nothing");
});

test("effect chips accept the 'pressure' alias, work in English, and carry screen-reader text", () => {
  const html = effectChipsHtml({ pressure: -6 }, "en");
  assert.match(html, /Pressure/);
  assert.match(html, /tt-eff-good/, "pressure going down is good");
  assert.match(html, /tt-sr[^>]*>Pressure sharply down/);
});

// ---------------------------------------------------------------- the UI must read the engine's numbers
test("every intro choice's consequence chips are exactly what the engine then applies", () => {
  for (const choice of INTRO_CHOICES) {
    const effects = futureKnowledgeEffects(choice.id);
    assert.ok(effects, `${choice.id} must exist in the engine`);
    const before = hiredRoot();
    const after = resolveFutureKnowledgeChoice(before, choice.id);
    const delta = (key) => (after.story[key] ?? 0) - (before.story[key] ?? 0);
    assert.equal(delta("frontOfficeTrust"), effects.trust, `${choice.id} trust`);
    assert.equal(delta("mediaPressure"), effects.mediaPressure, `${choice.id} pressure`);
    assert.equal(delta("timelineDivergence"), effects.divergence, `${choice.id} divergence`);
    assert.equal(delta("futureKnowledge"), effects.knowledge, `${choice.id} foresight`);
  }
});

test("futureKnowledgeEffects hands out copies, so the UI can't corrupt the engine's table", () => {
  const first = futureKnowledgeEffects("keep-quiet");
  first.trust = 999;
  assert.equal(futureKnowledgeEffects("keep-quiet").trust, -2);
  assert.equal(futureKnowledgeEffects("nope"), null);
});

test("choice deck labels are escaped and each card shows its effect chips", () => {
  const html = choiceDeckHtml([{ id: "a", label: "<b>x</b>", description: "d", effects: { trust: 3 } }], { attr: "data-event-choice" });
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(html, /data-event-choice="a"/);
  assert.match(html, /tt-eff-good/);
});

// ---------------------------------------------------------------- reasons never leak raw ids
test("every reason the engine can write has a human label in both languages", () => {
  const hired = hiredRoot();
  const solid = [seasonRow(0, 50, 32, hired.story.employer), seasonRow(1, 52, 30, hired.story.employer)];
  const reasons = new Map();

  const lowTrust = evaluateCareerEmployment(withHistory({ ...hired, story: { ...hired.story, frontOfficeTrust: 5 } }, solid));
  reasons.set("trust", lowTrust);
  const goalMisses = evaluateCareerEmployment(withHistory({
    ...hired,
    story: { ...hired.story, eventLog: [false, false].map((achieved) => ({ type: "season-goal-result", achieved })) },
  }, solid));
  reasons.set("goals", goalMisses);
  reasons.set("record", evaluateCareerEmployment(withHistory(hired, badSeasons(hired))));
  const fiveGood = Array.from({ length: 5 }, (_, i) => seasonRow(i, 50 + i, 32 - i, hired.story.employer));
  const pending = evaluateCareerEmployment(withHistory(hired, fiveGood));
  reasons.set("declined", declineCareerContracts(pending));

  const seen = [];
  for (const [name, root] of reasons) {
    assert.ok(["fired", "departed"].includes(root.story.employment.status), `${name}: should have ended the stint`);
    const reason = root.coach.stints.at(-1).reason;
    seen.push(reason);
    for (const lang of ["zh", "en"]) {
      const label = reasonLabel(reason, lang);
      assert.notEqual(label, reasonLabel("not-a-real-reason", lang), `${name}: "${reason}" fell through to the fallback (${lang})`);
      assert.doesNotMatch(label, /[a-z]+-[a-z]+/, `${name}: raw id leaked (${lang}): ${label}`);
    }
  }
  assert.deepEqual([...new Set(seen)].sort(), ["departed", "missed-goals", "trust-collapsed", "two-bad-seasons"]);
});

test("an unknown reason degrades to neutral text instead of printing the raw id", () => {
  assert.equal(reasonLabel("something-new", "zh"), "已离任");
  assert.equal(reasonLabel(undefined, "en"), "Left the team");
});

test("stint cards escape team names", () => {
  const html = stintCardHtml(
    { teamId: "X", startYear: 1995, seasons: 2, wins: 50, losses: 114, championships: 0, reason: "two-bad-seasons" },
    { teamName: "<script>1</script>", colors: { primary: "#112233", secondary: "#ffffff" } },
  );
  assert.doesNotMatch(html, /<script>/);
  assert.match(html, /1995–1996/);
});

// ---------------------------------------------------------------- view-models off a real save
test("kpiModel and hqModel read straight off a real hired career", () => {
  const root = hiredRoot();
  const kpi = kpiModel(root);
  assert.equal(kpi.trust, root.story.frontOfficeTrust);
  assert.equal(kpi.pressure, root.story.mediaPressure);
  assert.equal(kpi.knowledge, root.story.futureKnowledge);
  assert.equal(kpi.cash, root.coach.cash);
  const vm = hqModel(root, buildCareerReport(root));
  assert.equal(vm.teamId, root.story.employer);
  assert.ok(vm.teamName && vm.teamName !== vm.teamId, "shows a team name, not the raw id");
  assert.equal(vm.finished, false);
  assert.equal(vm.label, "");
  assert.equal(vm.yearsPlayed, 0);
});

test("a fired coach's header says so, is finished, and never overruns the contract", () => {
  const fired = firedRoot();
  const vm = hqModel(fired, buildCareerReport(fired));
  assert.equal(vm.finished, true);
  assert.equal(vm.label, "已被解雇");
  assert.ok(vm.yearsPlayed <= vm.contractYears);
  assert.equal(hqModel(fired, buildCareerReport(fired), "en").label, "Fired");
});

test("pending renewal is labelled in the header", () => {
  const hired = hiredRoot();
  const rows = Array.from({ length: 5 }, (_, i) => seasonRow(i, 50 + i, 32 - i, hired.story.employer));
  const pending = evaluateCareerEmployment(withHistory(hired, rows));
  assert.equal(pending.story.pendingDecision.type, "contract-renewal");
  const vm = hqModel(pending, buildCareerReport(pending));
  assert.equal(vm.label, "续约谈判中");
  assert.equal(vm.yearsPlayed, vm.contractYears);
});

// ---------------------------------------------------------------- timeline
const timelineVm = (patch) => ({
  contractYears: 5, yearsPlayed: 0, startYear: 1995, finished: false, currentContractSeasons: [], ...patch,
});

test("timeline: the renewal node becomes 'current' exactly when the contract's years are played", () => {
  assert.match(timelineHtml(timelineVm({ yearsPlayed: 2 })), /tt-node-end tt-node-future/);
  assert.match(timelineHtml(timelineVm({ yearsPlayed: 5 })), /tt-node-end tt-node-current/);
  assert.match(timelineHtml(timelineVm({ yearsPlayed: 2, finished: true })), /tt-node-end tt-node-done/);
});

test("timeline: one current year node while playing, none once the stint is over", () => {
  const count = (html) => (html.match(/tt-node-current/g) || []).length;
  assert.equal(count(timelineHtml(timelineVm({ yearsPlayed: 2 }))), 1);
  assert.equal(count(timelineHtml(timelineVm({ yearsPlayed: 2, finished: true }))), 0);
});

// ---------------------------------------------------------------- job board
test("job board always shows the three tiers; missing ones are locked with the real reputation gate", () => {
  const root = firedRoot(30);
  const offers = generateReemploymentOffers(root);
  const html = jobBoardHtml(offers, { reputation: 30, colorsOf: () => ({ primary: "#123456", secondary: "#ffffff" }), coreOf: () => [], lang: "zh" });
  assert.equal((html.match(/class="tt-offer[ "]/g) || []).length, 3, "always three slots");
  assert.equal((html.match(/tt-offer-locked/g) || []).length, 3 - offers.length);
  if (offers.length < 3) {
    assert.ok(html.includes(`≥ ${REEMPLOYMENT_FULL_BOARD_REPUTATION}`), "names the reputation needed for the contender tier");
    assert.ok(html.includes("你现在 30"), "tells the player where they stand today");
  }
  assert.ok(REEMPLOYMENT_LIMITED_BOARD_REPUTATION < REEMPLOYMENT_FULL_BOARD_REPUTATION);
});

test("a well-regarded coach's board has no locked slots", () => {
  const root = firedRoot(95);
  const offers = generateReemploymentOffers(root);
  const html = jobBoardHtml(offers, { reputation: 95, colorsOf: () => ({ primary: "#123456", secondary: "#ffffff" }), coreOf: () => [], lang: "en" });
  assert.equal(offers.length, 3);
  assert.doesNotMatch(html, /tt-offer-locked/);
});

test("job board escapes hostile team names", () => {
  const root = firedRoot(95);
  const [first, ...rest] = generateReemploymentOffers(root);
  const hostile = [{ ...first, teamName: `<img src=x onerror=alert(1)>` }, ...rest];
  const html = jobBoardHtml(hostile, { reputation: 95, colorsOf: () => ({ primary: "#123456", secondary: "#ffffff" }), coreOf: () => [], lang: "zh" });
  assert.doesNotMatch(html, /<img src=x/);
});

test("contract cards: perks as chips, an empty perk list says so, authority is shown once", () => {
  const withPerks = contractOfferCardHtml({ id: "dynasty-extension", title: "王朝续约", description: "d", years: 5, salary: 20, authority: 96, privileges: ["完全人事决定权"] });
  assert.match(withPerks, /tt-perk/);
  assert.match(withPerks, /data-tier="gold"/);
  assert.equal((withPerks.match(/96/g) || []).length, 1, "authority must not be printed twice");
  const trial = contractOfferCardHtml({ id: "trial-extension", title: "试用", description: "d", years: 1, salary: 4, authority: 30, privileges: [] }, "en");
  assert.match(trial, /None \(prove yourself first\)/);
  assert.match(trial, /data-tier="grey"/);
});

// ---------------------------------------------------------------- notices + thin-ice warning
test("notices point a fired/departed coach at the job hunt and no longer talk about 'five years'", () => {
  for (const status of ["fired", "departed"]) {
    const story = { employment: { status } };
    assert.match(careerStateNotice(story, "zh"), /去找下一份工作/);
    assert.match(careerStateNotice(story, "en"), /go find the next job/);
    assert.doesNotMatch(careerStateNotice(story, "zh"), /五年/);
    assert.doesNotMatch(careerStateNotice(story, "en"), /five/i);
  }
});

test("onThinIce: only when the LATEST board-goal result was a miss", () => {
  const log = (...hits) => ({ story: { eventLog: hits.map((achieved) => ({ type: "season-goal-result", achieved })) } });
  assert.equal(onThinIce(log()), false, "no results yet");
  assert.equal(onThinIce(log(true)), false);
  assert.equal(onThinIce(log(false)), true);
  assert.equal(onThinIce(log(false, true)), false, "recovered since the miss");
  assert.equal(onThinIce(log(true, false)), true);
  const noisy = { story: { eventLog: [{ type: "season-goal-result", achieved: false }, { type: "story-choice" }] } };
  assert.equal(onThinIce(noisy), true, "unrelated later events don't hide the miss");
  assert.equal(onThinIce(null), false);
});
