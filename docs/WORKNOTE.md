

## R158 · Code：M2b-1 绝杀决策契约（引擎部分）（2026-11-06）
- **范围**：`sim.js` 新增 `issueAttemptId`/`submitDecision`/`_settleClutch`；`resolvePossession` 拆成包装 + `_resolvePossession` 核心；读取点优先级（玩家决策 > 脚本 > 默认），复用 0.78 交球闸/分球豁免/`pace_three` 焦点，无新常数、不碰 `calcMakeProb`。结构化结果见设计文档 §9。**不含** ClutchController / 场景 / UI（M2b-2）。
- **验收**：1500 种子三组配对（`scripts/research/clutch-m2b1-measure.mjs`）：选中者出手份额 14%→92%（目标 ≥35%），命中率 50.8%→49.4%（无增益），失误率 12.7%→15.7%，胜率不强制。全局模式金标与改动前逐字节一致；全量 1710/1710（本机含 `ws`）、lint 0 错误、`git diff --check` 干净。
- **测试**：`tests/clutchDecision.test.js`（9 条）+ `simRng.test.js` 新增 2 条（嵌套/交错、异常恢复）。5 种变异全抓；其中一个半失效变体证明 35% 门槛太松，回归门槛改 60%。
- **诚实限制**：份额约 90% 主要来自既有 0.78 闸门；样本只有 GSW16/CLE16 两个场景；`three` 对非射手不强迫拔三（既有硬门）。
- **技术债**：每场比赛独立 RNG（离线托管/联机多场前必须还），见设计 §9。

## R157 · Code：两件大事的分析与记录——ADR-007 传奇宇宙 / ADR-008 四空间导航（2026-11-06）
- **输入**：产品负责人两条想法（原话要点存 `DECISIONS.md` §六）+ 一份外部 AI 润色稿 + 三张概念图。纯规划，零代码。
- **核实的事实**：①真实数据只到 2025（`HISTORICAL_YEAR_END`）；②2025 年后选秀**已经在用虚构球员补位**（`leagueDraft.js` `generatedProspect`，12 名 × 12 姓）；③2000–2025 每季平均 76.3 名新人，2026–2049 需要约 1,440–1,800 人；④`roster.json` 有 4,393 个真实人物，可作重生池；⑤教练 70 岁强制退休，1996 年入行的教练 2031 年就退休了；⑥`legacy.js` 已有生涯分档；⑦有两套"我的阵容"：本地账号卡 vs 联机服务端账号（`online.html`）；⑧生涯里的房子（`coach.housing`）和"我的世界"的家是两样东西。
- **对外部稿的主要修正**：重生必须当主力、两个宇宙都默认开（外部稿写"可选"，那样人不够）；勋章在任何生涯结束时都发；勋章档次复用现有分档，不另造五级；托管"场数宽松（20）、奖励封顶"，不是只给 5 场；四分线关闭时必须过 M2b-0 金标哈希。
- **新文件**：`docs/implementation/ADR-007-legendary-universe.md`、`ADR-008-navigation-four-spaces.md`（都是 PROPOSED，各 6 个待拍板问题）。DECISIONS 加两条 ADR 摘要和 §六原话；ROADMAP §9 加 7 行映射（不新建里程碑）；BACKLOG 加 B42–B48。
- **没做**：任何实现；授权核查（ADR-007 Q6）；托管经济测量。

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
