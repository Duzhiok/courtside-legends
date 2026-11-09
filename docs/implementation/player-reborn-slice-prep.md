# Player Reborn 垂直切片准备（M6 · PR1–PR5）

- **状态**：PREPARATION ONLY —— 本文档是准备，不是开工。**M3 闸门未批准**：M3 已完成（3218842），用户 2026-11-09 只给了有条件批准（保留一次完整 M1–M3 试玩，试玩反馈未到之前不算正式批准）；按 `ROADMAP.md` line 229，P1（M4 及之后）不得开工。PR1 仍等闸门。
- **依据**：`ADR-005-player-reborn.md`（✅ APPROVED，用户 2026-11-04 批 Q1–Q4 取默认值）。本文是 ADR-005 §9 要求的“开工前一页实现设计”，并按当前 main（8e9589e）校准：ADR-005 成文后部分文件已搬家，M2b/M3 已完成，教练线 B33 面试+预言已上 main（c745614）。
- **一句话目标**：1996 → 随机命运 → 替补球员 → 训练 → 争取上场时间 → 关键回合接管 → 赛季末职业结算；全程只用已有引擎，不造新投篮模型、不改 `sim.js`。

## 1. 最小可玩切片：每一步“可玩”的定义

| 步 | 玩家做的事 | “可玩”验收标准 |
|---|---|---|
| ① 建球员 | 种子 → 抽身份 | 同种子必抽同一个人；身份卡说清你是谁（历史替补：真实姓名/球队/角色；虚构：生成的卡 + 训练营邀请）；刷新后身份不变 |
| ② 进历史联盟 | 以该身份进 1996–97 赛季 | 你在球队名单里，能打完整赛季赛程；你接管的真实球员不在 CPU 名单里重复出现；`roster.json` 原始行一字不动 |
| ③ 争上场时间 | 打比赛，看信任涨跌 | 信任 0–100 可见；角色档位 DNP / 垃圾时间 / 轮换末端 / 轮换 / 首发随信任+空缺变化；打得好多打、打得差少打，原因写在卡面上 |
| ④ 成长 | 每周选一次训练重点 | 射手 / 防守 / 组织写入成长计划 `focus`，复用 `awardGrowth` 与上限函数；每处属性提升都能在卡面看到来源；训练不能突破上限 |
| ⑤ 关键时刻接管 | 第四节/加时最后 2:00、分差 ≤5、你在场且持球时做选择 | 出现 2–3 个选项（突破 / 急停跳投 / 分球），经 M2b 决策接口进入引擎；选项真的改变出手人和出手类型（探针前后对比）；不显示未经校准的“胜率” |
| ⑥ 赛季末结算 | 看合同结果，进下一季 | 续约 / 底薪留队 / 被裁 → 试训或自由球员；被裁不是 Game Over；时间线连续，能连续打完 2 个赛季 |

切片固定值（ADR-005 Q2/Q4 默认值）：起点 1996–97 季前，身份 Player，起点类型随机命运，难度 UNDERDOG；70% 历史替补 / 30% 虚构。选秀前起点、历史穿越选择器、原创穿越、RANDOM_ROLE、职业转换都不在切片里（ADR-005 §7，只登记）。

## 2. 每一步：复用什么、缺什么、文件与归属

