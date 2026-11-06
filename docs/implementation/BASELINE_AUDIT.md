# Baseline Audit — Courtside Legends 2.0 (P0A 前置)

> **文件地位**：本文是 ROADMAP/DECISIONS 两份文件的唯一事实底稿。ROADMAP.md 的每个里程碑和 DECISIONS.md 的每条决策都引用本文的章节号，不重写证据。如果以后发现这里的证据过时或错误，只改这一份，别另开第二份事实底稿。

## 0. 本次复核（2026-11-03，对照当前 HEAD `6186406`）

- 原审计（Luna，下文第 1–12 节原文保留未动）对照的是 `8e8cac4`。`8e8cac4..6186406` 共 7 个提交，不带审计引用的文件结构性改动：
  - `2ed4099`（神经刀技能）对 `sim.js` 加了 2 行 import（第 28-31 行付近）——**该文件所有第 31 行之后的引用行号整体漂移 +2**，内容/结构未变（以 `constructor()`、`calcMakeProb`、`resolvePossession` 等函数名定位，别盲信行号）。
  - `93fed1d`（2.0-plan.md 本身）、`44b117f`（市场卡属性，不涉底稿引用的任何文件）、`6186406`（`form.js`/`app.js` 信心値修复，不涉底稿引用的任何文件）。
  - `docs/Courtside_Legends_2.0_Master_Spec.md` 换成了格式完整版（+889/-），正文 99.8% 相同（WORKNOTE R131 已记录）——对本文引用的 spec 章节号无影响。
- **实测复核（4 项，全部通过）**：
  1. `GameSim` 构造函数（现 `sim.js:101-111`）仍是 `{home, away, youSide="home", onEvent, onTick, onEnd, injuries=false, speed=1, lang=null}`——**无 seed/rng 参数**，与第 2.6 节结论一致。
  2. `modeCatalog.js` 的 `MODE_GROUPS` 导出仍不含 `legend`/`sandbox`/`duel`/`family-duel`——与第 1.1 节缺口一致。
  3. `saveRoot.js` 的 `ROOT_SAVE_VERSION = 3`，`schemaVersion` 高于/低于 3 都拒读，**无逐版本迁移函数**——与第 4.1 节一致。
  4. **重新跑了一遍 `scripts/research/clutch-choice-probe.mjs`**（G1 的实证脚本，1500 次/行）：当前 HEAD 上结果与 2.0-plan.md 记录的基线**完全一致**（Q4 选中/不选都是 5%，Q2 都是 4-5%，库里全场仍占 43%）——**G1 不是过时证据**，是可重复的当前行为。
- `npm test` 重跑结果：**1541/1541**（比 2026-11-02 记录的 1531 多 10 条，全是本审计无关的其他功能新增测试）；`npm run lint`：0 错误，2 个已知与本次改动无关的 warning（`app.js:82` `coachSpecialty`、`tests/onlineEconomy.test.js:23` `fakeStore`）。
- **未复核项**：第 1-9 节其余所有具体行号引用（即使未受上述 7 个提交影响）仍是 Luna 当时的逐行确认结果，本次复核没有逐条重跑——这也是为什么要把本次复核范围诚实写清楚，而不是笼统地说“已审查通过”。哪个里程碑实际开工前，建议对其直接依赖的引用再做一次 `grep -n` 复核，成本很低。

## 0b. 2026-11-05 对照 HEAD `b64e660` 的状态标注（只标注，不改下文原文）

下文仍是 `8e8cac4` 时的证据；这里只说明哪些已经被后续提交解决或改变，**不要再把它们当当前 Blocker**。

| 条目 | 状态 | 依据 |
|---|---|---|
| §1.1 "catalog 未收录 `legend`/`sandbox`/`duel`/`family-duel`" | ✅ **已解决** | `modeCatalog.js` 现含 `sandbox`、`legend`、`duel`、`familyDuel`（在 `quick-variants` 等组下），相关测试通过 |
| 首页模式入口（§1.2）：单赛季独立卡 | ✅ **已变更** | `b8f7bc7`：单赛季并入联盟经理设置页的"经营长度"，首页不再有独立卡；`season` 内部 ID 与旧存档保留 |
| 首页账号入口（访客是否被账号挡住） | ✅ **已变更** | `9739461`：访客优先，账号功能点到才弹提示 |
| 穿越卡文案"经理兼教练、五年" | ✅ **已变更** | `869aa41`：改为"经典 · 经理兼教练 + 其余职业开发中"，去掉"五年" |
| "进攻托管覆盖玩家防守战术"（§6.1 相关） | 🟡 **最小修复已完成** | `a59bdab`（B34）；战术槽完全拆分仍未做，另起 ADR |
| §2.6 RNG 不可注入 | 🔴 **仍然成立** | 复核：`sim.js` 47 处、`skills.js` 51 处、`chemistry.js` 1 处、`intangibles.js` 2 处 `Math.random`。注入方案见 `M2b-clutch-decision-design.md`（PROPOSED） |
| §2.3 / G1 玩家选的出手人不兑现 | 🔴 **仍然成立** | 未改动 `resolvePossession`；M2b 处理 |
| §4.1 存档无逐版本迁移 | 🔴 **仍然成立** | `ROOT_SAVE_VERSION = 3`，M4 前另审 |
| §4.3 timeTravel 存档无身份字段 | 🔴 **仍然成立** | ADR-006（✅ APPROVED）的 R1 处理 |

