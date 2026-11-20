# Match presentation synchronization — audit and slices (2026-11-20, code-puppy-d8e9bb)

The 3D court, the text feed and the scoreboard do not follow one timeline. This is the audit (Phase 0), the measurements, and the
status of each slice. `scripts/measure/presentation-sync.mjs` reproduces every number below on the real engine and the real
`match3dController` with a fake clock; `tests/presentationSync.test.js` guards the fixes.

## What advances independently (all confirmed in code)

| # | Clock / defect | Where |
|---|---|---|
| 1 | GameSim resolves a **whole possession synchronously** and emits all its events in one burst, then waits `possessionDelay()`: 1x 1.1-3.6 s, 2x 300 ms, 3x 85 ms | `sim.js` `_loop`, `step`, `possessionDelay` |
| 2 | The **feed and the scoreboard paint the instant each event arrives** | `app.js` `handleSimEvent` -> `pushFeed`, `paintScore` |
| 3 | 3D buffers events, flushes at the next possession boundary, then plays them on its **own rAF clock and beat durations** (push alone is 2.6 s); behind, it compresses and drops whole plays | `match3dController.js`, `scheduler.js`, `court3d.js` |
| 4 | **Ordering bug.** The derived `POSSESSION_START` is fired from `onTick` *after* the possession, with the snapshot *after* it (possession already flipped) and the same clock as that possession's events. The normalizer sorted by clock and put every start *before* the possession it had just closed. The 3D court therefore drew the **next** team on offense while the previous team's shot played: the shooter stood on defense and shot at the wrong rim. | `normalizer.js` (fixed in S1a) |
| 5 | 3D "ball handler" is `handlerSlotIndex(lineup)`, the **PG slot by position**, not the real ball handler; passes never reach the 3D court (`matchView` has no pass beat, `court3d` has no `onPass`), so the ball never leaves the possession-start handler until the shot | `court3d.snapshotTo3DPositions`, `matchView.applyBeat` |
| 6 | GameSim events had **no identity**; the normalizer's `seq` was only a flush position | `sim.js` `emit` (fixed in S1a) |

## Measured (60 possessions, CHI vs SEA 1996, seed `sync-1`, same rig before and after)

| | 3D showed (of 42 shots) | shooter on offense in the 3D court | ball with the shooter | commentary ahead of 3D | scoreboard ahead |
|---|---|---|---|---|---|
| 1x before | 30 | **1/30** | 0/30 | 2 possessions (max 3) | up to 3 pts |
| 1x after S1a | 33 | **33/33** | 4/33 | 2 (max 3) | up to 3 pts |
| 2x before | 10 | **0/10** | 0/10 | 3 (max 5) | up to 5 pts |
| 2x after S1a | 11 | **11/11** | 2/11 | 3 (max 5) | up to 5 pts |
| 3x before | 5 | **0/5** | 0/5 | 7 (max 15) | up to 16 pts |
| 3x after S1a | 6 | **6/6** | 1/6 | 7 (max 15) | up to 16 pts |

"Before" is the same rig with the two S1a fixes switched off. At 2x/3x roughly 3 of 4 shots are never shown, and the commentary is
several possessions ahead: that is slice S3.

## Slices

- **S1a (done): identity and ordering.** `GameSim.emit` stamps a monotonic `seq` (continued across a save/reload, no RNG use, nothing
  emitted in a quiet game). The live normalizer orders by **arrival**, which is the causal order, and gives every event an `eventId`
  (`sim:<seq>`, derived events `drv:<after seq>:<kind>:<n>`); beats and `onShot` carry it. The controller drains *before* adding a
  possession start (it heads the next group). With the `seq` stripped, all 20 golden games hash identically to the old fixture, so
  results and the RNG sequence are unchanged; the fixture was re-recorded only because the event payload gained a field.
