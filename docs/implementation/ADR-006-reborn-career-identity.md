# ADR-006：Reborn 职业身份与权限模型（Player / Coach / GM / 经典 GM+Coach）

- **状态**：PROPOSED（只做规划和低风险文案；按政策规则 10，任何实现代码前需你批准本文）
- **不重开的产品决策**：`DECISIONS.md` D7（三种身份）。本文新增的产品方向由你 2026-11-05 确认：现有「经理兼教练」是**旧实现**，不是 Reborn 的唯一或默认身份；它保留为「经典 GM+Coach」自由经营玩法，不得删除或破坏。
- **范围**：规划 + 首页文案澄清。**不实现** Player 职业、职业转换、新 GameSim 控制（球员线见 ADR-005）。

---

## 1. 已做的低风险改动（本次）

- 穿越生涯卡片文案改为：「回到篮球历史改写命运。现可玩「经典 · 经理兼教练」；球员、教练、总经理人生开发中」（中英文，`index.html` / `modeCatalog.js` / `i18n-phrases.js`）。没有把未开发的职业标成可玩。
- 去掉首页「改写五年历史」。五年是**初始合同期限**（`INITIAL_CONTRACT_YEARS`），不是生涯上限（B4–B7 已落地多段执教、再就业、挖角、退休）。
- 官方称呼统一：现有组合身份 = **经典 GM+Coach（Classic GM + Coach）**，内部 ID 暂不改。
- 没动任何引擎、存档或权限逻辑。

## 2. 现状审计：Coach 和 GM 职责在哪里耦合

> 逐项能力的完整表格（入口、校验、状态字段、`authority`/`privileges` 是否有玩法、建议归属、拆分风险、未决问题）见 `REBORN_ROLE_PERMISSION_AUDIT.md`。下表是摘要。

读代码得出的事实（grep 范围：`js/engine`、`js/app.js`、`saveRoot.js`、`js/career`、`js/modes`、`js/ui/timeTravel`）：

| 位置 | 现状 | 耦合点 |
|---|---|---|
| 赛季中枢十个页签（`index.html` 的 `data-season-tab`） | 所有生涯显示同一套：积分榜、**排兵布阵**、**自由市场**、球队评估、赛程、评奖、季后赛、**选秀**、**球员发展**、生涯历史 | 只按 `isManagedCareer()` / `leagueCareer.kind` 控制，**不看身份**。教练类（排兵布阵、亲自指挥）和 GM 类（交易、签约、选秀）同时全开 |
| 引擎里的 GM 操作（`executeTrade`、`signFreeAgent`、选秀、裁人） | 无权限检查 | 任何经理身份都能调用 |
| `root.coach`（`coachProfile.js`） | 一份档案：声望、年龄、XP、心情、四条天赋线 `tactics / development / negotiation / media` | 一个人同时升级教练线和 GM 线，没有"哪个身份受益"的概念 |
| 续约方案（`contractOffers.js`） | `authority`（0–100，单一数字）和 `privileges`（字符串列表：「自定义训练计划」「发展联盟优先权」「额外教练预算」「季中补强额度」「完全人事决定权」…） | 同一个列表里混着教练权（训练计划、教练预算）和 GM 权（人事、补强、顶薪续约）。**在 grep 范围内没有找到任何引擎代码读取 `authority` 或 `privileges`，它们只在 UI 里显示**（死字段风险，非删除建议） |
| 面试 offer / 教练出身 | `authority/trust/pressure` 和 `coachOrigins` 的 `authorityDelta` | 只影响起点数字，不改变你能做什么 |
| 存档 | `root.story`、`root.coach`、`root.leagueCareer.kind` | **没有 role 字段**。身份是隐含的（`kind === "timeTravel"` 即经典 GM+Coach） |
| 成长与比赛 | `awardGrowth`、GameSim | 与身份无关，不耦合；这是好事 |

结论：耦合不在比赛引擎，而在**入口层和权限层**——没有一个地方回答"这个身份能不能做这件事"。

## 3. 决策（建议）

### 3.1 四个身份，一个枚举

`PLAYER` / `COACH` / `GM` / `GM_COACH`（= 经典）。起步只落地 `GM_COACH`（已存在）；`COACH` 和 `GM` 是 §5 的第 3 步，`PLAYER` 走 ADR-005。

### 3.2 最小存档模型：一个可选字段，旧存档零迁移

```js
root.identity = {
  initialRole: "COACH",
  currentRole: "COACH",
  history: [{ role: "COACH", teamId: "...", startYear: 1996, endYear: null }]
}
```

