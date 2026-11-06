# Reborn 角色与权限审计（只读审计，文档）

- **基线**：`main` @ `a2da47c`（2026-11-05）。本文是证据记录，不是路线图；路线图仍是 `ROADMAP.md` 的 M5–M7，方案是 `ADR-005`（球员线，已批准）和 `ADR-006`（身份与权限，PROPOSED）。
- **范围**：只读代码。没有改 GameSim、合同、历史数据、存档结构，也没有实现任何角色限制。
- **方法与局限**：逐项看 UI 入口、校验函数、读写的状态字段。"无角色检查"指在 `js/engine`、`js/modes`、`js/career`、`js/app.js`、`saveRoot.js` 内用 grep 没找到按身份判断的代码，不等于运行时一定没有。标 *(未复核)* 的是本次没有逐一追到底的点。

## 1. 总结

1. 现有 Reborn（`leagueCareer.kind === "timeTravel"`）就是**经典 GM+Coach**：所有操作都开放，**所有校验只看游戏阶段、名单人数、工资帽、资源是否足够，没有一条看"你是谁"**。
2. `authority` 和 `privileges` 目前是**纯展示**：能在界面上看到、能随合同保存，但在检查范围内没有任何引擎代码根据它们放行或拒绝一个操作。
3. 拆角色的难点不在 GameSim，而在三处：**入口层**（十个页签和按钮）、**同一份数据被两种职责写**（发展计划、轮换、天赋点）、**常量和公式按教练命名**（退休年龄、传奇评分）。

## 2. 能力清单

列说明：**入口** = 玩家在哪里触发；**校验** = 代码里实际拦什么；**状态** = 读写的字段；**建议归属** = 对应 ADR-006 的 Player / Coach / GM / Dual（双职，含经典）。

