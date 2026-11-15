# ADR-011：Career Opportunity（职业机会系统）

- **状态**：🟡 PROPOSED（提案，未批准，未实现）。本文是一份设计 ADR，不是执行入口。
- **2026-11-15 产品评审**：7 条设计原则已批准（见 §15）；**实现未批准**。评审要求的对账（§16 事实更正、§17 最小可执行权限契约、§18 角色历史与完成规则、§19 root/account 重放与幂等、§20 遗留问题）已补入本文，等待实现批准。
- **编号与另一份草稿**：ADR-011 编号已被本文占用（`5e349c1`，在 main 上）。Code 曾在本地写过一份同路径的独立草稿（`3b1eb2e`，**从未推送**），现已作废，保存在本地分支 `local/adr011-draft-superseded`；其中仍有效的内容已并入本文 §16–§20，不另开 ADR。
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
| `COACH → GM`（接受总裁/总经理职位） | `trade` / `signFreeAgent` / `release` / `draft` / `allocateDevelopment` | `commandGame` / `setRotation` / `teamTraining` / `setTrainingFocus` / `suggestTrade` / `suggestDraft`（6 项全列：教练组权限含建议权） | 自动模拟 + 观战（ADR-006 Q2：GM 不自动获得教练临场权限） |
| `GM → GM_COACH`（兼任邀请） | 8 项全列：`commandGame` / `setRotation` / `teamTraining` / `setTrainingFocus` / `suggestTrade` / `suggestDraft` / `takeover` / `personalTraining` | —（承担 §7 风险，见 Riley 提案 §7） | 完整双权限 |
| `GM_COACH → GM`（卸任主教练） | — | 8 项全列：`takeover` / `personalTraining` / `commandGame` / `setRotation` / `teamTraining` / `setTrainingFocus` / `suggestTrade` / `suggestDraft`；轮换与训练委托 AI 教练（委托机制是 ADR-006 §3.5 后续项，行为待定） | 自动模拟 + 观战 |
| `GM → COACH`（回任主教练） | 6 项全列：`commandGame` / `setRotation` / `teamTraining` / `setTrainingFocus` / `suggestTrade` / `suggestDraft`（含建议权——GM 本不持有，是获得不是保留） | 失去 GM 组权限（`trade` / `signFreeAgent` / `release` / `draft` / `allocateDevelopment`） | 亲自指挥 |
| `PLAYER → COACH` 等球员线转职 | 不在本 ADR 范围，走 ADR-005 体系；本 ADR 的机会引擎可复用，但权限切换按球员线规则另行定义 | — | — |

**差分口径（`permissionDelta` 的算出值）**：`permissionDelta = permissionsFor(新身份) − permissionsFor(旧身份)`，按 `js/career/careerIdentity.js` 的 15 项矩阵算出，上表列的是完整差分。`GM_COACH` = 全部 15 项，所以凡是进出 `GM_COACH` 的差分都含球员侧两项（`takeover` / `personalTraining`）——它们随经典身份一并获得/收回，不是教练组权限。

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

> ⚠️ **2026-11-15 更正（见 §16 F2、§20 D3）**：`boardTrust` 只存在于 GM 商业场景（`attachToCareerRoot` 写到 `root.story.executive.boardTrust`，只有 `gmBusinessView` 会挂上去）。真实的穿越执教存档里，解雇、赛季目标、财务、挖角读的都是 `root.story.frontOfficeTrust`（0–100）。下文把老板信任写成 `boardTrust` 的地方，在 D3 裁决前不得按字面实现。

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
- **重放安全**：`generateOpportunities` 是确定性的（seeded）；同一 seed 下重复生成不得产生重复 offer 实例——**这是实现要求，不是现状**：当前 `generateOpportunities`（`js/career/network/careerOpportunities.js:113`）只用 `job.id || role-team` 生成 id，不做去重；board 里两个同 role+team 且无 `job.id` 的空缺会产出相同 offer id。落实现时需补 id 去重，或由 board 保证 id 唯一；去重不得改变资格判定与排序（rng 只用于排序）。

## 10. 与现有存档的兼容性（Proposed）

