title: Courtside Legends 2.0 — Master Product & Engineering Specification version: 1.0 date: 2026-11-03 status: Product direction approved; implementation phased source: Product design discussions and courtside-legends.zip repository snapshot scope: Product, UX, simulation, presentation, careers, Reborn, economy, social, testing, delivery language: zh-CN (code identifiers in English)

Courtside Legends 2.0 — Master Product & Engineering Specification

> **Implementation contract for Cursor / Codex / coding agents.** This document is the intended product direction, NOT a claim that proposed APIs or features already exist. Inspect the actual repository and tests before coding. Preserve working modes and saves. Deliver incrementally, with verifiable acceptance criteria.

0. Executive decisions / non-negotiable rules

Vision: Live Your Basketball Legacy — Rewrite History. Build Your Legacy. Own the Moment. 让玩家从任何身份、任何年代、任何起点，创造自己的篮球人生。核心差异化不是“很多模式”，而是 历史可改写 + 不同身份的人生发展 + 关键时刻亲自参与 + 长期收藏/表达。

Three primary entry experiences:

1. Quick Play / 快速开打：新手 10 秒左右进入第一局，关键时刻选择动作或战术，30–90 秒得到第一轮反馈。
2. Reborn / 穿越模式：穿越到历史年代，成为球员、教练或经理，随机/指定身份，改变个人命运与联盟历史；共享单一世界时间线。
3. My Legacy / 我的传奇：自创角色、家乡、球风成长、卡牌收藏、展示空间、音乐与社交；长期生活模拟体验。

Decisions already accepted: 首页信息架构重构 → 一键快速开打 → 绝杀挑战 → 2D 球员与关键回合接管 vertical slice → 角色/成长 → Reborn 统一入口和三职业 → 历史分支 → 女性篮球/WNBA → 家乡荣誉、社交、音乐等扩展。Do not implement all phases in one PR.

Non-negotiable engineering constraints:

• Single authoritative basketball simulation: reuse existing GameSim; never implement a second competing shooting/possession/scoring model for casual mode.
• Choice ≠ guaranteed outcome: strategy influences opportunity, player selection and tendencies; shooting, foul, block, rebound, turnovers, overtime and final score follow simulation rules.
• Preserve existing modes, legacy saves, historical rosters, mobile packaging, online economy and ranked behavior. New feature flags and schema migrations are mandatory where needed.
• No fabricated NBA/WNBA history or numerical player ratings. Label estimated attributes, fictional athletes and alternate timelines clearly. Verify era-specific rules and historical data coverage.
• No pay-to-win dependency for onboarding; no forced registration for offline Quick Play. Cosmetics/social progress do not confer competitive advantage.
• Accessibility and performance first: desktop, mobile web and Capacitor; keyboard/touch, readable typography, reduced motion, graceful fallback without advanced rendering.
• Legal/content safety: rights review for NBA/WNBA logos, names, player likenesses, photos, music and trading-card imagery; no assumption that stylization eliminates rights requirements.

Status legend

• CONFIRMED DIRECTION: explicitly agreed product direction.
• PROPOSED: implementation recommendation, must be validated against current code.
• OPEN: unresolved product, licensing or engineering choice; do not silently invent an answer.

1. Repository baseline and architecture inventory

The uploaded ZIP is a snapshot; repository code is the source of truth. Observed files include:

|Area              |Existing files / mechanisms                                                                                |Use / caution                                                                                                         |
|------------------|-----------------------------------------------------------------------------------------------------------|----------------------------------------------------------------------------------------------------------------------|
|Application/UI    |`index.html`, `js/app.js`, `css/home.css`, `css/style.css`, `js/ui/homeTabs.js`, `js/ui/homeShowcase.js`   |Existing home tabs and modes; `app.js` is large: keep new logic modular.                                              |
|Mode catalog      |`js/data/modeCatalog.js`                                                                                   |Already describes `core`, `quick`, `quick-variants`, `variantOf`; modify this instead of creating competing catalog.  |
|Match simulation  |`js/engine/sim.js` (`GameSim`, `resolvePossession`, `setFocusPlay`, `setTempo`), `js/engine/gameplan.js`   |Existing match authority; inspect actual constructor, clock, possession, callbacks and event semantics before changes.|
|Court presentation|`js/engine/court.js` and app rendering                                                                     |Existing avatar/point/name tactical visualization; enhance or wrap before replacing.                                  |
|Player data       |`js/data/players.js`, `ratings2k.js`, `skills.js`, `growthPaths.js`, `careerArc.js`, `historicalSeasons.js`|Preserve base historical data; audit derived subattributes, OVR semantics and tendencies.                             |
|Existing careers  |`js/modes/timeTravelCareer.js`, `leagueCareer.js`, `careerTimeline.js`, `js/career/*`                      |Reuse offers, coach reputation, future knowledge, historical years, progression.                                      |
|Collection/economy|`js/data/gacha.js`, `accountGacha.js`, `js/ui/gachaView.js`, online economy                                |Preserve currency consistency, inventory integrity and account boundaries.                                            |
|Music             |`js/data/bgm.js`                                                                                           |Audit existing behavior before adding user-provided music.                                                            |
|Online            |`js/online/*`, `server/*`                                                                                  |Keep new offline casual features isolated; server authoritative for online competitive results.                       |
|Tooling           |`package.json` (`npm test`, `npm run lint`), Capacitor scripts                                             |Run regression checks and mobile smoke tests.                                                                         |