| # | 能力 | 入口 | 现有校验（无角色判断） | 读写状态 | 建议归属 |
|---|---|---|---|---|---|
| C1 | 亲自指挥比赛（含季后赛） | `#btn-season-play` → `playSeasonUserGame` / `playUserPlayoffGame` | 阶段必须是常规赛或季后赛；必须有下一场用户比赛 | `state.season`、赛程 `dayIndex`、`you.rotation` / `starterIds`、`liveGame` | **Coach / Dual**。Player 不走这里（ADR-005：比赛全程托管，只通过 `targetMinutes` 和关键回合参与） |
| C2 | 快速模拟 本场 / 5 场 / 整季 | `#btn-season-sim-one` / `-week` / 结果页「模拟整个赛季」→ `simSeasonGames` | 阶段；整季有确认框 | `season`、`resultsLog`、`management`（成长、热度）；经 `settleUserGame` 统一结算 | **所有身份**（GM 和 Player 的默认路径）。风险见 §4：不能为角色复制一份结算 |
| C3 | 首发、轮换、分钟（排兵布阵） | 页签 `rotation` → `renderSeasonRotation` | 首发最多 5 人、必须在名单内、去重（`toggleStarter` / `liveStarterIds`）；分钟预算压缩（`fitMinuteBudget`） | `you.rotation`、`starterIds`、`targetMinutes`（`captureRotationPlan` / `applyRotationPlan`） | **Coach / Dual**。Player 身份下由系统按教练信任写 `targetMinutes`（ADR-005 §3），玩家不能手改 |
| C4 | 临场战术、防守、托管开关 | 比赛界面（`setTactic`、`autoOffense` / `autoDefense` / `autoRotation`） | 无角色判断；B34 已修"进攻托管顶掉防守战术"，战术槽拆分待 M2b | `GameSim` 内部战术状态；教练天赋 `tactics` 的 `tacticsShotBonus` 仅在 `kind === "timeTravel"` 生效（`app.js` 约 9888 行） | **Coach / Dual** |
| C5 | 签自由球员 | 页签 `market` → `signFreeAgent` | 阶段必须是常规赛；名单未满；硬帽（`SEASON_APRON`）；已超软帽只能签迷你合同 | `st.freeAgents`、球队名单、工资 | **GM / Dual**。Coach 只能"提建议" |
| C6 | 裁人 | 页签 `market` → `cutPlayer` | 阶段；至少保留 `SEASON_MIN_ROSTER` 人；球员须在名单 | 球队名单 | **GM / Dual** |
| C7 | 交易（含接受/拒绝 CPU 报价、选秀权） | 页签 `market`、交易面板 → `executeTrade`、`tradeProposals` | 阶段；双方都出东西；球员/选秀权有效；硬帽；名单上下限；截止线 `TRADE_DEADLINE_FRACTION = 0.7` 及每季次数上限（R103，具体位置未逐行复核）；被拒报价按签名过滤 | `pickOwnership`、`draftAssets`、`tradeLog`、`declinedTradeSignatures`、名单、工资 | **GM / Dual** |
| C8 | 选秀 | 页签 `draftBoard` → `beginCareerDraft` / `makeCareerDraftPick` / `forfeitCareerDraftPick` | 候选人必须可选且唯一；轮到用户；选秀阶段 | `leagueCareer` 的 draft 状态、`pickOwnership` | **GM / Dual**。Coach 提建议 |
| C9 | 球员发展计划 | 页签 `development` → `setDevelopmentPlan` | 球员必须在用户名单；计划结构经 `validatePlanForRoster` | `management.developmentPlans`、`manualOverrides`、`recommendations` | **Coach 管训练重点和角色，GM 管资源预算**。现在是同一份数据，见 §4 |
| C10 | 教练天赋点 | 天赋卡 → `spendPerkPoint` | 点数 > 0；天赋线合法；每线 ≤ 3 级；非法输入抛错 | `root.coach.perks`、`perkPoints`、`xp`、`level` | 按线：`tactics`→Coach、`negotiation`→GM、`development`→Coach/GM、`media`→全部。各线是否都有引擎消费者 *(未复核，只确认 `tactics` 有)* |
| C11 | 续约谈判（自己的聘用合同） | 续约卡 → `acceptCareerContract` / `declineCareerContracts` | 只能接受 `employment.offers` 里实际出现的方案（B3 修复）；就业状态 | `story.employment`、`coach.stints` | **所有身份**（各自的合同）。球队名单上的合同归 GM（C5–C7） |
| C12 | 面试 / 开局 offer / 再就业 | 面试卡、求职板 → `acceptInterviewOffer` / `acceptReemploymentOffer` | offer 必须是生成的那几个；被"烧掉的桥"排除；声望档（`REEMPLOYMENT_*_REPUTATION`） | `story.employer` / `employment`、`coach.stints` | **所有身份**，但**岗位池要按身份分别生成**（现在是教练式球队原型：rebuild / contender…） |
| C13 | 挖角（接受 / 拒绝） | 挖角卡 → `acceptPoachOffer` / `declinePoachOffer` | 声望 ≥ 65、本段 ≥ 2 季、冷却 2 季、只在新赛季第一场前有效、`poachOffer` 单槽 | `story.poachOffer`、声望、`coach.stints` | **Coach 和 GM 各有自己的市场**；Player 对应转会/自由市场（M6 另设计） |
| C14 | 剧情事件 / 未来知识选择 | 事件卡 → `resolveStoryEvent`、`resolveFutureKnowledgeChoice` | `pendingDecision` 门控；选项效果写 trust / pressure / divergence | `story.pendingDecision`、`eventLog`、`flags` | **共享**。事件文案是否默认你同时管交易和战术 *(未逐条审计)* |
| C15 | 个人财务（买房、投资） | 财务卡 → `buyHouse` / `placeInvestment` | 现金够不够；年代可投资资产；投资单季下注 | `coach.cash` / `housing` / `pendingInvestments` | **所有身份**（个人）。收入来源现在只有 `currentCoachSalary`，Player 需要球员薪资来源 |
| C16 | 退休 | 退休卡 → `retireCoach` / `retirementBlocker` | 有生涯；未退休；至少完成 1 季；无待决事项；赛季未开打（被裁/离队例外）；强制退休在 `COACH_RETIRE_AGE` | `story.ending`、`coach.stints`、`coach.age` | **所有身份**，但年龄线和传奇公式要按身份分（现为教练命名） |
| C17 | 只读页：积分榜、球队评估、赛程、评奖、季后赛、生涯历史 | 页签 | 无 | 只读 | **共享**，不限制 |

## 3. `authority` 和 `privileges`：玩法还是展示？

| 字段 | 在哪里产生 | 在哪里被读 | 结论 |
|---|---|---|---|
| `offer.authority`（0–100） | 面试 offer 模板、`coachOrigins` 的 `authorityDelta`、续约方案模板 | `ui/timeTravel/offers.js`（进度条、aria 文案）；`career/coachOrigins.js` 自身做加减 | **纯展示**。检查范围内没有引擎代码用它放行或拒绝任何操作；它是否被写进 `root.story` 供后面读取，grep `.authority` 在 `timeTravelCareer.js` / `careerContract.js` / `saveRoot.js` 里没有结果 |
| `offer.privileges`（字符串列表） | `career/contractOffers.js` | `ui/timeTravel/offers.js`（显示成标签） | **纯展示**。是字符串，不是能力 ID |
| `offer.effects`（trust / pressure / divergence） | 同上 | 就业与解雇、剧情逻辑 | **有玩法效果**（B2 的信任度解雇依赖 `frontOfficeTrust`）。这是和上面两个不同的东西，别混 |

