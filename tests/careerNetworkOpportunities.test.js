/**
 * Workstream G — Career Network: the shared Opportunity engine + view helpers.
 */
import test from "node:test";
import assert from "node:assert/strict";
import {
  NETWORK_ROLES, ENTRY_ROLES, emptyNetworkProfile, generateOpportunities,
  acceptOpportunity, dismissalOutcome, recordSliceResult, reputationStanding,
  opportunityInboxEvents,
} from "../js/career/network/careerOpportunities.js";
import {
  scoutProspectHtml, filmChallengeHtml, analyticsChallengeHtml, networkBoardHtml,
  DEMO_JOB_BOARD,
} from "../js/ui/networkViews.js";
import { scoutReportFor, prospectPool } from "../js/career/network/scoutCareer.js";
import { readFileSync } from "node:fs";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;

test("G network: entry roles are the four playable starts; agent and strength coach are listed future roles", () => {
  assert.deepEqual([...ENTRY_ROLES].sort(), ["analytics", "assistantCoach", "scout", "videoAnalyst"]);
  assert.equal(NETWORK_ROLES.agent.available, false);
  assert.equal(NETWORK_ROLES.strengthCoach.available, false);
  assert.equal(NETWORK_ROLES.headCoach.entry, false);
});

test("G network: a fresh scout is offered entry jobs but not head-coach or GM jobs", () => {
  const profile = emptyNetworkProfile({ role: "scout" });
  assert.equal(profile.reputation, 40);
  assert.equal(profile.unemployed, false);
  const { offers } = generateOpportunities(profile, DEMO_JOB_BOARD, { seed: 5 });
  const byRole = new Map(offers.map((o) => [o.role, o]));
  assert.equal(byRole.get("scout").eligible, true);
  assert.equal(byRole.get("videoAnalyst").eligible, true);
  assert.equal(byRole.get("headCoach").eligible, false);
  assert.ok(byRole.get("headCoach").missing.some((m) => m.startsWith("experience:")));
  assert.equal(byRole.get("gm").eligible, false);
  assert.ok(!offers.some((o) => o.role === "agent" || o.role === "strengthCoach"), "future roles are never offered");
});

test("G network: an experienced assistant with a strong reputation can reach head coach; an analyst can reach GM", () => {
  const coach = {
    ...emptyNetworkProfile({ role: "assistantCoach", team: "CHI" }),
    reputation: 80, experienceSeasons: 6,
    jobs: [{ role: "assistantCoach", team: "CHI", seasons: 6 }],
  };
  const { offers } = generateOpportunities(coach, DEMO_JOB_BOARD, { seed: 5 });
  const hc = offers.find((o) => o.role === "headCoach");
  assert.equal(hc.eligible, true);
  const analyst = {
    ...emptyNetworkProfile({ role: "analytics", team: "BOS" }),
    reputation: 78, experienceSeasons: 7,
    jobs: [{ role: "analytics", team: "BOS", seasons: 7 }],
  };
  const gm = generateOpportunities(analyst, DEMO_JOB_BOARD, { seed: 5 }).offers.find((o) => o.role === "gm");
  assert.equal(gm.eligible, true, "analytics is a feeder for GM — a network, not a ladder");
});

test("G network: accepting an offer keeps the old job in history and returns E's transition record", () => {
  const profile = { ...emptyNetworkProfile({ role: "scout", team: "LAL" }), reputation: 50, experienceSeasons: 2 };
  const { offers } = generateOpportunities(profile, DEMO_JOB_BOARD, { seed: 5 });
  const offer = offers.find((o) => o.role === "assistantCoach");
  const { profile: next, transition } = acceptOpportunity(profile, offer, { year: 1998 });
  assert.equal(next.currentRole, "assistantCoach");
  assert.equal(next.team, "CHI");
  assert.equal(next.jobs.length, 1);
  assert.equal(next.jobs[0].role, "scout");
  assert.deepEqual(transition, { from: "scout", fromTeam: "LAL", to: "assistantCoach", toTeam: "CHI", year: 1998, reason: "opportunity-accepted" });
});

