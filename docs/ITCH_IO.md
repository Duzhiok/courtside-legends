# itch.io 上架资料（DRAFT 草稿，未发布）

> **状态：草稿，已过 Luna review（2026-10-28），未发布。**
> 写于 2026-10-28。游戏本体：场边传奇 · Courtside Legends（纯静态网页游戏）。
> 本文件只准备资料，不创建账号、不联系 itch.io、不做任何发布动作。

---

## ⚠️ 发布前必读（先于下面所有内容）

**这个游戏用了真实 NBA 球员的姓名、赛季数据和照片。公开上架到 itch.io
（任何人能搜到、能玩的公开页面）和公开上架到 App Store / Google Play 是
同一个性质的肖像权（right of publicity）风险**，详见 `docs/MOBILE_APPS.md`
开头的警示。$0 上架费不等于零风险。

在用户明确决定之前，**不要把可见性设为 Public**。相对安全的路径：

1. 先以 Draft（草稿）/ Restricted（仅限指定人）状态搭好页面、自己测通；
2. 想清楚走哪条路（私下分享链接 / 接受公开风险 / 改虚构球员）再决定是否公开。

下面所有资料都按“先搭好、不公开”的前提写。

---

## (a) 可直接粘贴的页面文案

### Title（标题）

```
Courtside Legends
```

副标题行（放在描述顶部，不是 itch 的独立字段）：

```
场边传奇 · Courtside Legends
```

### Tagline（标语，用于封面/分享，一行）

```
Draft historic cards. Coach from the sideline. Open shots still miss.
```

### Short description（itch 的“Short description”字段，1–2 句）

```
Draft historic season cards, coach from the sideline, and rewrite basketball history. A bilingual (EN / 中文） basketball card-draft and coaching sim with 23,000+ season cards, a five-year time-travel career, and a full league-manager mode — playable right in your browser, no install needed.
```

### Long description（itch 的 Description 正文，英文在前）

```markdown
Draft the past. Coach the moment.

Courtside Legends is a basketball card-draft and courtside-coaching simulation. You don't play the players — you sit on the sideline and coach them: call timeouts, shout from the bench, set tactics, substitute, arrange matchups, and equip skills, while the engine simulates every possession.

**Draft by season, not just by name.**
23,000+ season cards covering 4,300+ players from 1950 to today. Every card is tied to one specific season — peak Lakers Shaq is not the same card as Celtics Shaq — and ratings are derived from that season's real numbers, calibrated against NBA 2K anchors for key seasons.

**Modes**
- Custom draft battles — budget draft, then a 32-team historic knockout
- Ranked ladder — your local roster and coaches, results recorded
- Draft team builder — draft players and coaches, play a full simulated game
- Season journey — a 32-team league, or replay one historic year in full (e.g. 1991)
- Coin tournament — win to earn coins, buy and sell in the market, climb the ladder
- Local multiplayer elimination — 2–8 players on one machine
- League manager — run a franchise for 15+ years: seasons, market, draft, development, history
- Time-travel career — pick a year from 1976–2025, interview for a job, and rewrite five years of history with limited knowledge of the future. Get fired if you lose too much, negotiate a renewal at the end, and share your ending card.

**What decides games**
Chemistry, lineup fit, tactics, personality, fatigue, momentum, and skills (signature moves, duo combos, team auras). Superteams are not invincible, and open shots still miss.

**Details**
- Fully bilingual: English / 中文
- Single-player in the browser; no install, no account. Saves live in your browser.
- Online duels exist in the desktop version but need a self-hosted server, so the itch.io version is the complete single-player game.

Unofficial fan game. Not affiliated with, endorsed by, or connected to the NBA, its teams, or its players.
```

### 中文段落（放在英文描述之后，简短版）

```markdown
场边传奇是一款篮球抽卡 + 场边执教模拟游戏：按赛季年份抽卡组队，你坐在场边当教练——叫暂停、大喊、布置战术、换人、设对位、装技能，比赛由引擎一回合一回合模拟。

2.3 万+ 张赛季卡、4300+ 名球员（1950 年起），每张卡绑定具体赛季年份；化学反应、阵容适配、战术与性格共同决定场上表现，巨星抱团不无敌，空位也会打铁。模式包括自定义对战、排位赛、选秀建队、常规赛征程、金币晋级赛、本地多人淘汰赛、联盟经理（15+ 年长期经营），以及穿越生涯五年篇章（1976–2025，面试上岗、战绩差会被解雇、任期结束谈续约）。

中英双语，浏览器里直接玩，不用安装、不用注册，存档存在浏览器本地。非官方球迷作品，与 NBA 无关。
```

