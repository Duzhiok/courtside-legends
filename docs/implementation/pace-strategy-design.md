# 教练节奏三档设计：提速 / 正常 / 降速各有打法（**PROPOSED，未批**）

> 日期 2026-11-26 · 起草 Lychee（researcher）· 用户原话（2026-11-26）：“教练策略中，提速降速和平常应该各有各的优势和特点，不应该只是速度和失误率。你好好计划一下，在追分的时候如果时间不是很富裕教练肯定是想提速的。快攻三分什么的，出欲望增加，抓机会能力强。”
>
> 状态：**PROPOSED，未批准，不动代码**。本文只计划，不实现。数字全部是测量的起点，不是定稿。
>
> 前置文档：`b26-pace-adaptation-design.md`（push 代价随阵容缩放、抢攻倍率随分差/时钟分级，已实现）、`b4-comeback-strategy.md`（大比分落后 AI 追分，已实现）、`coach-tactical-depth-design.md`（`setTempo("grind") + slow_pace` / `setTempo("push") + pace_three` 是既定的“降速磨阵地 / 提速抢三分”组合打法）。

## 1. 今天的引擎是什么样（已核查，只陈述事实）

### 1.1 三档的全部定义：`js/engine/gameplan.js` 的 `TEMPO_OPTIONS`

| 档 | paceMult | makeBonus | openBonus | tovMult | 用时窗口 usedLo–usedHi |
|---|---|---|---|---|---|
| grind 降速 | 0.7 | +0.032 | +0.045 | 0.78 | 14–28 秒 |
| normal 正常 | 1 | 0 | 0 | 1 | 6–24 秒 |
| push 提速 | 1.32 | −0.024 | −0.035 | 1.22 | 4–14 秒 |

用户说得对：**今天三档的区别确实只有速度（回合数）和失误/命中**。`normal` 是零修正的基线；`grind` 的全部好处是命中/空位/失误三项；`push` 的全部代价是同一三项反过来。

### 1.2 节奏在 `js/engine/sim.js` 里的四个读数点（都在玩家方才生效）

节奏只对 `off === this.you()` 的一方读数（CPU 没有节奏拨档；CPU 的节奏脑是 B4 的 `updateComeback`）。四个读数点：

| 读数点 | 位置 | 作用 |
|---|---|---|
| 回合用时 | `resolvePossession` ~946–966 | `pace *= tempo.paceMult`；`used = rand(8,20)/pace` 再夹进 tempo 的用时窗口。push 回合约 10 秒，normal 约 14 秒，grind 约 20 秒（由用时窗口和 paceMult 算出的均值，见 §4.1） |
| 失误率 | ~1075 `tempoTov` | `scaleTempoCosts(tempo, runningFit)` 后的 `tovMult` 乘进 `tovChance`（B26：代价随阵容跑动能力缩放，0.5–1.5×） |
| 空位 | ~1127、~1163 `tempoDef.openBonus` | 直接加到 `open` 上（grind +0.045 / push −0.035，同样经 `scaleTempoCosts` 缩放） |
| 命中 | `calcMakeProb` ~4702 `tempoMakeBonus` | `base += tempoMakeBonus`（grind +0.032 / push −0.024，同样缩放） |

### 1.3 节奏已经影响体能（`applyPossessionFatigue`，`fatOpts`，~3757）

这是今天唯一“不只是速度和失误率”的节奏差异，但藏在体能公式里，界面上看不见：

- grind：慢跑税 ×0.32、传球税 ×0.28、创造税 ×0.88、弱侧防守税 ×0.4；`huntCost` ×0.75（降速少仓促强打）；主防追防税 ×0.92。
- push：慢跑税 ×1.15、传球税 ×1.1、创造税 ×1.12、弱侧防守税 ×1.12。

也就是说**今天 push 已经更累、grind 已经更省**——但因为体能只通过 `runningFit` 间接回流到 push 代价（B26），玩家感受不到“提速的体能账”。

### 1.4 出手选择今天完全不认节奏（`chooseShot`，~4265）

