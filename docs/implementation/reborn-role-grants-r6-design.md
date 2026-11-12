# R6 设计：合同权限授予（ADR-006 §3.4，Q3）

- **状态**：已实现（本轮；ADR-006 Q3 原则批准——稳定权限 ID、`authority` 与权限授予分开，基础角色权限之后再做；R1–R5 已落地）
- **目标**：把现在只显示的合同 `privileges` 文案变成真正的权限授予——签下带授予的合同，就获得对应的操作能力；合同结束，授予随之失效。只做授予机制，不做预算、不做双职代价系统。
- **不在本片**：`authority` 数值仍只影响信任/谈判，不做能力判断；「额外教练预算」「专属训练设施预算」两项文案指向不存在的预算字段（审计 R5 死承诺），本片不给它们授予、也不改文案——是否删文案或做预算字段，单独报用户拍板；不追溯旧合同（旧存档无授予记录，行为不变）。

## 1. 数据形状（ADR-006 §0 Q3，授予 ID 即矩阵能力 ID）

```js
// contractOffers.js：每个特权一项授予记录（id 稳定、机器可读；label 只显示）
{ id: "personnel_full_control", label: "完全人事决定权", grants: ["trade", "signFreeAgent", "release", "draft"] }
```

- 授予 ID 就是 `CAREER_CAPABILITIES` 的能力 ID（`trade` / `draft` / `signFreeAgent` …），不引入第二套 ID——守卫直接消费，不做翻译层。
- 存放：`leagueCareer.grants: string[]`（当前聘用合同授予的能力 ID 列表；接受 offer 时写入，随新聘用/新 stint 重置）。不放 `root.identity`——授予属于“这份工作”，不是“这个人”；`root.identity` 只回答身份。

## 2. 文案 → 授予映射（审计 §3 表，只映射有真实消费者的能力）

| 现有文案 | 授予 | 说明 |
|---|---|---|
| 完全人事决定权 | `trade`、`signFreeAgent`、`release`、`draft` | 教练签下后可拍板交易/签约/裁人/选秀；GM 本来就有，签了无变化 |
| 季中补强额度 | `trade`、`signFreeAgent` | 只给补强两项，不给选秀/裁人 |
| 自定义训练计划 | `setTrainingFocus` | 教练本来就有；只对 GM 有意义（GM 获得训练方向设定权） |
| 发展联盟优先权 | `draft` | 选秀拍板权（发展联盟字段本身不存在，只授能力） |
| 顶薪续约优先权 | （无） | 球队工资操作，无对应能力 ID，不授 |
| 额外教练预算 / 专属训练设施预算 | （无） | 无预算字段，死承诺；本片不授，文案去留报用户 |

## 3. 消费点（守卫读授予，按钮只读守卫）

- `careerGuards.js` 新增 `effectivePermissions(career, root)` = `permissionsFor(careerRole(career, root))` ∪ `career.grants`（仅限 `CAREER_CAPABILITIES` 内的 ID，未知 ID 忽略不抛错——旧/手改数据不炸存档）。
- `canDo` / `requireCapability` 改读 `effectivePermissions`，其余不动：隐藏按钮仍不等于权限控制，操作入口照样拒绝；CPU 路径不受影响（守卫只作用于用户发起）。
- 接受 offer 时：`acceptInterviewOffer` / `acceptCareerContract` 把该 offer 的 `privileges` 映射成 grants 写进 `career.grants`；`setIdentity` 不动（身份与授予分开）。

## 4. 存档校验（与 R1 同一做法）

- `validateLeagueCareer`：`career.grants` 存在时须为数组，且每项在 `CAREER_CAPABILITIES` 内；非法值拒绝（同 `career.role`）。
- 旧存档无 `grants` 字段：不校验、不迁移、不补写，行为与今天一致。

## 5. 验收

- 教练签「完全人事决定权」后，走真实入口执行一笔交易成功；没签时同一入口仍抛 `CareerPermissionError`（`trade`）。
- GM 签同款合同无变化（已有全部能力）；GM_COACH 无变化。
- 换工作（新 stint / 新 offer）后 grants 按新合同重算，旧授予不残留。
- 旧存档读档后行为不变；`authority` 数值仍不决定任何放行。
- 测试：授予映射单测（每条文案只授表内能力）、接受 offer 写 grants、新 stint 重置、守卫消费（canDo 与 requireCapability 一致）、非法 grants 拒绝；focused + 全套。

## 6. 回滚

- 守卫改回只读角色权限，`career.grants` 变成惰性数据（校验仍接受，行为上忽略）；offer 文案恢复纯显示。单提交可 revert。
