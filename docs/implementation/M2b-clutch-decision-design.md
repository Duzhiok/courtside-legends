# M2b 实现设计（一页）：可注入随机数 + 绝杀决策契约

- **状态**：✅ APPROVED v2（产品负责人 2026-11-06 批准，Q1–Q4 按推荐值）。M2b-0 已落地（见 §9）；M2b-1 待做。
- **依据**：ADR-002（决策 vs 终场脚本，附条件批准）、ADR-003、`ROADMAP.md` §5、`BASELINE_AUDIT.md` §2.3 / §2.6 / §0b。本文只补实现契约，不重写它们。
- **不在范围**：战术槽完全拆分（另起 ADR；B34 已做最小修复）、Reborn（ADR-005 PR4 复用本文）、2D 接管（M3）、命中率任何加成。

## 1. 可注入 RNG，默认行为不变（M2b-0，独立 PR）

**事实**：比赛 tick 链上的 `Math.random()` = `sim.js` 48 + `skills.js` 51 + `chemistry.js` 1 + `intangibles.js` 3，共 **103 处（分布在 101 行上**：`sim.js:742`、`intangibles.js:1120` 各有一行写了两次）。另有 `skills.js` 两处 `shuffle(sigs)` 隐式用 `Math.random`，实现时发现并修掉，见 §9。`coaches.js` 的 2 处只在开局前选助教，不在 tick 链。

**方案**：新增 `js/core/rng.js`：`rand()`（默认转发 `Math.random`）、`withRng(source, fn)`（`try/finally`，必还原）。上述 4 个文件的 `Math.random()` 机械替换为 `rand()`。`GameSim` 构造器加可选 `rng`；以下**会掷骰的入口**在 `withRng(this.rng)` 内执行：`constructor`、`start`、`step`（含 `_loop` 触发）、`nextQuarter`、`runFast`、`callTimeout`、`shout`、`talk`、`substitute`、`runManagedBreak`、5 个开关 `setPaused`/`setTactic`/`setAutoOffense`/`setAutoDefense`/`setAutoRotation`，以及将来新加的 `submitDecision`（实现见 `sim.js` 的 `SEEDED_ENTRY_POINTS`）。清单写成一个常量数组，并有一条测试兜底：播种运行期间把 `Math.random` 换成直接抛错的函数，**场景走到的漏网入口会让测试变红**；场景没走到的条件掷骰分支，靠清单 + 每个入口的 `seededEntry` 标记兜底（已验证：去掉 `step` 变红，去掉 `nextQuarter` 仍绿）。后续可加"枚举 `GameSim.prototype` 对照清单 + 白名单"的测试，让清单本身成为守卫。

- 未传 `rng` 时 `rand()` 每次转发给**当下的** `Math.random`（是转发函数，不是同一个引用；所以替换 `Math.random` 的旧测试照常有效），调用顺序不变 → **默认行为字节级不变**。
- 代价：模块级替换不是并发安全的。浏览器一次一场、测试顺序执行，可接受；联机服务端若将来同进程并行多场，改为显式传参。

## 2. 绝杀决策契约（M2b-1）

```js
sim.submitDecision({ attemptId, kind: "clutch_shooter", shooterId, actionHint: "three" | "attack" })
// 引擎在回合结束事件里附带（来自真实事件，UI 不编）：
outcome = { attemptId, handedOff, attempted, zone, made, points,
            honored, reason /* "doubled"|"kicked_out"|"turnover"|"foul"|"not_on_court"|"no_possession" */ }
```

- **`attemptId`**：由 `ClutchController`（UI 状态机）发放；`sim` 只认最新一个，旧 id 的提交直接丢弃。
- **有效期（精确定义）**：决策绑定到**提交后 `you` 的下一个进攻回合**，在该回合的第一个终止事件时失效：投篮命中、防守篮板、失误、罚球结束、节末。进攻篮板后的补篮**不**再强制交给选中的人（决策已消费）。
- **存放位置**：决策存在独立的 `sim.clutchDecision`，**不写进 `off.temp.lateChase`**。

## 3. 优先级：在读取点生效，不去拦脚本

