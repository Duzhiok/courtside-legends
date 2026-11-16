# Unified 3D Match Viewer — Phase 0 audit (read-only)

Base: `origin/main` `fd51b82` (2026-11-15). No production code changed. Measurements: headless Chromium + SwiftShader
(draw/triangle counts are reliable; **FPS was not measured** — SwiftShader FPS means nothing for mobile GPUs).

## 1. What exists today

| Piece | File | Fact |
|---|---|---|
| 3D court | `js/engine/court3d.js` (936 lines) | `CourtView3D`, **clutch replay of ONE possession only**. Entry: clutch result page `#btn-clutch-3d-replay` → `#screen-clutch-3d`. No other screen uses it. Capsule bodies + sphere heads + stub arms, name-plate sprites. |
| 2D live court | `js/engine/court.js` (1002 lines) | `CourtView`: DOM tokens. The **only** court used in live matches. `render(snap)`, `onShot`, `onDunk`, `onPass`, `skillPop`. |
| Live match wiring | `js/app.js:7649` `new GameSim`, `handleSimEvent` (:7708), `onTick` → `state.court.render(snap)` | One live path: Gold Challenge, Ranked, Season, Playoffs all go through it. |
| 3v3 | `js/modes/halfCourt3v3.js`, `js/ui/halfCourtView.js` | Real GameSim, **whole game decided up front**, then replayed in a 2D SVG half court. Own view. |
| Legend duel | `js/ui/duelCourtView.js` | Separate 2D sprite view. |
| Reborn | `js/reborn/season.js:219` | Batch `GameSim`, no viewer. |
| Avatars | `js/ui/avatar3d.js`, `assets/avatar3d/*.glb` | Character viewer (My World / creator), not a match renderer. |
| Plan | `docs/3D_BROADCAST_PLAN.md` | Stages 0–3 were implemented as the clutch prototype; Stage 4 (2D/3D toggle) and full-game 3D were never built. Its rules in §6 (interruptible, compressible, never queue) still hold. |

## 2. Does 3D replay real GameSim events or simulate on its own?
It **replays**. It reads the settled `meta.clutchOutcome` + a retained snapshot and does not re-roll (header of `court3d.js`;
tests `court3dReplay.test.js`, `courtRenderReadOnly.test.js`). That principle is already in place and must stay.

**But positions are not from GameSim.** GameSim has no spatial state. Both 2D and 3D place players from per-tactic formation
templates (`SETS`, `DEF_GAP` in `court.js`) plus a small sinusoidal drift, and draw arcs between template spots. So "movement"
is a presentation invention. That is fine for a broadcast view as long as outcomes stay authoritative, but it means a
choreography layer is needed, not just a renderer.

## 3. Event contract (what the viewer can be fed today)

From `sim.js` (87 `emit` calls):

| Event | Meta available |
|---|---|
| `score` / `miss` | `shot {shooterId, made, pts}` (jump shots only), `skill` |
| `dunk` | `player {id,…}` |
| `pass` | `pass {passerId, receiverId, kind: handoff\|kick}` |
| `miss` (foul/turnover) | `foul {foulerId, victimId, kind: shooting\|and_one\|…}`, `turnover {actorId, kind: steal\|forced\|unforced, forcedById}` |
| `score`/`miss` (FT) | `ft {shooterId, made, pts}` |
| `reb` | `reb {rebounderId, offensive}` |
| block (a `miss`) | `block {blockedName, side}`, `actorId` = blocker. **Name, not id.** |
| `coach` (sub) | `sub {inId, outId, side}` |
| snapshot | spread into every event: quarter, clock, score, possession, both on-court lineups, tactic, defensePlan, paused, auto flags |
| derived | `js/engine/domainEvents.js` already derives POSSESSION_START / SUBSTITUTION / PERIOD_* / MATCH_END from tick diffs |

**Gaps for a real broadcast** (all additive meta, none change outcomes):
- shot has no **zone / distance / shot kind** (layup vs jumper vs post) — `shot.zone` exists inside the sim but is not emitted;
- no **assister id** on a score; block has no **blockedId**; no explicit possession-start with the ball handler;
- no drives, screens, dribble moves, closeouts, transition — GameSim has none (confirmed by the 3v3 header: "GameSim has no transition play");
- events are possession summaries (~14 game-seconds each), no intra-possession timestamps.