- **字段缺失 = 经典 GM+Coach**，`startYear` 从 `story` 推导。旧存档不改一个字节，读取时现算。
- 与 ADR-005 的 `root.reborn`（球员切片）并存，互不包含；`identity` 只回答"你现在是什么人"。
- `history` 只追加；`stints`（已有）继续记录教练/GM 的任期，`history` 是跨身份的上层。
- 必须带 `validate`，非法值拒绝（同 `story.poachOffer` 的做法）。

### 3.3 权限是一个纯函数，而且只在有消费者时才加条目

`permissionsFor(role) → Set<capability>`，首批能力只列**第一批真的会被读**的：

| 能力 | 球员 | 教练 | GM | 经典 GM+Coach |
|---|---|---|---|---|
| `commandGame`（亲自指挥/战术） | – | ✅ | – | ✅ |
| `setRotation`（首发轮换） | – | ✅ | – | ✅ |
| `trade` / `signFreeAgent` / `release` | – | 提建议 | ✅ | ✅ |
| `draft` | – | 提建议 | ✅ | ✅ |
| `allocateDevelopment`（训练资源） | 个人 | 指导 | 配置 | ✅ |

- 消费者：(a) 季中枢页签可见性/只读；(b) 引擎入口守卫（缺能力就抛错，同 `spendPerkPoint` 的做法，不静默失败）。
- **经典 GM+Coach 拥有全部能力 → 行为与今天逐字节一致**，这是回归测试的基线。
- 天赋线不改结构，只加"哪个身份相关"的过滤：`tactics`→教练，`negotiation`→GM，`development`→教练/GM，`media`→全部。

### 3.4 合同权限闭环（可选，后续）

把现在只显示的 `privileges` 变成能力授予：例如教练身份拿到「完全人事决定权」就获得 GM 的交易/选秀能力。这给"升级成双职"一条自然路径，也让 `authority` 第一次有消费者。**不在第一批实现里**，因为它改变合同谈判的价值。

### 3.5 双职是有代价的特殊身份（后续，不在本批）

按你的方案：工作负荷、董事会压力、授权（把球探/训练/轮换委托给 AI）、角色冲突。先写 ADR，实现排在职业转换之后。**不创建四套独立引擎**——共用 `timeTravelCareer.js`、合同、声望、面试、时间线、GameSim，只按权限切分入口。

## 4. 迁移风险

| 风险 | 缓解 |
|---|---|
| 旧存档没有 `identity` | 缺失即经典，现算；加"旧存档读取后行为不变"的快照测试 |
| `kind === "timeTravel"` 被多处硬编码为"经理兼教练"（`app.js` 至少 6 处，另有 `story`、`saveRoot` 校验） | 先写 `identityOf(root)` 一个读取函数，逐处替换；不一次性改 |
| 页签隐藏后，旧 QA 脚本找不到按钮 | 经典身份不隐藏任何页签；只有新身份才受限 |
| 引擎守卫误伤 AI 球队操作 | 守卫只作用于"用户发起"的调用，CPU 交易不经过 |
| 存档版本 | 只加可选字段，不升 v4；M4 的迁移契约另审（ADR-004） |
| 文档漂移 | ROADMAP M5 原文写"教练角色直接接现有 `timeTravelCareer.js`"——**不准确**：现有的是经典 GM+Coach。已在 ROADMAP 改正 |

## 5. 建议的实现顺序

| 步 | 内容 | 门控 |
|---|---|---|
| 1 | 文案澄清、经典 GM+Coach 命名 | ✅ 本次已做 |
| 2 | Reborn 身份选择页（球员/教练/GM 显示"开发中"，经典可选）；`identityOf(root)` + `permissionsFor` 纯函数 + 测试；不改行为 | 本 ADR 批准；对应 ROADMAP M5 |
| 3 | 拆 Coach / GM：页签只读、引擎守卫；GM 线的"比赛自动模拟"表现需单独设计 | M5；规则 10 一页设计 |
| 4 | Original Player Reborn | ADR-005，M3 闸门 + M2b |
| 5 | Historical / Random Reborn | ADR-005 |
| 6 | 职业转换（球员→助教→主教练→GM）、双职 | M4 存档契约之后 |

## 6. 需要你拍板

1. **Q1** `root.identity` 作为可选字段、缺失即经典（推荐）。
2. **Q2** GM 身份下，比赛自动模拟还是提供"观战 + 赛前建议"？（影响 Own the Moment 的适用范围；推荐先自动模拟。）
3. **Q3** 是否做 §3.4 合同权限闭环。推荐做，但放第 3 步之后。
4. **Q4** `GM_COACH` 对外名称：「经典 · 经理兼教练」（现用）。

## 7. 明确不做

Player 职业、职业转换、双职数值、新 GameSim 控制、重命名内部 `timeTravel` ID、改任何存档结构。