Important baseline discovery: modeCatalog.js already documents the quick and draft modes as variants of custom; index.html currently exposes tabs 我的球员 / 职业经理 / 自定义 and a 快速演示 mode. The agent must reconcile both rather than add another independent navigation system. Existing timeTravelCareer.js includes seeded offer generation and future-knowledge choices. Existing match randomness must not be assumed fully deterministic merely because some career modules use seeded RNG.

Baseline audit deliverable (mandatory before implementation)

Create docs/implementation/baseline-audit.md listing real exported APIs, event payloads, mode entrypoints, save schemas, renderer coordinates, supported tactics, and test coverage. For each proposed API in this spec, mark exists / adapt / new with evidence. If the repository has changed since the ZIP, update the implementation plan accordingly.

2. Target audience and product promise

|Motivation (not gender)            |First-session hook                              |Long-term loop                                  |Primary surface       |
|-----------------------------------|------------------------------------------------|------------------------------------------------|----------------------|
|Casual / new to basketball         |One-click match, clutch three, easy risk choices|Short challenges, replay, achievements          |Quick Play            |
|Character creator / life simulation|Avatar, hometown, identity, outfit              |Career story, apartment, relationships, style   |My Legacy             |
|Collector                          |Free starter choice, card album                 |Era sets, themed collections, cosmetic display  |My Legacy / Collection|
|Hardcore basketball fan            |Historical 1996 start, real draft context       |Trade/draft/tactical alternate history          |Reborn GM/Coach       |
|Career role-player                 |Random low-status historical identity           |Earn minutes, interviews, promotions, retirement|Reborn Player/Coach/GM|
|Social / friends                   |Share buzzer-beater, challenge code             |Club, collections, friend rivalry               |Social (later)        |

Avoid gender stereotypes. All identities and play styles should be available regardless of player gender. Women’s basketball should be a first-class career experience, not merely a cosmetic avatar swap.

Success metrics (initial targets, not measured facts)

• Time to first meaningful decision ≤15 seconds; first playable experience within ~10 seconds on typical target hardware (validate performance).
• First match completion ≥85%; first-session voluntary replay ≥60%; no required tutorial; zero critical soft-locks.
• Instrument home_view, quick_play_start, first_decision, match_complete, retry, mode_enter, save_failure with privacy-aware anonymous analytics. Events are proposed, not currently verified.
• Compare new vs existing flow with a small 5–10-person first-time-player usability study, then expand.

3. Information architecture / mode consolidation

New home hierarchy (retain existing behaviors and deep links):

1. Hero primary CTA: 快速开打 / Play Now → immediately start preset exhibition, guest allowed.
2. Legendary Moments / 传奇时刻 → Clutch Challenge (new), later Comeback Master.
3. Reborn / 穿越模式 → Player / Coach / GM, random identity, historical start.
4. My Legacy / 我的传奇 → avatar, hometown, career, collection, social showcase.
5. Explore more grouped by user intent:
  • 挑战与竞技: Ranked, Gold Progression / 冠军之路, historical challenge.
  • 经理生涯: One Season / 常规赛征程, Franchise / 联盟经理.
  • 自由创造: Custom Battle, Draft as variant, budget draft, legendary teams, sandbox.
  • 朋友一起玩: Local Tournament, two-person bidding, online when supported.

Mode mapping / migration:

|Existing                    |New display               |Decision                     |Rationale                                   |
|----------------------------|--------------------------|-----------------------------|--------------------------------------------|
|`quick` / 快速演示              |Quick Play / 快速开打         |PROMOTE                      |Remove “demo” perception; default one-click.|
|`custom` / 自定义对战            |Free Match / 自由对战         |KEEP                         |Advanced lineup construction.               |
|`draft` / 选秀建队              |Free Match → Draft variant|GROUP                        |High overlap with custom.                   |
|`ranked`                    |Arena / 排位竞技              |KEEP, DE-EMPHASIZE for guests|Requires roster/economy knowledge.          |
|`season`                    |One-Season Championship   |KEEP                         |Finite season goal.                         |
|`career` / 金币晋级赛            |Road to Championship      |KEEP, SIMPLIFY               |Stage rewards and saves.                    |
|`tournament`                |Party / 多人淘汰              |GROUP                        |Social intent.                              |
|`franchise`                 |Franchise Manager         |KEEP                         |Deep 15+ year loop.                         |
|`timeTravel`                |Reborn Coach/GM foundation|WRAP/EVOLVE                  |Preserve legacy implementation and saves.   |
|`sandbox` and other variants|Advanced / sandbox        |KEEP, NEST                   |Avoid flooding new users.                   |

No destructive removal. Existing mode IDs, save keys, URLs and user data must continue working; use aliases and migration only when necessary. Do not conflate the UI catalog with the authoritative runtime router.

4. Visual system and UI/UX design

4.1 Brand and appearance

