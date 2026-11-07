# M2b-2 一页设计：ClutchController + 场景 + 结果页（用户已批准，见下）

> **产品负责人批准（2026-11-07，本对话）**：M2b-2 可以开始。执行归 Code（VS Code Agent）；Luna review。做完 M2b-2 停手，报告截图、测试结果、改动文件、提交号、剩余风险。做完前先在 Mac 上跑一次返回按钮浏览器 QA（`scripts/qa/back-buttons.mjs`），再关闭上一轮导航任务；8dae49e 在 Mac QA 通过前不算完整视觉验收；跑 QA 时不扩大返回导航的改动范围。

## 目标

把 M2b-1 的引擎契约（`submitDecision`，已 READY）接上玩家看得见的东西：一个绝杀场景、一个决策 UI 状态机、一页结果。范围按 ROADMAP §5 与 M2b 设计文档（§1/§81/§164）：`ClutchController`、`initializeScenario`、1 个场景与结果页、`replaceDecision()`。

## ClutchController（UI 状态机，新模块 `js/engine/clutchController.js`）

状态：`READY → AWAITING_DECISION → RESOLVING → CONTINUING → COMPLETED`（+ `FAILED` / `CANCELLED`）。
- `READY`：场景已建好，等玩家打开决策。
- `AWAITING_DECISION`：决策窗口开着；玩家选人 + 动作（`three` / `attack`）后提交，提交即锁定（再点不算）。
- `RESOLVING`：等引擎把这次进攻打完，收结构化结果（`attemptId` 对得上才认）。
- `CONTINUING`：结果已出、比赛继续（或直接进结果页，见下）。
- `FAILED` / `CANCELLED`：场景建失败（不变量不过）/ 玩家取消。
- `attemptId` 是代际令牌：控制器发、只认最新一个；旧 id 的提交直接丢弃；取消/重试/切模式后旧回调失效（ROADMAP §5 已裁决全仓无此机制，要新建）。
- 状态机不掷骰、不读 `Math.random`；随机数只在引擎里（M2b-0 的注入 RNG）。

## initializeScenario（新模块，可并入控制器，单文件 <600 行）

输入：比分差、剩余时间、球权、双方 5 人、基础统计。构造一个合法的 Q4 局面并校验不变量（时钟非负、比分合法、球权合法、场上 5 人、统计初始一致）；非法输入直接拒绝，不伪造 `snapshot()`。
- 默认场景（**用户已定，2026-11-07**）：**2016 Warriors vs 2016 Cavaliers，落后 3 分、剩 12 秒、玩家控制 Warriors、选关键出手人及进攻方式、结果由真实 GameSim 决定**——就是 M2b-1 测量用的场景 1，数字都已实测过（选中者份额 14%→92%）。这是第一个预设场景，不是整个模式的永久限制；未来可扩展落后 1 分、平局、最后 5 秒、绝杀与绝平等不同挑战，但**第一次实现不加第 2 个场景**。
- 场景只在显式 `clutch` 开关之后进；非 clutch 比赛行为字节级不变（M2b-1 已保证，M2b-2 不碰 `resolvePossession` 的 tick 路径）。

## 结果页

内容：这次进攻的结果（谁出手、进没进、得几分、原因 `reason`/`honored`）+ 场景回顾（比分、时间、选择）。返回按返回按钮分层设计走：左上角标准返回，回场景入口（或主页，见该设计稿的待定项）。
- **结果必须解释玩家决策（用户要求，2026-11-07）**：直接读取 M2b-1 的结构化结果（`meta.clutchOutcome`），不在前端根据比分猜测。结果页要回答：球员有没有获得球权？是否按选择执行三分或突破？为什么最终由其他球员出手？是否因失误、犯规或防守而失败？最终投篮是否命中？
- **结果页之后（用户已定，2026-11-07）：回「绝杀挑战」入口，不是直接回主页。** 三个操作：① 再试一次（重新初始化场景——必须新建 GameSim 实例，不复用已结束的实例）；② 其他挑战（回绝杀挑战入口）；③ 返回主页（退出绝杀挑战）。
- `replaceDecision()`：本轮没做，留给 M2b-2——语义：决策窗口还开着时，玩家可改一次选择；改完旧 `attemptId` 作废、发新 id；窗口关闭/已提交后不可改。

## 测试

- 新增 `tests/clutchController.test.js`（状态转换、`attemptId` 失效、取消/重试）、`tests/initializeScenario.test.js`（不变量：非法拒绝、合法通过、边界如 clock=0/加时）、`tests/clutchDecisionAdapter.test.js`（玩家选择写入 `chase.shooterId` 的路径、非 clutch 场景不受影响）。
- 回归：全量绿；金标与 M2b-1 基线一致；`clutch` 开关关掉时行为与改前一致。
- **验收清单（用户批准，2026-11-07）**：针对性单测 + 桌面/手机浏览器 QA；验证场景初始化、选人、提交决策、真实 GameSim 执行、结构化结果渲染、重试与导航、无重复提交、无虚假成功提示、访客访问、普通模式无回归。

## 非目标

- 不做第 2 个场景（那是 M2b-3 以后的事）；不动 `resolvePossession` 的 tick 逻辑、不动命中/防守/疲劳、不动商店与经济、不动存档结构。
- **实现要求（用户批准，2026-11-07）**：复用 M2b-1 的 `submitDecision` 与 `meta.clutchOutcome`；不引入另一套投篮/球权模型；保留防守、疲劳、失误、犯规与正常投篮概率；不给人为命中加成；保留普通比赛行为；不动 M3 与 Player Reborn。
- 分工：**执行归 Code（用户 2026-11-07 正式批准给 VS Code Agent）**；Luna review。若实现中发现要动 sim.js 超出现有契约的部分，仍由 Code 一人动（sim.js 同一时间一人；B23/B27 还在队里）。

## 已决（2026-11-07，用户本对话）

1. 场景：默认"落后 3 分、剩 12 秒、三分"，2016 Warriors vs Cavaliers，M2b-1 已验证配置；第一个预设，非永久限制。
2. 结果页之后：回"绝杀挑战"入口（再试一次 / 其他挑战 / 返回主页），再试一次新建 GameSim 实例。
