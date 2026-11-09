

## R175 · Code：B49 手机存档条压字 + 首页页脚内部术语

- B49 根因：`home.css` 手机断点里 `#screen-home .account-home-text { flex: 1 1 0; min-width: 0 }` 本来只为"我的档案"栏（别掉到第三行）写，选择器却是通用的，连带把两个存档条（长期生涯 / 继续进度）的文字栏压成 0 基准宽，在三个按钮旁边只剩一个词宽（实测 89px）。修法：该规则收窄到 `.profile-bar`；存档条文字 `flex: 1 1 100%` 独占一行，按钮换到下面。
- 页脚"联机对战（P0，需先启动服务端）"去掉内部术语 "P0"（`index.html` + `i18n-phrases.js` 同步）；390px 下中英文都完整显示，不再被截断。
- 验证：`home-first-screen.mjs` 新增两条 B49 断言（文字栏 ≥140px、按钮不盖文字），改前手机 89px 变红、改后 69/69；全量 1759/1759，lint 0 错误；页脚右边界 366 < 390 且未截断。

## R174 · Code：P0 跨账号存档覆盖——写保护 + 说明弹窗（接手并收尾）

- 问题：存档槽位是整台设备共用的（长期生涯 `cls_root_v3`、未完成比赛 `cls_savegame_v1`、单赛季 `cls_season_v1`）。之前只做了"别的账号看不见"，但账号 B 开新生涯/导入/自动存档仍会直接覆盖 A 的存档——隐藏不等于保护。其中单赛季槽位连归属记录都没有。
- 做法：`saveOwnership.js` 增加三槽位归属 + `assertSlotWritable`/`slotLocked`；三个存储写入点（`writeRootSave` 及清除/删除、`writeSave`/`clearSave`、`saveSeason`/`clearSeasonSave`）遇到"别的存活账号"的存档一律拒绝（`ForeignSaveError` 或 `blocked` 标记），长期生涯的兼容单赛季副本只镜像、不占槽位。归属者账号被删除后，该存档回到"未关联"，不会永久锁死槽位；旧单赛季迁入根存档时归属随之移动。
- 界面：`confirmAction` 增加 `notice` 单按钮模式；开始穿越生涯 / 开始单赛季 / 导入 / 放弃生涯 / 手动存档 / 自动存档遇到被锁槽位时，都明确说明原因（中英文），不再假装"进度已保存"；切换/删除/新建账号时，上一个账号还留在内存里的进度会被清掉，避免继续玩并写不进去。
- 本轮接手：工作区里已有另一个 agent 未提交的同主题改动（与我的方案互相叠加）。我逐项审过后保留，补了放弃生涯处理函数的守卫（原先锁定时会在确认框之后抛未捕获异常）、浏览器 QA、变异验证和文档。
- 验证：全量 1759/1759，lint 0 错误；新 `save-overwrite-guard.mjs` 42/42（桌面+手机，真实模块+真实弹窗：八个写入点全拒、四个存储键逐字节不变、中英文、弹窗不出视口、归属者不被锁、归属者账号删除后解锁）；旧 `save-ownership.mjs` 48/48、`guest-entry.mjs` 64/64、`season-resume.mjs` 36/36；GameSim 金标不变；变异（归属查询永远返回"没人"）20 项变红，已还原。
- 已知边界（需产品确认）：① 访客（未登录）存的存档也算"别人的"，登录账号不能覆盖它，需要先切回访客处理或导出；② "未关联"的旧存档仍可被任何账号覆盖（沿用既有的认领流程与确认框，没有改）；③ 归属记录只存在 localStorage，清浏览器数据会一并清掉。

## R173 · Code：3D Avatar 发型（短发/光头）与 ADR-008a 验收状态

- 在 R172 的基础上加「发型」：模型的头发是独立网格，隐藏它就是光头。`avatarLook` 新增 `style`（short/shaved），白名单、旧存档缺字段回退 short。
- 这只是最低限度的"2 种发型"；真正多发型要新模型或美术，已在 ADR-008a §3.5 写明。
- 纠正自己：上一轮我打算把外观接进 Reborn 球员创建，但 ADR-008a §3.3 明确账号外观不与 Reborn 职业人物共用，且 ADR-005 的 PR1 还在等实现设计页和 M3 闸门，所以不做。
- 验证：`avatar-look.mjs` 61/61；光头步骤从截图里数红发像素（71→0，手机 62→0）；变异（头发网格永不隐藏）两项变红。

## R172 · Code：3D Avatar 第 2+3 步——换外观、保存到账号、静态回退接线（My World「编辑形象」）

