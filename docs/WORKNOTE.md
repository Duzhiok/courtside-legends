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
- 抽卡券来源：新号礼包 4 张（一次）、每日「打 1 场排位」+1、「赢 1 场」+1（每天最多 2）、排位累计每 5 胜 +1。
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
- 本地 `main`（另一个 worktree，`/Users/z0d01u4/Myproject/nba-coach-sim`）落后 origin/main 44 个提交，是另一条独立的陈旧状态，这轮不处理（不碰 main checkout）。
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