• Premium basketball identity: dark arena / deep green, warm gold (#f6c870 existing accent), basketball orange; strong typographic hierarchy and cinematic hero photography only when licensed.
• Arcade energy in play: vivid scoreboard, large actionable choices, clutch emphasis, restrained micro-animations, satisfying audio/haptics.
• Preserve existing responsive and prefers-reduced-motion support. Respect system font scaling and contrast; never encode information solely by color.
• Avoid multiple competing “featured” cards. Exactly one dominant home CTA; secondary cards with consistent sizes and concise copy.
• Card content: mode name + one-sentence emotional hook + approximate duration + difficulty, details on mode detail screen.
• Consolidate resume/saves into one “Continue” panel; account/collections into profile; developer/cache controls into Advanced Settings. Hide unavailable server-dependent features or label clearly.

4.2 Target screen inventory

|Screen                |Essential elements                                                                 |Empty/error states                                               |
|----------------------|-----------------------------------------------------------------------------------|-----------------------------------------------------------------|
|Home                  |Play Now, Legendary Moments, Reborn, My Legacy, Continue, Explore                  |Offline mode always available; restore old saves                 |
|Quick Play            |Instant match; optional choose team; clear pause/skip                              |Data unavailable → deterministic fallback preset or clear message|
|Clutch                |Score, quarter/clock, possession, highlighted ball handler, 2–3 choices, risk label|Invalid decision → recover; no duplicate tap                     |
|Match court           |Court, 10 readable players, ball, action traces, score/event timeline, replay      |Low-motion/static tactical board fallback                        |
|Results               |Final score, MVP, decision explanation, reward, retry, share                       |Failed save → warning and retry, not false success               |
|Reborn onboarding     |Era, random role, underdog/balanced/legend, identity reveal, chapter goal          |Missing historical coverage → disable with explanation           |
|Career hub            |Role, job/contract, trust, skills, relationships, timeline, next event             |No job → interview/free agent loop                               |
|My Legacy             |Avatar, hometown, personal progression, cards, cosmetics, music                    |Guest save and account migration pathway                         |
|Collection            |Card album, filters, provenance, rarity, duplicate handling                        |Empty album with starter guidance                                |
|Accessibility/settings|Text, motion, contrast, sound, controls, privacy                                   |Offline fallback                                                 |

4.3 Interaction rules

• Touch target at least ~44×44 CSS px; safe-area aware on mobile; keyboard navigation and visible focus.
• Each important action gives immediate acknowledgement. Distinguish action accepted, simulation outcome, and save persisted.
• Clutch choices are locked after first valid submission; provide explanatory labels: “三分绝杀 / 高风险高回报”, “突破篮下 / 稳妥追分”, “传给空位 / 团队机会”.
• New player first round may offer only 2 choices; unlock third in second round. Never fake guaranteed wins.
• Display probability as qualitative risk initially; do not present shot probability as win probability.
• Sound effects optional; no autoplay user music without user interaction/consent.

5. Quick Play and Legendary Moments gameplay

5.1 Quick Play

• Guest clicks Play Now; generate or use curated balanced teams; start without account, drafting, auction or advanced gameplan.
• Optional pregame chips: Random Teams, Legends, Short Match, Full Match (defer variants until basic flow works).
• Use current GameSim and existing match UI. Auto-simulate between important moments, expose optional Coach Mode for deeper decisions.
• Result: concise game story, highlight, one-click rematch, optional “Build this team” cross-sell to deeper modes.

5.2 Clutch Challenge MVP

• Q4, 8–24 seconds remaining, trailing 1–3 points, known possession, preset roster and valid on-court lineup.
• Scene lifecycle: READY → AWAITING_DECISION → RESOLVING → CONTINUING → COMPLETED with FAILED/CANCELLED cleanup paths.
• Only show choice at legal pause/dead-ball point; enforce coach action locks and existing engine permissions.
• Clutch Three: map to existing setFocusPlay('pace_three') where valid. pace_three increases three-point tendency; it does not guarantee a three or a make. Existing applyLateGameScripts may overwrite focus; introduce explicit player-decision priority for this mode after inspecting actual call order.
• Do not blindly stack setTempo('push'), pace_three and lateChase multipliers. Validate current effects (push has tradeoffs to make/openness/turnovers) and compare distribution before changing.
• Drive: map to supported interior offensive bias; Pass: map to supported ball movement / drive-and-kick / catch-and-shoot where existing API allows. If not supported, add a minimal adapter without duplicating shooting rules.
• Outcomes include miss, block, turnover, foul/free throws, offensive rebound, made 2, made 3, opponent response, overtime. A made three when down three means tie, not victory.
• Ensure final-possession clock consumption cannot exceed valid time; clock/shot clock, fouls, rebounding, overtime and scoring/stat invariants require tests.
• Do not mutate snapshot() or UI score to fake initial game state. Add safe initializeScenario() (proposed) that validates all internal invariants before start, or implement a proven internal factory after baseline audit.
• attemptId/generation token prevents stale callbacks, intervals, animation completion or save callbacks after Retry or mode switch.

Proposed scenario contract (not existing API):

const scenario = {
  id: 'clutch_1996_001', version: 1,
  period: 4, clockSeconds: 8,
  score: { home: 99, away: 100 }, possession: 'home',
  homeTeamId: 'preset_home', awayTeamId: 'preset_away',
  allowedChoices: ['CLUTCH_THREE', 'DRIVE', 'TEAM_PLAY'],
  seed: 1996001
};

5.3 Probability semantics and fairness

• Distinguish P(three attempt), P(make | three attempt) and P(win | choice); never equate them.
• Keep existing chooseShot, calcOpenness, calcMakeProb, skills, fatigue, defender pressure, clutch, tendency, shot creation, foul and rebound logic authoritative.
• A strategy can influence shot distribution and player targeting but must not add arbitrary “+30% clutch” or guaranteed victory.
• Existing skill effects (including guaranteed events if present) require explicit auditing and balancing in curated beginner scenarios.
• Deterministic replay requires one injected RNG path for all relevant simulation randomness, not just seeded scenario selection. Until then, test invariants and distributions rather than exact outcomes.
• Later: 10k+ Monte Carlo runs per scenario/configuration; report attempt/make/turnover/win rates with uncertainty; compare strategies for meaningful but non-dominant choices.

6. 2D court, characters, animation and player takeover

6.1 Agreed direction

Phase 1: enhance current dots/photos/names with clarity, movement trails, ball travel, pass arcs, possession halo, defensive coverage, event camera and shooting feedback.
Phase 2: replace markers with lightweight top-down or slightly angled 2D Sprite characters; shared animation atlas (idle, run, dribble, pass, shoot, defend, rebound, celebrate) with jersey, number, body/hair variations; retain name/identity overlays.
Phase 3: optional limited player-level control at specific possession moments. Full 3D physics-driven 5v5 is out of MVP scope.

6.2 Render architecture

GameSim (authoritative outcomes)
  → Domain event adapter (typed event schema)
  → Presentation timeline / animation queue
  → Court renderer (existing DOM/SVG first; PixiJS optional)
  → Sprite layers, ball, routes, UI, audio/haptics

• Rendering is a projection of simulation events; it must never write authoritative score/box stats.
• Define court coordinate normalization, offense direction, left/right flip, player IDs, on-court roster mapping, ball ownership and animation cancellation.
• Prefer progressive enhancement of existing renderer; choose PixiJS only after benchmarking DOM/SVG limitations; Phaser/Three.js not default.
• Low-end mobile target: responsive and stable rendering, degrade animation quality gracefully; choose concrete FPS/memory budgets after device profiling.
• Proposed event types: POSSESSION_START, PASS, MOVE, SHOT_ATTEMPT, SHOT_RESULT, REBOUND, FOUL, TURNOVER, SUBSTITUTION, PERIOD_END, MATCH_END. Map only from data actually available; do not invent precise physical trajectories as if observed.
• If engine emits only possession summaries, generate visual interpolation clearly treated as presentation; never claim physically exact ball/player tracking.

6.3 Takeover tiers

|Tier                        |Player action                                               |Authority                        |Release                |
|----------------------------|------------------------------------------------------------|---------------------------------|-----------------------|
|T0 Spectate                 |Watch animated match                                        |None                             |Auto                   |
|T1 Coach                    |Three / Drive / Team Play, timeout, permitted tactic        |Team strategy                    |After possession       |
|T2 Player                   |Select eligible on-court controlled athlete and legal action|Individual intent only           |After action/possession|
|T3 Real-time direct movement|Joystick + collisions + timing                              |Would require new movement engine|Future research only   |

Important: setFocusPlay() is team-level. Do not pretend it implements an individual player’s dribble/pass/shoot command. T2 requires a distinct validated PlayerDecisionAdapter and engine hook; no command when player is benched, lacks possession or action is illegal.

7. My Legacy — identity, avatar, hometown and life simulation

7.1 Identity schema (proposed)

const identity = {
  characterId: 'uuid', displayName: '...',
  genderPresentation: 'user-selected', leagueEligibility: null,
  birthplace: { countryCode: 'US', regionCode: 'AR', cityId: null },
  hometown: { countryCode: 'US', regionCode: 'AR', cityId: null },
  representing: { regionId: null, eligibilityEvidence: null },
  avatar: { schemaVersion: 1, presetId: '...', appearance: {}, outfitIds: [] },
  privacy: { showCityPublicly: false }
};

• Separate birthplace, hometown and represented region; do not assume they are identical or imply national team eligibility.
• Support country → state/province → city, international regions and custom locations. Use stable IDs, not free-text as primary keys. Allow unknown/unlisted and opt-out. Do not demand exact street address; do not publicly reveal private hometown by default.
• Hometown is narrative and reputation context, not a biological ability modifier. No innate basketball ratings based on nationality, race, gender or city.
• Regional goals: City Championship, State/Province Championship, homecoming, local fan reputation, hometown hall of fame, local venue themes; national team only under historically appropriate eligibility rules.

7.2 Avatar and lifestyle

• 2D avatar creator first, not full 3D sculpting: skin tones, face shape, hair, eyes, outfit, jersey, accessories; changeable without permanent penalties.
• Share identity assets between profile and 2D court sprite where technically feasible; do not imply face editor automatically generates skeletal animation.
• My Space (later): room/apartment, jerseys, sneakers, trophies, posters, card showcases, match memories; primarily cosmetic.
• Personal BGM: import local user-owned audio, local playback only first; user consent, file type/size limits, pause/mute and mobile background behavior; no server upload or public redistribution by default. Audit existing bgm.js before adding another player.
• Social: first shareable game results, challenges via codes, collection/team showcases; then friends, clubs, async rivalry; real-time social world is long-term and requires moderation/privacy/block/report controls.

7.3 Progression dimensions

|Track           |Main loop                                              |Competitive effect                        |
|----------------|-------------------------------------------------------|------------------------------------------|
|Player Legacy   |Practice → earn minutes → role → skills → career honors|Player career only, balanced              |
|Manager Legacy  |Scouting → interviews → jobs → team construction       |Career world                              |
|Collector Legacy|Cards → albums → themed sets → showcase                |Collection; rarity not automatically power|
|Social Legacy   |Share → challenges → friends/clubs                     |No direct win-rate buff                   |
|Lifestyle Legacy|Avatar → outfits → home/music                          |Cosmetic only                             |
|History Legacy  |Branch decisions → records → timelines                 |Narrative and alternate-history simulation|

8. Women’s basketball and league configuration

• First-class women player creation and careers; not a mere male roster reskin. Allow all players to choose any supported career identity.
• MVP: custom women players and explicitly fictional league if licensed real data/rules are not ready. Later: historical WNBA careers and rosters with verified rights and era rules.
• WNBA began play in 1997. Do not place a real 1996 WNBA season into the historical simulation. Pre-1997 women’s basketball requires appropriate historical alternatives or explicitly fictional worlds.
• Introduce configurable LeagueRules: season length, period length, teams, roster sizes, draft, eligibility, salaries/contracts, foul limits, playoff format, historical franchise changes. Actual values must be researched per era; no invented defaults masquerading as facts.
• Separate athlete identity and league participation; no universal assumption that league choice maps 1:1 to gender identity.
• Historical rosters and custom fantasy leagues must be clearly labeled; cross-league exhibitions can be an optional fantasy sandbox with explicit balancing rules, not implied historical equivalence.

9. Reborn — unified time travel mode

9.1 Canonical terminology and scope

Reborn / 穿越模式 is the umbrella. Player, Coach, GM are career roles within one world. Legacy timeTravel becomes a compatible Coach/GM starting path, not a deleted mode.

Shared invariants: one authoritative timeline, historical base datasets immutable, role-specific permissions, persistent world consequences across job changes, save/reload continuity. Historical knowledge informs choices but does not guarantee outcomes.

9.2 Start configuration

• Era selection (subject to data coverage): 1984, 1996, 2003, 2016 as conceptual options; enable only supported years.
• Choose RANDOM_ROLE, PLAYER, COACH, GM.
• Difficulty/origin: UNDERDOG, BALANCED, LEGEND (meaning starting opportunity and pressure, not cheating simulation odds).
• 1996 / RANDOM_ROLE / UNDERDOG agreed sample: proposed weighted role distribution Player 50%, Coach 30%, GM 20%. These are design defaults to A/B test, not existing engine behavior.
• Two distinct starts: pre-1996 draft to influence that draft, or 1996–97 preseason for direct career. Never allow the player to rewrite an event that has already occurred in the chosen canonical start without an explicit alternate-history premise.
• Role-specific candidate pools filtered by historical year, data completeness, realistic career status and playability. Real people only when verified; otherwise clearly labeled fictional generated identity. Random seed must reproduce identity selection.

9.3 Underdog opening chapters

|Role  |Starting status                                   |First 20–40 min objective                                                |Failure still playable                         |
|------|--------------------------------------------------|-------------------------------------------------------------------------|-----------------------------------------------|
|Player|Bench fringe / camp invite / low OVR, if supported|Earn contract, minutes, trust; choose shooter/defender/playmaker training|Cut → tryouts/free agency                      |
|Coach |Video analyst / assistant                         |Scout opponent, propose adjustment, gain staff trust, interview          |Rejected → continue assistant or seek other job|
|GM    |Scout / basketball operations assistant           |Evaluate prospect, submit report, influence a decision, interview        |Recommendation rejected → build evidence       |

No automatic MVP/GM powers at start. Player cannot set trades/lineups; Coach controls strategy and rotation only if role authority allows; GM controls scouting/contracts/trades only when promoted/authorized. Decisions have visible reasons and consequences.

9.4 Career progression and transitions

• Shared conceptual dimensions: reputation, trust, authority, development, legacy. Keep separate concrete fields such as coachTrust, boardTrust, rotationRole, jobAuthority, contractStatus.
• Player stages: camp → rotation → starter → all-star → legend; coach: analyst/assistant → lead assistant → head coach → champion; GM: scout → senior scout → assistant GM → GM → dynasty builder.
• Promotions are opportunity-based (performance, trust, vacancies, team context, contracts), not simply XP thresholds.
• Career transitions later: retired player → assistant coach → head coach → GM; fired coach → assistant/consultant; GM → scouting; preserve historical events and achievements.
• Failure is not game over; include free agent, unemployment, interviews, alternative organizations and redemption arcs.

9.5 Historical branches / future knowledge

• Existing timeTravelCareer.js contains offer generation, seed selection and future-knowledge choices such as share-draft-sleeper, introduce-load-management, keep-quiet. Audit real costs/effects; reuse rather than duplicate.
• Historical facts anchor world initialization; subsequent draft/trades/rosters/player development/game results derive from the simulated world.
• Branch families: DRAFT_BUTTERFLY, TACTICAL_REVOLUTION, CAREER_BUTTERFLY, TRADE_BUTTERFLY, INJURY/ROLE_CHANGE (subject to implementation).
• Historical knowledge grants informational advantage or recommendations, not deterministic acquisition, superstar development or championships.
• Timeline event log stores actor, role, year/phase, before/after context, choice, accepted/rejected outcome, causal references and resulting state changes. Do not rely on one scalar divergenceScore to determine the future.
• 1996 sample historically notable draft context: Iverson #1, Kobe Bryant #13, Steve Nash #15; real event dates and roster state must be validated against the chosen start boundary.

9.6 Proposed save/world contract

const rebornSave = {
  schemaVersion: 1,
  session: {
    id: 'reborn-session-id', startYear: 1996,
    startPhase: 'PRESEASON', seed: 1996001,
    difficulty: 'UNDERDOG', initialRole: 'PLAYER', currentRole: 'PLAYER'
  },
  identity: { characterId: '...', historicalPlayerId: null, hometownId: null },
  career: { currentTeamId: null, contractId: null, roleState: {}, milestones: [] },
  world: {
    timelineId: '...', currentYear: 1996, phase: 'PRESEASON',
    snapshotRef: '...', events: []
  },
  legacy: { achievements: [], collections: [] }
};

Proposed, not existing. An event list alone is insufficient unless all random decisions, input versions and historical datasets are replayable. Use periodic complete world snapshots plus validated event log, or prove event sourcing deterministic. Version migrations and atomic save writes required.

10. Player ratings, NBA 2K-inspired design and balance

Do not copy proprietary 2K assets, ratings datasets or UI wholesale. Use their design patterns as comparative inspiration and verify license/source of each historical data feed.

10.1 Model layers

1. Immutable historical season/source statistics with provenance and confidence.
2. Canonical core ratings (existing three, mid, paint, pass, defense, rebound, speed, strength, stamina, iq, clutch, etc., verify actual schema).
3. Derived detailed attributes (catchAndShoot, offDribble, perimeter/interior defense, ball handling, acceleration, vertical, wingspan, etc.) only where meaningful and not double-counted.
4. Tendencies distinct from skills: frequency of 3PT/drive/pass/usage ≠ probability of make.
5. Badges / special skills, stamina/form, personality and growth ceilings.
6. Career modifiers in timeline/player instance, never overwrite base historical player data.

10.2 Specific calibration tasks

• Audit ratings2k.js anchor values including ovr:100 and decide: standard 99 ceiling or clearly named Legendary 100 scale. Do not mix scale labels.
• Audit players.js threeFg fallback and midFg approximations: FG% is not actual midrange FG%; ingest shot-zone data where available and mark estimates with confidence/provenance.
• Audit deriveSubAttributes() before adding new fields; avoid double bonuses when both three and catchAndShoot influence the same attempt.
• Review growthPaths.js paths (shooter, playmaker, defender, inside) and replace purely linear leveling with optional branching: archetype, skill thresholds, tradeoffs, ceiling, training choices, breakthrough events.
• Personality dimensions: work ethic, resilience, leadership, risk-taking, role satisfaction; avoid deterministic stereotypes. Affect training/relationships/decision outcomes through bounded, explainable modifiers.
• Historical alternate timelines: differentiate knownHistory from simulatedPotential; future breakout not guaranteed merely because it occurred in reality.
• Recalibrate by era (pace, 3PT adoption, shot distribution) while retaining comparable UI. Do not force 1996 players into 2026 shot profiles without explicit alternate-history changes.

10.3 UI for ratings

• Beginner: one archetype card + 4–6 readable categories and strengths/weaknesses.
• Advanced: detailed ratings, tendencies, badges, season/source, estimate confidence, career progression.
• Explain why a shot/lineup/training decision worked, using real factors available from matchExplain.js and simulation events.

11. Collection, market, rewards and monetization

11.1 Card collection

• Preserve existing gacha and account systems; new collection album supports season-specific player cards, championship/moment commemoratives, era sets, cosmetic frames, duplicate tracking and provenance.
• Distinguish rarity, historical significance and competitive power. Rare card ≠ automatic stronger athlete. Avoid endless OVR inflation.
• Free starter card choice or curated starter pack; new players immediately use it in a match. Do not gate Quick Play behind collection.
• Album completion, cosmetics, milestones and historical knowledge are valid rewards; rank integrity must not depend on spending.

11.2 Market/economy

• Map existing currencies, inventory, auction/market lifecycle, ownership, account identity, rewards and server authority before changing anything.
• Transactional invariant: a purchase/exchange must debit and credit exactly once or fail atomically. Never acknowledge success when persistence failed. Add idempotency keys, concurrency control, audit log, reconciliation and rollback/retry semantics as appropriate.
• Server authoritative for online ranked inventory and rewards. Offline guest progression must have explicit sync/conflict rules; never silently merge currencies or duplicate items.
• Add market protections: price bounds/anomaly alerts (if needed), anti-duplication, rate limits, bot/abuse monitoring, transaction history, fraud review.
• No real-money paid randomized card sales in MVP. Future monetization requires legal/platform review, odds disclosure, consumer protections, youth safety and licensing.
• Possible long-term revenue (OPEN): cosmetic outfits, arena themes, room décor, optional noncompetitive content; do not implement payment without explicit product/legal approval.

11.3 Reward loop

Quick Play → fun feedback → optional free cosmetic/achievement → curiosity about a player/card → collection/profile → deeper career. Reborn → meaningful decision → career consequence → legacy journal → new opportunity. No compulsory daily grind; no artificial wait timer for basic play.

12. Social, sharing and community

Phase 1: shareable result card (score, clutch decision, MVP, timeline/year), local export and challenge seed/code, privacy controls.
Phase 2: friend challenge, team/collection showcase, asynchronous comparisons, report/block.
Phase 3: clubs, cooperative historical challenges, visits to My Space, moderated communication.

Do not expose real hometown or user-uploaded music publicly without explicit opt-in. Public user content needs moderation, copyright takedown, abuse handling and age-appropriate privacy. Cross-platform account linking is OPEN.

13. Cross-cutting engineering architecture

Home / Router / Accessibility
  ├─ Quick Play & Clutch Controller
  ├─ Reborn Controller (Player / Coach / GM)
  ├─ My Legacy Profile / Collection / Social
  └─ Existing Modes (compatible)
          ↓
Mode adapters / permission & decision validation
          ↓
Shared Career World / Timeline / LeagueRules / Player Instances
          ↓
Existing GameSim + existing gameplan / skills / stats
          ↓
Domain events → animation/presentation → 2D court / results
          ↓
Versioned saves (offline) + authoritative online services

13.1 Boundaries

• GameSim: scores, possessions, stats, rules, RNG and match outcomes.
• DecisionAdapter: validates permissions and maps high-level intent to existing legal simulation controls.
• ClutchController: scenario lifecycle and one-time decisions.
• RebornController: role, career progression, offers, world advancement.
• Timeline: one authoritative mutable alternate world with immutable historical base.
• CourtRenderer: animation and input projection; never directly edits score.
• Profile/Collection: identity, cosmetics, inventory, progression; no coupling to match RNG.
• LeagueRules: league/era-specific parameters; not a giant if (gender) condition.

13.2 Save and migration

• Version all new records and preserve old save readers; provide explicit migration and rollback/backups.
• Separate LegacyProfile, ModeSave, RebornWorldSave, OnlineAccountInventory by ownership and authority.
• Save after meaningful transitions; atomic write where possible; user-visible failure recovery.
• Include data provenance and version hashes for historical roster/rating datasets in long-running timelines.
• Test legacy saves from at least one pre-migration snapshot and multiple career states.

13.3 RNG and reproducibility

• Inject RNG into simulation and mode-specific selection rather than monkey-patching Math.random() globally.
• Keep distinct deterministic streams for role assignment, world events, match simulation and presentation randomness; visual particles must not alter game outcomes.
• Replay logs record seed, ruleset/data version, decisions and simulation events. A fixed seed only guarantees replay under the same deterministic code/data versions.

13.4 Performance and security

• No heavyweight 3D assets in critical first-load path; lazy-load Reborn/collection/avatars and animation assets.
• Support low-motion 2D board fallback and offline guest play.
• Review online session/reconnect ownership, room lifecycle, account password policy, persistent economy write errors and abuse controls before growing social/market functionality.
• Privacy by default for hometown, identity and imported music; sanitize user-generated names/metadata; verify server authorization, never trust client-reported match wins or currencies.

14. Delivery roadmap and scope gates

Each phase is a separately reviewable PR series. Estimates are rough single-developer planning ranges, not commitments.

|Phase   |Deliverable                                                                                    |Rough effort                      |Gate                                                            |
|--------|-----------------------------------------------------------------------------------------------|----------------------------------|----------------------------------------------------------------|
|P0A     |Baseline audit, feature flags, design tokens, mode catalog/home IA                             |3–6 days                          |Existing modes/saves still accessible; no routing regressions   |
|P0B     |One-click Quick Play + 1 Clutch scenario + result/retry                                        |5–10 days                         |Guest first decision ≤15s target; match invariants; replay clean|
|P0C     |2D court vertical slice: 10 readable characters, routes, pass/shot animation, 3-choice takeover|8–15 days + art                   |Same match outcome as engine; mobile perf and fallback          |
|P1      |My Legacy identity, 2D avatar, hometown, archetypes, basic milestones                          |8–15 days                         |No forced account; save/migration; accessibility                |
|P2A     |Reborn unified onboarding; reuse legacy coach/GM interview and career                          |5–10 days                         |Existing timeTravel saves preserved                             |
|P2B     |1996 random-role underdog Player career slice; Coach/GM distinct authority                     |15–25 days                        |Each role completes one meaningful chapter; shared timeline     |
|P3      |Historical divergence, career transitions, journal, rating calibration                         |Iterative                         |Causality, year consistency, balance tests                      |
|P4      |Women’s career and league rules, verified WNBA history                                         |Separate research + implementation|Data/rules/licensing verified                                   |
|P5      |Album expansion, home space, local music, asynchronous social                                  |Iterative                         |Privacy, moderation, economy invariants                         |
|Research|Real-time movement / 2.5D / full 3D                                                            |Not committed                     |Prototype proves value and performance                          |

First vertical slice scope — absolutely required

1. Home opens with a prominent Play Now CTA and less clutter; legacy modes remain discoverable.
2. Guest enters a valid preset match with no signup or draft.
3. Clutch scene starts at valid Q4 state; choose three/drive/team play once; GameSim resolves result.
4. Court displays 10 players with visible team/number/ball, movement paths and a clear shot/pass animation.
5. Result screen shows score, causal explanation, retry and optional share; no duplicate timers or stale callbacks.
6. Works on desktop and mobile, with reduced-motion fallback; tests/lint pass or failures explicitly documented.

Explicitly out of first vertical slice

Full Reborn world, WNBA database, custom avatar editor, public music uploads, real-time multiplayer social city, paid gacha, new 3D physics engine, full live player movement, server-wide economy redesign.

15. Test strategy and acceptance criteria

Simulation / Clutch

• Scenario initialization validates period, clock, score, possession, lineup, fouls, stats and internal possession state.
• Miss/make/blocked/turnover/foul/offensive rebound/last-second shot/overtime/opponent response all terminate correctly.
• pace_three changes strategy bias but never guarantees make; auto late-game scripts cannot silently override player choice.
• P(3PT attempt), P(make | attempt), P(win | choice) measured separately; no uncalibrated “win chance” UI.
• Retry 10+ times, switch mode mid-animation, reload mid-match: no orphan intervals, duplicate callbacks or corrupted saves.
• GameSim scoring and stat totals remain authoritative; renderer never writes them.

Reborn / timeline

• 1996 seeded role distribution implementation and deterministic initial selection; eligible pool filters invalid records.
• Pre-draft and preseason start boundaries are correct; no impossible 1996 WNBA history.
• Player cannot perform GM action; coach cannot unilaterally trade unless specifically authorized; GM cannot command on-court player.
• One role-specific opportunity each for player/coach/GM; failed interview/cut/rejected recommendation continues game.
• Historical change persists after save/reload and role transition; base historical dataset unchanged.
• Branch event replay/snapshot restores coherent roster/contracts/draft order/champions.

Player data / progression

• No invalid OVR scale; attribute provenance and estimated shot-zone stats labeled.
• No double counting derived attributes; no uncapped badge stacking; player archetypes create distinct tendencies.
• Historical era pacing and role context checked with simulation distribution tests.

UX / platform

• Desktop, narrow mobile, touch/keyboard, reduced motion, large text, safe areas and offline mode.
• New player can identify Play Now without reading instructions; first-session user testing.
• No unlicensed media inadvertently bundled or publicly redistributed.
• npm test and npm run lint on clean install; Capacitor Android/iOS smoke tests where build environment permits.

Economy / privacy

• Failed persistence never reported as confirmed transaction; idempotent reward and purchase handling; no duplicate cards or negative balances.
• Guest identity privacy and public hometown visibility opt-in; imported audio remains local by default.
• Competitive rewards/leaderboards cannot be awarded from unverified client claims.

16. Coding agent execution protocol

Agent MUST follow this sequence:

1. Inspect repository and write baseline audit with exact file paths, APIs, save formats, test commands and conflicts with this spec.
2. Create a short ADR for first phase: alternatives, choice, risks, migration, rollback, affected files.
3. Implement only P0A, keeping existing mode IDs and saves. Run tests/lint and document changes.
4. Implement P0B in a separate patch/PR with focused unit and integration tests.
5. Implement P0C in a separate patch/PR; prove renderer is read-only projection of GameSim.
6. Stop and request approval before implementing P1+ or any breaking data schema/economy/online behavior.
7. For each PR provide: goal, changed files, exact behavior, test evidence, before/after screenshots (if UI), performance notes, save migration, rollback instructions, unresolved risks.

Do not silently redesign GameSim, rewrite app.js wholesale, delete old modes, add unreviewed dependencies, fake 2K official ratings, invent historical rosters, or replace existing online account/economy contracts. If the existing code cannot support a proposed action, document the missing engine capability and request a scoped change.

Ready-to-paste first agent instruction

Read Courtside_Legends_2.0_Master_Spec.md completely.
Treat CONFIRMED DIRECTION as product requirements; treat PROPOSED APIs
as design suggestions that must be checked against real code.
First inspect the repository and produce docs/implementation/baseline-audit.md
and an ADR for P0A. Do not modify code until the audit identifies actual
entrypoints, save compatibility, and test coverage.
Then implement only P0A: home information architecture, one dominant Play Now
entry, preserved legacy mode IDs/routes/saves, clear grouping, responsive
and accessible presentation. Do not implement Reborn, 3D, economy changes,
or unrelated refactors. Run npm test and npm run lint; report results.
Provide a file-by-file diff summary, screenshots, test evidence and risks.
Wait for approval before P0B.

17. Open decisions / required validation

|Decision                                                     |Status       |Resolution owner / timing                         |
|-------------------------------------------------------------|-------------|--------------------------------------------------|
|Historical roster licensing and real player/league imagery   |OPEN         |Product/legal before public commercial release    |
|Exact WNBA rules/data per historical season                  |OPEN         |Research before WNBA mode                         |
|99 vs Legendary 100 OVR semantics                            |OPEN         |Ratings ADR before data recalibration             |
|Historical start pre-draft vs preseason default              |OPEN         |Reborn UX validation                              |
|Player/Coach/GM random weights 50/30/20                      |PROPOSED     |Playtest; avoid treating as empirical distribution|
|Which existing event payloads support 2D animation           |OPEN         |Baseline audit                                    |
|RNG injection and replay determinism                         |PROPOSED     |Engine ADR; not required to fake in P0A           |
|Precise league/region eligibility and public hometown display|OPEN         |Identity/privacy design                           |
|Monetization, trading and public music sharing               |DEFERRED     |Legal, trust & safety and economy review          |
|Real-time direct player control / 3D                         |RESEARCH ONLY|Prototype after P0C                               |

18. Final product principles

1. The first minute must be fun; the hundredth hour must still be meaningful.
2. The player chooses a basketball life, not a maze of menus.
3. History provides context, not a predetermined ending.
4. The engine decides what happens; animation makes it memorable.
5. Every role has agency appropriate to its authority.
6. Progression creates identity and stories, not only bigger numbers.
7. The entire world remembers the consequences of your choices.
8. Build one enjoyable vertical slice before expanding the world.

North Star: A new player can press Play Now, make a clutch decision and want another game; a long-term player can begin as an overlooked athlete in 1996, become a coach or GM, and look back at a coherent alternate basketball history that exists because of their decisions.
