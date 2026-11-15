# ADR-011：Career Opportunity（职业机会系统）

- **状态**：🟡 PROPOSED（提案，未批准，未实现）。本文是一份设计 ADR，不是执行入口。
- **作者**：Lychee，2026-11-14（用户指派：Riley/Architect 提案 256a08f 的下一步交付）。
- **范围**：仅文档。**不改生产代码，不改现有解锁行为，不改存档结构，不引入第二个承诺/关系/事件结算引擎。**
- **前置阅读**：写之前已读 `ADR-006-reborn-career-identity.md`、`career-role-permissions.md`、`2.0-plan.md`、`career-2.0-architect-riley-proposal.md`（PROPOSED），以及实现文件 `js/career/network/careerOpportunities.js`（workstream G）、`js/career/careerInbox.js`（workstream A）、`js/career/careerRelationships.js`、`js/career/careerDecisions.js`、`js/career/careerHistory.js`、`js/career/careerIdentity.js`、`js/reborn/promiseSettle.js`、`js/career/gm/executiveProgression.js`（workstream F）、`js/career/contractOffers.js`。

## 0. 为什么需要这份 ADR

Career 2.0 的职业身份（ADR-006：Player / Coach / GM / GM+Coach）已经有了权限模型，但**身份之间怎么走**一直没有统一设计。已有的实现是散的：

- 入门级职业网络已经实现（`careerOpportunities.js`，workstream G）：球探 / 录像分析师 / 数据分析师 → 助教 → 主教练 / 总经理，带声望、成就、关系与失业回退。但它**没有总裁（President）角色，没有双重身份（GM+Coach）**，也覆盖不了球员退役、助教晋升、被解雇后重返执教这些路径。
- 转职的“怎么变”已经实现一半：`setIdentity` 只动 `currentRole`（保留 `initialRole`），`careerGuards.requireCapability` 在操作入口守卫权限，`acceptOpportunity` 返回 E 形状的 transition 记录。但**没有统一的 offer 结构、没有谈判结果、没有老板批准门槛、没有幂等结算约定**——每种转职各写一套，就会长出第二个事件引擎。
- Riley/Architect 提案（PROPOSED）要求转职是“结构化机会事件”，且明确“用现有系统，不另建一套模式”。

本 ADR 把职业转型做成**所有 Career 身份都能复用的基础系统**：一个机会引擎（生成）、一个 offer 结构（呈现）、一套结算规则（接受/拒绝/谈判）、一套权限切换（ADR-006 矩阵）。未来服务全部六种转型（§8），不需要为每种身份转换单独写一套事件引擎。

## 1. 已实现的基础（事实，不重复设计）

下表是写 ADR 之前核实的代码事实；本 ADR **复用**它们，不重写。

