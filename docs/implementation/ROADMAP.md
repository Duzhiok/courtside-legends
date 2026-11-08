# Courtside Legends 2.0 — Roadmap（开发执行基线）

> **文件地位**：本文是 2.0 开发的**唯一执行计划**。Master Spec（`docs/Courtside_Legends_2.0_Master_Spec.md`）是产品需求基线，不因实现难度而删减；`BASELINE_AUDIT.md` 是事实底稿，本文每个里程碑的证据都引用它的章节号，不重复贴代码行号；`DECISIONS.md` 记录支撑本文的架构决策。三者冲突时："代码事实（BASELINE_AUDIT）> 本文 > spec"，冲突写进 `DECISIONS.md`。
>
> **多 agent 规则**：里程碑一次只开一个；开工/提交前先 `git fetch` + 看 `git status`；开工前在 `docs/AGENT_CHAT.md` 认领；完成后更新本文"状态"列 + `docs/WORKNOTE.md` 记 R 编号 + `docs/TASKS.md` 打卡。不要并行推进两个里程碑，不要在未开门的里程碑里"顺手做"范围外的事（见各节"范围外"）。
>
> 本文整合自 `docs/implementation/2.0-plan.md`（原 M0 产出，内容保留在那份文件作为设计论证的详细记录，不删除），并按用户要求的 P0A/P0B/P0C/P0D/P1/P2+ 命名与 Scope/Dependencies/Tasks/Acceptance/Tests/Rollback/DoD 七要素重新组织。**M 编号是跨文档的 canonical id**（`WORKNOTE.md`/`TASKS.md`/`AGENT_CHAT.md` 已经在用），P0x 是本文新增的 spec 对齐别名，两套编号并存，不要再发明第三套。


> **2026-11-04 基线冻结**：Master Spec = v1.0 产品基线；DECISIONS.md 中 ADR-001/003 已批准，ADR-002（附修改条件）与 ADR-004（原则）已批准。执行顺序 M1 → M2a → M2b → M3 → M4 → Reborn；一次只做一个大里程碑。新功能一律进 `docs/BACKLOG.md`，不插队。
> **门控**：M2b 需先有实现契约 + 模拟测试定义；M4 需先批准存档迁移设计（v3 存档不得被拒读）。
> **2026-11-06 审批**：ADR-007 ✅（修改后）、ADR-008 ✅（原则）。**例外**：N-1 导航骨架（Navigation-Only，见 `ADR-008` §9）可先于 M2b-1 做；这是一次明确批准的插入，不改变 M2b 的顺序，**M2b-1 仍是下一个核心玩法里程碑**。不实现：未来选秀生成器、四分线、托管联赛。
> **D7**：M5–M7 Reborn 必须规划三种身份（历史穿越 / 原创穿越 / 随机命运），MVP 可先原创，历史穿越不得删除。

## 1. 一句话结论（继承自 2.0-plan.md，未改变）

方向成立，第一段可做，全量不现实。spec 的三条主线（快速开打 / 穿越 / 我的传奇）和"引擎唯一权威、选择≠必然结果、不破坏旧存档"这些原则，跟现有架构和开发习惯对得上。第一个可玩切片（P0A → P0B → P0C → P0D）单人专注约 4–6 周可行，但 P0C（绝杀挑战）比 spec 估的难——见 §3.2，`BASELINE_AUDIT.md` G1。2.0 全貌单人是半年以上的量，WNBA 和社交近期不可行，只保留为研究项。

## 2. 命名对齐表

| 用户命名 | canonical id | 对应 spec 章节 | 状态 |
|---|---|---|---|
| P0A 首页重设计与模式重组 | M1 | §14 P0A | ✅ 已完成（2026-11-03，见 WORKNOTE R137） |
| P0B 一键开打 + 新手引导 | M2a（新拆分，见 DECISIONS ADR-003） | §14 P0B（去掉绝杀部分） | ✅ 已完成（WORKNOTE R144，待 Luna review） |
| P0C 绝杀挑战 + GameSim 接入 | M2b（新拆分，见 DECISIONS ADR-003） | §14 P0B（绝杀部分） | ✅ 已完成（2026-11-07，e6f427a；待 Code review + Mac 浏览器 QA） |
| P0D 2D 球场可视化 + 战术接管 | M3 | §14 P0C | ✅ 已完成（2026-11-07，3218842；待 Code review + Mac 浏览器 QA + 手机 FPS 实测；**闸门：用户试玩 M1–M3 并批准后才能进 P1**） |
| P1 My Legacy（身份/捏脸/家乡/成长） | M4 | §14 P1，§7 | 🏗️ 门后 |
| P1 Unified Reborn（球员/教练/GM 职业） | M5–M7 | §9 | 🏗️ 门后 |
| P2+（WNBA/历史分支/收藏/社交/音乐/市场） | M8 + 研究项 | §8, §12, §16.17 | 🏗️ 门后 / 🔴 部分不排期 |

