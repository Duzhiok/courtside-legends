# Work Note — 抽卡 / 养成 / 时空对决

分支 `feature/time-travel-foundation`（worktree）。**每完成一步就更新这里**；新想法先进「Idea backlog」，不丢。
状态：✅ 完成并提交　🟡 进行中　⬜ 未开始　💡 想法（未排期）

## 1→12 主线

| # | 项目 | 状态 | 备注 |
|---|---|---|---|
| 1 | 抽卡概率表 + 10/50 抽保底 | ✅ | `gacha.js` |
| 2 | 年代池 / 球队池每周轮换 | ✅ | |
| 3 | 心愿单 + 金币合成 | 🟡 | 面板标题需带球员名 |
| 4 | 每张卡独立成色（±6） | ✅ | `cardRoll.js` |
| 5 | 重复卡：升星 ★5 + 成色二选一 | ✅ | |
| 6 | 同人异赛季 → 球魂 | ✅ | |
| 7 | 正常阵容一人一卡 | ✅ | 账号阵容 / 选秀 / CPU |
| 8 | 时空对决（任意球员/年份/重复） | 🟡 | UI 打磨中 |
| 9 | 比赛领悟技能 | ✅ | `epiphany.js` |
| 10 | 本命养成 | ✅ | `accountProgress.js` |
| 11 | 首页入口合并 4 组 | ✅ | |
| 12 | 回归验证 | 🟡 | 每轮更新 |

## 本轮（第 2 轮）待办

| 步骤 | 内容 | 状态 |
|---|---|---|
| R1 | 概率显示改一位小数（之前合计 100.8%） | ✅ |
| R2 | 心愿单面板标题写球员名 | ✅ |
| R3 | 时空对决：开打放大、去缩进、重复卡合并 ×N | ✅（浏览器待回归）|
| R4 | 数据核查：NBA=2012 起转会球员合计行（927 张，合法）；合成价对金币进账合理 | ✅ |
| R5 | 卡池盘点 | ✅ 见下「卡池事实」|
| R6 | 提交 nameAliases + 中文搜索 | ✅ |
| R7 | 分解（卖球员）→ 金币 + 技能碎片；碎片换技能 | ✅ `accountRecycle.js` |
| R8 | 卡库容量 60 + 满仓禁抽（先于扣费检查） | ✅ |
| R9 | 图鉴进度（积累感，分解不丢） | ✅ 基础版（人数 / 超巨以上） |
| R10 | 修 `photoImg(p, 56)` 传数字当 class → 头像原图撑满（项目早期遗留 ×2 + 我抄了 ×1） | ✅ |
| R11 | 收藏网格：去掉 52vh 内嵌滚动；手机两列 | ✅ |
| R12 | 分解安全：全明星+ 必须二次确认；一键分解只收 <80，或冗余版本 <85 | ✅ |
| R13 | 年代 / 球队卡池改「池内相对档位」（同分用产出打破并列） | ✅ 真实卡池 3000 抽实测：单卡最热 0.4–2.0%（修复前 6.6%） |
| R13b | 教练抽也算一抽（推进保底）；保底触发那一抽不掷教练；教练揭示显示花费 | ✅ 修了「10 抽」实际是「10 次球员抽」的老 bug |
| R14 | 收藏页筛选 / 排序（搜索、稀有度、成色、年代、冗余版本、可分解） | ✅ `collectionFilter.js`；手机两列筛选栏 |
| R14b | 回归：收藏卡 flex-column 把技能标签拉成整行条（我自己引入）→ 改回块级流 | ✅ |
| R14c | 浏览器回归脚本收进 `scripts/qa/`（原在 /tmp） | ✅ |
| R15 | 新手保底（前 5 抽必有 85+）+ 新号 4 张抽卡券 + 每日任务 + 5 胜里程碑 | ✅ `dailyTasks.js` |
| R16 | 头像错图：`photos.scraped.js` 抓取按文件名匹配，混入签名篮球盒 / 公交站台 / 1934 年油画 / 球场 / 签名现场 / 双人合影等 → `NOT_A_PORTRAIT` 精确黑名单（回退 NBA 头像 → bref 头像） | ✅ 共 14 条规则，测试保证每条都真的存在于数据里 |
| R17 | 抽卡页卡池说明：副标题（张数/人数/按绝对 OVR 还是池内排名/几天后轮换）+ 说明面板（本池最强、心愿球员在不在池里）；规则文案更新（抽卡券、金币加抽上限、新手保底）；主按钮上移 | ✅ 手机抽卡按钮 1389px → 725px（首屏内）；文字对比度全部 ≥ 5.3:1 |
| R18 | 奥尼尔等「借邻近年代照」：新建 `photos.curated.js`（人工整理 + 署名信息，优先于抓取表）；奥尼尔 1990 年代用 1998 年特写，2000/2010 年代用 2007 热火胸像 | ✅ 已亲眼看过图；奥尼尔 19 个赛季的卡不再是展品 / 场边抓拍 |
| R19 | **技能只剩三条路**：领悟、技能碎片购买、**球魂升星升到 ★5 时送 1 个**（你纠正过：触发点是球魂，不是抽到重复卡）。**奖项不再送技能**（原先每个奖都能「任意自选技能包」，强者越滚越强）。★5 礼物只从 普通/稀有/史诗 随机，传说/神话只能碎片买；一张卡一次；不占「最多买 2 个」名额；抽重复卡升到 ★5 **不送**。删除死代码 `pickMergeSkill` / `MERGE_SKILL_POOL` / `listAwardSkill*` / `.award-skill-*` | ✅ 369 单测；变异检查（挪到抽卡路径 / 提前一星 / 去掉稀有度过滤）都会变红；真实浏览器桌面+手机 16 项 |
| R20 | **头像来源链 + 署名页**：本地插画 → 带署名的 Wikimedia 照片 → 程序生成头像（队色剪影 + 姓名缩写，不画真人）。**不再热链 NBA.com / Basketball-Reference / ui-avatars**；一张照片必须能说出作者和许可证才会显示（`photoCredits.js` 由 Commons API 生成，收紧为必须是 CC BY / CC0 / 公有领域 / GFDL）。首页「图片来源与署名」页。顺手发现并拦下 11 张不是球员肖像的图（里根夫人×2、多人合影、**认错人的 1924 年 Lou Hudson**、7 张双人合照）。乔丹/伯德/约基奇补上 Commons 的 CC 照片（亲眼看过）。首页「设计要点」里**还写着已作废的重复卡规则**（随机学技能、合并 20 次），按代码改正并用测试绑死数字 | ✅ 全量 403 测试；浏览器 36 项（桌面+手机）；变异检查 4 种 |
| R21 | 头像改回热链 Basketball-Reference（你明确说本地自己玩不算盗图，**这推翻了 R20「不再热链」的决定**，仅限本地私人使用）；新增 `HOTLINK_HEADSHOTS` 开关 + `bbrefHeadshotUrl()`；优先级变成 本地插画 → 带署名 Wikimedia → **BBRef 热链（新加）** → 生成头像；覆盖全部 4398 个有 bref 的真人 | ✅ 458 测试；真实浏览器验证 Rondo/Drummond/Steele/Wilkens/Kidd 等截图里的球员头像加载成功 |
| R21b | 顺手修德拉蒙德被排到 SG：阵容溢出占位算法以前死板按 PG→SG→SF→PF→C 扫描第一个空位，208cm 中锋在 C/PF 被占时会被塞进 SG；改成按球员适配度排序找空位（复用 `recommendPlayPos` 的打分逻辑） | ✅ 新增 `playPosFallback.test.js`；变异测试验证退回旧逻辑会报红 |
| R22 | 教练席太窄：战术/节奏/换人/对位/5 条进度条挤成一列，要翻 3 屏 | ✅ 桌面教练席 481px → 695px，可视高度 574px → 702px；手机不受影响（本来就是单列铺满，已验证无横向溢出） |
| R23 | 「回主页」按钮重复出现 2 次——**真正原因不是代码回归**，`handleCareerResult` 两处 `homeBtn.hidden = true` 代码都还在、逻辑也验证是对的；是 `index.html` 里 `app.js?v=20261017matchup1` 这个缓存版本号好几轮改动都没打，浏览器可能一直跑旧 JS（或者同一个已打开的标签页本来就不会热更新） | ✅ 临时调试钩子在真实浏览器里复现+验证 eliminated 分支确实只剩 2 个按钮；bump 版本号到 `20261022dup-home`；调试钩子已清理，`js/app.js` diff 为零 |
| R24 | 全面 code review + README/WORKNOTE 补全 + 推送远端分支 | ✅ 见下方「R24 code review 发现」 |

| R25 | 加 eslint（flat config，只抓真 bug 的规则集：no-undef/no-unused-vars/no-dupe-*/no-unreachable 等，**不**管风格，没有 prettier）。第一次跑出 99 个问题，其中 84 个是误报（QA 脚本里 `page.evaluate()` 回调在浏览器里跑，但整文件按 Node 环境判——配置改成 QA 脚本两套 globals 都给）。剩下 15 个全是真·死代码：3 个顶层死函数（`resolveTeamRef`/`seedCareerRound`/`advanceCareerBracket`，旧 career bracket 重构后从没删）、3 个只剩声明没人读的局部变量（`avgEgo`/`paint`/`impact`——都是「算了但从没接进公式」的半成品，不是明显 bug，没有乱加新平衡逻辑，只删）、`cap` 被 `room` 悄悄取代、`confirmModal.js` 一个快照变量白存。逐个读代码确认「删了真的零行为变化」才删，不是看到 warning 就无脑删 | ✅ 0 error/0 warning；458 测试不变；两处误删函数时顺手发现自己留下的孤儿 doc 注释（描述已删函数、挂在别的函数头上），一并清理 |
| R26 | **第一刀真·拆 `app.js`**（10,217 → 10,086 行）：`teamStarters`/`simulateCpuMatch`/`budgetGold`/`buildAffordableShop`/`rollScoutPackOffer` 零 DOM 耦合，纯逻辑，挪进新文件 `js/engine/careerEconomy.js`（跟已有的 `careerBracket.js` 是邻居：一个管对阵结构，一个管 CPU 模拟 + 市场经济）。之前这 5 个函数完全没有单测——app.js 里的东西没法单测是今天 code review 点名的头号风险——现在补了 12 个真测试（含一个故意改坏 `budgetGold` 验证测试真的会抓到的变异检查）。不是为了拆而拆：只挑了「零 DOM、零 `$()`、能独立单测」的这一类，UI 渲染/事件绑定的部分这轮没碰，继续放着（风险/收益比不划算，没有 UI 层自动化测试兜底） | ✅ 470 测试；真实浏览器验证金币晋级赛商店渲染正常（23 张卡，0 个 pageerror）|

## 卡池事实（2026-10 实测，roster.json）

- 23,452 张赛季卡 / 4,398 个真人 / 1951–2025；无重复行；无缺人（姚明 `mingya01`、Faried `farieke01`）。
- 卡面全是**英文名**，中文只靠 `nameAliases.js`（80 位热门球星）。
- 按 OVR：神话 96+ 55 张（0.23%）、传奇 93–95 76、超巨 90–92 107、全明星 85–89 533、先发 80–84 692、轮换 74–79 2,989、普通 <74 19,000（81%）。
- **只有 192 个人有 85+ 的卡**；3,419 人一生都没有 74+ 的卡。
- 85+ 数量按年代：1950s 2 / 60s 27 / 70s 39 / 80s 57 / 90s 51 / 00s 36 / 10s 256 / 20s 303 → 老年代、2000 年代卡池很「水」（评分模型偏现代）。
- `team: "NBA"` = 2012 年起赛季中被交易的合计行，927 张，合法，但不会进球队卡池。
- 抽卡概率：85+ 共 18.3%/抽 → 连抽 9 次一张都没有 = 16.8%（第 10 抽保底兜住）；10 抽无 90+ = 48%；50 抽无 93+ = 28%（50 抽保底兜住）。
- 金币：排位胜 +40 / 负 +12，低档抽卡 +10~20；加抽 ¤200；合成 传奇 ¤1600 / 神话 ¤2600；分解传奇回 ¤500，所以「合成→分解」净亏 69%。

## 经济规则速查（当前）

- 抽卡来源优先级：每日免费 1 → 抽卡券 → 金币（¤200，每天最多 2 次）。
- 抽卡券来源：新号礼包 2 张（一次，R47 由 4 砍到 2）、每日任务最多 3 张（「打 1 场排位」+1、「排位赢 1 场」+1、「金币挑战赛赢 1 场」+1，R47 新增第三项）、今日挑战 +2、排位累计每 5 胜 +1。
- 保底：前 5 抽必有 85+（一次，且那一抽无视所选卡池、一定从常驻池出）；之后每 10 抽 85+、每 50 抽 93+。教练卡也算一抽，保底那一抽一定是球员。
- 年代 / 球队池：档位按「池内排名」映射到全库同排名（`relativeRater`），揭示卡显示「池内 X 档」；保底计数按池内档位走。
- 卡库 60 张；分解价值见 `accountRecycle.js`。

## 踩坑记录（别再犯）

- `photoImg(player, cls)` 第二个参数是 **CSS class 字符串**，传数字会让头像原图撑满。
- 排名映射遇到大批同分（2000 年代池 450 张同为 72）会让某些档位只剩 3 张卡 → 单卡 6.6%。必须有二级排序。
- 「保底」承诺的是第几抽，就得把所有抽法（含教练卡）都计入，否则界面和实际不一致。
- 测试写完要做变异检查（临时关掉功能看测试会不会红），否则可能是摆设。
- 浏览器断言别假设每抽都是球员：20% 是教练卡。
- 给收藏卡加 `display:flex; flex-direction:column` 会把裸 `<span>` 技能标签拉成整行条；要并排换行就保持块级流。
- 回归种子账号必须固定成色 roll，随机成色会让「可分解」凭运气消失、后续检查被跳过。

- 抓取头像「加载成功」≠「是那个人」：1991 乔丹加载一直正常——是个签名篮球展示盒。要看截图、打印真实文件名。
- 截图一律写新文件名；复用路径时读到过旧图，据此下过错误结论。
- 主操作按钮别被说明文字挤到首屏外：量 `getBoundingClientRect`，别凭感觉（抽卡页曾在手机 1389px 处）。
- 灰色小字要量对比度（从真实像素取背景色），有色底上会掉到 3.4:1。
- 读图要等下载完成：别把「下载」和「读图」放进同一批并行调用。
- 统计脚本要和运行时用同一套优先级（人工表优先），否则会给出错误数字（奥尼尔曾被多算 19 张）。
- 沙箱里 `cdn.nba.com` 浏览器不通但 curl 通；这类格子标「未验证」，别当成代码坏了。
- **文件名不是证据**：要看图。`Lou Hudson and Connie Smythe, 1924` 是另一个 Lou Hudson；`Nancy Reagan Being Lifted…` 挂在巴克利名下。图片联系表别用 `page.setContent` + `file://`（about:blank 读不了本地文件，得到的是裂图）——内联 base64，并**打印 `naturalWidth` 确认真的解码了**，别拿一张裂图当结论。
- **我自己写的检查也会错**：去重检查和被检查的代码用了同一个错误公式，于是报告「0 个残留」而实际还有 14 个。换成字面量搜索（直接 grep 那个字符串）。
- **别凭印象写门槛和规则文案**：`requireAccountReady` 要 ≥12 张卡（我先猜 4、又猜 5）；首页重复卡规则我漏写了「满 ★5 重复 → 2 球魂」「异赛季版本 → +1 球魂」，读 `applyPlayerPull` 才对。现在 `homeRulesText.test.js` 把文案里的数字和代码常量绑死。
- `loading="lazy"` 的图不滚到视野里既不加载也不报错：QA 里先逐张 `scrollIntoView`，别放宽断言。
- QA 脚本的结果要**即时打印**，别攒到最后——中途崩溃会连已通过的检查一起丢。
- HEAD 请求在代理下的 `content-length` 不可靠（报出过 2 KB 的假数字），查大小用 API 的 `size`。
- 发现 `Public domain` / `CC BY` 之类并不等于「可展示」：先看是不是肖像、是不是本人、有没有作者，再谈许可。


- **改了卡片内容必须提升 `ROSTER_SCHEMA`，否则玩家浏览器一直用旧卡**（10-18 起技能表改了 6 次从没提升，Garnett 的 篮下暴君/传球魔术 一直"复活"）。现在有 `tests/cardSchema.test.js`：卡片指纹和 `tests/fixtures/cardSchema.json` 对不上就变红；提升版本号后跑 `node scripts/cards/update-schema-fixture.mjs` 记录（版本号没动时脚本拒绝覆盖）。快路径也不再信任旧版本号的记忆键（`isCurrentSchemaKey`）。
- **别用姓氏/名字片段匹配球员**：`/fox/`、`/luka/`、`/simmons/`、`/kobe/`、`giannis` 都误伤过别人（Jim/Rick Fox、Luka Šamanić、Kobe Bufkin、Papagiannis…）。用 bref 或全名。`tests/namePatterns.test.js` 会扫 `js/` 下所有 `.test(name)` 正则，匹配多人且不在白名单就失败。
- **隐藏信息不能写在还能选/买的卡上**：「高薪低能」「妖人」同属隐藏分类，选人/商店里不显示，买球探包才揭示，入手后（自己队里）才显示。规则集中在 `js/ui/valueBadge.js`。
- 球员专属技能是人手写的（`SIGNATURE_SKILLS`），"某人不该有某技能"以用户为准：Bird 无 传球魔术，Garnett 无 篮下暴君/传球魔术。
- **改完 `js/app.js` 记得顺手打一下 `index.html` 里 `<script src="js/app.js?v=...">` 的版本号**：改了好几轮都没打过，导致一个明明在源码里已经修好的 bug（重复「回主页」按钮）在浏览器里看起来还是没修——用户已经打开的标签页本来就不会热更新，版本号没变时刷新也未必保证重新拉取。查这类「代码读起来是对的，但现象还在」的问题时，先怀疑缓存，别一直死磕代码逻辑。

## Idea backlog

- ~~**AI 生成自有头像（2026-10-21 你提出）**~~ ✅ R21 已有决定并落地（不是用 AI 生成插画，是**热链 Basketball-Reference 真实头像**，你明确说本地自己玩不算盗图）。优先级最终是：本地插画 → 带署名 Wikimedia → **BBRef 热链** → 程序化头像兜底。本地插画这条目前还是空的（`assets/avatars/` 没有文件），所以现实中绝大多数卡最终走的是 BBRef 热链，不是插画。公开发布前要重新评估——代码注释已经写明 `HOTLINK_HEADSHOTS` 不适合直接用于对外发布的默认配置。

- ✅ 新手保底（已做，见 R15）
- ✅ 每日任务（已做）；💡 连续登录奖励（未做）
- 💡 图鉴按年代/球队的完成度奖励；名人堂（退役卡）
- 💡 赛季通行证式里程碑（排位胜场 → 球魂/碎片）
- 💡 `$5/月` 只做便利（更多加抽上限/外观），不卖概率；需要后端后再做
- 💡 玩家间交易：不做（见回答），改用「系统回收 + 心愿合成」
- 💡 年代卡池用「池内相对档位」（池内前 x% 当传奇/超巨…），否则老年代池全是普通卡
- 💡 卡片「锁定」按钮（防误分解）
- 💡 图鉴按年代 / 球队的完成度奖励；图鉴详情页（点开看未获得的人）
- 💡 头像：某些球员映射到错图（1991 乔丹显示成「签名篮球展示盒」照片）→ 查 `photos` 映射

- 💡 本地插画批量生成（先 9 位首页传奇，规格见 `docs/AVATAR_SPEC.md`）；放进 `assets/avatars/<bref>.webp` 再跑 `scripts/avatars/build-manifest.mjs`。
- 💡 「非当季照」提示（卡面小标 + `photoSourceOf` 区分同十年 / 借来的）。
- 💡 `NOT_A_PORTRAIT` 搬到抓取阶段校验（现在重抓会再混进来；黑名单已在独立模块 `photoBlocklist.js`）。

## 决策记录

- 玩家间交易：**不做**。RMT / 小号刷卡风险；本地 localStorage 也无法防作弊。
- 成色合并：整套二选一，禁止逐项取高。
- 同一真人：只有「时空对决」允许重复。

### R20 遗留（💡 新发现，没解决）

- **署名数据怎么维护**：改了 `photos.curated.js` 或 `photos.scraped.js` 之后必须跑 `NODE_USE_ENV_PROXY=1 node scripts/photos/build-credits.mjs`（代理环境才需要那个变量）；测试 `photoPolicy` 会在署名与实际用到的照片对不上时变红，所以忘了会被抓住。`photoCredits.js` 是**提交进仓库的生成物**。
- **「Public domain」只是 Commons 上的登记，我没法核实登记本身对不对**：30 张里 14 张作者是 *Unknown author*（1950–70 年代新闻照）。公开发布前抽查。
- **仍然借用邻近年代的照片**：LeBron 2013 的卡角标写 MIA，照片穿骑士 23 号（收藏页截图里肉眼可见）。奥拉朱旺首页格子标「90 年代」，图是 1984 年报纸扫描。卡面/格子上还没有「非当季照」提示（`photoSourceOf` 目前只区分 local / era / generated，要区分「同十年」还是「借来的」需要 `eraPhoto` 多返回一个标记）。
- **画风不统一**：贾巴尔、奥拉朱旺是黑白报纸网点照，其余彩色摄影。想统一只能靠本地插画（`docs/AVATAR_SPEC.md`，`assets/avatars/` 现在是空的）。
- **7 张原图像素偏低**（Iverson、Malone、Carter、Robinson、English、George、Twyman，宽 173–316px）：圆形头像够用，大格子偏软。Commons 上这些老照片本来就只有这么大。
- **名册姓名不一致**：同一个人不同赛季有 `Nikola Jokić` 和 `Nikola Jokic´` 两种写法（收藏页卡上能看到多出的重音符号）。与头像无关，没动。
- 首页墙乔丹头顶贴边（`.legend-tile img { object-position: center 20% }` 可调）。
- 用到 Google Fonts（原本就有）：是第三方请求，上线前看隐私要求。
- 本地插画肖像权：AI 插画解决图片版权，不解决肖像权/队徽商标，见 `docs/AVATAR_SPEC.md` 末尾。

### R19 遗留（💡）

已定（2026-10-21）：礼物不做醒目标签；老的「执教席 · 技能包货架」**保留**（单局模式可以买）；技能礼物只在球魂升星到 ★5 时给。

- ⚠️ **设计上的坑**：一张卡如果是**抽重复卡**升到 ★5，就永远拿不到礼物（★5 之后球魂升不了了）；只有「★4 → 用球魂升」才有。而重复卡抽中是自动升星的，玩家控制不了。结果：礼物拿不拿得到取决于最后一星怎么来的，容易让人觉得不公平。要改成「任何方式升到 ★5 都送」只要把 `giftStarSkill` 也挂到抽卡路径（一行），我没改，因为你明确说的是球魂。
- **礼物稀有度上限 = 史诗**（常量 `STAR_SKILL_RARITIES`）。可学技能共 70 个：普通 1 / 稀有 9 / 史诗 14 / 传说 23 / 神话 23，不设上限的话 46/70 会随机到传说以上。
- 成色二选一在 QA 里两边相同，是因为测试固定了 `Math.random`；真实环境有差异，由单测 `compareRolls` 覆盖。
- 领悟阈值是助攻 ≥9（不是 15），你想改告诉我。

### R18 遗留（💡）

- 仍借用别的年代照片的卡：**65 张 / 7 人（0.28%）**——LeBron 16、贾巴尔 10、科比 10、Jerry West 9、World Free 9、Carmelo 9、Vince Carter 2。都是同一个人的真人像、差一个十年，不是坏图。补法：Commons API 可用（`list=search&srnamespace=6` + `prop=imageinfo&iiprop=extmetadata`），逐张**看图**、核对授权，再写进 `photos.curated.js`。
- ~~**署名展示缺失（法律向，别拖）**~~ ✅ R20：署名页已做，署名数据由 `scripts/photos/build-credits.mjs` 生成，89 个文件 0 个未认证。
- 首页传奇墙：奥尼尔脸在格子里偏小（可调 `object-position`）；Basketball-Reference 头像仅 120px 偏软。

### R17 遗留（💡）

- 全站 `.tiny` 灰色 `rgb(107,114,128)` 在白卡片上 4.69:1，在有色底上 3.4–4.3:1，不达 WCAG AA。本轮只在抽卡页 / 收藏页加深；是否改全站变量需要单独决定并做一遍视觉回归。
- 抽卡页文案里的数字来自常量（测试保证不再与代码脱节）；新增抽卡规则时记得同步 `drawRulesHtml`。

### R16 遗留（💡 未排期，别丢）

