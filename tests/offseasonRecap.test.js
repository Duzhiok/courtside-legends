// The offseason recap alert (B61): what the coach is told when the break ends. Pure text, so the cases are plain objects.
import test from "node:test";
import assert from "node:assert/strict";

const { offseasonRecap } = await import("../js/ui/offseasonRecap.js");
const { LEGACY_TIERS } = await import("../js/career/legacy.js");

const entry = (over = {}) => ({ name: "甲", delta: 0, before: 60, after: 60, salaryBefore: 100, salaryAfter: 100, retired: false, ...over });
const base = (over = {}) => ({ completed: { result: { year: 2031, log: [] } }, enteredYear: 2031, lang: "zh", ...over });

test("a quiet break: just the year and the 'little changed' line, in both languages", () => {
  assert.equal(offseasonRecap(base()), "已进入 2031 赛季。\n\n休赛期亮点：\n本队本轮成长与续约变化较小。");
  assert.equal(offseasonRecap(base({ lang: "en" })), "Entered the 2031 season.\n\nOffseason notes:\nLittle growth or contract change for your team this round.");
});

test("highlights: a rise or a real raise counts, a flat year does not, and the list stops at eight", () => {
  const log = [entry({ name: "涨", delta: 3, before: 61, after: 64 }), entry({ name: "平" }), entry({ name: "加薪", salaryAfter: 111 }), entry({ name: "小加", salaryAfter: 110 })];
  const text = offseasonRecap(base({ completed: { result: { log } } }));
  assert.ok(text.includes("涨 OVR 61→64") && text.includes("加薪 OVR 60→60"), "the rise and the raise over 10 are listed");
  assert.ok(!text.includes("平 OVR") && !text.includes("小加 OVR"), "flat and a raise of exactly 10 are not");
  const many = Array.from({ length: 12 }, (_, i) => entry({ name: `P${i}`, delta: 1 }));
  const shown = offseasonRecap(base({ completed: { result: { log: many } } })).split("\n").filter((l) => l.startsWith("P"));
  assert.equal(shown.length, 8);
});

test("retirements get their own block", () => {
  const log = [entry({ name: "老将", retired: true })];
  assert.ok(offseasonRecap(base({ completed: { result: { log } } })).endsWith("\n\n本队退役：\n老将 退役"));
  assert.ok(offseasonRecap(base({ completed: { result: { log } }, lang: "en" })).endsWith("\n\nRetired:\n老将 retired"));
});

test("the board goal: met or missed, the trust sign, and the next goal (English falls back to the Chinese label)", () => {
  const met = offseasonRecap(base({ resolvedGoal: { goal: { label: "夺冠", labelEn: "Win it all" }, achieved: true, trustDelta: 5 }, nextGoal: { label: "八强" }, lang: "en" }));
  assert.ok(met.includes("Season goal [Win it all]: met ✅ (trust +5)"));
  assert.ok(met.includes("Next season's goal: 八强"), "no labelEn -> the Chinese label");
  const missed = offseasonRecap(base({ resolvedGoal: { goal: { label: "保级" }, achieved: false, trustDelta: -3 } }));
  assert.ok(missed.includes("赛季目标【保级】：未达成 ❌（信任度 -3）"));
  assert.ok(offseasonRecap(base({ resolvedGoal: { goal: { label: "x" }, achieved: true, trustDelta: 0 } })).includes("（信任度 0）"), "zero has no plus");
});

test("reputation, the draft prophecy (hit and missed), and a poaching offer", () => {
  assert.ok(offseasonRecap(base({ settledReputation: { from: 40, to: 47 } })).includes("教练声望：40 → 47"));
  const hit = offseasonRecap(base({ prophecy: { hit: true, name: "新秀", best: 81, trust: 6, reputation: -2 } }));
  assert.ok(hit.includes("🔮 预言成真：新秀 前三季巅峰 OVR 81（信任 +6、声望 -2）"));
  const miss = offseasonRecap(base({ prophecy: { hit: false, name: "新秀", best: 64, trust: -4 }, lang: "en" }));
  assert.ok(miss.includes("Missed: 新秀 only peaked at OVR 64 in his first three seasons (trust -4)"));
  assert.ok(offseasonRecap(base({ poachOffer: { teamName: "湖人" } })).includes("📨 湖人 想挖你！"));
  assert.ok(offseasonRecap(base({ poachOffer: { teamName: "湖人" }, lang: "en" })).includes("Lakers wants to hire you away!"), "the team name follows the language");
});

test("the coach's own retirement shows the tier, and the lifetime XP only when some was paid", () => {
  const tier = Object.keys(LEGACY_TIERS)[0];
  const retired = { age: 62, tier };
  const zh = offseasonRecap(base({ coachRetirement: retired, lifetimeXp: { gained: 800, levelAfter: 7 } }));
  assert.ok(zh.includes(`🏁 你今年 62 岁，到了退休年龄，依规挂靴。生涯评级：${LEGACY_TIERS[tier].label}`));
  assert.ok(zh.endsWith("🎖️ 完成一世生涯，账号经验 +800（Lv.7）"));
  const en = offseasonRecap(base({ coachRetirement: retired, lifetimeXp: { gained: 800, levelAfter: 7 }, lang: "en" }));
  assert.ok(en.includes(`verdict: ${LEGACY_TIERS[tier].labelEn}`) && en.endsWith("Completed a lifetime — Account XP +800 (Lv.7)"));
  assert.ok(!offseasonRecap(base({ coachRetirement: retired, lifetimeXp: { gained: 0, levelAfter: 7 } })).includes("🎖️"), "nothing paid, nothing announced");
  assert.ok(!offseasonRecap(base({ coachRetirement: retired })).includes("🎖️"), "no XP result at all is fine");
});