- **本次来源提交**：`b64e660`（`main`）。未重跑 §1–§11 的逐行引用，只核对了上表各行对应的代码事实。

## 程础：本审计各节→里程碑门控表（用户指定的 P0A/P0B/P0C/P0D/P1/P2+ 命名）

本审计原本按系统模块分节（府线 1-12），不是按里程碑分节。下表是反向索引，把每个里程碑真正依赖的证据章节指出来，详细里程碑定义见 `ROADMAP.md`。

| 里程碑（用户命名） | canonical id | 依赖的本文章节 | 一句话结论 |
|---|---|---|---|
| P0A 首页重设与模式整理 | M1 | §1.1、1.2、1.3，§4.2（Continue 面板），§10.10/10.11，§12 | 目录不完整且与 `homeTabs` 两套事实来源；无 Play Now 主 CTA；但没有引擎/存档风险，纯 UI+目录整理 |
| P0B 一键开打 + 新手引导 | M2a（新拆，见 DECISIONS ADR-003） | §1.3（`quick` 进 `openSetup`），§8.2（游客边界已满足），§10.11 | 低风险：主要是跳过 setup 确认的路由改动，游客边界本就满足 |
| P0C 绝杀挑战 + GameSim 接入 | M2b（新拆） | §2.3（终场脚本优先级）、§2.4（shot clock/犯满）、§2.6（RNG）、§9（`initializeScenario`/`ClutchController`/`PlayerDecisionAdapter` 裁决）、§10.1/10.2，G1（本节已重跱实测） | 高风险：**用户选的出手人不被兑现**，要动 `resolvePossession` |
| P0D 2D 球场可视化 + 战术接管 | M3 | §5（CourtView）、§3（事件载荷）、§6.1（`gameplan.js`）、§10.3/10.8 | 渲染是 DOM + 3 路独立 rAF，无统一动画队列；事件是回合总结级，需快照差分+补 emit |
| P1 My Legacy（身份/捷脸/家乡/成长） | M4 | §4.1（账号）、§9（identity schema: new）、§4.3（存档版本策略） | 身份 schema 不存在，但可复用 `avatarArt.js`；必须先过存档迁移门槛 |
| P1 Unified Reborn（球员/教练/GM 职业） | M5–M7 | §4.3（timeTravel 存档）、§9（`rebornSave`: adapt）、§6.1（战术层） | 教练线 A–C 已完成可直接复用；球员/GM 视角是全新开发 |
| P2+（WNBA/历史分支/收藏/社交/音乐/市场） | M8 + 研究项 | §8（经济/音乐/在线）、§6.2（`ratings2k.js` OVR 100 封顶） | WNBA 无数据无版权，社交需账号+审核后端，近期不可行；本地音乐选曲**已实现**（§8.3） |

---

- 审计对象：`main` 分支 HEAD `8e8cac4`（2026-11-03，含已归档的 2.0 主 spec）。
- 对照文档：`docs/Courtside_Legends_2.0_Master_Spec.md`（v1.0，2026-11-03）。
- 方法：只读。代码证据均为文件:行号；本机 Linux VM 无 Chromium/playwright 浏览器，`scripts/qa/` 未执行（该限制在仓库内已知）。
- 结论口径：`exists` = 现成可用；`adapt` = 有雏形、需改造；`new` = 不存在、需新建。
  文中“当前 main”均指审计时 HEAD；spec 自称基于 ZIP 快照，实现细节以当前 main 为准。

## 1. 模式入口

### 1.1 模式目录：`js/data/modeCatalog.js`（115 行）

`MODE_GROUPS` 共 3 组：

- `core`：`timeTravel`（穿越生涯，featured）、`franchise`（联盟经理，featured）。
- `quick`：`custom`（自定义对战，featured）、`ranked`、`season`、`career`、`tournament`。
- `quick-variants`（`parentModeId: "custom"`，`collapsedByDefault: true`）：`draft`（`variantOf: "custom"`）、`quick`（快速演示，`variantOf: "custom"`）。

工具函数：`allModes`、`modeById`、`variantsOf`、`validateCatalog`（重 id / 未知 `variantOf` / 未知 `parentModeId` 均抛错，`modeCatalog.js:94-113`）。
文件头注释自述：只做分组、不改行为，是“可逆的第一步”。

**缺口**：catalog 未收录 `legend`、`sandbox`、`duel`、`family-duel`。P0A 的“单一可信目录”须先补齐，否则 catalog 与 `homeTabs` 是两套事实来源。

### 1.2 首页与路由

