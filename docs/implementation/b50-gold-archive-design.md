# B50 一页设计：金币晋级赛淘汰后变 archive 记录

状态：PROPOSED，待用户批；批了再动手改代码。
来源：用户决定 2026-11-07（BACKLOG B50；板上 2026-11-07 登记）。
前提：仓库里没有“金笔”二字——对应的是金币晋级赛 / 32→1 淘汰赛生涯
（`js/engine/careerBracket.js`，`state.career.kind === "career"`）。若指的不是这个，
请用户纠正，本设计作废。

## 现状（已核代码）

- 淘汰结算（`js/app.js` 约 11753–11782）：`result.eliminated` 时标题为“总决赛出局 /
  两败出局 / 淘汰出局”，按钮“回主页”的 `onclick` 是 `clearSave()` +
  `refreshSaveHomeBar()` + `show("home")`——记录直接消失。`autosaveCareer()` 在
  该分支 return 前已跑过，点按钮时 `c`（live career 对象）还在内存里。
- 夺冠结算（同文件约 11753 前一段）：“捧杯回主页”同样 `clearSave()`，冠军
  记录也一样消失。
- 主页现有两条记录通道，都不适合直接塞 archive：
  - `#save-home-bar`（`refreshSaveHomeBar`，app.js:1250）：单槽位“继续”条，
    有 root 联赛生涯时还会被隐藏——一个列表塞不进单条，且它只服务“进行中”。
  - My World → My Games（`js/ui/myWorldView.js` 的 `gamesHtml`）：已有记录列表
    （career / session / season / myteam 行，带继续 / 认领 / 删除），按账号
    过滤（R174 归属规则），是放“只看不续”记录的现成位置。

## 决定：存哪

- **放 My World → My Games，新开一个“已结束记录”区，排在进行中记录之下。**
  不动 `#save-home-bar`（它继续只管进行中的存档）。
- **存储：账号对象上的新字段 `account.archive`（`cls_accounts_v1` 里），访客用
  独立 localStorage key（仿 `accountLevel.js` 里 `account.axp` + `GUEST_AXP_KEY`
  的成对写法）。**理由：记录跟账号走（R174 归属规则天然适用）；不动 root v3
  （`cls_root_v3` 的迁移是 M4 门控的活，B50 不该等 M4）；不塞进 `cls_savegame_v1`
 （那就是被清掉的那个槽）。
- 与 ADR-007 的 `LegacyArchive`（M4，账号层 + 首页勋章墙）是同一家族不同辈分：
  B50 是金币晋级赛的轻量摘要先行，字段命名向它靠（`sourceId` / `endedReason`），
  M4 到来时再决定合并还是并存，不提前写迁移。

## 存什么字段（只存摘要，不存阵容）

每条约 300 字节，配额无压力：

| 字段 | 来源 |
| --- | --- |
| `runId` | 生涯开始时生成（见下），去重键 |
| `accountId` / `endedAt` | 写记录时取 |
| `kind` | `c.kind`（"career"）；`fieldSource`（historical / random）、`challengeTier`（gold / playoff15 / champ7） |
| `teamName` | `c.team.name` |
| `outcome` | `eliminated` / `champion`（见“待用户定”①） |
| `finalRound` | `careerStageLabel(c.stageSize)` + `c.round`，如“三十二强 → 八强” |
| `wins` / `losses` | `c.bracketLog` 汇总（胜 / 负场）；`c.losses.you` |
| `gold` | 结束时 `c.gold` |
| `finalsScore` | 仅总决赛：`c.series` 的胜负比分 |
| `eliminatedBy` | 仅淘汰：最后一场对手名（`c.series?.opp` 或末轮对手） |

不存：阵容、球员、bracketLog 全文、比赛回放——“可回看其他对决”那句文案说的是
结算屏当场回看，存档清掉后回看即止；archive 是摘要，不是复活。

## 写记录的时机与幂等

- 点“回主页”/“捧杯回主页”时，**先写 archive，再 `clearSave()`**（同一
  `onclick` 里调换顺序，两行代码）。写失败（配额等）也不拦回主页，只记
  console.error 并照常清档回家——回主页永远不能被 archive 卡住。
- 幂等：`runId` 在生涯创建时生成（`startCareer`，app.js 约 4700，
  `state.career = { kind: "career", … }` 处加 `runId: "run-" + Date.now() + "-" +
  随机 4 位`）；写记录前按 `(accountId, runId)` 查已有记录，有则跳过。
  本次之前已开局、没有 `runId` 的进行中生涯：结算渲染时若缺失就地补一个并随
  `autosaveCareer()` 存下（淘汰分支 return 前已调 `autosaveCareer()`，顺序够用）。
- 上限：每账号 **20 条**，满了丢最旧一条，并在 My Games 区文案写明“保留最近 20 条”。
  上限是摘要的丢弃，不是存档的删除——写进文案就不算静默删。

## 淘汰结算文案（双语）

- 结算屏摘要下加一行（不改原有标题/比分行）：
  - zh：“这次征程会存进 我的世界 → 我的游戏记录，仅供查看，不能继续。”
  - en: "This run will be kept in My World → My Games as a view-only record."
- My Games 已结束行：标题 `金币晋级赛 · <队名>`，副行 `<止步轮次> · <胜>-<负> ·
  ¤<金币> · <月/日>`，角标 `已结束 · 仅查看` / `Archived · view only`；**没有“继续”
  按钮**，只有“删除”（走现有 `delete-*` 的确认删除流程）。
- 旧存档：**不迁移**。已经消失的记录找不回来；在 B50 上线前已开局、尚未打完的
  生涯，结算时按新规则正常存档（`runId` 就地补，见上）。

## 待用户定（批设计时一起定）

1. **冠军同路吗？**推荐：一起存（`outcome: "champion"`），同一段代码、
   同一张表——冠军记录比淘汰记录更值得留。用户原话只说了淘汰；若只存淘汰，
   夺冠仍按今天这样清档。
2. **放 My Games 是否就是你说的“主页记录”？**推荐是（见“存哪”的理由）。
   若你指的是首页那条 `#save-home-bar`，那要另做一条“最近结束”单行，设计重写。
3. 上限 20 条够吗？不够就报个数（每条约 300 字节，100 条也才 30KB）。

## 实现清单（批后做，约半天）

- 新 `js/data/careerArchive.js`：纯函数 `buildArchiveRecord(c)`、
  `appendArchive(accountId, record)`（去重 + 上限）、访客 key 读写；不碰 sim.js。
- `js/app.js`：`startCareer` 加 `runId`；淘汰与夺冠两个 `onclick` 里先写 archive
  再 `clearSave()`；淘汰结算加一行文案。
- `js/ui/myWorldView.js`：`gamesHtml` 加已结束区；`myWorld` 的数据组装处把
  `account.archive` 传进来；删除接现有 `delete-*` 流程。
- 词条：上述两处文案的中英双语。
- 测试：新 `tests/careerArchive.test.js`（建记录字段、去重、上限、访客隔离）；
  结算接线单测（archive 写在 `clearSave()` 之前、写失败不拦回主页）。
  全量只在动共享代码时跑（本设计不动引擎，按 smoke + 相关单测即可）。
- 浏览器 QA（Mac）：My Games 已结束区渲染、删除、20 条上限文案。

## 不做

- 不碰 `saveRoot.js` / `savegame.js` / `sim.js` / `careerBracket.js`（只读 `c`）。
- 不做 bracket 回放、不做 LegacyArchive / 勋章墙（M4）、不做联机端 archive、
  不做 archive 的认领/迁移（访客建账号后，访客 archive 留在访客 key 里，另议）。