## 4. Pacing — the key architectural fact
Wall time per possession: 1x = 1100–3600 ms, 2x = 300 ms, 3x = 85 ms; quick-sim (`runFast`) emits nothing. A 3D possession
that reads as basketball (push, set, pass, shot, rebound) needs ~6–10 s. So the viewer cannot just ride GameSim's timer.
Decision needed (see §9): either (a) keep the plan's "compress/skip, never queue" and accept short stylised beats, or (b)
decouple presentation from sim pace with a small look-ahead buffer (sim runs 1–2 possessions ahead, viewer plays them).
(b) is what makes it look like a real game, but live substitutions/tactic changes would then apply 1–2 possessions late.

## 5. Assets and engine

| Asset | tris | draw prims | clips |
|---|---|---|---|
| `bobblehead.glb` | 32,288 | 16 | Idle, Celebrate, Clap, Jump, Run, Sit, Stand |
| `stylized_jersey.glb` | 50,500 | 18 | same 7 |
| `stylized_street.glb` | 53,336 | 17 | same 7 |
| `man.glb` | 1,852 | 6 (31 joints) | Man_* incl. Idle, Run, Jump, RunningJump, Punch, Death, Clapping (list truncated in my read) |

- **No dribble, shoot, pass, defend, rebound or layup clips exist.** Basketball motion would be new animation work.
- 10 × stylized/bobblehead = 320k–530k tris and 160–180 skinned draw calls — **not viable on mobile**. `man.glb` ×10 ≈ 18.5k tris is viable, but its **provenance/licence is unverified** by me.
- **Two Three.js builds**: `court3d.js` loads the full 0.187 build (`three.module.js` 659 KB + `three.core.js` 1.47 MB); `avatar3d.js` loads a tree-shaken R171 bundle (640 KB) that has `GLTFLoader`. The full build vendored here has **no GLTFLoader / SkeletonUtils** (examples/jsm not vendored). Objects cannot cross builds. Putting GLB avatars into the match scene needs one unified build first.

## 6. Measured baseline (capsule 5v5, 1280×720, dpr 1)
130 draw calls · 11,066 triangles · 121 geometries · 11 textures · 4 shader programs. Nothing is instanced; every figure
allocates its own geometry/materials, and each name plate is its own `CanvasTexture`. (Whether `_rebuildFiguresIfNeeded`
disposes the old geometry on lineup change I did not verify.)

## 7. Proposed architecture (GameSim stays the only authority)

```
GameSim --raw emit + snapshot--> PresentationEventNormalizer   (merge raw events + domainEvents, stable seq, one shape)
                                         |
                                 Choreographer (pure, deterministic; seed = sim seed + possession index)
                                         |  keyframe tracks: positions, ball, anim tags, camera cue
                                 PlaybackScheduler  (timeScale, interrupt/compress, no unbounded queue, pause-safe)
                                    /                 \
                          2D tactical view          3D broadcast view
                          (existing CourtView)      (CourtView3D successor)
```
Rules: renderers never roll dice or decide a make; same seed + same events ⇒ same tracks; pause/sub/tactic controls keep
talking to GameSim only; Web first. Suggested home: `js/match/presentation/*` (new), existing views become adapters.
Required sim change: additive meta only (zone, shot kind, assisterId, blockedId, possession-start handler). It touches
`sim.js`, so it must be proven against the golden hash (`scripts/sim/golden-hash.mjs`) — meta fields must not move any RNG draw.

## 8. Minimal first vertical slice
Gold Challenge live screen only, **3D is an opt-in toggle next to the 2D court** (plan Stage 4), 2D stays default and the
permanent fallback. Fixed broadcast camera with ball-follow. Events covered: shot (made/missed), pass, dunk, rebound,
steal/turnover, substitution. Placeholder rig (capsule or `man.glb`), no GLB avatars, no new clips, no crowd. Acceptance:
score on screen always equals GameSim; pause shows a sane frozen frame; 3x speed never lags the sim by more than one
possession; draw calls and triangles within the budget below.
Coordination: the live screen markup and `app.js` live wiring overlap UI 3.0 Slice 3 (Code Puppy). This must not start
before Slice 1/3 ownership is settled.

