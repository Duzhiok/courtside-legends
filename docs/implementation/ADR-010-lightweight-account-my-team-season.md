# ADR-010 — 轻量账号 + My Team Season（用自己抽到的球员打完整赛季）

状态：**APPROVED WITH MODIFICATION**（2026-11-07 产品负责人裁决，见 §12；仅 T1 设计已出，T2–T4 未启动；不改账号、不写 GitHub、不动经济、不动 GameSim）
日期：2026-11-07 ｜ 关联：ADR-008（四空间导航）、ADR-008a（存档归属）、ADR-009（Hometown）
本文件不是新路线图：所有工作包映射到现有 M 编号（§8）。

## 0. 决定摘要

1. **My Team Season 做**：账号永久收藏的球员，除了排位，也能打常规赛 + 季后赛 + 争冠。这是 My Team 最大的玩法缺口。
2. **账号保持轻量**：不做邮箱/短信/找回密码。游客优先，本地账号照旧。
3. **GitHub 只当服务端背后的小规模快照/备份层**：客户端永远不碰 GitHub Token；玩家也不需要 GitHub 账号。
4. **GitHub 不是事务数据库**：金币、抽卡、排位结算必须由可信服务端裁决，GitHub 只存快照。没有常驻服务端时，不宣称"跨设备云存档"。
5. **赛季引用卡牌，不修改卡牌**：赛季内状态与账号永久卡牌隔离。

## 1. 当前架构与缺口（已读代码核实）

| # | 事实 | 出处 | 含义 |
|---|---|---|---|
| F1 | **两套互不相通的"我的球员"**：本地账号 `playerIds / cardMods / gold`（localStorage `cls_accounts_v1`）；联机服务器自有 `economy` 名册 `getPlayer(account).roster` + 市场 | `js/data/account.js`、`server/online-economy.mjs` | "一套收藏多个玩法"现在不成立，必须先定谁是权威（§2） |
| F2 | 服务器账号 = 用户名 + scrypt 口令，Elo 排位分；存在**用户 home 目录文件**，会话在内存，重启全部登出 | `server/online-accounts.mjs` | 已是"轻量服务端账号"，不需要重写；但与本地账号无任何关联 |
| F3 | 本地"排位"是对 CPU（`startRankedMatch` 用 `accountToTeam`）；联机排位用**服务器名册**，客户端只发 `roster:"online"` 与 `teamId` | `js/app.js`、`server/online-server.mjs:466-610` | 联机阵容天然由服务端裁决，防作弊的基础已有 |
| F4 | 单赛季入口 `createSeason({ userTeam: draft, mode })`：`userTeam` 就是一支 `{name, players, coach}`，不关心球员从哪来 | `js/app.js:10792`、`js/engine/season.js:392-428` | **My Team Season 的引擎入口已存在**，主要是"从收藏组队"的 UI 与快照，不是新引擎 |
| F5 | 赛季存档在 `cls_season_v1`，Franchise 在 root v3；存档归属保护已覆盖 career / session / season（含 unlinked、guest） | ADR-008a、`saveOwnership.js` | 新赛季必须走同一套归属与"不得静默覆盖" |
| F6 | 本地卡成长/技能/成色在 `cardMods`，`resolvePlayers` 在读取时合成最终卡 | `account.js` | 赛季快照需要固化"当时合成后的属性"，否则赛季中途卡被升星会改变赛季结果 |
| F7 | 服务端已有限流、注册限流、奖金账本，但**单进程内存/本机文件** | `online-ratelimit.mjs`、`online-prizes.mjs` | 多实例/多机前不能把它当持久化方案 |

**缺口**：G1 无"本地收藏 ↔ 服务端收藏"的身份与数据桥；G2 无"从收藏组建赛季队"的流程与快照；G3 没有任何服务端持久化后端抽象（只有本机 JSON 文件）；G4 本地存档无导出以外的备份。

## 2. 最小账号方案（Planning）

### 2.1 身份模型（不新建认证系统）
- `guest`：默认。本机保存，沿用 ADR-008a 的归属规则。
- `local account`：现有 `cls_accounts_v1`，**不改格式**，稳定 `id`（`uid()`）。
- `server account`：现有用户名+口令（F2）。**新增一条可选链接**：`serverAccount.linkedLocalAccountId`（服务端生成的稳定 `acct_<随机>` 作为文件名，**不用用户名当路径**）。
- GitHub OAuth：**暂不做**（阶段 2 再评估）。"GitHub 登录"与"GitHub 存储"是两回事；玩家不需要 GitHub 账号。

