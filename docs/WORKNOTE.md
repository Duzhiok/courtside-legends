

## R156 · Code：M2b-0 可注入 RNG 落地（2026-11-06）
- **范围**：纯机制，无玩法变化。新增 `js/core/rng.js`（`rand`/`withRng`）；4 个文件共 103 处 `Math.random()` 机械替换（sim.js 因已有局部 `rand(a,b)`，用别名 `rnd`）；`GameSim` 构造器拆成 `constructor`（取 `rng`、包 `withRng`）+ `_init`；`SEEDED_ENTRY_POINTS` 14 个入口统一包装。
- **验收**：金标 20 个种子在改动前录入；改动后「全局替换 Math.random」与「`GameSim({ rng })`」两种方式均 20/20 与金标一致；注入模式下把 `Math.random` 换成抛错函数，整套场景不触发。全量 `npm test` 1699/1699，lint 0 错误，`git diff --check` 干净。
- **变异**：把 `step` 从清单去掉 → 防漏网测试变红（fail 2）。去掉 `callTimeout`/`runManagedBreak`/`setAutoDefense`/`nextQuarter` 仍绿——这些入口要么只经由已包装的父方法进入，要么那条路径是条件掷骰、场景没触发；因此另加了结构性断言（每个入口必须带 `seededEntry` 标记）。**诚实限制**：防漏网测试只证明「场景走到的路径」没漏，没走到的条件分支靠清单 + 标记兜底。
- **没做**：M2b-1；`coaches.js` 的 2 处与商店 `shuffle` 默认随机；联机服务端并行多场的显式传参（设计 §1 已写明代价）。
- **顺手**：BACKLOG 的 Reborn 身份行 B37 与 M1 首屏行撞号，Reborn 行改为 B41（Luna review 备注）。

## R155 · Code：ADR-006 批准落库 + M2b 设计提交（2026-11-05）
- ADR-006 ✅ APPROVED：Q1/Q4 批准；Q2 附条件；Q3 原则批准。写入 ADR §0 与 DECISIONS。内部步骤 R1–R7 映射 M5–M7，不新建里程碑。
- 新增 `docs/implementation/M2b-clutch-decision-design.md`（PROPOSED，一页）：可注入 RNG + 决策契约。发现 `skills.js` 51 处 `Math.random` 在引擎调用链里，只改 `sim.js` 不够；建议 `js/core/rng.js` 作用域替换 + 改动前后金标哈希；拟修订 ROADMAP §5 "RNG 不可注入"。批准前不改 GameSim。
- `BASELINE_AUDIT.md` 新增 §0b：来源提交 `b64e660`，标注已解决/已变更/仍成立的条目。
- 同日早些时候已完成并推送：设置页标题与开始按钮随经营长度（`a2da47c`）、开局引导页取消按钮（`a2da47c`）、权限审计（`b64e660`）。