`chooseShot` 的三分权重 `w3` 由球员倾向、球风、战术重点（`pace_three` 时 ×1.5、`slow_pace` 时 ×0.72）、B4 追分（×(1+0.30×level)，只对 `three ≥ 55`）和终场 `needThree`（射手 ×3.2 / ×2.1）决定。**节奏拨档本身对出手分布零影响**：push 不会多投快攻三分，grind 不会多打阵地——这正是用户指出的缺口。`offenseHuntLevel`（~3634，出手欲望）同样不认节奏：基础值来自教练进攻 buff，`hunt`/`patient` 指令 ±，B4 追分 +0.20×level；节奏不在其中。

### 1.5 追分机制今天已经有两套，但都不碰节奏拨档

- **B4 `updateComeback`**（~3371，Q3 起、落后 ≥10 分）：`level = (deficit−10)/12`；`paceMult = 1 + 0.12 × level × runningFit`（慢的或累的阵容不提速）；三分权重 ×(1+0.30×level)；`offenseHuntLevel` +0.20×level。**只对 CPU 和快速模拟里的玩家方**；玩家亲自指挥时不改玩家的战术。
- **终场抢攻脚本 `applyLateGameScripts`**（~3397，`lateGameInfo` ~3327）：Q4、落后 1–9 分、时钟 ≤150 秒（分差 ≤6 时 ≤200 秒、≤3 时 ≤240 秒）时 `chase.paceBoost`，倍率 `chasePaceMult`（B26：随“每分落后的剩余秒数”和阵容分级，1.28/1.42/1.49）；`needThree` 时把球给最稳射手并强制三分（`w3` ×3.2 / ×2.1，砖匠仍有硬门槛）。防守方落后则战术犯规（`wantIntentionalFoul`，Q4、落后 1–6、时钟 ≤36 秒），犯规后立刻进抢攻三分窗口。
- **托管进攻计划 `managedOffensePlan`**（~2085–2170，自动教练）：落后末节 1–9 分时布置 `pace_three` 重点（约 6 回合）+ 进攻 buff 14；落后 ≥10 分时 `iso_star`；**领先 ≥8 分时自动把 tempo 改成 grind**（只在 tempo 是 normal/缺省时）。**没有任何分支把 tempo 改成 push**——注释原话（~2155）：“节奏 push 不在这里动：tempo 是粘性的、无归还规则，push 自身还有效率代价，属 wash 权衡而非明确惩罚。”

### 1.6 今天没有的东西（设计必须补的缺口，逐项核实）

- **没有转换进攻/快攻模型**。`sim.js` 里没有快攻阶段；全仓唯一的 transition 字样是 `AUTOPILOT_SWAPPABLE_GROUPS` 里的 `pace_transition` 战术组名（~123）。“快攻三分”今天不存在，只能由“回合更短 → 回合更多”间接产生。
- **节奏和犯规没有关系**。犯规只来自 `gradeFoul` 各处（松动球犯规、战术犯规、投篮犯规等），没有任何读数点认 tempo。push 不会多造犯规，也不会多送犯规。
- **节奏不影响防守平衡**。push 的防守方只在体能税里多付一点（见 §1.3）；没有“提速后退防不及、对手空位更好”的机制。B26 文档 §5 原话：没有实现“随对手防守变化”，因为引擎里没有转换防守的概念。
- **节奏是粘性的**。`setTempo`（~1670）是唯一入口；领先自动降速有去路，落后自动提速没有去路，玩家不手动改就一直是 normal/grind。

## 2. 设计目标

1. **每档是一个打法，不是一个滑块**：提速 = 抢回合 + 抢三分 + 抢机会，代价是质量、退防和体能；降速 = 磨质量 + 磨失误 + 磨篮板/二次进攻，代价是回合数和追分能力；正常 = 无代价、无红利的基线，代价是机会成本。
2. **追分时提速必须是明显正确的选择**，而且游戏要把它讲出来（不只是算出来）。
3. **只在已有的杠杆上加，不发明新系统**：新机制只有一个——push 的退防代价（§3.1 的 T5），其余全部是把现有读数点（§1.2–§1.4）接上节奏。
4. **平均不漂**：沿用 B26 的标定原则——联盟平均（得分、命中率、失误）保持在现有水平附近，只改分布（哪支队、在哪种局面下用哪档更赚）。

