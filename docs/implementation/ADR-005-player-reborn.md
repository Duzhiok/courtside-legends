# ADR-005：Player Reborn（穿越·球员）实现方案与里程碑

- **状态**：🟡 PROPOSED（等产品负责人审批；**本文只是规划，批准前不写实现代码**，见 `AI_EFFICIENCY_POLICY.md` 规则 10）
- **不重开的产品决策**：Master Spec v1.0 §9 和 `DECISIONS.md` D7（已修订并批准）。Reborn 是统一穿越模式，包含 **Player / Coach / GM** 三个身份；Player 身份有三种起点：**历史穿越**（Historical）、**原创穿越**（Original）、**随机命运**（Random Destiny）。本文只回答"怎么做、先做哪一块"。
- **在路线图里的位置**：对应 `ROADMAP.md` 的 M6。依赖和门控见 §6。

---

## 1. 现状审计：拿已批准的需求逐条对照代码

| 需求 | 现状（main） | 判定 |
|---|---|---|
| 教练线：面试、续约、解雇、再就业、挖角、退休 | `timeTravelCareer.js`、`careerContract.js`、`stints.js`、`poaching.js`、`retirement.js` 全部可用，有测试 | **原样保留**，后续作为 Reborn Coach 的起点（M5） |
| 球员本人穿越 | **没有任何代码**。`PLAYER_CAREER_ROADMAP.md` 是早期设计稿（从捏脸到童年再到大学、选秀），路线和 D7 的"1996 替补切片"不同 | **新增**；那份设计稿并入 Original Reborn 的后续章节（§7） |
| 1996 年历史数据 | `roster.json` 中 season=1997（即 1996–97 赛季）共 423 行、29 队，其中 100 行场均不到 12 分钟；首秀在 1997 的新秀 65 人 | **够用**，可以作为替补身份池。赛季编号约定（season=结束年）在 PR1 用测试钉住 |
| 球员视角比赛 | `GameSim` 可以把任意一队设为 `you`；托管开关 `autoOffense`/`autoDefense`/`autoRotation` 已有；轮换按每个球员的 `targetMinutes` 分配上场时间 | **复用**：比赛全程托管，球员只通过 `targetMinutes`（由教练信任决定）和关键回合参与 |
| 关键回合接管 | **不存在**。G1 已实测：玩家选中的出手人，引擎并不兑现（选与不选份额都约 5%）；`sim.js` 有 47 处直接调用 `Math.random`，没有可注入的 RNG | **硬依赖 M2b**（`ClutchController`/`DecisionAdapter` + RNG 注入）。不能另造一套投篮模型（ADR-002） |
| 成长 | `playerGrowth.awardGrowth`（比赛 XP、年龄、上限函数）；`FOCUS_ATTRIBUTES` 训练重点 | **复用**，不新建成长体系 |
| 每周精力和训练 | `career/calendar.js`（A3）已有周边界和精力 | **复用** |
| 赛后卡 | `careerPostGameView.js`（成长、领悟、热度三类行） | **复用**，新增"只看你自己那一行"的视图模式 |
| 存档 | root v3（`createRootState`：`coach/leagueCareer/story/liveGame`）；以前的新功能都用"可选字段 + validate"增量扩展（例如 `story.poachOffer`） | 切片阶段用**可选的 `root.reborn` 字段**，不升 v4（§5，待批 Q1） |
| 死字段风险 | 已经有只写不读的先例 | §4 每个字段都写明消费方，没有消费方就不加 |

---

## 2. 决策

### 2.1 最小可玩切片（唯一的首个目标）

**1996 → 随机命运 → 替补球员 → 训练 → 争取上场时间 → 关键回合接管 → 赛季结束的职业结算**

切片阶段固定：起点年份 1996、起点边界 **1996–97 季前**（不做选秀前起点，见 Q2）、身份 Player、起点类型随机命运、难度 UNDERDOG。RANDOM_ROLE（球员/教练/GM 按 50/30/20 抽身份）不在切片里，放到 M5 统一入口。

### 2.2 新代码放在新目录，不碰教练和 GM 的流程

- 新建 `js/reborn/`（领域逻辑，纯函数）和 `js/ui/reborn/`（视图）。
- `timeTravelCareer.js`、`careerContract.js`、`js/ui/timeTravel/*` **不改**。共用的东西通过 import 复用，不搬家、不复制。
- 切片阶段没有首页入口（M5 才做统一入口），先挂一个开发入口，例如 `?reborn=1`，随切片一起删除或转正。

### 2.3 历史源数据不可变，平行时间线隔离存储

- `roster.json`、`historicalSeasons.js` 只读。
- **历史身份**：你的卡是那张真实赛季卡的克隆。所有改动（成长偏移、合同、角色）存在 `root.reborn` 里，读取时叠加，原始行不改。
- **虚构身份**：复用 `leagueDraft.js` 的新秀生成器生成一张卡，插进某支 1996–97 球队，身份是训练营邀请或第 15 人。
- **不允许重复身份**：真实球员被你接管后，他所在球队的 CPU 名单里不能再出现他的原卡（单测守住）。

### 2.4 胜负只由模拟引擎决定

- 比赛结果、技术统计只由 `GameSim` 产出。Reborn 层只能写这两样东西：赛前的 `targetMinutes`/首发名单，以及（PR4 起）通过 M2b 决策接口提交的选择。
- 接管回合的成功率由引擎算，UI 只展示引擎给出的、可解释的因素，不显示未经校准的"胜率"（Master Spec 验收清单）。

---

## 3. 切片里的玩法规则

