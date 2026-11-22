# 战术板挡拆角色分配 — 设计 (PnR Roles on the Tactics Board)

Status: PROPOSED. User approved 2026-11-22: 挡拆先行，不加偷懒属性。
Implementation owner: Code Puppy (Builder/Architect). Lychee wrote this design;
engine work is Code's line (sim.js single-owner rule). No sim.js changes in this
doc — it is a design, not code.

## 0. 用户要什么（2026-11-22）

战术板可以自己灵活选择战术球员。挡拆必须要两个人：挡拆后下顺、拉开、
假挡拆、外拆、幽灵跑位；有三分的等空位，没有的就进去上篮；控球方可以
中投或者突破，或者假突真传。这些跟球员的性格和各项能力值有关系。

用户同时定了两条边界（同日，选项二选一）：
- **挡拆先行**：只做挡拆这一个战术的角色分配；突破分球 / 单打清侧 /
  无球定点 / 低位要球 / 冲抢二次这五个打法保持现状，以后按同一套路再做。
- **不加偷懒属性**：不新加"偷懒 / 拼劲"字段。2026-11-19 的决定继续有效——
  "不需要做拼劲系统，在我的游戏里所有球员都是尽全力"。性格与执行
  差异用已有字段表达（见 §3.3），不发明新属性。

## 1. 现状核查（已核对代码，不是推测）

### 1.1 战术板现在能选什么

`js/ui/tactics/tacticalDraft.js` 的 draft 只有队级字段（`createDraft`）：
`offensiveSchemeId`（一个在用体系）、`tacticPool`、`starterIds`、
`ballHandlerId`（一个持球核心）、`ballAction`（持球人一个打法）、
`tempo`、`defense`（scheme focus/double/bump + targetId + defenderId +
assignments 对位表）。`scope: "team-default"`——队默认 + 本场。

板面（`js/ui/tactics/tacticsBoardModel.js` `buildTacticsBoardModel` +
`js/ui/tactics/tacticsBoardView.js`）：站位图 5 张球员卡（点卡选持球核心，
reducer 已有 `SELECT_PLAYER`）、底部 6 个持球打法按钮（`ORDER_ACTION` 去掉
auto：pnr / drive_kick / iso / spot / post / crash，带"推荐"角标）、右侧
体系 / 契合 / 熟练度 / 持球核心 / 对手威胁。**没有"谁掩护、掩护完干什么、
其他人干什么"的选择。**这不是 Code 拒绝了——板上和设计文档里从来没有这条
需求（战术板当初的范围就是队级方案，UI 3.0 Slice 1，Code 2026-11-17 接的；
`docs/implementation/coach-tactical-depth-design.md` 说的是熟悉度 / 买账 /
对手阅读，也不是这个）。所以是没落到纸上，不是被否掉。

### 1.2 引擎里挡拆现在是怎么打的

- `pnr` 只是持球人 `orders.action` 的一个值。`sim.js` 里它是权重，不是
  角色分工：持球人 `action === "pnr"` 时 `wPaint ×1.22`、`wMid ×1.4`
  （`midSkill ≥ 72` 或中投型持球人再 ×1.2）；`kickChance +0.1`
  （夹在 0.32–0.72）；分球时射手权重再抬（见下）。
- **掩护人是引擎事后挑的，不是输入**：`pickScreener`（`js/engine/grade.js:140`）
  在内线里按 `strength + iq×0.35 + C 28 / PF 18` 挑一个，只用来在进球后
  给掩护加分（`gradeScreen` +1.55）。**没有"被选中的掩护人"这个概念。**
- 下顺 / 外拆没有分支，是投篮选择权重算出来的（`kickToTeammate` 与
  `sideCtx.kickedOut` 分支，`sim.js` 约 4187–4360 行）：
  - 是射手（`isFloorShooter`：`threeTend ≥ 42 && three ≥ 65`，或
    `offenseStyle` 为 spot / stretch）→ 分球权重 ×1.55；分球后
    `w3 ×1.65`。
  - 是 C/PF 且 `paint ≥ 72` → 分球权重 ×1.25；分球后 `wPaint ×1.35`
    （注释就写着 "roll man"）。
  - 弹跳内线 + 好传球手在场 → "打出空间"路径（短滚 / 空接），三分倾向
    低时权重再 ×2.4（当顺下点，不当射手）。