---

## (b) 分类、类型、标签、定价（推荐值）

| 字段 | 推荐值 | 备注 |
|---|---|---|
| Kind of project | **HTML**（浏览器内可玩） | itch 编辑页的 Kind Of Game 列表里选 “HTML Game”；不要选 Downloadable，否则玩家只能下载不能直接玩 |
| Classification | **Game** |  |
| Genre | **Sports** | 编辑页下拉选项未实测（需账号登录才能看到）；如果 Sports 不可选，备选 Simulation，其次 Strategy |
| Release status | **In development** | 游戏仍在持续更新（最新 R85），写 In development 比 Released 诚实；稳定后可改 |
| Tags（建议 10 个以内） | `basketball` `simulation` `strategy` `sports` `management` `card-game` `draft` `coaching` `singleplayer` `browser` | 据第三方总结标签上限约 10 个，未经官方文档证实，填的时候以编辑页实际限制为准 |
| Pricing | **$0 or donate**（免费 + 可选捐赠） | 见下；如果不想接任何付款，改选 **No payments**（纯免费，无捐赠提示） |

**关于 `nba` 标签：不建议加。** 游戏内容确实是 NBA 球员，但 `nba` 标签会让页面
更容易被权利方检索到。描述正文里写 “basketball” 已足够，标签就别再加 `nba`。

**关于定价的两点事实（已查官方文档）：**

- HTML5 游戏在 itch 上**只能收捐赠，不能卖访问权**（想卖访问权要把 Kind 改成
  Downloadable）。所以 “$0 or donate” 是 HTML 版唯一带收款的选项。
- 想收捐赠必须先在账号设置里接付款账户（自己的 PayPal / Stripe 直接收款，或
  itch 代收后提现：据第三方文档，代收有 7 天到账等待、$5 最低提现、提现审核
  至少 7 天，另有一次性 $3 税务身份验证费——以编辑页实际提示为准）。
  itch 的收入分成是开放式的，0–100% 自选，默认 10%，支付手续费另计。
- 什么都不想接：选 **No payments**，玩家点下载直接玩，没有任何付款提示。

---

## (c) 封面图

| 项 | 要求 |
|---|---|
| 比例 | **315:250**（官方 getting-started 指南） |
| 尺寸 | 最小 315×250，**推荐 630×500** |
| 文件大小上限 | 第三方资料称最大 3840×2160、≤3MB，**未经官方文档证实**，以编辑页提示为准 |
| 格式 | PNG 或 JPG（也可 GIF，悬停播放） |

**现在没有可用的封面图。** 现状：

- 仓库里的图标还是 Capacitor 占位图（Capacitor 自家 logo），**绝对不要拿来当封面**。
- 需要新做一张：建议**原创球场/战术板风格插画 + 游戏标题文字**，不要放任何
  可辨认的真实球员面孔——封面是全站浏览时最显眼的一张图，用真人照片会把
  肖像权风险放到最大。
- 封面图还没做，这是发布前必须补的一件活（美术由用户出）。

---

## (d) 截图清单（从已上线的 Pages 站点截取）

站点：https://duzhiok.github.io/courtside-legends/

方法：桌面 Chrome / Edge 打开，窗口 1280×900（或 1920×1080），用系统截图
（macOS `Cmd+Shift+4` / Windows `Win+Shift+S`，或 DevTools 整页截图）。
itch 建议 **3–5 张**，尺寸不限，但建议统一成相近比例。截图里不要出现真实姓名、
私人账号信息——用全新本地账号或默认进度截图。

| # | 画面 | 怎么截 | 说明 |
|---|---|---|---|
| 1 | 主页 | 打开首页，球馆横幅 + 传奇球星照片墙完整入画 | 第一印象，必备 |
| 2 | 比赛中球场 | 进入一场比赛，动态球场 + 战报 + 右侧教练席（战术/换人/对位）同框 | 核心玩法，必备 |
| 3 | 选秀 / 预算轮抽 | 自定义对战入口，轮抽选卡界面 | “抽卡组队” 的直观展示 |
| 4 | Box score / 赛后结算 | 打完一场后的完整 box score（PTS/REB/AST/STL/BLK/TOV/+/-） | 模拟深度的证明 |
| 5 | 穿越生涯 或 联盟经理 | 五年篇章事件界面，或联盟经理的球队评估/经营界面 | 区别于一般卡牌游戏的长线模式 |
| 6（可选） | 手机版面 | 手机浏览器 390×844 打开同一站点，主页或球场界面 | 证明手机能玩；配合 Mobile Friendly 选项 |

