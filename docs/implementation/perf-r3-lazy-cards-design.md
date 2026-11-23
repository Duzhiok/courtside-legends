# 性能第三轮：按需建卡（Lazy Card Build）— 设计文档

状态：PROPOSED，待 Code Puppy 实施。用户 2026-11-23 决定走“按需建卡”路线（此前 2026-11-21 问过两条路：按需建卡 vs 等一次真实卡死记录再动手，用户选了前者）。

背景：2026-11-20 用户在生涯模式排兵布阵时整页卡死，只能刷新恢复。第一轮（freezeDiag.js，心跳诊断）没能静态复现卡死原因；第二轮（memo.js，9 处查找记忆化）冷建卡 1799ms → ~1460ms。本轮目标：启动不再一次性建完 23,448 张卡，卡片按需建、用时再建。

## 1. 实测数据（本机 Node，冷启动）

脚本：`scripts/measure/perf-r3-lazy.mjs`（可重跑）。

| 环节 | 耗时 |
|---|---|
| JSON.parse roster.json（23,448 行） | 132ms |
| buildCareerSpanIndex | 25ms |
| 只建 2020 赛季（497 张卡） | 125ms |
| 只建一个队一季（15 张卡） | 1.34ms |
| 全量建卡（23,448 张，800 张/块 × 30 块） | 1204ms，单块中位数 33ms，**最长一块 99ms** |
| 单张卡成本 | ~51µs |

结论两点：

1. 启动真正贵的是全量建卡（~1.2s），而用户最先碰到的界面（排兵布阵）只需要 15 张卡（~1.3ms），差了三个数量级。
2. 800 张一块的最长块 ~99ms，本身是卡顿不是死机——卡死另有原因（freezeDiag 至今没抓到 ≥1s 的 stall 记录），本轮不宣称修卡死，只把建卡移出关键路径，让主线程不再有百毫秒级的块。

## 2. 目标 / 非目标

目标：

- 冷启动进主界面不再等全量建卡：解析 + 索引后即可进主界面（约 160ms 量级），其余卡片后台空闲时补建，或在界面真正需要时现建。
- 任何界面看到的卡池要么完整、要么明确等待，绝不出现“只建了一半的池子被当成全池”的静默错误。
- 行为零变化：卡片内容、评分、技能、金币、存档、golden hash 全部不变；全套测试绿；ROSTER_SCHEMA 指纹机制不变。

非目标：

- 不找卡死的根因（freezeDiag 继续跑；若用户再卡死，先看诊断记录再动手）。
- 不动卡片内容（seasonToCard、skills、overall、ROSTER_SCHEMA 67→68 已由贝弗利一单升过，本轮不升）。
- 不改 IDB 快速路径（见 §5）。

## 3. 契约改动（js/data/players.js）

现状：`loadPlayers()` 在冷路径解析 roster.json 后，用 800 张一块把 23,448 张卡全建完才 resolve；`PLAYERS` 是建完的完整数组，30 个文件同步读取它（app.js、season.js、draft、market、gacha、scouting、duel、timeTravel……）。

新契约：

- `loadPlayers()` 冷路径：解析 + `buildCareerSpanIndex` 后即 resolve，**不再全量建卡**。返回前只保证原始行与索引就绪。
- 新增 `cardForRow(row)`：行 → 卡的记忆化单例（同一行对象只建一次；键用行对象身份，同一会话内 JSON 解析结果稳定）。所有“现建”都走它，禁止各处自己调 `seasonToCard` 零散建卡（现有零散调用点：js/reborn/rosters.js、js/career/network/videoAnalyst.js——改走 `cardForRow`）。
- 新增 `getSeasonCards(season)`：该季全部卡片，记忆化；赛季引擎、选秀、市场等按季取池的调用方优先走它，而不是先拿全池再 filter。
- 新增 `playersReady()`（Promise）与 `isPlayersReady()`：全池建完才 resolve。后台补建完成后 resolve；任何需要全池的界面在入口 await 它。
- `PLAYERS` 在补建完成前是**未完成状态**：长度小于 23,448，内容不完整。任何代码不得在 `isPlayersReady()` 为 false 时把 `PLAYERS` 当全池用（filter / find / length / codex / banner 统计一律不行）。这是本轮最重要的一条红线。

## 4. 启动与后台补建

- 启动顺序：解析 roster.json → 建 span 索引 → resolve（进主界面）→ 后台空闲补建。
- 补建用 `requestIdleCallback`（无则 setTimeout 兜底），沿用现在的分块 + yield 模式，但块改小：**200 张一块**（按实测比例，单块约 8ms，最长约 25ms），补建全程不得阻塞输入；freezeDiag 心跳作证（补建期间出现 ≥1s stall 即失败）。
- 补建进度不阻塞任何操作；加载屏文案要改：不再写“已加载 N 张赛季卡”，改为“名册加载中，后台继续补建”之类，直到 `playersReady()` 才报总数。
- 兜底开关：保留 `?eagerCards=1`（或同等 flag）走回老路全量建卡，万一按需路径出问题可一键回退，不用发版。

