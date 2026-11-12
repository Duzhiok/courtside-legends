# R7 设计：Player Reborn 接入身份与权限（ADR-006 §3，R7）

- **状态**：设计稿（本轮；ADR-006 已批，R1–R6 已落地；实现下一轮按本设计直接做）
- **目标**：把已可玩的 Player Reborn 生涯（PR1–PR5，`js/reborn/`）接进 ADR-006 的身份与权限体系——球员生涯创建时盖 `PLAYER` 身份章，`identityOf()` 对球员存档答得出 PLAYER，接管/个人训练第一次走守卫。只做连接，不做新玩法、不改球员规则。
- **现状核查（2026-11-11，main 实测）**：球员创建走 `js/ui/reborn/creation.js` + `rebornView.js`，`rootWithReborn()` 只写 `root.reborn`，从不调 `setIdentity`——球员存档无 `root.identity`，`identityOf()` 按 Q1 读成 GM_COACH，球员生涯静默持有全部权限。`js/reborn/` 与 `js/ui/reborn/` 里零 `requireCapability`/`canDo` 调用——矩阵里的 `takeover`/`personalTraining` 至今无消费者。入口已无工作：`careerEntry.js` 球员卡已是 `playable`；`validateReborn` 已在 `saveRoot.js`；M4-C 快照已接进 `createRebornState`。另核实：reborn 流里无交易/选秀/签约入口（grep `trade|draft|signFreeAgent` 无命中），UI 隔离无欠账。

## 1. 创建时盖章（与 timeTravelCareer.js:291 同一做法）

- 落点：`rebornView.js` 的 `[data-reborn-confirm]` 处理器——`createRebornFromChoice` 成功后、`persist()` 前，`root = setIdentity(root, "PLAYER")` 再写 `root.reborn`。只盖一次（创建时），续玩/快进的 `persist()` 不重盖——`currentRole` 是“正在玩的生涯”，创建后改账号资料或另开教练生涯都不应被球员续玩悄悄翻回。
- `setIdentity` 已支持无 `leagueCareer` 的 root（`careerPermissions.test.js:111` 有测试）；`initialRole` 保留既有值、`currentRole` 移到 PLAYER。盖章与写 `root.reborn` 同一次 `writeRootSave` 提交，中间不留半成品存档。

## 2. 读侧推导（只读，不写、不迁移，R1 同款精神）

- `identityOf(root)` 优先级：已盖的有效 `currentRole` 赢；否则当 `root.reborn` 存在 **且** 无 `leagueCareer` 时读 PLAYER；否则 GM_COACH（Q1 默认不变）。
- 为什么加第二条：PR1–PR5 已落地的本地/开发期球员存档都没有身份章；没有推导，它们永远读成 GM_COACH。`root.reborn` 是球员生涯的无歧义证据（`validateReborn` 要求 `role === "player"`），推导不写盘、不改旧存档。
- 为什么限定“无 leagueCareer”：同一 root 理论上可同时有教练生涯与球员生涯；老教练生涯无 `leagueCareer.role` 时，`careerRole()` 会回退到 `identityOf()`——不限定会把老教练生涯误读成 PLAYER、丢掉 GM 权限。有限定则老教练生涯仍走 Q1 默认；新创建的生涯自带章，互不干扰。`careerRole()` 的 `career.role` 优先规则不动。

## 3. 守卫接线（takeover / personalTraining 迎来第一个消费者）

- 接管（PR4，`js/ui/reborn/takeover.js` → `js/engine/clutchController.js`）与个人训练（PR3，`js/reborn/training.js`）的入口各加一行 `requireCapability({ role: identityOf(root) }, "takeover" | "personalTraining", root)`。reborn 没有 `leagueCareer` 对象，用 `{ role }` 裸对象——`careerRole` 本来就接受裸对象（见 careerGuards.js 注释）。
- 语义：PLAYER 与 GM_COACH 放行（经典持全部能力；经典存档本无 reborn，路径实际不可达）；COACH / GM 调同一入口抛 `CareerPermissionError`（拒绝文案已在 `DENY_MESSAGES` 里，无需新写）。合同授予（R6）不适用：reborn 无 `career.grants`，`effectivePermissions` 对裸对象读不到 grants，自然无授予——球员不能靠签约买到交易权，符合 ADR-006 矩阵。
- 不新增能力 ID：矩阵已有的 `takeover`/`personalTraining` 够用；`watchGame`/`signOwnContract` 在 reborn 流里无操作入口，不加。

## 4. 不在本片

- 不做身份转换（球员中途转教练/GM；ADR-006 §3.5 双职代价是后续议题，转换前先另交设计）；GM 卡仍为 awaiting，不动；不碰 M4-C 快照与职业创建入口、不碰 `sim.js`、不升存档版本（identity 与 reborn 均为可选字段，R1 的 `validateRoleIdentity` 已覆盖盖章后的校验，非法章拒绝）；不改 `timeTravelCareer.js`、教练/GM 守卫点与赛季页签（R4/R5 已有）。

## 5. 验收

- 新建球员生涯 → 同一次保存里 `root.identity.currentRole === "PLAYER"` 且 `initialRole === "PLAYER"`；重读后 `identityOf()` 为 PLAYER；M4-C 快照仍冻结创建时代表城市。
- 手工构造的 R7 前球员存档（有 `root.reborn`、无 identity、无 leagueCareer）→ `identityOf()` 为 PLAYER，且不写盘、不补字段。
- 老存档（无 identity、无 reborn）仍读 GM_COACH；有 identity 章的存档章赢；有 leagueCareer 无章的老教练存档不被推导改读。
- 直接调接管/训练入口：PLAYER 放行，COACH/GM 抛 `CareerPermissionError`（`takeover`/`personalTraining`）；GM_COACH 放行。
- 测试：盖章（创建写盘往返）、推导三态、章优先、老存档回归、守卫两向；focused + 全套。

## 6. 回滚

-  revert 单提交：盖章与推导一起消失，球员存档读回 GM_COACH（reborn 字段本身不动，无数据丢失）；守卫行删掉后接管/训练回到无检查状态。单提交可 revert。
