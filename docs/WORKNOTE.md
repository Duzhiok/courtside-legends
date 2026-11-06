

## R162 · Code：My World MVP「我的篮球人生」（ADR-008 N-1a/b/c）（2026-11-06）
- **导航（N-1a）**：首页第四个 tab `world`，放在最前；原三个 tab 的 id、名称、默认 tab（职业经理）和全部模式卡不变；`modeCatalog` 不动。`wireHomeTabs` 新增 `onActivate` 回调，并返回 `activate(id)`，供"去开始一段生涯"跳转使用。
- **真实数据（N-1b）**：新增 `js/data/profile.js`。账号的昵称就是原有的 `account.name`，不另加字段；只新增 `account.profile = { hometown, bio }`。访客资料存在本机的 `cls_guest_profile_v1`，页面上如实提示。**不读写任何 Reborn/生涯存档。** 旅程读根存档，"继续生涯"复用 `resumeLongCareer`；荣誉读冠军墙 `seasonHistory[].trophy`、图鉴 `codex`、排位战绩；没有数据就显示空状态。
- **My Home + 反馈（N-1c）**：纯 CSS 房间。三个相框挂账号里最强的三张卡，没有就显示空相框；奖杯架读生涯存档。反馈：复制模板 + 打开 GitHub Issues。剪贴板被拒时选中文字、提示手动复制，不会静默失败。
- 文件：`js/data/profile.js`、`js/ui/myWorldView.js`（纯构建器）、`js/ui/myWorldScreen.js`（控制器）、`css/myWorld.css`、`tests/myWorld.test.js`（6 条）、`scripts/qa/my-world.mjs`。
- 验证：全量 1720 条中只有 2 条失败（面板标记多了 `hidden`），修正后 `myWorld`+`homeTabs` 14/14；lint 0 错误（2 条原有警告）。浏览器 QA **52/52**（桌面 + 手机）：访客/账号持久化、两个账号互不影响、真实生涯"继续"进入赛季页、其他三个 tab 正常、首屏"快速开打"不受影响、英文无中文残留、对比度 ≥4.5、无横向溢出、无页面错误。
- 截图复查发现并修正：手机英文 tab "My Basketball Life" 折成 3 行 → 英文 tab 改为 "My World"，四个 tab 都是 58px。另发现原有问题 B49（长期生涯条在手机上被按钮遮住），已登记，没有顺手改。
- QA 自查：第一轮 4 条失败是脚本用错了语言 key（应为 `courtside.lang`），产品代码没问题。

## R161 · Code：M2b-1 修正（already_armed + 契约测试）+ 校准发现设计问题（2026-11-06）
- 完成：`already_armed`（不掷骰、优先级在 stale 之后）；结果加 `actualShooterId`/`teamPoints`；决策专用 `CLUTCH_DECISION_TUNING`（默认 = 修正前 0.78/4.5）；4 条新测试，变异验证 2 条变红；`clutchDecision`+`simRng` 22/22；全局金标一致。
- **校准停下**：权重几乎无效（91.2→86.7%）；交球概率对克莱降份额、对库科奇反而升份额。根因：决策把接球型角色球员变成主持球人，现有"欲望低先传一次"把球传走——选中库科奇时他只出手 11/600，低于不做决策的 24%。R160 只测了克莱，是验收漏洞；修正前就有此缺陷。需要设计决定（设计文档 §11）。
- 决定落库：候选池 76/届、位置软约束、授权审查范围、My World MVP 获批。