Luna 指出的关键问题：`applyLateGameScripts` 每个 tick 都重写 `lateChase`（含 `shooterId`、`needThree`、`paceBoost`），如果把玩家选择写进 `lateChase`，下一 tick 就会被盖掉。所以**不改脚本、不加守卫**，而是在 `resolvePossession` 读取时取：

`有效出手人 = 有效期内的 clutchDecision.shooterId ?? lateChase.shooterId ?? 默认 gameplan`

脚本照常写 `lateChase`，`paceBoost`、`needThree` 原样生效，只有"选谁"被玩家决策覆盖。进攻托管同样只在读取点让位。

## 4. 五个层次分开设计、分开度量（不混成一个"成功率"）

| 层次 | 机制（全部复用现有代码） | 本里程碑改不改 |
|---|---|---|
| ① 球权交到谁手里 | 复用现有交球闸 `Math.random() < 0.78`（现在只在 `needThree` 时生效）；有效决策下对追平/反超两分同样生效。**不新造常数** | 改：闸门的适用条件 |
| ② 选中的人是否真出手 | 现有分球逻辑：持球者是选中射手时不走"战术分球"（与 `needThree` 分支一致）。豁免只关这一条，其余现有分球路径照旧（例如身边有弹跳型内线、持球者又是好传球手时），所以选中的人仍可能把球分出去 → `reason: "kicked_out"`（被包夹时为 `"doubled"`）。**现状提示**：包夹目前只改分球倾向、不会强制分球，本里程碑不新增"包夹必分"规则 | 改：把选中射手纳入现有豁免 |
| ③ 三分还是进攻篮筐 | `actionHint: "three"` → 现有焦点战术 `pace_three`；`"attack"` → 不加焦点，交给现有 `chooseShot` 按球员倾向选区 | 改：只是选焦点 |
| ④ 进不进 | `calcMakeProb` **完全不动**，防守、犯规、失误、篮板照常结算 | 不改 |
| ⑤ 比赛胜负 | 整场模拟结果 | 不改 |

## 5. 测量：固定种子的前后对照

- **样本**：每组 N=1500 个种子（沿用探针规模），同一批种子跑三组：A 基线（无决策）、B 脚本默认选人、C 玩家选人。
- **报告五个数**：①交球率 ②选中者出手率 ③其中三分占比 ④选中者命中率 ⑤胜率；另报失误率。
- **验收**：选中者出手份额 ≥35%（ADR-002 的实验起点，不得 <20%，不得接近 100%）；④命中率与 A 组**同一球员同一区域**相比无显著差异（证明没有偷偷加命中）。
- **变异验证**：撤掉"读取点优先级"后，C 组应退回到接近 A 组，测试必须变红。

## 6. 普通模式零回归

- **金标哈希（M2b-0 的验收）**：改动**之前**，用 `seededStream(seed)` 替换 `Math.random`，用固定 JSON 队伍夹具（教练和助教**在夹具里写死**，不经过 `coaches.js` 选人，所以播种范围不含建队和选助教），跑 20 个种子整场，记录事件日志哈希；改动后用 `rng: seededStream(seed)` 复跑，**20/20 逐个相同**。
- **M2b-1 也复跑这 20 个哈希**：没有 `clutch` 开关的比赛必须仍然逐个相同。
- 全量单测、lint 照常。

## 7. 最小范围与回滚

- **M2b-0**：`rng.js` + 机械替换 + 金标哈希 + 漏网测试。无玩法变化，可单独 `git revert`。
- **M2b-1**：`submitDecision` + 读取点优先级 + 第 4 节三处闸门 + `ClutchController` + `initializeScenario` + 1 个场景与结果页（ROADMAP §5 已列）。全部在显式 `clutch` 开关之后。
- 不改存档结构（单局玩法），回滚无迁移。达不到 35% 时**不许加命中率**，回到 ADR-002 重新拍板。

## 8. 待你拍板
1. **Q1** RNG 用模块级作用域替换（不逐函数传参），接受第 1 节的并发代价？Luna：接受。
2. **Q2** M2b-0 单独先做、先证明 20/20 零回归？Luna：拆。
3. **Q3** 修订 ROADMAP §5：把"RNG 不可注入、只测分布"改为"可注入 + 金标哈希"？Luna：同意。
4. **Q4** 第 4 节①：有效决策下把 0.78 交球闸扩展到"追平/反超两分"，而不只在需要三分时？（推荐：是，否则平局最后一攻玩家选择无效。）

