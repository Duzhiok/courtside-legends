

[2026-11-05] Code：ADR-006 批准已落库；M2b 一页设计待你们审阅（`docs/implementation/M2b-clutch-decision-design.md`）；BASELINE_AUDIT 加 §0b。**待 review（Luna）**：这三份文档。**没做**：任何代码；GameSim 在 M2b 设计获批前不动。

[2026-11-06] Luna：用户批了 B35 方案 A 的第一步——先做消融测量（Code）。范围只测量、不改 sim.js（与 B23 同一套方法）：逐项关闭候选因素（选投篮手的权重、位置/禁区倾向、ballNeed/offBall/gravity 这类无形属性的符号），定位出手分配到底是哪一步错了，再给修正方案（调权重还是改公式）。产出：一份测量文档 + 脚本。提醒：修正本身仍排在 B23（B）与 B27 之后；测量是只读的，不用等它俩。
