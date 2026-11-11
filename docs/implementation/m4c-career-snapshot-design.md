# M4-C 职业身份快照（Career Identity Snapshot）— 设计

**状态：** 设计先行（实现前写就）；依据 ADR-004 §1/D1 的架构边界（用户 2026-11-10 裁决 Q2：身份地点在账号，职业创建时可存一份快照，永不反写账号）与 ROADMAP M4 “下一步”（M4-C 与 Reborn 协调，不得两个 Agent 同时改职业创建入口）。
**范围：** 只做快照存储 + 读取 API + 创建入口接线 + 测试。不碰 `sim.js`、存档格式破坏性改动、M4-A 的 My World 编辑 UI 与 `profile.js` 身份字段落点、Hometown Legends 数据与 ADR-009（M4-B 的范围，并行另一 Agent 在做）。

## 1. 审计：职业创建入口（2026-11-11 核实）

| 入口 | 创建函数（纯函数，扼流点） | UI 调用点 | 产物 |
|---|---|---|---|
| Time Travel 教练 / GM+Coach（`?career=coach`、GM+Coach 经典线） | `acceptInterviewOffer(prologue, offerId)`（`js/modes/timeTravelCareer.js`）→ `setIdentity(createRootState({...}), role)`，其内 `createLeagueCareer({kind:"timeTravel",...})` | `js/ui/timeTravel/screen.js:281` `acceptOffer()` | 整个 root（`root.leagueCareer` + `root.identity`） |
| League Manager GM（franchise） | `createLeagueCareer({kind:"franchise", season, role:"GM"})`（`js/modes/leagueCareer.js`） | `js/app.js` 赛季设置提交处理（`createLeagueCareer` 调用处） | `state.leagueCareer`，后经 `saveSeasonAndCareer` → `currentRootState()` → `createRootState({leagueCareer, ...})` 写入 root |
| Player Reborn（`?reborn=1` / PR1–PR5） | `createRebornFromChoice({seed, rows, choice})`（`js/ui/reborn/creation.js`）→ `createRebornState(seed, rows, ...)`（`js/reborn/identity.js`） | `js/ui/reborn/rebornView.js` 确认处理：`root.reborn = reborn; writeRootSave(root)` | `root.reborn`（子记录） |

审计结论：

- **没有单一根创建函数。** 三个入口各有自己的纯创建函数；`createLeagueCareer` 是两条 leagueCareer 线（franchise GM + timeTravel）的共享扼流点，`createRebornState` 是 Reborn 线的扼流点。快照在这两个扼流点盖戳，三个入口全覆盖，不漏、不重复。
- **一个 root 可同时持有 `leagueCareer` 与 `reborn`**：Reborn 确认处理只做 `root.reborn = reborn`，不清除已有的 `leagueCareer`。因此快照不能只放 root 顶层（后创建的职业会覆盖先创建职业的快照）；必须跟各自的职业子记录走。
- **Reborn 重置会丢快照——是对的**：`rebornView.js` 的重置做 `delete root.reborn`，快照随职业记录一起消失；下一次重新创建时重新快照。
- **再就业 / 被挖角不是新职业**：`startNewStint()`（`timeTravelCareer.js`，B5/B6 共用）用 `createLeagueCareer` 重建 `leagueCareer`，会把快照丢掉。必须把旧快照原样带过去（carry-forward，不是重新快照）。
- **存活链已验证**：`careerForPersistence()`（`leagueCareerPhase.js`）与 `upgradeLeagueCareerManagement()` 都是 `{...career}` 展开，快照字段能活过每次保存；`currentRootState()`（`app.js`）经 `careerForPersistence` 携带 `leagueCareer`；Reborn 的 `persist()` 用内存里的 `reborn` 对象整写 `root.reborn`，快照随对象走。
- **校验器不拦新字段**：`validateLeagueCareer` / `validateReborn`（`saveRoot.js`）只校验已知字段、不拒未知字段；按既有“可选字段只在出现时校验”的成例（`root.coach`、`story.executive`），给快照加一个“出现时校验形状”的轻校验。
- **账号怎么到创建函数**：`app.js` 有 `activeAccount()`（账户或 null；游客无账户）；视图注入用既有 `getAccount` 回调模式（`createRelationshipsView` 已用）。`readIdentity(account)`（`profile.js`）统一处理账户与游客——调用点用它取当下地点，创建函数只收已处理好的原始值、内部再过 `sanitizeIdentityPlaces`。

## 2. 快照形态与存放位置

- **存放：职业子记录上的加性可选字段 `identitySnapshot`**：
  - `root.leagueCareer.identitySnapshot`（franchise GM / timeTravel 教练与 GM+Coach）
  - `root.reborn.identitySnapshot`（Player Reborn）