## 9. 进度
- **M2b-0 ✅**：`js/core/rng.js`；`sim.js`/`skills.js`/`chemistry.js`/`intangibles.js` 的全部 `Math.random()` 改走 `rand()`；`GameSim({ rng })`；`SEEDED_ENTRY_POINTS` 清单 + 包装。金标：`scripts/sim/golden-hash.mjs` 在**改动前**录入 `tests/fixtures/simGolden.json`，改动后全局替换与 `rng` 注入两种方式都 20/20 逐个相同。
- **实现中发现并修掉的两处**：① `skills.js` 的 `trySignatureOffense/Block` 里 `shuffle(sigs)` 默认用 `Math.random`，在 tick 链里，改为 `shuffle(sigs, rand)`；② `rand()` 必须每次动态读 `Math.random`（不能在模块加载时捕获引用），否则现有那些靠替换 `Math.random` 播种的测试会静默失效。
- **M2b-1 ✅（仅引擎契约，不含 UI）**：`GameSim.issueAttemptId()` / `submitDecision()`（拒绝原因 `invalid|stale_attempt|game_over|not_on_court`）；读取点优先级在 `resolvePossession` 包装 + 核心里（玩家决策 > 脚本 > 默认，脚本照常重写 `lateChase`）；0.78 交球闸、分球豁免、`pace_three` 焦点三处闸门复用现有常数，**没有新常数、没改 `calcMakeProb`**；结构化结果 `{attemptId, shooterId, actionHint, handedOff, attempted, zone, made, points, honored, reason}` 写入 `sim.clutchLog`，并随 `coach` 事件的 `meta.clutchOutcome` 发出。无决策时代码路径不变：全局模式金标仍与改动前逐字节一致。
  - **口径**（`scripts/research/clutch-m2b1-measure.mjs`，1500 种子，GSW16 vs CLE16，选中者 X = 克莱）：出手份额 = 选中者出手数 / 球队实际出手的回合数（不含失误、被吃掉的回合）；另报参与率（球到过他手上：出手或失误）和兑现率（= 1 − 未出手占比）。`handedOff` = 交球闸或传球让球到了他手上；`points` = 他本回合拿的全部分，含罚球。
  - **结果**（down 3 / 12s，hint three）：A 默认 14.0% → C 决策 91.8%（脚本自己选的人 B：52.4%）；参与率 15.0% → 92.1%；三分出手占比 95.9% → 97.0%；选中者命中率 50.8% → 49.4%；失误率 12.7% → 15.7%；胜率 16.2% → 15.9%。未出手原因共 343/1500：turnover 231、not_handed_off 82、kicked_out 27、foul 3（兑现率约 77%）。（down 2 / 30s，hint attack）：26.2% → 89.8%；命中率 51.6% → 50.5%；失误 12.3% → 15.7%；胜率 37.1% → 38.7%。
  - **读法**：≥35% 的验收目标大幅达成（≈90%）；命中率无增益、失误率上升、胜率不被强制提高，符合"不偷加命中、保留真实风险"。**份额偏高来自现有 0.78 交球闸 + 分球豁免本身**（不是新加的）；若产品想让玩家决策更"不稳"，要调的是这两处既有常数，需另行拍板。
  - **实现中发现**：对不擅长三分的选中者，`three` 决策下他的出手里三分只占约 52%（既有 `chooseShot` 对三分差的人有硬门），不是 100%。测试断言的是"同一个人 three 比 attack 更多三分"，不是绝对值。
  - **变异验证（5 种全部被抓）**：核心忽略 pick；包装不装载 pick；结果丢 `reason`；放行过期 attemptId；`three` 当 `attack`。过程中还发现一个半失效变体（核心忽略 pick，但 `kickToTeammate` 仍读它，份额约 30%），所以回归门槛定在 60%，而不是 35% 的产品目标。