## 3. 三档的新身份（数值是起点，须实测标定）

下表只列**新增**的杠杆；§1.1–§1.3 的现有数值（paceMult / make / open / tov / 用时窗口 / 体能税）全部保留。

### 3.1 push 提速——“抢回合、抢三分、抢机会”

| # | 杠杆 | 机制（起点值） | 读数点 |
|---|---|---|---|
| P1 | 快攻三分 | `chooseShot` 里 tempo=push 时 `w3 × 1.25`，只对 `three ≥ 55` 的人生效（沿用 B4 的硬门槛逻辑，不会投的不投）。与 `pace_three` 重点（×1.5）和 `needThree`（×3.2）**乘法叠加、设上限**：三者同在时总倍率不超过 ×3.5，避免末节三分占比爆炸；但上限不砍到 pace_three + needThree 自身已有的 4.8 以下（实现：`min(合乘, max(3.5, 非节奏合乘))`）——追分时提速只能帮忙，不能帮倒忙 | `chooseShot`（新增 tempo 读数，见 §6） |
| P2 | 出手欲望 | `offenseHuntLevel` +0.15（push 时）。`hunt` 会抬高强打频率和失误里的 `forcedHunt` 项——欲望的代价自动由现有公式收 | `offenseHuntLevel`（新增 tempo 参数，见 §6） |
| P3 | 抓机会 | 出手门槛放宽：`shotOpenThreshold` −0.06（push 时），即“一般的空档就投，不等大空位”。与 P2 的区别：P2 是更想打，P3 是更敢投。只对 `aggressionLevel` ≥ 0.5 的球员生效，避免蓝领跟着乱投 | `shotOpenThreshold` / `shotGateLevel`（`gameplan.js`，新增 tempo 读数） |
| P4 | 转换抢断/压迫（可选 v1.1） | push 时防守压迫 `defPress` +0.1（抢断、造失误），代价是被过掉后对手空位更好。**先不做**：压迫已有教练防守 buff 一条通道，再加节奏通道会双重叠加；列为后续项 | —（本次不做） |
| T1 | 质量代价（已有） | make −0.024 / open −0.035（B26 缩放不变） | 已有 |
| T2 | 失误代价（已有） | tov ×1.22（B26 缩放不变） | 已有 |
| T3 | 体能代价（已有，显性化） | 体能税 ×1.10–1.15 不变；新增一条反馈：**push 的体能税直接拉低 `runningFit`**，于是 B26 的代价倍数（0.5–1.5×）越推越贵——今天这个循环已经存在（B26 §5），设计只要求界面把它显示出来（见 §5） | 已有机制 + UI |
| T4 | 退防代价（**新增，唯一新机制**） | push 的回合若以打铁/失误结束，对手**下一回合** `open` +0.02（退防不及）。理由：这是 B26 留下的“随对手防守变化”的最小实现——不建转换防守模型，只记“上一回合是不是推快后没进”。实现：`off.temp.lastPushMiss` 一位标志，下一回合防守方读数时清掉。起点 +0.02，须实测（对手快攻得分不应超过真实 NBA 的转换占比） | `resolvePossession` + `calcOpenness` 调用点（新增一位标志） |
| T5 | 犯规（可选 v1.1） | push 时多攻筐 → 投篮犯规率相对 +10%。**先不做**：今天犯规与节奏零耦合（§1.6），接线要动投篮犯规 roll，须单独测量 FTA/FGA；列为后续项 | —（本次不做） |

**push 的一句话身份**：回合更多、三分更多、更敢投；代价是投得更差、退防更慢、累得更快。阵容越快越不累，赚得越多（B26 已有）；阵容慢或累，T1–T4 全额收取。