- My World 身份卡新增「编辑形象」，展开面板：3D 角色 + 肤色(5)/发色(5)/服装(4) 色块。选择即保存并实时重新上色；拖动可旋转。
- 数据：`js/data/avatarLook.js`。登录账号存 `account.avatar`，游客存单一本机键 `cls_guest_avatar_v1`。只存白名单预设 id，损坏/手改的值回退默认；不碰任何能力、身高体重或存档。账号之间互不可见。
- 懒加载：只有点开「编辑形象」才下载 Three.js 与模型；面板关闭、重绘（切账号/保存资料）、离开页面都会释放 3D。3D 不可用（无 WebGL、模型 404、超时）时保留静态头像并说明原因，色块照常可选、可保存。
- `avatar3d.js` 新增：按材质名（Skin/Hair/Shirt/Pants）上色、`setLook`、画布 `data-look` 属性（QA 读取）、屏幕外暂停渲染（IntersectionObserver）。
- **没有发型选择**：模型只有一个头发网格，只能换发色。要多发型需另找 CC0 模型或做美术，已向产品负责人说明，待决定。
- 验证：`avatar-look.mjs` 57/57（桌面+手机）：从像素里量出橙色上衣真的变色；通过真实账号选择器切换（首次我直接调存储函数切账号，界面没刷新，隔离只验了存储，已改成走真实界面）；变异两组（look 忽略账号、不上色）分别 10 项/2 项变红。`my-world.mjs` 136/136 不变，`avatar3d-spike.mjs` 26/26，GameSim 金标不变。
- 已知限制：渲染帧率仍是无头软件 GL 数据，不是真机；同一浏览器里没有账号隔离的"安全"含义，只是显示隔离。
- 顺带：`tests/myWorld.test.js` 的"每个按钮都有处理函数"现在会去读 `myWorldScreen.js` 源码确认处理函数存在，不再只是核对一份名单。

## R171 · Code：3D Avatar spike（ADR-008a N-1f 第 1 步，只做可行性，未接入游戏界面）

- 新增 `js/ui/avatar3d.js`（`mountAvatar3d`：动态 import Three.js、加载 GLB、Idle 动画、拖动旋转、`dispose`；无 WebGL / 404 / 超时都会 reject 并清理，由调用方保留静态形象）。
- 资源：Quaternius "Man"（Poly Pizza 页面标 CC0 1.0，未修改，482 KB）；Three.js r187 摇树精简并压缩（621 KB，MIT，`scripts/vendor/build-three.sh` 可重建）。来源与许可写在 `docs/ASSET_CREDITS.md`。`js/vendor/` 加入 eslint 忽略。
- 模型是**一个蒙皮网格 + 6 种材质**（Shirt/Skin/Pants/Eyes/Socks/Hair）：肤色、发色、上衣/裤子颜色可以直接换材质颜色，不需要 Blender。**但没有多种发型的子网格**，"至少 2 种发型"这条验收需要另找带多发型的 CC0 模型或做美术。
- 验证：`scripts/qa/avatar3d-spike.mjs` 26/26（桌面 + 手机视口）；游戏首页全部 tab 不下载 Three.js / 模型；全量 1743/1743；GameSim 金标不变；变异（关掉 `renderer.render`）4 项变红。
- 诚实限制：帧率/首帧是无头浏览器软件渲染，不是真机；真机性能仍未测。
- 未做：换装/发型 UI、保存到账号、静态形象回退的页面接线（步骤 2、3）。

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

## R168 · Code：M2b-1 被逼抢时允许分球 + Curry 无增量查明
- 一处条件：指定的创造型球员空位不足或被包夹时，按本回合现有 `kickChance` 决定是否分球。Stockton 97.0% → 88.0%（three）/ 92.5%（attack）；其余角色不变；金标不变。Curry 无增量：终场脚本本来就选他。详见 M2b 设计文档 §14。M2b-1 为验收候选，未标 READY。

## R169 · Code：ADR-008a Q1 存档归属 + My Games
- 新增 `saveOwnership.js`/`accountKeys.js`（独立归属元数据，存档格式不变），接入生涯/中途存档的写入、清除、首页两个"继续"条、赛季设置页恢复、账号切换刷新；My World「我的游戏记录」列出可见存档，未关联的带"本机存档·未关联账号"标签和显式认领（确认框）。
- 顺手修 My Home 手机宽度：球衣被相框盖住（下移）、窄屏隐藏地面小物件（避免压在奖杯架名牌下）。
- 验证：全量 1735/1735，lint 0 错误，`save-ownership.mjs` 48/48 + `my-world.mjs` 136/136；变异验证有效。M2b-1 修正（R168）已验收：Stockton 97.0% → 88.0%/92.5%，Curry 的无增量是因为终场脚本本来就选他。
- 下一步：Player Voice（反馈 UI + 本地草稿，不显示假"已提交"）→ 3D Avatar 垂直切片（独立分支）。B49 仍是单独的小修复。