- **没做**：`ClutchController`、`initializeScenario`、结果页（属 M2b-2，按批示不自动开始）；`coaches.js` 的 2 处随机与商店 `shuffle` 默认随机。
- **RNG 隔离技术债（已登记）**：M2b-0 的 `rand()` 是模块级作用域。已用测试钉住：同步嵌套（A 的回调里推进种子不同或未播种的 B，A 结果不变）、异常恢复（`onEvent` 抛错后 `Math.random` 复位）。**未解决**：异步交错（`withRng` 之间有 `await`）和服务端并行多场。引擎本身无 `await`，唯一定时器 `_loop` 每次 tick 都经 `step` 重新进入作用域，所以浏览器单局安全。离线托管与联机多场上线前必须改成"每场 `GameSim` 持有自己的 RNG、所有随机消费显式传入"，在此之前不要上线任何并行模拟。

## 10. M2b-1 验收复核（R160，2026-11-06，只读复核，未改 GameSim）

**结论：引擎阶段【暂不标 ready】——条件就绪。** 需要 1 项产品裁决 + 1 项约 3 行的契约修正，其余通过。

### 实测（配对固定种子，GSW16 vs CLE16，落后 3 分 / 12 秒，选中者 = 克莱，N=6000；探针 `/tmp/probe_accept.mjs` 未入库，数字可由 `clutch-m2b1-measure.mjs` 复现趋势）
| 组 | 选中者出手份额 | 三分出手占比 | 三分命中率（同人同区域） | 两分命中率 | 全队失误率 |
|---|---|---|---|---|---|
| A 无决策 | 13.8%（733/5309） | 98.2% | 51.5±3.7（n=720） | n=13，无法比较 | 11.5% |
| C `three` | **91.2%**（4658/5110） | 96.6% | **50.8±1.5**（n=4500） | 52.5±7.8（n=158） | 14.8% |
| C `attack` | **89.4%**（4572/5113） | **79.3%** | 52.2±1.6（n=3624） | 49.1±3.2（n=948） | 14.7% |

### 逐项
1. **实现与契约**：校验顺序 invalid → stale_attempt → game_over → not_on_court；读取点优先级在 `_resolvePossession`（玩家 > 脚本 > 默认）；`calcMakeProb`、防守、疲劳公式在 diff 里**零改动**。✅
2. **消耗与失效**：一个决策只被你的一个进攻回合消耗；对手先持球时保持待命（探针确认）；回合被战术犯规吃掉时保持待命；节末（含第 2 节，探针确认）与终场以 `no_possession` 关闭；重复使用已用编号、被新编号取代的编号都返回 `stale_attempt`。✅
   - ❌ **缺口**：已有待消耗决策时再提交（用新编号）会被**接受并静默覆盖**，被覆盖那条的结果**永远不会写进 `clutchLog`**（探针：第二次 `accepted:true`，`clutchLog.length === 0`）。
3. **份额**：13.8% → 91.2%。ADR-002 的下限（≥35%、不 <20%）✅；**上限条款"不应高到接近 100%（等于变相必进选中的人）"未得到明确满足**——89–91% 难说"不接近 100%"。成因是机制本身：0.78 交球闸 + 闸门失败后现有的 `forced` 分球加权（选中者 ×4.5），解析上限就在 ~90%。这是 ADR-002 内部的张力（要求复用 0.78，又要求别接近 100%），**不是实现 bug，需要产品裁决**。我上一次汇报只对照了"≥35%"，漏核了上限，这里更正。
4. **三分占比 / 无命中加成**：`three` 与 `attack` 对同一人的三分占比差 17.3 个点（96.6% vs 79.3%），三分提示改变了真实投篮结构 ✅；A 与 C 的同人同区域三分命中率 51.5±3.7 vs 50.8±1.5，无加成 ✅。**局限**：克莱在"需要三分"的场景里默认就 98% 出三分，所以 `three` 相对 A 的三分占比"不升反降 1.6"并不说明什么，能说明问题的是 `attack` 对照；两分命中率在 A 组样本太少（n=13），无法做同区域对比。
5. **失误/犯规/防守/疲劳**：全队失误率 11.5% → 14.8%（+3.3，来自更多传球环节，不是新规则）；犯规导致没出手 3/1500，很少；防守与命中公式未改。疲劳：选中者疲劳 100 时全队失误 14.7% → 17.7%，说明疲劳公式生效、**没有被决策豁免**；但三分命中率不随疲劳变化（50.9 vs 50.8），**同样的现象在没有决策的脚本路径里也出现**（库里 49.4 vs 49.6，全队失误 11.5% → 12.8%），所以是**引擎原有行为，不是 M2b-1 引入**。但"疲劳 100 的三分命中不下降"看起来不对（`calcMakeProb` 里有 `base *= fatiguePerfMult`），**登记为引擎层待查项，不挡 M2b。**
6. **金标**：`tests/clutchDecision.test.js` + `tests/simRng.test.js` 18/18 通过；`golden-hash.mjs global` 与改动前基线 `cmp` 一致；夹具 20 个种子 20 个不同哈希。✅
7. **RNG 上下文**：嵌套（A 的回调里推进 B）、异常恢复通过 ✅；**异步交错未测**（已登记为技术债，不在 M2b-1 范围）。
8. **结构化结果**：字段齐全（attemptId/shooterId/actionHint/handedOff/attempted/zone/made/points/honored/reason）；`clutchLog` 与 `coach` 事件 `meta.clutchOutcome` 都发（`_quiet` 为真时只进 `clutchLog`）。⚠ **没有任何测试断言事件 meta**——ClutchController 依赖的接口还没被测试钉住。