- ~~奥尼尔首页格子~~ ✅ R18 已解决。（更正：我上一轮说他「没有 2000 年代图、借了邻近年代」是错的——他有 1990/2000 两条记录，都是名人堂展品，被黑名单拦下后才落到 2010 的场边抓拍。）
- 「邻近年代回退」会让贾巴尔 80 年代卡用 1970 年照片、奥拉朱旺 90 年代卡用 1984 年报纸扫描。同一个人但年代差一个十年；可考虑卡面标注「非当季照」或优先同十年。
- ~~Basketball-Reference 头像只有 120px 宽~~ ✅ R20：这条回退已删除。
- ~~约基奇首页格子依赖 `cdn.nba.com`~~ ✅ R20：不再请求 NBA CDN，换成 Erik Drost 的 CC BY 2.0 照片。
- `NOT_A_PORTRAIT` 是人工黑名单；抓取脚本本身仍按文件名匹配，重抓会再混进来。长期应在抓取阶段加校验（过滤 signed / jersey / statue 等，或人工审核表）。

### R24 code review 发现（2026-10-22）

扫了一遍整个仓库，不是逐行读，是结构性检查（文件体积、console.log/debugger 残留、TODO、重复函数名、eslint 配置、测试覆盖）。

**健康的地方：**
- 没有任何 `console.log` / `debugger` 残留在 `js/` 源码里（排除 `console.error`）。
- 没有 `TODO` / `FIXME` / `XXX` / `HACK` 标记——不代表没有技术债，只代表债都欠在这份 WORKNOTE 里而不是代码注释里，这是好事。
- `js/app.js` 里没有重复的顶层 `function` 声明（没有互相覆盖的隐患）。
- 测试没有 `.skip()` / `.todo()`，458 个测试全部是真跑的，不是摆设。
- 没有遗留的 `.tmp` / `.bak` / `*copy*` 文件。
- `git diff --check` 常年干净，没有行尾空白堆积。

**真正的技术债（按严重程度）：**
1. **`js/app.js` 已经 10,217 行**，远超项目自己定的 600 行指导线一个数量级。这是单一最大的架构问题——几乎所有模式（排位、金币晋级赛、赛季、联盟经理、时空对决、穿越生涯…）的 UI 接线都堆在这一个文件里。好消息是它内部按功能区块组织得还算清楚（每个 `handleXxxResult` / `renderXxx` 职责单一），没有互相嵌套的意大利面；坏消息是任何一次修改都要在一万行里先定位，这次查重复「回主页」按钮就因为少查了 `handleSeasonResult` 一个分支而多绕了一圈。**不建议现在动手拆分**——10K 行代码一次性重构的回归风险极高，且没有 UI 层的自动化测试兜底（测试主要覆盖 `js/engine`、`js/data` 的纯逻辑），拆分应该是一个单独立项、慢慢按模式拆到 `js/modes/` 的长期任务，不要在日常修 bug 时顺手动。
2. **没有 eslint/prettier**，只有 `node --check` 做语法检查 + `node:test` 做行为测试。这意味着：没有自动发现「未使用变量」「可能的 null 解引用」「一致的代码风格」之类的静态问题，全靠人读代码和写测试兜底。目前测试覆盖率给的信心足够高（458 个测试，且历史上多次证明变异测试能抓到真实回归），短期不是紧急问题，但项目体量越大风险越高。
3. **`css/style.css` 3330 行**，也偏大，但 CSS 的「认知复杂度」天然比 JS 低（没有执行流程、没有副作用），风险小很多，不算紧急。
4. `js/data/historicalSeasons.js`（16,936 行）和 `js/data/ratings2k.scraped.js`（7,902 行）体积很大，但这些是**数据文件**（抓取/生成产物），不是手写逻辑，行数不代表复杂度，不算技术债。

**不在本轮修的原因**：以上都是「值得知道但不该顺手动」的问题——用户这轮要的是 review + 文档 + 同步，不是重构；贸然拆 `app.js` 这种大文件在没有明确授权和专门时间窗口的情况下风险/收益比很差。

### 远端同步状态（2026-10-22）

- `feature/time-travel-foundation` 从未推送过（`git ls-remote` 确认远端只有 `main`）。
- 经核实：**origin/main 是 `feature/time-travel-foundation` 的纯祖先**（`git rev-list --left-right --count origin/main...feature/time-travel-foundation` = `0 29`，origin/main 没有任何本分支不包含的提交）——也就是说把这个分支推上去是一次干净的 fast-forward，不会和 main 产生任何冲突。
- 本地 `main`（另一个 worktree，`~/Myproject/nba-coach-sim`）落后 origin/main 44 个提交，是另一条独立的陈旧状态，这轮不处理（不碰 main checkout）。
- 本轮按用户明确指示：只推 `feature/time-travel-foundation` 分支本身到远端作为备份/同步，**不触碰、不合并、不快进 `main`**，合并到 main 留给用户自己决定。


### R27：拆第二刀 app.js + 修好 R25/R26 发现的存档 quota bug

- **第二刀拆 app.js**（10,086 → 10,026 行）：`noteCareerLoss`/`noteCareerAllTeamGame`/`runCpuMatchInto`/`yourCareerMatch`/`computeCareerAllTeam` 这五个跟上一刀挪走的 `teamStarters`/`simulateCpuMatch` 不是一类——它们是「晋级赛对阵结构」的逻辑，跟 `careerBracket.js` 里已有的 `buildStagePods`/`progressPod*` 是同一个关注点，所以挪进 `careerBracket.js` 而不是 `careerEconomy.js`（没有为了偷懒塞进同一个文件）。其中两个（`runCpuMatchInto`/`yourCareerMatch`）原本靠读 `state.career` 这个隐藏全局变量，这轮顺手改成显式接收 `c` 参数——6+3 处调用点逐个确认过都已经在局部作用域里有 `c`，是纯重构不是行为变更。`careerBracket.js` 之前零测试（尽管早就有真实的对阵推进逻辑），这轮补了 10 个，含一个变异检查。
- **修了 R25/R26 遗留里记的那个 `QuotaExceededError`，根因比想象中有意思**：不是「存的数据太多」，是**同一个 team 对象在 `career.team`、`alive[]`、每个 pod 的 `teams[]`、每场 match 的 a/b/winner/loser 里被引用了几十次，而 `JSON.stringify` 不认识对象共享引用，每次遇到都原样展开成一份独立的完整拷贝**——32 支队伍的名册被重复序列化几十遍。实测：全新开一局金币晋级赛，一局都没打，`cls_savegame_v1` 的 payload 就有 **7,863,440 字节**（写入直接抛 quota 异常，存档完全没存上）。修法：`serializeCareer` 按 `bracketId` 把每支队伍只序列化一次放进 `teamsById` 表，其它出现的地方全部换成 `{ __teamRef }` 占位符；`reviveCareer` 反向解出来，并且**对同一个 id 的所有占位符返回字面上同一个对象**——这不只是省体积：代码里 `seedCareerStage()` 本来就靠 `c.team` 和 `alive[]` 里的「你」是同一个对象（改名册要处处同步可见），旧的 `jsonClone` 写法其实一直在悄悄破坏这个前提，只是没人注意到，这次顺手把这个隐藏的一致性 bug 也修了。真实浏览器验证：同一个复现场景从「写入抛异常，存档没了」变成「2,122,213 字节，写入成功」，完整 保存→刷新页面→继续进度→商店正常渲染 跑通，0 个 page error。
- **`js/data/savegame.js` 之前也是零测试**，这次补了 7 个，全部是纯函数测试（`serializeCareer`/`reviveCareer` 不碰 `localStorage`，不需要 mock）：体积量级回归、「每支队伍只写一次」检查、往返正确性、共享引用在 revive 后真的恢复（含一次「改 c.team.players 后 alive[] 里也能看到」的活体验证）、非 bracket 形状（双人模式）和 null 输入的防御性测试。变异测试故意把「返回同一个引用」改成「返回浅拷贝」，测试立刻报错，确认测试真的在验证这件事而不是走过场。

### R28：拆第三刀 app.js（app.js 终于跌破一万行：10,026 → 9,983）

- **位置相关的三个函数**（`groupByPosition`/`playerSlotPos`/`resolveStarterPositionCollisions`）挪进 `gameplan.js`——那边本来就有 `playPosFitScores`/`recommendPlayPos`/`nextEmptyPlayPos`，"球员该打哪个位置"这摊逻辑终于归到一个文件，不再分裂成两处。顺手发现 `gameplan.js` 自己早就有一个功能等价的 `normPos5`，跟 app.js 的 `normalizePos` 写法不同但对所有真实位置字符串结果一致——没有把 `normalizePos` 一起搬过去制造第三份重复实现，而是让搬走的函数复用已有的 `normPos5`；`normalizePos` 本体留在 app.js 不动，因为那边还有 36 处别的调用点，犯不着为了这次顺手重构去动它们。
- **`applyCareerInjuryWave` 挪进 `careerBracket.js`**，跟前两轮搬过去的几个 career 相关函数做邻居——只摸 `c.team`/`c.alive`/`c.series` 这套 bracket 结构，零 DOM。
- 新增 `tests/starterPositionSlots.test.js`（8 个）+ `tests/careerBracket.test.js` 追加 4 个。两边都抓到了真实的变异：一个是把 collision-resolution 的 while 循环条件改坏；另一个更有意思——第一版「跳过 alive[] 里的你，避免重复算」测试写挂了：用了同一个共享球员对象模拟两次出现的「你」，结果第二次处理时球员已经在第一次被治愈，新一轮随机伤病判定是否触发完全看运气，导致就算真把去重逻辑删掉，测试也可能侥幸不报错——属于「测试本身没有真的在测这件事」。改成两个**不同对象**但都标 `bracketId: "you"`，才真正测到「按 id 去重，不是按对象引用去重」这条实际逻辑，变异测试复测后能稳定抓到。
- 全量 499 测试、lint、真实 headless-Chromium 过了一遍金币晋级赛（商店渲染正常）和选秀页的位置板（`groupByPosition` 的主要 UI 消费者），0 个 page error。

### R29：马特巴恩斯加场上恶汉；保罗乔治换技能

- Matt Barnes（`barnema02`，之前零签名技能）加入 `lockdown`/`sticky_wrap`/`enforcer`（场上恶汉），归到 Artest/Cousins 那组「铁防+暴躁」球员堆里。`enforcer` 这个技能本来就有（名字是"场上打手"，跟用户说的"场上恶汉"概念一致），直接复用，没有为同一个概念再开一个新技能 ID——顺手发现这个技能目前是纯 flavor，`sim.js`/`chemistry.js` 里完全没接，跟同组大多数 trait 技能一样只是展示用的标签，不像 `charge_taker` 真的会影响造进攻犯规概率。已在回复里跟用户说清楚这一点。
- Paul George（`georgpa01`）去掉 `rainmaker`（三分雨）、`mid_maestro`（中投大师），保留 `lockdown`、`midrange_assassin`（中投刺客），加 `rhythm_master`。用户说的是"运球节奏大师"，但已有技能叫"节奏大师"——描述（靠变速/试探步甩开防守，不吃防守人速度）正好符合需求，所以直接复用而不是为 Luka/Harden/George 三个人各开一个几乎一样的技能。这点也在回复里标注，万一用户是真想要个带"运球"二字的独立技能可以再说。
- `tests/skillComplaints.test.js` 里上一轮（R-早期）写的 Paul George 测试原本断言他**必须有**三分雨/中投大师——那是当时修"乔治缺技能"遗留的旧断言，这轮改成断言新技能组合 + 明确断言旧技能已经不在了，否则这个测试会变成一份过期文档。新增 Matt Barnes 测试。
- 技能变化影响所有卡片输出，`ROSTER_SCHEMA` 从 45 bump 到 46，重新跑了 `scripts/cards/update-schema-fixture.mjs`。
- 真实浏览器验证：乔治 15 张卡全部是新技能组合、不含旧技能；巴恩斯 14 张卡全部有 `enforcer`；0 个 page error。全量 500 测试、lint 全绿。

### R30：Wikipedia 自动发现头像，大幅提升真实头像覆盖率

用户反馈：大多数球员头像还是没有换成真人照片，要求尽量让每个人至少有一个头像，有多张可用照片的球员按赛季年代给不同头像。

根因排查：
- 之前的头像链路（本地插画 → 有署名的 Wikimedia 照片 → BBRef 热链头像 → 生成头像）本身没问题，但"有署名 Wikimedia 照片"这一档此前只手工整理了 75 个人（173 个 bref:decade 条目），对 4398 个真实球员来说覆盖率只有 1.7%。
- BBRef 热链实测命中率约 50-55%（抽样测试），很多角色球员、尤其 1980 年代以前的球员在 basketball-reference.com 上根本没有头像资源，会 404 回退到生成头像——这是用户感知"头像没换"的主要原因。
- 真实浏览器验证确认 BBRef 热链本身能正常加载（之前怀疑的"全部 error"是我自己的测试脚本手滑传了一个错误的强制代理配置，不是真的网络问题）。

新增自动发现管线：
- `scripts/photos/discover-wiki.mjs`：用 Wikipedia 的 `action=query&prop=pageimages|pageprops` 批量接口（一次最多 50 个条目）按球员姓名查 Wikipedia 词条首图。只接受 `/wikipedia/commons/` 路径的图（排除英文维基本地非自由版权头像），并用 `pageprops["wikibase-shortdesc"]` 里是否含 "basketball" 做兜底校验，防止撞车到同名的其他名人。找不到的名字会再试一次"<姓名> (basketball)"消歧义后缀。
  - 第一版用 Wikipedia REST `page/summary` 单条查询，结果在公司共享出口 IP 上撞到限流，1 条要等到 10+ 秒；改成批量 `action=query` 接口后，4323 人只需要约 90 批请求，几分钟内跑完。
  - 产出写入新文件 `js/data/photos.wiki.js`，导出 `PHOTO_BY_BREF_WIKI`，在 `photo.js` 的合并优先级里排在 `scraped`/`curated` **之下**（自动名字匹配的可信度低于人工核实过的条目，绝不会覆盖已有的手工数据）。
- `scripts/photos/build-credits.mjs` 升级：
  - 加了 429 重试退避（之前遇到限流直接崩溃，现在等一等重试，并且每批次就增量写盘，中途失败不会丢光已验证的结果）；
  - 新增校验：许可证要求署名（非 Public domain / CC0）但作者写的是 "Unknown author" 时直接拒绝——这种组合在法律上没法真正署名，不能用；
  - 现在同时扫描 `photos.wiki.js`（仅限该 bref 还没有手工数据覆盖时）。
- 新增 `scripts/photos/prune-uncredited-wiki.mjs`：跑完 `build-credits.mjs` 后，把没通过版权校验的候选从 `photos.wiki.js` 里摘掉、转成 miss 记录，保证数据表里不会留着"反正也用不了"的死数据。

最终结果：
- 发现 2574 个候选，经版权校验后 2561 个干净（13 个因许可证只是"Attribution"或作者未知+需要署名的许可证被拒绝，含 5 个是本轮新加的"未知作者+需要署名许可证"校验才抓到的，之前会漏判）。
- 全库 2640 个 Commons 文件全部拿到署名信息，0 个 UNCREDITED。
- 全库 4398 个真实球员中，2625 人（59.7%）现在有真实、有署名的历史/现代照片；1950 年代的 Cousy、Schayes、Pollard、Macauley、Arizin 等名人堂球员是这批新增里的典型代表，真实浏览器加载验证全部成功、0 个 page error。
- 剩下约 1773 人仍走 BBRef 热链，其中约一半会成功加载，另一半会在浏览器里通过现有的 `onerror` 回退机制换成生成头像——即"每个人至少有一个头像"的底线。
- 自动发现这一层**每人只有一张代表照**，不是按年代给不同头像；按年代/球队区分多张头像的能力仍然只存在于手工整理的 `photos.scraped.js`/`photos.curated.js` 两层（`eraPhoto()` 的就近年代回退逻辑没变）。如果要让新发现的 2561 人也按年代区分头像，需要针对每个人再去扒 Wikipedia Commons 分类下的多张历史照片，工作量大得多，这轮没有做。

测试/文档改动：
- `tests/photo.test.js` 新增 5 个针对 `photos.wiki.js` 的测试（候选 URL 格式、与手工数据不重叠、1950 年代球星确有候选、署名后能通过 `eraPhoto()` 正确展示、未署名的不会展示）；把一处用真人 `rondora01` 做"走热链"示例的旧测试换成了虚构 bref，避免以后自动发现覆盖到他导致测试变脆。
- `tests/photoPolicy.test.js`：
  - 更新"署名覆盖面必须和数据表完全对应"测试，让它也扫描 `photos.wiki.js`；
  - 放宽"CC0/Public domain 可以没有真实作者"的豁免到两种许可证（原来只豁免 Public domain，但 CC0 本质也是放弃全部权利，不该卡作者名）；
  - 更新两个被新头像大幅改变分布的硬编码阈值断言（"热链覆盖 20000+ 张卡"改成"热链仍覆盖有意义的一部分，但不再要求是大多数"）。
- `ROSTER_SCHEMA`：46 → 47（头像变化会改变卡片输出，必须 bump 避免浏览器继续用旧缓存）。

验证：
- `npm test`：505/505 全绿；`npm run lint` 全绿；`git diff --check` 通过。
- 真实 headless Chromium 验证 5 个 1950 年代新头像全部成功加载，0 个 page error。

遗留事项：
- BBRef 热链仍有约一半会 404，最终体验里这部分人会落到生成头像——用户已明确接受这是底线，不是 bug。
- 自动发现只给一张代表照，没有按年代区分；如果用户对某些球员的"年代感"有强烈要求（比如想要球员职业生涯早期/巅峰期/暮年分别用不同照片），需要后续针对性扩充 `photos.curated.js`。
- `discover-wiki.mjs`、`build-credits.mjs`、`prune-uncredited-wiki.mjs` 都设计成可重复运行、增量更新——以后新增球员或想再捞一轮漏网之鱼，直接重新跑这三个脚本即可（顺序：discover → build-credits → prune → build-credits 再跑一次确认 UNCREDITED 为空）。

### R31：教练席高度上限再提一次（940px → 1240px）

之前（06f8a96）把教练席从 `min(72vh,780px)` 加到 `min(88vh,940px)`，用户反馈还是不够长。根因：绝对上限 940px 在任何超过约 1070px 高的屏幕上都会提前把面板截断，下面留一大片空白——`min(vh, px)` 取两者较小值，高屏幕上 `vh` 那边早就超过 940，所以 940 这个硬顶一直在起作用。把 `.court-wrap` 的 `min-height` 和配对的 `.coach-panel` 的 `max-height` 一起从 `min(88vh,940px)` 提到 `min(94vh,1240px)`（两者靠 `align-items:stretch` 保持等高，必须一起改）。用 computed style 验证：1280×800 下 704px→752px，1440×1024 下约 901px→962px，1920×1200 下 940px（硬顶）→1128px（这才是真正受益的场景）。390px 移动端走 `max-width:800px` 断点下的 `max-height:none`，不受影响。505/505 测试、lint、diff-check 全过，已提交并推送（`98cd32d`）。

### R32：盖帽率调高 + Isaiah Thomas 补技能（排除"场上恶汉"）

**1. 整体盖帽率偏低**

用户反馈游戏盖帽太少。实测验证（真实 `GameSim.runFast()` 跑 30-50 场，统计全场 `blk`/`fga`）：改动前 2023 掘金 vs 凯尔特人主力阵容平均每场双方合计只有 **3.5 次盖帽**，盖帽率 1.98%（盖帽数/总出手数）。真实 NBA 这个口径大约是 9-10 次/场、5.5% 左右——这游戏只有真实水平的三分之一左右，用户的感觉是对的。

根因：`calcBlockChance()`（`js/engine/sim.js`）的基础值本来就偏低（禁区 0.014 起步，中投 0.01，三分 0.003），叠加上面一长串几乎全是"降低概率"的身高/力量/终结能力修正项（`htGap>=20` ×0.08、`bigOnSmall`/`guardOnBig` ×0.12、精英终结者 ×0.72 等），实际落地的概率被压得更低。

修复：把三档基础值和 `blk` 属性系数都调高（禁区 0.014→0.055，系数 0.0005→0.002；中投 0.01→0.036，系数 0.0004→0.0015；三分 0.003→0.005，系数 0.0001→0.00017），其余所有乘法修正项原样保留——身高/力量优势、精英终结者抗盖、换防/错位惩罚的"相对关系"完全不变，只是把整条曲线的起点抬高，让这些修正项在一个更真实的基准线上起作用。

用多组真实年代/阵容抽样验证（掘金vs凯尔特人2023、湖人vs勇士2017、热火vs76人2021）：双方合计盖帽 7.7-11.5 次/场，盖帽率 4.3%-6.9%，落在真实 NBA 区间；顺手确认 FG% 没被带崩（48.7% vs 真实约 46-47%，基本持平，说明新增的被盖球只是把原本就該有的部分命中变成了盖帽，不是平白无故多砍了一堆进球）。

新增 `tests/blockRate.test.js`：用真实阵容跑整场比赛统计盖帽率，断言落在"没回退到旧的 2% 地板"和"没离谱到变成盖帽游戏"之间的合理区间；另有一个用 2018 爵士（戈贝尔巅峰）vs 2016 勇士对照验证"护框强的阵容确实盖帽更多"。改动前曾手动把常量临时改回旧值验证测试会失败（抓到了 3.27 次/场，低于新测试要求的 >5 下限），确认这不是摆设。

**2. Isaiah Thomas 补技能**

用户提到"微笑刺客以赛亚·托马斯也有场上恶汉"——查了一下，`thomais02`（Isaiah Thomas，凯尔特人时期的微笑刺客）在 `skills.js` 里**原本一个技能都没有**，所以这不是"已经有但是错了"，是真的缺失。

但"场上恶汉"（代码里实际叫`enforcer`/场上打手，效果是"身体对抗凶悍，干扰强但犯规也更多"）明显不适合他——他是联盟历史上最矮的球星之一（5'9"），标志性打法是面对比自己高一头的防守人硬挤抛投、变速晃开空间、关键时刻连续得分，根本不是靠身体对抗碰瓷的类型，给他这个技能会和他的真实球风完全拧着来。

最终给他配的技能组（全部复用已有技能，没新造）：
- `freeze_iso`（无解单打）——强干扰下照样能挤出高效出手，对应他在包夹下的硬解决能力；
- `clutch_killer`（杀手时刻）——"杀手"两个字正好对上"刺客"的外号，对应他"第四节之王"的名声；
- `teardrop`（抛投大师，原本纳什/保罗同款）——对应他面对更高大防守人时的标志性抛投终结；
- `rhythm_master`（节奏大师，原本 Luka/Harden 同款）——对应他靠变速、试探步制造出手空间的打法。

技能门槛验证：这四个里只有 `freeze_iso` 有年龄/速度门槛（`maxAge:38, minSpeed:58, minAth:55`），他巅峰期速度 87 轻松满足；2024 赛季卡（速度降到 66）正确地掉了 `freeze_iso`，但保留了另外三个没有门槛的技能——老将期技能组合会随数据自然收缩，符合预期。

特别注意：名册里还有一个历史人物"Isiah Thomas"（活塞坏小子队长，`bref: thomais01`），和 Isaiah Thomas（`thomais02`）只差一个字母。所以这次**只用 bref 直接绑定，完全没加任何"托马斯"相关的姓名正则**，避免像之前 Fox/Kobe/Giannis 那样的同姓氏误伤问题。新增测试 `tests/skillComplaints.test.js` 里同时断言了两个人互不传染技能，以及 Isaiah Thomas 明确没有 `enforcer`。

验证：508/508 测试、lint、diff-check 全过。`ROSTER_SCHEMA` 46→47（R30 头像）→48（这轮技能），已重新生成 fixture。

### R33：继续拆 app.js —— 选秀状态纯逻辑搬进 draft.js/careerBracket.js

延续之前 careerEconomy.js 那轮的拆分方向，这次挑的是选秀（抽卡式建队）相关的纯逻辑：

搬进 `js/engine/draft.js`（该文件此前已有 `drawPack`/`cpuUpgradeRoster`/`autoFillTeam`/`teamPowerLabel`，但**一个测试都没有**）：
- `isDraftDone(d)` —— 双方名单、主教练、助教是否都齐了；
- `draftRefreshCost(d)` —— 刷新卡包的花费（自定义预算模式用块，普通模式用金币）；
- `pickCost(d, player)` —— 选中一张卡实际要花多少；
- `customSideCanSpend(d, side)` —— 自定义预算模式"花钱阶段"某一方是否还买得起巅峰卡；
- `customSpendPhaseDone(d)` —— 花钱阶段是否结束，该切到 0 块补位阶段；
- 常量 `DRAFT_FREE_REFRESHES`、`DRAFT_REFRESH_COST`（原来是 app.js 里的裸 `const`，现在和 `customPool.js` 的 `CUSTOM_*` 常量并列，都在各自的"选秀经济"模块里）。

