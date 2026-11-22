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
  manual: true,                 // 玩家改过其中任何一项（推荐值被覆盖时置 true）
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
- `slip` / `ghost` 是高风险高回报：板上要写清代价（无掩护加分、持球人
  更难摆脱），不是免费变招。

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