不要截：联机对战大厅（itch 托管下联机不可用，截了会误导）、任何含真实
个人信息的界面、未完成的调试界面。

---

## (e) HTML5 上传说明

### 打包：zip 里装什么、不装什么

从仓库根目录打包，**`index.html` 必须在 zip 根目录**（不能包在文件夹里）。
只装运行时文件（和 Capacitor 同步脚本 `scripts/mobile/sync-www.mjs` 同一套）：

```bash
cd courtside-legends
zip -r courtside-legends-itch.zip index.html online.html css js assets
```

| 装 | 不装 |
|---|---|
| `index.html`、`online.html`、`css/`、`js/`、`assets/` | `node_modules/`、`.git/`、`docs/`、`server/`、`tests/`、`scripts/`、`android/`、`ios/`、`mobile/`、`package.json`、`package-lock.json` |

**实测（2026-10-28 当前版本）：运行时共 115 个文件、约 12MB，最大单文件
`js/data/roster.json` 6.4MB。** 全部远低于 itch 限额（见下），打包前重测一次即可。

### itch 官方限额（已查官方文档 https://itch.io/docs/creators/html5）

- ZIP 格式 only（不支持 .rar / .tar.gz / .7z）
- 解压后 ≤ 1,000 个文件
- 解压后总大小 ≤ 500MB
- 单个文件 ≤ 200MB
- 文件名（含路径）≤ 240 字符，大小写敏感，UTF-8 编码

### 本游戏已验证的兼容点（2026-10-28 实查）

- 全部资源引用是**相对路径**，没有以 `/` 开头的绝对路径——itch 把游戏放在
  HTML CDN 的子目录下，绝对路径会断，相对路径没问题。
- 没有 service worker 注册。
- 没有 `http://` 资源加载（`photoCredits.js` 里的 `http://` 字串只是图片署名
  链接的元数据，不是加载的资源）。
- 外部资源（Google Fonts、Wikimedia / B-Ref 头像）均为 HTTPS，符合 itch 要求。

### 联机对战在 itch 上不可用（必须在描述里写清楚，见 (a)）

- itch 只托管静态文件，没有地方跑 `server/online-server.mjs`。
- `online.html` 可以留在 zip 里（主页有入口链接，删了会断链），但在 https
  环境下服务器地址栏默认是空的，玩家没有自己的 `wss://` 服务器就连不上。
- 所以 itch 版 = **完整单机版**，联机对战不包含在内。不要在页面上暗示联机可玩。

### Embed（嵌入）设置建议

| 选项 | 建议值 |
|---|---|
| Launch mode | **Embed in page**，viewport **960×540** |
| Click to Play | **开**（默认开；自动播放时浏览器可能静音） |
| Fullscreen button | **开**（桌面端教练席较宽，玩家可点全屏获得完整布局） |
| Scrollbars | **关**（默认关） |
| Mobile Friendly | **开**（游戏有手机断点适配；移动端 itch 会强制全屏启动，未勾选则显示兼容警告） |

注意：960×540 的嵌入框对桌面教练席来说偏窄，全屏按钮是必备的。
如果预览时觉得嵌入框太挤，改选 **Click to launch in fullscreen**（点“开始”
后全屏，不用填尺寸）。最终以编辑页预览效果为准。

---

## (f) 发布前检查清单（按顺序打勾）

> **第 1 项没决定之前，不要点 Public。**

- [ ] **⛔ 肖像权决定（最重要）：真实 NBA 球员姓名 / 数据 / 照片的公开上架风险，
      用户已明确决定走哪条路**（私下分享 / 接受公开风险 / 改虚构球员）。
      未决定 → 只留在 Draft / Restricted 状态。
- [ ] **B-Ref 头像热链已处理**：`js/data/photo.js` 里 `HOTLINK_HEADSHOTS` 目前是
      `true`。README 明确写了“仅建议本地私人使用，公开发布前应关闭或改为本地化
      下载”。发布用的 zip 必须先把这个开关关掉（头像会回退到本地照片 / 生成
      剪影，游戏照常运行），或者把头像本地化下载到 `assets/`。这是代码改动，
      改完要重跑测试、重打 zip。
- [ ] **封面图已做好**（630×500，原创插画 + 标题，不要用真人面孔、不要用
      Capacitor 占位图标）。
- [ ] **截图已按 (d) 截好 3–5 张**，无个人信息。
- [ ] **zip 已按 (e) 打好**，并重测文件数 / 总大小 / 最大单文件在限额内。
- [ ] **Draft 状态上传后实测一遍**：主页 → 选秀 → 打完一整场 → 刷新后存档还在
      （itch iframe 里的 localStorage / IndexedDB 跨访问是否持久，需实测确认，
      见“未验证”一节）；手机浏览器打开页面，全屏启动正常；控制台无 403
      （路径大小写问题在 itch 上会报 403 而不是 404）。