搬进 `js/engine/careerBracket.js`（同一个 app.js 调用点，紧挨着 `cpuUpgradeRoster`）：
- `upgradeCpuAdvancers(c, survivors)` —— 晋级赛每轮结束后，给存活的 CPU 球队发钱升级阵容，轮次越深预算越大。

顺手清理：`js/app.js` 里有两份**完全相同**的 Fisher-Yates 洗牌函数（`shuffleCopy` 和 `shuffleArr`，逐行一模一样），统一成 `shuffleArr` 一个，6 处调用点改掉，删掉重复定义——纯 DRY 清理，不改变行为。

测试：
- 新建 `tests/draft.test.js`（18 个测试）：不仅覆盖这次搬过去的 5 个函数，也顺手给 `draft.js` 原本就有、但从来没测过的 `drawPack`/`cpuUpgradeRoster`/`autoFillTeam`/`teamPowerLabel`/`takenPeople` 补了至少一个烟雾测试——不能说"刚搬过去的函数有测试，原来就在那的函数继续裸奔"。
- `tests/careerBracket.test.js` 新增 3 个测试覆盖 `upgradeCpuAdvancers`：只动 CPU 球队、深轮次预算更大、空存活列表安全跳过。
- 对 `isDraftDone` 做过 mutation 验证（临时让它永远返回 `true`，确认测试会失败），验证不是摆设。

需要真实名册数据的测试（`customSideCanSpend`、`takenPeople`、`drawPack`、`cpuUpgradeRoster`、`autoFillTeam`）复用了已有的 `tests/helpers/sampleRoster.js`，不用每次手搓假数据。

浏览器回归：进入"联盟经理"模式的选秀界面，点选卡片不报错、标题正常显示"选秀"、页面无新增报错（已知的 2 个 404 是旧问题，和这轮改动无关，之前就确认过）。

验证：`npm test` 529/529（508 + 18 新增 draft.test.js + 3 新增 careerBracket 测试），`npm run lint` 干净，`git diff --check` 干净。`js/app.js` 从 9983 行降到约 9920 行左右。

这是纯搬运 + 去重，没有改变任何行为，所以**没有**碰 `ROSTER_SCHEMA`（卡片数据/技能/头像都没变）。

### R33：修复本届最佳阵容把内线塞进控卫位的 bug

用户截图：某届金币晋级赛的"本届最佳阵容"把 Barkley 排在 PG、Malone 排在 SF、Irving 排在 PF——明显是历史位置错配。

根因定位（两层）：

1. `js/engine/allTeam.js` 的 `selectAllTeamByPos()` 选位时用 `playPos`（球员那场比赛实际被安排的位置）优先于 `pos`（真实自然位置）。这个设计本身没问题（如果 `playPos` 可信的话，"实际打了什么位置"确实该优先于卡面原始位置），但前提是 `playPos` 得先是靠谱的。
2. 真正的根因在 `js/engine/careerEconomy.js` 的 `teamStarters()`——这是淘汰赛里所有 CPU 对 CPU 快速模拟比赛选首发用的函数，它只按 OVR 排序取前 5，**完全不管位置**，所以这 5 个人的 `playPos` 就是各自卡面上随便带着的旧值，毫无保证。人类自己的阵容设置页会走 `resolveStarterPositionCollisions`/`nextEmptyPlayPos` 这套"按适配度排名选空位"的逻辑（R28 修的 Drummond 站错位问题用的就是这套），但 CPU 首发完全绕过了它。

修复：
- `teamStarters()` 现在在选出 top-5 后，调用新的内部 `seatByPosition()`，复用 `gameplan.js` 里 `nextEmptyPlayPos()` 的按位置适配度排名逻辑，按 OVR 从高到低依次让每个人挑最适合自己的空位，再也不会出现"谁坐哪全看卡面旧数据"的情况。返回的是克隆对象，不会污染原始名单球员的 `playPos`。
- 顺手把 `allTeam.js` 的 `selectAllTeamByPos()` 从"单层 OR 兜底"改成三趟独立扫描：第一趟全场找精确位置匹配，第二趟找相邻位置，第三趟（真正的兜底）才按"离目标位置最近"排序挑剩下的人。原来的单层写法有个隐藏坑：PG 排在扫描顺序最前面，如果 PG 没人就直接从"剩下所有人里选分最高的"兜底，可能会把一个本该留给 SF 的精确匹配人选提前抢走——三趟扫描保证任何精确匹配都会先于任何兜底被锁定。

新增测试：
- `tests/allTeam.test.js`（新文件，之前这个模块完全没有专属测试）：精确匹配、全内线无真控卫兜底不互相抢位、同位置不重复选人、空池安全返回。
- `tests/careerEconomy.test.js` 新增 3 个 `teamStarters` 测试：五个纯内线也能分到 5 个不同位置、不会污染原始名单、mutation 验证（临时让函数绕过 seating 直接返回，测试能抓出 `[null,null,null,null,null]`）。

验证：536/536 测试、lint、diff-check 全过。这个修复不改变 `seasonToCard` 的卡片输出，所以不需要 bump `ROSTER_SCHEMA`。

遗留：这次只覆盖了"淘汰赛 CPU 首发"这一条路径；`makeFranchiseCareerTeam`/`makeRandomCareerTeam`/`rollLegendTeam` 等其他 CPU 建队函数如果也存在类似"选人不管位置"的情况，还没有逐一排查，有空再看。

### R34：继续拆 app.js——提取对位分配逻辑到 engine/matchups.js

继续之前约定的"小步拆 app.js"节奏，这次拆的是用户点名的方向之一：`matchupPosOf`/`sortByMatchupPos`/`buildSamePosMatchups` 这串对位分配逻辑（赛前设置页和比赛内防守对位面板共用）。

新建 `js/engine/matchups.js`，搬过去：
- `MATCHUP_POS_ORDER`、`MATCHUP_NEAR_POS`
- `matchupPosOf`、`sortByMatchupPos`、`buildSamePosMatchups`

`matchupOptionList`/`renderMatchupBoard` 留在 `app.js`——这两个是拼 HTML 字符串的渲染函数，不是纯逻辑，不该拆。

拆的过程中又顺手发现一处和之前"shuffle 重复两份"同类型的 DRY 问题：`matchupPosOf` 依赖的位置归一化逻辑，全仓库至少有 4 份几乎一样但**不完全等价**的独立实现（`app.js` 的 `normalizePos`、`court.js` 的私有 `normPos`、`gameplan.js` 的私有 `normPos5`、`allTeam.js` 的 `normAllTeamPos`）。抽查了一下：`normPos5("PG-SG")` 和 `normalizePos("PG-SG")` 在复合位置标签上输出不一样（`normPos5` 会把它判成 "SF"，`normalizePos` 判成 "PG"）。所以这次**没有**趁机合并成一份共享工具——那是真实行为差异，贸然合并是会改变行为的，不是无痛 DRY。新模块里原样复制了 `app.js` 版本的精确逻辑，加了注释说明这是有意为之的本地拷贝，统一合并留到以后单独评估。

新增 `tests/matchups.test.js`（这块逻辑之前零测试），覆盖：
- 位置归一化（含复合标签的精确行为）
- 排序（位置优先，同位置按防守值）
- 同位置优先配对
- 相邻位置兜底
- 完全没有同位置/相邻位置时的最终兜底
- 不会把同一个防守人分给两个对手
- 保留手动对位覆盖（含故意错位）
- 手动对位指向已不在名单的球员时安全忽略
- 空输入安全返回

做了 mutation 验证：第一版"破坏同位置优先判断"的测试没抓住（因为测试样例凑巧让兜底逻辑算出一样的答案），追加了一个更锋利的用例（弱控卫 vs 王牌防守中锋守同一个对方控卫，必须选控卫而不是选防守值更高的中锋），这次真的抓住了 mutation。

验证：
- `npm test`：548/548 全绿；lint、diff-check 全过。
- 真实 headless Chromium 加载首页：0 个 page error，新模块能正常 import。
- `js/app.js`：9983 → 9848 行（-135）。

遗留：全仓库至少 4 份位置归一化实现不统一，哪天要做一次专门的审计+合并（需要先逐个对比所有复合/异常输入的行为差异，确认合并不会引入回归，再决定用哪一份作为统一实现）。

### R35：父子同心 / 兄弟同心——真实 NBA 家族隐藏化学反应

用户想法：有父子同场加"父子同心"，有兄弟同场加"兄弟同心"，隐藏加成不做成可见徽章，尽量把 NBA 历史上的父子/兄弟都收进来。

做法：没有凭印象瞎编，而是先把 `roster.json` 里所有球员名字跑了一遍，针对几十个已知的真实 NBA 家族姓氏（Curry、Barry、Thompson、Walton、Antetokounmpo、Holiday、Grant、Gasol、Lopez、Morris、Mikan 等等）逐个核对确实在名册里、bref 具体是什么，才落进数据表——包括排除了几个容易踩坑的"同姓但不是一家人"的情况（Moses Malone/Karl Malone/Jeff Malone 三个 Malone 互不相关；Rasheed Wallace/Ben Wallace 不是一家；Bojan/Bogdan Bogdanović 不是兄弟）。

新建 `js/data/family.js`：

- `FAMILY_GROUPS`：39 个家族单位（25 对父子 + 14 组兄弟），每条记录是 `{ id, label, parents?, children? }`，不是逐对羅列——这样 3 人以上的大家族（字母哥三兄弟、霍乐迪三兄弟、巴里一家四口）不用枚举所有两两组合。乔治·米坎比较特殊：他既是拉里·米坎的父亲、又是艾德·米坎的哥哥，拆成 `mikan_father_son` 和 `mikan_brothers` 两条独立记录，同一个人出现在两条里完全没问题。
- `activeFamilyBonds(onCourt)`：场上家族关系判定——`parents` 和 `children` 都在场才算"父子同心"；`children` 里有 2+ 人在场就算"兄弟同心"（不需要追踪到父亲，像格兰特兄弟、洛佩兹兄弟这种父亲没打过 NBA 的照样成立）；有父亲记录的家族里（比如库里家），孩子们之间互相也算兄弟——Dell+Steph+Seth 三人同场会同时触发父子同心和兄弟同心。
- `familyChemistryBonus(onCourt)`：父子 +4、兄弟 +3，累加后封顶 +12，防止在时空对决/自由组队这种能跨年代乱凑人的模式里把好几个家族全端上来导致加成失控。

接入 `js/engine/chemistry.js` 的 `teamChemistry()`，跟明牌组合技 `DUO_COMBOS` 挨着但完全独立——**不在 UI 上做成可见徽章**，纯粹悄悄影响化学反应数字，符合"隐藏加成"的要求。

收录的 25 个父子家族：Curry（Dell-Steph-Seth）、Barry（Rick-Jon/Brent/Drew）、Thompson（Mychal-Klay/Mychel）、Rivers、Walton、Hardaway、Sabonis、Schayes、Nance、Payton、Dunleavy、Manning、Bryant（Joe-Kobe）、Vandeweghe、Ewing、Henderson、Horford（Tito-Al）、Trent、Brunson、Anthony、Bibby、Ferry、Mikan、Lucas、Jackson（Jaren Sr/Jr）。

收录的 14 组兄弟：Grant 双胞胎、Gasol（Marc/Pau）、Lopez 双胞胎、Morris 双胞胎、Holiday 三兄弟、Ball（Lonzo/LaMelo）、字母哥三兄弟、King 兄弟（Bernard/Albert）、Wilkins 兄弟（Dominique/Gerald）、Person 兄弟、Van Arsdale 双胞胎、Price 兄弟（Mark/Brent）、Mikan 兄弟、Collins 双胞胎、Porter 兄弟（Michael Jr./Jontay）。

测试：新增 `tests/family.test.js`（16 项）——
- 所有 bref 对照真实 `roster.json` 逐条核实存在（防止手滑打错字静默失效）；
- 每个家族至少 2 人、无重复 id；
- 父子/兄弟各自的触发/不触发边界条件；
- 3 人家族只要 2 人在场就触发，不需要凑齐全部；
- 库里家三人同场父子+兄弟同时触发；
- 同姓不同家族不会误触发（Malone 三人组）；
- 乔治·米坎的两段关系能分别独立触发；
- 空输入安全；
- 加成封顶验证（16 人全家族同时上场也不会炸）；
- `teamChemistry()` 集成测试：真实父子阵容化学反应确实高于等价的陌生人阵容，且全程不越出 [15,95] 区间。

mutation 验证：把加成接入点临时改成 `chem += 0`，集成测试立刻报错，确认不是摆设。

验证：564/564 测试、lint、diff-check 全过；真实 headless Chromium 直接 import 两个模块验证，字母哥兄弟+库里父子同时在场正确识别出两条 bond、加成 7、化学反应 86，0 个 page error。

遗留：这是一个"尽量全"但不是穷举的列表——NBA 历史上还有一些我没有十足把握核实的家族（比如部分年代久远、roster.json 本身可能漏收的球员），以后发现新的可以直接往 `FAMILY_GROUPS` 里加，格式已经很清楚。

### R32：Draymond Green 三分评分虚高修复（不是 Danny Green）

用户怀疑 `greenda02`（以为是 Draymond Green 的 bref）三分/得分评分偏高，并让我排查比赛引擎是否对"非得分手"缺少出手频率天花板。排查发现 `greenda02` 其实是 **Danny Green**（马刺/猛龙 3D 射手，生涯巅峰三分命中率 40%+ 的真正神射手），他的高评分完全正确，不是 bug——这是一次人物认错。

真正的 Draymond Green 是 `greendr01`。查他的 `js/data/ratings2k.scraped.js` 锚点数据发现：2015-2025 每个赛季的 `three` 评分锚点都在 66-80 之间，跟他当季真实三分命中率完全脱节——2019 年真实命中率 28.5%，锚点给 73；2021 年真实命中率 27.0%，锚点给 66。只有他真正打出高命中率的两个赛季（2016 年 38.8%、2024 年 39.5%）锚点才和盒子分公式算出来的结果吻合。这是真实 NBA2K 系列一个广为人知的槽点：无论格林那年投得多烂，2K 很少下调他的投篮评分。

修复：删掉 `greendr01` 2015-2025 这些有真实赛季数据支撑的锚点里的 `three` 字段（2026/2027 没有对应的真实数据行，锚点留着不动），让盒子分公式接管。修复后 `three` 评分正确跟着真实命中率起伏：烂年份 46-58，好年份 69-77。卡片上其他字段（`scoring`/`mid`/`paint`/`defense`/技能）完全没动——他仍然是勇士的防守/组织核心，只是不再在投得烂的赛季里显示成神射手。

这也顺带回答了用户提出的"是否需要在 `sim.js` 里加一个进攻侵略性惩罚"的问题：不需要。出手权重（谁该拿球）由 `scoring` 属性驱动，这个没动过，格林作为真正的进攻发起点理应保留高权重；真正出问题的只是他**拿到球之后选三分还是传球/突破**这个倾向，而这恰好是被 `three` 这个被污染的数字直接驱动的——修好这个数字本身就够了，不需要再叠加一层新机制。顺手确认了他卡片上没有混进奇怪的得分技能（只有 `lockdown`/`thief`/`rim_protector`/`dime_dropper`，全是防守/组织类）。

顺手复核了（不是本轮改动，只是排查过程中顺便验证）上一轮会话已经落地的两项修复：
- 全联盟盖帽率修复：抽样 30 场模拟，合计每场盖帽从 3.5 提升到约 7.9（真实 NBA 合计约 9-10），有明显改善。
- Isiah Thomas（活塞坏小子队长，`thomais01`）/Isaiah Thomas（微笑刺客，`thomais02`）技能包：两人都已正确区分、都没有 `enforcer`（场上恶汉）——通用自动规则要求 `strength>=86`，两人真实力量评分都在 38-41，正确地没有触发。

`ROSTER_SCHEMA`：49→50。`tests/skillComplaints.test.js` 新增 Draymond 回归测试，已做反向 mutation 验证（把旧锚点值加回去会让测试失败）。565/565 测试、lint、diff-check 全过，已提交 `01eba07` 并推送。

### R33：多塔阵（邓肯+大卫·罗宾逊+唐斯+戈贝尔）五外破不动的问题——真找到 bug 了

用户观察很敏锐：对手摆 4 个真中锋（邓肯/罗宾逊/唐斯/戈贝尔），自己打"五外"战术理论上应该很克制这种阵容，但实战感觉没什么用。用户给了一个现成的技术分析和改法建议，但排查后发现他对现有机制的描述其实是错的——`lineupFit()` 从来不读对手阵容，纯粹是看"你自己的阵容跟你自己选的战术搭不搭"，完全不知道对面是什么人。所以不是"惩罚强度不够"，是这条判断对面阵容的通路根本不存在。

**先用真实模拟验证问题存不存在**：搭了一支写实射手阵（Chris Paul/Danny Green/Paul George/Dirk/Lopez，真实三分命中率 37%-42%，特意不用巅峰库里那种命中率已经封顶引擎上限的怪物，不然加成会被天花板吃掉，这个坑后面踩了两次）打"五外"，对位真·四中锋阵打"双塔内线"。先验证：把射手队自己的战术从"均衡"换成"五外"，面对同一支四中锋防守，胜率只从 42.5% 挪到 45.0%，三分出手量和命中率几乎纹丝不动——证实"五外"这个战术本身的加成是通用的（不管对面是谁都一样 +5% 进攻、+22% 三分倾向），完全不看对手阵容，用户的直觉是对的。

**排查到底卡在哪一步**：
1. 先在 `calcOpenness()` 加了"内线被拉到三分线外防守，移动能力打折"的空位加成——没用，几乎测不出差异。
2. 插桩直接打印发现：Gobert/罗宾逊/邓肯确实有 85% 的概率被 `pickDefender()` 派去防挡库里/克莱这种后卫的三分——`pickDefender()` 只按总 `defense` 评分 + 很轻的位置罚分来加权，这几位历史级内线 `defense` 评分 80-96，远超队里唯一后卫 Parker 的 49，位置不对口也照样被选中防守。所以"错位"确实天天发生，不是没发生。
3. 但 `calcOpenness` 算出来的 `open` 只通过 `(open-0.45)*0.16` 这一条系数很小的通道影响最终命中率——就算空位判定变好了一大截，落到命中率上也就一两个百分点，在整场比赛的随机噪声里完全看不出来。
4. 把加成直接搬到 `calcMakeProb()` 的 `base`（和现有的挡拆/突破分球加成走同一条路），结果还是没用——再插桩才发现真正的元凶：**三分出手有一条写死的命中率天花板，没有招牌动作加成时封顶 45%**，而用好射手测试时 `base` 在加成之前就已经顶到这条线了，所以不管加多少都会被这行 `Math.min(base, 0.45)` 直接削掉。这也是为什么前几轮怎么调参数都测不出效果。

**真正的修复**：复用引擎里"内线一个评分数字既要管防框又要管防三分，这是两码事"的思路，给三分命中率天花板也开一个小口子——和招牌动作已经有专属更高天花板（0.62）一样的做法，当防守人是被迫出来防三分的传统中锋/大前锋时，天花板跟着加成一起上浮（不走捷径直接调高全局上限，只在这一具体错位场景松绑，封顶逻辑本身继续管住正常被盯防的三分）。防守人速度评分决定能挽回多少——换防型现代内线吃亏小一些，纯脚下慢的传统中锋吃亏最大，但谁也不会完全免疫。

效果：写实射手队面对真·四中锋阵，三分命中率从 42.6% 提到 47.0%，胜率从 27.4% 提到 30.6%（四中锋阵本身历史地位摆在那，OVR 比射手队高出 3 分左右，不会被这一个修复直接打成稳输）。新增 `tests/jumboLineupSpacing.test.js`：一条锁定绝对区间（43%-58%，做过反向 mutation 验证，撤掉修复会让它正确报错在 41.8%）；一条做相对比较（面对真·四中锋阵不应该比面对同等个人能力但位置正常分布的防守队更难命中三分）。

顺手回答了用户最后那个问题——"玩家角度现在该怎么惩罚这种阵容"：选对位优先防挡库里/克莱这种人的后卫（哪怕防守评分低一点，位置对口现在真的有用了），别让系统自动把防守评分最高的中锋拉到外面，另外战术上"五外"配合挡拆/突破分球（`drive_kick`/`pnr`）比单纯站着等三分更有效，因为那条通路本来就有自己的加成，会叠加在这次修的错位加成上面。

567/567 测试全过，lint、diff-check 干净。本轮修改还在工作区，尚未提交。

### R34：shuffle() DRY 清理——7 份一模一样的洗牌函数合并成 1 份

接上一轮的 draft 拆分方案：核对发现用户提出的"提取 draft 纯逻辑到 engine/draft.js + 对应测试"这部分**在更早的会话里已经全部做完了**（`js/engine/draft.js` 已经导出 `isDraftDone`/`draftRefreshCost`/`pickCost`/`customSideCanSpend`/`customSpendPhaseDone`，`upgradeCpuAdvancers` 已经在 `careerBracket.js`，`tests/draft.test.js`/`tests/careerBracket.test.js` 已经覆盖，`app.js` 里也没有残留的重复定义）。所以这轮只需要做 shuffle 的 DRY 部分。

搜了一圈发现比用户记忆中的还严重：不是两份（`shuffleArr`/`shuffleCopy`），是**七份完全一样的 Fisher-Yates 洗牌**，散落在 `app.js`（`shuffleArr`）、`engine/draft.js`、`engine/seasonDraft.js`、`engine/season.js`、`engine/careerBracket.js`、`data/skills.js` 里两个（`shuffleInPlace`、`shuffleLocal`）。其中 `season.js`/`careerBracket.js` 的版本额外带了个可注入 `rng` 参数（默认 `Math.random`），这个设计值得保留——合并后统一用这个带 `rng` 的版本。

`shuffleInPlace` 命名暗示"原地修改不返回新数组"，跟其余六份"返回拷贝"的语义不一样，合并前专门查了它两处调用点（`trySignatureOffense`/`trySignatureBlock` 里对 `sigs`），确认 `sigs` 都是当场 `.map().filter()` 出来的一次性局部数组，没有别处持有同一个引用，所以换成返回拷贝的版本是行为不变的（只是把 `const sigs = ...` 改成 `let sigs = ...` 以便重新赋值）。

统一后的 `shuffle(arr, rng = Math.random)` 放进 `js/core/seededRandom.js`——这个文件本来就是"纯函数、调用方自己注入随机源"的专门模块（`hashSeed`/`seededStream`/`clamp`），放这里比新建一个 `utils.js`更合适，也不需要额外建文件。

新增 `tests/seededRandom.test.js`（之前这个文件完全没有测试）：不修改原数组、不丢元素只打乱顺序、同一个注入 seed 可复现、不同 seed 真的会给出不同顺序、没传 rng 时走默认 `Math.random` 的路径仍然正常、空数组/单元素数组安全。

7 处定义全删，11 处 `app.js` 调用点用 `sed` 批量从 `shuffleArr(` 改成 `shuffle(`，其余各文件调用点不用改名字（本来就叫 `shuffle`）。净减少 37 行（38 增/75 删，7 个文件）。573/573 测试全过，lint、diff-check 干净。本轮改动还在工作区，尚未提交。

### R35：最佳阵容"巴克利打控卫、欧文被挤到大前锋"——根因不在选人算法，在喂给它的数据

用户给的排查方向是"`selectAllTeamByPos` 的位置筛选逻辑有 bug，太宽松把高分球员硬塞进阵容"，并建议加一个位置白名单硬约束。先去读了实际代码再动手——结果这个假设是错的：`selectAllTeamByPos` 已经是三轮严谨筛选（精确位置优先 → 相邻位置 → 真正没人时按位置距离兜底，拒绝"分高就硬塞"），而且现有测试 `tests/allTeam.test.js` 已经专门覆盖过"5 个纯内线、0 个后卫"这类场景，这个函数本身没问题，加白名单硬约束只会在真的没人可选时直接丢失某个位置的候选人，没有解决真正的根因。

真正的根因往前查了一层：喂进 `selectAllTeamByPos` 的每条记录身上的 `pos` 字段，是用 `p.playPos || p.pos` 算出来的——`playPos` 是球员在**某一场具体比赛**里被临时安排打的战术位置（可能因为伤病、CPU 自动补位、某场小球实验而偏离本位，这种偏离本身是合理的，欧文打四号位凑阵容在某场具体比赛里没问题），但这个值每场都会覆盖写入评选板（`row.pos = normAllTeamPos(p.playPos || p.pos || row.pos)`），而且 `selectAllTeamByPos` 读取时又二次偏向 `row.playPos`。于是只要这几位球星**在赛季/淘汰赛中的任意一场**被战术性地安排到了非本位，这个临时值就会永久焊死在评选板上，后面筛"最佳阵容"时被当成他们的真实位置——算法本身诚实地尊重了这个被污染的输入，巴克利/马龙/欧文因此永久"记成"了控卫/小前锋/大前锋。