### 与 ADR 的偏离（需要记录，不是缺陷）
- 设计 §4③ 写"`three` → `pace_three` 焦点"。实现里 `three` 走的是 `needThree` 路径（经 `lateChaseNeedThree` 影响选区），**没有设置 `pace_three` 焦点**；只有 `attack` 会清掉已有的 `pace_three` 焦点。效果上满足 ADR-002 "选三分必须影响真实三分策略"（见第 4 项）。

### 通过 M2b-1 → 可标 ready 的最小清单
1. **产品裁决（二选一）**：(a) 接受 ~90% 的份额，把 ADR-002 上限条款改成"选中者份额 ≥35%、**命中率与基线无差异**、未出手原因可见且 ≥5%"（现测未出手 ~9%）；(b) 为决策路径单独增加交球概率常数（违背"不新造常数"，需重新测量）。我的倾向是 (a)：风险体现在命中率和 9% 的失败原因，而不是份额。
2. **契约修正**：`submitDecision` 在已有待消耗决策时返回 `{ accepted:false, reason:"already_armed" }`（先提交的生效，UI 禁用二次提交）——约 3 行 + 1 条测试。若更想要"后者覆盖"，则必须把被覆盖的决策以 `reason:"superseded"` 写进 `clutchLog`。
3. **补测试**：断言 `coach` 事件 `meta.clutchOutcome` 与 `clutchLog` 同一对象内容。


## 11. 产品负责人裁决后的修正（R161，2026-11-06）

**裁决**：份额选 (b) 校准、初始实验区间 45–70%（不是永久规则）；重复提交用 `already_armed`；补事件契约测试；修正后重新验收。

### 已完成（只改决策路径，普通比赛不变）
- `submitDecision`：已有待消耗决策时返回 `{accepted:false, reason:"already_armed"}`，不改状态、不掷骰子；优先级 invalid → stale_attempt → game_over → **already_armed** → not_on_court（过期请求报 stale，不会被误报为重复）。
- 结构化结果新增 `actualShooterId`（这一回合真正出手的人，没人出手为 null）和 `teamPoints`（真实比分变化）。
- 新增 `CLUTCH_DECISION_TUNING = { handoff, kickWeight }`，**只在决策路径读取**；终场脚本仍用自己的 0.78 / ×4.5 / ×1.8。默认值保持 0.78 / 4.5（=修正前行为），原因见下。
- 测试：新增 4 条（already_armed 不掷骰、优先级、meta 与 `clutchLog` 一致且与真实回合一致、无决策无结果事件）；变异验证：删掉守卫 → 2 条变红。`clutchDecision` + `simRng` 22/22；全局金标与基线一致。