| 系统 | 已实现内容（文件） | 本 ADR 的用法 |
|---|---|---|
| 职业网络（workstream G） | `NETWORK_ROLES`（scout / videoAnalyst / analytics / assistantCoach / headCoach / gm；strengthCoach 与 agent 为未来角色 `available: false`）；`generateOpportunities(profile, board, {seed})` 确定性生成（seeded 随机）；`checkRequirements`（minReputation / minExperience / achievements / fromRole）；`acceptOpportunity` 返回新 profile + E 形状 transition 记录（旧工作追加进 `jobs`，永不覆盖）；`dismissalOutcome`（声望 −12、失业、firedCount+1、永不 Game Over）；`recordSliceResult`（判断 ±2 声望）；`reputationStanding`（0–100 分段：≥80 业内闻名 / ≥60 备受尊重 / ≥40 小有名气 / 否则默默无闻）；`opportunityInboxEvents`（生成 inbox 事件，不自建 inbox） | 机会生成与资格检查的基座。§2–§3 在此之上扩展角色与 offer 字段，不替换生成器。 |
| 职业身份与权限（ADR-006 R2/R4） | `CAREER_ROLES`（PLAYER / COACH / GM / GM_COACH）；`identityOf`（缺失即经典 GM+Coach，旧存档不迁移）；`setIdentity`（保留 initialRole，只动 currentRole；同时写 `root.identity` 与 `leagueCareer.role`）；`permissionsFor`（15 项能力矩阵）；`careerGuards.requireCapability`（操作入口守卫，`CareerPermissionError`）；`canDo`（UI 门控，只读） | 转职 = `setIdentity` + 权限集合切换（§5）。不新增能力项。 |
| Career Inbox（workstream A） | `CAREER_INBOX_VERSION = 1`；`INBOX_HISTORY_CAP = 200`；关系轴含 `owner` / `players` / `gm` / `coach` / `media`；事件实例 id（`instanceIdFor`）用于幂等；`createInbox` / `validateCareerInbox` / `buildInboxContext` / `inboxEventMatches` | 机会事件的唯一呈现与结算通道（§7）。不建第二个 inbox。 |
| 承诺引擎（统一） | `settleGamePromises`（`js/career/promiseEngine.js`）是**唯一**结算入口；`settleRebornPromises` 是它的 Reborn 适配器；`markTrustEffectsApplied` 防重复应用信任效果；Inbox 承诺信任 +5/−6、关系 +3/−4（来源特定：Inbox 与 Relationships 各有保留值） | 机会接受时产生的承诺（如“上任第一年进季后赛”）走 `settleGamePromises`，不另建结算引擎（§7）。 |
| 关系（workstream E） | `RELATIONSHIP_KINDS` 含 `owner` / `management`；`LEGACY_EVENT_TYPES` 含 `transition`；`relationshipsStore` / `promisesOf` / `legacyOf`；`NEUTRAL_COACHING_TRUST = 50`；`PROMISE_RELATIONSHIP_START = 50`；谈判步进 `NEGOTIATION_STEP = 1`、`NEGOTIATION_CAP = 2` | 老板信任的记录位置（§6）；transition 事件的记录位置（§8）。 |
| 决定记录（workstream A） | `applyDecision(inbox, state, eventId, choiceId, {gameIndex, year})` 写结构化决定；`validateDecision` / `pendingInstance`；`applyInboxEffects`；history 条目类型 `story-choice` / `promise-settled`（`careerHistory.js`） | 每次转职决定都是一条 `story-choice` 记录（§8）。 |
| 合同（已实现） | `contractOffers.js`：offer 类型带 `privileges`（如 "dynasty-extension" 授予“完全人事决定权”等）；`signOwnContract` 能力为全体角色持有 | 转职合同的条款来源（§6 的合同部分）。不新增合同系统。 |
| 高管进阶（workstream F） | `executiveProgression.js`：`STAGES`（GM → President of Basketball Operations → Minority Owner → Controlling Owner → Sports Mogul → Empire Legacy）；`createExecutiveRecord({reputation = 50, boardTrust = 50})`；`stageFor()` 派生（永不在阈值自动晋升）；`stageOpportunities(exec, ctx)`；`MINORITY_PCT = 5` / `CONTROL_PCT = 51` | 老板信任的数值字段就是 `boardTrust`（0–100，初始 50）。§6 复用它，不新增信任字段。股权阶段走 `stageOpportunities`，不走职业网络（§2.3）。 |

**缺口（本文要补的）**：网络没有 `president` 与 `gmCoach` 角色；没有统一的 offer 结构（含合同与权限变化）；没有谈判（accept / reject / negotiate）结果约定；没有老板批准门槛的定义；`root.identity` 没有 `history` 数组（ADR-006 §3.2 提案过形状，未实现）。

## 2. 机会资格与生成（Proposed）

### 2.1 资格：声望 + 老板信任 + 球队需求（用户 2026-11-14 裁决）

三要素，缺一不可；**数值不写死**（用户裁决：不立即写死数值；未决数值见 §10）。

| 要素 | 来源（复用） | 说明（Proposed） |
|---|---|---|
| **声望** | `reputationStanding` 分段（40 / 60 / 80）+ `checkRequirements.minReputation` | 高级别职位要求高分段。建议方向：总裁/双重身份类 offer 要求“备受尊重”（≥60）以上；具体阈值待定（§10 N1）。 |
| **老板信任** | `boardTrust`（`executiveProgression.js`，0–100，初始 50）+ inbox 关系轴 `owner` | 同一球队内转职沿用现有 `boardTrust`；跨球队 offer 需要对方球队的信任起点（新球队信任低 → offer 更稀有）。批准线数值待定（§10 N2）。 |
| **球队需求** | 赛季状态提供的职位空缺板（`board`，调用方传入） | 空缺必须是真实的：总裁离任、主教练空缺、老板换人等世界/时间线事件产生的空缺，**不是凭空生成**。历史时间线里的真实换帅/换管理层节点优先。 |