修复：`accumulateGameToAllTeamBoard`、`allTeamFromRosters`、`selectAllTeamByPos` 三处统一改成只认球员的稳定 `pos`（真实位置），不再读 `playPos`；顺手删掉了评选板上完全没用的 `playPos` 字段（grep 确认除了这条污染链自己，没有任何下游代码读它），并在文件顶部加了防回归注释，说明以后谁想"顺手"把 `playPos` 加回来之前，先想清楚这正是这次要修的 bug。

新增 3 条回归测试（`tests/allTeam.test.js`）：单场战术性错位不污染评选板；连续多场战术性错位也不会覆盖已记录的真实位置；用真实 roster 数据端到端复现用户截图的确切场景（巴克利 PG、马龙 SF、欧文 PF 全部人为错位喂进去），验证最终选出的阵容欧文落在 PG、巴克利落在 PF。全部做过反向 mutation 验证（撤掉修复，三条测试正确报错，且报错内容跟截图症状完全一致：欧文的 PG 位置被 `pf-a` 抢走）。

额外用真实 `js/data/roster.json` 数据跑了一遍端到端验证（不是测试，是手动核实），确认修复后巴克利/马龙/欧文三人即使被人为注入错误 `playPos`，最终评选结果依然正确：PG 欧文、PF 巴克利、SF 马龙（马龙落 SF 是因为这个极小样本里两个真 PF 竞争一个 PF 位，这是三轮算法本身合理的相邻位置兜底，不是新 bug）。

576/576 测试全过，lint、diff-check 干净。本轮改动还在工作区，尚未提交。

### R36：每日任务加一个"今日挑战"——两张抽卡券不该靠打一场排位就白拿

用户反馈：现有每日任务只有"打 1 场排位"+"赢 1 场排位"两条，各 1 张抽卡券，一场排位赛就能薅完每天的 2 张券，没有理由去碰金币晋级赛或者穿越模式。按用户建议新增一条**随机高难度任务**，和两条日常任务并列，而不是替换它们。

设计：新建 `DAILY_CHALLENGES` 候选池（当前 3 条，各 `CHALLENGE_TICKETS=2` 张券，比日常任务更值钱因为是真正的成就而不是"再打一局"的敷衍任务）：
- `goldChampion`——金币晋级赛 / 预算轮抽夺冠（挂在 `handleCareerResult` 的 `result.champion` 分支，覆盖金牌联赛、15 强历史季后赛梯队、7 冠历史梯队、自定义预算轮抽这四种夺冠场景，不细分梯队）；
- `timeTravelSeason`——穿越生涯打完一个完整赛季；
- `leagueSeason`——联盟经理打完一个完整赛季（覆盖三条非穿越的休赛期转换路径：`isManagedCareer` 的 draft-board 流程、`state.leagueCareer` 非穿越 kind、以及完全没有 `leagueCareer` 包装的纯赛季模式——这三条分支此前就已经在同一个"进入休赛期"按钮里分流处理，顺手在每条分支成功转换后各挂一次，不需要新开逻辑）。

每天只会随机抽中其中一个作为"今日挑战"，存在 `account.daily.challengeId` 里，当天内粘性不变（不会每次打开抽卡页就重新随机）；换到新的一天，`dailyState()` 重新随机挑一个并立刻持久化（这是本轮唯一的行为微调：以前 `taskBoard()` 为了不污染存档，新的一天只会展示一个"全部未完成"的只读占位对象，不会真的创建/保存 `account.daily`——现在因为要展示"今日挑战具体是哪一条"，`taskBoard()` 改成直接调用 `dailyState()`，而 `dailyState()` 在真正跨入新一天时顺手 `saveAccount()`，防止玩家只是点开看了一眼抽卡页、还没打任何比赛，刷新页面后"今日挑战"换了一个的尴尬）。

`recordChallengeProgress(account, challengeId, today)` 是对外接口：只有 `challengeId` 命中当天分配的那一条、且今天还没领过，才会发券，天然防止同一天刷同一个成就重复领取，也防止"顺手把所有成就类型都调用一遍"骗到多份奖励。三个调用点都已经接入并在结果弹窗里用 🎫 提示玩家。

`tests/dailyTasks.test.js` 新增 7 条：`taskBoard` 总能看到当天分配的挑战且未领取、挑战在同一天内粘性不变（10 次读取不重新随机）、`dailyState` 支持注入 rng 做确定性测试、命中才发券/不命中不发、同一天不会重复发放、跨天后可以重新领取一次、账号为空/id 为空/未知 id 都安全 no-op。全部做过反向 mutation 验证（把"必须匹配今日挑战"这个判断弱化成"只要没领过就发"，新测试立刻报错并精确指出哪个 id 被错误放行）。

`js/ui/gachaView.js` 的 `tasksHtml()` 加了一行"🏆 今日挑战：xxx"，领取后变 ✅，跟两条日常任务区分开（日常任务用 ⬜/✅，挑战用 🏆/✅）。

583/583 测试全过，lint、diff-check 干净。本轮改动还在工作区，尚未提交。

### R37：本职位置/身高数据扫描（用户问"斯托克顿怎么是SG"+"文斯卡特在老鹰是PF"+"西蒙斯才185"）

用户三个具体问题牵出了一个比之前"F→SF"更大的同类系统性 bug。扫描方法：对 `roster.json` 里每个球员，检查其"全生涯只有一个位置标签"的记录，再用真实数据特征（场均助攻）交叉验证标签是否合理——跟此前修 Garnett/Malone/Barkley 那批"F→SF"bug 用的是同一套方法论。

**根因确认**：`scripts/build_full_roster.py` 的 `normalize_pos()` 里，`"G": "SG"` 是模糊后卫标签的默认映射——跟已知的 `"F": "SF"` 是完全同一类问题，只是这次没人注意到。扫描结果：**23 位毫无争议的名人堂/全明星级控卫**全生涯被标成 SG，包括斯托克顿（历史助攻王，19 个赛季全标 SG）、魔术师约翰逊、拉里·伯德时代的活塞脏辫手艾塞亚·托马斯、加里·佩顿、蒂姆·哈达威、罗德·斯特里克兰、马克·杰克逊、穆奇·博格斯等——这些人没有一个球迷会认为他们是得分后卫。按跟 PF 那批修复一样的保守原则：只收"每个球迷都会认可是控卫"的无争议名单；对历史上真实存在控卫/得分后卫双重身份争议的 Jerry West（场均助攻 6.69，历史上常被列为 SG）**刻意不动**，避免矫枉过正。

修复落在 `js/data/players.js` 的 `POS_OVERRIDES`（整段生涯覆盖，跟 Garnett 那批用同一个表），并同步到 `scripts/build_full_roster.py`，防止以后重新跑脚本生成 roster.json 时这 24 个人（含斯托克顿）的修复被覆盖冲掉。

**文斯·卡特**是另一种性质的 bug：他 22 个赛季里只有 2019/2020 老鹰生涯（42–43 岁替补）被标成 PF，其余 20 个赛季全部正确标 SF/SG——他一辈子没打过真正的内线。这不是 `normalize_pos()` 的系统性归一化问题（否则应该是全生涯一致出错），更像是数据源本身对他晚年小角色的单季标签抓错了。因为错误只发生在 2 个赛季、不是整段生涯，用整段生涯覆盖的 `POS_OVERRIDES` 会连带把他本来就标对的 20 个赛季也改错——所以新增了一个按 `"bref:season"` 精确打补丁的 `POS_OVERRIDES_BY_SEASON`，只修 `cartevi01:2019`、`cartevi01:2020` 这两条，找不到才退回整段生涯覆盖/原始值。这个新机制只加在运行时的 `players.js` 里，不同步进 Python 构建脚本——跟现有的 `WIPED_STAT_PATCH`（同样是按 `bref:season` 精确打补丁的历史抓取修复）保持同一个先例。

**本·西蒙斯身高**是第三种 bug：他的 `roster.json` 原始数据完全没有身高字段，走到 `derivePhysique()` 的兜底公式——该公式按位置给一个基准身高再加随机抖动（`PG: 188cm`）。西蒙斯统计上是个高助攻的控卫（本职位置 `pos` 字段其实本来就是对的，是 PG，不是用户以为的位置错），但他真实身高 208cm/6'10"，是个能从 1 号位防到 5 号位的巨型组织者，被硬套进"控卫=188cm"的通用桶里直接矮了 23 公分。这跟之前修 Khris Middleton（公式把他算成 210cm"瘦高"但他实际是 198cm 壮实两双锋）是同一个公式缺陷，只是方向相反——按同样的先例加进 `PHYS_OVERRIDES`：`simmobe01: { heightCm: 208, weightKg: 109 }`。

顺手做了一次更广泛的反向扫描（身材特征和位置标签方向不符的全部组合），唯一命中的是约基奇（C 但场均 7.29 助攻）——这是假阳性，约基奇真的就是传球型中锋，这是他的真实球风不是数据错误，不需要修。

`ROSTER_SCHEMA` 50→51。`tests/positionOverrides.test.js` 新增 4 组测试：24 位控卫全部读出 PG、Jerry West 被刻意放过仍读 SG（防止"一刀切"误伤争议球员的回归测试）、文斯卡特 2019/2020 读 SF 但其余 20 个赛季不受影响、西蒙斯全部赛季读 208cm/109kg。全部做过反向 mutation 验证（把斯托克顿改回 SG，测试精确报错指出 1985 赛季应该是 PG）。

587/587 测试全过，lint、diff-check 干净，schema fixture 已重新生成（23452 张卡，新 digest `ae3347c0…`）。本轮改动还在工作区，尚未提交。

### R38：双人对抗选人顺序改成真正的 zigzag（蛇形）选秀，价格其实一直有显示

用户提的 #7 有两部分：

1. "刷新出来的五个球员咋没价格啊" —— 用真实浏览器实测（qa-kitten 跑了完整流程并转储了卡片原始 HTML）发现价格其实**一直有显示**：`¤59`、`¤135` 这类文本清清楚楚在 `.meta` 行里。`pickCost(d, p)`（决定买不买得起）和展示用的 `playerPrice(p)`（渲染成 `¤${...}`）在双人对抗模式下走的是同一套价格逻辑，没有发现任何会导致价格缺失的路径。最可能的解释是用户看到的是旧版本/浏览器缓存——这个项目之前已经因为激进缓存出过至少一次"重复按钮"的误报，这次没能复现，暂不当 bug 处理；如果用户硬刷新后依然看不到价格，需要具体截图才能继续查。

2. "选人顺序应该是zigzag" —— 这个是真 bug，而且是个值得认真对待的公平性问题，不只是品味问题：双人对抗每一轮都会重新 `drawPack(5, {excludeIds: used})` 抽一批**独立随机**的全新卡包（不是两边共享同一个卡池去抢），所以轮到谁，谁就能看到一批谁都没见过的新卡。原来的 `advanceTurn()` 对非预算模式（双人对抗 + 单人选秀建队共用的分支）只是单纯 `A,B,A,B,A,B...` 死板轮转——这意味着"谁先手开一轮新包"这件事从不轮换，不是真正的蛇形选秀。

修复：把 `advanceTurn()` 从 `app.js` 整个搬进 `js/engine/draft.js`（它本来就是纯状态变换，没有任何 DOM 依赖，之前只是历史遗留没跟着之前几轮 draft 逻辑抽取一起走），改成标准蛇形公式：维护一个 `d._pickIdx`（统计这场选秀里发生过的每一次选择，球员/教练/助教通吃，这样教练选择夹在中间也不会打乱玩家实际在意的球员选人序列），用 `Math.floor((pickIdx+1)/2) % 2 === 0 ? "A" : "B"` 算出下一手该谁选——推导并验证过这个公式会产出 `A,B,B,A,A,B,B,A,...`，也就是每一轮（两手）结束后先手方翻转，不会有人一直占"每轮第一个看新包"的便宜。

自定义预算轮抽（15 块买巅峰卡）原本就有自己的"谁还买得起谁继续选"逻辑，完全没动——专门写了一条回归测试确认预算模式分支在这次改动后行为不变。

`js/app.js` 里原来有一份重复的 `advanceTurn()`（三处调用点都是裸调用 `advanceTurn()`，现在改成显式传参 `advanceTurn(d)`，统一走 engine 层这一份），顺手清掉了搬迁后残留在文件里的死代码碎片。

`tests/draft.test.js` 新增 3 条：非预算模式下 12 手的完整序列精确等于 `A,B,B,A,A,B,B,A,A,B,B,A`；教练/助教穿插在球员选择中间不会打乱蛇形序列；预算模式的"对方没钱就继续选"规则不受这次改动影响。全部做过反向 mutation 验证（改回 `d.turn === "A" ? "B" : "A"` 的死板轮转，两条蛇形测试精确报错指出第 3、6 手选错了人）。

真实浏览器端到端验证（qa-kitten 实际点击 6 次选人，不是只读代码）：观察到的真实顺序是 `玩家A, 玩家B, 玩家B, 玩家A, 玩家A, 玩家B`——跟蛇形公式的预测完全吻合。

590/590 测试全过，lint、diff-check 干净。本轮改动还在工作区，尚未提交。

### 同步说明：另一台机器的会话 + origin/main 的 CI 改动已合并

用户另开了一台机器跑了一轮会话，直接在 `feature/time-travel-foundation` 上推了两个提交（`1f44d22` R9/16 位置+身高修复、`1731385` R38 蛇形选秀），本地 worktree fetch 后发现已经完全同步（0 ahead/0 behind），逐条代码 review 过（蛇形公式手算验证 `A,B,B,A,A,B,B,A` 正确、位置覆盖表的赛季级/生涯级优先级验证正确、Jerry West/字母哥的"故意不动"验证合理）——质量过关，不是随手糊的。

另外 `origin/main` 单独多了两个提交（`66ebf71` 开发服务器改成多线程防端口占用、`db8e3cb` 新增 GitHub Actions 测试工作流），跟我们这条功能分支完全没有文件冲突（`git merge-tree` 确认干净合并），已经 `git merge origin/main` 进来。合并后跑了一遍全量验证：590/590 测试、lint、diff --check 全部干净，已推送。

至此，用户此前一次性甩过来的 16 条反馈，状态是：
- ✅ 已完成并验证：#3（成色/本命说明）、#7 part2（蛇形选秀）、#9（24 位控卫 G→SG 误判 + Vince Carter 老鹰两季 PF 误判）、#16（西蒙斯身高）
- ⚠️ 调查过但没法再往前推：#7 part1（价格缺失，真实浏览器复现不出来，怀疑是旧缓存）、#12（上场时间不生效，需要知道具体是哪个模式复现的）
- ⏸️ 卡在等用户补充截图：#10（穿越生涯赛后分析张冠李戴）、#14（拒绝报价后又刷出同一个）、#15（存储相关报错）
- 📋 还没开始，需要先敲定方案再动手：#1/#2（父子/兄弟局 + 时空对决都挪进自定义）、#6（主页三分类重组）、#8（金币晋级赛刷新池调优）、#11（穿越生涯交易市场/多方交易/人员上限）、#13（选秀多选 + 选秀权交易）
- 🏗️ 规模巨大，需要单独排期：#4（真联机对战，要起服务端）、#5（完整英文双语版，六万多行代码里散落的中文字符串需要整体抽取成 i18n 层）

### R39：四个"没截图也能挖出来"的 bug——#12 分钟设置失效、#10 结算页死路、#14 拒绝报价诈尸、#15 存储静默崩溃

用户一次甩了 16 条反馈，这轮专挑不需要截图、靠描述加读代码就能定位根因的四个继续啃。

**#12 "上场时间设置没生效"**：根因不在模拟器的分钟配速算法（上一轮已经用干净的合成测试验证过配速本身没问题，±3 分钟内）。真正的坑在 `openSetup()` 里：赛季模式进入下一场比赛前会克隆一份当前阵容（`cloneSide()`，会老老实实把每个人的 `targetMinutes` 原样带过去），但紧接着又无条件执行 `applyRotationPlan(you, live.rotation)`——用一份**缓存快照**覆盖掉刚克隆出来、本来是对的数据。而这份快照只有在手动点"保存默认轮换"按钮时才会更新；用户在"默认轮换·实验板"里拖滑块调分钟，那个操作是直接改在真实阵容对象上的，**不会**同步进这份快照。于是：调分钟 → 没点保存 → 下一场比赛的设置页一打开，缓存快照反手把刚调的分钟改回旧值——跟用户说的"设置了但模拟没按我说的来"完全对得上。修复：把 `applyRotationPlan(you, live.rotation)` 改成每次都用 `captureRotationPlan(live, ...)` 现场从活阵容重新抓一份新鲜的，不再信任可能过期的缓存快照。`tests/rotationPlanFreshness.test.js` 用真实的 `captureRotationPlan`/`applyRotationPlan` 纯函数直接复现了"过期快照吃掉未保存的编辑"这个 bug，并验证修复后的"现场重新抓取"不会再发生，外加一条球员默认值兜底和一条首发/节奏/特殊战术仍能正常往返的测试，一共 4 条。

**#10 "穿越生涯结算页只能回主页，没有继续"**：逐条读了 `showResult()` 的分支——常规赛季/季后赛（走 `handleSeasonResult`）、锦标赛、排位、金币晋级赛、单挑，每一条都正确调用了 `setResultActionMode(..., {showContinue:true})`。但函数末尾落空：如果某种比赛类型不属于以上任何一种（目前没确证具体是哪种穿越生涯专属流程会走到这里，没有截图不能 100% 锁死，但结构上这个缺口真实存在），`showResult()` 会在什么都不做的情况下直接跑完，继续按钮保持隐藏，玩家就只剩重置时显示的"回主页"——和用户描述的"连个继续都没有"分毫不差。加了一道保险：只要玩家当前处于 `state.leagueCareer`（穿越生涯或联盟经理模式）且前面所有已知分支都没接住，兜底给一个"继续"按钮带回赛季/生涯主页，而不是放任玩家卡在死胡同。至于张伯伦本人是真的出现在某个历史对位（`topPerformer()` 直接读当场比赛快照的 `roster`，没发现跨队/跨场数据串线的迹象）还是另有名字对不上的问题，没有截图确实查不实，用户后续再撞上请把年份/球队带上。

**#14 "拒绝报价后刷新又出现一模一样的报价"**：`generateTradeProposals()` 是一个关于 `(年份, 第几天, 阵容)` 的纯函数，内部没有任何随机数——只要这三样没变，调一百次出来的还是同一批报价。而"刷新报价"按钮就是直接再调一次这个函数，年份/天数当然没变。`declineTradeProposal()` 之前只是把报价从数组里 `splice` 掉、写一条日志，根本没留下"这笔交易被回绝过"的记忆，于是刷新一压，原封不动的报价原地复活。修复：给 `st` 加一个持久化的 `declinedTradeSignatures` 列表，`declineTradeProposal()` 往里记一条 `来源队:给出球员:换回球员` 的签名，`generateTradeProposals()` 生成候选时命中这个签名就跳过。这是永久拒绝（同一笔交易形状不会再出现），但不会连带拉黑这个球员——换一支队、换一个交易方案，签名不同，照样能重新谈。因为写进了 `st`（赛季状态）而赛季整体用 `JSON.stringify` 序列化，不用额外管存读档兼容。补了 2 条测试（拒绝后刷新不再出现、拒绝一支队不影响另一支队的不同报价），都做过反向 mutation 验证。

**#15 "存储相关报错"（完全没有截图，只能按"跟存储有关"这条线索扫代码）**：把全仓库的 `localStorage.setItem/getItem/removeItem` 调用点过了一遍，发现好几处和早就加固过的 `season.js` 的 `saveSeason()`（配额超限会自动重试一次）完全不是一个档次——**裸调用，零容错**：
- `account.js` 的 `saveStore()`——`saveAccount()` 的底层写入，几乎每次有意义的点击都会触发一次（抽卡、领每日任务、升星、分解卡片……包括这轮刚加的每日挑战）。配额一超，直接抛出未捕获异常，中断正在执行的点击处理函数，玩家只会看到莫名其妙卡住/报错，啥提示都没有。
- `account.js` 的 `getActiveAccountId()`/`setActiveAccountId()`——在应用**启动路径**上，某些严格隐私模式会把整个 `localStorage` 封死，不只是写大对象才报错。
- `savegame.js` 的 `writeSave()`/`clearSave()`——中途"继续进度"自动存档。
- `season.js` 的 `clearSeasonSave()`。

全部按 `saveSeason()` 已经验证过的套路补上 `try/catch`：失败就打印诊断日志、返回安全的兜底值（`false`/`null`/`{saveFailed:true}`），绝不让异常冒泡出去中断玩家当前的操作。全程没有改变任何一个函数的返回值类型/调用约定，纯粹是"原来会炸，现在会优雅认怂"，现有调用方不用动。新增 `tests/storageResilience.test.js`，用一个会在 `setItem/getItem/removeItem` 上全部抛 `DOMException` 的假 storage，验证以上每个函数都不再抛出、健康路径不受影响；全部做过反向 mutation 验证（抠掉 try/catch 立刻报错，报的还是真实的 `QuotaExceededError` 堆栈）。

四个修复一共新增/扩展 `tests/rotationPlanFreshness.test.js`（4 条新文件）、`tests/tradeProposals.test.js`（+2 条）、`tests/storageResilience.test.js`（6 条新文件），外加 `showResult()` 里 10 行防御性兜底。602/602 测试、lint、diff --check 全绿。

### R40（T1）：主页三分类重组 —— 我的球员 / 职业经理 / 自定义

原来的主页是一条不断加组标签的单页长列表（①生涯 ②挑战之路 ③时空对决 ④我的球队），每加一个新模式就多一行，本质上没有真正分类，只是"更多的滚动"。改成用户指定的三分类（对照 NBA2K MyTeam/MyCareer/MyNBA、FIFA Ultimate Team/Career Mode/Kick Off 的成熟分法）：

- **我的球员**——你的永久账号班底：排位赛（抽卡/收藏/技能商店已经在上方账号条里，不重复放进 tab）。
- **职业经理**——长线经营：穿越生涯、联盟经理、单赛季快玩。
- **自定义**——天马行空：原"挑战之路"的金币晋级赛/预算轮抽挑战/多人淘汰赛/选秀建队，加上原来单独占一个顶层分组的时空对决、快速演示。这也顺手满足了 T2 要求的"时空对决并入自定义"的前半句——它现在已经是自定义 tab 内的一个子分组，不再是平级的顶层入口。

实现上刻意保持低风险：`.mode-card[data-mode]` 按钮的点击绑定是 `app.js` 启动时一次性 `querySelectorAll().forEach()`，不是事件委托，所以把按钮从"一个大列表"挪进"三个可切换的 tab 面板"（用 `hidden` 属性控制显示，不是从 DOM 里移除）对接线完全没有影响。category→mode 的映射抽成纯数据模块 `js/ui/homeTabs.js`（`HOME_CATEGORIES`/`categoryForMode`/`wireHomeTabs`），不是写死在 HTML 和 JS 两处各自维护一份——`tests/homeTabs.test.js` 用和 `homeShowcase.test.js` 一样的"正则读 index.html 原始文本"手法（这个项目没有 jsdom，DOM 测试走真实浏览器而不是假 DOM），校验：index.html 里每一个 `data-mode` 按钮都被分到了唯一一个分类、不会同时属于两个分类、`homeTabs.js` 里声明的每个 mode 真的渲染在对应分类面板的 HTML 区间内、三个 tab 按钮都有对应的 `data-category`。5 条测试全过。

真实浏览器验证（1280×900 桌面 + 390×844 手机）：默认打开「职业经理」tab，点「我的球员」只剩排位赛一张卡，点「自定义」展开后能看到全部 6 个模式（含折叠的"更多闯关规则"），点「联盟经理」卡片能正常跳转进联盟经理的建队页（`模拟新赛季`/`历史赛季`/`球队名`/`随机球队选人`），全程 `agent-browser console`/`errors` 干净。手机端 `document.documentElement.scrollWidth` 和 `window.innerWidth` 相等（390 vs 390），tab 栏是三等分的胶囊式切换，没有换行/溢出。

607/607 测试、lint、diff --check 全绿。

### R41（T2）：父子局 / 兄弟局 —— 真实 NBA 家族对战

时空对决在 R40 已经并入「自定义」tab，本轮补上 T2 剩下的半句：父子局、兄弟局。两个完全自成一体的小模式，刻意**不**往 `state.career` 那套 `c.kind` 状态机里塞——那套系统 39+ 处判断全部假设两队共享同一个候选池（career 的自由市场、duel 的双人竞价都是这个前提），父子局/兄弟局恰恰相反：甲队只能买爸爸、乙队只能买儿子，强行塞两个池子进单池设计的 UI 风险远大于收益。改走 draft.js 的 `listPaidPeaks()` 全局巅峰卡池也一样行不通，同理：它也没有按候选名单切分的能力。

新建 `js/modes/familyDuel.js`，复用 `FAMILY_GROUPS`——这份数据原本只用来在同队触发隐藏化学反应彩蛋（父子/兄弟同场加成），现在直接拿来当真正的候选池：

