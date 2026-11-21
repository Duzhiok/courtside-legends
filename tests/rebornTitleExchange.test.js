// Player Reborn Playoffs v1, P4: a title is real evidence for the Jersey Exchange (and only real evidence), and the offseason carries on from it.
import test from "node:test";
import assert from "node:assert/strict";
import { advanceLeague } from "../js/reborn/league.js";
import { nextUserGame } from "../js/reborn/playoffs.js";
import { enterPlayoffs, playPlayoffGame } from "../js/reborn/playoffFlow.js";
import { rivalryLedger, recordRivalryMeetings } from "../js/reborn/rivalry.js";
import { acceptJerseyExchange, expireOffers, jerseyState, offersForGame } from "../js/collectibles/jerseyExchange.js";
import { EXCHANGE_RULES, evaluateExchangeCandidate, gameEvidenceFromReport, respectFromRival } from "../js/collectibles/jerseyEligibility.js";
import { rolloverSeason, settleContract } from "../js/reborn/contract.js";
import { buildSeason } from "../js/reborn/season.js";
import { rosterCards } from "../js/reborn/rosters.js";
import { ROWS, coin, fakeUserLog, run, userAlways } from "./helpers/rebornLeagueFixtures.js";

/**
 * A real GameSim playoff run (1997, the player's club first, trust 80) played to its end. Returns the state just before the title game, the title
 * game's real report and the final state. "tx-62" is a fixed seed whose run wins the title with the player on court and yields exactly one keepsake offer; "tx-119" wins it without a
 * minute for him. Re-pick after any GameSim recalibration (the assertions are the design, the seed is not):
 * `node scripts/measure/find-playoff-seeds.mjs tx 1 240 8`.
 */
async function realTitleRun(seed) {
  let reborn = run(seed, 1997);
  reborn.player.coachTrust = 80;
  fakeUserLog(reborn, 1997, userAlways(reborn, true));
  advanceLeague(reborn, ROWS, { year: 1997, simulate: coin });
  reborn = await enterPlayoffs(reborn, ROWS, { year: 1997 });
  let before = null, report = null;
  for (;;) {
    const next = nextUserGame(reborn.playoffs);
    if (!next) break;
    const snapshot = reborn;
    const out = await playPlayoffGame(reborn, ROWS, {});
    reborn = out.reborn;
    if (out.report.isChampionship) { before = snapshot; report = out.report; }
  }
  return { before, report, reborn };
}

/** A rival the run already has: a man from the Finals opponent who really played in the title game, with three earlier meetings behind him. */
function withRival(state, report) {
  const opp = [...report.opponents].filter((o) => o.bref && o.min > 0).sort((a, b) => b.min - a.min)[0];
  const next = structuredClone(state);
  const ledger = rivalryLedger(next);
  const meeting = (n) => ({ gameId: `earlier-${n}`, year: 1997, game: n, won: n === 2, margin: 15, you: { pts: 6, gs: 6 }, rival: { pts: 12, gs: 11 } });
  ledger.rivals.push({ bref: opp.bref, name: opp.name, nameEn: opp.nameEn || opp.name, pos: opp.pos, team: opp.team || null, origin: "auto", reason: "repeated", since: { year: 1997, game: 1, gameId: "earlier-1" }, games: [1, 2, 3].map(meeting) });
  next.rivalries = ledger;
  return { state: next, opp };
}

test("the title game's real report carries the evidence a championship keepsake needs: settled, a title, a win, only men who really played", { timeout: 120000 }, async () => {
  const { before, report, reborn } = await realTitleRun("tx-62");
  assert.equal(reborn.playoffs.status, "champion");
  assert.ok(report && before, "the run has a title game");
  const finals = reborn.playoffs.series.find((s) => s.id === "F");
  const oppId = finals.high === reborn.player.teamId ? finals.low : finals.high;
  const ev = gameEvidenceFromReport(report, rivalryLedger(before));
  assert.equal(ev.settled, true, "he was on court (9 minutes)");
  assert.equal(ev.isChampionship, true);
  assert.equal(ev.won, true);
  assert.equal(ev.id, report.gameId);
  assert.equal(ev.year, 1997);
  assert.ok(ev.participants.length >= 5);
  const roster = new Set(rosterCards(ROWS, oppId, 1997).map((c) => c.bref));
  assert.ok(ev.participants.every((b) => roster.has(b)), "every participant is on the Finals opponent's real roster");
  assert.equal(report.opponents.filter((o) => o.bref && o.min > 0).length, ev.participants.length);
});