### 3.2 grind 降速——“磨质量、磨失误、磨篮板”

| # | 杠杆 | 机制（起点值） | 读数点 |
|---|---|---|---|
| G1 | 阵地出手 | `chooseShot` 里 tempo=grind 时 `w3 × 0.90`、`wMid × 1.10`、`wPaint × 1.05`（磨阵地多打中投/内线，少仓促三分）。与 `slow_pace` 重点（w3 ×0.72）乘法叠加 | `chooseShot`（与 P1 同一读数点） |
| G2 | 耐心 | `offenseHuntLevel` −0.10（grind 时）：少强投、多传导。`hunt` 下降同时降低 `forcedHunt` 失误项——耐心的收益自动由现有公式收 | `offenseHuntLevel`（与 P2 同一读数点） |
| G3 | 冲板/二次进攻 | grind 时冲抢权重上升：进攻篮板争抢（`reboundContestWeight` 的进攻方项）+10%，且 `putback` 权重不变（不重复造二次进攻，只让磨阵地的球队更敢冲前场板）。理由：降速的球队回合少，每回合的二次进攻价值更高 | 进攻篮板争抢读数点（须确认 `reboundContestWeight` 的调用形状，见 §6） |
| G4 | 体能收益（已有，显性化） | 体能税 ×0.28–0.88 不变；grind 的球队末节 `runningFit` 更高，于是 B26 的 push 代价更低、 B4 的追分提速更有效——**降速是留给末节的体能储备**，界面要讲出来（见 §5） | 已有机制 + UI |
| G5 | 质量收益（已有） | make +0.032 / open +0.045 / tov ×0.78（不变） | 已有 |
| C1 | 回合代价（已有） | paceMult 0.7、用时 14–28 秒：同样 60 秒只打约 3 个回合（§4.1）。追分时时钟是敌人——grind 在落后时是错的，而且错得很大 | 已有 |
| C2 | 机会代价（新增） | G2 的反面：耐心 = 少抓机会。grind 时 `shotOpenThreshold` +0.04（只投好机会），与 P3 对称 | `shotOpenThreshold`（与 P3 同一读数点） |

**grind 的一句话身份**：投得更准、丢得更少、板抢得更凶、体能留得更多；代价是回合更少、追分更难。领先保胜、体能见底、对方跑不起来时最赚。

### 3.3 normal 正常——“无代价、无红利的基线”

- 全部修正为 0（今天就是这样，保持）。
- 它的身份就是**没有身份**：不交质量税、不交体能税、也不拿任何红利。选 normal 的代价是机会成本——领先时不磨、落后时不抢。
- 设计上 normal 不需要新杠杆；它的作用是让两档的取舍可比（任何一档的收益都要先减去“如果我用 normal 会怎样”）。

## 4. 追分规则：时间不够时，提速必须是正确答案

### 4.1 算术：为什么时间越紧，回合数越值钱

由 §1.2 的用时公式算出的每回合平均用时（`used = rand(8,20)/pace` 夹进窗口）：

| 档 | 每回合约 | 60 秒能打 | 120 秒能打 |
|---|---|---|---|
| push | ~10 秒 | ~6 个回合 | ~12 个 |
| normal | ~14 秒 | ~4 个 | ~8–9 个 |
| grind | ~20 秒 | ~3 个 | ~6 个 |

落后 5 分剩 60 秒：normal 约 4 个回合要拿 5 分（每回合 1.25 分，远高于联盟平均约 1.1 分/回合）；push 约 6 个回合，每回合只需 0.83 分——**哪怕 push 每回合效率低 10%，多出来的 2 个回合仍然赢**。这就是“时间不够时教练肯定想提速”的算术，设计要让引擎和界面都体现它。

### 4.2 规则（复用现有窗口，不发明新时钟）

