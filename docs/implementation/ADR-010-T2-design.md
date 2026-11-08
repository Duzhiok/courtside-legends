# ADR-010 · T2 实现设计（一页）— My Team Season：从收藏阵容创建并续玩一个赛季

状态：**PROPOSED — 仅设计，未写实现**。T1 已验收，不重开。T2 不动 GameSim、经济、抽卡、排位、联机服务器；不启动 T3–T4；Avatar / 房间 / 反馈是另一条工作线，不混入。
本文所有"现状"均来自读代码或实测（标 *实测*）；"建议"是设计，不是已有格式。

## 1. 影响设计的已核实事实

| # | 事实 | 来源 | 对设计的影响 |
|---|---|---|---|
| F1 | `createSeason({userTeam})` 只收 `players`+`coach`；`teamFromRoster` **丢掉战术和首发** | `season.js:260,397` | T1 选的首发/战术/分钟必须在创建**之后**显式写回赛季队伍，否则被静默吃掉 |
| F2 | 赛季内首发、分钟、轮换每次都从**赛季队伍自己的字段**读（`starterIds`、`targetMinutes`、orders）；战术从 `coach.specialTactics` 取 | `app.js:5603-5614`；`careerEconomy.teamStarters` | 写回目标明确：`team.starterIds` + 球员 prefs + `coach.specialTactics`（同排位 `app.js:2568` 的做法） |
| F3 | `accountToTeam` 按 OVR 取前 12，**忽略** T1 的阵容选择 | `account.js:284` | T2 **不得**用它建队；用 T1 校验后的阵容 |
| F4 | 赛季界面只有一个存档出口 `saveSeasonAndCareer`：生涯分支，否则**直接 `saveSeason()` 写 `cls_season_v1`** | `app.js:1052-1072` | 新赛季若不改路由，会**静默覆盖玩家的单赛季存档**——这正是 P0 要防的事（见 R1） |
| F5 | 归属保护按"槽位名"工作，对新槽位通用；有 `sig` 的槽位（生涯）= 同一实例才算继续；`RESUMABLE` 只给无实例 id 的槽位 | `saveOwnership.js:110-127,174` | 新槽位 `myteam` 用 `sig = seasonId`，**不进** `RESUMABLE` |
| F6 | 82 场硬编码于 `RS_GAMES`；配对算法按固定次数+随机补齐 | `season.js:31,92` | 见 §4 |
| F7 | *实测* 刚创建的 82 场赛季 JSON ≈ **0.80 MB**（队伍 655 KB ≈ 20 KB/队，赛程 80 KB），32 队、86 个比赛日 | 一次性脚本，已删 | 配额不是首要风险，但要在 T2b 测"打完整季"的体积 |
| F8 | *实测* 直接把 `RS_GAMES` 换 20：每队恰好 20 场，但**每队只有 6–9 个不同对手、我方 7 个且全是同分区、同一对手最多 9 次、0 场跨分区**（82 场：31 个对手） | 同上，5 个种子 | 不能"只改常量"，要独立的短赛程函数 |
| F9 | 奖项资格线按 82 场写死：`gp<20`、`>=25`、`>=40`、`gp/65` | `season.js:888-973` | 20 场赛季里 ROY/MIP 永远无人合格，MVP 系数偏低，必须按赛季长度缩放 |
| F10 | "/82" 文案散在 `season.js:1471`、`app.js:10295,10379,8386,9660` | grep | 全部改为读赛季长度 |

## 2. 存档与快照

**槽位**：`cls_myteam_season_v1`（独立，不碰 Franchise/Reborn/`cls_season_v1`）。内容就是**一个赛季对象**，外加 `myTeam` 元数据块（不另造信封，DRY；加载复用 `prepareSeasonState`）：

```js
// season = createSeason() 的返回值，另加：
season.rsGames = 82 | 20;
season.myTeam = {
  schema: 1, seasonId: "mts_<time36><rand>", mode: "myTeamSeason",
  ownerAccountId: "<account id>",          // 审计用；归属以 cls_save_owners_v1 为准，冲突时听它的
  createdAt,
  rules: { variant: "full" | "quick", seasonLength: 82 | 20, injuries: true, market: false, allowMidSeasonPickups: false },
  roster: [{ ownedCardId, personId, startOvr }],   // 开赛引用清单：审计 + 供 T4 显式写回；不是可玩副本
  start:  { starterIds: [5], coachId: "…"|null, tacticId: "…" },
  result: null                              // 赛季结束一次性写入 { variant, champion, userFinish }
};
```