**为什么把 spec 的 P0B 拆成 M2a/M2b**：spec §14 把"一键开打"和"1 个绝杀场景"算同一个 3–10 天的里程碑，但 `BASELINE_AUDIT.md` 的 G1 实测证明"一键开打"是纯 UI 路由改动（低风险、1-2 天），"绝杀挑战"需要改 `resolvePossession`（高风险、7-12 天，影响全局比赛平衡）。把两件风险量级完全不同的事绑在一个验收门里，会让低风险的部分被高风险部分拖住发布。本文按用户这次的措辞（P0B 只提"一键开打和新手引导"，P0C 单独是"绝杀挑战和 GameSim 集成"）正式拆分，决策记录见 `DECISIONS.md` ADR-003（默认通过，等待确认）。

## 3. 里程碑一：**P0A 首页重设计与模式重组**（canonical: M1）

### Scope（范围内）

1. ADR-001（见 DECISIONS.md）：`js/data/modeCatalog.js` 作为模式目录的唯一事实来源，补齐 `legend`/`sandbox`/`duel`/`family-duel` 四个遗漏模式；`js/ui/homeTabs.js` 改为从目录派生映射，不再维护第二张不一致的表（现状两者分组不同，`BASELINE_AUDIT.md` §1.2）。
2. Play Now 主 CTA：一键 `autoFillTeam ×2` → 直接进比赛，跳过 setup 确认（setup 仍可从"自由对战"卡片进入）。
3. "快速演示"更名"快速开打"（内部 id 仍为 `quick`，不改存档/逻辑引用）。
4. Continue 面板统一以 root v3（`cls_root_v3`）为准；明确 legacy `peekSave`（`cls_savegame_v1`）在 UI 上的定位（迁移提示 or 隐藏，`BASELINE_AUDIT.md` §4.2）。
5. 首页按 spec §3 分组（挑战与竞技 / 经理生涯 / 自由创造 / 朋友一起玩），全局只保留一个主 CTA；设计 token（色板/间距/圆角）收敛到一处，不在各屏幕各写一套。

### Dependencies（依赖）

- 无引擎/存档依赖；纯 UI + `modeCatalog.js`/`homeTabs.js`/`app.js` 的 `show()` 路由（`BASELINE_AUDIT.md` §1.2）。
- 不依赖任何未完成的其他里程碑；可以立即开工。
- 产出的 ADR-001（目录单一事实来源）、存档版本策略雏形、"catalog 与 homeTabs 对齐"三件事是 P0B/P0C 的前置输入，必须在本里程碑内写清楚，不能留到下一个里程碑才补。

### Implementation Tasks（实现任务，文件级）

- `js/data/modeCatalog.js`：新增 `legend`/`sandbox`/`duel`/`family-duel` 四条目录项（分组待定，参考 `homeTabs.js` 现有归类作为起点）；跑 `validateCatalog()` 确认无重复 id / 非法 `variantOf`。
- `js/ui/homeTabs.js`：删除硬编码的模式映射表，改为 `import { MODE_GROUPS } from "../data/modeCatalog.js"` 后派生；保留现有 `wireHomeTabs()` 的 DOM glue 逻辑不变。
- `index.html`：新增 Play Now 主按钮（放在现有 3 个 tab 之上或首屏显著位置，具体视觉由本里程碑内定稿）。
- `js/app.js`：新增 Play Now 点击处理，复用现有 `autoFillTeam` + `openSetup` 逻辑但跳过确认步骤（即直接调用进入比赛的路径，不展示 setup 屏）；"快速演示"文案改"快速开打"。
- `js/app.js` 的 `refreshSaveHomeBar`（`app.js:948-963`）：确认/调整 Continue 面板读取源为 root v3；如果 legacy `peekSave` 仍需展示（迁移未完成的老用户），加一条迁移提示文案，不要两处面板同时出现造成用户困惑。
- 新建 `docs/implementation/DECISIONS.md` 的 ADR-001 条目（如果本文件尚未创建则本里程碑内创建，见本文档配套的 `DECISIONS.md`）。

### Acceptance Criteria（验收标准）

- 单测：目录里每个模式 id 在 DOM 里都有对应入口（`.mode-card[data-mode]`）；`validateCatalog()` 通过；`homeTabs` 的分组与目录一致（不再有第二套事实来源）。
- 浏览器 QA（桌面 1280 + 手机 390）：从首页点 Play Now 一次即进入比赛画面；所有旧模式卡可点击且进入原屏幕，行为字节级不变；首屏只有一个主 CTA；无横向溢出；无 console/page error。
- 英文模式无中文泄漏（新增文案走 `L()`/`tr()`）。
- 旧存档能读（本里程碑不碰存档结构，只读取展示，风险本身就低，但仍要跑一次旧存档回归）。

### Tests（测试�covered）

- 新增/更新：`tests/modeCatalog.test.js`（目录完整性、`validateCatalog`）、`tests/homeTabs.test.js`（分组与目录一致性，替换原有硬编码断言）。
- 浏览器 QA 新脚本：`scripts/qa/home-play-now.mjs`（Play Now 入口、旧模式卡点击回归、Continue 面板来源、390/1280 双尺寸）。
- 变异验证：故意从目录里删掉一个模式 id 或让 `homeTabs` 分组与目录不一致，确认新测试会报红。

