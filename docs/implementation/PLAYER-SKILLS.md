# Player Skills (signature moves as a career growth system) — S0 audit + measurement

- **Status:** M1a + M1b SHIPPED 2026-11-27 (see §7). The rest of the proposal (levels, cooldown growth, HUD, more moves) is still PROPOSED. The owner proposed the feature on 2026-11-27 (four tiers, cooldown counted in possessions, five levels, phases M1–M5). This file is S0: what the engine already has, what one use of a signature move really does today, and the constraints any design must respect. **No game code has been changed.**
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

## 4b. Who could use an active move today — almost nobody (measured)

Reborn identities are 70% historical bench players (mpg < 12) and 30% generated prospects; a card's skills are its innate roster skills plus what it awakens. Measured over 400 drawn identities (`drawIdentity` + `buildPlayerCard` on `roster.json`): **5 (1.3%) carry any offensive signature move, all `teardrop`.** The awakening path grants `rim_protector`, `glass_cleaner`, `dime_dropper`, `clutch_killer` (none is a signature move) and `stepback` — the only offensive signature it could grant, and the one blocked for lack of shot-type evidence.

**So an "activate your signature move" M1 would be invisible to ~99% of Reborn players.** Acquisition has to come before activation:

- **M1a — evidence + earning (first):** engine counters a career can read (per-player shot zone attempts/makes, signature uses/makes), which unblock `stepback` and allow 2–3 evidence-based offensive awakenings (for example a post move from real paint makes against a defender, a mid-range move from real mid makes). Rules follow the awakening principle: the action's own stat, never points. Needs the owner's call on which moves and which evidence.
- **M1b — activation:** the slice below, once a meaningful share of players can own a move.

## 5. Proposed M1b slice (after M1a and Critical Moments)

One move end to end, then widen to 6–8: the Reborn player owns `dream_shake` (or whichever awakening gives him) → when ready, the decision prompt offers it → the seam fires it for that possession through the normal shot code → fatigue cost and cooldown in own possessions → real result in the post-game report → per-game cap holds. Tests: seam off = identical games, seam on fires exactly once and clears, cap and cooldown hold, random proc is off for an equipped move, measured uses/game and pts/game within the agreed budget; one desktop + mobile smoke.

## 6. Decisions for the owner

0. **Re-sequence: M1a (earn moves from real evidence) before M1b (activate them)** — because today ~99% of Reborn players own no offensive signature move. Which 2–3 moves to make earnable first, and from which evidence.

1. Budget factor over today's 1.26 uses per owner-game (suggest ≤ 2×) and whether it is charges per game or a long cooldown.
2. Lv1 strength relative to today's proc (suggest weaker; Lv5 = today).
3. Approve the shared GameSim seam + counters (full regression).
4. M1 UI inside decision prompts (no HUD) — yes / no.
5. Name for the meter.

## 7. Shipped: M1a + M1b (2026-11-27, Code)

Owner approved both in one pass; no new currency, no HUD, no skill levels or cooldown growth.

### 7.1 What a player can do now
- **Earn** `dream_shake` (paint), `fadeaway` (mid-range), `stepback` (three) from real games. A move needs the rating gate AND a hot streak: 3 of his last 5 games qualify, one of them a key game. Only the move's own shot zone counts; points never do.
- **Fire it on purpose.** A move he owns shows up in the decision prompts (L1 bubble / L2 / L3) as one option, "Signature move · 2/2". **2 uses per game, shared by all his moves**, across the whole game (substitutions, timeouts, overtime, a reload do not refund it; an old save without the field gets a fresh budget). Fired = the possession is his, with the move's real make boost; **a miss still spends the use**.
- **A refused attempt spends nothing** (the engine never fired it: putback possession, a turnover or a foul before the shot).
- **An owned move no longer procs at random for him**; every other player's moves are untouched (`card.activeSignatures`, set only on his card in `playGame`).
- **Auto mode / an unanswered bubble:** a deterministic autopilot (no dice) fires the move on a clear edge (`js/reborn/signature.js`, early game needs a big edge, Q4 a small one) inside the same budget. It never blocks the game and gives up after 3 refusals a game.
- Post-game: one honest line per use ("you fired / the autopilot used", fell or not, "the use is spent"), or "no signature move this game (2/2); unused uses do not carry over".