### 2.2 生成：复用 `generateOpportunities`，不重写生成器

- 生成器保持确定性：同一 profile + board + seed → 同一批 offer（seeded 随机只用于排序，不用于决定资格）。
- 资格检查复用 `checkRequirements`（minReputation / minExperience / achievements / fromRole）；`missing` 字段原样展示给玩家（为什么不够格，要说清楚）。
- 网络可达性规则复用现有逻辑：入口角色、feeder 角色、或声望 ≥75 可跳级。
- 失业 profile 仍得低级别 offer（`dismissalOutcome` 规则：被解雇不是 Game Over；`unemployedNote` 原样保留）。
- **新增**：board 必须能包含高管与双重身份空缺（`president` / `gmCoach`），见 §2.3；生成频率与刷新时机未决（§10 N3）。

### 2.3 网络扩展：`president` 与 `gmCoach`（Proposed）

向 `NETWORK_ROLES` 增加两个角色（其余角色与 `from` 边不动）：

| 角色 | entry | from（可到达它的上游角色） | 说明 |
|---|---|---|---|
| `president`（篮球运营总裁） | false | `headCoach`、`gm` | 管理层高管身份。对应高管进阶的 President of Basketball Operations 阶段，但**角色**与**阶段**是两个视图：角色回答“你现在是什么人”（权限），阶段回答“你在帝国线上的位置”（派生，`stageFor`）。 |
| `gmCoach`（总经理兼主教练 / Architect 身份） | false | `headCoach`、`gm`、`president` | 双重身份。不是独立引擎，是 `GM` 权限集 + `COACH` 权限集的并集（ADR-006 矩阵的 GM_COACH 列）。 |

**明确不扩展**：股权阶段（小股东 → 控股 → 商业帝国）**不是**网络角色，走 `executiveProgression.stageOpportunities`（所有权机会），不在本 ADR 的 offer 生成里。这是 Riley 提案的边界：Riley 覆盖不了股权段（`career-2.0-architect-riley-proposal.md` §8）。

## 3. 结构化 Offer Schema（Proposed）

在 `generateOpportunities` 现有 offer 形状上**加字段**，不替换现有字段（`id` / `role` / `team` / `level` / `titleZh` / `titleEn` / `eligible` / `missing` / `networked` / `risk` / `order` 全部保留）：

```js
// Proposed ONLY — additive fields on the existing offer shape.
offer = {
  ...existingOfferFields,
  contract: { years: null, salary: null, privileges: [] }, // 来自 contractOffers.js 的条款；years/salary 数值待定
  permissionDelta: { gained: [], lost: [] },               // 按 ADR-006 矩阵算出的能力变化（见 §5）
  ownerTrustRequired: null,   // 本 offer 要求的 boardTrust 门槛（数值待定，§10 N2）
  dualRoleOffer: false,       // 是否为双重身份 offer（兼任邀请）
  expiresAfterSeason: null,   // offer 有效期（赛季数，待定；过期未决 = 拒绝）
  cultureNote: null,          // 目标球队文化现状的提示（Team Culture 是 Proposed，见 §9；未实现前为 null）
}
```

## 4. 接受 / 拒绝 / 谈判（Proposed）

三种结果都是**结构化决定**，经 `applyDecision` 一次结算（§7），写入 `story-choice` 历史。

| 结果 | 语义（Proposed） |
|---|---|
| **接受（accept）** | 执行 §5 的权限切换 + §6 的合同签署 + §8 的历史记录。旧工作追加进 `jobs`（`acceptOpportunity` 现有行为，永不覆盖）。接受后进入新身份，旧身份权限按 §5 收回。 |
| **拒绝（reject）** | 留在原身份，无惩罚。Offer 关闭；是否进入冷却期、冷却多久，未决（§10 N4）。拒绝本身记一条决定（`choiceId: "decline"`），不是“什么都没发生”。 |
| **谈判（negotiate）** | 玩家提反条件：最常见的是**兼任要求**（“给我双重身份我才接受”）、更长合同、更大权限（如“完全人事决定权”）。谈判复用关系系统的步进约束（`NEGOTIATION_STEP = 1`、`NEGOTIATION_CAP = 2`：最多两轮）。每轮谈判重新检查资格：兼任要求需要更高的 `boardTrust`（数值待定）。谈判成功 → offer 升级为新版本（重新结算一次）；谈判失败 → offer 关闭（按拒绝处理，记决定）。谈判不新增掷骰：成功与否由资格检查决定，不是由随机数决定。 |

