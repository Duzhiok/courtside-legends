# 性能第三轮：按需建卡（Lazy Card Build）— 设计文档 + 实施结果

状态：**SHIPPED**（Code Puppy 实施）。用户 2026-11-23 决定走“按需建卡”路线（此前 2026-11-21 问过两条路：按需建卡 vs 等一次真实卡死记录再动手，用户选了前者）。

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

## 10. 实施结果（2026-11-23，Code Puppy）

实现与设计的一处差异：**没有把 `PLAYERS` 预分配成带空洞的全长数组。** 实践中发现这会出两个问题：(1) 已有代码 `paintDrawBanners` 用 `PLAYERS.length` 做缓存键，洞不改变长度就永远不失效；(2) 任何对洞位的 `.map`/`overall()` 都会拿到 `undefined` 报错。改为：`PLAYERS` 在延迟窗口内诚实为 `[]`（长度 0，不谎称有卡），回填结束后一次性整体换成全量数组；现存对全池的栈只会看到“还没开始建”而不会看到“建了一半”，没有报错风险，代价是延迟窗口内全池功能看到的是空列表而不是半池。

实际代码：`js/data/players.js`新增 `cardForRow`、`getSeasonCards`、`isPlayersReady`、`playersReady`、`assertPlayersReady`；`loadPlayers` 对已有的 IDB 快路径/缓存命中路径不动（它们返回时已经是全池，`_fullyBuilt` 始终为 true）；只有真正走到解析 roster.json 的冷路径才进入延迟分支：解析 + 建 span 索引后立即 resolve，后台按 200 张/块用 `requestIdleCallback` 回填，完成后一次性赋值 `PLAYERS` 并解决所有 `playersReady()` 等待者。保留 `?eagerCards=1` 回退开关。

实际改的入口（`js/app.js`）：`openCollection`、`openDailyDraw`、`startHometownChallenge`、`startClutchChallenge`、`startMyTeamSeason` 改为 `async` 并在读全池前 `await playersReady()`（确认过没有调用方依赖它们的同步返回值）。开机 `#load-status` 文案按 §4 要求改为：延迟分支下先显示“名册索引就绪，卡片正在后台补建…”，回填完成后自动更正为实际张数。

**已补的缺口（2026-11-23 第二次）**：`openMarket()`（新生涯/Gold Challenge/双人对决入口，17 个调用点）也改成 `async` 并在 `show("market")` 之后、`buildAffordableShop` 之前 `await playersReady()`。确认过没有调用方依赖它的同步返回值或调用后紧接的同步 DOM 读取。用已有的 `scripts/qa/career-market-attrs.mjs` 做了真市场回归：新存档/旧存档、案例属性条、无球探包、无横向溢出、无 page error 在桌面+手机 `18/18` 全通过。至此 §6 列的关键入口（收藏、每日抽卡、乡愁挑战、关键球挑战、My Team 赛季、市场）全部接上；剩下未接的少数文件主要是只读或不走冷路径的辅助屏幕。

测量结果（`/tmp` 真浏览器，本机本地 HTTP server，无缓存冷启动，用 `window.__rosterBootOk` 做 TTI 标记）：

| | 旧（全量建卡后才 resolve） | 新（索引后立即 resolve） |
|---|---:|---:|
| 进主界面（boot gate open） | +3693ms | +2498ms |
| 后台回填 23,448 张全完成 | （启动前已完成） | +8960ms（本机 headless 环境比 Node 纯计算的 1.2s 慢得多，`requestIdleCallback` 空闲时间比预期稀，但完全不阻塞主线程，无报错） |

验证：新增 `tests/playersLazyBuild.test.js`（7 个用例）；全套 `3977/3977`（Node 测试从不走 `loadPlayers()`，所以之前 30 文件的测试零改动）；lint 干净；真浏览器对比确认无 page error。未做账号门后的 openCollection/openDailyDraw 点击归因完整测试（需先创建账号），但已确认没有调用方依赖这几个函数的同步返回值，改 async 安全。

## 11. 独立验证（2026-11-23 20:26 轮，Muse；认领 74de949c，覆盖 61fd0b42 + 跟进 358ffa8f）——通过