### 7.2 Evidence (what the engine now records; no RNG consumed)
`js/engine/shotLog.js`: per player `paint|mid|three: { a, m, sa, sm }` (attempts, makes, SELF-CREATED attempts, makes: a shot with no pass this possession) and `sig: { [move]: { u, m } }`. A player who never shot has **no** log: an old report is unknown, never a fabricated zero. Test 2 asserts the log equals the engine's own box score (fga, fgm, tpa, tpm) for every player in real games.
**Self-created is a proxy, not proof of the move.** The engine has no shot type, distance or defender position, so "a self-created make in the paint" qualifies him to LEARN `dream_shake`; it does not claim he did one.

### 7.3 Final rules and the reach they give (measured, not guessed)
Measured on 1,230 real player-games (>= 8 min, avg 28 min) of 20 Reborn identities whose rating gate was met, then bootstrapped through the real `recordGame` (800 trials each, ~47 played games a season):

| move | gate (card) | a game counts when | key game | earned in season 1 | within 2 seasons |
|---|---|---|---|---|---|
| dream_shake | paint >= 66 and (big or strength >= 55) | >= 2 self-created paint makes | >= 3 | 42% | 63% |
| fadeaway | mid >= 64 | >= 2 self-created mid makes | >= 4 | 45% | 69% |
| stepback | three >= 56 and handle/dribble >= 56 | >= 1 self-created three ATTEMPT (makes are too rare: 90% of games have none) | 2+ attempts and 1+ make | 68% | 90% |

- The first thresholds I wrote (per-36 floors, key games of 5 / 4 / 3 makes) earned the move for **0 of 59** gated identities over 83 full seasons. Real distribution: paint self-made 0/1/2/3/4+ = 55/28/12/3/1.5%; stepback self-created threes 0 in 90% of games. Fixed from the data, not by feel.
- Population: the rating gate is met at the start by 13.8% (dream_shake), 17.5% (fadeaway), 28.1% (stepback) of drawn identities. **A player must also actually play**: gated players get >= 8 min in 57% of games; a default rookie only 17%, and a 46-OVR "starter" is benched again within a few games as trust falls. Playing time is the real bottleneck, and that is the game's own design.
- Not yet a reach number for the general population: the shipped measure (`scripts/measure/awakening-reach.mjs`, sharded) is the tool to re-run it.

### 7.4 Engine change (shared GameSim; default path proven unchanged)
Counters in the shot-resolution paths, `sim.requestedSignature` / `activeSignatureUses`, and two guards that stop a move he chose from being taken away: the organizer's pre-shot kick and the low-appetite re-pass both test `!wantsSig` **before** they roll the dice. **Measured:** without those guards ~80% of fired moves were refused because the ball had been passed on (71 of 400 attempts fired); with them 271 of 400 (68%) fire; the rest are putbacks, turnovers and fouls before the shot.
**Regression proof:** 60 seeded games (5 era pairings, injuries on, 231,534 steps), full box scores hashed on `origin/main` and on this branch: **identical** (`sha256 267d2834d893...`).

### 7.5 Limits (not done, on purpose)
- Only these three moves are earnable; the other 39 are unchanged (random proc for everyone).
- No equipment slots: owning = armed. No upgrade, cooldown or stamina cost; no HUD.
- An attempt that the engine refuses still makes him the ball handler for that possession (the autopilot is capped at 3 per game for that reason).
- The refusal rate (~32%) is a property of the engine's possession flow, not a UI choice.
- Tablet / landscape / overtime in a real browser, and Gold / My Team / Coach modes: not exercised.
- **Browser smoke** (`scripts/qa/reborn-signature.mjs`, desktop 1440 + mobile 390, zh + en): owned move offered, taken by click and by key, the engine's own report says 2 fired (never 3), a refused attempt costs nothing, Auto mode finishes with no question, a finger can reach the option (hit-test), real-viewport screenshot checked. It found and fixed two real things: the L1 bubble chip said only "Signature" (no move, no uses left; a phone has no hover) and the awakening panel's "Skills held" listed every skill in Chinese in the English UI (packs have no `nameEn`; a pre-existing leak, now `skillNameL`).
- **Not mine, seen on the screenshot, left alone:** the L1 bubble shows ONE quote (the feed offer) while the options also include "Take the screen / Another way", so the teammate's screen line is not visible in the bubble; and the bubble footer says "Hover to pause", which is mouse language on a touch screen.
- One run showed the option as unreachable (a 1,348 px static panel) and one game as "3 taken"; neither reproduced in 6 further runs on both viewports. Likely a frame of the dismissing dialog / a refused attempt; **not proven**. The check stays strict and screenshots on recurrence.