### 2.2 权威收藏（回答 F1）
**（已被 §12 修改：本地权威仅限单机 My Team；联机排位/交易/奖励不得信任客户端收藏。）**
推荐（原文，已修改）：**本地账号收藏为单一权威**（`playerIds + cardMods`），服务端联机名册改为"从已关联本地账号的**快照**导入的只读镜像"。理由：游客与单机玩家占绝大多数；联机是可选增强；不引入服务端抽卡就不需要先做事务系统。
代价：联机里的"市场/交易"（服务端自有）暂与本地收藏分离，直到服务端持久化成熟。⇒ 见待决问题 Q2。

### 2.3 GitHub 存储适配器（服务端内部，客户端不可见）
```
StorageAdapter { get(path) → {data, version} ; put(path, data, expectedVersion) → {version} ; list(prefix) }
```
- 实现 A：`LocalFileAdapter`（现状，默认，也是测试替身）。
- 实现 B：`GitHubPrivateRepoAdapter`：Contents API，`sha` 条件更新 = 乐观并发；冲突 → 重读→合并→重试（≤3 次）→失败则**拒绝写并保留本地副本**，绝不静默覆盖。
- 同一账号写入**在服务端串行化**（每账号一个内存队列）。
- Token 只从服务端环境变量读取，永不入库、永不下发、永不写日志；最小权限（单仓库、Contents 读写）。
- 目录：`accounts/<id>.json`、`teams/<id>.json`、`seasons/<id>/<seasonId>.json`；`<id>` 由服务端生成并校验 `^acct_[a-z0-9]{16}$`，拒绝路径穿越。
- **数据红线**：不放口令/hash、令牌、精确地址、私聊。Git 历史会保留旧版本——"删除"≠抹除，隐私承诺需据此措辞。
- 频率红线：只在**阶段性结算**写（赛季创建、赛季结束、抽卡批次、手动备份）；禁止按比赛事件/每场/每次金币变化提交。

### 2.4 GitHub 作为临时库的已知限制（必须写进产品文案/运维文档）
非事务（多文件不原子）；有速率限制；仓库大小与文件大小上限；写延迟高；历史不可真删；无查询。**迁移路径**：保持 `StorageAdapter` 接口不变，换成 SQLite/Postgres 实现；快照 JSON 直接导入。

## 3. My Team Season 数据模型

```js
// 账号永久层（现有，不改）：account.playerIds[], account.cardMods{}, account.coachIds[], gold ...
// 赛季层（新，独立存档，引用不拥有）
const myTeamSeason = {
  schema: 1,
  seasonId: "mts_<随机>",
  mode: "MY_TEAM_SEASON",
  ownerAccountId: "<local account id | 'guest'>",
  createdAt, year,                          // year = 赛季所用历史年份/当年规则
  roster: [{                                // 开赛时固化的快照（F6）
    ownedRef: "<playerId>",                 // 指回 account.playerIds 里的卡 id
    cardSnapshot: { /* resolvePlayers 合成后的最终属性、技能、成色、星级 */ },
    snapshotHash: "<sha256 前 16 位>"
  }],
  coachSnapshot, tacticId, starterIds[], rotationPlan,
  season: { /* 复用 createSeason 的 season 对象：赛程、积分榜、playerSeason 统计、季后赛 */ },
  progress: { gamesPlayed, wins, losses, phase },
  rules: { allowMidSeasonPickups: false, injuries: true },
  result: null                              // { champion, mvpRef, honors[] }，赛季结束一次性写入
};
```
- **一张卡能同时用于排位与常规赛**：两个模式状态隔离（赛季内伤病/体能/统计只在 `myTeamSeason`；排位用账号层卡）。
- 赛季中卡被升星/换技能：**不影响进行中赛季**（用快照）；赛季结束后在"成长结算"里**显式、可见**地写回账号层（若有），否则不写。
- 赛季中新抽到的卡：**默认不进入当前赛季**（`allowMidSeasonPickups:false`），避免"抽到就加入"绕过阵容限制；规则可在审阅后改。
- 同一 `ownedRef` 不得重复出现（正常模式一人一张）；快照与账号层不一致仅用于提示，不阻断。