## R160 · Code：M2b-1 验收复核（只读，2026-11-06）
- 范围：只读复核 `0018c7c`/`07330be`，对照 ADR-002 与 M2b 设计；**没改 GameSim，没开始 M2b-2**；全量测试没跑，只跑 `clutchDecision` + `simRng` 18 条。
- 实测（配对种子 N=6000，克莱，落后 3 分 12 秒）：选中者份额 13.8% → 91.2%（`three`）/ 89.4%（`attack`）；三分命中率 51.5±3.7 → 50.8±1.5（无加成）；`attack` 三分占比 79.3% vs `three` 96.6%；全队失误 11.5% → 14.8%；疲劳 100 时失误 +3.0 点（疲劳未被豁免）。
- **更正我上次的汇报**：漏核了 ADR-002 的上限条款"不应接近 100%"，实测 ~90% 需要产品裁决；`pace_three` 焦点其实没被设置（`three` 走 `needThree`）。
- 缺口：①已有待消耗决策时再提交会静默覆盖且丢结果；②事件 `meta.clutchOutcome` 没有测试；③ADR 上限条款待裁决。引擎层待查（非本里程碑引入）：疲劳 100 时三分命中率不降，有无决策都如此。
- 结论：**引擎阶段暂不标 ready**，条件就绪；最小清单见设计文档 §10。

## R159 · Code：ADR-007 / ADR-008 批示落库 + 候选池容量模拟（2026-11-06）
- **文档**：ADR-007 → ✅ 修改后批准（§0.1 批示、§2.2 重生规则重写、§6 两种"结束"、§8 决定记录、§9 新增验收、§10 容量分析）；ADR-008 → ✅ 原则批准（中文名定为"我的篮球人生"、§4 奖励递减改为金币+XP 同降、§7 决定记录、§9 N-1 实现准备清单）；`DECISIONS.md` 新增"七"节与变更记录；`ROADMAP.md` 记 N-1 例外和 L-1 容量结论。
- **容量模拟**（`scripts/research/rebirth-capacity.mjs`，只读，不碰引擎）：4,393 人 → 3,519 可用（874 个新秀季样本太薄）；每届 60/76/100、24 届（2026–2049）全部填满，用掉可用池 41%/52%/68%；头条 2/届只用掉 A 档（peak≥88，95 人）的 51%，低频成立；冷却 N=0 与 10 差别很小。**中锋是真瓶颈**：每届 100 人 + 25% 中锋 → 2044 年用完、缺 126 席；每届 76 人撑得住。另：27% 的可用人物 1980 年前首秀（源数据无三分/抢断/盖帽），105 人数据窗口始于 1951（真实首秀可能更早）。
- **我自己的修正**：初稿"成长沿用 `historicalLadder` 封顶"被产品负责人否决，已改为"真实轨迹只作参考先验"，并写明代价——没有这个上限就需要新的护栏（潜力/上限怎么给、与 D5 OVR 99/100 有关），落地时单独设计，本轮不拍数字。
- **没做、也不做**：未来选秀生成器、四分线、托管联赛、N-1 的代码（只做了准备清单）。
- **发现**：N-1 只需保留现有 3 个 tab id、换显示名并新增 `world`，比"3 值改 4 值"改动更小（QA 脚本和 `lastMode` 恢复都引用旧 id）。
- **诚实限制**：容量模拟是静态可行性上界——没走真实选秀管线和 GameSim；2025 年仍在打的 479 人按"再打 6 年"近似；未纳入策展人物（尚未建表）。
- **仍 OPEN**：ADR-007 Q3（头条名额）、Q6（跨界授权）；ADR-008 Q4（广告）、Q6（阵容合一）；N-1 `world` 面板很薄，按四个入口做还是先只改 3 个名字。

## R158 · Code：M2b-1 绝杀决策契约（引擎部分）（2026-11-06）
- **范围**：`sim.js` 新增 `issueAttemptId`/`submitDecision`/`_settleClutch`；`resolvePossession` 拆成包装 + `_resolvePossession` 核心；读取点优先级（玩家决策 > 脚本 > 默认），复用 0.78 交球闸/分球豁免/`pace_three` 焦点，无新常数、不碰 `calcMakeProb`。结构化结果见设计文档 §9。**不含** ClutchController / 场景 / UI（M2b-2）。
- **验收**：1500 种子三组配对（`scripts/research/clutch-m2b1-measure.mjs`）：选中者出手份额 14%→92%（目标 ≥35%），命中率 50.8%→49.4%（无增益），失误率 12.7%→15.7%，胜率不强制。全局模式金标与改动前逐字节一致；全量 1710/1710（本机含 `ws`）、lint 0 错误、`git diff --check` 干净。
- **测试**：`tests/clutchDecision.test.js`（9 条）+ `simRng.test.js` 新增 2 条（嵌套/交错、异常恢复）。5 种变异全抓；其中一个半失效变体证明 35% 门槛太松，回归门槛改 60%。
- **诚实限制**：份额约 90% 主要来自既有 0.78 闸门；样本只有 GSW16/CLE16 两个场景；`three` 对非射手不强迫拔三（既有硬门）。
- **技术债**：每场比赛独立 RNG（离线托管/联机多场前必须还），见设计 §9。