- **只加可选字段**：`identity.history`（additive 可选）、offer 的新增字段（运行时数据，不进存档）、transition 记录的加字段（E 的 legacy store 已接受未知字段）。**不升存档版本，不写迁移。**
- **旧存档**：无 `identity` → `identityOf` 读作经典 GM+Coach（ADR-006 Q1）；无 `history` → 无历史，不补写。`validateRoot` / `validateManagement` 已接受未知字段；`compactRootForStorage` 透传。
- **经典解锁路径不变**（→ 2026-11-15：解锁**条件**仍不变，但“一段生涯算什么角色”的计数口径已批准改为按实际角色历史，见 §18；实现前代码行为不变）：Architect 卡的经典解锁（完成完整 Coach + GM 生涯，`careerAchievements` 派生）不受本 ADR 影响；机会路径是新增的并行入口，不是替换。
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

---

# 2026-11-15 产品评审与对账（Code）

> 对账基线：`origin/main` = `f1548f1`（2026-11-15）。GitHub 访问已经恢复，走的是公司文档规定的系统代理（`sysproxy`），没用隧道。本节**只改文档**，不动生产代码、存档 schema、解锁条件和 `GameSim`。

## 15. 已批准的设计原则（2026-11-15）

| # | 原则 | 落到本文的位置 |
|---|---|---|
| A1 | Architect 保留为可玩的双权威身份（`GM_COACH`） | §5、§17 |
| A2 | 传承称号的显示名改为 **造队宗师 / Master Builder**，稳定 id `architect` 不变 | §18.5 |
| A3 | 职业完成按**实际角色历史**计，不再只看退休时的角色 | §18.3 |
| A4 | 一个 `GM_COACH` 赛季不能被算成两段独立完成的生涯 | §18.3 |
| A5 | 所有数值保持临时，等固定种子平衡实验后再定 | §14、§20 |
| A6 | 复用现有 Inbox、关系、事件日志、存档机制 | §19 |
| A7 | 不引入第二个机会引擎或承诺引擎 | §17、§19 |

## 16. 事实更正（写本文之后 main 上的代码变化）

`5e349c1` 是基于 2026-11-14 的代码写的。之后 main 合入了 ADR-006 的 R1/R6/R7，下面几条事实已经变了：

| # | 原文说法 | 现在的代码事实 | 影响 |
|---|---|---|---|
| F1 | 合同权限（privileges）只是显示用 | **R6 已实现**（`d33b39a`）：`PRIVILEGE_GRANTS` 和 `grantsForPrivileges()`（`contractOffers.js`）把条款映射成能力 id；`leagueCareer.grants` 存放当前合同的授权；`careerGuards.effectivePermissions()` = 角色矩阵 ∪ grants；`requireCapability` 和 `canDo` 都按它判断；签新合同、开新任期都会**重写** grants（新合同就是新工作）。 | 转职的权限切换必须同时重算 grants（§17 C3），不能只调 `setIdentity`。 |
| F2 | 老板信任 = `boardTrust` | `boardTrust` 只在 `root.story.executive` 里，并且只有 GM 商业视图会挂上去。执教存档的解雇（`resolveFiringReason`）、赛季目标、财务、挖角，读的都是 `story.frontOfficeTrust`。 | 需要裁决用哪个（§20 D3）。 |
| F3 | `identity.history` 未实现 | **校验已实现**（R1，`86497e8`）：`validateRoleIdentity` 接受可选的 `history` 数组，每条只要求 `role` 是已知角色（多余字段放行）。**但全仓库没有任何代码写它**。 | §18 的写入规则可以直接落在现有校验之上，不用改 schema。 |
| F4 | `setIdentity` 只改 `currentRole` | 它把 `identity` **整个重建**成 `{ initialRole, currentRole }`，会**丢掉** `history` 和入口写入的 `prestige: "architect"`。今天没出问题，只是因为它只在生涯创建时调用一次（`timeTravelCareer.js:291`、`rebornView.js:162`）。 | 转职是第二次调用，如果不先修就会抹掉历史和 prestige（§17 C4）。 |
| F5 | （原文未提）R7 | Player Reborn 已接入身份系统（`feaa0c6`）：没有戳记、有 `root.reborn`、没有 `leagueCareer` 时推导为 `PLAYER`。 | PLAYER 不在本文的转职边里（§17 C8）。 |
| F6 | transition 写入 legacy store | `recordCareerTransition` 已存在，按 id 去重，但**至今没有任何调用方**；挖角、续约、再就业也都不写账号层传承。 | 本文的结算会是它的第一个调用方（§19）。 |
| F7 | `generateOpportunities` 是确定性的 | 确定性没错。id 不去重的问题原文 §9 已经写成实现要求（`6b73007`），Muse 已独立复核。 | 不变。 |