### 校准没有完成：发现需要新设计决定的问题
配对种子扫描（N=2000）：
- **只调分球权重几乎无效**：交球 0.78 下，权重 4.5 → 0.5，克莱份额 91.2% → 86.7%。
- **只调交球概率也压不进区间、且方向依球员而反**：克莱 0.78 → 0 时 91.2% → 68.5%（剩余来自 `offenseFocusId` 把他设为焦点/持球人）；而公牛 1996 选**库科奇**（接球型角色球员）时，决策下的份额只有 **6.6–10%，低于不做决策的 24%**，交球概率越低反而越高。
- 根因（`scripts/research/clutch-role-player-probe.mjs`，600 种子，交球 0.78）：库科奇实际出手 11/600，拿到球又传走 362，失误 124，没拿到球 76，犯规 27。决策把他变成**主持球人**，而现有"攻击欲低、机会不好先传一次"的规则（`aggNow <= 0.4 && open < openNeed`）把球传走；他平时的出手来自**作为分球目标接球投**。
- **这也是 R160 验收的漏洞**：只测了克莱一个射手型样本，现有回归测试选到的也是能自己出手的球员。**修正前（0.78）就有此缺陷。**

### 需要的设计决定（三选一或组合）
1. **按角色交球**：持球型射手 → 交到手里（现状）；接球型球员 → 不设他为持球人，改为提高他作为分球目标的权重（跑战术让他接球）。最贴近篮球，改动中等。
2. **决策路径豁免"欲望低再传一次"**：选中者拿球后不再因欲望低而传走（与现有 `needThree` 豁免战术分球同类）。改动最小，但角色球员会被迫投更多受干扰的球，"防守干扰"体现在命中率上。
3. 先接受"选角色球员没效果"，在 UI 上提示（不推荐：玩家会觉得选择无效）。

在这个决定之前，调 `handoff` 没有意义：同一个数字对克莱是降份额，对库科奇是升份额。**M2b-1 引擎阶段仍不标 ready。**

## 12. 校准完成与验收（R164，2026-11-06）— M2b-1 引擎阶段 READY

**修复（只在决策路径，普通比赛与终场脚本不变）**
- `CLUTCH_DECISION_TUNING = { handoff: 0, kickWeight: 4.5, keepBall: true }`：去掉额外交球闸门；被选中者拿球后**不再触发**"欲望低先传一次"；仍是 ×4.5 的高权重接球目标。没有新增概率系统。
- 命中率、防守、疲劳公式零改动；无决策金标与基线一致（`GOLDEN GLOBAL SAME`）。

**实测**（配对固定种子 N=2000，落后 3 分、剩 12 秒；`scripts/research/clutch-calibration-sweep.mjs`）

| 指标 | Klay（射手） | Kukoc（角色球员） | Kerr（接球射手） |
|---|---|---|---|
| 占实际出手的份额 | 69.8%（无决策 17.7%） | 53.3%（29.8%） | 55.7%（44.3%） |
| 指定者出手 / 全部已消费决策 | 58.5% | 43.9% | 45.6% |
| 他人出手 / 全部决策 | 25.3% | 38.5% | 36.3% |
| 失误 | 13.7% | 17.7% | 18.1% |
| 无出手（其他原因） | 2.5% | 0% | 0% |

三类球员都落在 45–70% 实验区间内。对照：修正前同一场景 Klay 92.3%，Kukoc 2.3%，Kerr 1.5%（选角色球员反而更少投）。只调 handoff 压不进区间；加上 keepBall 后 handoff=0.5/0.3/0 依次为 Klay 84.0/76.8/67.7%，所以取 0。

**验收**：`clutchDecision`+`simRng` 23/23；新增校准回归测试（3 类球员各 300 种子，份额须在 40–75%）；变异验证：改回旧参数 → Klay 91.6% 测试变红。`already_armed`（顺序：invalid → stale → game_over → already_armed → not_on_court）、`clutchOutcome` 契约测试沿用 R161。

**剩余风险**
1. Klay 69.8% 贴近 70% 上限，区间是实验值而非定论；换球队/防守强度/剩余时间后需再测。
2. 只测了 3 名球员 × 1 个比分场景；`three` 与 `attack` 对"谁出手"的影响相同，只影响出手类型。
3. Kerr 本来就爱投，决策只提升约 11 个百分点；"选已是主力射手"的增益偏小，属预期。
4. 疲劳 100 时三分命中率不降（既有引擎问题，无决策路径同样），独立登记，不阻塞。
5. 本轮没有做 `replaceDecision()`，留给 M2b-2。