### Rollback Plan（回滚方案）

- 本里程碑不改引擎、不改存档结构、不改 `modeCatalog.js` 以外任何模式的行为逻辑——纯新增/重命名/路由层改动，风险极低。
- 回滚方式：`git revert` 本里程碑的提交即可，无需数据迁移（没有写新字段到存档）。
- 如果 Play Now 路径在生产环境出现问题，可以直接隐藏该按钮（CSS/条件渲染），不影响任何现有模式入口。

### Definition of Done（完成定义）

- 以上 Acceptance Criteria 全部通过；`npm test` 全绿、`npm run lint` 0 错误、`git diff --check` 干净；提交后立即推送；`WORKNOTE.md` 记 R 编号、`TASKS.md` 打卡、`AGENT_CHAT.md` 留言；本文"状态"列更新为 ✅；DECISIONS.md 的 ADR-001 标记为已实施。
- **闸门**：M1 完成后可以继续开 M2a（P0B），但 M2b（P0C，绝杀挑战）和之后所有里程碑需要你试玩 M1-M3 并批准后才能开始（继承自 2.0-plan.md 的"停下来等批准"闸门，见 §8）。

---

## 4. 里程碑二 A：**P0B 一键开打 + 新手引导**（canonical: M2a）

### Scope

1. 承接 M1 的 Play Now 入口，补全"新手引导"部分：游客首次进入时的最小说明（不强制注册账号，`BASELINE_AUDIT.md` §4.2/§8.2 已确认 `quick` 本就不校验账号，§10.11）。
2. 快速开打的结果页/重试流程打磨（当前已有基础结果页，确认文案、按钮可用性）。
3. 不包含绝杀场景本身——那是 M2b 的范围。

### Dependencies

- 依赖 M1 完成（需要 Play Now CTA 存在）。
- 不依赖 M2b；两者可以并行规划，但仍按"一次只开一个里程碑"的规则顺序执行，除非你明确批准并行。

### Implementation Tasks

- `js/app.js`：Play Now 路径的首次引导提示（例如一个轻量 tooltip 或首屏说明条，不做成强制弹窗打断体验）。
- 确认现有结果页（`js/app.js` 的 `showResult`/`wireSeasonResultContinue` 一类逻辑）在快速开打场景下的"重试"按钮直接回到新一局快速开打，不绕回首页。
- i18n：新增文案走 `L()`。

### Acceptance Criteria

- 游客（无账号/新账号）从首页到完成第一局快速开打的决策点 ≤15 秒（spec §14 P0B 的目标，用手动计时验证一次典型路径即可，不需要自动化埋点）。
- 重试流程顺畅：点重试直接进入下一局，不重复经过不必要的确认屏。
- 无横向溢出、无 page error、英文模式无中文泄漏。

### Tests

- 浏览器 QA：`scripts/qa/quick-play-onboarding.mjs`——游客路径计时、重试循环 3 次、390/1280 双尺寸。
- 单测：如有新的纯函数（例如首次引导状态的本地存储读写），补对应测试。

### Rollback Plan

- 低风险：UI 层改动为主，不碰引擎。`git revert` 即可；如新增了本地存储字段（例如"是否已看过引导"），确认缺省值安全（未设置时按"未看过"处理，不报错）。

### Definition of Done

- Acceptance Criteria 全部通过，测试/lint/diff-check 通过，推送，WORKNOTE/TASKS/AGENT_CHAT 更新，本文状态列更新为 ✅。

---

## 5. 里程碑二 B：**P0C 绝杀挑战 + GameSim 接入**（canonical: M2b）—— 本路线图里风险最高的一步

### Scope

1. **ADR-002**（见 DECISIONS.md）：玩家决策 vs 终场脚本的优先级规则。方向：玩家决策写入引擎已有的 `chase.shooterId` 通道（`sim.js:666-668`，终场追分需要三分时 78% 概率直接交给指定射手），并让这条通道在"绝杀场景"下压过终场脚本的默认选人，而不是新建一套投篮模型。
2. 引擎最小改动：让"出手人选择"被实际兑现（当前选中与不选中出手份额都是 ~5%，见 `BASELINE_AUDIT.md` §2.3 和本文件 §0 的复核）；为"突破"分支补最小 `meta`（出手人 id + 区域），当前只有跳投带 `meta.shot`（`BASELINE_AUDIT.md` §3）。
3. `initializeScenario()`（新函数）：构造合法的 Q4 局面（节/时钟/比分/球权/场上 5 人/统计一致）并校验不变量，不能直接篡改 `snapshot()` 伪造数据（`BASELINE_AUDIT.md` §9 已裁决为 `new`，全仓无此函数）。
4. `ClutchController`（新模块）：状态机 `READY → AWAITING_DECISION → RESOLVING → CONTINUING → COMPLETED`（+ `FAILED`/`CANCELLED`）；选择提交后锁定；`attemptId` 代际令牌防止重试/切模式后旧回调乱入（`BASELINE_AUDIT.md` §9 确认全仓无此状态机和令牌机制）。
5. 1 个精选场景，首轮 2 个选项（第二局解锁第 3 个）；风险用定性标签表达（"更可能製造空位"之类），**不显示数值胜率**（spec §5.3 的硬性要求）。
6. 结果页：比分、基于真实事件的因果解释、重试、可选分享（复用 `endingShareCard.js` 的思路，不是照抄该模块，因为那是穿越生涯的结局卡，场景不同）。