## 17. 最小可执行的角色权限契约

只用现有的 15 项能力矩阵和 R6 grants，不新增能力项。每条都要有一个**负向测试**：被禁止的操作必须在引擎入口抛错，光藏按钮不算。

| # | 契约 | 依据 / 检查点 |
|---|---|---|
| C1 | **唯一写入点**：`currentRole` 只能在 (a) 生涯创建 和 (b) 机会结算 两个地方改；没有菜单式的自由切换。 | `setIdentity` 的调用方清单（目前只有 2 个） |
| C2 | **有效能力** = `permissionsFor(role)` ∪ `leagueCareer.grants`，即 `effectivePermissions`。引擎入口一律用 `requireCapability`（目前 11 处：`leagueCareer.js` 7、`seasonMarket.js` 1、`playerDevelopment.js` 1、`reborn/training.js` 1、`reborn/takeover.js` 1）；UI 只用 `canDo`。 | 已实现 |
| C3 | **转职就是换工作**：接受后 `grants = grantsForPrivileges(offer.contract.privileges)`，旧 grants 一律作废，同队转职也一样。这和 R6 的“新合同 = 新工作”是同一条规则。 | R6 规则 |
| C4 | **`setIdentity` 必须保留其余字段**：只改 `currentRole`（首次调用时设 `initialRole`），`history`、`prestige` 原样带过去。这是实现前必须先修、并配回归测试的问题（F4）。 | 新增要求 |
| C5 | **只在休赛窗口转职**：赛季第一场之前（沿用挖角的 `poachWindowOpen` 规则）。这样一场正在进行的比赛（含 takeover）不会中途换权限。 | 挖角已有先例 |
| C6 | **网络角色到身份的映射**是固定表：`headCoach → COACH`，`gm` 和 `president → GM`（总裁是头衔，能力等同 GM），`gmCoach → GM_COACH`。网络里的入门角色（scout 等）不是 `CAREER_ROLES`，不在本契约内。 | 原文 §2.3 缺了这张表 |
| C7 | **失去执教权之后的比赛**：进入 GM 或从 `GM_COACH` 退到 GM 后，`commandGame` 和 `setRotation` 消失，比赛走现有的模拟与观战（ADR-006 Q2）。“AI 教练按什么规则委托”不在 v1，属于 N6。 | ADR-006 Q2 |
| C8 | `PLAYER` 进出都不在本文（ADR-005）。 | R7 |

**边表的缺口（§20 D7）**：原文 §5 有 COACH→GM、GM→GM_COACH、GM_COACH→GM、GM→COACH，但**没有** COACH→GM_COACH 和 GM_COACH→COACH。可 Riley 提案 §2.1(b) 写的就是“执教生涯进行中收到总裁/双重身份 offer”，即 COACH→GM_COACH。这两条边要么补进表，要么明确写“不支持”。

## 18. 角色历史：迁移与完成规则

### 18.1 存储形状（落在 R1 已有校验之上，不改 schema）

```js
root.identity.history = [   // 只追加；旧存档没有这个字段
  { role, teamId, startYear, endYear /* null = 当前 */, seasons, via /* "initial" | "opportunity:<instanceId>" */ },
];
```

R1 校验只检查 `role`，其余字段属于 additive，旧版本读到也会放行。

### 18.2 写入规则与旧存档

- 生涯创建时写第一段（`via: "initial"`）；转职结算时关闭当前段（填 `endYear`、`seasons`），同时追加新的一段。这些都和 `setIdentity`、grants 重置**在同一个 root 对象里**完成（§19）。
- 换队但不换角色（挖角、再就业）：同样关闭旧段、开一段新的，这样履历里有球队信息。挖角现有代码不写这个字段，接上它属于实现工作。
- `seasons` = 这段任期内完成的赛季数，用 `careerPerformance(root).seasons` 在开段和关段时的差值算。
- **旧存档不迁移**：没有 `history` 时，提供只读派生函数 `roleHistoryOf(root)`：一段，`role = identityOf(root)`，赛季数取现有的 `coach.stints` 加当前任期。**永不回写**，和 `identityOf` 的 Q1 规则一样。