- **追分区**：`lateGameInfo` 的 `chasing` 窗口（Q4、落后 1–9 分、时钟 ≤150 秒；分差 ≤6 时 ≤200 秒、≤3 时 ≤240 秒）**加上** B4 区（Q3 起、落后 ≥10 分）。两个窗口都已存在、已有测试，不改定义。
- **区内 push 的收益叠满**：P1（w3 ×1.25）与 `needThree`（射手 w3 ×3.2，见 §1.4）乘法叠加、上限 ×3.5；P2（hunt +0.15）与 B4 的 +0.20×level 叠加；`chasePaceMult`（1.28–1.49）与 push 的 paceMult 1.32 叠加——区内推满时回合约 7–8 秒，60 秒能打 7–8 个回合。**叠加方式必须写进测试**（乘法、上限、射手门槛三项各一条，见 §7）。
- **区内 grind 自动判负**：不改数值，改提示（见 §5）——在追分区里选 grind，界面明确说“回合不够，追不上”。
- **体能门**：追分区里推不推还要看能不能跑。`runningFit < 0.4` 时不建议 push（B26 的代价倍数此时 ≥1.37×，且 T4 退防代价照收）。这个门沿用 B26 的参照值（平均 fit 0.69），不是新数。

### 4.3 呈现：游戏要把“该提速了”讲出来

今天没有任何地方告诉玩家“现在该提速”。新增一个**纯 UI 的建议读数**（不改玩家战术，沿用 B4“玩家亲自指挥时不改玩家的战术”的原则）：

- **触发**：追分区内（§4.2）且当前 tempo ≠ push 且 `runningFit ≥ 0.4`。
- **位置**：接管面板（`app.js` ~8104 `#takeover-tempo-row` 旁）和教练时刻面板（`coachingMomentView.js` ~95 节奏下拉旁）各一行提示，复用 `syncTempoHelp`（`app.js` ~6421）的文案位。
- **文案**（起点，由 UI 文案定稿）：“落后 N 分剩 M 秒：提速能多打约 X 个回合，快攻三分 + 出手欲望上升；现在推的代价是命中 −Y、失误 +Z（按你的阵容算）”。X/Y/Z 由当前阵容的 `runningFit` 和 `scaleTempoCosts` 算出，不是写死数字。
- **托管/CPU 方**：`managedOffensePlan` 在 `clutchChase` 时把 tempo 设为 push（今天只设 `pace_three` 重点，不设 tempo，见 §1.5）。这是本次唯一改自动教练行为的点，须用户单独点头（见 §8 决定 1）——因为它会改变所有模拟比赛的末节行为，金标必动。

## 5. 与体能、犯规、抢攻的交互

| 交互 | 今天 | 设计后 |
|---|---|---|
| 体能 | push 税高、grind 税低（§1.3）；B26 的代价倍数随 `runningFit` 浮动 | 不变。新增：界面显示“这套阵容 push 的代价倍数”（`rushCostScale(fit)` 的现成数字），让体能账可见；grind 的卖点写明是“给末节留体能” |
| 犯规 | 与节奏零耦合（§1.6） | v1 不动。v1.1 候选：push 的投篮犯规率相对 +10%（须单独测 FTA/FGA，见 §7） |
| 终场抢攻 | `chasePaceMult` + `needThree` 强制三分 + 战术犯规，三件套齐全 | 不动窗口和倍率。新增：push 与抢攻的叠加规则（§4.2，上限 ×3.5）+ 提示（§4.3）。战术犯规脚本（`tryIntentionalFoul`）完全不动——犯规买来的时间不由分差决定（B26 §5 已有结论） |
| B4 追分 | CPU/quiet 方 Q3+ 落后 ≥10 分级提速 | 不动。新增：B4 的 `paceMult` 与玩家 tempo 的关系写明——玩家方亲自指挥时 B4 不动玩家 tempo；`_quiet` 模拟里 B4 照常 |
| 领先保胜 | 托管方领先 ≥8 分自动 grind（~2142） | 不动。新增：领先时 push 的提示反向——“领先 N 分，降速能少打约 X 个回合”（同一提示组件的另一面） |

## 6. 实现地图（只列要动的地方）