| 步 | 已有，直接复用 | 缺失，新写 | 归属（协调用） |
|---|---|---|---|
| PR1 身份 | `js/data/roster.json`（`players[]`，实测：season=1997 共 423 行、29 队；场均 <12 分钟且 ≥10 场的替补池 **80 人**，ADR-005 写的 100 人是旧数，以 80 为准）；`js/engine/leagueDraft.js:174 rookieClassForYear()` 生成虚构新秀；`js/data/avatarLook.js`（捏脸外观：肤色/发型/体型预设，纯外观） | 新 `js/reborn/identity.js`（种子 → 身份抽取；历史克隆 vs 虚构生成；去重守卫）；`js/data/saveRoot.js` 增加可选 `root.reborn` + `validateReborn`（v3 不升版，沿用 `story.poachOffer` 的套路） | `js/reborn/*` 归 Player Reborn Assigned Agent；`saveRoot.js` 只做加法改动，M4 的 v4 迁移另行处理，不得抢先 |
| PR2 赛季循环 | `GameSim`（`js/engine/sim.js:119`，构造 `{home, away, youSide}`；`autoOffense/autoDefense/autoRotation` 全托管开关 line 191–193）；`targetMinutes` 是现成字段（`js/engine/gameplan.js:663` 按 `roleExpectation` 给默认值，`js/data/playerPrefs.js:18,28` 持久化）；`js/career/calendar.js:20,23` 周边界（`GAMES_PER_WEEK` / `isWeekBoundary`）；`js/ui/careerPostGameView.js:228 postGameHtml()` 赛后卡 | 新 `js/reborn/trust.js`（信任 0–100：本场 Game Score 对比角色预期、训练完成、接管结果 → 角色档位）；新 `js/reborn/season.js`（赛季循环驱动：逐场建 `GameSim`、赛前写 `targetMinutes`/首发、赛后结算）；`postGameHtml` 加“只看你自己那一行”视图模式（加法，不改现有三类行） | `js/reborn/*` 归 Assigned Agent；`careerPostGameView.js` 只做加法；**`sim.js` 零改动** |
| PR3 训练 | `js/career/playerGrowth.js:75 awardGrowth()`（比赛 XP、年龄、上限函数）、`:44 trainedAttributes()`（`FOCUS_ATTRIBUTES`）、`:51 attributeCeiling()`；`js/career/calendar.js:52 advanceWeek()` | 新 `js/reborn/training.js`（每周一次重点选择 → 写成长计划 `focus`） | `js/reborn/*` 归 Assigned Agent；`playerGrowth.js` / `calendar.js` 只读复用，不改 |
| PR4 关键回合接管 | `js/engine/clutchController.js`（M2b 已完成：`submitDecision()` / `issueAttemptId()` / `replaceDecision()`；`meta.clutchOutcome`；M2b-2 绝杀场景已验证决策兑现）—— 球员接管与绝杀挑战是同一个决策原语，不重复建 | 新 `js/ui/reborn/takeover.js`（接管窗口 UI：触发条件判定 + 2–3 个选项 + 经决策接口提交）；探针复用 `scripts/research/clutch-choice-probe.mjs` 做前后对比 | `js/ui/reborn/*` 归 Assigned Agent；`clutchController.js` 只读复用，不改 |
| PR5 职业结算 | `js/career/playerGrowth.js:141 carriedDeltas()`（跨季属性结转）；`root.reborn.timeline.events`（ADR-005 §4 数据模型，事件摘要只存聚合值） | 新 `js/reborn/contract.js`（赛季末合同判定：续约 / 底薪 / 被裁 → 试训或自由球员；时间线事件写入） | `js/reborn/*` 归 Assigned Agent |
| 入口 | 切片阶段**没有首页入口**（M5 才做统一入口）：先挂开发入口 `?reborn=1`，随切片一起删除或转正 | — | 入口归 M5，不在本切片里提前建 |

## 3. 教练线（Coach Reborn）与球员线：共享什么、分开什么

教练线现状：`js/modes/timeTravelCareer.js`（`createTimeTravelPrologue:188` → 3 个 offer → `acceptInterviewOffer:200`）+ B33 刚并入的 `js/career/interview.js:84 conductInterview()`（面试改写 offer 的信任/压力）+ `js/career/draftProphecy.js`（`settleProphecy`，在 `js/modes/seasonRollover.js:15` 赛季结算时兑现）+ `js/career/contractOffers.js` / `stints.js` / `poaching.js` / `retirement.js`（教练合同生命周期）。**以下文件球员切片一律不碰**：`timeTravelCareer.js`、`js/career/interview.js`、`draftProphecy.js`、`contractOffers.js`、`stints.js`、`poaching.js`、`retirement.js`、`js/ui/timeTravel/*`。

