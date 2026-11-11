# ADR-004 详细迁移契约：存档版本升级 `schemaVersion` 3→4

**状态：✅ APPROVED 2026-11-10（用户裁决，见 §5）。** M4 开工条件已满足。ADR-004 本体 2026-11-04 APPROVED IN PRINCIPLE；本文只定契约，不改代码。审计日期：2026-11-10；以下行号均为当日核实的现状。注：用户裁决基于 §5 四个问题作出，未逐条审查本文所有技术条款；实现中如发现与已批裁决有实质冲突，停下来报用户，不得自行改裁决。

## 1. 审计结论（现状，全部已核实）

| 事实 | 证据 |
|---|---|
| 根存档是 v3，别无版本 | `js/data/saveRoot.js:10-11`：`ROOT_SAVE_KEY = "cls_root_v3"`，`ROOT_SAVE_VERSION = 3`；临时键 `cls_root_v3_tmp`（:13） |
| 无逐版本迁移函数 | `validateRoot`（:393-408）对 `schemaVersion > 3` 抛 "newer game version"，`< 3` 抛 "unsupported older game version"；`migrateLegacySaves`（:693-731）只搬 v1 legacy 键 `cls_season_v1`，且 `cls_savegame_v1` 按 B13 教训永不碰 |
| 写路径已是"校验后提交" | `writeRootSave`（:541-581）：tmp 写 + 回读校验 + 换正式键；配额失败时直接写回退；失败抛定型 `StorageWriteError`（:533-539）；`writeRootSaveFreeingOrphans`（:583-596）只在 `StorageWriteError` 时清孤儿 legacy 键并重试一次 |
| 导入/导出自带信封版本 | `exportRootSave` / `importRootSave`（:651-691）：信封 `{format, schemaVersion, exportedAt, root}`；导入拒读 `< 3` 与 `> 3` 的信封 |
| 可选字段规则已成例 | 新字段只在出现时校验，缺失的老存档照常读：`root.coach`（:339 起，`ensureCoachProfile` 回填）、`story.seasonGoal/origin/poachOffer/prophecy`、`story.executive`、`root.reborn`（:290-306）、`root.careerInbox` |
| 身份不在根存档里 | 账号身份（名 / 家乡自由文本 ≤40 字 / 简介）在 `account.profile`，游客在 `cls_guest_profile_v1`（`js/data/profile.js`）；捏脸在 `account.avatar`，游客在 `cls_guest_avatar_v1`（`js/data/avatarLook.js`，纯白名单预设值）；ADR-009（PROPOSED）要求结构化地点另开字段，旧自由文本只作展示名保留、不迁移、不覆盖 |
| 无存储预算实测 | 只有配额失败处理与孤儿清理；没有任何"当前存档多大、还剩多少"的度量 |

## 2. 契约

**D0 — v4 只做加法。** v4 的全部新增字段都是可选字段；v4 的 `validateRoot` 必须接受 v3 形态的根（缺失 v4 字段即合法，与 `root.coach` 的规则相同）。于是"永不拒读合法 v3 存档"在迁移跑起来之前就已经成立——迁移本身只是盖版本戳 + 填缺省值，不是改形。

**D1 — 身份字段落在账号，不落在根存档（✅ 已批，用户 2026-11-10）。** 字段定名 `account.identityPlaces = { birthplace, grewUpIn, representedCity }`（用户定名；ADR-009 草稿曾用 `birth` / `raised[]` / `represented`，以此处为准）+ 隐私开关以新可选字段进 `account.profile`，读时经 `sanitizeProfile` 式清洗惰性迁移；`root.profile` 不扩展。旧家乡自由文本只作展示名保留、不迁移、不覆盖。
理由：身份是账号维度的（一个账号可有多个生涯；生涯里可以是 1996 年的巴西新秀，账号身份不变——
`profile.js` 文件头已写明这条分离线；游客根本没有根存档也有身份）。
**职业快照（用户 2026-11-10 架构边界）：** Account Identity 是玩家长期身份；职业生涯创建时可保存一份身份地点快照（Career Identity Snapshot），例如 Reborn 时间线选择从芝加哥成长；快照永不反写账号资料；Hometown Legends 按当前玩法读对应来源（账号身份或生涯快照）。

**D2 — 迁移链。** 新增纯函数 `migrateV3ToV4(root)`（只做 `schemaVersion: 4` + 填 v4 缺省值，
返回新对象，不动入参）与分发器 `migrateRoot(root)`（按 `schemaVersion` 分发；未知未来版本仍拒读）。
v3→v4 的迁移步骤，缺一不可：① 读 v3 根并按 v3 校验；② 原字节完整写入备份键
`cls_root_v3_backup`；③ 内存里跑纯迁移并按 v4 校验；④ 走现有 tmp 写 + 回读校验 + 换键路径提交；
⑤ 回读并按 v4 校验；⑥ **保留备份**，直到下一次成功且通过基本完整性检查的保存后才清理（用户 2026-11-10 Q3 裁决：保留至下一次成功保存；“成功保存”指写入成功 + 回读 + 基本完整性检查通过，仅调用保存函数不算）。③ 之前任何失败：原存档一字节不动。④/⑤ 失败：
从备份键原样恢复 v3 字节、按 v3 重校验、向用户报错（复用现有存档失败对话框），**绝不删原存档**；保留原始存档并允许重试，不得出现部分写入后无法恢复的状态。
迁移是幂等的：对 v4 根重跑是空操作；对一次失败过的 v3 根重跑先从备份恢复再重试。

