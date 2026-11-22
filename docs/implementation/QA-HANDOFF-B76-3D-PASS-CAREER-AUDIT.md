# QA handoff: B76 shot gate + 3D assist pass, and the Career 2.0 audit

Author: Code Puppy, 2026-11-22. Commits on `origin/main`: `32c53f0` (B76 `shotGateLevel`), `7fd1d37` (assist pass in the event stream),
`8c41e54` (backlog record of the tried-and-rejected organizer cap).

Everything here is for **Muse**. Nothing below needs new code; if one of these fails, file it, do not tune a test to pass.

## 1. What changed (so you know what to look for)

| Change | Where | Effect players can see |
|---|---|---|
| `shotGateLevel` | `js/engine/gameplan.js`, `sim.js` | Pass-first guards with a real shot history (Draymond/Ainge-type) are no longer starved of shots on the *recommended* orders. Pass-first itself is unchanged. |
| Team totals re-fitted | `sim.js` (`FOUL_RATE_SCALE`, `THREE_SHARE_SHIFT`, `ZONE_STACK_OFFSET`) | Same league feel: 103.5 pts vs 103.6 real, 3PM 6.8 vs 6.9, FTM 18.1 vs 18.8. |
| Assist pass | `sim.js` (`kind: "assist"`) | In 3D, an assisted basket now has a pass from the assister into the scorer before the shot. |

**Not shipped (do not test for it):** the `kickChance` cap for organizers. It would fix `organize` under-shooting (Draymond 0.18x, Snow 0.28x,
Parker 0.52x, Poole 0.46x) but lowers Reborn "standout" games (fragment source): of 8 fixed seeds, 3 reach 3 standouts without the cap, 1 with it.
Those four stay under-shooting on purpose until the fragment economy question is decided. See `docs/BACKLOG.md` B76.

## 2. B76 checks

1. **Manual orders unchanged.** In a Gold/Career setup, set a low-aggression guard's orders by hand (any value). His shot count over a few games
   must look like before: the gate only applies to *recommended* orders (`ordersManual` is false).
2. **Recommended orders on a real shooter.** Start a game as a team with a pass-first guard who has a real shot history (e.g. 1986 Celtics,
   Dennis Johnson / Ainge). On recommended orders he should take a normal number of shots (a few per game, not zero).
3. **True non-shooter keeps passing.** A player with almost no shot history on a recommended low order still passes first.
4. **Old saves.** Load a save from before `32c53f0` mid-game and at a season boundary; no console errors, orders still show the same text.
5. **Season drift.** One full simulated season (My Team season or Reborn 82 games): league PPG should land near 103-106 in the 2000s,
   FG% 46-48, 3P% 35-37. Flag anything outside, with the era and the standings page.
6. **Online/duel.** `speedLocked` games (both sides human) are unaffected; one quick duel to confirm.

Reproducible numbers if you want to compare: `node scripts/measure/orders-usage-pairing.mjs 40 8` (shots per 36 vs real, by order group; expect
`ALL` about 0.98x, `defend/low` about 0.96x) and `node scripts/measure/gamesim-calibration.mjs 30`.

## 3. 3D assist-pass checks (browser)

Run in a real browser, desktop 1440 and a phone viewport (390). Use Gold or a quick game, 3D on.

1. At 1x, watch ~10 made baskets. For most assisted ones, the ball should travel from a teammate to the scorer before the shot (it used to appear in
   the scorer's hands for about half of them).
2. Feed text and the scoreboard still wait for the ball to land (S3 gate). The assist pass must not make the score appear early.
3. Pause during an assist pass: ball, score, clock and feed all freeze. Resume continues the same pass.
4. Switch 2D to 3D to 2D mid-possession: nothing duplicates, feed lines are kept.
5. 3x speed: no growing backlog, no frozen ball.
6. Dunks: the pass comes before the dunk animation, not after it.

**Known limits (not regressions):**
- `c8a5c27` also tightened the 1x beats (`possession_start` 1400 to 700 ms, `pass` 500 to 380 ms): at 1x about 85% of shots are drawn (was 74%) and
  about 0.6 passes per shown shot (was 0.3). Expect noticeably more passing on screen at 1x than before; that is intended. Check that the court
  still looks natural (players are not yanked mid-step at a possession change) on desktop and a phone. About 15% of shots are still not drawn at 1x.
- Some shots after an offensive rebound still have no pass (the court never invents one).
- A kick-out already puts the ball in the scorer's hands that possession, so no second pass is added for those baskets.

Stream-level evidence (`node scripts/measure/pass-coverage.mjs 16`): pass events 82.3 to 113.2 per game; made baskets with a pass into the scorer
in front of them 40% to 78%.

## 4. Career 2.0 audit (current main vs the final rulings)

Read-only audit. **No genuine gap found; nothing implemented.**

| Ruling | State on main | Evidence |
|---|---|---|
| One Promise Engine, many sources | Done (`742c6ff`, `8ab8bdb`, `c63f0d1`) | Settlement goes through `settleGamePromises` / `settleCoachingPromises` only (careerTimeline, reborn/promiseSettle, relationshipsView incl. the development panel, coaching). No direct `kept`/`broken` writes outside `promiseEngine.js`. |
| Rivalry: auto, story, challenge | Done | `formRival(..., "story" / "auto" / "challenge")` in `reborn/rivalry.js`; `challengeRival` only for someone really faced in the last report; `recordRivalryGame` is called with the real `gameId`. |
| Evidence-driven season epiphany | Done | `career/seasonEpiphany.js`: candidates from form + training plan, idempotent by `gameKey`, no `EPIPHANY_CHANCE`. The roll takes an injectable `rng`; the Gold call site in `app.js` uses the `Math.random` default (idempotent per game, testable through the parameter; not a gap). |
| Fragments: bounded growth, specialization, cosmetics/legacy | Done | `reborn/fragments.js`: intensive training (x1.5 XP), specialization (cost 2), legacy jersey (10), honours unlocks; separate Reborn ledger; no shop, no gold purchase, no My Team OVR path. |

Left as decided: `rivalryStakes` has no caller (Reborn pre-game already shows the real ledger); kept, not deleted.

**Career scenarios still not covered by any test or QA pass (Muse):**
1. Refresh while the takeover dialog is open (Reborn): the same prompt must come back once, no duplicate event.
2. A promise made in one season and settled in the next, across a playoff run: settles once, with the playoff games counted only if the promise says so.
3. A story-clutch rivalry formed through natural play (needs: takeover attempted, final margin <= 3, at least 2 meetings; about 2% of games): use
   `node scripts/qa/clutch-funnel.mjs 2` to find a seed, then play it in the browser. The funnel script is a measurement tool; thresholds were not changed.