- 假掩护、幽灵跑位、假突真传这三个分支**现在不存在**。
- 引擎读方案的入口是现成的：构造函数里读 `gameplan.matchup` 与
  `gameplan.offenseFocusId`（`sim.js:205–223`），每回合读
  `off.gameplan?.tempo`（如 `sim.js:935`）。新字段走同一条路（§3.5）。

### 1.3 已有的、可以直接用的字段（不新加字段的底气）

- 能力值：`three` / `threeTend` / `mid` / `paint` / `strength` / `iq` /
  `scoring` / `offenseStyle`（spot / stretch / post 等）/ `playPos` / `pos` /
  技能 `pnr_master` / 组合 `pick_roll_twins`。
- 倾向（球员卡上已有，`orders`）：`usage` / `aggression` / `action` /
  `attack` / `hunt` / `defFocus`；`aggressionLevel(p)`（`gameplan.js`）把
  攻击欲望量化成 0–1，引擎的"除非大空位否则先传"门已经在用它。
- 性格：`intangibles` 的 `systemAdapt`（执行指定角色的适配）、`ballNeed`
  （要球欲）、`ego` / `fiery`——`systemFitScore` 与 `lineupFit`
  （`js/engine/chemistry.js:87`）已经在用它们算体系契合，板面右侧的
  "体系契合"就是这个数。**性格不新加字段；板上的推荐与契合预览复用这套
  已有数值。**

## 2. 设计总览

挡拆从"持球人一个打法"升级成"一个五人配合"：持球人 + 掩护人 + 掩护后
选择 + 其余三人站位 + 持球人终结。五层都落在**同一份方案**里，随战术板
Apply 一起写进球队（`applyDraft` 的写路径不变），随开打进引擎。

```
gameplan.pnr = {
  screenerId: "p-xxx",          // 掩护人（首发五人之一，不能是持球人）
  afterScreen: "roll",          // roll | pop | slip | ghost
  offBall: { "p-yyy": "spot", "p-zzz": "cut", ... },  // 其余三人每人一个
  finish: "drive",              // mid | drive | fake_kick（持球人终结）
  // 只存玩家明确选过的项；没选的字段不写（实现时删掉了 `manual`：字段存在就是"已改"，见 §9）
}
```

- 这是**加法字段**：`gameplan.pnr` 不存在时等于"全部自动"（§3.4 的推荐
  值），旧存档照常读，不升存档版本、不做迁移（M4 的教训：加法、命名空间、
  旧存档不改写）。
- 只在 `ballAction === "pnr"` 时生效。持球打法不是挡拆时，`gameplan.pnr`
  留在方案里但引擎不读（换打法不用删它，切回来还在）。
- `scope` 仍是队默认 + 本场（和板子现在一样）；分对手的挡拆方案以后再说。

## 3. 细则

### 3.1 掩护人（screenerId）

- 候选：首发五人里除持球人之外的四人。点站位图上的球员卡选（复用
  `SELECT_PLAYER` 的点卡交互），或下拉选。
- 推荐值：直接复用 `pickScreener` 的挑法（力量 + 球商 + 位置加成）
  ——引擎现在事后挑的就是这个人，板上只是把它提前、交给玩家定。
- 换首发时跟持球人同规则（`SYNC_STARTERS`）：掩护人离场则清空，
  回落到推荐值，不阻塞开打。

### 3.2 掩护后选择（afterScreen）

| 选项 | 球场含义 | 引擎效果（意向，数值由 Code 校准，见 §5） |
| --- | --- | --- |
| `roll` 下顺 | 掩护后顺下冲筐 | 掩护人成为顺下点：分球权重走现有顺下路径（C/PF + paint 高那档），接球后篮下权重抬；掩护加分照算 |
| `pop` 外拆 | 掩护后弹到三分线外 | 是射手（`isFloorShooter`）→ 分球后三分权重抬（现有 ×1.65 那档）；不是射手 → 板上给警告（§3.6），引擎照跑但不给射手权重 |
| `slip` 假掩护 | 没等掩护做实就提前顺下，防守人被骗向掩护点 | 不算一次掩护（无 `gradeScreen` 加分）；顺下权重比 `roll` 更高（提前启动），但持球人少了掩护带来的分离——`kickChance` 的 +0.1 不给 |
| `ghost` 幽灵跑位 | 根本不设掩护，直接溜向空位 | 没有掩护：无加分、无 `kickChance` 加成、无顺下权重；掩护人按 §3.3 的定点/空切当无球人处理；持球人按无掩护打（近似单打权重） |