**D3 — 配额：迁移不用 `writeRootSave` 的直接写回退。** 迁移期间瞬时需要约 2 倍根存档
（备份 + tmp + 新根）。备份写本身配额失败 → 在动任何东西之前中止，原存档完好，报"存储空间不足"。
直接写回退（:562-568）会绕过备份校验覆盖唯一的好副本，迁移路径禁用它。备份在迁移后继续占用一个槽，直到下一次成功且已验证的保存后清理（Q3 裁决）；实现前度量须计入该保留期占用。
实现前必须先跑存储预算度量（见 §3）：空根 / 中期生涯 / 晚期生涯（20 季历史、
每季交易 ≤20 条、`liveGame.feed` 截断 24 条、`challengeArchive` 上限 20 条）的真实字节数，
对照单源约 5 MB 的 localStorage 预算与账号键、游客键、自动存档键的占用，定出"多大就拒绝迁移"的线。

**D4 — 可逆（ROADMAP M4 要求"3→4 必须可逆"），两层意思。**
(a) 过程可逆：失败即恢复 v3 原字节（D2）。(b) 数据可逆：**本阶段暂不支持**（用户 2026-11-10 Q4 裁决：当前没有用户，不值得维护丢失身份字段的双向迁移逻辑）——`downgradeV4ToV3(root)` 与 v4→v3 降级导出均不实现；本阶段可逆性只取 (a) 过程可逆。v4 构建导入 v3 信封时，内存里跑同一条迁移再校验。

**D5 — 触发时机：惰性迁移，不扫全库。** 首次读到 v3 根时迁移（读路径内的钩子，
`migrateLegacySaves` 的同一位置），不开机全量扫、不改账号与游客键、不动 `sim.js`、不新增随机数。

## 3. 实现清单（契约批准后才开工）

1. 度量脚本 `scripts/measure/save-size-budget.mjs`：三档真实形态根存档的字节数 + 各键占用 + 迁移阈值。
2. `js/data/saveMigration.js`：`migrateV3ToV4` / `migrateRoot`（纯函数，
   与 `saveRoot.js` 的写路径分离，写路径只复用现有 tmp 提交；`downgradeV4ToV3` 本阶段不实现，见 D4(b)）。
3. 备份键 `cls_root_v3_backup` 的写 / 验 / 恢复 / 删（删只发生在下一次成功且已验证的保存之后，见 D2⑥）；迁移路径禁用直接写回退。
4. `ROOT_SAVE_VERSION = 4`；`validateRoot` 按 v4 验收（v3 形态仍合法）；导入/导出信封版本升 4。
5. 测试 `tests/saveMigration.test.js` + 夹具 `tests/fixtures/`：真实 v3 根快照往返（除 `schemaVersion`
   外逐字节一致）；缺字段根；损坏 JSON；损坏备份（走恢复）；重复迁移幂等；配额满时中止且原字节不变；
   备份保留至下一次已验证保存后才清理，下一次保存失败时备份仍在、可重试；v5 仍拒读。旧存档夹具回归 + 迁移失败不破坏原存档的保护测试（ROADMAP M4 验收）。

## 4. 非目标

身份 UI（M4 下一片，契约批了才做）；捏脸 UI；碎片新用途；`seasonEpiphany` 转换；
B23/B27 的 `sim.js` 改动；账号键的版本化；任何"家乡加成"数值（ROADMAP 已定：家乡只影响叙事文案）。

## 5. 用户裁决（2026-11-10，已批）

1. **批准本契约作为 M4 开门条件？——✅ 批准。** M4 立即开工。
2. **D1：身份地点放账号还是放根存档？——账号。** 出生地、成长城市、代表城市属于玩家长期身份，不应随单个职业存档消失。字段定名 `account.identityPlaces = { birthplace, grewUpIn, representedCity }`；职业生涯创建时可存一份快照，永不反写账号。
3. **备份保留：校验通过即删还是保留一个备份槽直到下次成功保存？——保留至下一次成功保存。** 比验证完立即删除更容易恢复，同时只需一个临时备份槽；“成功保存”须写入成功 + 回读 + 基本完整性检查通过，仅调用保存函数不算。
4. **降级导出：允许把 v4 根导出为 v3（丢身份地点）吗？——暂不支持。** 当前没有用户，不值得维护丢失身份字段的双向迁移逻辑。