test("G network: dismissal costs reputation and opens fallback offers — never a Game Over", () => {
  const profile = { ...emptyNetworkProfile({ role: "headCoach", team: "VAN" }), reputation: 65, experienceSeasons: 3 };
  const { profile: next, transition, noteZh } = dismissalOutcome(profile, { reason: "fired", year: 2001 });
  assert.equal(next.reputation, 53);
  assert.equal(next.unemployed, true);
  assert.equal(next.firedCount, 1);
  assert.equal(transition.reason, "fired");
  assert.ok(noteZh.includes("不是终点"));
  const { offers } = generateOpportunities(next, DEMO_JOB_BOARD, { seed: 5 });
  assert.ok(offers.some((o) => o.eligible), "a fired coach still gets lower-tier offers");
});

test("G network: slice results fold into the profile and move reputation a little", () => {
  let p = emptyNetworkProfile({ role: "videoAnalyst" });
  p = recordSliceResult(p, { kind: "film", correct: true });
  p = recordSliceResult(p, { kind: "film", correct: false });
  assert.equal(p.decisions.filmTotal, 2);
  assert.equal(p.decisions.filmCorrect, 1);
  assert.equal(p.reputation, 40, "one hit and one miss cancel out");
  assert.equal(reputationStanding(85).id, "renowned");
  assert.equal(reputationStanding(30).id, "unknown");
});

test("G network: inbox events carry eligible offers, and unemployment with no offers yields the waiting event", () => {
  const profile = emptyNetworkProfile({ role: "scout" });
  const { offers } = generateOpportunities(profile, DEMO_JOB_BOARD, { seed: 5 });
  const events = opportunityInboxEvents(profile, offers);
  assert.ok(events.some((e) => e.type === "career-opportunity" && e.role === "scout"));
  const stuck = { ...emptyNetworkProfile({ role: "headCoach" }), reputation: 5, unemployed: true };
  const none = opportunityInboxEvents(stuck, []);
  assert.equal(none.length, 1);
  assert.equal(none[0].type, "career-opportunity-none");
});

test("G network views: pure render helpers emit the interactive hooks the view binds", () => {
  const pool = prospectPool(ROWS, 1997);
  const kobe = pool.find((p) => p.row.bref === "bryanko01");
  const html = scoutProspectHtml({ report: scoutReportFor(kobe, ROWS, { seed: 8 }), lang: "zh" });
  assert.ok(html.includes("Kobe Bryant"));
  assert.ok(html.includes('data-scout-rec="1"'));
  const filmHtml = filmChallengeHtml({
    challenge: {
      gameLabel: "CHI vs UTA", finalScore: { home: 103, away: 87 },
      strip: [{ quarter: 4, clock: 120, side: "away", points: { home: 0, away: 2 }, shots: [] }],
      options: [
        { id: "opt-0", titleZh: "连续得分潮", summaryZh: "对方连续得分" },
        { id: "opt-1", titleZh: "失误大户", summaryZh: "对方失误多" },
        { id: "opt-2", titleZh: "末节崩盘", summaryZh: "对方末节崩盘" },
      ],
    },
    lang: "zh",
  });
  assert.ok((filmHtml.match(/data-film-opt/g) || []).length === 3);
  const analyticsHtml = analyticsChallengeHtml({
    challenge: {
      options: [
        { id: "opt-0", name: "A", pos: "PG", team: "CHI", ovr: 70, price: 90, stats: { ppg: 8, fg: 0.45, mpg: 20 } },
        { id: "opt-1", name: "B", pos: "SG", team: "UTA", ovr: 72, price: 95, stats: { ppg: 9, fg: 0.44, mpg: 22 } },
        { id: "opt-2", name: "C", pos: "SF", team: "LAL", ovr: 68, price: 80, stats: { ppg: 7, fg: 0.47, mpg: 18 } },
      ],
    },
    lang: "zh",
  });
  assert.ok((analyticsHtml.match(/data-analytics-opt/g) || []).length === 3);
  const board = networkBoardHtml({
    profile: emptyNetworkProfile({ role: "scout", team: "LAL" }),
    offers: generateOpportunities(emptyNetworkProfile({ role: "scout" }), DEMO_JOB_BOARD, { seed: 5 }).offers,
    unemployedNote: null, lang: "zh",
  });
  assert.ok(board.includes("球探"));
  assert.ok(board.includes("data-network-accept"));
});