- 推荐值：是射手 → `pop`；`paint ≥ 72` 或弹跳内线 → `roll`；其他 → `roll`
  （默认下顺，下限最高）。
- `slip` / `ghost`：板上写清引擎做了什么（无掩护加分）。最初设想的“高风险”标签没有测量支持，已撤（见 §8 更正）。

### 3.3 其余三人（offBall：spot 定点 / cut 空切）

- 每人一个：**定点**（等空位接球投）或**空切**（往篮下走，等球上篮）。
- 推荐值：是射手（`isFloorShooter`）→ 定点；否则 → 空切。
  这就是用户说的"有三分的等空位，没有的就进去上篮"。
- 关键规则：**这个选择不改 `orders.action`**。`orders` 是球员常驻倾向
  （球员卡上那套）；挡拆方案是本场指令。引擎读方案时优先用
  `gameplan.pnr.offBall`，没有才回落到 `orders.action`
  （`spot` 已有现成权重：分球 ×1.45、投篮选择 `w3 ×1.35`；`cut`
  走顺下那套权重，数值由 Code 校准）。
- 性格落在这里：`systemAdapt` 低的球员被指派空切时，板上的契合预览
  （复用 `lineupFit` / `systemFitScore` 的数）会低——不是新属性，
  是已有数值的呈现。

### 3.4 持球人终结（finish）

| 选项 | 含义 | 引擎意向 |
| --- | --- | --- |
| `mid` 中投 | 借掩护后中距离拔起 | 在现有 `action === "pnr"` 的 `wMid ×1.4` 基础上再抬中投权重 |
| `drive` 突破 | 借掩护后杀筐 | 抬篮下权重（现有 `wPaint ×1.22` 那档再往上） |
| `fake_kick` 假突真传 | 假装突破吸引协防，实际分球 | `kickChance` 再抬一档，分球权重向空位人倾斜（现有分球路径，不新造传球模型） |

- 推荐值：`midSkill ≥ 72` 或中投型持球人 → `mid`；否则 → `drive`
  （现有代码里 `midSkill ≥ 72` 已经是中投加权的门槛，沿用它）。
- `fake_kick` 永远是手动选项，不当推荐值（需要玩家判断协防，不能
  靠数值推）。

### 3.5 板面（UI）

- 挡拆面板只在持球打法选了"挡拆"时出现，放在底部打法按钮下方、
  站位图旁边（不挤占体系卡与防守区）。
- 内容（按顺序）：① 掩护人（站位图点选 + 当前人选显示，推荐值带
  "推荐"角标，和打法按钮同一套角标样式）；② 掩护后四选一
  （下顺 / 外拆 / 假掩护 / 幽灵，按钮组）；③ 其余三人每人一行
  （头像 + 名 + 定点/空切切换）；④ 持球人终结三选一
  （中投 / 突破 / 假突真传）。
- 推荐值全部自动填好，玩家一个不改也能打；改任何一项 → 该行标
  "已改"（和倾向卡的"推荐"角标同一套语言：没手动改过就显示推荐）。
- 校验与警告进现有的 `validateDraft` / 板面错误行（§3.6），不另起
  一套提示。

### 3.6 校验（沿用 validateDraft 的规矩：error 拦住 Apply，warning 只提醒）

| 码 | 级别 | 含义 |
| --- | --- | --- |
| `PNR_SCREENER_NOT_ON_TEAM` | error | 掩护人不在队里（旧存档脏值，`createDraft` 应已洗掉；守的是非 createDraft 路径） |
| `PNR_SCREENER_IS_HANDLER` | error | 掩护人就是持球人 |
| `PNR_SCREENER_NOT_A_STARTER` | warning | 掩护人不在首发五人（可打，但掩护质量按替补算；不拦） |
| `PNR_POP_WITHOUT_SHOT` | warning | 外拆的掩护人不是射手（`isFloorShooter` 为假） |
| `PNR_AFTER_SCREEN_UNKNOWN` | error | 未知的 afterScreen 值（旧存档脏值） |

- `createDraft` 负责洗脏值（和 2026-11-21 修的"脏草稿从出生就无效"
  同一手法）：未知战术 / 非法打法 / 非法掩护人 → 回落推荐值，
  不让玩家卡在 Apply 变灰、开不了球的状态。