| 改动 | 文件 | 说明 |
|---|---|---|
| `TEMPO_OPTIONS` 加字段 | `js/engine/gameplan.js` | 每档加 `threeMult`、`huntDelta`、`openThresholdDelta`（P1/P2/P3/G1/G2/C2 的数值来源），`desc`/`descEn` 按 §3 重写（界面文案即设计）；`usedLo/usedHi`、`paceMult`、`makeBonus`、`openBonus`、`tovMult` 不动 |
| `chooseShot` 读 tempo | `js/engine/sim.js` ~4265 | 新增 tempo 读数：push 时 `w3 × threeMult`（只对 `three ≥ 55`），grind 时 `w3/wMid/wPaint` 按 G1。注意 `chooseShot` 今天不收 tempo——要传参（`sideCtx.tempoId` 或新参数），不要读全局 |
| `offenseHuntLevel` 读 tempo | `js/engine/sim.js` ~3634 | 新增可选参数或读 `team.gameplan?.tempo`：push +0.15 / grind −0.10。调用点有 5 处（~3911、~3916、~4453、~4519、~4769），要逐处确认传的 `team` 是进攻方 |
| `shotOpenThreshold` 读 tempo | `js/engine/gameplan.js` | `shotOpenThreshold(p)` 今天只看球员——要加 tempo 参数（P3 −0.06 / C2 +0.04），调用点在 `sim.js` ~1130（`openNeed`）。只对 `aggressionLevel ≥ 0.5` 的球员放宽，避免蓝领乱投 |
| 退防代价 T4 | `js/engine/sim.js` `resolvePossession` + `calcOpenness` 调用点 | 新增一位标志 `off.temp.lastPushMiss`：push 回合打铁/失误 → 对手下一回合 `open` +0.02，用完清掉。这是本次唯一新机制，须单独的变异测试（标志置位/清掉各一条） |
| 冲板 G3 | `js/engine/sim.js` ~3564 `reboundContestWeight(p, { offensive })`，进攻方调用点 ~3610 | 进攻篮板争抢权重 +10%（grind 时）。只动 `offensive: true` 那一处调用，不动防守篮板
| 提示组件 | `js/app.js` ~8104（接管面板）、`js/ui/coachingMomentView.js` ~95（教练时刻） | 纯 UI 读数：`lateGameInfo` 窗口 + 当前 tempo + `runningFit` + `scaleTempoCosts`。不调 `setTempo`，不改战术 |
| 托管方自动 push | `js/engine/sim.js` `managedOffensePlan` ~2115 `clutchChase` 分支 | 只在用户点头（§8 决定 1）后做：`focus = "pace_three"` 的同时 `you.gameplan.tempo = "push"`（只在 tempo 是 normal/grind 时；已经是 push 不动） |
| `setTempo` | `js/engine/sim.js` ~1670 | 不动——仍是唯一入口。`tacticalTakeover.js` ~44 和 `coachingChallenge.js` 的 `setTempo` 只是转发，不动 |

**刻意不动的**：`paceFit.js`（B26 的公式不动，只复用 `runningFit` / `rushCostScale` / `chasePaceMult`）；`lateGameInfo` 的窗口定义；`updateComeback`；`tryIntentionalFoul`；`TEMPO_OPTIONS` 现有六个数值字段；`FOCUS_PLAYS`。

## 7. 测量与回归（哪些要重标，哪些是包住的）

**一定会动的（须重跑、重录）**：
- `tests/fixtures/simGolden.json`：任何 `sim.js` 行为变化都会动金标（B4 动了 16/20，B35 §30/§31 动了 20/20）。按惯例 `node scripts/sim/golden-hash.mjs record` 重录，但**只在数值定稿后**重录一次。
- `tests/paceFit.test.js`：`b26chase2` 种子是 2026-11-26 技能改动后重选的；节奏改动会再次改变追分回合的构成，注释里已写“任何 GameSim 重标定后重选”。`turnovers("push",…)` 的 DiD 断言（+0.6 门槛）对 push 代价最敏感。
- 联盟校准：`scripts/measure/gamesim-calibration.mjs`（场均分，B26 基线 103.56）与 `push-tempo-by-lineup.mjs`（push 平均净胜分，B26 基线 −8.10）、`late-chase-pace.mjs`（抢攻倍率与 Q4 落后胜率，B26 基线 21.0%）三项重跑；目标是平均不漂（§2 目标 4），只看分布变化。

