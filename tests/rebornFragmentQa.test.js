/**
 * Career 2.0 decision 4 — QA handoff (Code's board entry, 2026-11-19).
 * The VM-testable half of the handoff; the browser half (the QA script's
 * desktop + 390px run) still needs a Mac. What was already covered by the
 * ship tests is NOT re-tested here: specialisation stopping next week,
 * rollover clearing last season's weekly buys, the unrevealed blocker on a
 * hand-forced identity, the fragments panel in English, and an old save's
 * empty ledger (tests/rebornFragmentSpend.test.js, tests/rebornFragments.test.js).
 *
 * The games below run on the engine's own deterministic stream
 * (seed|year|index, the same determinism the one-game test relies on) —
 * no fragment is ever hand-fed: every fragment in the ledger came out of
 * a real game's report.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  LEGACY_COST,
  buyIntensive,
  buyLegacyJersey,
  buyUnlock,
  fragmentLedger,
  intensiveBlocker,
  INTENSIVE_COST,
  legacyBlocker,
  specializableSkills,
  specializeBlocker,
  unlockBlocker,
} from "../js/reborn/fragments.js";
import {
  REVEAL_TRUST,
  REBORN_TEAM_IDS,
  buildPlayerCard,
  createRebornState,
  identityCard,
  maybeReveal,
} from "../js/reborn/identity.js";
import { buildSeason, playGame } from "../js/reborn/season.js";
import { chooseFocus } from "../js/reborn/training.js";
import { rolloverSeason } from "../js/reborn/contract.js";
import { runUnlockIds } from "../js/collectibles/legacyCosmetics.js";
import { jerseyState } from "../js/collectibles/jerseyExchange.js";
import { listOwnedJerseys, mirrorJerseysToAccount } from "../js/collectibles/jerseyCollection.js";
import { jerseyCollectionHtml } from "../js/ui/collectibles/jerseyCollectionView.js";
import { legacyUnlocksHtml } from "../js/ui/collectibles/legacyUnlocksView.js";
import { mirrorUnlocksToAccount, ownedUnlocks } from "../js/collectibles/legacyCosmetics.js";

const ROWS = JSON.parse(readFileSync(new URL("../js/data/roster.json", import.meta.url), "utf8")).players;
const withFragments = (reborn, balance) => ({ ...reborn, player: { ...reborn.player, fragments: { balance, history: [] } } });
const revealed = (reborn) => ({ ...reborn, identity: { ...reborn.identity, kind: "historical", revealed: true } });
const CARD = { skills: ["rainmaker", "glass_cleaner", "clutch_killer"] };
const xpOf = (out) => (out.report.growth || []).reduce((n, e) => n + (e.xp || 0), 0);

test("QA handoff: earn-then-spend over a real multi-week run (no rigged earnings)", async () => {
  // qa-multi-1 draws a historical bench player who really plays at trust 80
  // and stands out at least 3 times in 8 weeks — pinned by probe (re-pick the seed if a GameSim change breaks that).
  // Re-picked 2026-11-24 after the B35 §30/§31 engine recalibration (qa-multi-5, Adrian Lewis, now earns 2);
  // the §27 re-pick before it was qa-multi-5 after qa-multi-1 (Priest Lauderdale) dropped to 2 under the blue-collar widening.
  const start = createRebornState("qa-multi-1", ROWS);
  start.player.coachTrust = 80; // a starter really plays (same set-up as the one-game test)
  let reborn = chooseFocus(start, "shooting", 1);
  const teamId = reborn.player.teamId;
  const opps = REBORN_TEAM_IDS.filter((t) => t !== teamId);
  const games = Array.from({ length: 40 }, (_, i) => ({
    homeId: i % 2 === 0 ? teamId : opps[i % opps.length],
    awayId: i % 2 === 0 ? opps[i % opps.length] : teamId,
    day: i + 1,
    played: false,
  }));
  const season = buildSeason(reborn, ROWS, { games });
  // A fresh real card carries no skills, so nothing can be specialised
  // until a skill awakens through real games — the gate is honest here.
  const card = buildPlayerCard(reborn.identity, ROWS, { season: 1997 });
  assert.deepEqual(specializableSkills(card), []);
  assert.equal(specializeBlocker(reborn, 1, card, "rainmaker"), "not-owned");

  // Weeks 1-8: earn only, no spending. Every fragment must come from a game report.
  let earned = 0;
  const paidGameIds = new Set();
  for (let i = 0; i < 32; i++) {
    const out = await playGame(reborn, season, ROWS, {});
    assert.ok(out, `game ${i + 1} played`);
    reborn = out.reborn;
    earned += out.report.fragments.earned;
    assert.equal(out.report.specialty, null, "no specialisation was bought, so no game specialises");
    if (out.report.fragments.earned > 0) {
      assert.ok(!paidGameIds.has(out.report.gameId), "a gameId never pays twice");
      paidGameIds.add(out.report.gameId);
    }
  }
  assert.ok(earned >= 3, `at least 3 standouts in 8 weeks, enough to buy something below (the exact count is whatever this seed's real games pay: ${earned})`);
  assert.equal(fragmentLedger(reborn).balance, earned, "the ledger holds exactly what the real games paid");
  assert.equal(fragmentLedger(reborn).history.length, paidGameIds.size, "one history entry per paying game");

  // Week 9: fork the same state — spend the earned balance on intensive
  // in one branch, not the other — and play the same 4 games in both.
  const forkA = { ...season, games: season.games };
  const forkB = { ...season, games: season.games };
  const balanceBefore = fragmentLedger(reborn).balance; // whatever weeks 1-8 really paid
  const spentA = buyIntensive(chooseFocus(reborn, "shooting", 9), 9);
  const plainB = chooseFocus(reborn, "shooting", 9);
  let curA = spentA;
  let curB = plainB;
  let xpA = 0;
  let xpB = 0;
  let earnedA = 0;
  let earnedB = 0;
  for (let i = 0; i < 4; i++) {
    const a = await playGame(curA, forkA, ROWS, {});
    const b = await playGame(curB, forkB, ROWS, {});
    curA = a.reborn;
    curB = b.reborn;
    assert.equal(a.report.intensive, true, "week 9 was bought: intensive applies to the whole week");
    assert.equal(b.report.intensive, false);
    if (i === 0) {
      assert.equal(a.report.line.min, b.report.line.min, "same seed, same game: only the training differs");
      assert.ok(
        Math.abs(xpOf(a) - xpOf(b) * 1.5) <= 1,
        `first week-9 game: ${xpOf(a)} vs ${xpOf(b)} x1.5`,
      );
    }
    xpA += xpOf(a);
    xpB += xpOf(b);
    earnedA += a.report.fragments.earned;
    earnedB += b.report.fragments.earned;
  }
  assert.ok(xpB > 0, "week 9 earns training XP, so the multiplier is really checked");
  assert.ok(Math.abs(xpA - xpB * 1.5) <= 4, `week 9: ${xpA} vs ${xpB} x1.5 over 4 games`);
  assert.equal(earnedA, earnedB, "the same games pay the same fragments in both branches");
  assert.equal(fragmentLedger(curA).balance, balanceBefore - INTENSIVE_COST + earnedA, "earned so far, minus the intensive price, plus week-9 earnings");
  assert.equal(fragmentLedger(curB).balance, balanceBefore + earnedB, "the unspent branch keeps everything it earned");
});

test("QA handoff: two seasons, two legacy jerseys", () => {
  const known = revealed(withFragments(createRebornState("legacy-2y", ROWS), LEGACY_COST + 1));
  const first = buyLegacyJersey(known, 1997, { week: 6 });
  assert.equal(first.jersey.id, `legacy:${known.identity.bref}:1997`);
  assert.equal(fragmentLedger(first.reborn).balance, 1);
  const next = rolloverSeason(first.reborn, { year: 1997 }).reborn;
  assert.equal(next.player.seasonYear, 1998);
  assert.equal(fragmentLedger(next).balance, 1, "the balance carries into the new season");
  assert.equal(
    jerseyState(next).collection.filter((j) => j.source === "legacy").length,
    1,
    "the rollover does not wipe the run's jerseys",
  );
  assert.equal(legacyBlocker(next, 1998), "short", "one per season, but the new season still costs 10");
  const funded = withFragments(next, LEGACY_COST);
  const second = buyLegacyJersey(funded, 1998, { week: 2 });
  assert.equal(second.jersey.id, `legacy:${known.identity.bref}:1998`);
  assert.equal(jerseyState(second.reborn).collection.filter((j) => j.source === "legacy").length, 2);
  assert.equal(legacyBlocker(second.reborn, 1998), "already");
  assert.equal(legacyBlocker(second.reborn, 1997), "already", "last season's jersey stays bought");
});

test("QA handoff: guest — no account, the jersey stays in the run", () => {
  const known = revealed(withFragments(createRebornState("legacy-guest", ROWS), LEGACY_COST));
  const { reborn, jersey } = buyLegacyJersey(known, 1997);
  // No account object exists anywhere in this flow: the buy only touches the run.
  assert.equal(jerseyState(reborn).collection.length, 1);
  assert.equal(jerseyState(reborn).collection[0].id, jersey.id);
  assert.equal(mirrorJerseysToAccount(null, jerseyState(reborn)), 0, "mirroring without an account is a no-op, not a crash");
  assert.equal(jerseyState(reborn).collection.length, 1, "and the run still holds it");
  const reloaded = structuredClone(reborn); // a save/load round-trip keeps it
  assert.equal(jerseyState(reloaded).collection[0].id, jersey.id);
  const account = { shop: { owned: {}, equippedJersey: null } };
  assert.equal(mirrorJerseysToAccount(account, jerseyState(reloaded)), 1, "a later account gets it once");
  assert.equal(mirrorJerseysToAccount(account, jerseyState(reloaded)), 0, "and only once");
  assert.equal(listOwnedJerseys(account).length, 1);
});

test("QA handoff: a genuinely drawn identity starts unrevealed and blocks the legacy jersey until the reveal", () => {
  // qa-multi-1 draws historical (laudepr01) — no hand-forced shape.
  const drawn = createRebornState("qa-multi-1", ROWS);
  assert.equal(drawn.identity.kind, "historical");
  assert.equal(drawn.identity.revealed, false, "a drawn historical identity starts unrevealed");
  assert.equal(identityCard(drawn.identity).name, "无名训练营球员", "the card hides the name");
  assert.equal(legacyBlocker(drawn, 1997), "unrevealed");
  assert.throws(() => buyLegacyJersey(drawn, 1997), /unrevealed/);
  const shown = { ...drawn, identity: maybeReveal(drawn.identity, REVEAL_TRUST) };
  assert.equal(shown.identity.revealed, true);
  assert.equal(identityCard(shown.identity).name, drawn.identity.name, "the real name shows after the reveal");
  assert.equal(legacyBlocker(shown, 1997), "short", "revealed, but the run has no fragments yet");
});

test("QA handoff: English mode — the jersey collection and the honours list", () => {
  const known = revealed(withFragments(createRebornState("legacy-en", ROWS), LEGACY_COST));
  const { reborn } = buyLegacyJersey(known, 1997);
  const account = { shop: { owned: {}, equippedJersey: null } };
  mirrorJerseysToAccount(account, jerseyState(reborn));
  const owned = listOwnedJerseys(account);
  const html = jerseyCollectionHtml({ list: owned, equipped: null }, "en");
  assert.match(html, /Legacy/);
  assert.match(html, /legacy jersey/);
  assert.doesNotMatch(html, /[\u4e00-\u9fff]/, "English mode has no Chinese left");
  const acc2 = { shop: {} };
  mirrorUnlocksToAccount(acc2, ["title:reborn", "frame:reborn"]);
  const honours = legacyUnlocksHtml(ownedUnlocks(acc2, null), "en");
  assert.match(honours, /data-unlock="title:reborn"/);
  assert.doesNotMatch(honours, /[\u4e00-\u9fff]/, "English mode has no Chinese left");
});

test("QA handoff: an old save without the new fields plays the whole decision-4 surface", () => {
  // A save from before decision 4 has no fragments ledger, no unlocks,
  // no weekly purchase fields — strip them explicitly so this stays an
  // old-save test even if the creator later gains the fields.
  const old = createRebornState("frag-old-2", ROWS);
  delete old.player.fragments;
  delete old.player.unlocks;
  delete old.player.training;
  assert.deepEqual(fragmentLedger(old), { balance: 0, intensiveWeek: null, specialWeek: null, specialSkill: null, history: [] });
  assert.deepEqual(runUnlockIds(old), []);
  assert.equal(unlockBlocker(old, "title:reborn"), "short", "evidence-free title, but no fragments");
  assert.equal(intensiveBlocker(old, 1), "no-focus");
  assert.equal(specializeBlocker(old, 1, CARD, "rainmaker"), "no-focus");
  const funded = withFragments(old, 4);
  assert.equal(unlockBlocker(funded, "title:reborn"), null);
  const bought = buyUnlock(funded, "title:reborn", 1997);
  assert.deepEqual(runUnlockIds(bought), ["title:reborn"]);
  assert.equal(fragmentLedger(bought).balance, 0);
});