## R170 · Code：ADR-008a Q2 Player Voice 客户端
- 新增 `feedbackDraft.js`（按账号的本机草稿）；反馈面板改为类型 + 可选星级 + 文字 + 草稿恢复；「提交」在没有真实提交函数时禁用并说明原因；GitHub 降为小字备选。屏幕层通过注入 `submitFeedback` 预留服务端接口，未实现服务端。
- 验证：全量 1743/1743，lint 0 错误，`player-voice.mjs` 54/54、`my-world.mjs` 136/136、`save-ownership.mjs` 48/48；两个变异验证有效。
- 抓到并修复：视图直接信任评分值。待办：首页页脚「联机对战（P0…）」暴露内部术语 + 手机换行截断；B49 仍是单独小修复。
- 下一步：ADR-008a Q3 的 3D Avatar 垂直切片（Three.js + 核实过的 CC0 资源，独立提交）。

## R176 · Plan：ADR-010 轻量账号 + My Team Season（仅规划，未改代码）
- 审计结论：存在两套收藏（本地 vs 联机服务器经济）；服务器账号已是用户名 + scrypt 的轻量方案但与本地账号无关联；`createSeason({userTeam})` 是现成的引擎入口；存档归属保护可直接复用。
- 方案：本地收藏为权威，联机名册只是服务端校验过的快照镜像；赛季用独立存档位（推荐新 key）+ 开赛快照；`StorageAdapter` 接口先做本机文件实现，GitHub 私有仓库适配器（服务端、默认关）放在 T1–T4 之后。
- 已核实：ADR-009 已被 Hometown Legends 占用，故本文为 ADR-010。待你回 Q1–Q7（见 ADR-010 §11）。

## R177 · Plan：ADR-010 裁决落档 + T1 一页实现设计（未改代码）
- 记录产品负责人裁决（Q2 改为两阶段，Q6 命名 Quick Season，Q7 OPEN）；ADR-010 与 DECISIONS 已更新。
- 新增 `ADR-010-T1-design.md`：收藏→阵容映射、账号隔离、阵容校验、向后兼容、风险与依赖。T2–T4 未启动。

## R178 · Code：ADR-010 T1 — My Team 阵容编辑器（只做 T1）
- 新增 `js/myteam/lineup.js`（纯校验/映射，`MY_TEAM_RULES` 8–12 人、5 首发，为 My Team 配置，非 GameSim 限制）、`lineupStore.js`（唯一写入点，仅显式保存/清除）、`js/ui/myTeamLineupView.js` + `myTeamLineupScreen.js`、`css/myTeamLineup.css`；入口在"我的球员"标签（"组建我的阵容"），不新增首页标签、不新增存档槽。
- 规则：可编辑未完成阵容，仅"开赛季资格"被拦；同人一张（重复卡替换）；位置问题只警告；游客只看引导；旧账号无 `myTeamLineup` 用自动阵容，失效卡自动修复且不写盘；教练/战术沿用账号字段（T2 开赛时快照，T1 不碰）。
- 验证：单测 24 条；变异 10/10 红；浏览器 QA 桌面+手机 60/60（含打开不写账号、保存只写新字段、刷新恢复、清除、同人替换、中英切换保留草稿）；全量 1808/1808；lint 0 错；GameSim 金标一致；`js/engine` 零改动。
- 未做：T2–T4（赛季创建/快照/存档槽/荣誉），按批准范围停在 T1。

## R179 · Code：My World 2.0 W1 — 统一头像身份（P0）+ 计划增补

- 计划：`docs/implementation/ADR-008a-addendum-my-world-2.md`（审计事实、W1–W5 里程碑、Creator 2.0 可行性评审、Q1–Q5）。
- 审计关键事实：模型是**单个蒙皮网格、6 材质、31 骨骼、0 个 morph target**，所以脸型/发型/服装三项 Creator 目标都需要美术资产；免美术只能做体型预设（骨骼缩放）、视觉身高、衬衫贴图、现有动画。
- 实现：`account.avatarPortrait`（独立字段，因为 `saveLook` 会整体覆盖 `account.avatar`）；6 个自绘预设头像；`capturePortrait()` 从 3D 形象截 128px 头肩 JPEG；外观改了而头像没重拍时**不显示旧头像**；个人主页身份卡 + 首页账号条共用 `portraitFor()`。
- 不信任存档：预设 id 白名单；图片必须是 ≤40KB 的 png/jpeg/webp data URL（拒绝 SVG / 外链 / 脚本）。
- 验证：单测 1821/1821（新增 13 条）、变异 8/8 抓到、金标不变、新 QA `avatar-portrait.mjs` 82/82（桌面+手机、无 WebGL、英文、账号隔离、篡改存档）、相邻 QA 330/330。
- QA 里发现并修掉：3D 头像按钮原地更新时只改 `aria-pressed` 不改文字。
- 未做（等批准）：W2 我的家、W3 Creator 垂直切片、W4 照片上传。