- **S2 (done): the ball follows the real holder.** `js/match/presentation/ballOwner.js` derives who has the ball from GameSim's own ids (pass: passer to receiver; shot/dunk: the shooter, nobody while it is in the air; rebound: the rebounder; steal: the thief; other turnovers: loose ball; a `coach` line carrying `meta.pass` is a repass and counts as a pass). The choreographer attaches the holder to each beat, `matchView` calls `setBallOwner` / `onPass` on the 3D court (a pass is an arc from passer to receiver, `PASS_FLIGHT_MS`), and the scheduler now reports skipped beats (`onSkip`) so a compressed pass still hands the ball over. Measured on the same rig: the ball was already with the shooter when his shot began for 30/32 shots at 1x (was 14/33), every drawn pass starts at an offensive player and ends at one, every possession opens with an offensive holder (38/38). The remaining misses are GameSim's own gap: after an offensive rebound the next action can belong to a different player with no pass event in between (the shot beat then snaps the ball to him; no pass is invented), and the very first possession of a broadcast has no opening beat. Browser trace: `node scripts/qa/match-3d-sync.mjs` (ball with a named player 74-95% of the time, changes hands 15-17 times in 30 s, pause freezes it).
- **S3 (done): one cursor.** `js/match/presentation/uiGate.js` + the controller: while the 3D court is up, the feed line, the scoreboard
  (score, clock, quarter, possession, the sounds keyed off them) are `defer`red under GameSim's own `seq` and released in order as the
  presentation cursor passes each beat (`onBeatApplied` fires for every played AND skipped beat). A live shot holds back only its own
  line and points until its beat ends (the ball has landed); everything earlier is already true. Plays dropped by compression release
  their text with the next beat that is shown; pause = no beats = frozen; leaving 3D, the match ending and fast simulation
  (`match3d.syncNow()`) show everything at once. Lineups, meters and the sub menus are controls and stay live; coach/system lines show
  their TEXT at once but never the score they carry. 2D mode is unchanged (`defer` runs now). The queue is bounded (120).
  Measured with `node scripts/measure/presentation-sync.mjs 60 sync-1` (real GameSim, real controller, fake clock):

  | | feed vs the shot's start (median) | feed before its shot | scoreboard ahead of the cursor | gate backlog peak / left over |
  |---|---|---|---|---|
  | 1x before | -3168 ms | 31/32 | 84,032 ms | - |
  | 1x with S3 | +1008 ms (= the ball landing) | 0/32 | 0 ms | 12 / 0 |
  | 2x before | -832 ms | 10/11 | 17,584 ms | - |
  | 2x with S3 | +512 ms | 0/11 | 0 ms | 29 / 0 |
  | 3x before | -576 ms | 5/6 | 6,832 ms | - |
  | 3x with S3 | +336 ms | 0/6 | 0 ms | 57 / 0 |

  In a real browser (`node scripts/qa/match-3d-sync.mjs <out> <url> 60 <speed> [desktop|mobile]`, GameSim.emit wrapped to log the
  authoritative total): every made shot the court drew had NOT yet been counted by the scoreboard when it started, and the board caught
  up ~1.0 s later (1x desktop 7/7 at 1047 ms, mobile 7/7 at 1031 ms; 3x desktop 4/4), each with a feed line in the same window; pause
  froze ball holder, score, clock and feed; switching to 2D kept every line. The 3D court still trails GameSim by a few seconds at 1x
  (median 3.3 s, never growing): the presentation plays a possession slower than GameSim resolves one, so the scheduler compresses
  or drops (10/42 shots at 1x never shown). That is the existing "compress, never queue" rule, not a sync error: whatever is shown,
  the text, score and ball agree. Open (S2 remainder): 2/32 shots follow an offensive rebound with no pass event; the court
  gives the shooter the ball, it does not invent a pass.
- **S4: camera and labels.** After S2/S3.

## Not changed

GameSim outcomes, its random-number consumption and the 2D court. The feed and scoreboard still paint immediately until S3.

## S4 — broadcast readability (presentation only)

- `js/engine/broadcast/labelLayout.js`: full plate for the ball handler/shooter (never hidden/moved), compact plates for the rest, screen-space overlap placement (nudge up, else hide), min-pixel boost.
- `js/engine/broadcast/ballAids.js` + `court3d.js`: enlarged ball resting on the floor, focus ring, floor shadow, shot path from the same `_shotPoint()` as the ball, glide on an unobserved handover (no invented pass).
- Camera framing closer than whole-court fit, eased toward the ball, bounded by `PAN_LIMIT_M`.
- Evidence: `node scripts/qa/match-3d-readability.mjs` — desktop 207 frames, mobile 305 frames: 0 overlapping plates, exactly one full plate whenever someone has the ball, camera 15.3 m vs fit 19.1 m (desktop), shot path + rim ring visible. A first mobile run found 6/304 one-pixel overlaps (perspective error of the px->metre nudge); fixed with a 7 px gap.
- Not measured: real-phone FPS.