### 3.7 引擎消费（Code 的范围，精确到触点）

1. **读入**：构造函数里像 `offenseFocusId` 一样读
   `gameplan.pnr`（`sim.js:205–223` 附近），存为本局计划；没有该字段
   时整套回落到现在的权重行为——**零回归**。
2. **掩护人**：`pickScreener` 的调用点改成"方案指定优先，缺省再自动挑"；
   被指定的掩护人拿 `gradeScreen` 加分（现在是事后挑的人拿）。
3. **下顺 / 外拆**：分球权重（`kickToTeammate`）与接球后投篮选择
   （`sideCtx.kickedOut` 分支）按 §3.2 的表，对**被指定的那个人**
   加权，而不是对"任意一个 C/PF / 任意一个射手"加权。这是本次改动
   的核心——现在的权重认的是位置和属性，改完认的是人。
4. **假掩护 / 幽灵**：按 §3.2 的表，跳过掩护加分与对应的 `kickChance`
   加成；幽灵的掩护人走无球人权重。
5. **终结**：持球人投篮选择里，`finish` 在现有 `action === "pnr"`
   权重上再分一档（§3.4）。
6. **不造新骰子、不加竞争加成**：所有效果走现有权重与传球路径；
   `pnr_master` 技能与 `pick_roll_twins` 组合的触发条件不变。

## 4. 不做（这次明确排除）

- 不加偷懒 / 拼劲 / 努力属性（用户决定；2026-11-19"尽全力"那条继续有效）。
- 另外五个打法（突破分球 / 单打清侧 / 无球定点 / 低位要球 / 冲抢二次）
  不做角色分配，保持现状；以后按挡拆这套路复制。
- 不做分对手的挡拆方案（`scope` 仍是队默认 + 本场）。
- 不做新的防守回应（对手对挡拆的换防 / 包夹策略是防守 AI 的事，
  不在本设计里；`ghost` / `slip` 的防守收益只体现在我方权重的
  取舍上）。
- 不改 `orders` 的取值与引擎读取（倾向卡那套不动）。

## 5. 分工、测试与度量

- **板 + draft + 存档字段**：战术板 UI（`tacticsBoardView` / `tacticsBoardModel`）、
  `tacticalDraft`（新字段、新校验码、洗脏值）、`composeGameplan` 透传。
  Lychee 可做 UI 部分（小功能线）；但因与 Code 的 Slice 1 认领区
  （`#screen-setup` 与 setup/live 接线）重叠，动手前先在板上认领、协调。
- **引擎**：`sim.js` / `grade.js` 的 6 个触点（§3.7）归 Code Puppy；
  `sim.js` 单人规则，别人不碰。
- **测试**（随实现一起交）：
  - `tests/tacticalDraft.test.js`：新字段来回写读、5 个新校验码、
    脏值回落、换首发清空掩护人。
  - `tests/tacticsBoard.test.js`：挡拆面板只在 `ballAction === "pnr"`
    时出现、推荐值推导（射手→外拆/定点、非射手→下顺/空切）、手动
    覆盖标"已改"。
  - 固定种子 sim 测试：指定掩护人拿掩护加分、未指定时自动挑不变；
    `pop` + 射手 vs `pop` + 非射手分球去向不同；`ghost` 不产生掩护加分。
  - 全套 + lint（`--max-warnings 2`，新代码 0 警告）。
- **度量**：`scripts/measure/pnr-roles-ab.mjs`，固定种子、同一批对局，
  对比"自动（现状）" vs "指定掩护人 + 下顺" vs "指定掩护人 + 外拆"
  的挡拆回合占比与得分效率——只报告引擎自己的数，不预设结论。
  参照 `scripts/measure/coach-tactics-ab.mjs` 的写法。

## 6. 验收（Code 交活时逐项打勾）

- [ ] 板上能选掩护人（点站位图或下拉），能选掩护后四项、其余三人
      定点/空切、持球人终结三项；全部有推荐值，不改也能打。
- [ ] Apply 后开打，引擎按选的人打：指定掩护人拿掩护加分；
      `pop` + 射手分球找他，`pop` + 非射手有警告且不给射手权重；
      `ghost` 不产生掩护加分。