- `index.html:99-101`：首页 tab 只有 3 个（`data-category="players|career|custom"`，即我的球员 / 职业经理 / 自定义）。屏幕共 19 个 `id="screen-*"`（home、setup、game、result、custom-hub、draft、season、time-travel、tournament、sandbox、legend、family-duel、account、collection、draw、market、onboard、credits、loading）。**无 Play Now 主 CTA**。
- `js/app.js` 无 router。`show(name)`（`app.js:472-480`）仅切换 `.active` class；模式按钮 `.mode-card[data-mode]` 点击进 `startMode`（`app.js:1185-1186`）；`startMode`（`app.js:1189+`）是 if/else 分发：`timeTravel→openTimeTravelScreen`、`ranked→startRankedMatch`、`custom→show("customHub")`、`season|franchise→openSeasonScreen`、`quick→autoFillTeam×2→openSetup`、`legend→startLegendMode`、`career→startCareer`、`tournament→show("tournament")`、`sandbox→openSandbox`、默认 `→initDraft+show("draft")`。`state.lastMode || "quick"`（`app.js:1434`）用于恢复上次模式。
- `js/ui/homeTabs.js`（61 行）：`HOME_CATEGORIES` 数据 + `wireHomeTabs` 纯 DOM glue（点 tab 显示对应 panel，默认 `career`）。注意其模式表与 catalog **不一致**：players 组只有 `ranked`；career 组为 `timeTravel, franchise, season`；custom 组为 `career, custom, tournament, draft, sandbox, quick`。`legend`、`duel`、`family-duel` 两边都不收录。
- `js/ui/homeShowcase.js`（91 行）：只负责展示——`HOME_LEGENDS`（9 位传奇）照片墙 `renderLegendsWall` + 模式卡照片装饰 `decorateModeCards`，图片来源 `photo.js`。

### 1.3 现有模式与 spec 映射表的对照

spec 第 3 节的映射（quick→Quick Play、custom→Free Match、draft→Draft variant 等）是**改名/分组提案**，不是现状。现状：`quick` 仍是“快速演示”，进 `openSetup`（需 setup 确认，非一键开打）；`draft` 已是 `custom` 的 `variantOf`，与 spec 的 GROUP 方向一致。

## 2. 模拟器 API：`js/engine/sim.js`（GameSim）

### 2.1 构造与回调

- 构造函数（`sim.js:99-130`）：参数 `{home, away, youSide="home", onEvent, onTick, onEnd, injuries=false, speed=1, lang}`。**无 seed / rng 参数**。
- `emit(type, text, meta=null)`（`sim.js:2316-2321`）组装 `{type, text, ...snapshot(), meta?}` 调 `onEvent`；`onTick(snapshot)` 每回合后触发；`onEnd(snapshot)` 结束时触发。
- `GameSim.fromSave(data, {onEvent, onTick, onEnd})`（`sim.js:222-262`）可恢复中断比赛：还原 `quarter/clock/score/possession/timeouts/defensePlan/momentum/paused/breakReason`，但要求 `data.home/away` 含完整 roster。**它只能恢复已有比赛，不能凭空捏造初始局**，且会 overwrite wrapped teams——不能替代 `initializeScenario()`。

### 2.2 关键控制 API

- `setFocusPlay(focusId)`（`sim.js:1386-1398`）：校验 `FOCUS_PLAYS`，合法则 `focusPlay={id,label,ttl:6}`（约 6 个进攻回合），非法则清空并返回 false。**队级**：`resolvePossession` 里只对 you 队取 `this.focusPlay`（`sim.js:640`）。
- `setTempo(tempoId)`（`sim.js:1399-1408`）：持久写入 `gameplan.tempo`，注释说明在暂停/节间改；效果走 `getTempoDef`。
- `setOffenseFocus`（`sim.js:289`）：指定持球人 + 打法，死球设置。个人级现仅此与 per-player `orders`，无个人 dribble/pass/shoot 命令。

### 2.3 回合流程与终场脚本优先级（P0B 第一道题）

`resolvePossession`（`sim.js:607+`）：`forceOutInjured` → `maybeCpuManage` → `maybeManagedCoach` → quiet 模式轮换 → `paused` 检查 → 场上人数检查 → **`applyLateGameScripts`（`sim.js:636`）** → lateChase 覆盖 → putback → `pickBallHandler` → 出手/犯规/失误/篮板分支 → 时钟 `clock -= used`（`sim.js:782`），`used = clamp(rand(8,20)/pace, usedLo, usedHi)`（`sim.js:770-781`，受 tempo/focus 上下限约束）。

`applyLateGameScripts`（`sim.js:2868-2920`）与 `lateGameInfo`（`sim.js:2834-2862`）：

- `late = Q4 或 Q3 clock≤90`；`chasing = 落后 1–9 分且 clock≤150（或 ≤6 分 & ≤200，或 ≤3 分 & ≤240）`；`needThree = 落后 3 分 & ≤90s，或 4–6 分 & ≤48s，或 1–2 分 & ≤18s，或 1–3 分 & ≤12s`。
- chasing 分支**覆盖玩家决策**：当 `needThree` 且进攻方是你时，`sim.focusPlay` 被重写为 `pace_three, ttl:10`（`sim.js:2887-2891`），并把 `offenseFocusId` 指给最佳三分手；随后 `resolvePossession:644` 的 chase 分支又以 `ttl:99` 的 `pace_three` 覆盖。
- 战术犯规分支（`wantIntentionalFoul`：落后 1–6 分、clock 2–36s）经 `tryIntentionalFoul`（概率 clock≤12 时 0.92、≤24 时 0.78、否则 0.58）返回 true 时**直接消费本回合**。

**结论：玩家决策目前没有优先权，终场脚本赢。** spec 的“玩家决策优先”不是现有行为，P0B 须新立优先级规则。另：`lateGameInfo` 的 chasing 窗口比 spec 的 clutch 场景（8–24 秒、落后 1–3 分）更宽——场景初始化必须显式设定 clock/score，不能依赖脚本自然进入。