- **可玩副本只存一份**：完整解算后的卡（技能、成色、星级、体型、playerPrefs）就是 `season.teams[userTeamId].players`——引擎读的就是它，伤病/体能/统计也长在它上面。它在创建时从账号卡 `clonePlayer`，之后与收藏**完全脱钩**。这与"完整快照"的保证等价，但不重复存 12 张卡（避免两份真相；*实测*单队约 20 KB）。
- 不存 `snapshotHash`：卡在赛季里本来就会变（伤病/体能），哈希无法用于校验。
- 一季一槽：`phase:"done"` 后**不提供** `advanceLeagueOffseason`（`season.js:1479`）；新赛季 = 重新创建。

**归属**（改 `saveOwnership.js` 两处，不改格式）：`stampLegacySaves` 增加 `myteam` 参数；`myTeamSig(st)=st?.myTeam?.seasonId||null`。写入走 `assertSlotWritable("myteam", present, undefined, {sig})`，所以：他人/访客/未关联的该槽位**不能**被覆盖；同一 `seasonId` 续写允许；新建时若槽位是**我自己的另一个赛季** → UI 先确认"放弃当前我的赛季？"，确认后才覆盖。

## 3. 创建与续玩流程

**创建**（一次性、同步、单遍：校验 → 建队 → `createSeason` → 写盘，期间不再读账号）：
1. 必须是已登录账号（T1 规则，访客无资格）。
2. **重新校验，不信任保存的阵容**：`resolveSavedLineup` + `validateMyTeamLineup` 对**当前**收藏跑一遍。有 `block` → 回阵容页，说明原因；`dropped>0`（保存的阵容被修复过）→ **不静默开赛**，让玩家看到修复后的阵容再确认。
3. **确认页**：列最终阵容/首发/教练/战术/赛季长度（82 或 20），并写明"**开赛后阵容锁定；之后抽到或升级的卡不会影响本赛季**"。点击"开始"时再校验一次（防确认页停留期间收藏变化）。
4. 建队：按 T1 阵容 `ownedCards` → `applyPlayerPrefs` → `createSeason({userTeam, gamesPerTeam, mode:"modern"})` → **写回 F1**：`team.starterIds`、`coach.specialTactics ∋ tacticId`；`applyPlayerPrefs`（`js/data/playerPrefs.js`）沿用 `accountToTeam` 的做法。教练缺省用默认教练。
5. 先在内存里构造完整对象，**一次 `setItem`**。失败 → 返回 `{ok:false}`，账号/阵容/其他槽位**零改动**；owners 条目在成功后才写（写失败时存档仍在、状态为"未关联"，是安全方向）。

**续玩**：首页"我的球员"标签显示"继续我的赛季"（仅当可见性 = `mine`）→ 读槽 → 校验 `myTeam.schema===1`、`rsGames∈{20,82}`、`ownerAccountId` 与当前账号一致 → `prepareSeasonState` → 进入现有赛季页。**续玩不调用 `resolvePlayers`、不读收藏**。

**路由（R1 的根治）**：不用 `state.seasonSlot` 之类**会过期的标志**；路由由**被保存对象自己**决定：

```js
function saveSeasonAndCareer(st = state.season, opts) {
  if (st?.myTeam) return saveMyTeamSeason(st);   // 永不落到 saveSeason()
  …现有两个分支不变…
}
```

**赛季页收紧**（`rules.market:false`）：隐藏会改动阵容或通向它们的页签（`data-season-tab`：`market`、`evaluation`、`draftBoard`、`development`、`history`；`evaluation` 的"去市场/裁人"按钮会通向被隐藏的页），保留 `standings`、`rotation`、`schedule`、`awards`、`playoffs`；否则快照不变量会被页签破坏。

**收藏之后变了**：升星/换技能/出售/删除，一律**不影响进行中的赛季**；阵容页在有进行中赛季时显示一行提示"进行中的赛季使用开赛时的卡"。T2 不写回账号；写回由 T4 显式、可见地做。

## 4. 赛季长度：82 与 20

- `createSeason` 新增可选 `gamesPerTeam`，默认 82，走**原路径，字节不变**。
- `gamesPerTeam=20`：**不复用** `buildMatchupPairs`（F8）。新增纯函数 `generateShortSchedule(teamIds, seed, games)`：32 队 circle-method 轮转 → 31 轮每队恰好打每个对手一次 → 用种子洗牌取 `games` 轮 → 每队 20 场、20 个不同对手、20 个比赛日、主客场按种子交替（验收 8–12）。仅偶数队；T2 限定 `mode:"modern"`（32 队），历史赛季传 `gamesPerTeam<82` 直接抛错。
- `seasonGames(st)=st.rsGames ?? 82`；`scaleGp(n,st)=max(1, round(n*seasonGames/82))`：82 场时恒等，20 场时 20→5、25→6、40→10、65→16。F9/F10 全部走它们。
- 季后赛格式沿用现有引擎（见 O1）。短赛季的纪录与荣誉带 `variant:"quick"`，T2 不写任何账号累计数据，所以不会与 82 场混算；T4 必须按 `variant` 分键。