test("the title is what unlocks the keepsake: the same real game, a man he has met three times: offered with the title, nothing without it", { timeout: 120000 }, async () => {
  const { before, report } = await realTitleRun("tx-62");
  const { state, opp } = withRival(before, report);
  const ledger0 = rivalryLedger(state);
  const respect = respectFromRival(ledger0.rivals[0]);
  assert.ok(respect >= EXCHANGE_RULES.RESPECT_FLOOR && respect < EXCHANGE_RULES.MIN_RESPECT, `respect ${respect}: enough to be asked, not enough on its own`);

  const asOf = (rep) => { const rivalry = recordRivalryMeetings(ledger0, rep); return offersForGame(jerseyState(state), { report: rep, ledger: rivalry.ledger, rivalry }); };
  const withTitle = asOf(report);
  assert.equal(withTitle.created.length, 1);
  const offer = withTitle.created[0];
  assert.equal(offer.fromBref, opp.bref);
  assert.ok(offer.reasons.includes("CHAMPIONSHIP"));
  assert.equal(offer.gameId, report.gameId, "the offer names the game it comes from");
  assert.equal(offer.evidence.year, 1997);
  assert.equal(offer.evidence.won, true);
  assert.equal(offer.evidence.settled, true);
  assert.ok(offer.evidence.meetings >= 4, "the three before and the title game");

  const withoutTitle = asOf({ ...report, isChampionship: false });
  assert.equal(withoutTitle.created.length, 0, "a regular win over the same man at the same respect offers nothing");
  assert.equal(evaluateExchangeCandidate({ opponent: ledger0.rivals[0], game: { ...gameEvidenceFromReport(report, ledger0), isChampionship: false }, respect, meetings: 4 }).reason, "LOW_RESPECT");

  // accepting it: the jersey carries its provenance (game, player, season, result, reason)
  const accepted = acceptJerseyExchange(withTitle.state, offer.id);
  assert.equal(accepted.ok, true);
  const p = accepted.jersey.provenance;
  assert.equal(p.gameId, report.gameId);
  assert.equal(p.fromBref, opp.bref);
  assert.equal(p.year, 1997);
  assert.equal(p.won, true);
  assert.ok(p.reasons.includes("CHAMPIONSHIP"));
  assert.equal(acceptJerseyExchange(accepted.state, offer.id).duplicate, true, "accepting twice is a no-op");
});

test("no title evidence, no championship keepsake: not on court, not a participant, a lost game, or just not flagged", { timeout: 120000 }, async () => {
  const { before, report } = await realTitleRun("tx-62");
  const { state } = withRival(before, report);
  const ledger0 = rivalryLedger(state);
  const offeredBrefs = (rep) => {
    const rivalry = recordRivalryMeetings(ledger0, rep);
    return offersForGame(jerseyState(state), { report: rep, ledger: rivalry.ledger, rivalry }).created.map((o) => o.fromBref);
  };
  assert.equal(offeredBrefs(report).length, 1, "the control: the real report does offer");
  const man = offeredBrefs(report)[0];
  assert.equal(offeredBrefs({ ...report, line: { ...report.line, min: 0 } }).length, 0, "he never got on court: an unsettled game");
  assert.equal(offeredBrefs({ ...report, opponents: report.opponents.filter((o) => o.bref !== man) }).includes(man), false, "the man did not play in it");
  assert.equal(offeredBrefs({ ...report, opponents: report.opponents.map((o) => (o.bref === man ? { ...o, min: 0 } : o)) }).includes(man), false, "he was on the roster but did not play");
  assert.equal(offeredBrefs({ ...report, gameId: null }).length, 0, "no game id, no evidence");
  const ledgerless = offersForGame(jerseyState(before), { report, ledger: rivalryLedger(before), rivalry: recordRivalryMeetings(rivalryLedger(before), report) });
  assert.equal(ledgerless.created.length, 0, "and a man the run never met is never invented: with the real ledger, this title game offers nothing");
});

test("a title won without playing a minute offers nothing (real run, seed tx-119): the keepsake is for men he really shared the floor with", { timeout: 120000 }, async () => {
  const { before, report, reborn } = await realTitleRun("tx-119");
  assert.equal(reborn.playoffs.status, "champion");
  assert.equal(report.line.min, 0);
  assert.equal(report.isChampionship, true, "it is still the title game");
  assert.equal(gameEvidenceFromReport(report, rivalryLedger(before)).settled, false);
  assert.ok(!jerseyState(reborn).offers.some((o) => o.gameId === report.gameId), "no offer from that game");
});

test("the offseason carries on from a title: contract, rollover, the next season starts clean; the honour, the jersey and the history stay", { timeout: 120000 }, async () => {
  const { before, report, reborn } = await realTitleRun("tx-62");
  const { state } = withRival(before, report);
  // the title game's offer, as the player would have got it, then the season ends
  const rivalry = recordRivalryMeetings(rivalryLedger(state), report);
  const offered = offersForGame(jerseyState(state), { report, ledger: rivalry.ledger, rivalry }).state;
  const accepted = acceptJerseyExchange(offered, offered.offers[0].id).state;
  const final = structuredClone(reborn);
  final.rivalries = rivalry.ledger;
  final.jerseys = accepted;
  assert.equal(final.playoffs.status, "champion");
  const settled = settleContract(final, { year: 1997 });
  assert.ok(["resign", "minimum", "cut"].includes(settled.outcome.type));
  assert.equal(settled.outcome.games, 82, "the contract is judged on the 82 games, not on the playoffs");
  const rolled = rolloverSeason(settled.reborn, { year: 1997, players: ROWS });
  assert.equal(rolled.year, 1998);
  assert.equal(rolled.reborn.player.seasonYear, 1998);
  assert.equal(rolled.reborn.playoffs, undefined);
  assert.equal(rolled.reborn.league, undefined);
  assert.equal(rolled.reborn.honors.length, 1);
  assert.equal(rolled.reborn.honors[0].id, "champion:1997");
  assert.equal(rolled.reborn.seasonHistory[1997].playoffs.outcome, "champion");
  assert.equal(jerseyState(rolled.reborn).collection.length, 1, "the kept jersey stays");
  const next = buildSeason(rolled.reborn, ROWS);
  assert.equal(next.year, 1998);
  assert.equal(next.index, 0);
  assert.equal(rolled.reborn.player.seasonLog.filter((e) => e.year === 1998).length, 0);
  // a keepsake still open when the season ends lapses in the new one
  const lapsed = expireOffers(jerseyState({ jerseys: offered }), 1998);
  assert.ok(lapsed.offers.every((o) => o.status !== "pending"));
});
