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
- Policy 与安全问题也先记下来、以后再说，不拦功能开发（底线仍是不主动泄露密钥、不引入明显安全漏洞；记下来的问题进 BACKLOG 备查）。
- 测试执行（产品负责人 2026-11-07 确认）：小改动只跑 Smoke Test + 相关单测；全量回归只在动了共享/引擎代码或到里程碑前跑；互相 review 保留，但不阻塞 main。

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

## 自主开发 + 协调所有权（产品负责人 2026-11-09 定）

> 取代"只做这一项，其他不许碰"的机械限制。默认行为：一直做下去，协调所有权，只在必要时升级。

### 称呼

- Coding Agent：泛指执行开发任务的 Agent。
- Assigned Agent：当前负责某项任务的 Agent。
- Review Agent：负责 Code Review 的 Agent。
- 只有明确涉及某个 Agent 的具体工作时，才使用它的名字。

### 新规则

| 场景 | 新规则 |
|---|---|
| 当前功能完成 | 可以自主领取下一个已批准任务 |
| 发现相关 Bug | 直接修复，不需要重新申请 |
| 发现可以顺手完善的 UX | 可以实现并报告 |
| 多个 Agent 并行 | 鼓励，但协调文件所有权 |
| 需要修改共享引擎 | 可以做，验证主要回归即可 |
| 发现新的产品创意 | 可以做原型，重大方向再讨论 |
| 遇到真正的产品冲突 | 停下来询问 |
| 涉及数据丢失、密钥泄露 | 必须先解决 |

### 升级（只在以下情况找产品负责人）

- 重大产品决策确实含糊不清。
- 两个已批准的设计根本冲突。
- 有不可逆数据丢失的风险。
- 凭证或敏感数据可能泄露。

### 说明

- "Do not start unrelated milestones" 不再作为默认限制：它原本是为防止范围失控、文件冲突、小功能膨胀成大型重构；现在改为按上表自主推进。
- M3 门等产品决策本身不受影响（进 M4 仍需用户试玩反馈）。
- 三条底线不变；认领先行、协调所有权不变；测试按风险（smoke + 核心验证优先）不变。

## 给 Coding Agent 的默认规则（英文原版，2026-11-09）

Courtside Legends — Autonomous Multi-Agent Development Policy

We are in a zero-user, pre-launch, feature-first development stage.

Prioritize playable features, creativity, rapid iteration, and visible product progress.

Autonomy

* Complete assigned features end-to-end.
* Fix related bugs and improve UX without requesting additional approval.
* After completing a task, autonomously continue with the next approved backlog item.
* Multiple agents may work on different features concurrently.
* Prototype promising ideas without unnecessary ADR gates.
* Avoid excessive planning and repeated approval requests.

Coordination

* Claim task ownership through the existing agent coordination board.
* Avoid concurrent edits to the same files when practical.
* Use separate worktrees for overlapping development.
* Integrate and review changes without overwriting another agent’s work.
* Keep existing roadmap and backlog as the shared source of truth.

Testing

* Prioritize functional smoke tests and meaningful regression coverage.
* Run broader tests when changes affect shared systems.
* Do not repeatedly run expensive tests without a reason.

Escalation

Only request product-owner input when:

* A major product decision is genuinely ambiguous.
* Two approved designs fundamentally conflict.
* An action risks irreversible data loss.
* Credentials or sensitive data may be exposed.

Delivery

Continue making progress instead of stopping after every commit.

Report completed features, playable results, relevant tests, commits, and remaining decisions.

Default behavior: Keep building. Coordinate with other agents. Escalate only when necessary.