**工作示例（用户 2026-11-14 给出的设计示例，本文收录为范例，不代表已实现）**：

> CAREER OPPORTUNITY — 迈向管理层
>
> 你的执教成绩吸引了一支正在重建的球队。老板希望你担任篮球运营总裁，但需要你交出临场指挥权。
>
> - **接受总裁职位**：获得交易、选秀与管理权限；失去临场执教权限。
> - **拒绝邀请**：保留当前执教职位，继续积累声望。
> - **提出兼任要求**：需要更高的老板信任，可能被拒绝。

## 5. 角色与权限切换（Proposed，复用 ADR-006）

转职 = 身份戳记切换 + 权限集合切换。**不新增能力项**，只按现有 15 项矩阵重组。

| 转职 | 获得 | 失去 | 比赛形态 |
|---|---|---|---|
| `COACH → GM`（接受总裁/总经理职位） | `trade` / `signFreeAgent` / `release` / `draft` / `allocateDevelopment` | `commandGame` / `setRotation` / `teamTraining` / `setTrainingFocus` | 自动模拟 + 观战（ADR-006 Q2：GM 不自动获得教练临场权限） |
| `GM → GM_COACH`（兼任邀请） | 加回教练组权限（`commandGame` / `setRotation` / `teamTraining` / `setTrainingFocus`） | —（承担 §7 风险，见 Riley 提案 §7） | 完整双权限 |
| `GM_COACH → GM`（卸任主教练） | — | 收回教练组权限；轮换与训练委托 AI 教练（委托机制是 ADR-006 §3.5 后续项，行为待定） | 自动模拟 + 观战 |
| `GM → COACH`（回任主教练） | 加回教练组权限 | 失去 GM 组权限（`trade` / `signFreeAgent` / `release` / `draft` / `allocateDevelopment`），保留 `suggestTrade` / `suggestDraft` | 亲自指挥 |
| `PLAYER → COACH` 等球员线转职 | 不在本 ADR 范围，走 ADR-005 体系；本 ADR 的机会引擎可复用，但权限切换按球员线规则另行定义 | — | — |

**实现约束（继承 ADR-006 R4）**：
- 身份戳记用 `setIdentity`（保留 `initialRole`，只动 `currentRole`；同时写 `root.identity` 与 `leagueCareer.role`，两者永不一致）。
- 权限切换的唯一生效点是操作入口的 `requireCapability`；UI 门控用只读的 `canDo`。藏按钮不等于权限控制。
- `career.role`（已 stamp 的生涯）优先于 `identityOf(root)`；无戳记的旧存档仍读作经典 GM+Coach。

## 6. 合同影响与老板信任（Proposed，复用现有字段）

### 6.1 合同

- 每次转职签署**新合同**：年限、薪资、权限条款（`privileges`，复用 `contractOffers.js` 的条款形状，如“完全人事决定权”）。旧合同结束，记入 transition 记录。
- 合同条款可以是谈判对象（§4）：年限、薪资、权限授予都能谈，但每项谈判受步进约束（最多两轮）。
- 所有角色都持有 `signOwnContract`（签自己的雇佣合同）；球队业务合同（交易/签约/裁人）仍是 GM 权限。
- 合同年限与薪资的数值、谈判对数值的具体影响，未决（§10 N5）。

### 6.2 老板信任（`boardTrust`）

- 老板信任的数值字段就是 `boardTrust`（`executiveProgression.js`，0–100，初始 50）。**不新增信任字段。**
- 批准规则：offer 的 `ownerTrustRequired` 门槛与当前 `boardTrust` 比较；不够 → offer 不生成（或生成为不可接受状态并展示 `missing`，与 `checkRequirements` 的展示规则一致）。
- 信任按球队计：同一球队内转职沿用现有值；跨球队时新球队的 `boardTrust` 从初始值起算（信任是老板对“你这个人 + 这支球队”的判断，Riley 提案 §5）。
- 信任会浮动：战绩、交易结果、更衣室事件、承诺兑现/违约（承诺引擎的信任效果）都会动它；跌破线 → 可能被收回兼任或解雇（§7 失败结果）。
- 信任阈值数值未决（§10 N2）。