privileges 到能力的建议映射（给 ADR-006 §3.4 用，**本次不实现**）：

| 现有文案 | 对应能力 | 建议归属 |
|---|---|---|
| 自定义训练计划 | C9 | Coach |
| 发展联盟优先权 | C8 / C9 | GM |
| 额外教练预算 | C9（预算） | Coach。**现在没有"预算"这个字段**，所以是死承诺 |
| 季中补强额度 | C5 / C7 | GM |
| 完全人事决定权 | C5–C8 | GM |
| 顶薪续约优先权 | C11 / 球队工资 | GM |
| 专属训练设施预算 | C9（预算） | Coach/GM。同样没有预算字段 |

## 4. 拆分的风险

| # | 风险 | 说明 | 缓解方向 |
|---|---|---|---|
| R1 | 隐含身份 | `kind === "timeTravel"` 在 `app.js` 至少 6 处被当成"经理兼教练"，另有 `saveRoot.js` 校验 | 先加 `identityOf(root)` 读取函数，逐处替换；经典永远走旧路径 |
| R2 | 同一份数据两种职责 | 发展计划同时含"训练重点"（教练）和"角色 alpha/starter/sixth…"（与 C3 轮换角色重叠）；天赋点 `root.coach` 混了教练线和 GM 线 | 不拆数据结构，只在入口层按身份决定谁能写、谁只读；字段不动 |
| R3 | 系统写 vs 玩家写 | ADR-005 的球员线会程序化写 `targetMinutes`，而教练线是玩家在 UI 里写同一字段 | 权限只管"用户发起的 UI/动作入口"，不管系统结算；守卫放在动作函数，不放在字段 |
| R4 | 结算被复制 | C2 的 `settleUserGame` 是成长、热度、领悟的唯一结算点 | GM / Player 复用同一结算，只换谁来点"模拟"；不新增并行结算 |
| R5 | 死承诺 | `privileges` 里有两项指向不存在的"预算"；`authority` 无消费者 | 变成能力授予前先决定要不要做预算；否则删文案而不是保留假承诺（需单独批准） |
| R6 | 教练命名的常量 | `COACH_RETIRE_AGE`、传奇评分只读 `coach.stints`、`currentCoachSalary` | Player/GM 用相同公式前先抽象命名；先不改，等 M5 设计 |
| R7 | 旧存档与旧 QA | 页签隐藏会让旧 QA 脚本找不到按钮 | 经典身份不隐藏任何页签；只有新身份受限 |
| R8 | AI 球队被误伤 | 引擎的 `executeTrade` / `signFreeAgent` 也被 CPU 操作调用 | 守卫只作用于"用户发起"，不作用于 CPU 路径 |
| R9 | 事件文案默认全能 | 剧情事件可能默认你同时管交易压力和战术 *(未逐条审计)* | M5 设计时逐条按身份标注可见性 |

## 5. 没有解决的权限问题（需要拍板）

1. **GM 身份的比赛**：自动模拟，还是"观战 + 赛前建议"？（决定 Own the Moment 对 GM 是否适用。）
2. **Coach 身份能不能"提建议"**交易/选秀，建议是只给文字，还是进入 GM（AI）的候选池并可能被否决？
3. **谁拥有发展计划**：训练重点归 Coach、预算归 GM 时，经典和双职怎么合并 UI？
4. **预算是否存在**：`额外教练预算`、`专属训练设施预算`要做成真实字段，还是改文案？
5. **Player 身份的"合同"**：球员合同由 GM（AI）谈，还是玩家自己谈？（ADR-005 切片只到赛季末续约/裁员。）
6. **双职是否需要代价机制**（工作负荷、角色冲突）才能解锁，还是经典永远全权？
7. **事件库**：Coach / GM 是否需要各自的事件池，还是共享一个、按身份过滤？

## 6. 建议的下一个里程碑

- **不要现在开工 M5。** `ROADMAP.md` 把 M5–M7 门控在 M4 完成之后，ADR-005 的 PR1 还要等 M3 闸门，本次审计不改变这个顺序。
- **下一项应为 M2b 的一页实现设计**（可注入 RNG、`DecisionAdapter`、战术槽拆分范围）：它是 M3 接管和球员线 PR4 的共同硬依赖，也是"Own the Moment"能不能成立的前提。
- 同时可先拿到的、不改行为的前置：你对 ADR-006 的 Q1–Q4 拍板，这样 M5 开门那天（第 2 步：身份选择页 + `identityOf` + `permissionsFor`）可以直接开工。