- [ ] 旧存档（没有 `gameplan.pnr`）照常读、照常打，行为与现在一致。
- [ ] 脏值（掩护人离队、未知 afterScreen）不卡 Apply、不卡开打。
- [ ] 全套 + lint 通过；Mac 浏览器实看（板面点选、开打后挡拆回合）。

## 7. 局限与待定

- §3.2 / §3.4 的权重"再抬一档"只定了方向与参照档位（现有 ×1.35 /
  ×1.55 / ×1.65），具体数值由 Code 校准（B76 是投篮校准线，归 Code；
  数值不对时调数值，不改结构）。
- `slip` 的"防守人被骗"目前只体现为我方顺下权重更高，不单独建模
  防守人的失位——如果 Code 认为需要防守侧配合，在实现时补一条，
  不扩大本次范围。
- 本设计不回答"挡拆打多了对手会不会适应"——那是
  `coach-tactical-depth-design.md` 的对手阅读（opponent readiness）
  的事，两者是正交的：这里定"怎么打"，那里定"对手记不记得你这么打"。

## 8. 引擎侧已落地（Code Puppy，2026-11-22，切片 1）

只做引擎 + 方案字段读入；**板上 UI、`tacticalDraft` 的字段/校验/洗脏值（§3.5–3.6）还没做**，所以现在只有直接写 `team.gameplan.pnr` 才会生效。

- `js/engine/pnrPlan.js`（纯函数，不抽随机数）：`cleanPnrPlan`（脏值逐字段洗掉）、`resolvePnrPlay`（掩护人必须在场且不是持球人，否则回落自动）、
  `pnrKickMult` / `pnrShotMult` / `pnrKickChanceBonus` / `pnrOpenBonus`。`isFloorShooter` 原样搬到 `js/engine/shooterType.js`（纯重构，避免循环依赖；切片 2 起 `isMidHandler` 也在这里）。
- `sim.js` 只加接线：持球人 `orders.action === "pnr"` 时解析一次 `pnrPlay`，放进 `sideCtx.pnr`；`kickToTeammate` 多一个参数；`chooseShot` 末尾乘一个
  `{w3,wMid,wPaint}`；`gradeScreen` 用被指定的掩护人，`slip` / `ghost` 不加掩护分；`ghost` 时 `scheme = null`（没有任何挡拆权重）。
- **零回归：** 没有 `gameplan.pnr`、或字段全是脏值 / 掩护人不在队里，逐字节等于现在（测试：3 个种子的比分与全队技术统计逐项一致；金标不变）。
- **权重认人不认位置：** 指定了掩护人以后，"C/PF 且 paint ≥ 72"这档通用滚下加权只留给被指定的人，别的大个子把它交出来。
- `scripts/measure/pnr-roles-ab.mjs`：同种子同阵容，全员 `pnr` 打法，只改 `gameplan.pnr`。**样本要够大：24 场里 finish 差 ±2 分，120 场时只剩 ±0.4（噪声）。**

实测（120 / 100 场，同种子，场均得分；只报告引擎的数）。

> **更正（2026-11-22，同日）：** 本节最初的表是错的。`pnr-roles-ab.mjs` 写 `p.orders = {action:"pnr"}`，但没标 `ordersManual`，引擎会按推荐值重算订单，
> 所以“全员打挡拆”并没有生效（基线 101.9，真正全员挡拆是 110.0）。改用 `markOrdersManual` 后重测如下，**先前“幽灵纯代价 −1.4/−3.6”的结论不成立**。
> 每格噪声约 ±1 分，下表里小于 1 分的差别不要解读。

| 方案 | 公牛96 vs 超音速96（掩护人 朗利，120 场） | 湖人00 vs 开拓者00（掩护人 奥尼尔，100 场） |
|---|---|---|
| 现状（无方案） | 110.0 | 115.0 |
| roll 下顺 | 110.1 | 115.6 |
| pop 外拆 | 109.8 | 116.0 |
| slip 假掩护 | 109.5 | 117.0 |
| ghost 幽灵 | 109.0 | 116.3 |
| finish 中投 / 突破 / 假突真传 | 111.2 / 110.2 / 111.7 | 117.4 / 116.8 / 117.6 |