## R157 · Code：两件大事的分析与记录——ADR-007 传奇宇宙 / ADR-008 四空间导航（2026-11-06）
- **输入**：产品负责人两条想法（原话要点存 `DECISIONS.md` §六）+ 一份外部 AI 润色稿 + 三张概念图。纯规划，零代码。
- **核实的事实**：①真实数据只到 2025（`HISTORICAL_YEAR_END`）；②2025 年后选秀**已经在用虚构球员补位**（`leagueDraft.js` `generatedProspect`，12 名 × 12 姓）；③2000–2025 每季平均 76.3 名新人，2026–2049 需要约 1,440–1,800 人；④`roster.json` 有 4,393 个真实人物，可作重生池；⑤教练 70 岁强制退休，1996 年入行的教练 2031 年就退休了；⑥`legacy.js` 已有生涯分档；⑦有两套"我的阵容"：本地账号卡 vs 联机服务端账号（`online.html`）；⑧生涯里的房子（`coach.housing`）和"我的世界"的家是两样东西。
- **对外部稿的主要修正**：重生必须当主力、两个宇宙都默认开（外部稿写"可选"，那样人不够）；勋章在任何生涯结束时都发；勋章档次复用现有分档，不另造五级；托管"场数宽松（20）、奖励封顶"，不是只给 5 场；四分线关闭时必须过 M2b-0 金标哈希。
- **新文件**：`docs/implementation/ADR-007-legendary-universe.md`、`ADR-008-navigation-four-spaces.md`（都是 PROPOSED，各 6 个待拍板问题）。DECISIONS 加两条 ADR 摘要和 §六原话；ROADMAP §9 加 7 行映射（不新建里程碑）；BACKLOG 加 B42–B48。
- **没做**：任何实现；授权核查（ADR-007 Q6）；托管经济测量。

## R156 · Code：M2b-0 可注入 RNG 落地（2026-11-06）
- **范围**：纯机制，无玩法变化。新增 `js/core/rng.js`（`rand`/`withRng`）；4 个文件共 103 处 `Math.random()` 机械替换（sim.js 因已有局部 `rand(a,b)`，用别名 `rnd`）；`GameSim` 构造器拆成 `constructor`（取 `rng`、包 `withRng`）+ `_init`；`SEEDED_ENTRY_POINTS` 14 个入口统一包装。
- **验收**：金标 20 个种子在改动前录入；改动后「全局替换 Math.random」与「`GameSim({ rng })`」两种方式均 20/20 与金标一致；注入模式下把 `Math.random` 换成抛错函数，整套场景不触发。全量 `npm test` 1699/1699，lint 0 错误，`git diff --check` 干净。
- **变异**：把 `step` 从清单去掉 → 防漏网测试变红（fail 2）。去掉 `callTimeout`/`runManagedBreak`/`setAutoDefense`/`nextQuarter` 仍绿——这些入口要么只经由已包装的父方法进入，要么那条路径是条件掷骰、场景没触发；因此另加了结构性断言（每个入口必须带 `seededEntry` 标记）。**诚实限制**：防漏网测试只证明「场景走到的路径」没漏，没走到的条件分支靠清单 + 标记兜底。
- **没做**：M2b-1；`coaches.js` 的 2 处与商店 `shuffle` 默认随机；联机服务端并行多场的显式传参（设计 §1 已写明代价）。
- **顺手**：BACKLOG 的 Reborn 身份行 B37 与 M1 首屏行撞号，Reborn 行改为 B41（Luna review 备注）。

