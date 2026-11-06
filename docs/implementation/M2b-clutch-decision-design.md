# M2b 实现设计（一页）：可注入随机数 + 玩家决策契约

- **状态**：PROPOSED，等你审阅。**在你批准前不改 `GameSim` 一行。**
- **依据**：ADR-002（玩家决策 vs 终场脚本，已批准附条件）、ADR-003（M2a/M2b 拆分）、`ROADMAP.md` §5（M2b 范围）、`BASELINE_AUDIT.md` §2.3/§2.6。本文不重写这些，只补它们留白的实现契约。
- **不属于本文**：战术槽完全拆分（另起 ADR，不是 M2b 前置；B34 最小修复已解决直接问题）、Reborn 球员线（ADR-005 的 PR4 依赖本文）、2D 接管（M3）。

## 1. 要解决的三件事
1. **玩家选的出手人不兑现**（G1 实测：选与不选份额都约 5%）。
2. **测不出"改动是否真的有效"**：`sim.js` 有 47 处 `Math.random`，只能测分布，无法做固定种子前后对照。
3. **玩家决策与自动脚本没有优先级**：终场脚本把 `offenseFocusId` 改写成"全队最佳射手"（`sim.js` 约 `lateChase` 分支），自动托管也可能覆盖。

## 2. 可注入 RNG（M2b-0，先于一切玩法改动，单独一个 PR）

**事实**：`sim.js` 47 处，但 `skills.js` 51 处、`chemistry.js` 1 处、`intangibles.js` 2 处（技能触发在引擎调用链里）。**只改 `sim.js` 不够**：播种后仍不确定。

**方案**：新增 `js/core/rng.js`，导出 `rand()`（默认转发 `Math.random`）和 `withRng(source, fn)`（`try/finally` 作用域内临时替换，结束后必还原）。`GameSim` 构造器新增可选 `rng`，每个公开入口（`tick`、`run` 等）在 `withRng` 里执行。上述四个文件的 `Math.random()` 机械替换为 `rand()`。

- **为什么不逐函数传参**：`skills.js` 几十个纯函数签名里没有 sim，传参要改上百处调用，风险远大于收益。
- **代价（需你知道）**：模块级可替换源不是并发安全的。浏览器里同一时刻只跑一场，测试在同一进程内顺序执行，所以可接受；联机服务端若将来在同进程并行多场，要改成显式传参。
- **默认行为字节级不变**：未传 `rng` 时 `rand === Math.random`，调用顺序不变。

**金标回归（M2b-0 的验收）**：在**改动之前**，用 `Math.random` 打补丁换成 `seededStream(seed)`，对 20 个种子各跑一整场并记录事件日志哈希；改动后用 `rng: seededStream(seed)` 复跑，**哈希必须逐个相同**。这样"普通模式零回归"是可证明的，不靠大样本分布。

## 3. 玩家决策契约（M2b-1）

```js
// 输入：只有显式 clutch 场景才会有
decision = { attemptId, kind: "clutch_shooter", shooterId, actionHint?: "auto"|"drive_kick"|... }
// 输出：引擎事件里带的结构化结果，不是 UI 编的
outcome  = { attemptId, honored: boolean, reason?: "doubled"|"turnover"|"kicked_out"|"foul"|"not_on_court",
             actualShooterId, shot?: { zone, made }, points }
```

流程：校验（球员在场、attempt 未过期）→ 写入引擎已有的 `chase.shooterId` 通道（ADR-002，不新建投篮模型）→ `resolvePossession` 正常结算 → 事件携带 `outcome` → UI 只展示事件里的因素。

**优先级（高→低）**：显式玩家决策 > 终场脚本选人（`lateChase`）> 进攻托管（`autoOffense`）> 默认选人。玩家决策有有效期：到该 `attemptId` 结束或本回合结算为止，**自动脚本不得在有效期内静默改写**。`paceBoost` 等非选人行为不受影响。

**不做**：任何命中率加成或"必进"。命中仍完全由 `calcMakeProb` 决定（Master Spec §5.3 硬性要求）。**所有行为在显式 `clutch` 开关之后生效**，非 clutch 路径不变。

## 4. 验收（沿用 ROADMAP §5，补可复现的做法）
| 项 | 做法 |
|---|---|
| 选中出手人份额 | 固定种子 N=1500，对比 基线 / 脚本默认 / 玩家选人 三组；目标 ≥35%（实验性起点，ADR-002），不得接近 100% |
| 副作用指标 | 同一批种子下同时报告三分出手率、失误率、胜率 |
| 普通模式零回归 | §2 金标哈希 20/20 相同 + 全量测试 |
| 优先级 | 单测：脚本与托管同时存在时玩家决策胜出；有效期结束后脚本恢复 |
| 变异验证 | 撤销"玩家决策覆盖脚本"后，对比测试必须变红 |
| 结构化结果 | `outcome.honored=false` 时 `reason` 必须来自真实事件，不能为空 |

## 5. 拆分与回滚
- **M2b-0**：`js/core/rng.js` + 机械替换 + 金标哈希。无玩法变化，可单独回滚。
- **M2b-1**：决策契约 + `ClutchController` + `initializeScenario` + 结果页（ROADMAP §5 已列）。
- 不改存档结构（单局即时玩法），回滚不涉及迁移。

## 6. 需要你拍板
1. **Q1** RNG 用"模块级作用域替换"而非逐函数传参，接受上面写的并发代价吗？（推荐接受。）
2. **Q2** 把 RNG 注入拆成独立的 M2b-0（先做、先证明零回归），而不是和玩法改动同一个 PR？（推荐拆。）
3. **Q3** `ROADMAP.md` §5 原先把"RNG 不可注入、只测分布"写成设计决定；本文推翻这一条，改为"可注入 + 金标哈希"。同意修订吗？
