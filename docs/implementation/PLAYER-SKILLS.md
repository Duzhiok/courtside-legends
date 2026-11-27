# Player Skills (signature moves as a career growth system) — S0 audit + measurement

- **Status:** PROPOSED. The owner proposed the feature on 2026-11-27 (four tiers, cooldown counted in possessions, five levels, phases M1–M5). This file is S0: what the engine already has, what one use of a signature move really does today, and the constraints any design must respect. **No game code has been changed.**
- **Scope:** Player careers (Player Reborn line). Not Coach / GM.
- **Ordering (owner):** finish the Critical Moments QA first, then develop this as its own feature, never mixed with unaccepted changes. Critical Moments is blocked on locating its code (uncommitted in another session's worktree; not on this machine).

## 1. The owner's proposal (summary)

| Tier | Trigger | Examples |
|---|---|---|
| Passive | automatic when conditions are met | catch-and-shoot, clutch, rim deterrence |
| Active | the player fires it, with a cooldown | stepback three, euro step, dream shake |
| Signature | costs stamina, long cooldown | skyhook, one-leg fade, killer crossover |
| "Takeover" | when a meter is full | scoring burst, defensive domination |

Cooldowns in **own possessions**, not real time (the game pauses, speeds up and runs hosted). Five levels: Lv1 learn → Lv2 cheaper → Lv3 more reliable → Lv4 shorter cooldown → Lv5 legendary effect. Using a move never guarantees the result; defenders can counter. Effects go through the existing engine, shared by `driveGame`, the event steps, hosted play and manual play — **no second match engine**. Phases: M1 6–8 active moves + cooldown + stamina; M2 skill XP, levels, slots; M3 meter + clutch moves; M4 star-exclusive moves, mentorship; M5 combos, AI counters, animations.

## 2. What already exists (read, not assumed)

| Piece | Where | What it does |
|---|---|---|
| **42 signature moves with real engine effects** | `js/data/skills.js` `SKILL_PACKS` (`signature: true`) | offense moves carry `proc` (0.11–0.20), `makeBoost` (+0.20…+0.30), `openBoost` (+0.03…+0.16) and a shot zone; defense moves (`chase_down_block`, `not_in_my_house`, `glove`) a block/steal boost |
| Offense hook | `trySignatureOffense(baller, defender, ctx)` called in `js/engine/sim.js` | a **random proc** per eligible shot; on a hit it replaces the shot, adds openness, sets `_sigMakeBoost`, emits `"unleashes X"` with `meta.skill = { id, playerId }` |
| Defense hooks | `trySignatureSteal`, `trySignatureBlock` | random procs on the defender |
| Context already in the rolls | `clutchOnly` (Q4+, margin ≤ 8), `dame_time` / `big_shot` late bonuses, `lob_finisher` on a feed | the "clutch move" idea partly exists |
| The owner's five examples | `fadeaway` (后仰杀手), `logo_range` (百步穿杨), `dream_shake` (梦幻脚步), `crossover` (变向太极), `chase_down_block` (追身定板); also `skyhook`, `dirk_fade`, `stepback`, `big_shot` | **all exist** |
| Stamina | player `fatigue` (rotation subs out at 70) | a real cost already read by the engine |
| How a Player career gets skills | `player-signature-awakening-design.md` — owner-approved 2026-11-10: **no skill books**; skills come from talent, real game evidence, training and key events | the growth path M2 must use |
| Mentorship | `careerRelationships.js` `RELATIONSHIP_KINDS` includes `"mentorship"` | the natural home for M4 "learn from a legend" |
| A one-possession engine seam pattern | `sim.requestedBallHandlerId` (PA3 S1) | the model for "fire this move this possession" |

**Not present:** the engine has **no shot distance** and **no defender position**. "Bigger three-point range" and "the defender loses his spot" cannot be real; they can only be the existing make / openness boosts, and the text must say so. Reborn runs games with `_quiet = true` and `onEvent` discarded, so **which move fired is not recorded anywhere a career can read** (the same gap that blocks the stepback awakening). In Reborn, "takeover" already names the clutch decision (`attemptTakeover`), so the meter needs another name.

## 3. Measurement: what one use is worth today

`scripts/measure/signature-moves.mjs` (real engine, 8 era matchups × 40 games = 320 games, 816 owner-games). Baseline = the same owners' shots on possessions where no signature fired.

- Baseline: 9 125 shots, **52.4%**, **1.190 pts/shot**.
- All offense signatures: 1 028 uses = **1.26 uses per owner per game**, **1.691 pts/use** = **+0.50 pts per use** over a normal shot.
- So today's whole signature budget is about **+0.6 pts per owner per game**.

| Move | Uses/owner-game | Make% when fired | Extra pts/use |
|---|---|---|---|
| splash_spot 水花接投 | 0.20 | 46% | +0.26 |
| bully_step 霸王步 | 0.14 | 88% | +0.66 |
| logo_range 百步穿杨 | 0.13 | 48% | +0.31 |
| dream_shake 梦幻脚步 | 0.09 | 84% | +0.64 |
| fadeaway 后仰杀手 | 0.09 | 68% | +0.29 |
| mountain_slam 泰山压顶 | 0.09 | 84% | +0.56 |
| rim_rush 冲框 | 0.09 | 77% | +0.57 |
| euro_step 迷踪步 | 0.08 | 85% | +0.75 |
| crossover 变向太极 | 0.08 | 63% | +0.29 |
| coast_to_coast 长驱直入 | 0.08 | **95%** | +0.86 |
| teardrop 抛投大师 | 0.05 | 79% | +0.59 |
| dirk_fade 金鸡独立 | 0.03 | 75% | +0.45 |
| midrange_assassin 中投刺客 | 0.03 | 85% | +0.63 |
| uncle_drew 蝴蝶穿花 | 0.03 | 70% | +0.39 |
| bank_45 45打板 | 0.03 | **91%** | +0.73 |

(stepback, big_shot and one more had < 15 uses: too few to read. Defense moves are not measured yet.) Limits: make% "when fired" includes the zone change the move itself makes, so it is the value of a use, not a same-shot comparison.

## 4. Constraints any design must respect (from the audit + data)

1. **Budget, not a new faucet.** Measured: a player with 30+ minutes is on the floor for **about 65 own offensive possessions a game** (145 player-games, 4 eras; 66.8 per 36 min). A cooldown of 3 / 4 / 5 possessions therefore allows up to about **16 / 13 / 11 uses a game** against **1.26 today** (9–13×): roughly **+5.5 to +8 pts per player per game** at today's +0.50 per use. Rule: an active move **replaces** that player's random proc for that move (when equipped, the random roll is off), and uses per game are capped near today's budget × a factor the owner sets (suggest ≤ 2×). At 65 possessions, 2.5 uses a game means a cooldown of about 25 possessions — so **charges per game** (e.g. 2–3, refunded by nothing) fit far better than a possession cooldown; a short cooldown only works if the boosts are cut to a fraction of today's.
2. **No "95% button".** Several moves already fire at 85–95%. Acceptable as a random proc; as a choice it is an exploit. An active use must not outperform the move's random version, and Lv1 should be weaker than today's proc (levels then earn it back), so growth is real and Lv5 equals, not exceeds, the current numbers unless re-measured.
3. **Only real effects.** Range and defender-position effects become make / openness boosts and say so; no text claims what the engine does not model.
4. **One engine path.** A one-possession seam (`sim.requestedSignature = { playerId, id }`, cleared after use, default null = byte-identical games) used by Reborn, hosted and manual play. Shared GameSim change → full regression + a before/after measurement with this script.
5. **Evidence for growth.** Skill XP must count real uses and makes. That needs per-player counters in the engine (for example `stats.sig[id] = { used, made }`), a small shared change that also unblocks the stepback awakening.
6. **No skill books.** Moves are earned through awakening evidence, training and key events; slots hold only earned moves; no shop. Collection-mode skill packs (B149) stay a separate mode.
7. **Where the player sees it.** Reborn has no live court, so a stamina / meter HUD has no screen. M1 puts a ready move into the existing decision prompts (L1 bubble / L2 / L3) as one option, e.g. "Dream Shake · stamina −8"; cooldown and stamina show on the identity card. A live HUD is a separate product decision.
8. **Naming.** Do not call the meter "Takeover" inside Reborn.

## 5. Proposed M1 slice (after Critical Moments)

One move end to end, then widen to 6–8: the Reborn player owns `dream_shake` (or whichever awakening gives him) → when ready, the decision prompt offers it → the seam fires it for that possession through the normal shot code → fatigue cost and cooldown in own possessions → real result in the post-game report → per-game cap holds. Tests: seam off = identical games, seam on fires exactly once and clears, cap and cooldown hold, random proc is off for an equipped move, measured uses/game and pts/game within the agreed budget; one desktop + mobile smoke.

## 6. Decisions for the owner

1. Budget factor over today's 1.26 uses per owner-game (suggest ≤ 2×) and whether it is charges per game or a long cooldown.
2. Lv1 strength relative to today's proc (suggest weaker; Lv5 = today).
3. Approve the shared GameSim seam + counters (full regression).
4. M1 UI inside decision prompts (no HUD) — yes / no.
5. Name for the meter.