## R155 · Code：ADR-006 批准落库 + M2b 设计提交（2026-11-05）
- ADR-006 ✅ APPROVED：Q1/Q4 批准；Q2 附条件；Q3 原则批准。写入 ADR §0 与 DECISIONS。内部步骤 R1–R7 映射 M5–M7，不新建里程碑。
- 新增 `docs/implementation/M2b-clutch-decision-design.md`（PROPOSED，一页）：可注入 RNG + 决策契约。发现 `skills.js` 51 处 `Math.random` 在引擎调用链里，只改 `sim.js` 不够；建议 `js/core/rng.js` 作用域替换 + 改动前后金标哈希；拟修订 ROADMAP §5 "RNG 不可注入"。批准前不改 GameSim。
- `BASELINE_AUDIT.md` 新增 §0b：来源提交 `b64e660`，标注已解决/已变更/仍成立的条目。
- 同日早些时候已完成并推送：设置页标题与开始按钮随经营长度（`a2da47c`）、开局引导页取消按钮（`a2da47c`）、权限审计（`b64e660`）。

## R162 · Code：My World MVP（N-1a/b/c）
- 新增第四个首页 tab（默认 tab 不变）、`profile.js`（账号昵称/家乡/简介，访客本机存储）、`myWorldView/Screen`、`myWorld.css`；`homeTabs` 加 `onActivate`。14 条测试通过。
- 换装/补签/商店仅记入 DECISIONS §九，未实现。

## R163 · Code：ADR-009 Hometown Legends（仅规划）
- 新增 `docs/implementation/ADR-009-hometown-legends.md`。关键发现：名册无地点字段，关系表需策展；约束写成可测夹具（§10）。未改代码。

## R164 · Code：M2b-1 校准完成 → 引擎阶段 READY
- handoff 0 + keepBall（仅决策路径）：Klay 69.8% / Kukoc 53.3% / Kerr 55.7%，均在 45–70%；金标不变；23/23；变异验证通过。详见设计文档 §12。未开始 M2b-2。

## R165 · Code：M2b-1 角色感知战术执行（方案 1）
- 取代 R164 的全局 keepBall（已删）。新增 `clutchRole.js`：creator / playmaker / catch_shoot / post / role_player → on_ball / off_ball / entry。7 名球员实测、26/26、三个变异均变红、金标不变。详见设计文档 §13。未开始 M2b-2。

## R166 · Doc：ADR-008a My World 差距分析（My Games / Player Voice / 3D Avatar）
- 只分析，没改功能代码。要点：可恢复存档目前最多 2 个设备级槽位（根存档 + `cls_savegame_v1`），都不校验账号，切号会互相看到（P0 隐私缺口）；反馈没有真实后端，生产服务器未部署；3D 推荐 Three.js 动态加载 + CC0 角色，GameSim 不动。全量测试基线 1724/1724。详见 docs/implementation/ADR-008a-my-world-games-voice-avatar.md，Q1–Q5 待定。

## R167 · Code：My World 视觉改版（只改 UI）
- 删除重复大标题，只留 `MY WORLD`；反馈入口收成右上角小图标（原有复制/GitHub 行为不变，面板默认收起，不显示假的"提交成功"）。紧凑身份 hero（金色圆环头像）、两张紧凑卡（「我的旅程」改名「我的游戏记录 / My Games」，数据与恢复流程不变）、本地内联 SVG 房间插画（真实相框/奖杯/名牌叠在上面）。
- 没有做：Daily Hub、My Style（对应功能不存在，不做假入口）；My Games 仍只列真实可恢复的生涯，中途存档的归属问题等 ADR-008a Q1。
- 验证：`tests/myWorld.test.js` + `homeTabs` + `homeShowcase` 通过；`scripts/qa/my-world.mjs` 136/136（1440/1280/390/360，含对比度、无横向溢出、游客/账号/英文、真实存档恢复）。前后截图：docs/implementation/assets/my-world/。
- 剩余：My World 内容在 1280×800 里从 y≈620 才开始（被全页共用的大横幅和访客条挤下去）；共用页签栏在手机上折两行。两者都是首页公共区，未改。