## 5. 与 My World / 我的游戏 的兼容
新增一行"我的赛季 · 20 场 · 12-8 · 已打 20/20"，复用现有 `gameRow` 的认领/删除；`SIG_OF.myteam = () => myTeamSig(readMyTeamSeason())`。他人账号的该槽位对我**完全不可见**；访客的只能先认领。账号被删后变"未关联"，仍受保护。不新增首页标签。

## 6. 验收测试

**单元**：① 路由——带 `myTeam` 的赛季**绝不**调用 `saveSeason`，普通赛季**绝不**写 myteam 槽（用 spy）；② 他人/访客/未关联槽位拒写，同 `seasonId` 续写通过，换 `seasonId` 需确认路径；③ 创建前重新校验：收藏里删卡、重复人物、阵容<8、首发不在阵容、教练被删，各自阻断；④ F1 写回：第一场的首发 = T1 首发、`coach.specialTactics` 含所选战术；⑤ 20 场赛程：每队恰 20 场/20 个不同对手/日内无重复队/主客场 8–12/含跨分区；⑥ **82 场赛程对固定种子的哈希与改动前一致**（守住其他模式）；⑦ `scaleGp` 在 82 恒等、20 缩放；20 场赛季能评出 ROY/MIP/6MAN；⑧ 创建后升星/出售/删除收藏，赛季卡不变；⑨ 写失败（配额）零副作用；⑩ `myTeam` 块 schema 白名单（坏 `rsGames`/缺 `seasonId` 拒载）；⑪ 访客不能创建。
**浏览器（桌面 + 手机）**：收藏→阵容→确认页→开赛→打两场→刷新→继续（首发/战绩一致）；升星后继续，赛季卡不变；换账号看不到也覆盖不了；已有单赛季/生涯存档时创建 My Team 赛季，**两者都不丢**；20 场赛季打完能评奖进季后赛；英文无中文泄漏；无横向溢出；市场页签隐藏；配额失败提示。**回归**：既有单赛季、生涯、排位、联机 QA 不变。

## 7. 待你决定
| # | 问题 | 建议 |
|---|---|---|
| O1 | Quick Season 的季后赛 | 保留完整格式（引擎复用）；不做缩短系列赛 |
| O2 | 赛季内市场/交易页签 | 隐藏（本文默认） |
| O3 | 教练是否必选 | 可选，缺省默认教练 |
| O4 | 20 场/历史年份 | 仅 modern；历史赛季不支持短赛季 |
| O5 | 改共享引擎 `season.js`（`gamesPerTeam`、短赛程、`scaleGp`） | 同意；82 路径由哈希测试守住 |
| O6 | `done` 之后槽位 | 保留到玩家新建下一个 |
| O7 | Q7（服务器常驻）仍 OPEN | 文案不出现"跨设备同步" |

## 8. 风险与缓解
- **R1 覆盖单赛季存档**（F4）：路由由对象自身决定 + 双向 spy 测试 + 一个 grep 守卫测试（`app.js` 里除路由外不得直接 `saveSeason(`）。
- **R2 配额**：0.8 MB 起步，打完整季会涨；T2b 先实测打满 82 场后的体积，复用 `saveRoot.js` 的 `compactSeasonForStorage`（**目前未导出**，T2b 需导出，一行改动）；超限给明确提示，不静默。
- **R3 共享引擎改动**：82 路径哈希 + GameSim 金标双守。
- **R4 TOCTOU**：确认页与点击之间收藏可能变——点击时再校验，创建单遍完成。
- **R5 `app.js` 冲突**：另一个 Agent 在改引擎/`app.js`；T2 的逻辑全放新模块（`js/myteam/season*.js`），`app.js` 只留接线；使用独立 worktree。
- **R6 20 场方差大**：季后赛名额由战绩决定，同分/小样本多；沿用现有排名与平局规则，不新增。

## 9. 实施切片（每片独立可验证，T2 批准后才开始）
**T2a** 引擎：`gamesPerTeam`、短赛程、`seasonGames/scaleGp`、"/82" 文案参数化（无 UI）→ **T2b** 存储：`myteam` 槽位、归属接线、路由、"我的游戏"行 → **T2c** 创建流：重新校验、确认页、F1 写回 → **T2d** 续玩 + 页签收紧 + 浏览器验收。