- [ ] **AI 披露已确认**：游戏美术是否为生成式 AI 内容——目前所知球员照片是
      Wikimedia 真实照片 / B-Ref 热链，剪影头像是程序生成（不是生成式 AI），
      倾向选“无生成式 AI 内容”，但发布前请用户最后确认 `assets/` 里没有 AI 图。
- [ ] **定价已决定**：要捐赠 → “$0 or donate” + 先接好付款账户；纯免费 →
      “No payments”。
- [ ] **可见性流程**：Draft 搭好 → 预览无误 → Restricted（先给朋友测）→
      确认无误且第 1 项已决定 → Public。

---

## (g) 只有用户能做的步骤（按顺序）

1. 注册免费 itch.io 账号（邮箱即可）。
2. Dashboard → Create new project（新建项目）。
3. 填标题 `Courtside Legends`；项目 URL 建议改短为 `courtside-legends`
   （URL 由标题自动生成，太长可手动改）。
4. Classification 选 **Game**；Kind of project 选 **HTML**；
   Release status 选 **In development**。
5. 上传封面图（630×500，见 (c)）。
6. 粘贴 Short description 和 Long description（见 (a)，英文在前、中文段落在后）。
7. 填 Genre（Sports，见 (b) 备注）与 Tags（见 (b) 列表）。
8. Pricing 选 **$0 or donate**（或 **No payments**，见 (b)）；要收捐赠的话先去
   User Settings 接付款账户（PayPal / Stripe，或 itch 代收）。
9. 上传按 (e) 打好的 zip（Uploads → 上传文件，确认它被识别为浏览器内可玩的
   HTML 文件；如果识别不对，检查 zip 根目录是否有 `index.html`）。
10. 按 (e) 设置 Embed 选项：Embed in page 960×540、Click to Play 开、
    Fullscreen button 开、Mobile Friendly 开、Scrollbars 关。
11. Save 为 **Draft**，打开预览页亲自玩一遍（按 (f) 的实测项）。
12. 没问题后先切 **Restricted** 给朋友测一轮；最后在第 1 项决定已做出的前提下
    切 **Public**。
13. （可选）页面发布后，把 itch 链接贴回 README / GitHub Pages 相关位置，
    并注明：itch 版与 Pages 版的存档不互通（各存在各自站点的浏览器存储里）。

---

## 附录：已验证 vs 未验证

**已验证（有来源）：**

- HTML5 zip 要求与限额：itch 官方文档 https://itch.io/docs/creators/html5
  （ZIP only、index.html 入口、≤1,000 文件、≤500MB、单文件 ≤200MB、
  路径 ≤240 字符、大小写敏感；绝对路径会断；外部资源必须 HTTPS；
  移动端强制全屏、未勾 Mobile Friendly 显示警告；Click to Play 默认开）。
- 封面 315:250 比例、最小 315×250、推荐 630×500；截图建议 3–5 张：
  itch 官方 getting-started 指南 https://itch.io/docs/creators/getting-started。
- HTML5 游戏只能收捐赠：itch 官方 HTML5 文档 “Can I take payments” 一节。
- 三种定价（$0 or donate / Paid / No Payment）与捐赠提示文案：
  itch 官方购买说明与第三方教程一致。
- 游戏侧：运行时 115 文件 / 约 12MB / 最大单文件 6.4MB；相对路径；无
  service worker；`HOTLINK_HEADSHOTS = true`（`js/data/photo.js:29`）；
  模式与卡库数字均出自本仓库 README.md。

**未验证（发布前需在编辑页或实测中确认）：**

- Genre 下拉菜单的实际选项（需登录账号才能看到编辑页）。
- Tags 的实际数量上限（第三方称约 10 个）。
- 封面文件大小上限（第三方称 ≤3MB、最大 3840×2160，未经官方证实）。
- 新账号上传大小是否有额外未公开的上限（官方文档提到新账号有限制但未给数字；
  500MB 解压限额是已公开的那个，本游戏 12MB 远低于它，不构成问题）。
- itch iframe 里 localStorage / IndexedDB 存档跨访问是否持久（预期可用，
  但必须在 Draft 上传后实测）。
- Embed 宽度超过页面栏宽时的实际表现（建议 960×540 + 全屏按钮，预览时确认）。
- AI 披露字段的具体选项文案（以编辑页为准）。