## 8. Shipped: M1c - collection and three slots (2026-11-28, Code)

Owner approved M1a + M1b and ordered: collection and equip slots first, then proficiency (M2), then specialised training (M3); no more tuning of the three awakening thresholds until real players have played them.

### 8.1 Rules
- **3 active slots.** Owning is unlimited. `reborn.player.loadout = { equipped, known, stats, settled }` sits next to `awakening`; the catalogue is still `data/skills.js` and ownership is still the card's skills (no second skill system). Module: `js/reborn/loadout.js` (pure), screen: `js/ui/reborn/loadoutView.js`.
- **Only an EQUIPPED move is armed** (`card.activeSignatures`): fired on purpose, offered in decisions, no random proc. **An owned move left in the collection keeps its original random proc.**
- The shared budget is still 2 uses a game, whatever is equipped.
- **Changing is free and only on the career screen**, never in a decision prompt (a game is atomic, so nothing can be swapped mid-game). Equip fails with a plain reason when slots are full, the move is not owned or it is already equipped; nothing mutates its input.
- **Old saves:** no loadout -> every owned move is "new", so the first sync equips them in card order up to 3. That is exactly what M1b armed for anyone owning 3 or fewer. A newly owned move takes a free slot; with full slots it waits in the collection. A move he took off does not sneak back in.
- Note: M1b armed ALL 31 offensive signature moves (innate ones too, e.g. `teardrop`), so the cap can bind for anyone owning more than 3; it is not a dead rule.
- **Usage numbers are the engine's own** (`zones.sig` of the game report: random procs and purposeful uses alike), settled once per `gameId`, makes never above uses, the idempotency memory bounded (120). A move never used shows "No uses on record yet": unknown, not zero.

### 8.2 What the player sees (career screen, between games)
"My signature moves - n/3 equipped", a plain rule line, **Equipped** group (his moves, then empty slots), **Collection** group (unequipped moves), and an "Other skills (automatic)" line. Each move: name (English too: all 31 have one), type (Offense + zone only when the catalogue has one), source (Innate / Awakened / Purchased), status, real counts, an Equip / Unequip button (disabled with a reason when the slots are full).

### 8.3 Verification
- 9 focused tests (`tests/loadout.test.js`): legacy sync, slot rules, usage ledger, real-game wiring (equipped -> armed, not equipped -> no signature section, legacy save still armed), view, click helper. 6 mutations, all caught (arm everything / usage twice / ignore the cap / taken-off move returns / makes above uses / unknown shown as zero).
- Real browser (`scripts/qa/reborn-loadout.mjs`, desktop 1440 + mobile 390, zh + en, REAL clicks): Unequip x2 -> 1/3 and two empty slots; a reload keeps it; in Full control every signature offer names only the equipped move; Equip by click -> 2/3; unequip all -> 0/3, no signature option in a game, no signature line in the report. The real-viewport screenshots were read: grouping fixed (equipped first, then collection), an inherited list indent removed (the arena theme's generic section-list padding beat the panel's own).
- No shared GameSim change in M1c, so no full regression and no new hash comparison (the M1a/M1b proof stands).

### 8.4 Limits
- On a phone the panel is ~600 px tall and pushes weekly training down; a collapsible version is a product call, not done.
- Equipping is allowed any time on the career screen, including after the last game of a season; there is no "before this specific game" gate beyond that.
- Only offensive signature moves are loadout moves; defensive / passing / rebounding signatures keep their random proc (M6).

## 9. Next (owner order)
M2 proficiency (five levels, per-game cap, idempotent, no big hit-rate gain, budget stays 2), M3 specialised training on the existing Offline Training Camp (stable learning progress + rare insight, existing coins, no new currency), then Career playing time (B160). Legendary mentor, 3D animation, defensive / playmaking active moves stay later.