**新增的测试（与实现同批）**：
- `chooseShot`：push 时射手 `w3` 放大、非射手不动；grind 时 `w3` 缩小；`pace_three` 与 push 叠加上限 ×3.5。
- `offenseHuntLevel`：push +0.15 / grind −0.10；`patient` 指令仍能压住（不叠加失控）。
- `shotOpenThreshold`：push 时门槛下降、grind 时上升；蓝领（`aggressionLevel < 0.5`）不受 P3 影响。
- T4 退防标志：push 打铁后对手下一回合 `open` +0.02；命中/非 push 回合不置位；用一次即清。
- 提示组件：追分区内 tempo≠push 时出现、tempo=push 时消失、`runningFit < 0.4` 时不出现、非追分区不出现。
- 托管方自动 push（若做）：`clutchChase` 时 tempo 变 push；领先 ≥8 分时仍是 grind（回归原行为）。

**包住的（不用重测）**：`paceFit.js` 纯函数（不动）；`lateGameInfo` 窗口（不动）；`B4` 数值（不动）；UI 文案以外的 `app.js`（提示组件是新增 DOM，不动现有选择器）。

## 8. 需要用户定的事（建之前先定）

1. **追分时托管/CPU 方自动提速，还是只提示？** A：只提示（玩家方永远手动；托管方保持今天的行为，只布置 `pace_three` 重点）。B：托管方在 `clutchChase` 时自动把 tempo 设为 push。推荐 B——否则模拟比赛里追分方永远享受不到新设计；但 B 会动所有模拟比赛的末节，金标与校准都要重跑。
2. **节奏要不要也给 CPU 一档？** 今天 CPU 没有 tempo（§1.2），它的节奏脑是 B4。A：保持——新杠杆只对玩家方生效，CPU 继续用 B4。B：托管计划在追分/领先时设 tempo（即决定 1 的 B 的延伸）。推荐 A 先行、B 随决定 1 一起定：两者是同一个问题（CPU 该不该有节奏拨档）。
3. **快攻三分只做权重（v1），还是做真转换阶段（v1.1）？** v1：`chooseShot` 里 push 时 `w3 × 1.25`（§3.1 P1），无新阶段。v1.1：抢下篮板/断球后的前 6 秒为转换阶段，转换内三分权重更高、失误更高。推荐 v1——用户要的是“快攻三分多起来”，权重已能交付；真转换阶段要动回合结构，另立项。
4. **犯规要不要接节奏？** v1 不动（§3.1 T5 列为 v1.1）。如果要，起点是 push 的投篮犯规率相对 +10%，须先测 FTA/FGA 再定数。
5. **数值起点认不认？** P1 ×1.25、P2 +0.15、P3 −0.06、G1 ×0.90/×1.10/×1.05、G2 −0.10、C2 +0.04、T4 +0.02、G3 +10%——全部是起点，实测后按 B26 的方法标定（先定指标、再改数，见 B26 §2 的 M1–M5 写法）。

## 9. 非目标

- 不动 `FOCUS_PLAYS`（`pace_three` / `slow_pace` 是约 6 回合的战术重点，节奏是整场拨档，两者叠加关系见 §3，不合并）。
- 不建转换防守模型（B26 §5 已说明原因：引擎里没有这个概念；T4 是最小替代，不是模型）。
- 不改 `TEMPO_OPTIONS` 现有六个数值（`paceMult` / `makeBonus` / `openBonus` / `tovMult` / `usedLo` / `usedHi`）——B26 刚标定过，动它们等于重做 B26。
- 不碰球员能力值、技能、存档版本、模式列表。
- 不做浏览器视觉验收（本 VM 没有浏览器；接管面板的提示行须 Mac 实看，排期同其他 UI 项）。