## 5. IndexedDB 快速路径不变

- 暖启动（IDB 里已有处理好的卡）仍直接读 IDB，不走按需路径——它已经够快，不动。
- 冷启动的 `saveCachedPlayers` 改在**补建完成时**触发一次（现在是建完立刻后台写），内容与 key 不变；ROSTER_SCHEMA 失效逻辑不变。
- `tests/fixtures/cardSchema.json` 与 `cardsDigest()` 不变：指纹测试在 Node 里仍全量建卡算摘要（测试时成本无所谓），摘要值不变。

## 6. 哪些入口要接 readiness 门（审计清单）

规则：凡是同步读全池的界面入口，先 `await playersReady()`，再渲染。按调用方分四类：

1. **全池扫描**（必须等全池）：`codexProgress`（accountRecycle.js）、`bannerStats`（gacha.js）、`searchPeople`（collection/搜索）、`playersForFranchise`、`pickOpponentTeam`、`initializeScenario`、赛季引擎/选秀/市场（season.js、draft.js、leagueDraft.js、seasonMarket.js、seasonDraft.js）、`createBestCardIndex`（app.js:2008，已是 `() => PLAYERS` 懒取用——改成 ready 后求值）、credits 名单（app.js:3239）、`hometownKnownBrefs`。
2. **开屏入口**（在 open 时 await）：`openDraw`（抽卡）、`openCollection`（注意：现在是同步函数，需改异步或在调用处 await）、市场/生涯开局、`startMyTeamSeason`（已是 async，直接加 await）、duel/sandbox（`pool: () => PLAYERS` 两处，app.js:1966/1985）、timeTravel 屏、scouting 视图、GM 屏。
3. **按需可直接用的**（不用等全池）：排兵布阵/阵容屏（只要当队 15 张卡，走 `cardForRow` 现建）、单卡详情、单场比赛（比赛双方名单来自存档里的卡，不是全池现建——实施时核对）。
4. **每日任务**：`claimDailyDraw` 默认 `pool = PLAYERS`（dailyTasks.js:143）——抽卡动作时 await readiness；`refreshDailyStrip` 只画条子不抽卡，核对它是否读池（若只读任务状态则不用等）。

完整引用清单以实施时 `grep -rn "PLAYERS" js/` 为准（约 30 个文件）；上面是必审的入口，漏一个就是静默半池 bug。

## 7. 风险

- **半池静默错误**（最大风险）：某处忘了 await，把未建完的池当全池。防法：`PLAYERS` 未就绪时，开发模式下全池扫描函数抛错（`assertPlayersReady()`），生产模式只记日志；测试里加“未就绪时开抽卡/搜人会等待”的用例。
- **重复建卡**：`cardForRow` 缓存与后台补建必须共享同一缓存，否则同一张卡建两次（内容一致但浪费，且 `skillsLost` 等可变字段可能分叉）。补建循环必须经 `cardForRow` 写缓存，不得直接 `seasonToCard`。
- **IDB 写竞态**：用户在补建完成前退出——下次启动仍是冷路径，重跑即可；`saveCachedPlayers` 只在 ready 后写一次，不得中途写半池。
- **种子选择**：本设计不设种子集（主界面首屏经核对不需要卡片；实施时若发现首屏某处读池，种子只加那一处，不要顺手扩大）。

## 8. 验收

- 冷启动进主界面：解析 + 索引完成即进（Node 实测 ~160ms；Mac 浏览器实测为准，目标 < 500ms，含浏览器解析开销）。
- 后台补建全程主线程单块 < 50ms（200 张一块），freezeDiag 无 ≥1s stall。
- 全套测试绿；lint 干净；golden hash 不变；`cardsDigest` 摘要不变。
- 对照实验（Mac 浏览器）：补建完成前打开抽卡 / 搜人 / 市场 / 开生涯，内容与补建完成后打开完全一致；排兵布阵打开即 15 张卡可用。
- 回退开关 `?eagerCards=1` 可用。
- 性能脚本 `scripts/measure/perf-r3-lazy.mjs` 重跑，数字记入提交说明。

## 9. 实施分工

- 实施：Code Puppy（启动语义 + 全池契约是架构级改动，涉约 30 个文件）。
- 验收：Muse（独立验证：对照实验 + 全套 + 回退开关）。
- Lychee：设计 + 实测数据已交付；不碰生产文件。