- **父子局**：`parents` 字段里出现过的人 = 「老爹军团」候选池（25 人），对应家族的 `children` = 「儿子军团」候选池（29 人），零重叠。
- **兄弟局**：把每个家族的 `children` 分到两边——第一版用的是「每个家族内部下标 `i % 2`」，结果踩了一个真实的平衡 bug：大家族（字母哥三兄弟、霍乐迪三兄弟这种奇数家族）每次都把"多出来的那个人"分给同一边，30+ 个家族的偏向一点点累加起来，最后变成 43 vs 18 的畸形比例。改成**全局**计数器（跨家族连续计数，不在每个家族开头重置成 0）后，两个 2 人家族（15 对，比如 Jason/Jarron Collins 双胞胎）全部还是正确拆到对立两边，但总人数变成 31 vs 30——两位数的平衡问题换成个位数的尾差，可以接受。

每个人只取「能力值最高的那张赛季卡」代表本人——父子局/兄弟局比的是这个人，不是这个人的哪个赛季版本，不需要把每个人的全部赛季都塞进候选池。

交互上，两边都是玩家自己花金币从各自候选池里买人——跟「预算轮抽挑战」让玩家自己搭两队是同一种思路，定价沿用 `careerEconomy.js` 的三档（便宜/中档/高端）思路而不是重新发明一套经济系统。选够 `FAMILY_DUEL_MIN_TO_START`（5 人）就能点「开打」，直接 `openSetup(teamA, teamB, "home")`——跟 `quick`/`sandbox` 模式一样的最简入口，不碰任何 bracket/duel 进程机制，这也是刻意的取舍：规则简单好维护，换来的代价是暂时没有"双方轮流出价竞争同一个人"的张力，可以后续按需要加。

入口挂在 `#screen-custom-hub`（预算轮抽挑战点进去的那个子菜单）新增两个按钮，跟"预算轮抽·NPC / 双人对抗 / 传奇八队"并列，而不是在主页再开两张顶层模式卡——这样 T1 刚做好的三分类不会又被塞成"一个长列表"。

**过程中抓到一个真实 bug**，不是靠单测，是靠真实浏览器点击：第一次点「父子局」直接炸，`Cannot read properties of undefined (reading 'id')`。根因是 `familyDuelShop()` 里的随机抽样辅助函数 `pick(arr, n)` 写死假设 `arr` 里每个元素都是 `{p, price}` 元组、无条件做 `.p` 解包——这对 `cheap`/`mid`/`stretch` 三个价位桶成立，但候选池太小、三个桶凑不够数时会走一个"兜底补量"分支，那个分支传进去的是已经解包过的裸球员对象（没有 `.p` 字段），于是解包结果是 `undefined`，商店数组里混进了货真价实的 `undefined`，下一行 `shop.filter(p => p.id)` 当场爆炸。单测没抓到是因为原来那条「商店」测试凑巧选用的候选池/价格分布让三个桶刚好够数，从没走到兜底分支——这也是为什么浏览器验证不能省：这次要是只跑单测就收工，这个 bug 会原封不动地上线。修复思路是让 `pick()` 变成一个真正通用的"从数组里随机挑 N 个、不对元素形状做任何假设"的函数，调用方自己决定要不要先 `.map(x => x.p)` 解包，兜底分支从一开始就传未解包过的候选，不再有两种形状混用的风险。补了一条专门复现这个坑的回归测试——先在旧代码上验证它真的会炸，再确认新代码修好，不是"我觉得修好了"。

新增测试文件 `tests/familyDuel.test.js`（14 条）：合成数据覆盖候选池解析、同人不出现在两边、买人扣金币/查重/查预算/查名额、自动补满不超支不炸雷、`familyDuelReadyToStart` 的人数门槛，外加一条真实 `roster.json` + 真实 `FAMILY_GROUPS` 的集成测试（确认两个池子在真实数据下都不空、没有跨边重叠、人数比例不离谱）。全量 621/621、lint、`git diff --check` 全绿。真实浏览器全流程验证：桌面 1280×900 和手机 390×844 都走了"进入自定义→预算轮抽挑战子菜单→父子局/兄弟局→自动补满→开打→进比赛"全程，父子局挖出 Rick Brunson、Jaren Jackson Sr、Ed Manning、Tito Horford 这些真实历史老爹，兄弟局正确拆开 Jason/Jarron Collins 双胞胎，手机端无横向溢出（`scrollWidth === innerWidth === 390`），全程 `agent-browser console`/`errors` 干净。

### R42：Zaza Pachulia 位置修复 —— 同一个 normalize_pos() 老毛病

用户截图发现自定义模式阵容里 Zaza Pachulia 显示 `SF`（小前锋），但他整个生涯都是一个 219–222cm 的撞人型纯中锋，从没打过小前锋。查数据：`roster.json` 里他 2004–2011 赛季（`talldata` 数据源，早于真正的 bref 抓取）全部标 `SF`，2012 年起（`bref` 数据源）才正确标 `C`——跟之前修过的 Garnett/Malone/Barkley/Rodman/McHale/Oakley/Willis/Kemp（F→SF 归一化默认值 bug）、Stockton/Cousy 等控卫（G→SG 归一化默认值 bug）是**同一个根因**：`scripts/build_full_roster.py` 的 `normalize_pos()` 把早期数据源里模糊的单字母位置标签（`F`）一律归一成 `SF`，不管这人实际是前锋还是中锋。

修复：在 `js/data/players.js` 的 `POS_OVERRIDES` 和 `scripts/build_full_roster.py` 的同名字典里都加上 `pachuza01: "C"`（全生涯覆盖，而不是像 Vince Carter 那样只覆盖特定赛季——因为 Pachulia 的全部 16 个赛季本来就应该是 C，覆盖已经正确的赛季不会有副作用）。`tests/positionOverrides.test.js` 新增一条测试，覆盖他全部 16 个赛季（含早年被错标的 8 个）都读 C，并做了反向 mutation 验证（临时把 override 的 key 改错名字，测试立刻报 `actual: 'SF', expected: 'C'`，确认测试真的在验证这个修复，不是摆设）。

由于 roster card 的输出变了，`ROSTER_SCHEMA` 从 51 bump 到 52（否则已经打开过游戏的浏览器会继续从 IndexedDB 读旧的、带错误位置的缓存卡），跑了 `scripts/cards/update-schema-fixture.mjs` 重新生成 `tests/fixtures/cardSchema.json`。独立 node 脚本抽查确认 Pachulia 全部 16 季（2004–2019）现在都是 `C`，身高都在 219–222cm 区间，跟真实中锋体型完全吻合。全量 622/622、lint、diff --check 全绿。

### R43（T4）：穿越生涯交易市场 —— 多对多 + 含选秀权 + 配平推荐 + 自由市场熟悉感/潜力/价值标签

用户直接点名：穿越模式的交易 UI 只能 1 换 1、没有选秀权、没有配平推荐；还要求自由市场左侧裁人列表补上「熟悉感/未来潜力/妖人/高薪低能」（这些标签只在已拥有的屏幕显示，不会跳到还能挑选/抽卡的屏幕里）。

**发现**：`js/engine/seasonMarket.js` 的 `executeTrade()` 其实早就支持 N-for-M 多球员交易（`giveIds`/`wantIds` 是数组，连注释都写着「1-for-1 or N-for-M」）——UI 层从来没暴露过一个以上的复选框。真正的缺口是选秀权：CPU 队从来没有自己的可交易选秀权池，选秀权只能通过已有的主动报价单向 CPU→用户流动。

**实现**：新增 `teamDraftAssets(st, teamId)`（放在 `seasonMarket.js` 里，避免与新建的 `tradeBuilder.js` 形成循环 import）：用户自己的选秀权池复用现有 `st.draftAssets`（和 `tradeProposals.js` 共用字段，不分裂成两套），CPU 队懒加载到 `team.draftAssets`。两个起始选秀权确定性生成（同一 `st.year` 输入给同一轮次/保护形状）。`executeTrade` 扩展接受 `givePickIds`/`wantPickIds`，选秀权价值通过已有的 `estimateDraftPickValue` 计入 OVR 对比（选秀权不带薪资，只影响价值侧）。

试验过程中抓到一个真 bug：初版 `executeTrade` 无论这笔交易是否涉及选秀权都会无条件调用 `teamDraftAssets()`，而它会懒加载种入两个起始选秀权——导致每次交易都偶然把两个选秀权注入 `st.draftAssets`，把旧的 `acceptTradeProposal` 回归测试抓出来了（期望 1 个却变成 3 个）。改成只在真正涉及选秀权时（`givePickIds.length || wantPickIds.length` 为真）才调用后修复。

新建 `js/engine/tradeBuilder.js` 的 `recommendTradePackage(st, { cpuTeamId, wantPlayerId })`：按三档回退找匹配方案：
1. 单件货，货值最接近对方要走的人；
2. 锚点+潜力新秀的两件套装（复用 `tradeProposals.js` 已有的 `prospectScore`/`isProspectCandidate`，避免重写）；
3. 在最接近的单件货上加送自己一个选秀权，弥补价值差。

故意简单、非穷举搜索，跟 `draftPickValue.js` 自己注释里写的「故意简单可解释，不是黑盒 oracle」设计风格一致。

前端 `js/app.js` 把「交易（1 换 1）」重写成「交易（多对多 · 可含选秀权）」：我方/对方球员+选秀权都是复选框，勾选后实时显示薪资/身价对比汇总，「推荐方案」按钮会先看用户勾了哪个对方球员，再自动勾选我方匹配项并在提示中给理由。另在自由市场左侧裁人列表（之前只显示 OVR/赛季/薪资）接上三样已有但没接上的东西：`systemFitNote()`（熟悉感/体系适配，文本故意不会透露「妖人」字样）、`historicalUpsideHint()`（未来潜力，右侧自由市场签约列表早就在用）、`valueBadge(p,{owned:true})`（妖人/高薪低能，这个门控本来就是为「已拥有才显示」设计的，只是这个屏幕之前没接上）。

写了 14 条 `tests/tradeBuilder.test.js`，过程中有个有趣发现：`executeTrade` 的薪资匹配检查 `salIn<=salOut*1.25+40 || salOut<=salIn*1.25+40` 对任何非负薪资都是恒真——数学上找不到一对值能让两个方向同时失败，所以「薪资差太大」这个拒绝理由在当前实现下几乎不可能触发。这是预存行为，不是本轮引入的回归，没动它（改动核心交易平衡公式超出本轮请求范围，也没人要求改），只是把测试改成对真实行为的断言（真正能拦交易的是价值检查，不是薪资检查）。做了反向 mutation 验证（注掉选秀权搬运代码块，测试立刻报错）。

真实浏览器全流程验证（账号用 15 张 OVR 55–70 的便宜球员卡搭进工资帽开局，因为几个真正的超级巨星单独就会把 ¤2000 软帽冲爆，连 8 人最低阵容都凑不齐）：左右两边正确渲染球员+选秀权复选框，点勾选后实时汇总更新，点「推荐方案」自动勾选并给出理由文案，提交交易后有明确反馈，左侧裁人列表真实渲染出「James Jones：与多数体系都合拍」和「潜力峰值 OVR 81（2018，约 +13）」这样的真实文案，32/32 检查点全部通过（桌面 1280×900 + 手机 390×844），无横向溢出、无 console 报错。636/636 测试、lint、diff --check 全绿。

**未完成**（范围说明，留待后续）：
- 「挂牌询价」——把我的球员挂出去收集外部报价，而不是我指定目标去谈；
- 「3+ 队多方交易」——当前仍是两队一对一。
### R43：原始需求逐条审计（用户把立项时的原始要求原文发来，要求逐条核对）

方法：不看 README 的自我描述，直接对代码和数据核查；能跑数的跑数（用项目自己的 `seasonToCard` 生成真实卡片）。

**已达成（15 条，附证据）：**
- 自己选首发：`openSetup()` 里 `state.setup.selected` 五人自选，可改站位互换。
- 教练策略 + 自定义执教方针：赛前 `phil-*` 四维滑杆 + 战术勾选（`gameplan.js`），比赛中可改。
- 动态球场：`js/engine/court.js` 攻防两套 x/y 站位点，头像随回合推进移动，得分/防守/阵型都挂在这套坐标上。
- 隐藏属性（能力值外）：`js/data/intangibles.js` 20+ 项——引力、自主造投、硬气、领袖气场、马达、抗压冷静、杀手本能、换防弹性、化学反应核、决胜视野、伤病风险、致胜成色、隐藏上限、持球依赖、无球能力，外加 `personality`（ego/team/calm）。
- 晋级制主体：赢球得金币、每轮后市场买卖、名单最多 12 人 / 至少 8 人出战（`careerBracket.js` + 市场逻辑，含双人竞价里同样的 12 人上限校验）。
- 双人竞价 bid：双人模式自由市场竞价（`goldA/goldB` 出价、高者得、胜方金币不足/名单满都有拦截）。
- 当赛季属性 + 年份标注：实测奥尼尔 2000 湖人卡 OVR 98 / 速度 68 / 力量 99；2011 凯尔特人卡 OVR 74 / 速度 28 / 力量 92——「不再顶尖、移动慢了、吨位还在」与原始举例逐项吻合。
- 临场指挥：活球只能大喊，暂停/节间可沟通（个人攻防指令+对位）、改战术、换人、改站位（`app.js` 教练席）。
- 隐藏抽卡九档：`HIDDEN_TIERS` 标签与原始清单一字不差（落选+短期合同+D联盟 / 饮水机管理员 / bench player / starters / 球星 / 全明星 / 名人堂 / NBA 50 大巨星 / 超级巨星），代码里只被抽卡/选秀权重读取，UI 从不渲染。
- 巨星抱团不无敌：`chemistry.js` 化学反应 + 阵容适配 + 战术契合 + 性格（ego 过高触发隐藏上限封顶，见 intangibles 的 ceiling 逻辑）。
- 真实命中率：`calcMakeProb` 以当季真实分区命中率 ×0.9 起步，空位加成封顶约 +0.08——库里空位三分也就五成上下，空位照样可铁；只有招牌技能的极少数「附体」球才是必进。
- 教练可抽 + 年份 + buff + 招牌战术：杰克逊 1996/2000（三角进攻，buff 攻8/防6/士气10，高球商阵容吃满）、科尔 2016（小球/五外/换防）、里弗斯 2008（士气 buff 14 全场最高，`morale_boost` 描述明写「体系加成一般」= 没有特殊体系战术）、锡伯杜 2011（防守 buff 14、体力 buff −6 = 操主力，注释「主力消耗极大」）；`preferred` 字段即「特定阵容奇效」的落点。教练卡走抽卡（见 R13b）。
- 选秀卡潜力：实测新秀约基奇 2016 卡 OVR 79、`growth` 95、`growthSpeed` 90；2023 巅峰卡 growth 回落到 60/55——弱开局 + 大空间 + 快成长与原始举例吻合（`growthPaths.js` / `develop.js`）。
- 双人随机选人：双人对抗随机发池选人（R38 已改真蛇形）。
- 多人淘汰赛每轮多选一人：`applyTournamentResult` 后 `picksAllowed += 1` 并回到选人阶段，按钮文案就是「第 N 轮：每人多 1 次选人，继续」，一路到总决赛。

**未达成（1 条）→ 立项 T8：**
- **金币晋级赛总决赛七场四胜 + 每场后买卖调整阵容**：现状总决赛是单场决胜。`state.career.series` 从立项起就只有骨架——存档序列化/反序列化（`savegame.js`）、市场结束后的跳转分支（`app.js` 里 `c.finals && c.series`）、最佳阵容与伤病波对 series 对手的读取——全部在等一个从未被赋值的对象：全仓没有任何一处生产代码给 `c.series` 赋值（只有初始化 `null` 和测试里的人造对象）。注意别混淆：常规赛/穿越赛季模式的季后赛是真七场四胜（`season.js` 的 `simPlayoffSeries`），缺的只是金币晋级赛这一处。

**赛制差异（1 条，待用户拍板）→ 立项 T9：**
- 原始需求写「输了就淘汰」，现状金币晋级赛小组段是两败出局 + 复活赛（打进淘汰段后才是一负出局）。这是手感取舍不是 bug，改不改等用户决定。

### R44（T8）：金币晋级赛总决赛系列赛 —— 三局两胜 + 每场后进市场

用户对 R43 审计里唯一的未达标项拍板：不做七场四胜，改**三局两胜**，每场后可以买卖球员调整阵容。

**实现（关键是别推翻 pod 状态机）：**
- `js/engine/careerBracket.js` 新增纯逻辑：`startFinalsSeries(opp)` / `recordFinalsGame(series, youWon)` / `finalsSeriesLabel(series)` + 常量 `FINALS_TARGET_WINS = 2`。挑战档（playoff15/champ7）的总决赛同走这套（它们共用 career bracket）。
- `resolveCareerYourResult`（app.js）在 `stageSize === 2` 时拦截：首场总决赛赛果到达时按对手 bracketId 建 `c.series` 并记比分；**未分胜负的场次不 `applyMatchResult`**——pod 的总决赛 match 保持 open，下一场还会被 `findYourOpenMatch` 找到重打同一对；分出胜负的最后一场才落回原有的单场结算（赢→pod 晋级→夺冠，输→`stillAlive=false`→淘汰），结算后不清 `c.series`，结算页要拿它显示最终比分。
- `handleCareerResult` 新增 `seriesGame` 分支：标题「总决赛 G‹n› 拿下/惜败」，摘要显示系列赛比分 + 本场奖金（沿用胜 120+轮次×40 / 负 40 的公式，保证场间市场有钱花），按钮「备战总决赛 G‹n+1›（先进市场）」→ `openMarket({career, refillShop})`；市场「完成」按钮原有的 `c.finals && c.series → openSetup(c.team, c.series.opp)` 骨架分支就此真正生效，卖人卖到不足 8 人仍会被市场完成按钮拦住。
- 伤病波本来就读 `c.series.opp`（对手强度 ×0.9），系列赛每场后照常 roll，伤员在后续场次会被布置页的可用性过滤挡下——骨架的另一半也顺带活了。
- 存档：`serializeCareer/reviveCareer` 的 series stub 机制原样复用，新增测试钉死往返后 wins/losses/target 不丢、且 `series.opp` 与 `alive[]` 里是同一个对象（共享引用一致性，和 R27 的老规矩一致）。

**验证：**
- 新增 `tests/finalsSeries.test.js` 7 个测试：2-0 / 0-2 / 2-1 三条比分线、null 防御、label 文案、「系列赛未分胜负时 pod 总决赛 match 必须保持 open」这条接线契约、存档往返。
- 另用独立 node 脚本把 app 的实际调用顺序（建 series → 记 G1/G2 不结算 → G3 结算 + finalizePod）整段跑了一遍：pod done、advancer 是你、allPodsDone 为真。
- 全量 629/629（622 + 7）、`node --check` 两个改动文件通过；本地 serve 200 且确认在供新版 `careerBracket.js`。eslint 本机 clone 没装 node_modules 跑不了，留给 CI/日常环境（本次改动未引入新变量名风险点，导入已逐个核对在 careerBracket.js 里真实存在）。
- 真实浏览器全流程（打进总决赛连打 2-3 场 + 场间买人）未在本机复跑——本机浏览器工具此前打不开标签页；逻辑层契约已由上面两层测试钉住，浏览器回归留待用户机器或后续会话补。

### R45：试玩总决赛抓到并修掉「市场能买同人异赛季卡」

