# B33 一页设计：面试 + 预言轻量整合进 Reborn 开局

状态：APPROVED IN PRINCIPLE（用户 2026-11-09）。本文件为实施计划，取代 `b33-d-segment-merge-design.md`（8ee74b9，全量合并方案）——那份文件只作参考，不再执行。救援分支 `rescue/d-segment-interview-prophecy`（`e2727c2`）保留，验证通过前不删除。

## 目标

一个可玩、有故事的 Reborn 开局：沿用现有三队 Offer 选择为主线，把分支里值得留的面试和预言挑出来整进去。不全量合分支，不改开局的基本形状。

## 现在的开局（main，不动骨架）

`createTimeTravelPrologue` → `generateInterviewOffers` 生成三份 offer（重建/中游/争冠各一，按年份 + 理念定种子）→ offer 卡片上点"接受邀请，开始执教" → `acceptInterviewOffer` 建赛季 + 存档根，`frontOfficeTrust`/`mediaPressure` 取 offer 自带的 trust/pressure，`pendingDecision: "future-knowledge-intro"` → 三选一未来知识（分享沉睡者：知识 −1、信任 +8、分歧 +6；引入负荷管理；保持沉默）。面试和预言都挂在这条线上，不另起流程。

## 复用什么、留什么

复用（按分支内容原样搬，只改接线）：
- `js/career/interview.js`（115 行，纯函数）：三题（阵容/时间线/资源）× 每题三答案，每题给每种类型恰好一个 −1/0/+1；`scoreInterview` 计分，答案顺序按 offer id 哈希打乱；`conductInterview` 出 verdict hired/rejected。
- `js/ui/timeTravel/interviewCard.js`（104 行）：面试面板；通过盖"面试通过"章、直接接受不重面；拒绝变灰不可选。
- `js/career/draftProphecy.js`（164 行，纯函数）：`sleeperCandidates`（未来三届新秀班，一真沉睡者 + 两陪衬，模糊记忆区间宽 12、偏移 ±5）、`pledgeProphecy`、`settleProphecy`（三年后真实卡片裁决）。
- `js/ui/timeTravel/prophecyCard.js`（90 行）：预言选择器 + 待裁决卡片。
- `js/ui/timeTravel/introCard.js`（79 行）：把未来知识三选一从 screen.js 拆出来；选"分享沉睡者"时先打开预言选择器，点了名才落定。
- `js/career/balance.js` D 常量（20 行）：信任 3/分、压力 2/分、拒绝线 −2、命中线 76 等，原样搬。
- `js/data/saveRoot.js` 预言校验（20 行）、`js/modes/seasonRollover.js` 裁决步骤（9 行）、`js/app.js` 休赛期总结一行、`index.html` 三处挂载 + css、`js/i18n-phrases.js` 一条"选秀预言"。
- 测试 `tests/interview.test.js` + `tests/draftProphecy.test.js`、QA `scripts/qa/career-interview.mjs` + `scripts/qa/lib/interview.mjs`，原样搬。

留在分支上（这次不拿）：
- 分支的合并本身——基底 4849780 已落后，试合 5 个文件两边都改、3 处冲突；整枝合会把陈旧基底带回来，改为上面清单逐项搬。
- 分支的 screen.js 整段改动——不直接合，只在当前 screen.js 上重接四个点（面试卡片挂载、offer 确认改走面试、`renderIntro` 改走 introCard、预言卡片渲染）。
- 没有功能被丢弃：分支 20 个文件里可复用的就是上面这些，"轻量"指的是合进来的方式，不是砍功能。

## 面试怎么嵌进现有开局（不重复三队选择）

流程不变形，只在"点接受"之前加一步：
1. 三份 offer 卡片照常展示（重建/中游/争冠，内容不动）。
2. 点某家 offer 的确认按钮，文案从"接受邀请，开始执教"改成"去面试"；面试面板弹出，三道题，答案顺序按 offer id 打乱。
3. 契合度 −3..+3：信任 +3/分、压力 −2/分。`conductInterview` 直接改写该 offer 的 trust/pressure 并盖 `offer.interview`，所以 `acceptInterviewOffer` 不用改逻辑（只补一条 eventLog），开局信任/压力天然就是面试后的数字。
4. 总分 ≤ −2 且不是最后一家 → 该队婉拒，卡片变灰不可选，去面另外两家；最后一家不能拒绝（永不失业）。已通过的 offer 直接接受，不重面。
5. 接受后照常进未来知识三选一。老存档（没面试就接受的）保持原样，不追问。

关键点：三队选择仍是开局的唯一入口，面试是每家 offer 门口的一道手续，不是第二套选人流程。