### Dependencies

- 依赖 M1（Play Now 入口存在）和 M2a（快速开打路径稳定）完成。
- **真正的阻塞依赖是 ADR-002 必须先拍板**：没有明确的"玩家决策 vs 脚本"优先级规则，`resolvePossession` 的改动没有边界，容易变成"改到哪算哪"。
- 依赖 `BASELINE_AUDIT.md` §2.6 的结论：RNG 当前不可注入（`sim.js` 用全局 `Math.random`）。**2026-11-05 修订提案**：原先"只测分布、不测确定性重放"的决定拟改为"先做可注入 RNG（M2b-0）+ 金标哈希，再做玩法改动（M2b-1）"。完整设计见 `M2b-clutch-decision-design.md`（PROPOSED，待你审阅；批准前不改 `GameSim`）。下面的 Tests/Acceptance 里"由于 RNG 不可注入"的措辞，在该设计获批前仍按原文执行。

### Implementation Tasks

- `js/engine/sim.js`：在玩家显式选择绝杀场景的出手人时，让该选择写入/覆盖 `chase.shooterId` 通道；确认这个改动有一个**显式开关**（例如 `clutchMode: true` 的构造参数或场景标记），非 clutch 场景下 `resolvePossession` 行为完全不变（字节级不变，用全量测试 + 同参数分布对照验证，见下方 Tests）。
- 新建 `js/engine/clutchController.js`（或类似命名）：状态机实现、`attemptId` 生成与校验、取消/重试时的回调失效处理。
- 新建 `js/engine/initializeScenario.js`（或并入 `clutchController.js`，视实现体量决定是否拆文件，保持单文件 <600 行原则）：场景构造 + 不变量校验（时钟非负、比分合法、球权合法、场上 5 人、统计初始一致）。
- `sim.js`：为突破上篮分支补最小 `meta.shot`（或新字段，不复用跳投专属字段名以免混淆），只做绝杀场景需要的最小范围，不是 M3 要做的"系统性补全全部 11 类事件"（那是 P0D 的范围）。
- UI：新结果页组件，展示比分 + 因果解释（从真实 `emit` 事件和 `meta` 中提取，不编造叙事）。

### Acceptance Criteria

- **核心硬指标**：用 `scripts/research/clutch-choice-probe.mjs`（或其绝杀场景专用变体）做修改前后对比——选中出手人的份额从基线 ~5% 提升到 **≥35%**（**实验性起点**，以基线实测为准，同时分别度量三分出手率/失误率/胜率；阈值在 ADR-002 里按实测最终确认；来源：脚本把球交给最佳射手时该射手约占首个跳投的 43%，剩余份额因为被包夹/失误/分球等合理因素保留，符合"选择≠必然结果"）。
- 命中率仍完全由 `calcMakeProb` 决定，**没有任何"必进"或命中率硬加成**（spec §5.3 的硬性要求，直接否决任何"+X% 命中率"的实现捷径）。
- 不变量单测：时钟不为负、不超支；加时判定正确；三分追平不等于获胜；绝杀场景初始化的局面本身合法（场上 5 人、统计一致）。
- 重试 10 次 + 中途切换模式，无残留定时器/悬挂回调（`attemptId` 机制验证）。
- **旧模式回归（最关键的一条）**：非 clutch 场景下，`resolvePossession` 的行为与改动前完全一致——跑全量测试 + 对同样的随机种子/参数做分布对照（由于 RNG 不可注入，用大样本统计分布而非逐帧比对，样本量参考探针脚本的 1500 次/组）。
- 风险标签不出现任何数值百分比（UI 审查项，不是自动化测试能完全覆盖的，人工过一遍文案）。
- 英文模式无中文泄漏；390/1280 双尺寸无横向溢出。

### Tests

- 新增：`tests/clutchController.test.js`（状态机转换、`attemptId` 失效、取消/重试）。
- 新增：`tests/initializeScenario.test.js`（不变量校验：非法输入被拒绝、合法输入通过、边界条件如 clock=0/overtime）。
- 新增：`tests/clutchDecisionAdapter.test.js`（玩家选择写入 `chase.shooterId` 通道的路径，验证非 clutch 场景不受影响）。
- 更新 `scripts/research/clutch-choice-probe.mjs` 或新建专用对照脚本，作为本里程碑的核心验收证据，输出前后对比表写进 WORKNOTE。
- 浏览器 QA：`scripts/qa/clutch-challenge.mjs`——完整走一遍场景选择→结果→重试，390/1280。
- **变异验证（本里程碑必做，不是可选项）**：临时撤销"玩家决策覆盖脚本"的逻辑，确认探针脚本测试会报红（证明验收指标真的在测东西，不是摆设）。