### 2.4 时钟 / 节 / 加时 / 犯规

- `QUARTER_SEC = 720`（`sim.js:88`）；`nextQuarter`（`sim.js:560+`）：Q4 结束分差≠0 则 `finish()`，否则 `quarter+1`，加时 `clock = 300`（`sim.js:568`），球权按节奇偶轮换。
- **无 shot clock 字段**（全仓 grep 无 `shotClock`）。
- **犯满离场规则未发现**（无 `pf>=6` 相关处理）。球员个人 `pf` 在 sim 内部 `stats.pf` 累计（`sim.js:822,909,1199,1227,2929,3005`）。

### 2.5 `snapshot()` 字段（`sim.js:2321-2347`，已逐行确认）

`quarter, clock, score{home,away}, possession, home/away(publicTeam), youSide, timeouts, defensePlan{...assignments}, paused, breakReason, momentum, focusPlay{...}|null, offenseFocusId, autoOffense, autoDefense, autoRotation`。

**无 shot clock、无球队犯规总数。** `publicTeam` 经 `slim()`（`sim.js:2621`）压缩球员卡；球员个人 `pf` 是否进 `publicTeam`、以及犯规总数如何呈现，P0B 初始化校验时须确认。

### 2.6 随机性

全局 `Math.random`（`sim.js` 数十处；`rand(a,b) = a + Math.random()*(b-a)`，`sim.js:4427-4429`）。`js/core/seededRandom.js` 只提供 `shuffle/seededStream/hashSeed`（洗牌/选择类用），**sim 不用**。spec 的“确定性重放需单一注入 RNG 路径”目前不成立——在注入完成前，测试只能测不变量/分布（spec 自己留了这条退路）。

## 3. 事件载荷

`emit` 的字面类型只有 5 种（`sim.js` grep 统计）：`coach`（43 处）、`dunk`（1 处）、`miss`（4 处）、`reb`（2 处）、`score`（1 处）。`sparkTeamFromHighlight`（`sim.js:2739`）的 block/dunk 振奋也以 `coach` 类型发出，**没有 `block` 类型**。meta 形状：`meta.shot = {shooterId, made, pts}`（仅跳投分支，`sim.js:1241`）、`meta.skill = {id, playerId, isOffense}`（`sim.js:837`）、`meta.player`（扣篮，`sim.js:1118`）。粒度是**回合总结级**（每回合 1 次 score/miss/reb + 若干 coach 文本），不是逐动作。

spec 拟议 11 类事件逐个裁决：

| 拟议事件 | 裁决 | 证据 |
|---|---|---|
| POSSESSION_START | 可由 snapshot 差分推导 | 无独立事件；`onTick` 的 `possession` 翻转可见 |
| PASS | 没有 | 仅 35% 概率的 coach 文本（`sim.js:974`），无结构化字段 |
| MOVE | 没有 | `court.js` 用战术站位插值，非事件驱动 |
| SHOT_ATTEMPT | 没有独立事件 | score/miss 的 `meta.shot` 只在跳投分支有；犯规/罚球事件无（`app.js:6481-6490` 注释自述） |
| SHOT_RESULT | 直接有 | `score`/`miss` + `meta.shot`（跳投时） |
| REBOUND | 直接有（类型有，球员字段无） | `reb`（`sim.js:3086,3094`），攻/防在文本中区分，rebounder 只在文本名字里，无结构化 id |
| FOUL | 没有独立类型 | 以 `miss` 文本 + `shootFts` 的 score/miss 呈现，犯规人只在文本里 |
| TURNOVER | 没有独立类型 | 以 `miss` 文本呈现 |
| SUBSTITUTION | 可由 snapshot 差分推导 | 无事件；`onTick` 的 `onCourt` 变化可见 |
| PERIOD_END | 半直接 | `_quiet` 模式 emit coach 文本“第 X 节开始”；真实对局靠 `setPaused` + `snapshot.paused/breakReason` 推导 |
| MATCH_END | 间接 | `onEnd(snapshot)` 回调，无事件类型 |

现有唯一事件→表现映射：`app.js:handleSimEvent`（`app.js:6468-6506`）：`dunk→court.onDunk`（早退，后续 score 事件仍进 feed）、`meta.shot→court.onShot`、`meta.skill→skillPop`，最后 `pushFeed + paintScore`。

## 4. 存档结构

### 4.1 根存档与版本策略

- `ROOT_SAVE_KEY = "cls_root_v3"`，`ROOT_SAVE_VERSION = 3`（`js/data/saveRoot.js:7-8`）；临时键 `cls_root_v3_tmp`；legacy 键 `cls_savegame_v1`、`cls_season_v1`（`saveRoot.js:11-12`）。
- `createRootState`（`saveRoot.js:444-453`）：`{schemaVersion, savedAt, activeMode, profile{accountId, settings, accessibility}, coach, leagueCareer, story, liveGame}`。
- **版本策略（注意）**：`validateRoot` 对 `schemaVersion > 3` 抛 "newer game version"，`< 3` 抛 "unsupported older game version"（`saveRoot.js:341-345`）——**没有逐版本迁移函数**；`migrateLegacySaves`（`saveRoot.js:595+`）只做 v1 legacy 键向 v3 的搬运。新 `rebornSave` 字段须走 `schemaVersion` 升级 + 兼容读，否则老存档会被判 "unsupported older"。
- 写失败处理：`writeRootSave`（`saveRoot.js:470+`）走 tmp 写 + 回读校验 + 提交；失败抛 `StorageWriteError`（`saveRoot.js:462-466`）；`writeRootSaveFreeingOrphans`（`saveRoot.js:503-511`）仅对 `StorageWriteError` 触发清理孤儿并重试一次；`liveGame.feed` 截断保留 24 条（`saveRoot.js:422-424`）；`compactSeasonForStorage` 压缩赛季。