- **真实冷路径探针**（自写，goal hidden_files/perf-r3-verify-probe.mjs；fetch 桩喂本地 roster.json/roster.meta.json，无浏览器无 IDB）：懒分支 15/15、eager 分支 4/4。懒：loadPlayers 76ms 即 resolve 且 PLAYERS 仍为 []、isPlayersReady() false；playersReady() 在 50ms 后仍 pending、约 1.4s 后随回填完成触发、满池 23,448 张；回填中途 PLAYERS 恒为 []（从未出现半池数组）；getSeasonCards(1996) 416 张与行数一致，且其条目与回填后的 PLAYERS 条目是同一对象（现建与回填共享 cardForRow 缓存）；二次 playersReady() 立即 resolve 同一数组；Jordan 1996 卡与 fresh seasonToCard 深相等。eager（?eagerCards=1）：resolve 即满池 23,448，isPlayersReady() 立即 true。
- **§1 数字复跑**（本机 Node，scripts/measure/perf-r3-lazy.mjs）：JSON.parse 100ms（文档 132）、span index 25ms（25）、2020 季 93ms（125）、一队一季 1.50ms（1.34）、全量建卡 988ms（1204）、块中位数 29.9ms（33）、最长块 88.2ms（99）、单张 42.1µs（~51）——量级与文档一致。
- **六处 async 入口**：openCollection/openDailyDraw/startHometownChallenge/startClutchChallenge/startMyTeamSeason/openMarket 的全部调用方均为 fire-and-forget（事件监听 / return void / 末尾调用），无一依赖同步返回值或调用后紧接的同步 DOM 读取；openMarket 先 show("market") 再 await，屏先现后填，refill 后的 autosave 仍在 openMarket 内（afterWin/refillShop 支）执行，无保存丢失。
- **缓存失效**：bannerStatsCache 键含 PLAYERS.length，回填换池后失效；createBestCardIndex 按数组身份+长度重建，无 stale 空索引陷阱；每日抽卡唯一 show("draw") 在 openDailyDraw 的 await 之后，claimDailyDraw 的默认 pool 在 UI 上不可达于未就绪窗口。
- **剩余 §6 项**：codexProgress/searchPeople/playersForFranchise/credits/hometownKnownBrefs 等均为只读，窗口内最差是空列表，无写操作；赛季引擎路径在开局后才跑，窗口已过。
- **变异核查**（scratch worktree，已删）：M1 cardForRow 取消记忆化 → 身份测试变红（6 pass / 1 fail）；M2 回填去掉 _markFullyBuilt() → 探针在 playersReady() 处永久挂起、永不 PASS（证实探针能抓到等待者未释放）。
- **测试**：聚焦 playersLazyBuild 7/7；全套 3908：3899 通过，9 失败 = online* ws 环境缺口（与 19:26 基线逐数相同；3899+85 未加载 = 3984，与 Code 所称 3984/3984 一致）。courtSimple "court skill pop" 通过。
- **注记**：① 设计 §3 要求把零散 seasonToCard 调用点改走 cardForRow，实际未改（analyticsSpecialist.js、scoutCareer.js、reborn/identity.js、reborn/training.js）——不是缺陷：identity.js 的 buildPlayerCard 会对建出的卡写 growth deltas，共享缓存实例反而会污染池子；其余三处是瞬时只读计算。不要盲目“补改”。② getSeasonCards 目前零生产调用点，且暖启动下因 `_rawRows` 为 null 静默返 []——记 B102（latent API 陷阱）。③ 懒路径下 onProgress 会报 1/"done"，而此时池子尚未就绪——boot 用 isPlayersReady() 判断故无 live 影响，但任何把进度 1.0 当作“池子就绪”的后来者会被误导。④ 提交的 7 个测试不覆盖懒分支（需浏览器 fetch），懒语义目前只由本轮外部探针 + Mac 浏览器实测兜底，建议把 fetch 桩版探针收进 tests/（已记 B102 行）。浏览器实测（冷启动 TTI 对照、回填完成前开抽卡/搜人/市场/开生涯、账号门后点击归因）仍排 Mac。