### Rollback Plan

- 本里程碑的改动必须限定在**显式 clutch 开关**之后生效；如果上线后发现非 clutch 场景的比赛平衡被意外影响，第一反应是检查开关作用域是否泄漏到了普通比赛路径，而不是整体回滚。
- 如需完全回滚：`git revert` 相关提交；由于本里程碑不改存档结构（绝杀挑战是单局即时玩法，不产生需要长期持久化的新存档字段），回滚不涉及数据迁移问题。
- 如果 ≥35% 的目标阈值在真实实现中难以达到且找不到合理路径，**不要为了凑数字而加命中率加成**——按 ADR-002 重新评估通道设计，必要时回到 DECISIONS.md 重新拍板，而不是违反 spec §5.3 的硬性原则。

### Definition of Done

- 以上 Acceptance Criteria 全部通过（尤其是 ≥35% 阈值和旧模式零回归两条硬指标）；`npm test` 全绿、lint 0 错误、diff-check 干净；变异验证完成并记录结果；推送；WORKNOTE/TASKS/AGENT_CHAT 更新；本文状态列更新为 ✅；ADR-002 标记已实施并记录最终阈值。
- **闸门**：M2b 完成后，停下来，等你试玩并批准，才能开 M3（P0D）。

---

## 6. 里程碑三：**P0D 2D 球场可视化 + 战术接管**（canonical: M3）

### Scope

1. 领域事件适配器：基于现有 `emit`（5 类事件 + 回合级 snapshot，`BASELINE_AUDIT.md` §3）搭建，用快照差分推导 `POSSESSION_START`/`SUBSTITUTION`/`PERIOD_END` 等现在没有独立事件类型的信息；M2b 已经为突破补的最小 `meta` 在本里程碑系统化扩展到其余事件类型。
2. 统一动画队列：替换现有 3 路独立 `rAF` + 1 个 timeout（`court.js` 的 `_shotRaf`/`_dunkRaf`/主渲染循环/`skillPop`，`BASELINE_AUDIT.md` §5）为一个有入队、取消、优先级、代际令牌的统一队列。
3. 持球光环、移动轨迹、传球弧线、投篮反馈的视觉增强；减少"动态效果关闭时退回静态战术板"的场景覆盖面。
4. 战术接管（tactical takeover）：把 M2b 建立的 `DecisionAdapter`/`PlayerDecisionAdapter` 雏形扩展到常规比赛的战术层面操作（如 `setFocusPlay`/`setTempo` 的 UI 化，`BASELINE_AUDIT.md` §6.1 已有的选项表作为起点）。

### Scope 外（本里程碑明确不做）

- 2D 精灵小人（M3b，等 DECISIONS.md D4 美术来源决策后再开）。
- 个人操控、PixiJS 迁移（除非 DOM 渲染实测到性能瓶颈，不要无证据迁移渲染技术栈）。

### Dependencies

- 依赖 M2b 完成（事件适配器复用 M2b 为绝杀场景补的 `meta` 字段约定，不要重新发明一套格式）。
- 依赖 DECISIONS.md D4（2D 精灵美术来源）至少有一个临时默认（程序化 SVG 原型），本里程碑第一期不被美术资源阻塞。

### Implementation Tasks

- `js/engine/sim.js`：系统化补齐 `meta` 字段（犯规人、失误人、换人双方球员 id 等），复用 M2b 建立的字段命名约定。
- 新建统一动画队列模块（建议 `js/engine/courtAnimationQueue.js`），实现入队/取消/代际令牌；`js/engine/court.js` 的 `onShot`/`onDunk`/`skillPop` 迁移到走这个队列，不再各自维护独立 `rAF`。
- `js/engine/court.js`：战术接管 UI 挂钩（复用 `gameplan.js` 现有的 `FOCUS_PLAYS`/`TEMPO_OPTIONS` 选项表）。
- `prefers-reduced-motion` 媒体查询支持（项目已有的无障碍惯例，新动画必须遵守）。

### Acceptance Criteria

- 渲染只读测试：喂一个冻结的快照给渲染层，渲染变化不能反过来修改模拟状态（纯投影原则，spec §6.2 的硬性要求）。
- 同一场比赛，动画开/关两种模式下最终比分完全相同（证明动画不影响结果）。
- 手机端帧率实测记录（不要求达到某个硬指标，但要有数据，作为是否需要 PixiJS 的决策依据）。
- `prefers-reduced-motion` 生效时动画降级或关闭。
- 英文模式无中文泄漏；无横向溢出。

### Tests

- `tests/courtAnimationQueue.test.js`（入队顺序、取消、代际令牌失效旧回调）。
- `tests/courtRenderReadOnly.test.js`（渲染不改模拟状态的回归测试，用冻结快照 + 深比较验证）。
- 浏览器 QA：`scripts/qa/court-takeover.mjs`——桌面+手机，动画开关对比分无影响，战术接管面板可操作。

