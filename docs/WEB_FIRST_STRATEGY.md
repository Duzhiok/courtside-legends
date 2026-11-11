# Courtside Legends — Web-First Development Strategy

> 产品负责人定：**Web First · Mobile Compatible · Native Later**。
> 这是开发优先级的调整，不是放弃手机端。Pre-Launch / Zero-User 阶段，开发速度和产品体验优先于多平台发布准备。
> 与 `docs/DEVELOPMENT_PHILOSOPHY.md`（Feature-First / Speed-First）一致。

## 1. Platform scope

| | 范围 |
|---|---|
| **主目标** | Desktop Web |
| **兼容目标** | Mobile Web：响应式布局、触屏操作、角色/卡牌展示、基础可用性 |
| **继续** | 共享游戏逻辑、Three.js 与 SVG 渲染、现有账号/存档/经济/收藏系统 |
| **暂停** | 常规 Android/iOS 构建、Capacitor 专项增强、原生专有功能、应用商店准备、原生通知/支付、平台性能调优、每次提交后的原生端到端测试 |

保留现有 Capacitor 工程与配置（`capacitor.config.json`、`scripts/mobile/`、`docs/MOBILE_APPS.md`）。不要删除移动端代码，也不要有意破坏原生兼容性。

## 2. 开发重点

Player Reborn、职业身份、My Team Clubhouse、Stylized/Bobblehead 角色、换装与皮肤、球员卡收藏、My Home、玩法与成长。优先可玩性和视觉质量。大致资源方向：80% 核心 Web 玩法与美术，20% 维持移动浏览器体验（方向，不是工时硬指标）。

## 3. 测试策略：按风险分级，不跑全矩阵

原则：**改动会影响哪个平台，就验证哪个平台。**

| 改动类型 | 每次开发验证 | 集成/阶段性验证 |
|---|---|---|
| GameSim / DuelSim | 聚焦单测 + 固定种子对照 | 相关模式回归 |
| 普通 UI / CSS | 桌面浏览器 QA | 相关手机视口冒烟 |
| My World / Avatar | 桌面 WebGL + 实际截图 | 手机浏览器渲染 |
| 触屏控制 / 响应式布局 | 手机视口直接验证 | 桌面回归 |
| 存档 / 账号 / 金币 / 经济 | 数据契约与聚焦测试（持久化、归属、交易） | 跨账号、刷新恢复流程 |
| Capacitor 原生文件 | 暂停常规开发 | 恢复 Native 阶段再验证 |

视口：
- 桌面主视口 **1440 × 900**。
- 手机主视口 **390 × 844**（冒烟）。
- 360 / 768 / 1280 等留给布局专项或集成回归，不必每次提交都跑。

## 4. Agent 协作

- 每个 Agent 只负责自己工作流的**聚焦验证**。
- 集成 Agent 在多个功能合并后统一跑合并树的全量测试和关键浏览器流程。
- 不要在每个并行 worktree 里重复全量浏览器 QA。
- 涉及共享数据契约、存档或经济系统的改动，合并前仍须完成相关回归。
- 保持现有 worktree 所有权与合并协调流程。

## 5. Native Mobile 恢复条件（按里程碑，不按日期）

全部满足再恢复：
- Player Reborn 与四身份职业系统可完整游玩。
- My Team、抽卡、金币商城、My World 核心循环稳定。
- Stylized / Bobblehead、换装、卡牌美术达到满意质量。
- Desktop Web 与 Mobile Web 的主要流程都能完成。
- 存档、账号、数据持久化方案明确。
- 准备邀请第一批真实玩家试玩，或开始准备商店发布。

恢复时顺序：先做一次 Capacitor 集成验证 → 真机 Android/iOS → 原生性能与存储行为 → 商店要求（球员名字/数据/照片授权见 `docs/MOBILE_APPS.md`）。