### 18.3 完成规则（A3、A4）

- `completionFromRoot` 保留现有的 `role` 字段（结局时的角色，博物馆用），另外**新增** `roleSeasons: { COACH, GM, GM_COACH }`，由 `history` 汇总；旧生涯用 `roleHistoryOf` 派生。
- **经典解锁的资格**：
  - 教练一半：某条完成记录 `roleSeasons.COACH ≥ Q`。旧记录没有 `roleSeasons` 的，按原来的 `role === "COACH"` 判定。
  - GM 一半：同理，用 `roleSeasons.GM`。
  - `GM_COACH` 赛季**不计入任何一半**（A4：一个双职赛季不能变成两段生涯）。
- `Q` 是临时数值（A5，§20 N9），平衡实验前**不写进代码**。
- **一段生涯能不能同时满足两半**（例如前 6 年 COACH、后 6 年 GM），这是 §20 D1 的待决问题。建议：一条完成记录最多满足一半，取赛季数更多的那个角色，平局时取结局角色。这样保住经典路径“两段生涯”的本意，同时也没有重复计算任何一个赛季。
- 现有记录**不重算、不回写**；口径变化只影响新写入的记录，加上读旧记录时的兼容分支。

### 18.4 prestige 与 Architect 身份

- `prestige: "architect"` 只代表“从 Architect 入口开局”。通过机会转入 `GM_COACH` 的生涯**不会**带这个标记。
- “传奇掌舵者 / Dynasty Master”和“篮坛不朽传奇 / Basketball Immortal”两个称号今天只认 `prestige === true` 的完成记录。机会路径进入的 Architect 生涯算不算，是 §20 D2 的待决问题。这一轮不改解锁条件。

### 18.5 称号改名（A2）

- `ARCHITECT_TITLES.architect` 的显示名从“王朝缔造者 / The Architect”改成**“造队宗师 / Master Builder”**；内部 id `architect` 不变。
- 称号是派生的、不进存档，所以不需要数据迁移。
- 需要改的地方要区分**称号**和**身份名**两种用法：
  - 称号用法（要改）：`ARCHITECT_TITLES.architect`（`careerAchievements.js:58`）；`careerEntry.js:111-112` 的三称号列表“The Architect · Dynasty Master · Basketball Immortal”；断言称号显示名的测试 `myWorldArchitectTitles`（4 处）、`legacyMuseum`（6 处）、`gmOwnership`（1 处）。
  - 身份名用法（不改）：`careerEntry.js` 里“The Architect 尚未解锁 / 已解锁”“以 The Architect 的身份穿越回历史”，以及 `legacyMuseum` 的注释。
- 顺带消除一处重名：`executiveProgression.js:164` 的 GM 遗产评级也叫“王朝缔造者”（英文是 Dynasty Builder），和旧称号撞名；改名后就不冲突了，那里本身不用动。
- 身份名继续叫 Architect。

## 19. root / account 的重放与幂等

**原则**：root 是职业状态的唯一真相；账号层的镜像是派生出来、可以重建的。反过来不行，账号数据不能驱动 root 的角色。

| 层 | 幂等键 | 已有机制 |
|---|---|---|
| K1 offer 实例 | Inbox `instanceIdFor`；`generateOpportunities` 的 id 去重按原文 §9 实现 | Inbox |
| K2 决定 | `pendingInstance` / `validateDecision`：同一实例只能结算一次，结算后状态为终态 | `applyDecision` |
| K3 root 事件日志 | `story.eventLog` 追加 `{ type: "opportunity-settled", instanceId, outcome, year }`；结算前先查有没有 | 与 `reputation-settled`、`finances-settled` 同一模式 |
| K4 账号传承 | `recordCareerTransition(account, { id: "opportunity:<instanceId>", … })`；`appendLegacyEvent` 按 id 去重 | 已有，尚无调用方（F6） |
| K5 完成记录 | `careerId` 去重 | 已有 |
| K6 信任效果 | `markTrustEffectsApplied` | 已有 |

**一次结算的执行步骤（一个纯函数，一次落盘）**：