- **形态**：与 `account.identityPlaces` 同形——`{ birthplace, grewUpIn, representedCity }`，三字段均为 ≤40 字字符串或 `null`；由 `sanitizeIdentityPlaces` 清洗（40 字封顶、空白折叠、空→`null`、三空→整个快照为 `null`，即**字段缺席**，不存空对象）。账号当时无地点 → 不写字段（老存档同理：缺字段即合法）。
- **不做**：不升 `schemaVersion`（v4 只做加法已覆盖）、不改 `root.identity`（角色戳）、不碰 `createRootState` 的缺省形态（`saveRoot.js:801` 的删档重建与 `:896` 的 legacy 迁移建的是无职业/远古存档，不带快照，读时走回退）。

## 3. 读写 API（新模块 `js/career/careerIdentitySnapshot.js`，纯函数）

- `snapshotIdentityPlaces(raw)` — 清洗并返回快照或 `null`（`sanitizeIdentityPlaces` 的薄包装，创建函数共用）。
- `careerIdentitySnapshot(career)` — 取 `career?.identitySnapshot`，返回清洗后的**副本**（调用方改返回值不污染存档）或 `null`。`career` 是职业子记录（`leagueCareer` 或 `reborn`）。
- `resolveCareerIdentityPlaces(career, account)` — 快照优先，否则回退到账号当下地点（`account?.profile?.identityPlaces ?? account?.identityPlaces`，后者覆盖游客档案 / `readIdentity()` 结果的形态）；两者皆无 → `null`。**只读**：永不写回账号，永不改写职业记录。

Hometown Legends（M4-B）以后经 `resolveCareerIdentityPlaces` 读，不直接碰字段。

## 4. 接线（创建时盖戳，之后只读）

| 扼流点 | 改动 |
|---|---|
| `createLeagueCareer({... , identityPlaces})` | 可选参数；有地点时在返回对象上加 `identitySnapshot`。 |
| `acceptInterviewOffer(prologue, offerId, { identityPlaces })` | 可选第三参，透传给 `createLeagueCareer`。UI：`screen.js` 的 `acceptOffer()` 经新注入的 `getAccount`（`app.js` 传 `activeAccount`）取 `readIdentity(getAccount?.()).identityPlaces` 后传入。 |
| `startNewStint(root, offer, ...)` | **不重新快照**：把 `root.leagueCareer?.identitySnapshot` 原样透传给 `createLeagueCareer`（已清洗过的值再过一次清洗是幂等的）。 |
| `app.js` franchise 设置提交 | `createLeagueCareer({kind:"franchise", ..., identityPlaces: readIdentity(activeAccount()).identityPlaces})`。 |
| `createRebornState(seed, players, {..., identityPlaces})` | 可选参数；有地点时在返回的 reborn 对象上加 `identitySnapshot`。 |
| `createRebornFromChoice({... , identityPlaces})` | 透传给 `createRebornState`（三个 destiny 分支共用）。UI：`rebornView.js` 确认处理经新注入的 `getAccount`（`app.js` 传 `activeAccount`）取当下地点后传入。 |

之后改账号资料（M4-A 的 My World 编辑）不触职业记录：保存路径（`currentRootState` / `careerForPersistence` / Reborn `persist`）只搬运已有快照，不重算。`saveIdentity` 本人也不读职业记录。

## 5. 测试（新文件 `tests/careerIdentitySnapshot.test.js`）

- 创建时快照：`createLeagueCareer` / `createRebornState` / `createRebornFromChoice` / `acceptInterviewOffer` 带地点 → `identitySnapshot` 与账号当时值一致、经清洗（超长截断 40、空白折叠、全空缺席）。
- 不反写：创建后换账号地点 → `careerIdentitySnapshot` 不变；`resolveCareerIdentityPlaces` 仍返回旧快照（不返回新账号值）。
- 回退：无快照的职业 → `resolveCareerIdentityPlaces` 返回账号当下地点；账号也无地点 → `null`。
- 老存档兼容：无快照字段的 `leagueCareer` / `reborn` / 整个 root 照常过 `validateRoot`（不抛）；`careerIdentitySnapshot` 返回 `null`。
- 再就业不断快照：`startNewStint` 后快照与创建时一致。
- 副本语义：改 `careerIdentitySnapshot()` 的返回值不影响职业记录。
- 游客：`account` 为 `null` 时 `resolveCareerIdentityPlaces` 只读快照（无快照则 `null`，不崩）。

## 6. 不做（留给别的线）

- Hometown Legends 的任何数据、视图、ADR-009 内容（M4-B）。
- 快照的任何 UI 展示（M4-D）。
- `seasonEpiphany` 转换、碎片新用途、Dynasty Builder 撞名（待用户拍板）。