## R180 · Plan：ADR-010 T2 实现设计（只出设计，未改代码）

- 文档：`docs/implementation/ADR-010-T2-design.md`。T1 按报告验收、未重开；T2 待批准后才实现。
- 读码 + 实测得出、会改变方案的事实：①`createSeason({userTeam})` **丢掉战术和首发**（F1），T1 的选择要在创建后写回；②`saveSeasonAndCareer` 的兜底分支直接写 `cls_season_v1`，新赛季若不改路由会静默覆盖单赛季存档（F4）；③实测 82 场赛季 JSON ≈ 0.8 MB、32 队、86 天；④**把 `RS_GAMES` 换成 20：每队恰好 20 场，但每队只有 6–9 个不同对手、我方 7 个且全是同分区、0 场跨分区**（82 场是 31 个对手）——所以短赛季必须有独立赛程函数；⑤奖项资格线（`gp<20/25/40`、`gp/65`）写死 82 场，20 场赛季里 ROY/MIP 无人合格，要按赛季长度缩放。
- 设计要点：槽位 `cls_myteam_season_v1`，内容就是一个带 `myTeam` 元数据块的赛季对象；路由由被保存对象自身（`st.myTeam`）决定，不用会过期的全局标志；可玩副本只存一份（赛季队伍里）；开赛时重新校验，不信任保存的阵容。
- 过程中纠正自己一次：先猜"82 换 20 会让后排球队场次不够"，实测是错的（场次平衡没问题），真正的问题是对手多样性。
- 工具坑复现：macOS 没有 `timeout`（命令秒过却没跑）；node 里 `PLAYERS` 要手动装名册，否则 `createSeason` 空转卡死。
- 切片：T2a 引擎 → T2b 存储/归属/路由 → T2c 创建流 → T2d 续玩+验收。O1–O7 待你定。

## R181 · Code：Player Voice 图片附件（产品负责人 2026-11-07 定入 MVP）
- 做法：`feedbackImages.js`（按文件头字节认类型、>2MB 或尺寸超 1920 才重编码：WebP→JPEG，阶梯降尺寸/画质，压不下去就明说）、`feedbackAttachments.js`（按账号存 IndexedDB，不占 localStorage 配额；写失败会告诉玩家）、`feedbackTransport.js`（提交通道注册点，目前为空，所以"提交"仍是灰的并如实说明）。面板里：选择/拖拽（仅有鼠标的设备才提示拖拽）、缩略图替换/移除、`n/3` 计数。提交失败（返回 false 或抛错）文字、评分、截图全部原样保留；成功才清；提交中再点一次不会发两遍。
- 验证：单测 `feedbackAttachments.test.js`（含伪装成 .png 的 SVG、第 4 张、替换失败保留旧图、按账号隔离、存储报错不抛）；真浏览器 `scripts/qa/feedback-attach.mjs` 桌面/手机/英文 83 项（含 10MB 噪点 PNG 压到 ≤2MB、刷新恢复、切账号、失败/抛错/慢速双击/成功四种提交、手机每行缩略图 ≤56px）。全量 npm test 2009/2009。
- 顺带修的上游 bug：`304f5a6`（Account Level）在 `timeTravel/screen.js` 里调用了不存在的 `params.onStoryEventResolved`，每次处理 Reborn 故事事件都会 ReferenceError（被 try/catch 吞成一句怪提示，且不重绘）。已修并加回归测试（撤掉修复会变红）；这也是 lint 之前的 1 个 error。
- 踩坑：① QA 里英文 key 是 `courtside.lang`，我先写成 `cls_lang`，结果"英文"其实跑的是中文——所以现在加了"UI 语言确实是 en"的断言。② 图片查看器会缓存同路径的图，我差点据此误判"CSS 没生效"；改用浏览器里量布局数字才定论。③ 末尾空行又触发了 `git diff --check`。
- 没做（已进 BACKLOG）：游戏内一键截图、剪贴板粘贴、图片排序；服务端适配器（凭证只能在服务端，ADR-010）；服务端必须再校验类型/大小/张数。