| 层面 | 共享（import 复用，不搬家、不复制） | 分开（球员线自有，教练线没有） |
|---|---|---|
| 存档 | `saveRoot.js` 的 v3 可选字段 + validate 套路 | `root.reborn` 与教练线的 `root.story` / `root.coach` 是平行字段，互不读写 |
| 引擎 | `GameSim` + `ClutchController` 决策原语（`submitDecision` / `meta.clutchOutcome`）；胜负与统计只由引擎决定 | 球员线赛前只写 `targetMinutes`/首发名单；教练线写战术/轮换/暂停。球员**没有**战术指挥、暂停、换人、选秀、交易权限（ADR-006 权限矩阵） |
| 成长 | `playerGrowth.js` 的 `awardGrowth` 与上限函数；`calendar.js` 周边界；`careerPostGameView.js` 赛后卡 | 信任 → 轮换角色 → 上场时间（`trust.js`）；每周个人训练重点（`training.js`） |
| 开局 | 历史数据 `roster.json` 只读；`leagueDraft.js` 的新秀生成器 | 教练线：3 个 offer → 面试 → 预言；球员线：**无面试、无预言**—— 替补球员不面试上岗，预言是教练/GM 的球探工具，不属于球员视角。信任在场上挣，不在面试桌上挣 |
| 合同 | — | 教练线：offer / 续约 / 挖角 / 退休；球员线：个人合同判定（续约 / 底薪 / 被裁 → 试训），被裁不是 Game Over |

## 4. 依赖顺序与闸门地图

**实施顺序**：PR1 身份 → PR2 赛季循环 → PR3 训练 → PR4 接管 → PR5 结算。每步一个提交，都过 review；PR1–PR3 的测试不对随机比赛结果下断言。

| 依赖 | 状态 | 说明 |
|---|---|---|
| M2b 决策接口 + 引擎兑现选中出手人 + 可注入 RNG（PR4 的硬依赖，ADR-005 §6） | ✅ 已满足 | `ClutchController` + M2b-2 已完成并验证；PR4 不需要等任何东西 |
| M3 闸门：用户试玩 M1–M3 并批准（PR1 开工门，ADR-005 §9 + ROADMAP line 229） | ⏳ 未批准 | **唯一卡住 PR1 的门**。用户 2026-11-09 的有条件批准 ≠ 正式批准；试玩反馈未到之前，PR1–PR5 一行实现代码都不写 |
| M4 存档升级 v4 | 不依赖 | 切片用 v3 可选字段 `root.reborn`；ADR-005 Q3 默认值：Player MVP 在 M3 之后、M4 之前开工，M4 改到 Player MVP 之后 |
| M5 统一入口 / RANDOM_ROLE | 不依赖 | 切片用 `?reborn=1` 开发入口；M5 才做首页统一入口 |

**现在能做的准备（不碰闸门）**：本文档；身份池实测（已做：80 人）；`?reborn=1` 入口形态与 `root.reborn` 字段表（ADR-005 §4，每个字段都已写明消费方，无消费方不加）；PR1–PR5 的测试夹具（固定种子身份、固定信任映射表）。**现在不能做的**：任何 PR1–PR5 实现代码、任何 `js/reborn/` 新文件、任何 `saveRoot.js` 改动。

## 5. 待用户拍板的问题（只剩真正需要他定的）

1. **身份揭示时机**：玩家开局就知道自己是 1996–97 某位真实替补的克隆，还是先以“无名训练营球员”开局、随信任提升再揭示真实身份？（小到大分层揭示的既定规则倾向后者；但历史穿越的卖点一部分在于“你就是他”，需定。）
2. **第一季长度**：切片第一季打满 82 场，还是缩短到 20 场左右、让玩家更快走到 PR5 结算与下一季？（My Team 已有 20 / 82 两种赛制可参照；ADR-005 默认满季。）
3. **被克隆球员的历史线**：你接管他之后，他在联盟历史里的原有赛季数据怎么算——冻结在克隆点、还是随你的表现改写？（原始 `roster.json` 行不动是已定的；问题是联赛历史/纪录视图里显示哪一套。）
