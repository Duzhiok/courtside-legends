# B28 审计：球员「功能角色」要不要新增？——**不新增（已结案）**

> 日期 2026-11-22 · owner Code Puppy。BACKLOG 原文：「现有 `PLAYER_ROLES` 是分钟与球权角色，不是篮球功能；是否新增需先定义职责如何影响模拟，避免与战术/重点再次叠加」。用户 2026-11-22：“按推荐逐步进行”。本文用代码证据回答“是否新增”，结论是**不用**。

## 1. 先把三个“角色”分清

| 名字 | 在哪 | 是什么 | 进模拟吗 |
|---|---|---|---|
| `PLAYER_ROLES`（进攻核心/稳定首发/第六人/角色球员/板凳蓝领） | `js/data/playerMinutes.js` | 分钟与球权期望 | 是（目标分钟、Reborn 信任） |
| **功能角色**（持球核心/第二持球点/弱侧射手/挡拆大个/高位策应/低位终结/护框/外线盯人/篮板/转换终结） | `js/myteam/playerRoleFit.js` `ROLES`（Team Intelligence v3） | 由**真实属性**打分的 0..99 契合度；按战术模板分配 | **否，有意只做分析**（`coachDrivenAnalysis.js` 里写着 `simBacked: false`；`sim.js` 不读它） |
| 逐球员**订单** `orders.usage / action / attack / hunt / defFocus` + PnR 角色 | `js/engine/gameplan.js`、`pnrPlan.js` | 玩家（或 `recommendPlayerOrders`）下给引擎的具体指令 | **是** |

也就是说“功能角色”这个概念**已经存在**，而且已经按“分析层”和“执行层”拆开了，原文担心的“新增一个分钟/球权之外的职责”其实就是后两行。

## 2. 五个功能 → 引擎里的杠杆（逐条核对 `sim.js` 里真被读到）

| 功能 | 现有杠杆 | 证据 |
|---|---|---|
| 组织者 | `orders.usage = "organize"`；`sideCtx.organizerId` / `assisterId`（助攻归属、`kickChance`） | `sim.js` 中 `"organize"` 11 处 |
| 无球射手 | `orders.action = "spot"`（接球就投/空切，少持球） | `"spot"` 7 处；`isFloorShooter` |
| 掩护者 | `gameplan.pnr.screenerId` + `afterScreen`（roll/pop/slip/ghost）+ 其余球员 spot/cut（`84284c6`） | `pnrPlan.js`，sim 经 `resolvePnrPlay` 读取 |
| 护框 | `orders.defFocus = "help"`（协防）；推荐逻辑里 `skills.includes("rim_protector") → "help"`；`defensePlan` 防守者/assignments；B25 的 `zone_drop` 保护篮下 | `sim.js` `df === "help"` 4 处；`gameplan.js:481` |
| 篮板手 | `orders.action = "crash"`（冲二次）；`reboundContestWeight` 按属性 | `"crash"` 5 处 |

另外 `recommendPlayerOrders()`（`gameplan.js` ~L453–582）**已经按属性把这些功能推荐出来**（防守 ≥86 或抢断 ≥78 → onball；大个子且盖帽 ≥72 → help；防守好的 SF/PG → deny …），玩家没手动改（`ordersManual` 为假）就用推荐。

## 3. 为什么不再加一条“功能角色 → 模拟效果”的通道

1. **没有缺口。** 五个功能每个都已有一个逐球员、会改变引擎行为的杠杆，且推荐值由属性派生。再加一条等于给同一件事开第二个入口。
2. **正是 BACKLOG 担心的叠加。** 现在一件事已经有“战术 + 回合重点 + 逐球员订单 + PnR 角色”几条路径（B23 曾量出叠加：篮板两个来源，每场多 1 个进攻篮板）。再加“角色”就是第 5 条，而每条都会碰同一批 make/open/权重乘数；没有证据说明哪一条该让位。
3. **会让“契合度”变成数值加成。** My Team 的“弱契合 = 这不是他的活，不是他变差了”是 v3 明确写下的原则；一旦进模拟，弱契合就必须真的扣命中/权重，等于重新引入隐形 OVR 惩罚（和 Career 2.0 “不给任意加成”的方向相反）。

## 4. 什么情况下重开

只有同时满足以下两点才重开：(a) 找到一个**现有杠杆表达不了**的篮球功能（例如“转换终结”——引擎没有转换进攻的概念，`ROLES.runner` 现在只是分析标签）；(b) 先给出该功能在模拟里的**独立机制**（不是给已有乘数再加一份）并能用 B25/B26 的方法量出来。

## 5. 没做的 / 可选的小项

- Gold 赛前页的球员卡现在只显示“分钟/球权角色”（`setupCardRoles.js`），不显示天然功能定位。要显示的话应复用 `ROLES` 的 `roleScore` 并标成“分析”（和战术板的 `sim` / `advice` 标签一致），但原始分数偏向通用属性，需要先按联盟分布标准化再取最大项，否则几乎人人都是“篮板保障”。**这是纯 UI 增强，不影响模拟，本次没做，也没有人要求。**
- “转换终结”是唯一一个引擎里完全没有对应机制的功能；见第 4 节。