### 4.2 账号与游客

- 账号键 `cls_accounts_v1` + `cls_active_account`（`js/data/account.js:STORE_KEY/ACTIVE_KEY`），本地多账号绑定；账号对象含 `gold`（`account.js:190`）。
- 游客边界：`quick` 不校验账号（`startMode` 直接 `autoFillTeam→openSetup`）；`ranked` 依赖账号班底；在线 guest 可打 casual（`server/online-server.mjs` 头注释 P3）。
- Continue 面板：`app.js:948-963` `refreshSaveHomeBar` 读 legacy `peekSave`（`js/data/savegame.js`，`SAVE_KEY = "cls_savegame_v1"`，`savegame.js:6,32-41`）。其与 root v3 的关系：legacy 键仍存在，`migrateLegacySaves` 负责向 v3 搬运；P0A 的 Continue 面板须确认以哪一处为准，避免两处事实来源。

### 4.3 timeTravel 存档

- 序章 `createTimeTravelPrologue` 返回 `{year, philosophy, seed, origin, offers, selectedOfferId}`（`js/modes/timeTravelCareer.js:188-198`）；接受 offer 后生成 `createSeason({mode:"historical", year, seed})` + `createLeagueCareer({kind:"timeTravel", storyId: "tt-year-seed"})` + `recordCareerEvent(accepted-offer)`（`timeTravelCareer.js:200-293`）。
- `root.story` 含 `futureKnowledge`、`frontOfficeTrust`、`flags`、`promises`（`timeTravelCareer.js:265-266,296`；`js/modes/careerContract.js:98,132,149`）。持久化走 root save 的 `leagueCareer` / `story` 字段（`app.js:664-680` 等读写 `active.leagueCareer`）。
- Reborn 统一存档契约（`rebornSave`）尚无统一 schema（无 session/world/legacy 分层、无 timeline 事件 log 契约、无 snapshot+event 混合持久化证明）——见第 8 节裁决。

## 5. 渲染：`js/engine/court.js`（CourtView）

- DOM 渲染（非 canvas）。坐标系：前场 slot `y=0` 近筐、`y=100` 近中线（`court.js:10-12` 注释）；8 套战术站位 `SETS`（balanced/triangle/smallball/iso_heavy/grind/motion/pace_space/morale_boost）；slot 顺序恒 `C→PF→SF→SG→PG`（`lineupForSlots`，`court.js:84`）。`toCourt(slot, attackingUp, phase)` 把前场相对坐标映射为全场百分比坐标（`x clamp 8–92, y clamp 6–94`），`phase 0→1` 用 `easeOut` 从后场插值推进到前场。
- **进攻方向固定**：`attackingUp = possession === "home"`（home 向上攻，away 篮筐在 top）；**无左右翻转 API**，方向由球权决定。
- 渲染元素：`.fullcourt` markings（baseline/sideline/half/circle/key/hoop/backboard/zone-tag），`#court-ball`，`#court-tokens`（球员 token：照片或简易胶囊，`SIMPLE_MODE_KEY` localStorage 切换，`court.js:137-168`），`#court-formation` 标签，`court-mode-btn`。
- 动画/取消：`render(snap)` 每 tick 重绘 + rAF 持续插值（`court.js:331-334`：`cancelAnimationFrame(this._raf)` 后循环）；`onShot`（`court.js:339+`，`_shotRaf`）、`onDunk`（`court.js:424+`，`_dunkRaf`）各一路独立 rAF，`skillPop`（`court.js:515+`）900ms timeout pulse；新 possession 时 `_suppressShotFor=null`。**没有统一动画队列**（3 路独立 rAF + 1 timer，无入队/优先级）；取消机制仅是 `cancelAnimationFrame` 换帧。
- `app.js` 比赛画面入口：`state.court = new CourtView($("#court-root"))`（`app.js:981,6380`）；`onTick → court.render(snap)`（`app.js:1023-1029,6419-6425`，try/catch 包裹，注释说明渲染错不能阻断时钟，`app.js:6448`）；`handleSimEvent → onDunk/onShot/skillPop`（见第 3 节）。

**对 P0C 的含义**：spec 的“动画队列/取消”需新建或重构；现有取消仅是换帧。渲染是 DOM，PixiJS 须先有 DOM/SVG 瓶颈实测才能立项。

## 6. 战术与规则 / 球员数据层

### 6.1 `js/engine/gameplan.js`