## 7. 资格、权衡与失败结果（Proposed）

- **资格**：§2.1 三要素（声望 + 老板信任 + 球队需求）。数值未决（§10 N1/N2）。
- **权衡**：双职的代价是真实机制 + 叙事压力（用户 2026-11-14 裁决），不是只有文案：同时负责交易与执教增加球员利益冲突；最终交易决定权可能影响更衣室信任；连续战绩不佳同时损害执教声望与管理层信任；老板可能要求放弃其中一个职位。代价的具体机制（工作负荷数值、董事会压力事件、委托 AI 的行为）未决（§10 N6）。
- **失败结果**：
  - Offer 被拒/撤回 → 留在原身份，无惩罚（冷却期未决）。
  - 兼任被收回 → GM+Coach → GM（§5）。
  - 被解雇 → 不是 Game Over：`dismissalOutcome`（声望 −12、失业、firedCount+1）+ 低级别 offer 回退（`generateOpportunities` 的 `unemployedNote`）。
  - 文化崩塌 → 组织稳定性维度大跌（Team Culture 是 Proposed，见 §9）。

## 8. 职业历史持久化（Proposed，复用 E 的形状）

- **Transition 记录形状**：沿用 `acceptOpportunity` 已返回的 E 形状并加字段（additive）：
  ```js
  transition = {
    from, fromTeam, to, toTeam, year, reason,   // 已实现（E 形状）
    contract: { years, salary, privileges },    // Proposed，来自 §3 offer.contract
    permissionDelta: { gained, lost },          // Proposed，来自 §3 offer.permissionDelta
    choiceId,                                    // Proposed，本次决定的 choice（如 accept / decline / negotiate-dual）
  }
  ```
- **记录位置**：transition 事件记入 workstream E 的 legacy store（`LEGACY_EVENT_TYPES` 已含 `transition`）；决定本身记入 inbox history（`story-choice` 条目，经 `applyDecision`；`INBOX_HISTORY_CAP = 200`）。
- **身份历史**：采用 ADR-006 §3.2 已提案的形状——`root.identity.history`（additive 可选数组，`[{ role, teamId, startYear, endYear }]`，只追加）。该字段**目前未实现**；本 ADR 激活它作为机会转职的持久化位置（旧存档缺失即无历史，不迁移、不重写）。
- **资产归属**（用户 2026-11-14 裁决）：

  | 资产 | 归属 |
  |---|---|
  | 个人声望 | 玩家职业档案（跨身份折算带走） |
  | 球员关系 | 玩家与具体球员（部分带走，见 Riley 提案 §5） |
  | 老板信任 | 玩家与具体球队管理层（按球队计，不跨球队携带） |
  | Team Culture | 球队长期状态（留在原队，见 §9） |
  | Architect 身份 | 当前职位与权限（`currentRole`） |
  | Architect Legacy | 玩家职业历史（`identity.history` + legacy 记录） |

## 9. 幂等事件结算（Proposed，复用现有机制）

- **唯一结算入口**：机会决定经 `applyDecision` 结算一次；决定产生的承诺经 `settleGamePromises` 结算一次。**不引入第二个承诺、关系或事件结算引擎。**
- **幂等键**：复用 inbox 的事件实例 id（`instanceIdFor`）+ `pendingInstance` / `validateDecision`：同一 offer 实例只能结算一次；重载、重放、重试不得重复应用信任效果与权限切换。信任效果的重复应用防护复用 `markTrustEffectsApplied`。
- **结算顺序**：决定 → 权限切换（`setIdentity`）→ 合同签署 → transition 记录 → 承诺创建（如有）。任一步失败 → 整个决定不提交（不出现“权限切了但合同没签”的半态）；失败原因记入决定记录，不静默吞掉。
- **重放安全**：`generateOpportunities` 是确定性的（seeded）；同一 seed 下重复生成不得产生重复 offer 实例（`id` 去重，`job.id || role-team`）。

## 10. 与现有存档的兼容性（Proposed）