## 4. 用户旅程：收藏 → 总冠军
1. **抽卡/收藏**（现有）。
2. **My Team → 设置阵容**：选首发/替补/战术/教练（复用现有阵容与 `captureRotationPlan`；ADR-008 的 My Team 空间承载）。
3. **My Team → 常规赛（新入口）**：校验 ≥ 最小人数 → 弹确认（含"会占用单赛季存档位"，走存档归属保护）→ 生成快照 → `createSeason({ userTeam })`。
4. **赛季推进**：完全复用现有赛程、模拟下一场/整赛季、亲自指挥、季后赛（含手动季后赛）。
5. **赛季结算**：冠军/荣誉/成长报告 → 写入 `result`；My World 的旅程与荣誉读取它；**不**改排位分、**不**默认发金币。
6. 退出/放弃：删除赛季前确认；永久卡牌**不受影响**。

与 Franchise 的边界：Franchise = 时间线球队 + 选秀/交易/合同；My Team Season = 自己的收藏卡 + 不做选秀/交易/合同。**禁止**在 `js/myteam/` 复制 Franchise 逻辑，只调用 `season.js` / `gameplan.js`。

## 5. 存档兼容与迁移
- 不改 `cls_accounts_v1`、root v3、`cls_season_v1` 的既有格式；赛季层用**新 key** `cls_myteam_season_v1`（或在 season 存档加 `kind:"myTeam"` 标记——Q4 待定，推荐新 key，理由：既有"单赛季槽位"语义是 CPU 联盟 + 草根队，混用会让归属/镜像规则复杂化）。
- 新 key 接入 ADR-008a 的 `saveOwnership`（owner/sig/unlinked/guest 规则一致），**不得静默覆盖**。
- 导出/导入：沿用 root 导出；赛季快照单独导出。
- 游客 → 账号：沿用"认领"（已实现），不自动合并。
- 旧存档/历史生涯：零迁移，零改写。

## 6. 经济与排位完整性
- MVP：**My Team Season 不发账号金币、不改排位 Elo、不产出抽卡券**；只记录赛季进度/荣誉。
- 以后若加奖励：仅"一次性、按赛季 id 去重、阶段目标 + 总冠军"，且由**服务端裁决**或在本地单机范围内标注"本机成就，不计入联机经济"。
- 排位：联机排位继续只信服务端名册（F3）；本地"同步名册到服务端"只通过**服务端校验过的快照导入**，服务端按自己的卡库验证 `playerId` 合法、星级/技能不越界；不信任客户端上报的属性。
- 单机赛季产生的任何属性变化，**不得**回流到联机名册。
- 防刷：赛季创建/重复开赛季不产生奖励；一次性荣誉按 `(account, year, achievement)` 去重。

## 7. 风险
R1 两套收藏被误以为已统一；R2 GitHub 写冲突/速率限制；R3 Token 泄漏；R4 赛季快照与账号卡漂移引发"为什么我的卡变了"；R5 赛季占用 `cls_season_v1` 导致玩家丢草根赛季（故推荐新 key）；R6 用户把"临时库"当正式云存档。

## 8. 最小实施计划（映射现有路线图；不另开路线图）
| 包 | 内容 | 映射 | 风险 |
|---|---|---|---|
| A1 | 审计（本文 §1，已完成）+ 联机/本地名册数据契约文档 | ADR-008 N-1 之后 | 低 |
| A2 | `StorageAdapter` 接口 + `LocalFileAdapter` + 契约测试（**不接 GitHub**） | 新 P0 小项，挂在联机服务器线 | 低 |
| T1 | My Team 阵容页复用：从收藏选首发/替补/战术（读 `resolvePlayers`） | ADR-008 My Team 空间（N-2） | 中 |
| T2 | `startMyTeamSeason`：快照 + `createSeason({userTeam})` + 新存档 key + 归属接入 | M1/M2a 之后，M3 前 | 中 |
| T3 | 赛季页复用（赛程/季后赛/模拟），入口标记 `MY_TEAM_SEASON` | 同 T2 | 低 |
| T4 | 赛季结果写入 My World 荣誉（只读） | ADR-008a | 低 |
| A3 | `GitHubPrivateRepoAdapter`（服务端，开关默认关）+ 备份快照 | 小规模线上测试阶段 | 中 |
| 后续 | 服务端权威抽卡/市场、好友对战、赛季奖励、排行榜 | 研究项 | — |

顺序建议：**T1→T2→T3→T4 先于 A2/A3**（玩家价值最大且不依赖服务端）。