### Rollback Plan

- 动画队列是渲染层的内部重构，`CourtView` 对外接口（`render(snap)`/`onShot`/`onDunk`）保持不变的话，回滚只需要恢复旧实现文件，不涉及存档或引擎状态。
- 战术接管 UI 如果体验不佳，可以独立隐藏/下线，不影响比赛模拟本身（它只是现有 `setFocusPlay`/`setTempo` API 的 UI 封装）。

### Definition of Done

- Acceptance Criteria 全部通过；测试/lint/diff-check 通过；推送；文档更新；本文状态列更新为 ✅。
- **闸门（继承自 2.0-plan.md §6）**：M3 完成后停下来，你试玩 M1–M3 整个切片并批准后，才能进入 P1（M4 及之后）。这是全路线图里最重要的一个闸门——前三个里程碑是"值不值得做 2.0"的验证切片，不是走流程。

---

## 7. 里程碑四及之后：**P1（My Legacy + Unified Reborn）**、**P2+**（门后，届时展开细化）

以下里程碑在 M3 闸门批准前只做轻量规划，不展开详细实现任务——这是刻意的，不是遗漏：P0A-P0D 的实现过程会暴露目前看不到的约束（例如 M2b 的 `DecisionAdapter` 最终形态会直接决定 M6/M7 怎么做球员/GM 视角的决策接管），提前写死细节只会导致返工。每个里程碑开门时，在本文件对应小节补齐 Scope/Dependencies/Tasks/Acceptance/Tests/Rollback/DoD 七要素，同时在 `DECISIONS.md` 补对应 ADR。

### M4 — P1 My Legacy：存储基础设施 + 身份/捏脸/家乡（门控：M3 批准）

- **Scope（高层）**：先做存储预算与版本迁移链（`BASELINE_AUDIT.md` §4.1，`schemaVersion` 3→4 必须可逆、配旧存档夹具测试），再做身份 schema（出生地/家乡/代表地区/资格/隐私分离，默认不公开）+ 捏脸（复用 `js/data/avatarArt.js` 程序化头像，§6.2 已确认存在）。家乡只影响叙事文案，不影响能力值数值（避免"家乡加成"这种需要重新做平衡测试的设计）。
- **Dependencies**：M1-M3 批准；DECISIONS.md 需要先有存档版本升级的 ADR（补充 ADR-001 的存档部分，或单独立 ADR-004）。
- **Tasks（高层）**：`saveRoot.js` 迁移链（v3→v4，`validateRoot` 增加逐版本迁移函数而不是直接拒读）；身份 schema 设计与存储位置（`profile` 字段扩展）；捏脸 UI。
- **Acceptance（高层）**：v3 存档能无损升级到 v4；新身份字段缺省值安全；家乡文案可本地化（中英双语）。
- **Tests / Rollback / DoD**：开门时补齐，至少包含旧存档夹具回归测试和迁移失败时不破坏原存档的保护测试。

### M5–M7 — P1 Unified Reborn：教练 / 球员 / GM 统一入口（门控：M4 完成）

- **M5 穿越统一入口**：年代/角色（随机/球员/教练/GM）/难度选择入口；现有 `timeTravelCareer.js`（教练线 A-C 已完成）实际是**经典 GM+Coach**（教练与 GM 权限耦合在同一入口），整体复用并保留为「经典」选项，**不等于**已有独立 Coach 身份；真正的 Coach / GM 要按 `ADR-006-reborn-career-identity.md` 拆权限（PROPOSED）；球员/教练/GM 在选择页显示"开发中"。旧 `timeTravel` 存档必须原样可读。
- **M6 穿越·球员 1996 替补切片**：方案见 `docs/implementation/ADR-005-player-reborn.md`（✅ APPROVED，用户 2026-11-04 批 Q1–Q4 取默认值；PR1 仍等 M3 闸门 + 规则 10 的一页设计）。复用 M2b 建立的 `ClutchController`/决策原语（球员生涯"关键时刻选择"和绝杀挑战是同一个原语，不重复建）。拆成 5 步，每步一个提交，都要过 review：

  | 步 | 内容 | 影响模块 | 测试 | 验收 |
  |---|---|---|---|---|
  | PR1 | 身份与开局：种子 → 历史替补或虚构训练营球员；1996–97 季前 | 新 `js/reborn/identity.js`；`saveRoot.js` 增加可选 `root.reborn` 与 `validateReborn` | 同种子同身份；候选池只含 season=1997、场均 <12 分钟且 ≥10 场；接管的真实球员不会在 CPU 名单里重复出现；`roster.json` 深比较不变；v3 旧存档往返不变 | 身份揭示卡可以显示；刷新后身份不变 |
  | PR2 | 以球员身份打赛季：信任 → 轮换角色 → `targetMinutes`；比赛全托管；赛后卡只看你自己那一行 | 新 `js/reborn/trust.js`、`js/reborn/season.js`；`careerPostGameView.js` 加单人视图（不改现有三类行） | 信任与角色映射用纯函数单测；上场时间对比角色用固定夹具测，不对随机比赛下断言；`sim.js` 零改动 | 表现好会多打、表现差会少打，原因写在卡面上 |
  | PR3 | 训练：每周选重点 → 写入成长计划的 `focus`，复用 `awardGrowth` 和上限函数 | 新 `js/reborn/training.js`；复用 `calendar.js`、`playerGrowth.js` | 训练不能突破上限函数；不新增属性加成通道；变异测试（撤掉 focus 写入要变红） | 训练效果能在卡面看到来源 |
  | PR4 | 关键回合接管：第四节或加时最后 2:00、分差 ≤5、你在场且持球 → 2–3 个选项 | 只经 M2b 的决策接口；新 `js/ui/reborn/takeover.js` | 用 M2b 的可注入 RNG 做固定种子测试；选项要真的改变出手人和出手类型（探针 `scripts/research/clutch-choice-probe.mjs` 前后对比）；不显示未校准的胜率 | **门控：M2b 完成**。接管时 UI 不改写比分和统计 |
  | PR5 | 赛季末职业结算：续约 / 底薪 / 被裁 → 试训或自由球员 → 下一季，时间线连续 | 新 `js/reborn/contract.js`；时间线事件写入 `root.reborn.timeline` | 被裁仍能继续玩（不是 Game Over）；存档读档后时间线和身份一致；原始数据不变 | 能连续打完 2 个赛季 |

  切片之外（历史穿越选择器、原创穿越建档、RANDOM_ROLE、Player → Coach 转换）见 ADR-005 §7，只登记、不排期。