读法与局限：
- `roll` 与现状在噪声内一致：朗利、奥尼尔本来就满足通用滚下那一档，指定他们等于确认引擎本来的选择。
- `slip` / `ghost` 两队都没有可见的得分代价（公牛 −0.5 / −1.0，湖人 +2.0 / +1.3，都在噪声边缘）。它们去掉的是掩护加成，换来的是掩护人更空、出手更多
  （掩护人出手：湖人 12.9 → 14.4 / 14.6，公牛 4.5 → 5.3 / 5.0）。所以板上**不再标“高风险”**，提示只写引擎做了什么。
- 三个终结方式都不低于现状，`fake_kick` 在两队都是 +1.7 ~ +2.6；原先“对公牛是负的”来自上面那个没生效的订单。
- 引擎仍然不模拟防守对挡拆的反应（换防 / 包夹 / 沉退），所以“幽灵只在对手包夹时才有意义”这类说法没有依据，板上也已删除。要给它们一个真实的上行/下行，
  需要先做 B25（防守战术对挡拆的真实行为），见 `b25-defense-behaviour-design.md`。
- 多数球员的 `kickChance` 已经被 0.72 封顶，所以 `fake_kick` / ghost 对**整队传球数**几乎没有影响；它们的效果走的是投篮权重和 `scheme` 权重。

## 9. 板上面板与 `tacticalDraft` 已落地（Code Puppy，2026-11-22，切片 2）

玩家现在可以在 Gold 赛前页选挡拆角色。持球核心的打法是"指拆"时，战术板下面出现"挡拆配合"：掩护人、掩护之后、其余球员（定点/空切）、持球人终结，外加"全部恢复推荐"。

**和 §2/§3.7 的一处取舍（写下来免得以后被当成 bug）：** §2 说推荐值全部预填，§3.7 说没有 `gameplan.pnr` 就零回归。两句同时成立的做法是：**`draft.pnr` 只存玩家明确选过的项**，没选的显示"推荐"角标但不写入。推荐值本来就是引擎不填时的自动行为（`recommendPnrPlan`：掩护人 = `pickScreener` 事后挑的那个人，会投的外拆、其余下顺，射手定点、其他人空切，持球人是中投型就中投、否则突破），所以"不选"和"选推荐"打出来是同一场球；打开板子、点 Apply 不会改变任何比赛。因此 §3.2 的 `manual` 字段没有必要，已删。`fake_kick` 永远不会被推荐。

- `tacticalDraft.js`：`draft.pnr`；`SET_PNR`（null 清一项）、`CLEAR_PNR`（全部恢复推荐）；换持球人时他不能同时是掩护人；`SYNC_STARTERS` 时离开首发的掩护人/其余球员从方案里掉出来，**不算改动**（draft 和已存快照一起动）；`createDraft` 洗脏值（不在队里的掩护人、掩护人=持球人、未知动作、不在队里的其余球员），Apply 不会被卡灰；`composeGameplan` 多一个 `pnr` 参数，没有就不写字段。
- 校验码：错误 `PNR_SCREENER_NOT_ON_TEAM` / `PNR_SCREENER_IS_HANDLER` / `PNR_AFTER_SCREEN_UNKNOWN`；警告 `PNR_SCREENER_NOT_A_STARTER` / `PNR_POP_WITHOUT_SHOT`（只在这套方案真的是挡拆时才提示）。
- `app.js` 的老开打处理器会整体重建 `gameplan`，所以加了一行透传 `pnr`，否则不点 Apply 直接开打会把板上存的角色抹掉。
- 幽灵跑位：保留为可选项。**最初标了红色“高风险”，同日撤掉**：那个标签依据的是上面被更正的测量；重测后没有可见代价，板上只写它做什么、对全队得分影响很小。
- 面板文件：`pnrBoardModel.js`（纯函数）/ `pnrBoardView.js`（HTML）；样式在 `css/tacticsBoard.css`。
- 已知没做：§3.3 的"性格/契合预览"（空切给一个不爱空切的人会怎样）；板子推荐的"其余球员"在没有射手的阵容里全是空切，这是现有 `isFloorShooter` 的结果，没动。
- 验证：`tests/tacticalDraftPnr.test.js` 9、`tests/pnrBoard.test.js` 6，共 15 个新测试，变异全部抓到；真实浏览器 `scripts/qa/gold-pnr-roles.mjs` 桌面 + 390px 各 16 项全过（含"选了不 Apply 就不存档""不选就不写""开打后角色还在""按钮 ≥44px"）。
