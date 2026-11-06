# M2b 实现设计（一页）：可注入随机数 + 绝杀决策契约

- **状态**：✅ APPROVED v2（产品负责人 2026-11-06 批准，Q1–Q4 按推荐值）。M2b-0 已落地（见 §9）；M2b-1 待做。
- **依据**：ADR-002（决策 vs 终场脚本，附条件批准）、ADR-003、`ROADMAP.md` §5、`BASELINE_AUDIT.md` §2.3 / §2.6 / §0b。本文只补实现契约，不重写它们。
- **不在范围**：战术槽完全拆分（另起 ADR；B34 已做最小修复）、Reborn（ADR-005 PR4 复用本文）、2D 接管（M3）、命中率任何加成。

## 1. 可注入 RNG，默认行为不变（M2b-0，独立 PR）

**事实**：比赛 tick 链上的随机调用 = `sim.js` 47 + `skills.js` 51 + `chemistry.js` 1 + `intangibles.js` 2。`coaches.js` 的 2 处只在开局前选助教，不在 tick 链。

**方案**：新增 `js/core/rng.js`：`rand()`（默认转发 `Math.random`）、`withRng(source, fn)`（`try/finally`，必还原）。上述 4 个文件的 `Math.random()` 机械替换为 `rand()`。`GameSim` 构造器加可选 `rng`；以下**会掷骰的入口**在 `withRng(this.rng)` 内执行：`constructor`、`start`、`step`（含 `_loop` 触发）、`nextQuarter`、`runFast`、`callTimeout`、`shout`、`talk`、`substitute`、`runManagedBreak`、以及新加的 `submitDecision`。清单写成一个常量数组，并有一条测试兜底：播种运行期间把 `Math.random` 换成直接抛错的函数，**任何漏网的入口都会让测试变红**——这样"等"不靠人记。

- 未传 `rng` 时 `rand === Math.random`、调用顺序不变 → **默认行为字节级不变**。
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
- **没做**：M2b-1（`submitDecision`、读取点优先级、三处闸门、ClutchController）；`coaches.js` 的 2 处随机（开局前选教练/助教，不在 tick 链）和 `shuffle` 在商店里的默认随机，均未动。
