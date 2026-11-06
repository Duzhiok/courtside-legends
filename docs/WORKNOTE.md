

## R155 · Code：ADR-006 批准落库 + M2b 设计提交（2026-11-05）
- ADR-006 ✅ APPROVED：Q1/Q4 批准；Q2 附条件；Q3 原则批准。写入 ADR §0 与 DECISIONS。内部步骤 R1–R7 映射 M5–M7，不新建里程碑。
- 新增 `docs/implementation/M2b-clutch-decision-design.md`（PROPOSED，一页）：可注入 RNG + 决策契约。发现 `skills.js` 51 处 `Math.random` 在引擎调用链里，只改 `sim.js` 不够；建议 `js/core/rng.js` 作用域替换 + 改动前后金标哈希；拟修订 ROADMAP §5 "RNG 不可注入"。批准前不改 GameSim。
- `BASELINE_AUDIT.md` 新增 §0b：来源提交 `b64e660`，标注已解决/已变更/仍成立的条目。
- 同日早些时候已完成并推送：设置页标题与开始按钮随经营长度（`a2da47c`）、开局引导页取消按钮（`a2da47c`）、权限审计（`b64e660`）。