- `FOCUS_PLAYS` 5 个：`iso_star`（核心单打）、`post_up`（内线要球）、`pace_three`（提速三分）、`slow_pace`（拖慢节奏）、`hunt_mismatch`（清侧翼错位）。
- `TEMPO_OPTIONS` 3 个：`grind`（`paceMult 0.7, makeBonus +0.032, openBonus +0.045, tovMult 0.78, used 14–28`）、`normal`（`1/0/0/1/6–24`）、`push`（`paceMult 1.32, makeBonus -0.024, openBonus -0.035, tovMult 1.22, used 4–14`）。
- `PLAYER_ROLES` 5 个；`LINEUP_PACK_DEFS` 3 个；`ORDER_USAGE` 6 个（auto/organize/score/balanced/defend/hustle）；`ORDER_ATTACK` 6 个（auto/paint/perimeter/mid/foul_hunt/putback）；`ORDER_ACTION` 含 auto/pnr/drive_kick/iso/spot/post/crash 等。
- `pace_three` 与 `push` 的 tradeoff：`pace_three` 在 sim 内 `pace *= 1.22`（`sim.js:766`）并置 `pushFocus`（`sim.js:802`），其“提高三分比重”走出手选择逻辑；`push` 的代价是命中 −0.024、空位 −0.035、失误 ×1.22，换回合数——与 spec“不要盲目叠加 setTempo('push') + pace_three + lateChase”一致，且三者确实会叠加（`sim.js:770-781` 的 used 上下限同时受 tempo 与 focus 影响）。Clutch 的 Drive / Team Play 目前**没有**现成的个人级映射，须走 DecisionAdapter（见第 8 节）。

### 6.2 球员数据层

- `js/data/players.js` 球员卡字段（`players.js:193+`）：`id, name, nameEn, season, team, teamLabel, pos, nbaId, bref, photo, photoSource, twilight, scoring, three, mid, paint, defense, rebound, pass, speed, strength`（+ stamina/iq/clutch/steal/block 等）。
- `threeFg` 回退 `tp || 0.28 clamp 0.05–0.5`（`players.js:126`），`midFg = fg*0.95 clamp 0.28–0.55`（`players.js:128`）——**FG% 不是真实分区命中率**，spec 的 provenance 审计点成立。
- `js/data/ratings2k.js`：`HAND_ANCHORS_2K` 手工锚点 + `SCRAPED_ANCHORS_2K`（scraped 冲突时胜出）；**`ovr:100` 存在**，如 Jordan 1991（`ovr:100, scoring:100, clutch:100`，注释 "Peak Jordan = season OVR 100 (cap)"，`ratings2k.js:35-47`）——100 是 cap 而非标准 99 上限，spec 的 OPEN 点成立，P3 前须 ADR 定标。
- `deriveSubAttributes`（`players.js:1275-1338`）：返回 `{handle, perimDef, interiorDef, catchShoot, offDribble, offReb, defReb}`，全部 clamp 15–99（`offReb` 下限 10）。
- `skills.js`：`SKILL_PACKS`（`skills.js:11` 起）；沿用先前审计结论：**94 技能全部接线**（sim 调用点如 `trySignatureOffense` `sim.js:990-1010`、`calcMakeProb` 内 `skillMakeBonus` `sim.js:4119` 与 `sigMakeBoost` `sim.js:4127`）。

## 7. 测试与工具

- `package.json`：`test = node --test tests/*.test.js`；`lint = eslint js scripts tests server`；`mobile:*` 为 Capacitor；devDeps：`eslint ^9.39.5`、`playwright-core ^1.64.1`（仅 core，无浏览器 binary）；deps 仅 `ws`。
- `tests/`：约 151 个 `.test.js` 文件（`ls` 计 153 项，含 `fixtures/`、`helpers/` 两个目录）。上次全量实测 **1531/1531**（2026-11-02；本次审计未重跑全量）。
- `.github/workflows/test.yml`：ubuntu-latest + Node 22 + `npm ci` + `npm run lint` + `npm test`；注释说明 `ws` 必装（在线测试 import 它），以及 lint 曾抓到测试覆盖不到的 import 缺失 bug。
- `scripts/qa/`：`README.md` + 约 10 个 `.mjs`（`banner-explain`、`career-buzz`、`career-contract`、`career-coach-xp`、`career-epiphany`、`career-finance`、`career-game-goals`、`career-growth` 等）。**本机 VM 无 Chromium/playwright 浏览器，不可跑**（仓库内已知结论）；且 eslint 覆盖 `scripts/`。

## 8. 经济 / 音乐 / 在线

### 8.1 货币与抽卡

- 货币：`gold`（¤，`account.gold`，`account.js:190` 初始 0；来源：抽卡返金 `goldForPull`（`gacha.js:260`）、教练声望、比赛奖励胜 40 / 负 12（`account.js:478`））；**抽卡券**（`accountGacha.js:110`：免费日抽 → 抽卡券 → 金币的支付顺序）；`EXTRA_DRAW` 加抽机制（`accountGacha.js:102`）。**未发现 gems/钻石等第二货币**（grep 仅见 gold + 抽卡券）。
- 抽卡：`gacha.js`（`RATE_TABLE` + pity 保底；`MAX_STARS`）；`accountGacha.js`（日抽/金币抽/重复处理/按 band 用 gold 合成指定 wishlist 赛季卡，`accountGacha.js:273-281`）。

### 8.2 在线服务：`server/`

