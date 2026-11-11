# M4-D：My World 视觉整合 — 一页设计

状态：PROPOSED（实现 D1 + D2；D3 只定设计，待后续轮次）
作者：Muse（Coding Agent），2026-11-11
依据：用户 2026-11-11 裁决 — M4-A/B/C 之后做 M4-D，“家乡身份与 Avatar、称号、荣誉连接，不新增孤立数据卡”。
前置：M4-A（a7ae970）、M4-B（16bda0f，本地 main 已变基到 c53c872 上）、M4-C（b5c1ede）均已在 main 上。

## 1. 问题

M4-B 落地后，My World 里家乡是一张孤立卡片（`hometownHtml` 以 `${hometown}` 插在
`myWorldHtml` 的 grid 与 home scene 之间）：英雄区已显示出生地/成长地/代表城市，
但三处地点与下方家乡卡没有任何连接；家乡挑战战绩只活在卡片内部，荣誉墙（Legacy）
看不到；Legacy Museum 的生涯条目不显示创建时快照的地点身份（M4-C 已存，但无人展示）。

## 2. 连接（只做这三条，不新增数据卡、不新增字段）

### D1 — 英雄区“代表”地点 → 家乡卡锚点（本轮做）
- `identityCardHtml` 里 `places.representedCity` 一项渲染为同页锚点
  `<a href="#mw-hometown">代表 X</a>`；出生地/成长地保持纯文本（它们没有对应卡片可跳）。
- `hometownView.js` 两个返回分支的 `<section>` 都加 `id="mw-hometown"`（空态也加，
  否则未填地点时锚点无目标）。
- 依据：app.js / myWorldScreen.js 没有 `location.hash` 路由，浏览器原生滚动，无冲突。
- 空态：未填代表城市时不渲染锚点，不造假链接。

### D2 — 传奇荣誉墙列一行家乡挑战战绩（本轮做）
- `legacyFromAccount(account)` 派生字段新增 `hometownChallenge`（只读派生，
  来自已有的 `readHometownState(account).challenge`；`played === 0` 时为 null，
  不渲染任何行）。
- `legacyHtml` 在奖杯行之后、建筑师称号之前加一行：
  `🏀 家乡挑战 · 代表<最近城市> X 场 · Y 胜 Z 负`（中英双语；只在打过时出现）。
- 诚实边界：明确标注“家乡挑战”，永远不计入生涯冠军/总冠军数，不与 `trophies`
  混在同一 `<ul>`；账号级记录，不是某段生涯的战绩。

### D3 — Legacy Museum 生涯条目显 M4-C 快照代表城市（本轮只定设计，不做）
- 博物馆的生涯条目（`museumCareerLine`）在有快照时加 `创建时代表：X`（取
  `careerIdentitySnapshot` 的 `representedCity`；缺失即省略，不编造）。
- 为什么本轮不做：博物馆的生涯数据走 `legacyMuseumFor` /
  `legacySummaryFor`，快照字段尚未接进这条管线；改动涉及 Luna 的博物馆模块，
  需先在 Board 上与 Luna 对齐字段落点，再做。

## 3. 明确不做（无诚实连接，就不硬连）
- Avatar 展示 ↔ 童年偶像：展示台是玩家自己的形象，偶像是另一位真实球员，
  没有诚实的可视连接，不做。
- 建筑师称号 ↔ 家乡：称号按教练/经理生涯完成度解锁，与地点无关，不做。
- 不新增任何数据卡、字段、存档版本；不碰 `sim.js`、`roster.json`、`profile.js`
  字段定义、职业创建入口、M4-A 表单。

## 4. 文件清单（D1 + D2）
- `js/ui/myWorldView.js`：D1 锚点（`identityCardHtml`）+ D2 派生字段
  （`legacyFromAccount`）与荣誉墙行（`legacyHtml`）。
- `js/ui/hometownView.js`：两个 `<section>` 加 `id="mw-hometown"`。
- `js/data/hometown/hometownState.js`：只读复用已有 `readHometownState`，不改。
- `tests/m4dMyWorldIntegration.test.js`（新增）：锚点只在有代表城市时出现且
  指向存在的 section id；空态无锚点；荣誉墙行只在打过挑战时出现、文案标明
  家乡挑战、且不改变奖杯计数；`legacyFromAccount` 的派生字段在无记录时为 null。
- `scripts/qa/m4d-integration.mjs`（新增，node 版 QA）：与上面测试同断言的
  轻量复核。

## 5. 验收
- D1/D2 测试 + 全套回归（9 项 online* ws 环境失败除外）；`npm test` 计数按
  既有格式报告。
- 视觉验收：My World 桌面 + 手机截图待 Mac 跑（VM 无浏览器），本轮不宣布
  视觉通过；状态记为 Visual QA Pending。
- 推送：本机 VM 仍无 GitHub 推送凭证，改动先提交到本地 main，推送待有权限的环境。