1. 在内存里依次完成：校验窗口和实例 → `setIdentity`（按 C4 保留其他字段）→ 重置 grants（C3）→ 写合同 → 关闭并追加 history 段 → 追加 K3 事件 →（如有）创建承诺。
2. 一次 `writeRootSave`。
3. 再写账号镜像（K4）。

任何一步抛错，整个结算都不提交，不会出现“权限换了但合同没签”的半成品。

**崩溃窗口**：root 和 account 是两个独立的存储，可能出现“root 写了、account 没写”。处理办法：加载时跑一个调和函数 `replayCareerMirror(root, account)`，扫描 K3 事件，补写缺失的 K4 传承；K4 按 id 去重，所以重复补写也安全。**不引入事务或两阶段提交。**

**offer 存在哪里**：用 `root.careerInbox` 的 pending 实例（A6：复用 Inbox；R1 已有 `validateCareerInbox`）。现在 `careerInbox` 只被演示切片驱动，把它接到真实生涯上属于实现工作。原文 §10 说 offer 字段“不进存档”，这和“关闭游戏后 offer 仍要可接受”冲突：offer 正文必须跟着 pending 实例一起持久化（§20 D4）。

## 20. 遗留决定

### 20.1 Code 本地草稿 §17 的 7 个问题，逐条对照

| # | 原问题 | 现状 |
|---|---|---|
| 1 | 称号名 | ✅ 已批准（A2） |
| 2 | 续约 / 挖角 / 再就业要不要迁进新 schema | **待决（D5）**。建议不迁移，保留各自已校验的存档形状，只做只读适配器 |
| 3 | 完成口径 | 原则已批准（A3/A4）；剩下 D1、N9 |
| 4 | 谈判会不会产生承诺 | **与原文冲突（D6）**：原文 §4 允许接受时产生承诺（例如“第一年进季后赛”），但 `PROMISE_KINDS` 里没有这类目标。建议 v1 不新增承诺种类，老板期望走 `seasonGoals` |
| 5 | grants 要不要进 `canDo` | ✅ **已关闭**：R6 已实现（F1），转职直接复用（C3） |
| 6 | Team Culture 存在哪 | 不阻塞，跟原文 §11 一致：文化实现前机会生成不依赖它。存放位置建议账号层、按 franchise 键（因为换任期时 root 里的生涯会重建），由 Culture ADR 决定 |
| 7 | v1 开放哪些边 | **待决（D7）**，见 §17 末尾 |

### 20.2 需要裁决的问题（实现前必须定）

| # | 决定 | 建议 |
|---|---|---|
| D1 | 一段生涯能否同时满足教练和 GM 两半 | 不能：最多一半，取赛季数多的角色 |
| D2 | 机会路径进入的 Architect 生涯能否获得 传奇掌舵者 / 篮坛不朽传奇 | 建议以 `roleSeasons.GM_COACH ≥ Q` 作为“Architect 生涯”；是否改称号条件单独批准 |
| D3 | 老板信任用哪个字段 | `story.frontOfficeTrust`（所有生涯都有，所有消费者都在读）；`executive.boardTrust` 留给 GM 商业场景 |
| D4 | offer 正文是否持久化 | 是，随 `careerInbox` pending 实例一起持久化 |
| D5 | 旧三种机会流程要不要迁移 | 不迁移，只做只读适配器 |
| D6 | 接受时能不能产生新承诺 | v1 不能；老板期望走 `seasonGoals` |
| D7 | 补不补 COACH↔GM_COACH 两条边；v1 开放哪些 | 补；v1 先开 Riley 有史实先例的 4 条：COACH→GM_COACH、GM→GM_COACH、GM_COACH→GM、COACH→GM |

### 20.3 数值（A5：固定种子平衡实验前不写死）

在原文 N1–N8 之外新增一项：

| # | 数值 | 说明 |
|---|---|---|
| N9 | `Q`：一个角色至少多少赛季才计入经典解锁的那一半 | 用固定种子的长生涯模拟定 |

### 20.4 实现批准后的第一步（建议顺序）

先修 F4（`setIdentity` 保留字段）并配回归测试，再写 `roleHistoryOf` 的只读派生，最后才碰机会结算。理由：前两步不改变任何现有行为，但是后面所有步骤的前提。