`online-server.mjs`（WS，默认 :3001，room-code 1v1 + 匹配队列）+ `online-accounts.mjs` + `online-decisions.mjs` + `online-economy.mjs` + `online-frame.mjs` + `online-prizes.mjs` + `online-ratelimit.mjs` + `online-transport.mjs`。头注释自述：P0 瘦帧 <8KB、20s auto-resume、injuries off；P1 旁观 + 30s 断线宽限后判负、帧差分；P2 按球队 OVR ±2 匹配；P3 server 账号（scrypt 哈希、文件持久化于 served repo 树之外）+ Elo（K=32，起 1000）+ 按 rating ±100 的排位队列；guest 仍可 casual；**career online economy 仍 out of scope**。协议：server→client `welcome/room/joined/frame/frame_delta/event/decision_applied/decision_rejected/game_over/opponent_disconnected/opponent_back/queue_status`；client→server `create/join/spectate/queue/decision`。本地胜负记录在浏览器（`js/online/record.js`）。

**边界**：server 权威仅覆盖在线 1v1 房间/排位（Elo、帧、决策）；P0A/P0B 的离线 Quick Play 与在线无耦合——符合 spec“隔离”要求，但别把在线结算复用到离线。

### 8.3 音乐：`js/data/bgm.js`

- 默认 `assets/audio/basketball-bgm.mp3`（仓库不收录版权曲，文件头注释要求自备合法音源）；LS 键 `courtside-bgm-on` / `courtside-bgm-vol`（默认音量 0.32，loop 播放）。
- **已支持本机文件“选曲”**：`input type=file accept="audio/*,.mp3,.m4a,.ogg,.wav,.flac"` → `URL.createObjectURL` 本地播放（`bgm.js:114-131`）；**无服务器上传、无公开分享**——spec 的“local playback only first”现状已满足。spec P5 的“本地音乐”部分已实现；但无播放列表/房间/社交分享，别重复造播放器。

## 9. 拟议 API 逐个裁决

| 拟议 API | 裁决 | 证据 |
|---|---|---|
| `initializeScenario()` | new | 全仓 grep 零命中；最接近的是 `app.js:1225-1229` 的 quick 路径（`autoFillTeam→openSetup`，仍需 setup 确认）与 `sim.js:222` 的 `fromSave`（仅恢复已有比赛，不可凭空捏造初始局）；spec 要求的“不伪造 snapshot + 不变量校验”须新工厂函数 |
| `ClutchController`（READY→AWAITING_DECISION→RESOLVING→CONTINUING→COMPLETED） | new | 全仓无此状态机；最接近的是 `snapshot()` 的 `paused/breakReason` 字段（`sim.js:2321+`）与 app.js 的时钟/暂停控制 |
| `DecisionAdapter`（意图→合法控制校验器） | adapt | 已有映射层雏形 `setFocusPlay`（`sim.js:1386`）、`setTempo`（`sim.js:1399`）、`setOffenseFocus`（`sim.js:289`）+ `gameplan.js` 选项表；缺的是统一的权限、死球点、锁校验器 |
| `PlayerDecisionAdapter`（个人级接管） | new（核心缺口） | 不存在；`setFocusPlay` 是队级的（`resolvePossession` 仅对 you 队取 `focusPlay`，`sim.js:640`）；个人级现仅有 `setOffenseFocus` 与 per-player `orders`；无个人 dribble/pass/shoot 命令与引擎钩子 |
| Domain event adapter（typed event schema） | adapt | 可基于现有 `emit`（5 类 + 全量 snapshot 载荷，`sim.js:2316`）搭建，但事件是回合总结级、文本为主，POSSESSION_START 等须由 snapshot 差分或新增 emit 补齐（见第 3 节表） |
| `LeagueRules` | new | 全仓 grep 零命中；规则常量目前分散：`QUARTER_SEC`（`sim.js:88`）、加时 300（`sim.js:568`）、`SEASON_*`（`js/engine/seasonMarket.js`）、球队数/选秀规则散在 `season.js`；需新建集中配置 |
| Reborn 统一存档契约（`rebornSave`） | adapt | 可基于现有 `createRootState`（`saveRoot.js:444`：`schemaVersion/profile/coach/leagueCareer/story/liveGame`）+ timeTravel prologue/leagueCareer/story 模型搭建；但无统一 schema（无 session/world/legacy 分层、无 timeline 事件 log 契约、无 snapshot+event 混合持久化证明） |
| My Legacy identity schema | new | 不存在；最接近的是 `profile{accountId, settings, accessibility}`（`saveRoot.js:447`）+ 账号卡（`account.js`）；`birthplace/hometown/representing/eligibility/privacy` 全无 |
| `attemptId`/generation token | new | 全仓 grep 零命中（除选秀权 token 外）；现有仅有 `sim.paused/breakReason`、`court.js` 的 `_shotRaf/_dunkRaf` cancel（`court.js:352,416,432,498`）与 `app.js:1023-1032` 的 try/catch 包裹渲染——无跨 Retry/切模式的代际令牌 |
| P0A 首页 IA（Play Now 主 CTA + Continue 面板） | adapt | 可基于现有 `modeCatalog.js` + `homeTabs.js` + Continue 条（`app.js:948` `refreshSaveHomeBar` + `#save-home-bar`）+ `show()` 路由（`app.js:472`）搭建；缺的是 Play Now 主 CTA 本身（无此按钮），且 `quick` 目前进 `openSetup`（需 setup 确认，非一键开打） |

## 10. 与 spec 冲突或需注意的点