用户让 pull 最新代码「模拟玩一下」，遂用游戏自己的引擎（GameSim + `simulateCpuMatch` + 新系列赛逻辑 + 真实 `buildAffordableShop` 货架）在 Node 里完整打了一届三局两胜总决赛（你的联队 vs 历史联队）：G1 108–114 负 → 场间买进 David Robinson('95) → G2 128–116 胜 → 买进 Vassell 填满 12 人 → G3 117–118 一分惜败，1–2 出局。系列赛流程（比分推进、场间奖金、市场、名单上限、pod 结算）端到端通畅。

第一遍试玩（图省事自拼了个买人池）买进了乔丹 '91、紧接着又买乔丹 '92——回头核对发现这不只是脚本的捷径：**真实市场的 `buildAffordableShop` 只按卡 id 去重（`c.used`），同人其他赛季不在排除之列，购买入口也没有按人校验**。这违反项目自己的决策记录（「同一真人只有时空对决允许重复」；选秀侧早有 `takenPeople` 按 bref 去重，CPU 升级阵容也走它，唯独玩家用的市场货架漏了）。

修复（`js/engine/careerEconomy.js`）：`buildAffordableShop` 用已用卡 id 反查 bref 建「已用人」集合，货架池按人排除（当前货架里已有的卡也一并占位）；结尾的货架内去重从按 id 扩到按人，同一货架不再同时摆同人两个赛季。

验证：新增 `tests/marketDuplicatePerson.test.js`（把全局卡池缩成确定性样本：乔丹全部赛季 + 30 人）——拥有乔丹 '96 后货架连续 5 次绝不出现任何乔丹赛季、且货架仍有货；单货架内不出现同人两赛季。变异检查：临时摘掉按人过滤，第一个测试立刻变红，恢复后全绿。全量 631/631。

### R46：feature/time-travel-foundation 合并进 main + 分支政策变更

用户 2026-10-23 晚通过 GitHub PR #1 把 `feature/time-travel-foundation` 合并进 `main`（merge commit `02b8a24`），并明确指示：**以后 Luna 的提交直接 push 到 main，不再走 feature 分支**。

合并完整性已核验：feature 分支是 main 的祖先（`git merge-base --is-ancestor` 通过），feature 上零提交遗漏；main 独有的只有 merge commit 本身。合并后 main 本地全量 631/631 测试通过，GitHub Actions 在 main 上的合并 run 也绿。本地 clone 已切换到 main 并与 origin/main 同步。

说明：R24 当时记的「只推 feature 分支、不触碰 main，合并留给用户决定」到此为止——用户已经决定并完成合并，此后以本条为准。feature 分支暂保留作历史，不急着删。

### R47：抽卡经济再平衡 —— 开局别再送一手好牌（用户反馈）

用户实测反馈：新号第一天零游玩就能抽 5 次，还抽到 3 个克里斯·保罗 + 卡尔·马龙，「抽卡次数太不值钱」，并建议每日任务加金币挑战赛。

**审计数字（改之前）：**
- 第一天零游玩 faucet：新手礼包 4 券 + 每日免费 1 抽 = **5 抽**（用户数的「五次」分毫不差）；再打 2 场排位还能 +2 券到 7 抽。
- 好牌率：85+ 自然率 18%（90+ 为 7%），另有约 20% 抽到教练卡；新手保底保证第 5 抽必出 85+。
- 重复感来源是卡池结构：85+ 共 771 张卡却只属于 192 个人，前 10 人占 17.5%；**保罗一人有 15 个 85+ 赛季（全池第一）**、马龙 10 个、乔丹 9 个——抽到「好牌」时撞见保罗的概率天然最高，3 个保罗是脸黑脸白之外的结构必然。

**改动：**
- `WELCOME_TICKETS` 4 → 2：零游玩抽数 5 → 3（2 券 + 免费 1），期望 85+ 从约 1.1 张降到约 0.4 张。
- 每日任务新增第三项 **「金币挑战赛赢 1 场」+1 券**（用户点名）：`dailyTasks.js` 加 `careerWin` 任务与 `recordCareerTasks()`（与 `recordRankedTasks` 共用 `claimReadyTasks`），`handleCareerResult` 在晋级赛每场结算时调用，奖励说明并入结算文案的 injLine 一起展示。每日任务券上限 2 → 3，但第三张必须去金币晋级赛赢一场——抽卡次数从「领的」变回「打出来的」。今日挑战里的 goldChampion（夺冠 +2 券）保留不动，那是重奖版。
- 新手保底（第 5 抽必 85+）**保留但变相收紧**：faucet 砍掉后，第 5 抽不再开局白送，要先靠任务赚 2 张券才够得着，保底从「开局福利」变成「第一天打出来的里程碑」。
- 概率本体没动（90+ 7% 是 R 系列早先定过的调性）；同人异赛季变球魂的既有规则也没动。
- 文案同步：抽卡规则面板的券来源改成新口径（数字仍走常量，`bannerExplain` 的常量绑定测试保证不漂移）；WORKNOTE 经济速查已更新；`index.html` 缓存版本号 bump 到 `20261023econ-rebalance`（app.js 改了，按老规矩）。

**验证：** `dailyTasks.test.js` 新增 4 个测试（礼包 = 2 的钉子、career 赢才付/输不付/同日不重复/次日再付、排位 2 张 + 金币挑战 1 张 = 3 张叠满、null 防御）；全量 635/635。

### R48：播报重设计 —— 颜色 = 球队（用户反馈）

用户反馈：播报「有点乱」，希望靠文字颜色就知道哪队得分、哪队在进攻，按球队颜色判断。

**旧播报的问题：** 颜色按事件类型分（得分金 / 篮板绿 / 教练蓝 / 失误灰），与球队无关——不认球员名就跟不上谁打谁。

**数据基础（先验证再设计）：** 引擎每条事件都自带 emit 时的快照（possession + score + 节次时钟）。无头实测一整场 500 条事件：118 条得分事件里，能判定得分方的 111 条 **possession 与得分方 111/111 完全一致、0 矛盾**——所以「按当时的进攻方上色」对得分条就是「按得分方上色」，不用改引擎。

**新设计（`js/ui/feedView.js` 纯函数 + `pushFeed` 改造）：**
- 实况条（score/miss/reb）按进攻方球队色渲染：左侧 4px 原队色边 + 同色淡底，文字用该队色在深绿底（#102319）上提亮到对比度 ≥4.2 的可读色（马刺黑、篮网黑这类深队色不会隐形）；行首带 `Q3 5:24 · 主/客` 小字。
- 得分条加粗 + 底色加深，右侧悬浮**比分牌**：比分数字各用本队颜色（`78–75` 一眼知道谁刚得分）；正文末尾自带的比分被剥掉避免重复。
- 球队色来源：历史队/球队身份明确时用真队色（`teamColors.js` + franchiseId/自带 code）；混编联队取首发五人 OVR 最高者的众数队色（球队的「门面」）。两队主色相撞（公牛红 vs 老鹰红、同队镜像战）时，客队自动改用其第二队色，再不行提亮——图例与每条都必须一眼可分。
- 播报上方新增图例条：两队色点 + 队名 +「颜色 = 进攻方 · 得分带比分牌」；记分牌上的队名同步染成本场队色。
- 教练/系统消息（暂停、换人、战术提示）不属于任何一队，维持原中性色——实测 coach 事件的 possession 分布严重偏斜，本就不该染色。
- 存档回放的旧播报行没有事件快照，走原渲染，行为不变。

**验证：** `tests/feedView.test.js` 9 个测试（队色解析三路径、红红相撞改第二色、镜像战可分、深底可读对比度、比分剥离、时钟格式）；全量 644/644。`index.html` 缓存版本号 bump 到 `20261023feed-colors`。

### R49：搜索框一键清空 ×（用户反馈）

用户反馈：时空对决搜人时，选完一个名字后搜索框里还留着那个名字，想搜下一个人只能逐字退格删掉；要一个 × 按钮一键 delete 掉已选/已输入的名字。

**改动（三个搜人入口统一）：**
- **时空对决（主场景）** `js/ui/sandboxView.js`：A/B 两队搜索框各加一个圆形 ×（有内容才显示）。点击：整串清空、结果列表回到未搜索状态、× 隐藏、焦点自动回到搜索框——点完直接打下一个名字（如先搜 Kobe 组完，再 × 掉搜 LeBron）。
- **已选名单同理**：名单行原本只有 −（点一次少一个，×5 科比要连点五次）。每行新增红色 ✕「一键移除这名球员的全部副本」，与 −/+ 并存。
- **心愿单搜索**（抽卡页 `#wish-search`）与**卡库筛选搜索**（`collectionFilter`）同步加上同一套 ×，行为一致（清空 → 列表重置 → 回焦点）。卡库的 × 显隐由筛选状态驱动，输入时就地切换不重渲染筛选条（不丢焦点）。
- 样式在 `css/gacha.css` 共享 `.search-wrap/.search-clear`；同时隐藏浏览器自带的 search 取消按钮，避免出现两个 ×（各浏览器原生 × 出现时机不一致，正是这次要自研一个的原因）。

**验证：** `tests/searchClear.test.js` 4 个测试（筛选条 × 显隐随 query、sandbox 模板与移除逻辑、index/app 接线、样式与原生 × 抑制）；全量 648/648。缓存版本号：app.js → `20261023search-clear`，gacha.css → `20261023search1`。

### R50：英文版 v1（T7 第一阶段，用户反馈）

用户反馈：截图里的浏览器自动翻译把「中投」翻成了中投公司（China Investment Corporation）——问是不是翻译错误；确认是机翻错误后，用户说「英文版本也照着先做一个吧」。

**翻译策略（源头双语，不用机翻）：** 浏览器机翻按词典猜，「中投」这种篮球术语必然翻车。所以 v1 全部在源码里双语：JS 现拼的文案用 `L(中文, 英文)` 在源头选语言（「中投」永远是 MID）；index.html 静态文案走 403 条 `PHRASES` 词表 + DOM 遍历（`applyStaticLang`），原文存 WeakMap，切回中文逐字还原，不靠反向翻译。顶栏新增语言按钮 `EN / 中文`（显示的是目标语言），偏好存 localStorage。

**比赛播报双语（`GameSim` 构造收 `lang` 选项，默认 zh）：** 81 处 emit 点全部走 `this.S(中文, 英文)`；自由函数里的 emit 用 `sim.S`。包括：得分/失误/篮板/盖帽/抢断模板、招牌动作与盖帽名（92 个技能名走 `SKILL_EN` id 词表，如 死亡缠绕 → Death Wrap、大北斗指滚 → Big Dipper Finger Roll）、`matchupFeedStory` 整段重写为双语（含 dunk/layup/post 动作池与英文正则分类）、shotLabel / hotLabel / moodLabel / fatigueTag、暂停/换人/伤病/战术/终场抢攻/战术犯规/罚球/技术犯规。无头实测：英文整场 score/miss/reb/dunk/coach 五类事件**零中文残留**（coach 类此前 15 条残留来自技能名与轮换心情，全部清掉）；中文默认局的断言全部不变。

**界面双语（v1 已覆盖）：** 顶部加载进度、记分牌「主队进攻/客队进攻」、球员卡 12 项属性缩写（攻→ATK、三分→3PT、中投→MID、内线→INS、传→PAS、防→DEF、板→REB、断→STL、帽→BLK、速→SPD、力→STR、球商→IQ）、播报图例提示、技能 chip 名、抽卡规则/卡池说明/抽卡状态/每日任务与挑战名（`labelEn` 字段 + `taskBoard(lang)`）、时空对决沙盒、卡库筛选条、32 支球队英文名（湖人 → Lakers）、结果屏胜负标题。

**v1 明确没做的（留给 T7 后续）：** 生涯叙事线（生涯弧线、顿悟文本、教练/技能描述长文）、gameplan.js 的战术名与教练名、已开局的存档队名（只在新开局时按当前语言取）、沙盒在语言切换后需重进才刷新（挂载一次的限制）。技能招牌的风味文案（`signatureFeedFlavor`）已双语；`_sigLabel` 回退走技能名翻译。

**验证：** `tests/i18n.test.js` 8 个测试（L 切换、技能名映射、中投 → MID、index.html 全量 401 段中文词表覆盖——仅 2 处有意保留：语言按钮自身的双语 title、搜索示例里的人名外号、球队名英译、英局零中文 + 中局仍中文、默认 lang=zh）；全量 **656/656**。缓存版本号：app.js → `20261024i18n-en`。

### R51：README 英文版（用户反馈）

用户问 README 能不能做一个英文的。做法：中文 README 原地不动，新增 `README_EN.md` 全文英译（模式、功能、抽卡经济、技能系统、五年篇章、经营工具、长期联赛、隐藏档位、数据来源、项目结构、技术说明、原始需求对照、路线图、授权说明全部对应翻译，命令、路径、数字如 656 测试 / 2.3 万张卡保持原样），两边顶部互链。中文仍是主 README，英文版供朋友 / 海外读者看。

### R52：英文模式首页三条中文残留（用户截图反馈）

用户在英文模式下截图：首页三条存档/账号条仍是中文（账号条中文说明、金币赛条 `Gold联赛 · 三十二强 · 32进16`、生涯条 `山猫 · 阶段：done · 未来知识 2 · 管理层信任 65`）。三处根因不同：

- **账号条**：`refreshAccountHomeBar` 在 JS 里硬编码中文覆盖了已翻译的静态文案——改走 `L()`（无账号说明、已登录的卡数/教练/排位/今日抽卡、开局引导三句全双语）。
- **金币赛条**：存档标签是存档**当时**的语言写进 localStorage 的，英文模式读出来还是中文。两头修：新存档的 `buildSaveLabel` 按当前语言生成（`challengeTierName` + `careerStageLabel(lang)`，如 Gold League · Round of 32 · 32→16）；旧存档在 `formatSaveLabel` 显示时按已知片段表翻译（金币联赛/Gold联赛 → Gold League、三十二强 → Round of 32 等，日期也按 en-US 排），旧存档不用重存。
- **生涯条**：队名 `山猫` 来自历史赛季数据表本身（`historicalSeasons.js` 的中文队名），新增 `TEAM_NAME_EN` 35 队映射 + `teamNameL`，显示时按队名翻译（用户自命名球队原样保留）；`阶段/未来知识/管理层信任` 标签走 `L()`（阶段值 done 本来就是英文）。

**验证：** `tests/i18n.test.js` 新增 home-bars 测试（阶段标签、 tier 名、截图原标签 `Gold联赛 · 三十二强 · 32进16` → `Gold League · Round of 32 · 32→16` 的显示翻译、山猫 → Bobcats、自命名 passthrough）；缓存版本号：app.js → `20261024i18n-bars`。生涯深层页面（市场/结果屏的 tier 文案、战术名）仍属 T7 后续范围，本次只修了首页三条。

---

## 今日总结（2026-10-24）：英文版 T7 v1 从 0 到上线

**起因：** 用户截图里浏览器自动翻译把「中投」翻成了中投公司（China Investment Corporation），问是不是翻译错误；确认是机翻错误后，用户拍板「英文版本也照着先做一个吧」。

**当日交付（全部已推 main、CI 绿）：**

| # | 内容 | Commit | 测试 |
|---|---|---|---|
| R50 | 英文版 v1：i18n 层（`js/i18n.js` 语言状态 + `L()` 源头选语言 + 静态文案遍历还原）+ 403 条 `PHRASES` 词表覆盖 index.html 全部 401 段中文 + 顶栏 EN/中文切换；`GameSim` 构造收 `lang`（默认 zh，旧断言不动），81 处播报 emit 点全双语（含 `matchupFeedStory` 重写、92 个技能名 id 词表、shot/hot/mood/fatigue 标签）；界面双语覆盖加载进度、记分牌、12 项属性缩写（中投 → MID）、播报图例、技能 chip、抽卡规则/卡池/状态、每日任务、沙盒、卡库筛选、32 队英文名、结果屏标题 | `8637b88` | 全量 656/656 |
| R51 | `README_EN.md` 全文英译（中文 README 不动，两边顶部互链；命令、路径、数字与中文版一致） | `4d704e5` | —（纯文档） |
| R52 | 用户截图反馈的英文模式首页三条中文残留：账号条 JS 硬编码覆盖、存档标签存档时语言写死（新存档按当前语言生成 + 旧存档显示时片段翻译）、生涯条历史队名中文（新增 35 队 `TEAM_NAME_EN` 映射，山猫 → Bobcats，自命名原样保留） | `7d4e883` | 全量 657/657 |

**翻译策略（定下来不再改）：** 拒绝机翻，全部源头双语——JS 现拼文案用 `L()` 在源头选语言，静态文案走词表 + DOM 遍历、原文存 WeakMap 以便切回中文逐字还原。动机就是中投事件：篮球术语按词典猜必然翻车。

**当日流程备注：** R50 全量回归抓到一处真实回归（bannerExplain「本池最强」行半角括号改动了中文版全角格式），修回后才推；CI 两次均为绿。缓存版本号当日终态：app.js → `20261024i18n-bars`。

## 未来工作 Action Items

- [ ] **T7 v2（英文版深化）：** 生涯叙事长文双语（生涯弧线、顿悟文本、教练/技能描述）；gameplan 战术名与教练名；市场/结果屏深层 tier 文案；已开局存档的队名；沙盒语言切换后即时刷新（目前需重进才刷新）
- [ ] **T7 文档同步：** 之后每次功能更新，README_EN 与中文 README 两边一起改，避免英文版滞后
- [ ] **英文模式继续扫残留：** 按 R52 模式——用户截图驱动，每处修完补一个 i18n 测试，不再靠肉眼扫
- [ ] **T9（待用户拍板）：** 晋级赛小组段赛制是否改回一负淘汰（现状两败出局 + 复活赛，与原始「输了就淘汰」有差异）
- [ ] **T3：** 金币晋级赛刷新池调优（球员太多选不完、金币经常花光选不满阵容；球员 + 技能绑定刷新，显示能力和适配度）
- [ ] **T4：** 穿越生涯交易市场（挂牌询价、外部主动报价、选秀权优先级/倾向、多方交易、球队人员上限）
- [ ] **T5：** 选秀多选 + 交易选秀权（手握多个选秀权连续选多人；选秀权本身可上下交易）
- [ ] **T6：** 真联机对战（服务端 + 账号 + 同步；架构级工程，需先出独立设计文档再动工）

---

### R53：T7 v2——教练/战术名、生涯叙事、市场结果屏、存档队名、沙盒即时刷新

- **教练/战术名**：`coaches.js` 的 23 个战术全补 `nameEn/descEn`（如三角进攻 → Triangle Offense），20 名教练全补 `nameEn/styleEn/specialtyEn/noteEn/record.noteEn`（菲尔·杰克逊 → Phil Jackson；虚构教练按意译，如新人主帅·林 → Rookie Head Coach Lin），8 名助教全补 `nameEn/roleEn/noteEn`；新增 `tacticName/tacticDesc/coachName/coachStyle/coachSpecialty/coachNote/coachRecordNote/asstName` + `coachSpecialtyLabel(coach, lang)`。接线处：账号条教练行、教练下拉（名帅 → Legend）、收藏屏教练卡 + 战术下拉、阵容行教练行、市场当前教练行、教练组随机指派提示、战术勾选面板（名/描述/徽标/解锁原因全双语，`rosterTacticUnlocks(players, lang)`）、战术帮助文案、角色下拉（`roleName`，复用 `ROLE_NAMES_EN`）。
- **生涯叙事长文**：6 个穿越事件全补 `titleEn/promptEn/labelEn/descriptionEn`，渲染处 `localizeStoryEvent(event, lang)`（`listStoryEvents` 之前白名单漏了 EN 字段，顺手补上）；4 种结局标签补 `labelEn`（王朝建筑师 → Dynasty Builder 等），生涯中心结局行与结局分享卡（标题/标签/战绩标签）走语言。
- **市场结果屏深层文案**：`bracketLog` 标签、`careerRoundLabel`、市场提示（回合/场地/奖金/预算/左右栏标题）、冠军结果标题与总结（含 `nextLabelEn`）、总决赛系列标签（`finalsSeriesLabel(series, lang)`）、最佳阵容标题。
- **已开局存档队名**：记分牌队名在开局（beginGame）与读档（wireRestoredSim）两处显示时走 `teamNameL`；播报图例同理；`teamNameL` 新增生成名模式：联盟队 N → League Team N、时空队 X → Time Team X（修了 `时空队 B` 切英文后多空格的小 bug）。
- **沙盒切换即时刷新**：`mountSandbox` 内部 `lang` 改为可变的 `currentLang`，暴露 `root.__sandboxSetLang(lang)`：原地重绘平衡勾选、开打按钮、两侧队名（仅未被用户改过的默认值才跟语言走）、搜索占位/aria、计数与阵容行 aria；语言切换按钮调用它，选卡与搜索状态不丢。
- **测试**：`tests/i18n.test.js` 新增 5 个（战术/教练/助教 EN 字段全量 + helper、解锁原因 EN 无中文、6 事件 + 结局本地化、生成队名映射、tier nextLabel/finals 标签）；顺手修了 `storyEventEngine.test.js` 的结局 deepEqual（新增 `labelEn` 字段）。仍属后续：技能描述长文（skills.js desc）、分享卡内的动态交易/合同叙事、生涯报告 prose。

---

### R54：T3 金币晋级赛刷新池调优

- **缺口加权**：`buildAffordableShop` 在每个价格带内先取缺位（2 人/位置目标下不足的位置，最缺优先）再取其余，组内仍随机抽，刷新结果会变但不再与阵容脱节；价格带构成（7 cheap + 4 mid + 1 stretch + 宝石）不动，经济形状不变。
- **保底可负担**：成架后若可负担（价 ≤ 当前金币）不足 2/3，用最便宜的未上架可负担球员替换最贵的超预算者（按人去重，不摆同人两季）；金币极低到全池都买不起时保底自然落空，不编球员。
- **不满 8 人刷新免费**：新增 `careerRefreshCost(c, base)`——生涯队不满 8 人（凑不齐轮换）时球员刷新费用为 0，满 8 人恢复 ¤50；双人模式走原双边扣费不动；市场提示与空架文案同步显示实际费用。
- **适配徽标**：货架每行新增 `shopFit` 徽标——缺位补强（绿，位置在目标以下）优先于战术契合（蓝，球员 archetype 命中教练战术板 needs，如 connector）；样式在 `css/style.css`（`.fit-badge`），中英双语。
- **球员 + 技能绑定刷新**：`rollSkillShopOffers(size, excludeIds, avoidIds)` 新增已拥有降权——阵容里已有 2 人以上拥有的技能在各档位都不再优先出现（`pickFromTier` 改为“只取 fresh，取不到返回 null”，最后统一 top-up：先 fresh 后 avoided，保证满格）；球员刷新与技能/教练重 roll 仍走同一 `rollCareerStaffShops`，技能单刷（¤25）同样吃绑定。
- **测试**：`tests/careerShopRefresh.test.js` 6 个（缺位排序、shopFit 三态、低金币 2/3 可负担、11 后卫队一次刷新必见中锋、免费刷新三态、技能 avoid 全量）。过程中修了两处真问题：`pickFromTier` 的逐档回退会先返回已拥有技能（改为全局 fresh 优先 + 统一 top-up）；测试沿用仓库既有 synthetic 卡模式（PLAYERS 初始为空，seasonToCard 不填充）。

---

### R55：T4 穿越生涯交易市场（挂牌询价 / 选秀权倾向 / 三方交易 / 人员上限）

- **挂牌询价**：`listPlayerForTrade / unlistPlayerForTrade / listedPlayerIds`（`js/engine/tradeProposals.js`，挂牌存 `st.listedPlayerIds`，跟存档走）。`generateTradeProposals` 改为目标池 = 挂牌球员优先 + 原有“表现突出”球员（去重），挂牌球员不需要打出好表现也能收到报价，文案改为“已挂牌询价，X 前来问价”；已拒绝的签名仍跳过（挂牌后拒绝同一报价不会立刻重现）。
- **选秀权倾向**：`teamSituation(team)` 按平均 OVR 划分——<78 重建、>84 争冠、其余中间。重建队在原有选秀权规则上多搭 1 个（上限 3 个），因为重建队更看重未来资产；争冠队按原规则出价。
- **三方交易**：`executeThreeTeamTrade`（`js/engine/seasonMarket.js`），循环：我方 → 二方 → 三方 → 我方，每腿可多名球员。校验：常规赛阶段、三方互异且球员在队、每队交易后人数在 8–15 人、我方不超硬帽；每支 CPU 队按双边规则分别验收（薪资匹配/战力/硬帽，随机拒规则与双边一致）。日志 `type: "trade_3team"`，带三方队名。
- **人员上限**：双边交易本已在 `executeTrade` 强制 8–15 人（SEASON_MAX/MIN_ROSTER），三方沿用同一常量逐队校验；市场面板顶部工资帽卡片已显示“名单 n/15（最少 8）”。
- **UI**（赛季市场面板）：阵容每行加“挂牌/取消挂牌”按钮与“已挂牌”角标，挂牌后自动刷新报价；交易表单加可选的第三方球队/球员（不选即原 1 换 1，选了走三方循环，表单上方有循环说明）。新增挂牌按钮文案走 `getLang()` 中英切换；面板其余中文文案仍是 T7 剩余项（未动）。
- **测试**：`tests/tradeMarketT4.test.js` 5 个（挂牌优先+非明星也能收到报价、倾向三档阈值、重建队选秀权 +1 及 3 封顶、三方球员轮转与日志、三方拒绝：人数/无效球员/阶段/硬帽）。三方暂只换球员，不带选秀权（留给 T5 的选秀权交易）。

---

### R56：T5 选秀多选 + 交易选秀权

- **多签连续选**：`generateDraftOrder` 改为签位列表驱动——order 项是持有球队 id，同一队可出现多次；`createDraftState` 透传 picks 并把解析后的签位表存在 `draft.picks`。原有回合比较（`order[currentPick] !== userTeamId`）、CPU 自动推进、15 人满员裁人分支都不用改；默认签位表（`buildNaturalPicks`，一队一签）下顺位输出与旧实现完全一致。
- **签位归属**：`applyPickOwnership(picks, ownership)` + `picksOwnedBy(season, year, teamId)`；`beginCareerDraft` 按 `career.season.pickOwnership[赛季年]` 组装签位表，换来的签在赛季末选秀生效。
- **上下换签**：`swapDraftPicks(season, {year, cpuTeamId})`——我方自然签 ↔ 对方自然签，同年首轮；v1 只换未交易过的自然签（一枚签一季一次，防链式换签）；CPU 按战绩排名估值（越差的签越值钱），换入价值低于换出 90% 拒绝。市场面板（仅长期生涯）新增“选秀权交易”区：显示我方持有签位、对方球队选择、换签按钮与结果提示。
- **选秀板**：完成视图“你的选择”由单数改为列出全部用户选中新秀；进行中视图在多签时显示“我方本届签位共 N 个，已选 M 个”。
- **顺带修复（R56 全量发现）**：`buildAffordableShop` 的宝石前置（62% 概率）会与价格带 picks 取到同一张卡，去重后货架可能缩水到 11 张（R54 测试在全量里抖出一次）；去重后现从剩余池补货到满格。
- **测试**：`tests/draftPicksT5.test.js` 6 个（默认顺位为球队排列、多签出现两次、归属转移、换签成交/贬值拒绝/二次换签拒绝、生涯开选秀吃归属表、连续两签都落在用户队并正常结束）。边界：提案附带的通用未来选秀权（`st.draftAssets`，无来源球队）不进顺位表——它没有来源战绩，无法参与按战绩的乐透排序；保护条款的兑现/顺延未做，随顺位表结构留待后续。

---

### R57：T6 真联机设计文档（只出文档，未动工）

- 新增 `docs/ONLINE_DESIGN.md`：服务端权威 + WebSocket 快照同步，不做 lockstep（47 处 `Math.random` 无种子，种子化成本高）；MVP 纯对决不带生涯经济；P0 房号制无服务端账号，P1 重连/观战/差量，P2 匹配池，P3 账号/排位/生涯联机。
- 决策依据全部在文档发布前逐项核实：sim.js 纯 JS 无浏览器引用、snapshot/load 路径（183/240 行起）、`wireRestoredSim`（app.js:1328）、速度档 1–3、`_loop` 节奏；P0 第一个任务列为四项实测（快照体积、tick/速度档映射、wireRestoredSim 直消费用、决策窗口排队语义）。

---

### R58：T9 赛制拍板——保持两败出局 + 复活赛（只对齐文档，未改代码）

- 用户 2026-10-24 拍板：晋级赛小组段**保持现状**（四人一组：开门赛 → 胜者组 / 复活赛 → 晋级决胜，两败出局，见 `js/engine/careerBracket.js` 注释与 opener/winners/revival/decider 四种对局），原始需求里的「输了就淘汰」（一负淘汰）设想作废。
- 本次无代码改动：实现本来就是两败出局 + 复活赛，拍板即确认现状。改动只在文档对齐：README（中英）原始需求对照里的 ⚠️ 待定项改为 ✅ 已决，路线图里删掉 T9 待定项；TASKS T9 标完成。
- 顺带修正同节一条旧路线图：选秀权上下交易已随 T5（R56）上线，路线图里“选秀权只出现在主动报价里”的说法已过期，改为仅剩第二轮选秀待做。

---

### R59：T7 收尾——技能描述、生涯报告、分享卡动态叙事全双语（T7 完成）

- **技能描述**：92 个 SKILL_PACKS 全部补 `descEn`（逐条翻译，含 paint_bully / wolf_king 等长文）；新增 `skillDesc(packOrId, lang)`（与 tacticDesc 同款）；技能芯片 tooltip、技能商店 offer、技能库渲染全部走语言选择（商店 offer 在生成时按当前语言定格，切换语言后下次刷新生效，与教练商店刷新机制一致；技能名本身早已全映射，无需再动）。
- **生涯报告 prose**：`transactionDescription(entry, lang)` 双语化（交易：sent/got；聘任：replacing）；`compactTransactions` 同时存 `description` + `descriptionEn`（赛季结算时算好，旧存档无 descriptionEn 时渲染回退中文）；`careerTimeline` 透传 descriptionEn；`saveRoot` 校验放行双语交易键（旧存档四键仍合法）。生涯历史面板（`renderCareerHistory` + `historyCard`）接 `lang`：筛选器、finish 标签、胜负/冠军/选秀/奖项/交易/大事记等静态文案、交易描述全部按语言取。
- **分享卡动态叙事**：`contractResult` 一次建中英双文案（续约/离队/解雇/谈判中/进行中）+ 4 条合同特权英译；`signatureTrades` 透传 descriptionEn；`finishLabel` 加英文表；`shareCardText` 与 `renderEndingShareCardHtml` 全部行/标签双语（战绩、最佳赛季、改写史实、标志性交易、合同结果、特权、页脚）。
- **测试**：i18n.test.js +5（92 条 descEn 齐全且无中文、商店 offer 中英名/描述干净、交易/聘任 EN 文案、生涯历史 EN 渲染干净、分享卡文本与 HTML EN 干净）；另有 3 处旧测试因交易对象多出 descriptionEn 更新期望（形状变化是有意的）。修测试时发现存档校验是精确键集合，顺手放行双语键。

---

### R60：T6 联机 P0——服务端权威房号 1v1 可玩

- **先实测再动手（设计文档 R57 列的四项全部有结论）**：① 快照体积：两队 12 人满编时 `sim.snapshot()` 实测 ~70KB（publicTeam 把每人重复三遍：场上 + 板凳 + 全名单），远超 8KB 目标——P0 改发精简帧（只带每回合变化的字段 + 场上/板凳名单，静态球员数据由加入消息一次给齐，实测 < 8KB）；② tick 节奏：速度 2 = 300ms/回合，整局约 60 秒，P0 服务端固定速度 2；③ `wireRestoredSim` 不能直接吃服务端快照（它要的是活 sim 实例），但它的 paint 函数全是快照驱动的，客户端按这个思路自己渲染；④ 决策窗口：换人无需排队（立即改场上名单，下个回合生效），暂停/节间/中场天然停住并对双方开放调整，任一方点继续即恢复，20 秒无人操作自动恢复（断线座位在场时不自动恢复）。
- **引擎按方化（单机行为不变）**：`setTactic` / `setPlayPos` 加 `sideKey`；`setOffenseFocus` 经 `opts.sideKey` 按方指定——对方焦点写进该队 gameplan，`resolvePossession` 与 `ballOpts` 的非我方分支同步读 gameplan（此前只读我方字段，对方焦点实际不生效）；换人清空焦点时同步清该队 gameplan。防守体系（defensePlan）与托管开关仍是单方模型，P0 决策集不含这两项，记为 P1 引擎工作。
- **服务端**：`server/online-server.mjs`（Node + ws，需 `npm install`），6 位房号建房/加入，29 支 2020 预设队（名册 2020 赛季 ≥12 人球队），开局发一次全量名单 + 每 tick 精简帧，sim 事件剥掉自带快照只转发 kind/text；决策服务端逐条校验（己方名单/伤停/暂停余量/合法战术与位置），非法回 `decision_rejected` 不中断对局；断线暂停 + 同名重新加入认领原座位；P0 对决伤病关闭（避开已知短手软锁边角）。
- **客户端**：`online.html` + `js/online/client.js`（不跑 sim，只渲染帧 + 发决策）：比分/时钟/球权/暂停、双方场上与板凳、换人/战术/指定持球人/站位/暂停/继续全套；主页加联机入口链接。启动方式：静态站开 `online.html`，另起 `node server/online-server.mjs`（默认 3001）。
- **测试**：新增 19 个——引擎按方 7 个、精简帧 3 个（含 < 8KB 断言）、决策校验 8 个、WS 联调 1 个（建房→加入→换人生效→非法指令拒绝→暂停/继续→断线认领）；另有一局完整对局冒烟（两真客户端打满全场 108–130，双方各 213 帧一致）。修测试时踩到的两个坑已记入教训：resume 会重新拉起 sim 计时链，测试里必须 `stop()`；i18n 覆盖测试在 `setLang("en")` 后断言失败会跳过恢复中文，导致后续中文测试级联失败——根因是主页新增链接文本未进 PHRASES 词表，补词条后 19/19。
- **P0 明确不做**：服务端账号、匹配池、观战、差量压缩（精简帧已够小）、防守体系与托管指令、生涯经济联机。

---

### R61：生涯选秀第二轮——同一 draft 内续轮

- **设计**：单 draft state 内续轮，不拆两个 draft、不动存档校验。`createDraftState` 加 `rounds`（默认 1，旧行为不变）与 `round` 跟踪；生涯 `beginCareerDraft` 传 `rounds: 2`。第一轮打完时 `advanceDraftRoundIfNeeded` 续轮：顺位表沿用本届 `draft.picks`（T5 归属表，含换签结果），按来源战绩最差优先排（**无乐透重抽**，与第一轮的半程乐透不同）；总顺位顺延（4 队联赛第 5–8 顺位），新秀合同按总顺位递减，无需改薪资表；两轮 selections 在同一 draft 对象里，`withCompletedDraft` 一次归档，`draftHistory` 仍一年一条。
- **第二轮池子**：不用第一轮剩菜——第一轮池子按首轮顺位数定量，耗尽时无剩可吃。改用 `${seed}|round-2` 种子重生成，过滤掉第一轮已选的 prospectId/bref，并按已选数补量（每个已选最多顶掉一个候选，补量后必够）；生成卡 id 与种子无关（`generated-年-序号`），过滤是去重的关键。`advanceDraftToUserPick` 入口与循环内都接续轮检查，用户选完最后一签、CPU 选完最后一签都会正确续轮或结束。
- **选秀板**：进行中标题在 `round > 1` 时显示“第 X 轮”；多签计数（“我方本届签位共 N 个”）天然覆盖两轮。旧存档里进行中的一轮选秀（无 rounds 字段）不受影响，仍按一轮走完。
- **测试**：新增 `tests/round2Draft.test.js` 7 个（续轮状态与顺位顺延、次轮最差优先、换签归属带入次轮、池子排除已选且够数、一轮 draft 不受影响、advance 全程带两轮、rounds 非法值拒绝）；5 处旧生涯选秀测试按“两轮打完才算完成”更新（单次归档断言保留，正好验证续轮不重复记 summary）。

---

### R62：T6 联机 P1——观战、断线宽限判负、帧差量

- **观战**：知道房号的第三台设备可只看不下场——开局前加入等开局，开局后加入立即拿全量名单 + 最新帧；观战指令被拒（明确理由“观战不能下指令”）；观战者断开不暂停、不发断线通知（P0 闭包结构下观战者断线本会误触暂停逻辑，P2 重构时已用 early return 修掉，见 R63）。
- **断线宽限**：一方断线先暂停 + 通知对方（含宽限秒数），30 秒内同名认领取消判负（并补发 opponent_back、恢复自动恢复计时）；超期未回判对方胜（game_over 带 forfeit/forfeitSide）。双方都掉线时不设判负计时，只等认领——没人可判胜。
- **帧差量**：服务端与浏览器共用 `js/online/delta.js`（同一份 diff/apply，不怕两边算岔）：首帧永远全量，之后每 tick 只发变化字段（比分/时钟/变化球员的局部字段/变化时才带的场上名单 id 表）；无变化时 diff 为 null。客户端无全量帧时忽略差量。P0 测试因此更新：换人/暂停/恢复的断言改为回放差量链再判断（协议变了，不是服务端回归）。
- **测试**：新增 `tests/onlineP1.test.js` 7 个（差量往返精确重建、成员/战术/焦点变化、等价帧 diff null、观战三件套、差量链与认领全量帧逐 tick 相等、超期判负、宽限内认领取消判负）。

---

### R63：T6 联机 P2——匹配池 + 本地战绩（附服务端重构）

- **服务端重构（P2 的前提）**：P0/P1 的房间逻辑全在单连接闭包里，排队配对需要同时操作两个连接，无法继续打补丁。改为服务端级房间函数（broadcast/broadcastFrame/manageAutoResume/startGame/handleDisconnect 全以 room 为参数，连接只留 ctx{room, side, spectator} 引用）。重构后 P0（1 个）+ P1（7 个）+ 帧/决策/按方（18 个）共 26 个旧测试全过，行为未丢。
- **匹配池**：`queue` 消息按球队 OVR 配对——实测 29 支预设队 OVR 只在 75–79 之间，带宽定 **±2** 才有区分度（±5 等于谁都配谁）；先排队者当主队；60 秒未配上的陈旧条目放宽到任意配对（入队时与每 10 秒 sweep 双通道检查）；排位与休闲永不混池；断线自动离队；每次配对后广播剩余排位。
- **本地战绩**：`js/online/record.js`（纯函数 + 注入 storage，可单测）：对局结束按己方 side 计胜负，平局与观战不计；大厅显示累计战绩。服务端战绩是 P3 的事，P2 不动服务端。
- **测试**：新增 `tests/onlineP2.test.js` 6 个（战绩累积/平局观战不变/脏数据归零、带内配对、先排队者主队、带外只等不配、陈旧放宽、断线离队）。重构中抓到的两个真问题：配对时主客写反（先排队者成了客队，改传参顺序修掉）；断言失败路径下测试未关客户端导致 `server.close()` 永等——测试统一改成 finally 先关客户端再关服务端。

---

### R64：T6 联机 P3——服务端账号 + Elo 排位 + 排位匹配

- **账号**：`server/online-accounts.mjs`（与 WS 分离，可单测）：注册（名字 1–20 字、密码至少 4 位、重名拒绝）、scrypt 加盐哈希（不存明文）、登录发内存 token（重启即登出，账号与分数不丢）。持久化文件默认放用户 home 目录（`~/.courtside-online-accounts.json`），**不进仓库**：静态站 serve 的就是仓库根，账号文件放里面等于公开可读。
- **排位**：Elo，K=32、初始 1000；胜负双方同步变分（等分对局 ±16，低分胜高分多拿）；平局与游客局不计分；判负也计分（胜者拿分、断线者记负）。排位队列按排位分 **±100** 配对，陈旧放宽规则与 P2 相同；排位需登录，游客排位直接拒绝；排位与休闲池隔离。
- **客户端**：大厅账号行（注册/登录/排位分与战绩显示）、排位匹配按钮；token 跟随建房/加入/观战/排队，座位记 account，终局后服务端推送新分数刷新显示。传输仍是明文 ws（默认 localhost），文档里明说：上生产要换 wss。
- **测试**：新增 `tests/onlineP3.test.js` 7 个（注册/校验/重名/短密码、等分 ±16 与以下克上多拿分、跨实例持久化、排位匹配 + 判负计分双向验证、排位需登录与模式隔离、预置大分差带宽拦截、错误登录与重名拒绝）。
- **P3 之后仍剩**：生涯联机经济（生涯存档跨设备同步、市场 integrity、存档冲突）——设计文档 §2 本就把它放在 P3 之后，量级与 P1–P3 之和相当，单独立项，不在这批里凑合。

---

### R65：生涯联机经济 MVP——共享市场 + 联机阵容对决 + 奖金

- **玩法（完整循环已闭合）**：登录即开通联机生涯（1000 金 + 8 人随机 2020 阵容）→ 在共享市场买卖（系统货 30 张按 OVR 定价 + 玩家挂牌）→ 调整阵容顺序（前 5 人首发）→ 用联机阵容排队对决（休闲/排位）→ 赢 +200 金、输 +50 金，排位还动 Elo 分 → 回市场补强。房号对决同样支持联机阵容（建房/加入时选联机阵容）。
- **服务端**：`server/online-economy.mjs`（与账号库分离，账本独立文件，同样放 home 目录不进仓库）：挂牌（卡离队托管、每人上限 5 张、价 50–5000）、购买（金币与卡原子转移、阵容上限 12 人、系统货售出即补货）、撤牌、阵容重排（必须为现有阵容的精确排列）、对决奖金。排队配对规则补两条：预设队与联机阵容永不混池；联机阵容休闲匹配不看 OVR、排位看排位分；排队时阵容不足 5 人直接拒绝（与建房一致，之前只在配对时静默跳过，测试抓到后改掉）。
- **客户端**：`online.html` 大厅新增联机生涯卡（登录后出现）：金币、阵容（挂牌价输入 + 挂牌、↑↓ 调顺序）、市场板（购买/撤牌）、刷新、联机阵容休闲/排位匹配。市场返回已瘦身（只给名字/位置/OVR，不发整张卡对象）。对局终局后奖金经 `economy` 消息刷新金币显示。
- **有意简化的三点（文档里明说，不藏）**：① 卡是模板不是唯一实例——两人可同时拥有同款卡，系统货无限补货，真稀缺（编号卡）是后续；② 市场不实时推送——操作方拿新市场，其他人下次刷新才看到；③ 暂无市场税——奖金只产出不回收，长期会通胀，税与赛季重置是计划中的回收手段。
- **测试**：新增 `tests/onlineEconomy.test.js` 8 个（开局 1000 金 + 8 人、挂牌三重校验、买卖金币与卡双向移动、阵容上限与系统补货、重排排列校验与奖金、持久化、联机买卖全流程、联机阵容对决判负奖金、游客禁入与阵容不足拒绝）。测试里踩到的算术坑：1000 金不一定够买 4 张随机系统卡，改用对决奖金先注资再测上限。

---

### R66：简易胶囊人物模型——球场渲染层切换（照片 ↔ 简易）

- **做法**：不动 sim、不动站位计算。`CourtView` 本来就是按回合推进（2.6 秒发球→过半场→落位→终结）+ 战术阵型 + 漂移 + token 0.7 秒 left/top 缓动，跑动插值早已存在；简易模式只是把 token 的照片头像换成 CSS 胶囊小人（头圆 + 队色身体 + 位置字母），名字、得分、攻防标记原样保留，`moveToken` 一行不用改。
- **跑动感补的两点**：① 推进阶段（phase < 1）球场加 `pushing` class，简易小人做 0.38 秒上下起伏（跑动感），落位后静止——起伏只动内层 figure，不跟 token 的 left/top 打架；② 开关直接做进球场内部右上角（两个建场点都生效），选择记 localStorage，下次进场仍是上次的选择。
- **测试**：新增 `tests/courtSimple.test.js` 3 个（DOM 桩跑真实 CourtView）：照片模式含 img、简易模式含 tok-figure 且无 img、来回切换、简易模式下得分照常更新、pushing class 跟随 2.6 秒阶段。桩的两个坑已记下：Node 没有 rAF（测试里 no-op）；桩的 innerHTML 清空必须同步清 children，否则切模式后 token 翻倍。
- **没做的**：投篮抛物线动画（球目前跟持球人走，投篮瞬间没有出手弧线）、骨骼/3D 模型——原型阶段不做，等看过效果再定。

---

### R67：简易人物第二版——从胶囊升级为人形

- **变化**：简易模式的 token 从“头 + 胶囊身体”换成小人形：头圆 + 队色球衣躯干（胸前位置字母）+ 两条手臂（肤色）+ 两条腿（深色），名字、得分、攻防标记不动。还是纯 CSS，不用图片、不碰 sim。
- **跑动**：推进阶段（stage.pushing）小人全身起伏 + 四肢摆动——左腿配右臂、右腿配左臂，相反相位，落位后恢复站直。所有动画只动内层部件，不跟 token 的 left/top 位置动画打架。
- **测试**：`tests/courtSimple.test.js` 断言同步改成躯干/左右臂/左右腿；其余 3 个用例不变。

---

### R68：投篮出手弧线——球从投手飞向篮筐

- **触发（关键判断）**：常规投篮本来就有事件——命中发 `score`、打铁发 `miss`，只是没带投手信息；犯规/失误的 `miss`、罚球的 `score`、扣篮的 `dunk` 都不是跳投。所以 sim 只改两处：在投篮结算分支的 `score`/`miss` emit 上加 `meta.shot {shooterId, made, pts}`，feed 文本一字不动；`handleSimEvent` 见到 `meta.shot` 就调 `court.onShot`，其余事件不受影响。联机服会剥掉 snapshot、只转发 kind/text，meta 透传不出去，联机不受影响。
- **动画**：`CourtView.onShot` 从上一次渲染存下的投手站位出发（找不到投手时退回持球人位置），向进攻方向的篮筐飞二次贝塞尔弧线（0.75 秒），高度用球的大小变化表示（12px → 20px → 12px）；命中收尾 0.15 秒穿网缩小，打铁收尾 0.3 秒从篮筐弹向中场、落在筐前 4% 处。飞行中 `render` 不抢球的位置（球的 CSS transition 也会在动画期间关掉，否则每帧更新会被 0.55 秒缓动拖成拖影）；收尾时直接落到最终点，帧跳过也不会冻在半空。
- **测试**：`tests/courtSimple.test.js` +4 个（命中弧线中段位置与峰值大小、打铁落点、飞行中 render 不抢球、未渲染时 onShot 静默）。全量套件确认 sim 的 meta 没破坏现有事件断言。
- **没做的**：罚球弧线（罚球事件没带 meta.shot，故意不画——罚球线到筐的短弧线可以后续单独做）、扣篮弧线（扣篮已有高光弹窗，不重复）。

> 合并说明：以下 4 条（R69–R72）原在 feature/time-travel-foundation 分支上以 R46–R49 编号提交，
> 与 main 上的 R46–R49 撞号且从未进入 main。整合进 main 时统一顺延改号，内容未改。
> 原提交：0d2366f（R69）、016a1c1（R70）、a97da34（R71）、3a88e1e（R72）。

### R69：赛季结果页加「模拟下一场 / 模拟整个赛季」，修盒分表移动端溢出

用户截图指出：赛季模式打完一场后，结果页只有「回到赛季主页」和「回主页」两个按钮，没有任何「继续模拟」的选项，每打完一场都得先回到赛季主页再点一次「快速模拟本场/模拟 5 场」，很烦。另问：能不能一次性模拟完整个赛季？

**结果页加按钮**：`wireSeasonResultContinue()` 把之前被强制隐藏的 `#btn-again` 改造成「模拟下一场」（点了直接调 `simSeasonGames(1)`，留在结果页不跳回主页），另新增 `#btn-result-sim-season`（「模拟整个赛季」）。只在 `st.phase === "regular" && !viewingHistory` 时显示两个新按钮；常规赛结束（`phase === "awards"`）或在查看历史比赛时，回归到原来行为（只有「回到赛季主页/返回赛程」为 primary）。

**「模拟整个赛季」的性能坑**：第一版写完直接同步调 `simSeasonGames(82)`，结果浏览器 E2E 跑到 60s 超时。实测发现单次 `simUserNextGame()` 不只模拟用户这一场，还要把那一夜全联盟其他所有比赛一起模拟了推进标准/数据，所以「82 场」其实是 1000+ 场单场比赛，实测单次完整常规赛耗时约 **18-19 秒**。这么长时间同步堵主线程会把标签页冒出「假死」——点击不响应、没有任何进度反馈。

改成新的 `async function simRestOfSeason()`：每模拟完一个比赛日就 `await new Promise(requestAnimationFrame)` 让浏览器有机会渲染一帧，并把 `#result-summary` 文字换成「正在模拟整个赛季…已完成 N 个比赛日，请稍候」实时更新；运行期间把四个结果页按钮（模拟整个赛季/模拟下一场/回赛季主页/回主页）全部羁掉，防止中途点走导致 `state.season` 被并发改写。点「模拟整个赛季」之前先走 `confirmAction()` 二次确认，讲清楚会占用十几秒、过程中不能交易/调轮换。

**顺带修了一个被这轮浏览器 E2E 顺带暴露的旧 bug**：390px 下赛后数据表把整个页面横向撑宽了。`boxTable()` 本来就有 `.table-scroll { overflow-x: auto; }` 包裹表格，但外层 `.box-score { display: grid; }` 的直接子项 `.box-wrap` 没有显式 `min-width: 0`——grid 项目默认 `min-width: auto`，会拒绝缩小到小于其内容的自然宽度，导致内层「表格自己滚动」永远没机会触发，整个页面只好横向滑动来補足（且这个 bug 和比赛場次多少无关，其实整个应用里所有结果页在 390px 都会被这个样）。给 `.box-wrap` 加 `min-width: 0` 后表格改成在自己容器内横向滚动，页面本身不再溢出。

真实浏览器 E2E（`scripts/qa/season-sim-continue.mjs`，桌面+手机）：两个新按钮正确显示且 primary 正确，点「模拟下一场」停留在结果页不跳转，点「模拟整个赛季」后实测到进度文字和按钮禁用状态真实生效（非假死），18.6-19.0 秒后跑完整个常规赛并正确回归到「常规赛结束」状态，390px 无横向溢出。645/645 测试、lint、diff-check 全绿。

### R70：CPU 主动报价生成器从不检查自己硬帽，导致「接受对方自己发来的报价」也会被自己拒绝

用户截图：「太阳 想得到 Steve Francis」是太阳自己主动发来的报价，点「接受报价」却弹「对方硬帽放不下，拒绝」。用户问得对：都是对方自己提出的方案，为什么会被对方自己的帽拒绝？

**根因**：`generateTradeProposals()`（`js/engine/tradeProposals.js`）挑选 CPU 要送回给用户的球员时完全只看 OVR 距离/工资距离这两个启发式指标，**从头到尾没有一行代码检查过报价方（CPU）自己的账本能不能装下这笔交易**。而真正执行交易的 `executeTrade()` 却有严格的 CPU 硬帽检查（`teamPayroll(cpu) - salIn + salOut > SEASON_APRON + 50` 就拒）。对一个已经贴近/超过硬帽的 CPU 队，生成器还是会把它配对到一个 OVR 接近的好球员，只稍微考虑了工资差，根本不知道自己还有没有帽空间装这笔交易，结果生成了一个「生下来就注定被自己拒绝」的报价。

**修复**：在 `generateTradeProposals()` 里引入和 `executeTrade()` **完全一致**的硬帽公式（同样的 `SEASON_APRON + 50` 缓冲）做事前可行性检查，避免两处逻辑漂移。三档回退（跟 已有 `tradeBuilder.js` 的「三档回退」风格一致）：
1. 先用原来的启发式选人（OVR 最近的球员 + 最高潜力分的年轻人）算一遍账；
2. 不达标就在这两人之外再找一个工资最高的「换丁」带上（真实 NBA 交易里常见的「凑工资」做法）并重算；
3. 连加一个换丁都装不下，说明这队真的已经没空间了，直接 `continue` 跳过这笔——宁可少一条报价，也不该挂一个注定弹回来的假货在用户面前。

验证：新增 3 条测试（1）构造一个硬帽贴边的 CPU 队，确认球员被正确加上了换丁且最终 `acceptTradeProposal` 能成功；2）构造一个连换丁都救不了的「无待」队，确认根本不会生成报价；3）旧有回归测试照样全绿（说明正常预算内的 CPU 队不受影响）。变异检查：临时摘掉硬帽补丁逻辑，新增的两条测试立刻变红（「应该被打上换丁」和「不应该生成报价」分别失败），恢复后全绿。

注：下游 UI（`js/app.js` 的「对方球员」展示）和 `tradeComparison.js` 对 `proposal.receivePlayers` 都是通用 `.map()/.reduce()` 遍历，本来就支持任意个数，所以这个「最多加一个换丁」的修复不需要改任何 UI 代码，647/647 全量测试（包括旧有 `tradeComparison.test.js`）依旧全绿。lint、diff-check 也全绿。

### R71：季后赛新增「亲自指挥/快速模拟本场」—— 之前只能一键打完整个季后赛，没法像常规赛一样自己打

用户截图反馈：季后赛页面只有「模拟下一轮」「一键打完季后赛」两个全局模拟入口，常规赛那个「亲自指挥」/「快速模拟本场」到了季后赛阶段就被完全硬禁用，玩家对自己班底的季后赛每一场比赛完全没有个人控制权。

**设计**：季后赛没有 `standings`（范数 W-L），输赢是系列赛计分（`winsHigh`/`winsLow`），所以不能直接复用常规赛的 `recordUserLiveResult()`，得单独做一套平行 API（`js/engine/season.js`）：
- `activeUserPlayoffSeries(st)`：找到用户当前所在且未结束的系列赛（遍历 east/west/finals）。
- `nextUserPlayoffGame(st)`：根据 `winsHigh+winsLow` 算出下一场的主客场（复用现有 2-2-1-1-1 的 `seriesHomeAway()`）。
- `simUserNextPlayoffGame(st)`：快速模拟这一场，内部复用 `simScheduledGame(..., {recordStandings:false})`，再调新增的内部辅助函数 `finishPlayoffGame()` 把输赢计入系列赛。
- `recordUserLivePlayoffResult(st, game, series, snap)`：亲自指挥打完后把 live box score 结果应用到系列赛上，同样走 `finishPlayoffGame()`。
- `finishPlayoffGame()`：统一处理输赢计数、`series.done/winnerId`，总决赛结束时设置 `st.playoffs.championId`、`st.phase = "done"`、`st.finalsAllTeam`。

顺便修了一个潜在续接 bug：`simPlayoffSeries()`（「一键打完」的批量函数）之前总是从 `gi = 0` 开始模拟，如果用户先手动打过几场再点「一键打完」，主客场顺序会被重置。改成从 `series.winsHigh + series.winsLow` 续接。

**UI 接入**（`js/app.js`）：
- `playSeasonUserGame()`/`simSeasonGames()` 在 `st.phase === "playoffs"` 时分别分派到新增的 `playUserPlayoffGame()`/`simUserPlayoffGameFromResult()`，复用与常规赛完全相同的 `openSetup()`/`showSeasonSimResult()` 调用链路，没有另写一套 UI。
- `renderSeasonHub()` 的 `playoffs` 分支不再无条件禁用两个按钮：有指 `nextUserPlayoffGame(st)` 返回非空时就启用，并显示当前系列赛比分/主客场；返回 `null`（被淘汰或等另一分区）时继续禁用并说明原因。
- `wireSeasonResultContinue()` 新增 `playoffSeries` 选项：系列赛进行中显示比分（「东部 · R1 战至 X-Y，可继续比赛」），结束后显示晶级/淘汰/夺冠文案；「模拟下一场」在季后赛中也能用，但「模拟整个赛季」只在常规赛显示（它是 82 场概念，季后赛的「模拟到下一轮/一键打完」已经在季后赛页签里，没有必要在结果页重复一份）。
- 回到赛季主页时会自动跳到季后赛页签，不会回到积分榜。

**验证**：
- 新增 `tests/playoffManualPlay.test.js`（14 条），覆盖主客场计算、两种改法路径的系列赛计分、总决赛夺冠相应状态转换、被淘汰后 `nextUserPlayoffGame` 返回 null、混合亲自指挥+批量模拟不会崩溃/重复计分。变异检查：摸掉总决赛 `st.phase="done"` 转换会让 2 条测试变红，恢复后全绿；但諹实地记录了一个诚实的覆盖缺口——`gi` 续接修复本身没有对应的变异测试（GameSim 是真随机，无法在不引入侥入式 stub 的前提下确定性地验证「恢复后哪队主场」），此修复仅经代码审查确认为正确的一行改动。
- 新增 `scripts/qa/playoff-manual-play.mjs`（30 项检查，桌面+手机各 15 项，全部通过）：用资金上限内最强的账号班底跑完整个常规赛，直接改持久化的 `cls_season_v1` 存档把战绩改成确定性的第 1 种子后 reload+「继续已有赛季」恢复（设计意图是只干预输入条件，其余全程是真实 UI 点击）；验证了「亲自指挥」点击后真能打开 `openSetup()` 设置页并进入真实 `#screen-game`；验证了「快速模拟本场」所属的整条系列赛流程（按钮文案、结果摘要、输赢后回到季后赛页、输掉后「亲自指挥」正确禁用）；无横向溢出、无页面报错。过程中踩了两个坑：最初用便宜班底（OVR 55-70）跟不上其他队，打不进季后赛；改用「最高 OVR」贪心后又因单个传奇卡太贵只开到 5 人就花光预算，改成按「人均预算/12 人」封顶单卡购买上限才凑齐 12 人。
- 661/661 全量测试、lint、`git diff --check` 全绿。

### R72：长期生涯「保存失败」—— 不是单季数据太大，是 pre-root-save 旧存档 key 迁移后从不删除，永久翻倍占用同一份存储配额

用户截图再次报「长期生涯保存失败，刚才的改动已撤销」（`历史赛季`模式，29 队当年阵容，已经打过好几个赛季，正准备从 2004-05 进入 2006 赛季）。上一轮的存储压缩（`compactSeasonForStorage`/`compactRootForStorage`）到底够不够？得先用真数据量出来，不能再靠猜。

**实测**（用真实 `roster.json` 的 23,452 张卡 + `createSeason({mode:"historical", year:2005})` 跑一整个 30 队 2005 赛季）：
- 刚建队：672.6 KB；
- 打完 82 场常规赛（整联盟 1229 场比赛的 `resultsLog`）压缩前：**82.9 MB**；写入 `writeRootSave()` 之后（现有的 box/snapshot/feed 裁剪生效）：**965.8 KB**——现有压缩机制其实工作得很好，哪怕拿一个塞满真实球员属性/技能/薪资的完整历史赛季去压也只有不到 1MB。
- 再用真实引擎跑 6 个连续赛季（`prepareCareerOffseason`→选秀→`completeCareerOffseason`，`historical`模式），压缩后的根存档从 841.9 KB（第 1 年）线性爬到 1013.3 KB（第 6 年），每年只增长约 10-15KB（`seasonHistory`/`draftHistory`/`history` 事件日志都是有界小对象）。按这个斜率推演，哪怕打 30-50 年也就 1.5-2MB 左右，远低于浏览器常见的 5-10MB 单 origin 配额。

结论：**单赛季/多年累计的数据量本身不是问题，现有压缩修复依然有效**。那为什么真实用户还是会碰到配额错误？翻读 `js/data/saveRoot.js` 的 `migrateLegacySaves()` 才发现真正的根因——一个跟本轮存储量完全无关、从项目引入 `cls_root_v3` 那次迁移起就一直存在的旧 bug：

```js
// 旧代码（简化）
const season = parseLegacy(target, LEGACY_SEASON_KEY, [1, 2]);
if (season) {
  const root = createRootState({ ... });
  writeRootSave(root, target);
  return { root, source: LEGACY_SEASON_KEY };   // <- cls_season_v1 从来没有被删掉！
}
```

`cls_season_v1`（旧版赛季存档）、`cls_savegame_v1`（旧版比赛存档）这两个 legacy key，一旦某次启动把它们的数据"迁移"进了新的 `cls_root_v3`，**旧 key 本身被原样留在 localStorage 里，永远不会被删除**。对任何一个从"迁移到 `cls_root_v3`"之前就开始玩这个项目的用户（也就是说，几乎所有长期玩家），这意味着同一份赛季数据会同时占用两份独立的 localStorage key——而且 `cls_root_v3` 自己每次 `writeRootSave()` 内部还要临时写一份 `cls_root_v3_tmp` 做原子替换，三份加起来随时可能把同一个 origin 本就不富裕的配额吃穿，哪怕每一份单独看都不大。这完全可以解释「我的压缩修复明明有效，但用户还是报错」——我在修的是一个本来就没坏的东西，真正漏水的地方在旁边。

**修复**（`js/data/saveRoot.js`）：
- 新增导出 `purgeOrphanedLegacySaves(storage)`：删掉 `cls_season_v1`/`cls_savegame_v1`（如果存在），返回释放的字符数，方便调用方判断"清完有没有用"。
- `migrateLegacySaves()` 的三个分支都在**成功迁移/确认当前 root 可读之后**调用它清掉对应的旧 key：
  - 已经有 `cls_root_v3` 且能正常读出来 → 顺手清掉两个 legacy key（不管是不是这次迁移留下的，反正 root 已经是权威数据源了）；
  - 刚把 `cls_season_v1` 迁移成新 root → 清掉 `cls_season_v1`（不碰 `cls_savegame_v1`，因为这次迁移根本没看过它，必须保持「没碰过的数据原样不动」这条既有不变量）；
  - 刚把 `cls_savegame_v1` 迁移成新 root → 同理只清 `cls_savegame_v1`。
  - 关键细节：root 存在但**读不出来**（JSON 损坏、或 `schemaVersion` 比当前版本新）时**绝不清理**——必须原样保留两份旧 key，不然等于在数据还没确认安全之前就把唯一的备份删了。这是从两条既有测试（`corrupt stored JSON is ignored without changing storage` / `future root prevents legacy migration and leaves all bytes unchanged`）反推出来的不变量，第一版实现图省事把 purge 调用放在了 `readRootSave` 判断*之前*，直接把这两条测试测崩了，调整顺序后才过。
- `js/app.js` 的 `saveLongCareer()`：保存失败且错误是 `QuotaExceededError` 时，先调用 `purgeOrphanedLegacySaves()` 清理一次 orphan key，再重试写入一次——这样即使用户当前这局游戏早就过了应用启动时机（`migrateLegacySaves()` 只在启动时跑一次），也能在保存失败的瞬间原地自救，不用等下次刷新页面。
- 保存彻底失败（清理+重试都救不回来）时，不再只弹一个死胡同式 `alert`：改为 `confirm()` 提示常见原因（隐私/无痕模式、设备存储快满、该网站配额被其他数据占满），并提供"现在导出这次没保存上的进度"选项——导出的是撤销 checkpoint *之前* 那次真实尝试写入的数据（`currentRootState()`），不是撤销后的旧状态，玩家不会因为这次失败白白丢掉进度。`#btn-long-career-export` 原本内联的下载逻辑顺手抽成了共享的 `downloadLongCareerExport(root)`，两处调用保持 DRY。

**验证**：`tests/saveRoot.test.js` 新增/改写 5 条：
- 两条既有迁移测试（`legacy season v1/v2 becomes...`、`valid legacy live game is migrated...`）原先的断言是"迁移后 legacy key 原样保留"——这其实是把 bug 编码成了"正确行为"，现在改成断言 legacy key 被删除（另一把没被这次迁移用到的 legacy key 则保持不动）。
- 新增 `orphaned legacy keys from a pre-fix build are cleaned up once cls_root_v3 already exists`：模拟一个老版本遗留的场景（`cls_root_v3` + 两个 orphan legacy key 同时存在），确认 fast-path 分支会把它们都清掉。
- 新增 `purgeOrphanedLegacySaves removes both legacy keys and reports bytes freed` / `...is a safe no-op when nothing is orphaned`：直接测试新导出函数本身。
- 变异检查：临时注释掉 fast-path 分支里的 `purgeOrphanedLegacySaves(target)` 调用，新增的「orphaned legacy keys...」测试立刻变红，恢复后连同全部 29 条 `saveRoot.test.js` 测试一起转绿——证明这条测试真的在盯着这次修复，不是摆设。
- 664/664 全量测试、lint、`git diff --check` 全绿。

**诚实的覆盖缺口**：这个修复只解决了"legacy key 泄漏"这一个具体根因；用户的实际失败还可能叠加「设备存储接近写满」「隐私模式下 localStorage 配额被浏览器限制到接近 0」等环境因素——这些是本地单机 `localStorage` 架构的结构性限制，不是这次能修完的，长期仍然需要评估 IndexedDB/导出导入/云存档方案。另外，诊断过程中意外发现一个和本次修复无关的小问题：如果在应用之外的裸 Node 脚本里，`PLAYERS` 数组还没通过 `loadPlayers()`/手动灌入真实数据就直接调用 `createSeason({mode:"historical"})`，会陷入一个耗时数分钟甚至更久的病态慢路径（真实浏览器里不会触发，因为 UI 在名册加载完成前根本点不到这个入口）——值得记一笔但本轮不处理。

### R73：选秀权两套模型统一——市场里交易的签现在真的会改变选秀

**根因**：选秀权同时存在两套互不相通的数据。交易市场用「每队一个令牌列表」（`st.draftAssets` / `team.draftAssets`），真实选秀（`leagueDraft`）却只读 `season.pickOwnership[年份]`。结果：市场里卖掉的首轮签，选秀当晚原主人照样用；买进来的签，选秀时根本不算。（实测：卖出 `USER-r1-2026` 后 `picksOwnedBy(…, 2026, USER)` 仍包含自己。）另有一类报价附赠签是 `makePickAsset` 凭空造的令牌，不属于任何球队。

**做法**（新模块 `js/engine/pickLedger.js`）：选秀所有权是唯一的真相来源，令牌列表只是它的视图。
- `pickOwnership[年][来源队]` 仍是首轮归属；新增稀疏的 `pickOwnershipR2[年][来源队]`，只在次轮签被单独交易时才有条目。没有覆盖时次轮跟随首轮（旧行为不变）。
- `parsePickId` 从令牌 id（`<队>-r<轮>-<年>`）解出来源队/轮次/年份；`setPickOwner` 写账本；`reconcileTokens` 让每个令牌回到账本里的持有者的池子。
- `executeTrade` 先改账本、再对账。（一开始我手工搬令牌又对账，两者互相打架，把刚搬走的令牌搬了回来——测试抓到了。）
- `swapDraftPicks`（换签 UI）换完后对账；若任一方的次轮签已被单独交易过则拒绝换签。
- 老存档：令牌所在的池子当年就是「交易记录」，所以首次对账时把它们收编进账本（`pickLedgerVersion`），已有显式 `pickOwnership` 条目的以条目为准；不会把已卖出的签悄悄还回去。
- 全联盟一次性播种（`draftPoolsSeeded`），不再按「列表是否为空」逐队惰性播种。

**回归**：第二轮顺序我一度改成只读赛季账本，导致既有测试 `round-2 order follows traded pick ownership` 变红（调用方通过 `picks` 参数传入的归属被丢掉）。已改为「显式次轮覆盖，否则沿用本届选秀实际用的首轮归属」。

**验证**：`tests/pickLedger.test.js` 12 条，含走真实 `beginCareerDraft` 的端到端；变异检查：不写账本 → 4 条变红；次轮忽略覆盖 → 1 条变红；老存档收编每次都跑 → 1 条变红。**诚实说明**：去掉「一次性播种」标记位后没有测试变红——账本对账本身就会把重新播种的令牌搬回持有者，所以该标记位只是防御/性能，不是修复本身。816/816、lint、`git diff --check` 全绿。

**没有解决**（需要单独设计；**两条都已在 R75 解决**）：
- 报价附赠签仍是凭空造的合成令牌（`source: "trade"`，不绑定来源队），不影响选秀；CPU 池里也没有足够的真实签可供抽取（每队固定 2 个，而「选秀权」偏好一次给 3 个）。
- 每队的签池只在首次使用时播种，之后永不滚动：用过的年份的令牌不会过期，新年份的签也不会补发。要根治需要一个真正的选秀日历（每队未来 N 年的首/次轮）。

### R74：对联机服务端 / 续约 / 被裁 / 球场动画做代码审查，发现并修复的问题

对联机服务端（T6）、球场简化人物与投篮弧线（R66–R68）、续约被裁流程逐项做了代码审查 + 真实浏览器验证。每个问题都先在未改动的代码上复现。
- **一个畸形 WebSocket 帧就能让服务进程退出**：`ws` 对协议错误（保留 opcode、超长消息、坏 UTF-8）会在 socket 上触发 `error`，服务端没有监听，Node 会重新抛出。6 字节、无需账号。修：每连接 `error` 监听。
- 已登录客户端发 `market_roster_order` 且 `cardIds` 不是数组会抛异常击穿处理器（只有 `JSON.parse` 被包住）。修：`reorderRoster` 校验类型 + 整个消息处理器 try/catch，异常变成 `decision_rejected`；解析成 null/数字/字符串的消息提前拒绝。
- 账号名叫 `__proto__` / `constructor` 会让经济库把 `Object.prototype` 当玩家。修：玩家表改为无原型对象。
- 消息大小上限 64 KiB（`ws` 默认 100 MiB）；登录 5 次失败锁 60 秒（`scryptSync` 会阻塞事件循环，无限试密码既是爆破也是拒绝服务），且只追踪已存在账号，避免随机名撑爆内存。
- `server/` 目录从未被 lint 到：`eslint.config.js` 没有它的条目，ESLint 9 会读文件但不施加任何规则（植入未定义变量也不报）。已加入 lint。
- 存档校验器只认 `story-event` 形态的待决决定，而引擎续约时产生 `{type: "contract-renewal"}`，导致续约待决状态**永远存不进存档**（会话内正常、失败只进控制台、关页面就丢）。修：校验器接受它，其余畸形输入仍拒绝。
- 被裁没有任何界面反馈：重新进入穿越页走的分支不渲染结局报告，还显示「继续」。修：补渲染报告和分享卡，按状态显示中英文提示，被裁/离队后隐藏「继续」。
- 记分条把士气显示成 `78.00500000000001`：显示层取整（模拟仍保留精度）。老 bug，非本次合并引入。
- 球场动画（R66–R68）：代码审查未发现缺陷；真实浏览器采样确认投篮弧线球体 12→20px 并回落，10 个简化人物都有躯干/手臂/腿，无溢出无报错。手机宽度下人物较挤、底部说明条会盖住篮下，属于原有布局取舍，未改动。

**已知未处理**：联机对局奖金输家也拿（200/50），两个小号互刷金币；注册未限流；明文 `ws://` 无 TLS；穿越页文案「擅自执教」疑似用词不当。

### R75：选秀日历——每队持有未来三届的真实首/次轮签，窗口随赛季滚动，CPU 报价只附赠它真正拥有的签

**要解决的两件事**：（1）CPU 报价的「附带选秀权」是凭空造的合成令牌，没有来源球队，既不影响选秀，也凑不够「选秀权」偏好要的 3 个；（2）签池只在首次使用时播种，用过的年份不过期、新年份不补发。

**模型**（`pickLedger.js` 重写）：令牌不再存储，由**日历 + 账本**推导。
- `PICK_HORIZON = 3`：每队持有当年起三届各一个首轮、一个次轮（共 6 个）。`picksHeldBy(season, teamId)` = 日历上所有「账本说归它」的签（自己的优先、年份近的优先），加上老版本遗留、尚未过期的合成令牌。`teamDraftAssets` 只是它的包装。
- 因此**窗口自己滚动**：选秀已发生的年份自然掉出窗口，新年份自然进入；交易一个签只是写一条账本记录，不可能再被复制或丢失。
- `prunePickLedger` 在 `advanceLeagueOffseason` 年份 +1 之后清掉已发生年份的账本条目和过期令牌，并清空旧报价（`tradeProposals`）。
- 老存档迁移（`ensurePickLedger`，幂等，v2）：v0（令牌所在的池子就是交易记录）→ 收编进账本再丢弃池子；v1（账本已是真相、池子只是镜像）→ 直接丢弃池子，**账本优先于残留令牌**；已过期的合成令牌丢弃，未过期的保留直到过期。`beginCareerDraft` 和 `swapDraftPicks` 入口都会先迁移，所以**没打开过交易市场的老存档**也能让交易生效、换签也不会拿一个已经不属于你的签去换。
- CPU 报价（`tradeProposals.js`）：删除 `makePickAsset`；`chooseOfferPicks` 从提议球队**当前真正拥有**的签里挑，首/次轮交替、近年优先；同一批报价里已提供的签登记在 `usedPickIds`，同一俱乐部在一批里出两个报价也不会重复；报价出不起足够的签就少给，不凭空造。`ensureTradeProposals` 每次校验已存报价里的签是否还在提议方手里，不在就刷新；接受报价时签随交易一起进入 `executeTrade` 的 `wantPickIds`（一次性校验，账本记录新主人），不再事后往列表里 push。
- 界面：选秀权选择器给别队的签加「XX 的」前缀；两个列表里签前面加「选秀权 · N」小标题（粘性），列标题写明「N 名球员 · 6 个选秀权（列表下方）」。因为签排在 420px 滚动框里球员的后面，不加标题的话看起来只是「更多球员」，且在折叠线以下（实测第一个签在框内 528px 处）。复选框行改成弹性布局（`.sm-trade-check > span`）。

**验证**
- 新增 `tests/pickCalendar.test.js` 13 条；改写 `pickLedger` / `tradeBuilder` / `tradeProposals` 里**只断言旧存储形式**的 7 条（`st.draftAssets` 里有没有、数组引用相同、长度为 2、接受报价后往列表 push）。逐条核对过失败断言：全是存储形式，不是行为回归；行为断言（签从 CPU 转到用户、真实选秀看得见）全部保留。全量 829/829，lint 0 错误，`git diff --check` 通过。
- 变异检查 13 项（日历窗口、跳过当年、不写账本、不迁移、不剪枝、不清报价、不校验已存报价、接受时忽略签、选签只取首轮队列、次轮覆盖、两个入口不迁移……）。**一开始有 1 项存活**：「批次里不登记已选的签」。原因是我的测试场景里每个报价来自不同俱乐部，而每个签任一时刻只属于一个俱乐部，所以根本碰撞不了，那条测试是空转的。改成把其他俱乐部薪资撑爆、让重建队成为唯一能报价的一方，才能制造同俱乐部多报价；之后 13/13 全部抓住。
- 真浏览器 `scripts/qa/pick-calendar.mjs` 38 项（桌面 1280 + 手机 390）：每边 6 个签、三届连续、估值无 NaN、别队签有来源前缀、真实交易后列表变化、**刷新后经「继续生涯」回来签仍在**、存档里有账本且不再有令牌池、标题/列标题、无溢出、无报错。
- 只看数字漏掉过一个视觉缺陷：新加的「76人 的 」前缀让那一行的复选框孤零零排在文字上面（390px 手机，桌面正常）。数字检查全绿，是我专门截了选秀权所在的那个框才看到的。改完后加了「复选框与文字首行对齐」断言，并**用真正的旧样式验证过它会红**（点名那一行）。
- **更正我自己的一个说法**：我最初把这个缺陷解释成「文字宽度刚好落进某个窄区间」。后来把标签逐字加长扫描 123 种长度，旧样式下一次都没复现，所以这个解释**没有数据支持**，机制我并没彻底搞清楚。扫描意外测到的真实差别是：塞入 40 个不可断字符后，旧样式行宽撑到 479px（超出 390 的屏幕），弹性布局稳定在 308px。所以保留弹性布局的理由是「长到不能断行的标签不会撑破屏幕」。

**已知未处理（均为原有问题，不是本次引入，刻意没有顺手改）**
- **硬帽让绝大多数 CPU 交易不可能**：新开的 32 队联盟里，抽查的 3 个联盟、93 家 CPU 俱乐部**全部**一开局就超过硬帽线 `SEASON_APRON + 50 = 2350`（薪资 2541–5566）；`executeTrade` 的规则是「对方交易后薪资 > 硬帽就拒绝」，不区分这笔交易是加薪还是减薪。实测对 31 家各提议一笔**薪资完全中性**的次轮签互换，0/31 接受（`对方硬帽放不下`）；改动前的代码同样 0/31。CPU 主动报价用同一个公式预检，所以真实联盟里大概率也生成不出报价。是否改为「只拒绝让对方净增薪资且超线的交易」是产品规则取舍，待决定。QA 脚本因此先把存档里 CPU 薪资压低再测。
- 赛季设置页的「继续已有赛季」在刷新后永远不会出现：`loadSeason()` 只读旧 key `cls_season_v1`，而启动时旧存档已被迁移进根存档并删掉旧 key。续玩入口实际是首页的「继续生涯」。数据没丢，入口不一致。
- 手机/桌面选秀权标签里 `（乐透保护）（≈ +1.9 OVR）` 两个括号紧挨着，读起来别扭。

### R76：硬帽只拦「让对方薪资净增加且超线」的交易（解决 R75 里记下的「CPU 几乎不能交易」）

**问题**：新开联盟里 93 家 CPU 全部一开局就超过 2350 的硬帽线，而旧规则是「交易后薪资超线就拒绝」，不看这笔交易是加薪还是减薪。所以连薪资完全中性的次轮签互换都 0/93 接受，CPU 主动报价也 0 个。

**规则**（`seasonMarket.js` 的 `cpuCapBlocksTrade(payroll, takesOn, sendsOut)`）：只有当 CPU 俱乐部**接收的薪资 > 送出的薪资**，且交易后仍超线，才算被硬帽拦住。减薪或持平的交易不因硬帽被拒。两队交易、三队交易、CPU 报价预检**共用这一个函数**，避免报价过了一道检查却栽在另一道。

**CPU 报价**（`tradeProposals.js`）：预检同时看两边——CPU 能不能吃下，**我方吃不吃得下**（我方薪资加上收到的不能超过 `SEASON_APRON`）。凑薪资用的「搭头球员」改为挑**两边都放得下的最大合同**，而不是无脑取最贵的（最贵的能救 CPU 的账，但我方永远吃不下）。

**验证**
- `tests/cpuCapRule.test.js`：规则本身的边界。
- 真浏览器 `scripts/qa/cpu-cap.mjs`（93 家 CPU 的真实新联盟），同一脚本对新旧代码各跑一遍：次轮签中性互换被接受 旧 0/93 → 新 93/93；甩薪资交易 旧 1/93 → 新 93/93；加薪交易仍被拒 57–92 个样本里全拒（新旧都是）；CPU 主动报价 旧 0 个 → 新 9 个，且 9 个都能被接受。**新 7/7；旧 4/7，且恰好红在该红的三项**，说明脚本抓得住问题。
- 我自己的 QA 断言写错过一次：要求「尝试的俱乐部数 ≥ 90%」，而有 36 家对方最便宜的球员比我方送出的人还贵、构不成净加薪，样本自然少。改成「至少 30 家样本且全拒」。
- **放宽硬帽让 R75 里一条测试的前提失效**（「同批报价不重复」靠「其余球队被硬帽挡住」来制造单一报价方）。不是代码回归，是测试场景失效。改成：我方薪资顶到线边上，另外两队最便宜球员 ≥400，只有重建队能出价；并加了「某队至少出两个报价」的断言，防止它再次空转。**变异验证**：去掉「已用签」过滤后，重建队把同样三个签送了三遍，测试变红；还原后变绿。全量 894/894。

**这是改产品规则**：我之前问过要不要改，按「按推荐自动做」的授权做了；它单独一个提交，不想要可以直接 revert，不牵连别的。
