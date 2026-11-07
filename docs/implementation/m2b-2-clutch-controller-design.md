# M2b-2 一页设计：ClutchController + 场景 + 结果页（待用户批准后实施）

## 目标

把 M2b-1 的引擎契约（`submitDecision`，已 READY）接上玩家看得见的东西：一个绝杀场景、一个决策 UI 状态机、一页结果。范围按 ROADMAP §5 与 M2b 设计文档（§1/§81/§164）：`ClutchController`、`initializeScenario`、1 个场景与结果页、`replaceDecision()`。M2b-2 按批示不自动开始——用户 2026-11-07 已批开工；本稿是开工前的一页设计，批后再写代码。

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
- 默认场景（待用户确认，可换）：**落后 3 分、剩 12 秒、我方球权、三分**——就是 M2b-1 测量用的场景 1，数字都已实测过（选中者份额 14%→92%）。备选：落后 2 分、剩 30 秒、突破（场景 2）。
- 场景只在显式 `clutch` 开关之后进；非 clutch 比赛行为字节级不变（M2b-1 已保证，M2b-2 不碰 `resolvePossession` 的 tick 路径）。

## 结果页

内容：这次进攻的结果（谁出手、进没进、得几分、原因 `reason`/`honored`）+ 场景回顾（比分、时间、选择）。返回按返回按钮分层设计走：左上角标准返回，回场景入口（或主页，见该设计稿的待定项）。
- `replaceDecision()`：本轮没做，留给 M2b-2——语义：决策窗口还开着时，玩家可改一次选择；改完旧 `attemptId` 作废、发新 id；窗口关闭/已提交后不可改。

## 测试

- 新增 `tests/clutchController.test.js`（状态转换、`attemptId` 失效、取消/重试）、`tests/initializeScenario.test.js`（不变量：非法拒绝、合法通过、边界如 clock=0/加时）、`tests/clutchDecisionAdapter.test.js`（玩家选择写入 `chase.shooterId` 的路径、非 clutch 场景不受影响）。
- 回归：全量绿；金标与 M2b-1 基线一致；`clutch` 开关关掉时行为与改前一致。

## 非目标

- 不做第 2 个场景（那是 M2b-3 以后的事）；不动 `resolvePossession` 的 tick 逻辑、不动命中/防守/疲劳、不动商店与经济、不动存档结构。
- 分工：控制器 + 界面归 Luna；若实现中发现要动 sim.js 超出现有契约的部分，归 Code（sim.js 同一时间一人；B23/B27 还在队里）。

## 待用户定

1. 场景：默认"落后 3 分、剩 12 秒、三分"，还是换"落后 2 分、剩 30 秒、突破"？
2. 结果页之后：直接回主页，还是回一个"绝杀挑战"入口（可重开一局）？