1. **终场脚本优先级（已证实冲突）**：玩家 `setFocusPlay` 会被终场脚本覆盖（`sim.js:2887-2891` 的 `pace_three ttl:10`，以及 `sim.js:644` 的 `ttl:99` 覆盖）。spec 的“玩家决策优先”目前不是现有行为，P0B 须新立优先级规则。另：`lateGameInfo` 的 chasing 窗口比 spec 的 clutch 场景更宽——场景初始化必须显式设定 clock/score，不能依赖脚本自然进入。
2. **RNG 不可注入（已证实）**：GameSim 无 seed/rng 参数，全局 `Math.random`；`js/core/seededRandom.js` 只覆盖洗牌/选择类。spec 的“确定性重放需单一注入 RNG 路径”目前不成立——在注入完成前，测试只能测不变量/分布（spec 自己留了这条退路）。
3. **事件粒度不足（已证实）**：11 类拟议事件中仅 SHOT_RESULT、REBOUND 有直接类型；PASS、MOVE、FOUL、TURNOVER、SUBSTITUTION、POSSESSION_START 均无，须由 snapshot 差分或新增 emit 补齐；且 `meta.shot` 只在跳投分支有，犯规/罚球事件无。
4. **ZIP 快照 vs 当前 main**：spec（2026-11-03）自称基于 ZIP 快照，而当前 main HEAD 已是 `8e8cac4`（2026-11-03，归档 spec + 认领审计），含 11-02 的 trade shapes、game goals 等提交。spec 内“快速演示”等描述仍与当前 `index.html` 一致，但实现细节须以当前 main 为准（spec 自己也要求如此）。
5. **存档版本策略**：root v3 对低版本直接拒绝（`saveRoot.js:341-345`），无逐版本迁移；新 `rebornSave` 字段须走 `schemaVersion` 升级 + 兼容读，否则老存档会被判 "unsupported older"。
6. **OVR 100 标尺**：`ratings2k.js` 锚点用 100 作 cap（Jordan 1991 `ovr:100`），与“标准 99 上限”混用——spec 的 OPEN 点成立，P3 前须 ADR 定标。
7. **`threeFg` / `midFg` 为估计值**：`players.js:126,128`（`tp || 0.28`；`fg*0.95`）——FG% 不是真实分区命中率，spec 的 provenance/confidence 要求成立。
8. **2D 表现已有基础但非事件队列**：`CourtView` 是 DOM + 3 路独立 rAF + 1 timer，无统一动画队列；spec 的“动画队列/取消”需新建或重构，现有取消仅是 `cancelAnimationFrame` 换帧。
9. **在线与离线边界**：server 权威仅覆盖在线 1v1 房间/排位（Elo、帧、决策）；career online economy 明确 out of scope；P0A/P0B 的离线 Quick Play 与在线无耦合——符合 spec“隔离”要求，但别把在线结算复用到离线。
10. **模式目录不完整**：catalog 未收录 `legend`/`sandbox`/`duel`/`family-duel`（`homeTabs` 收录了 `sandbox` 但 catalog 的 `quick-variants` 只含 `draft`/`quick`）——P0A 的“单一可信目录”须先补齐，否则会出现 catalog 与 homeTabs 两套事实来源。
11. **游客边界现状已满足 spec**：`quick` 不校验账号，`ranked` 依赖账号班底；spec 的“游客 Quick Play 免注册”无需新机制。但 Continue 面板目前读 legacy `peekSave`（`savegame.js`），其与 root v3 的关系须在 P0A 确认以哪一处为准。
12. **音乐已有雏形**：bgm 本地选曲已存在（`bgm.js:114-131`），spec P5 的“本地音乐”部分已实现；但无播放列表/房间/社交分享，别重复造播放器。

## 11. 未确认项（审计时未能逐行确认，P0A/P0B 须补）

- `slim()`（`sim.js:2621`）进 `publicTeam` 的完整球员字段：球员个人 `pf` 是否进 snapshot、球队犯规总数如何呈现。
- `pace_three` 提高三分比重的 `chooseShot` 内部机制细节。
- 犯满离场规则：全仓未发现，疑似不存在——P0B 场景初始化须确认 Q4 末段犯规语义。
- gold 与抽卡券之外是否还有其他货币（grep 仅见这两者）。

## 12. 给 P0A 的直接输入

- P0A 不动模拟器与存档结构，只做：补齐 catalog（收录 `legend`/`sandbox`/`duel`/`family-duel`，与 `homeTabs` 对齐）、Play Now 主 CTA（`quick` 目前进 `openSetup`，一键开打须绕过 setup 确认）、Continue 面板以 root v3 为准（或明确 legacy `peekSave` 的定位）、设计 token 与分组。
- P0A 必须产出的 ADR 至少要定三件事：终场脚本 vs 玩家决策的优先级规则（P0B 前置）、存档版本升级策略（`schemaVersion` 如何升到 4 而不拒读老存档）、catalog 与 `homeTabs` 的唯一事实来源。
- P0B 的硬骨头按难度排序：`initializeScenario()` 不变量校验 > 玩家决策优先权 > 事件粒度补齐（snapshot 差分先行，新增 emit 其次）> RNG 注入（可延后，先测不变量/分布）。
- 不建议在 P0A 顺手做的事：LeagueRules 集中化、PlayerDecisionAdapter、动画队列重构、WNBA 数据——全部在 P0C/P3/P4 的门后。