- **只加可选字段**：`identity.history`（additive 可选）、offer 的新增字段（运行时数据，不进存档）、transition 记录的加字段（E 的 legacy store 已接受未知字段）。**不升存档版本，不写迁移。**
- **旧存档**：无 `identity` → `identityOf` 读作经典 GM+Coach（ADR-006 Q1）；无 `history` → 无历史，不补写。`validateRoot` / `validateManagement` 已接受未知字段；`compactRootForStorage` 透传。
- **经典解锁路径不变**：Architect 卡的经典解锁（完成完整 Coach + GM 生涯，`careerAchievements` 派生）不受本 ADR 影响；机会路径是新增的并行入口，不是替换。
- **网络旧 profile**：`emptyNetworkProfile` 的形状不变；`president` / `gmCoach` 只出现在 `NETWORK_ROLES` 的新增条目里，旧 profile 的 `currentRole` 不受影响。

## 11. 与 Team Culture 的交互（Proposed，Culture 本身未实现）

- Team Culture 是球队资产，不是玩家资产（用户 2026-11-14 裁决；Riley 提案 §6：三维度 0–100，初始中性 50；增量与衰减待平衡实验）。
- **转职不移动文化**：玩家离开球队，已建立的文化留在原队；同一球队内转职，文化继续积累。
- **机会引擎在文化实现前不得依赖文化**：在 Team Culture 落地之前，offer 生成不得以文化维度作为资格条件；`offer.cultureNote` 保持 `null`。
- **未来挂钩（未决，§10 N7）**：文化实现后，组织稳定性维度可作为双重身份 offer 的生成输入之一（如高稳定性球队更愿意给兼任），但这需要单独的设计决定，不在本 ADR 里定。

## 12. 复用范围：六种转型（用户 2026-11-14 定稿）

本 ADR 的机会引擎未来服务全部六种转型，不为每种单独写一套事件引擎：

1. 球员退役后成为教练（走 ADR-005 体系，机会引擎可复用）。
2. 助理教练晋升主教练（网络已有 `assistantCoach → headCoach` 边）。
3. 主教练转任 GM（新增 `headCoach → president` / `gm` 路径）。
4. GM 被邀请兼任主教练（新增 `gm → gmCoach` 路径）。
5. 管理层被解雇后重新执教（`dismissalOutcome` + 低级别 offer 回退）。
6. 总裁获得股权机会（走 `executiveProgression.stageOpportunities`，不是网络 offer）。

## 13. 非目标（本文明确不做）

- 不建第二个 inbox、第二个承诺引擎、第二个关系系统、第二个事件结算引擎。
- 不新增权限能力项（15 项矩阵不变）。
- 不改经典解锁路径、不改存档结构、不升版本。
- 不把 Riley 的历史案例扩展进所有权/帝国系统（Riley 提案 §8）。
- 不定任何数值（见 §14）。
- 不实现球员线转职的权限细节（走 ADR-005 体系）。

## 14. 未决数值决定（需要批准后才能实施）

| # | 数值 | 现状 / 建议方向 |
|---|---|---|
| N1 | 声望阈值：总裁/双重身份 offer 要求的声望段位 | 建议方向：复用 `reputationStanding` 分段（40/60/80），总裁类要求“备受尊重”（≥60）以上；具体值待定。 |
| N2 | 老板信任阈值：`ownerTrustRequired`（同一球队内 vs 跨球队） | 建议方向：同一球队内低于跨球队；具体值待定。 |
| N3 | Offer 生成频率与刷新时机：board 多久刷新一批空缺、赛季内哪几个节点生成 | 待定。建议：与赛季日历节点（休赛期、交易截止日、换帅事件）挂钩，不做无意义的高频刷新。 |
| N4 | 拒绝冷却期：拒绝一个 offer 后多久不再生成同类 offer | 待定。建议：至少一个赛季，且不惩罚。 |
| N5 | 合同数值：年限、薪资范围、谈判对数值的具体影响 | 待定。建议：复用 `contractOffers.js` 的现有档位，不新制定价表。 |
| N6 | 双职代价机制：工作负荷数值、董事会压力事件频率、委托 AI 教练的行为规则 | 待定。建议：先定性（利益冲突、信任双损、老板可收回兼任），数值单独立项。 |
| N7 | Team Culture 挂钩：组织稳定性是否作为双重身份 offer 的生成输入 | 待定，且依赖 Team Culture 先实现（Riley 提案 §6；增量与衰减待平衡实验）。 |
| N8 | `identity.history` 的实现方式：直接写 additive 字段，还是从 E 的 legacy transition 记录派生 | 待定。建议：按 ADR-006 §3.2 的形状直接写 additive 字段（简单、可审计）；派生方案作为备选。 |