- **M7 穿越·GM + 历史分支**：（L-1 候选登记表/重生规则按 `ADR-007`（✅ 修改后批准）：每人每时间线一次、成长不被历史封顶；**容量模拟已做**，结论见 ADR-007 §10——总人数够，中锋是瓶颈，每届规模按 ~76 设计。）GM 权限边界（球员不能交易、教练不能单方面交易）；球探/未来选秀系统（并入现有 `CAREER_LIFE_ROADMAP.md` 的 D1-D7）；时间线事件日志（行动者/年份/前后状态/因果引用，`rebornSave` 统一存档契约在此落地）。
- **门控细节、七要素**：各自开门时在本节展开。

### M8 + 研究项 — P2+（门控：P1 完成，部分项目额外需要外部输入）

| 子项 | canonical | 状态 | 门控/外部依赖 |
|---|---|---|---|
| 评分校准（OVR 标尺 ADR、`deriveSubAttributes` 重复计算审计） | M8 | 🏗️ | 无外部依赖，P1 完成后可开 |
| 历史分支 | M7 的延伸 | 🏗️ | 依赖 M7 的时间线事件日志契约 |
| 女篮 / WNBA | 研究项 | 🔴 不排期 | **外部依赖：数据与版权未解决**，`LeagueRules` 集中化本身也不存在（规则常量散落各处，`BASELINE_AUDIT.md` §9） |
| 收藏扩展 | 研究项 | 🟡 | 可复用现有 `gacha.js`/`accountGacha.js`，无硬阻塞 |
| 本地音乐 | — | ✅ **已实现** | 已升级为 `js/audio/`（Courtside Radio：动态音乐 + 本机歌单 + 音效），旧 `bgm.js` 已删除，设置自动迁移 |
| 社交（好友/俱乐部/分享） | 研究项 | 🔴 不排期 | **外部依赖：需要账号系统 + 内容审核后端**，结果分享卡可复用 `js/story/endingShareCard.js` 的思路，但好友关系/俱乐部需要全新后端 |
| 市场/经济扩展 | 研究项 | 🟡 | 现有 `gold` + 抽卡券经济（`BASELINE_AUDIT.md` §8.1）可直接扩展，无第二货币 |
| 实时操控 / 2.5D / 3D | 研究项 | 🔴 不排期 | spec 自己划为研究项；`docs/3D_BROADCAST_PLAN.md` 已说明引擎不产出真实轨迹数据 |

对于标 🔴 的研究项，本阶段的 Acceptance/Tests/Rollback/DoD 统一是：**产出一份决策文档（写进 DECISIONS.md 或独立研究备忘），给出 go/no-go 结论和所需的具体外部输入清单，不产出生产代码**。不要为了凑"每个里程碑都有验收标准"而给一个明知做不了的功能编造虚假的测试计划。

## 8. 风险清单（继承自 2.0-plan.md，按影响排序）