## 9. Budget and QA plan
Proposed budget (needs a real-device pass to confirm): ≤150 draw calls, ≤60k tris on screen, ≤16 textures, dpr capped at 2
(already), 30 fps floor on a mid-range phone, scene load <2 s on desktop. Instance or merge the court lines/figures if the
draw-call budget is tight.
QA: node tests for the normalizer/choreographer (determinism, no-RNG, seq order, 2x/3x compression, pause); extend
`courtRenderReadOnly`-style tests to the new adapters; browser smoke per mode (real WebGL, desktop + 390 px); **FPS and
memory must be measured on real hardware** (Mac GPU + at least one phone), not SwiftShader.

## 10. Risks / dependencies
1. Pacing decision (§4) drives everything and affects live-control latency.
2. No spatial model in GameSim — choreography can look "wrong" to basketball fans; set expectations.
3. No basketball animation clips and no animator in the pipeline.
4. Avatar GLBs are far over any 10-player budget; Bobblehead v3 is also unresolved and does not unblock this.
5. Two Three builds must be unified; `man.glb` licence unconfirmed.
6. Overlap with UI 3.0 files (`app.js`, `#screen-game`).
7. Mixed 2D/3D state: switching view mid-game must not re-run or desync the sim.

## 11. Decisions needed from the owner
1. Pacing: compress-and-skip (plan §6) vs look-ahead buffer?
2. Is a stylised placeholder rig acceptable for the first slice, or must it use the real avatars from day one (not recommended)?
3. Which screen first — Gold live, as proposed?
4. OK to add additive meta fields to `sim.js` (golden-hash-guarded)?
5. Who owns animation creation, and where do clips come from?

## 12. Owner decisions (2026-11-15) — status: PLANNED, not started

The audit is accepted as the architectural baseline, subject to reconciliation with the latest main. The technical direction is
approved; full-game 3D development is **not** approved now.

| # | Question (§11) | Decision |
|---|---|---|
| 1 | Pacing | **Deterministic compressed playback.** No look-ahead; GameSim never runs ahead of what the player controls |
| 2 | Placeholder vs real Avatar | Lightweight placeholder players first |
| 3 | First mode | Gold Challenge |
| 4 | Additive `sim.js` meta | Allowed — only already-computed facts, **no extra RNG draw**, no change to results, skills, subs, clock or save shape |
| 5 | Animation | Deterministic procedural choreography; no skeletal animation library yet |

Standing constraints: GameSim stays the only authority (no renderer RNG/scoring); 2D `CourtView` remains the default and the
permanent fallback; no production Avatar GLBs in S1; do **not** unify the two Three.js builds in S1 (keep the existing
`court3d.js` build, use models that need no GLTFLoader); `man.glb` is not assumed licensed until its provenance is confirmed;
no paid assets, no native mobile work. Choreography for things GameSim never computed (dribble routes, screens, cuts) is
presentation-only and must not be presented as simulated.

Golden-hash acceptance for any meta addition (fixed seeds, before vs after): final score, box score, event types and order,
RNG consumption sequence, skill triggers, fouls and substitutions, game clock. New meta keys may differ; nothing else may.

Slices (each reviewed separately; stop after S1 for user review):
- **3D-S1** — Gold Challenge 2D/3D switch, 10 lightweight players, court, score/clock sync, pause and tactical controls intact.
- **3D-S2** — deterministic pass, shot, rebound, turnover; interruptible scheduler; no unbounded queue.
- **3D-S3** — dunk, steal, substitution, pause transitions; 1x/2x/3x validation; live tactic changes apply with no delayed sim.
Reuse the existing `court3d.js` foundation instead of building a second Three.js court.

Ordering: 2D Avatar art and Gold Challenge UI 3.0 come first. Do not start S1 until overlapping UI 3.0 file ownership
(`#screen-game`, `js/app.js` live wiring) is resolved and this audit is reconciled against the then-current main.
