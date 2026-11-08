# ADR-010 · T1 实现设计（一页）— My Team 阵容：收藏 → 可开赛的阵容

状态：**T1 已实现（R178）**。T1 不写任何存档、不创建赛季、不动 GameSim、不动排位/联机/经济。T2–T4 不自动启动。

## 1. T1 交付什么
一个**纯函数模块** + 一个**阵容页**：玩家从自己的收藏里挑出 8–12 名球员、5 名首发、教练与战术，得到一份**经过校验、可交给 T2 开赛的阵容草稿**。T1 自己不开赛。

| 产出 | 位置 | 说明 |
|---|---|---|
| `validateMyTeamLineup(account, draft)` | 新 `js/myteam/lineup.js` | 纯函数；返回 `{ ok, errors[], lineup }` |
| `autoLineup(account)` | 同上 | 一键推荐：按 OVR 取人 + `recommendPlayPos` 排首发；**不写任何东西** |
| 阵容草稿存取 | 账号上**可选新增字段** `myTeamLineup` | 见 §4；缺失 = 用 `autoLineup` |
| 阵容页 UI | 复用 `players` 首页标签（"我的球员"）的入口，新增"我的阵容"页 | 不新增首页标签（ADR-008 N-1 另管） |

## 2. 收藏 → 阵容映射（已读代码核实）
- **来源**：`resolvePlayers(account.playerIds, account)` → 合成后的卡（含 `cardMods` 的升星/技能/成色 roll）。T1 只读，不改。
- **一人一张**：`uniqueByPerson`（按 `bref`）。同一球员多张赛季卡时，草稿里必须**明确选一张**；校验拒绝同 `bref` 重复。
- **人数**：`SEASON_MIN_ROSTER = 8`、`SEASON_MAX_ROSTER = 15`（`seasonMarket.js`）。T1 的阵容页限制 **8–12**（与 `accountToTeam` 的 12 人上限一致，避免与排位口径分叉）；上限提到 15 另议。
- **首发**：恰好 5 人，必须在名单内；位置冲突用现有 `resolveStarterPositionCollisions` / `nextEmptyPlayPos` 给出建议，**校验只拦"不可开赛"的错误，位置不理想只给警告**。
- **教练/战术**：沿用账号现有 `coachId`、`tacticId`（缺省 `COACHES[0]` / `balanced`）。**不新增第二套教练/战术字段**，所以 My Team 阵容与排位共用同一个教练/战术设置——这是"一套收藏，多个入口"的最小体现。
- **球员个人设置**：`playerPrefs` 现有机制，T1 只读。

## 3. 校验规则（`validateMyTeamLineup`）
错误（阻止开赛）：未登录账号（游客）；包含不在 `account.playerIds` 里的卡；同 `bref` 重复；人数 <8 或 >12；首发 ≠ 5 或不在名单内；教练 ID 不在账号收藏里（非默认教练）。
警告（不阻止）：首发位置明显重叠（如 3 个 C）；无可用控卫；名单里有受伤/未结算成色的卡。
所有错误/警告带**中英文**文案 key（复用 `L()`），UI 不再拼接字符串。

## 4. 账号隔离与向后兼容
- **隔离**：函数只接收**当前激活账号**的 `account` 对象；不读 localStorage 其它账号；不访问联机服务器；不读写 `gold/cardMods/playerIds`。
- **唯一的账号格式改动**：可选新增 `account.myTeamLineup = { rosterIds[], starterIds[], savedAt }`。旧账号没有此字段 = 合法（自动阵容）；`saveAccount`/迁移**不要求**它存在；读取时对非法值（非数组/不在收藏里）**静默回退到自动阵容并给出提示**，不报错、不删旧数据。
- **不影响**：排位（`accountToTeam` 保持原样）、联机名册/市场、金币、抽卡、`cardMods`、Franchise/Reborn/单赛季存档、`saveOwnership`。
- **游客**：看到"创建/登录账号后才能组建 My Team 球队"的引导，不能开赛季（沿用 ADR-008a 的"游客可玩、资产需账号"口径）。

## 5. 测试（T1 验收）
单测（`tests/myTeamLineup.test.js`）：合法阵容通过；同 `bref` 重复被拒；非收藏卡被拒；7/13 人被拒；首发 4/6 人被拒；首发不在名单被拒；游客被拒；位置重叠只警告；旧账号无 `myTeamLineup` 时 `autoLineup` 可用；非法 `myTeamLineup` 回退自动；**函数前后 `account` JSON 字节相同**（只读证明）；`accountToTeam` 输出与改动前一致（排位不变）。变异：删掉重复检查/删掉"必须在收藏里"检查，对应测试必须变红。
浏览器 QA：桌面 + 390px；中英文；选人/换首发/超限提示；游客引导；无溢出、无 page error；刷新后草稿保持。

## 6. 风险与依赖
| 项 | 说明 | 缓解 |
|---|---|---|
| D1 阵容页位置 | ADR-008 的 My Team 空间还没落地（`homeTab` 仍是 3 个值 + world） | T1 先挂在现有"我的球员"标签下，N-2 再迁移，不改 `modeCatalog` 契约 |
| D2 12 vs 15 人 | 赛季市场允许 15，排位 12 | T1 用 12；T2 开赛后市场仍遵循 8–15 |
| D3 教练/战术共用账号字段 | 改了 My Team 的战术会影响排位默认战术 | 设计上接受；若产品想分开，T1 后再加 `myTeamLineup.tacticId`（可选字段，向后兼容） |
| D4 快照字段 | 完整比赛属性快照属于 T2；T1 只产出 `ownedRef` 列表 | T1 的 `lineup` 输出刻意不含快照，避免提前固化格式 |
| D5 存档槽 | `cls_myteam_season_v1` 要接入 `saveOwnership` 的槽位表（`SLOTS`/`RESUMABLE`）并补变异测试 | 属于 T2 |
| 精确依赖 | `account.js`(`resolvePlayers/uniqueByPerson/accountToTeam`)、`playerPrefs.js`、`gameplan.js`(`recommendPlayPos/resolveStarterPositionCollisions/nextEmptyPlayPos`)、`seasonMarket.js`(`SEASON_*_ROSTER`)、`coaches.js` | 全部只读调用，无新依赖 |

## 7. 仍待你确认（不阻塞 T1 开工）
- T1 阵容页上限 12 人是否可接受（vs 15）。
- 教练/战术是否与排位共用（推荐共用，D3）。
- T1 是否单独提交，还是等你审完这页设计再开工（我默认：等你批准这一页）。