| 风险 | 影响 | 缓解 |
|---|---|---|
| R1 改 `resolvePossession`（M2b）引发全局平衡漂移 | 所有模式的比赛结果 | 玩家决策只在显式 clutch 开关下生效；改动前后跑全量 + 分布对照，旧模式行为字节级不变 |
| R2 存档体积 / 版本迁移（M4） | 老玩家存档报废 | 先写迁移链 + 旧存档夹具测试，再升版本；写失败绝不报成功 |
| R3 范围蔓延（spec 很宽） | 什么都做一半 | 严格按里程碑闸门；每个里程碑结束才能开下一个；M3 之后停下来等批准再进 P1+ |
| R4 美术与版权（P0D/M3b） | 2D 小人、照片、队标 | 精灵图在 M3b 前单独决策（DECISIONS.md D4）；继续沿用现有"有署名才显示"的照片策略 |
| R5 多 agent 并行踩同一文件 | 覆盖彼此改动（历史上已发生过） | 认领制 + 开工/提交前 `git fetch` + 看 `git status`，按 hunk 暂存 |
| R6 RNG 不可注入（M2b） | 无法做确定性重放 | 先测不变量和分布（探针脚本是原型）；RNG 注入单独 ADR，不阻塞 M1–M3 |

## 9. 与现有路线图的合并表（继承自 2.0-plan.md §5，不搞两套计划）

| 现有条目 | 处理 | 并入 |
|---|---|---|
| 教练生涯 A1–C6（`CAREER_LIFE_ROADMAP.md`，已完成） | 保留，作为"穿越·教练"角色的现成实现 | M5 |
| C7 特殊比赛标记、C8 季后赛每场调整 | 暂停；C8 复用 M2b 的决策通道再做 | M5 之后 |
| D1–D7 球探 / 未来选秀 / 试训 / 允诺 | 暂停；穿越·GM 和历史分支的核心内容 | M7 |
| E1–E4、E6–E7 场外人生 | 暂停；归入"我的传奇·生活线" | P1 之后另排 |
| E5 赌博（`TASKS.md` T14 已定：只做文字事件且可关闭） | 已有决定与 spec 兼容，照旧 | P1 之后另排 |
| E3 个人财务（已完成） | 保留 | — |
| 球员生涯 P1 捏脸建档（`PLAYER_CAREER_ROADMAP.md`） | 并入"我的传奇·身份" | M4 |
| 球员生涯 P2–P6 童年→选秀→NBA 视角 | 并入"穿越·球员"职业线 | M6 |
| 球员生涯 P7 关键时刻选择 | 与绝杀挑战是同一个原语，只建一次 `ClutchController` | M2b（原语）→ M6（复用） |
| 球员生涯 P8 退休名人堂 | 复用教练线 B7 的传奇结算 | M6 |
| `PLAYABLE_MOMENTS_PLAN.md` 时机条 | 降为可选项，待拍板（DECISIONS D3） | M3 之后 |
| `3D_BROADCAST_PLAN.md` | 归档为研究项 | 研究 |
| `RELEASE_ROADMAP.md` / `MOBILE_APPS.md` | 保留；每个里程碑都要过手机端验收 | 横向 |
| ADR-007 传奇宇宙（候选登记表、重生、策展人物、宇宙预设） | 替换 `leagueDraft.js` 的虚构补位；头条策展人物 | M7（L-1/L-2），宇宙预设随 M5 建档 |
| ADR-007 2050 终局 + 三种结束统一发勋章 | 结算层 | M5–M7 |
| ADR-007 账号 `LegacyArchive` + 首页勋章墙 | 账号层存储 | M4 |
| ADR-007 四分线 | 先 `LeagueRules` 集中化，再单独 GameSim ADR | M2b-1、M3 之后，M8 之前 |
| ADR-008 N-1 四空间导航骨架 | 只改 `modeCatalog.homeTab` 与首页布局，可回退 | M1 延伸（M1b），不挡 M2b |
| ADR-008 N-2 我的球队核心循环 / N-3 我的世界身份 | — | N-2：M2b-1 后；N-3：M4 |
| ADR-008 N-4 离线托管 / N-5 阵容合一 / N-6 社交 | 各自先写设计 | N-4：经济测量后；N-5：单独 ADR；N-6：研究项 🔴 |

## 10. 通用验收（所有里程碑共用，不逐条重复）

`npm test` 全绿、`npm run lint` 0 错误、`git diff --check` 干净；桌面 1280 + 手机 390 浏览器 QA 脚本全绿，并做至少一次变异验证（证明 QA 能抓到回归）；英文模式无中文泄漏；旧存档能读；提交后立即推送；`WORKNOTE.md` 记 R 编号、`TASKS.md` 打卡、`AGENT_CHAT.md` 留言。

## 11. 维护规则

- 本文件是 2.0 开发的唯一执行计划来源；`BASELINE_AUDIT.md` 是事实底稿，`DECISIONS.md` 是决策记录，三者冲突时以"代码事实 > 本文件 > spec"为准，并在 `DECISIONS.md` 记录分歧。
- 每完成一个里程碑：更新本文件对应小节的状态；在 `BASELINE_AUDIT.md` 补新发现的坑（如果有）；里程碑内部细节写 `WORKNOTE.md`，不在本文件铺开。
- 改动范围超出当前里程碑"Scope"列表时，先在本文件加一行再动手，不偷偷扩大范围。
- 历史版本：`docs/implementation/2.0-plan.md` 保留作为本文件的设计论证详细记录（含 G1-G11 的发现过程、D1-D7 的推理细节），本文件是重组后的权威版本，两者冲突以本文件为准。
