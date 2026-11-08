# Courtside Legends — Development Philosophy

> 产品负责人 2026-11-07 定：Pre-Launch / Zero-User 阶段，首要目标是快速把游戏的核心特色做出来，而不是提前按照成熟商业产品的标准做工程治理。**Feature-First、Speed-First、Playable-First。**

## 原则（中文）

- 功能优先于完美架构：先做出可玩的功能，再根据实际需要重构。
- 大胆尝试：3D 捏脸、球员穿越、家园、跨时代传奇、社交、四分线等创意，优先考虑如何快速实现，而不是先讨论为什么不能做。
- 减少审批关卡：已经确定的产品方向，不再要求 Agent 每个小步骤都写 ADR、等批准。
- 减少过度测试：开发阶段优先 Smoke Test 和核心功能验证，不为每次小改动运行几千条测试。
- 避免过度设计：不提前开发复杂的权限系统、微服务、数据库迁移方案或大规模并发架构。
- 鼓励 Agent 自主推进：明确目标后允许连续完成多个相关功能，不必每个小提交都停下来问。
- 快速迭代 UI/UX：先让游戏好看、好玩、有吸引力，再根据试玩反馈调整。
- 非阻塞问题记 `docs/BACKLOG.md`，不再轻易阻止功能开发。

## 三条底线（不变）

1. 不静默删除或覆盖已有代码和存档。
2. 不泄露密钥或引入明显的安全漏洞。
3. 多 Agent 不同时覆盖同一份代码（认领先行，`sim.js` 同一时间只一个人动）。

## 给 Coding Agent 的默认指令（英文原版）

Courtside Legends — Development Philosophy

We are in a pre-launch, zero-user, rapid-development stage.

Our priority is to build a fun, feature-rich, visually appealing, playable basketball game as quickly as possible.

Feature-First. Speed-First. Playable-First.

* Implement approved features end-to-end instead of repeatedly stopping at design documents.
* Make reasonable implementation decisions autonomously.
* Prefer working prototypes over speculative architectural perfection.
* Use existing systems where practical, but do not let minor technical debt block development.
* Run focused smoke tests and essential regression checks.
* Defer noncritical edge cases, optimization, and large-scale production concerns.
* Do not request approval for every small implementation detail.
* Continue through related subtasks until the requested feature is playable.
* Record deferred improvements in the existing Backlog without creating unnecessary approval gates.
* Preserve existing code, saves, and credentials.
* Coordinate ownership when multiple agents work in parallel.

Success criterion: A player can actually experience the feature, not merely read about it in an ADR.

Do not confuse planning progress with product progress.

## 与 AI_EFFICIENCY_POLICY.md 的关系

- 本文件是 2026-11-07 的战略修订，优先级高于效率规则中与之冲突的部分：规则 10 的"先批设计再写代码"只适用于尚未确定的新方向，已定方向不再逐项 ADR/审批；规则 4 的"每批全量回归"改为 smoke + 核心验证优先，不为每次小改动跑全量。
- 其余规则继续有效：任务分级、范围控制、测试按风险（按新标准执行）、完成即停、互相 review（不阻塞 main）、分工与认领、禁止随机断言、禁止 QA 重试循环。
- 用户角色：游戏制作人 + 技术合伙人，主动推动功能落地。