| 环节 | 规则（全部是起点值，实现时用固定种子测量后再调） |
|---|---|
| 身份抽取 | 种子 → 70% 历史替补（1996–97 场均不到 12 分钟，且出场 ≥10 场）/ 30% 虚构的训练营球员。同一个种子必须抽出同一个人 |
| 教练信任 `coachTrust` 0–100 | 输入：本场表现（Game Score）对比角色预期、训练是否完成、接管结果。输出：上场时间档位 |
| 轮换角色 `rotationRole` | 不打（DNP）/ 垃圾时间 / 轮换末端 / 轮换 / 首发。**由信任和空缺共同决定**（伤病或交易空出位置），不是单纯的 XP 门槛（Master Spec §9.4） |
| 训练 | 每周一次选择：射手 / 防守 / 组织 → 写入成长计划的 `focus`，复用 `awardGrowth` 和上限函数；不另开属性加成通道 |
| 关键回合 | 第四节或加时最后 2:00、分差 ≤5、你在场上、球在你手里时：给 2–3 个选项（突破 / 急停跳投 / 分球），经 M2b 的决策接口进入引擎 |
| 赛季末 | 合同判定：续约 / 底薪留队 / **被裁 → 试训或自由球员**（不是 Game Over）；然后进入下一季，时间线连续 |

---

## 4. 数据模型（每个字段都写了消费方）

```text
root.reborn = {
  version: 1,                          // 读取 / 迁移门
  seed, startYear: 1996, boundary: "preseason",
  role: "player", origin: "random-destiny", difficulty: "underdog",
  identity: { kind: "historical" | "fictional", bref?, generated? },  // 构建你的卡
  player: {
    teamId,                            // 你所在球队，用于每场开赛
    coachTrust,                        // → rotationRole
    rotationRole,                      // → targetMinutes / 是否首发
    contractStatus,                    // → 赛季末分支（续约 / 被裁 / 试训）
    growth,                            // 复用 playerGrowth 的账本 → 卡面属性偏移
    seasonLog: [{ year, gp, min, pts, reb, ast, takeovers, role }]  // → 赛季报告，只存聚合值
  },
  timeline: { events: [{ year, phase, actor, kind, before, after }] } // → 报告和后续历史分支
}
```

**不加的字段**：声望、精力上限、经纪人、媒体、财务。切片里没有读取方，等对应功能真正上线、有了读取方再加。

---

## 5. 存档

- 切片阶段：`root.reborn` 是 **v3 里的可选字段**，`validateRoot` 增加 `validateReborn`。缺省时完全不影响现有存档。这和当初加 `story.poachOffer` 是同一个套路，不需要升 v4。
- 正式版（多个身份共存、教练与球员共用一条时间线）再按 ADR-004 升 v4。迁移契约在 M4 前评审。
- 体积：只存聚合值和事件摘要，不存逐场日志（这个约定沿用至今）。

---

## 6. 依赖与门控

| 里程碑 | 依赖 | 理由 |
|---|---|---|
| PR1 身份 / PR2 赛季循环 / PR3 训练 | 产品负责人批准本 ADR；按"一次只开一个大里程碑"的规则排在当前里程碑之后 | 不碰 `sim.js` |
| **PR4 关键回合接管** | **M2b 完成**（决策接口 + 引擎兑现选中的出手人 + 可注入 RNG） | 不能为接管另造一套投篮模型 |
| PR5 职业结算 | PR2、PR3 | — |
| 统一入口 / RANDOM_ROLE | M5 | Master Spec 顺序 |

**和 Master Spec 顺序的冲突需要你拍板（Q3）**：Spec 的顺序是 M3 → M4 → Reborn，你给的优先级是"首页 → 快速开打 → 2D 接管 → Player Reborn MVP → 跨职业转换"。两者的差别在于 M4（My Legacy 存档升级）放在 Player MVP 之前还是之后。本 ADR 的建议：PR1–PR5 **不依赖 M4**（用 v3 可选字段），所以 M3 闸门批准后就可以开工，M4 改到 Player MVP 之后。

---

## 7. 切片之外（只登记，不排期）

1. **历史穿越选择器**：指定球员加赛季。复用 PR1 的身份构建，加一个选择界面；涉及超巨时要处理"时间线已改写"的说明。
2. **原创穿越**：`PLAYER_CAREER_ROADMAP.md` 的 P1 建档（100 点、身高决定上限）并入这里。童年到大学的部分是可选的前传章节，不挡主线。
3. **RANDOM_ROLE**，以及 Coach/GM 从 UNDERDOG 起步（助理、球探）。
4. **职业转换**：退役球员 → 助理教练，复用 `generateReemploymentOffers`，起始声望由球员生涯的 legacy 决定。
5. GM 权限边界（球员不能交易，教练不能单方面交易）。

## 8. 风险

- **G1 / RNG 未解决**：PR4 只能等 M2b，期间 PR1–PR3 的测试不依赖比赛随机结果（遵守政策"不对随机结果断言"）。
- **真实球员肖像和姓名**：本地自玩可以；公开发布前必须审查（D7 原文要求）。
- **切片变成菜单游戏**：PR4 是这个切片的核心乐趣，不允许在 PR4 之前继续堆合同、经纪人这类菜单系统。

## 9. 待批问题

| # | 问题 | 默认 |
|---|---|---|
| Q1 | 切片阶段用 v3 可选字段 `root.reborn`，不升 v4 | 是 |
| Q2 | 起点边界：1996–97 季前（选秀前起点放到历史穿越再做） | 季前 |
| Q3 | Player MVP 在 M3 之后、M4 之前开工 | 是 |
| Q4 | 随机命运：70% 历史替补 / 30% 虚构 | 是，实现时实测后可调 |