## 预言怎么与 D1–D7 共处

两者各为准不同层，不冲突：
- 预言是一次性开局赌约：开局"未来知识"三选一里的"分享一个选秀沉睡者"，要点名道姓（棋盘：未来三届新秀班，一真沉睡者——新秀年 ≤68、三年内冲到 ≥78——加两陪衬——三年内从未超过 70；每人只给一条模糊记忆）。三年后按该球员真实生涯卡片裁决：前三季巅峰 ≥76 算命中（信任 +6、声望 +2），否则落空（信任 −5）。同一故事同一棋盘（由 year + 生涯种子决定）。
- D1–D7（`CAREER_LIFE_ROADMAP.md:144–150`）是持续的选秀/球探经济系统，全部 📋、暂停、M7 门控，本次不动。重叠点只有一个：预言棋盘 vs D3"提前知道下届选秀"。裁决：预言是一次性赌约、有裁决和奖惩，不是一次球探消费；D3 保持独立的"花精力提前看选秀班"机制，以后做 D3 时不把预言棋盘算进去。D1"真实潜力"的哲学（潜力来自真实生涯曲线）正是预言定义"沉睡者"的依据，是一致的。
- 棋盘为空（这几届里没有拿得准的沉睡者）时，分支行为是：沉睡者选项只按数字生效（知识 −1、信任 +8、分歧 +6），不打开选择器。

## 存档影响

- 新增可选字段 `root.story.prophecy`（bref、姓名、新秀赛季、裁决年、记忆区间 low/high、立约年、状态 pending/hit/miss、裁决后 best）；`saveRoot.js` 只在字段存在时校验，老存档没有它直接跳过，不做迁移、不升存档版本号。
- 面试不产生新的根字段：它活在开局 prologue 的 offer 上（`offer.interview`），接受后只留一条 eventLog；老存档不受影响。
- 裁决只在换季结算里多一步：目标结果 → 发薪 → 声望 → 选秀预言 → 年龄 →（过期挖角）→ 下一剧情；结果进休赛期总结（🔮 预言成真/落空 + 信任/声望变化）。

## 实施步骤（按顺序）

实施人：Luna（搬运 + 接线，不碰 sim.js，在其范围内）。

1. 把上面"复用"清单里的新文件按原样搬到当前 main（`interview.js`、`draftProphecy.js`、`interviewCard.js`、`prophecyCard.js`、`introCard.js`、`timeTravelInterview.css`、两个测试、QA 脚本 + `lib/interview.mjs`），不直接 `git merge` 救援分支。
2. 在当前 main 上重接接线：`balance.js` D 常量、`saveRoot.js` 校验、`seasonRollover.js` 裁决步、`app.js` 总结行、`index.html` 挂载、`i18n-phrases.js` 一条；screen.js 上重接四个点（面试卡片挂载、offer 确认改走面试、`renderIntro` 改走 introCard、预言卡片渲染），offers.js 加章戳。
3. 跑分支的两个新单测 + 全量单测 + `career-interview` QA（桌面 + 手机）+ `coach-origins`（分支动过它）。
4. 浏览器冒烟 QA：新开生涯走通面试 → 接受 → 选沉睡者立约 → 打三个赛季 → 休赛期总结里看到裁决行；再走一遍拒绝路径（面砸一家、卡片变灰、面第二家通过）。
5. BACKLOG B33 标 ✅，只在第 4 步验证通过后；板上写一行（不发 review 请求，按批量 review 的规矩）。
6. 救援分支保留，直到第 4 步通过；通过后是否删除，由用户定（默认留着也行）。

范围说明：这是 BACKLOG 工作，动的是已在 main 里的开局流程，不碰 M4/M5 里程碑，不等 M3 门。

## 不做

不做 D1–D7（仍暂停、M7 门控）；不改面试/预言的平衡常量（除非用户在下面两个问题里说调）；不改 online；不给老存档补面试/预言；不给再就业 offer 加面试（分支也没加）；不动 sim.js、不动引擎。

## 用户决定（2026-11-09，实施前已批）

1. Q1 数字按原样搬（拒绝线 −2、信任 +3/分、压力 −2/分；命中线 76、沉睡者 ≤68→≥78、陪衬 ≤70）。整合前不重新平衡；整合后试玩发现问题再调。
2. Q2 面试默认开启、允许跳过：入口按钮"跳过面试，直接接受"；跳过 = 中性调整（不加面试奖励、不扣分、不触发拒绝），不跳过未来知识/预言剧情；面试被拒可选剩余球队；最后一支球队不因面试失败拒绝玩家；首次进入 Reborn 默认推荐面试；老存档兼容。