## 9. 验收测试
- 快照：开赛后升星/换技能，赛季内该球员属性**不变**；赛季结束写回路径可见且可拒绝。
- 一人一张：同一 `ownedRef` 重复进入阵容被拒。
- 隔离：赛季内伤病/体能不影响排位可用状态；赛季不改 Elo、不改 gold（断言前后账号 JSON 字节相同，除显式成长结算）。
- 归属：B 账号/访客/unlinked 场景下不能覆盖他人赛季存档（复用 `saveSlotGuard` 套路）。
- 复用：生成的 `season` 通过现有赛程/季后赛测试；`GameSim` golden hash 不变。
- 适配器：`LocalFileAdapter` 与（接入后）GitHub 适配器跑**同一份契约测试**：版本冲突被拒、重试上限、路径穿越拒绝、Token 不出现在任何返回/日志。
- 浏览器：桌面 + 390px，中英文，无溢出/无 page error。

## 10. 回滚
- 新入口放功能开关后（默认关→灰度开）；关闭后 `cls_myteam_season_v1` 保留不删，旧功能完全不受影响。
- 适配器切换回 `LocalFileAdapter` 即回滚；GitHub 仓库内容只作备份，不是唯一副本。
- 赛季存档损坏 → 提示导出/放弃，永久卡牌不受影响（它们根本不在赛季存档里）。

## 11. 待你决定（回编号即可）
- **Q1** 做不做 My Team Season：我建议**做**，先 T1–T4。
- **Q2** 权威收藏：我推荐"本地账号为权威，联机名册 = 服务端校验过的快照镜像"（联机市场暂与本地分离）。同意？
- **Q3** 赛季中途新抽的卡：默认**不加入**当前赛季。同意？
- **Q4** 存档位：推荐**新 key** `cls_myteam_season_v1`，不占用单赛季槽位。同意？
- **Q5** GitHub 适配器何时接：推荐 T1–T4 之后、有人要跨设备时再接（A3），之前只做接口 + 本机文件实现。同意？
- **Q6** 常规赛长度：沿用 82 场，另给 20 场"短赛季"选项吗？（我建议给，第一次体验更快。）
- **Q7** 联机服务器是否真有计划长期常驻？没有的话，A3 与"跨设备同步"文案都不应出现。

## 12. 产品负责人裁决（2026-11-07）

| 问题 | 裁决 | 说明 |
|---|---|---|
| Q1 My Team Season | **APPROVED** | 做 T1–T4，先出 T1 一页实现设计；不改 GameSim |
| Q2 权威收藏 | **MODIFIED** | 两阶段：见下 |
| Q3 赛季中新抽的卡 | **APPROVED** | 开赛冻结阵容；新抽/升级的卡不改变进行中的赛季；快照存**完整比赛所需属性**，保证确定性恢复。新卡可立即用于下一个新赛季、快速比赛、符合规则的排位、自定义挑战 |
| Q4 存档位 | **APPROVED** | `cls_myteam_season_v1` 独立槽位；套用现有归属/覆盖保护；不得覆盖 Franchise、Reborn 或单赛季存档 |
| Q5 GitHub 适配器 | **APPROVED（延后）** | T1–T4 之后再接；GitHub 永远在服务端后面，不用客户端凭证 |
| Q6 赛季长度 | **APPROVED** | 完整赛季 82 场 + **Quick Season（快速赛季）20 场**；共用同一赛季/季后赛引擎；短赛季的纪录与荣誉必须明确标记，不与 82 场累计统计混算 |
| Q7 服务器常驻 | **OPEN** | 未确认；在有可靠部署的服务前，**不宣称跨设备同步** |

### Q2 两阶段
- **Phase 1 — Local-first（现在）**：本地 `playerIds`、`cardMods` 是单机 My Team 的收藏来源；联机市场与服务器名册规则**保持不变**；**不自动同步**两套收藏；**客户端不得决定正式排位结果**。
- **Phase 2 — Server-authoritative（未来，需单独设计）**：正式线上账号的收藏、交易、金币、排位由服务端校验；GitHub 私有仓库只做低频快照/备份；本地仅作缓存与离线体验；需另出数据迁移、冲突处理与防作弊方案。
- 原因：客户端控制的 localStorage 可被改写，不能当联机排位、竞技奖励、交易的最终依据；但为 My Team Season 提前重构账号系统不值得。

### 对本 ADR 其余条目的影响
- §3 数据模型：`cardSnapshot` 必须保存完整合成后属性（含技能、成色、星级、体型、`playerPrefs` 应用结果），不只存 `ownedRef`；`rules.seasonLength: 82 | 20` 并带 `rules.variant: "full" | "quick"`，`result` 同样带 variant。
- §6：Quick Season 同样不发金币、不改 Elo；其荣誉标 `variant:"quick"`。
- §8：T2 起才创建存档位与快照，T1 不写任何存档。**不自动启动 T2–T4。**
- 实施门：先审阅 `ADR-010-T1-design.md`。
