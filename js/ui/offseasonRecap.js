// The offseason recap alert's words: what happened over the break (growth highlights, retirements, the board goal, reputation,
// the draft prophecy, a poaching offer, the coach's own retirement, the lifetime XP). Pure. app.js (completeOffseason) keeps everything
// that is not text: finishing the offseason, queueing the next time-travel event, paying the lifetime XP, the alert itself.
//
// Moved out of app.js unchanged (B61): the strings are byte-for-byte what it inlined; `lang` stands in for the L() / getLang() it read.
import { teamNameL } from "../i18n.js";
import { LEGACY_TIERS } from "../career/legacy.js";

/**
 * @param { completed: object, resolvedGoal?: object, nextGoal?: object, settledReputation?: object, prophecy?: object,
 *   poachOffer?: object, coachRetirement?: object, lifetimeXp?: {gained:number, levelAfter:number}|null, enteredYear: number, lang: string } input
 */
export function offseasonRecap({ completed, resolvedGoal, nextGoal, settledReputation, prophecy, poachOffer, coachRetirement, lifetimeXp, enteredYear, lang }) {
  const L = (zh, en) => (lang === "en" ? en : zh);
  const highlights = (completed.result?.log || [])
    .filter((entry) => entry.delta > 0 || (entry.salaryAfter || 0) > (entry.salaryBefore || 0) + 10)
    .slice(0, 8);
  const retirements = (completed.result?.log || [])
    .filter((entry) => entry.retired)
    .map((entry) => L(`${entry.name} 退役`, `${entry.name} retired`));
  const summary = highlights.length
    ? highlights
        .map((entry) => `${entry.name} OVR ${entry.before}→${entry.after}`)
        .join("\n")
    : L("本队本轮成长与续约变化较小。", "Little growth or contract change for your team this round.");
  const retiredSummary = retirements.length
    ? L(`\n\n本队退役：\n${retirements.join("\n")}`, `\n\nRetired:\n${retirements.join("\n")}`)
    : "";
  // B1 of docs/CAREER_LIFE_ROADMAP.md: surface the board goal result the same way every
  // other offseason outcome already gets surfaced here -- a plain recap alert, not a new
  // UI surface, since root.story.promises (the old home for this) was never rendered
  // anywhere either.
  const goalLabel = resolvedGoal ? L(resolvedGoal.goal.label, resolvedGoal.goal.labelEn || resolvedGoal.goal.label) : "";
  const goalSummary = resolvedGoal
    ? L(
        `\n\n赛季目标【${goalLabel}】：${resolvedGoal.achieved ? "达成 ✅" : "未达成 ❌"}（信任度 ${resolvedGoal.trustDelta > 0 ? "+" : ""}${resolvedGoal.trustDelta}）`,
        `\n\nSeason goal [${goalLabel}]: ${resolvedGoal.achieved ? "met ✅" : "missed ❌"} (trust ${resolvedGoal.trustDelta > 0 ? "+" : ""}${resolvedGoal.trustDelta})`,
      )
    : "";
  const nextGoalLabel = nextGoal ? L(nextGoal.label, nextGoal.labelEn || nextGoal.label) : "";
  const nextGoalSummary = nextGoal ? L(`\n\n新赛季目标：${nextGoalLabel}`, `\n\nNext season's goal: ${nextGoalLabel}`) : "";
  // B6: reputation now moves with results, and a well-regarded coach can be poached. Both are
  // surfaced in this same recap; the offer also says where to find it and when it lapses.
  const repSummary = settledReputation
    ? `\n\n${L("教练声望", "Coaching reputation")}：${settledReputation.from} → ${settledReputation.to}`
    : "";
  // D: the draft prophecy settles off his real third season; say how it went.
  const sign = (n) => (n > 0 ? `+${n}` : `${n}`);
  const prophecySummary = prophecy
    ? `\n\n🔮 ${prophecy.hit
      ? L(`预言成真：${prophecy.name} 前三季巅峰 OVR ${prophecy.best}（信任 ${sign(prophecy.trust)}、声望 ${sign(prophecy.reputation)}）`, `Called it: ${prophecy.name} peaked at OVR ${prophecy.best} in his first three seasons (trust ${sign(prophecy.trust)}, reputation ${sign(prophecy.reputation)})`)
      : L(`预言落空：${prophecy.name} 前三季巅峰只有 OVR ${prophecy.best}（信任 ${sign(prophecy.trust)}）`, `Missed: ${prophecy.name} only peaked at OVR ${prophecy.best} in his first three seasons (trust ${sign(prophecy.trust)})`)}`
    : "";
  const poachTeam = poachOffer ? teamNameL(poachOffer.teamName, lang) : "";
  const poachSummary = poachOffer
    ? `\n\n📨 ${L(`${poachTeam} 想挖你！请到「穿越生涯」页查看并决定——本赛季第一场比赛开打后，邀请自动作废。`, `${poachTeam} wants to hire you away! Open the Time-travel career page to decide — the offer lapses once this season's first game is played.`)}`
    : "";
  // B7: at the retirement age the coach hangs up the whistle for you; say so, and where the verdict is.
  const coachTier = coachRetirement ? LEGACY_TIERS[coachRetirement.tier] : null;
  const coachRetireSummary = coachRetirement
    ? `\n\n🏁 ${L(`你今年 ${coachRetirement.age} 岁，到了退休年龄，依规挂靴。生涯评级：${coachTier?.label}。请到「穿越生涯」页查看完整总评。`, `You're ${coachRetirement.age}: the retirement age. Your coaching career ends here — verdict: ${coachTier?.labelEn}. Open the Time-travel career page for the full summary.`)}`
    : "";
  const lifetimeNote = lifetimeXp?.gained ? `\n\n🎖️ ${L(`完成一世生涯，账号经验 +${lifetimeXp.gained}（Lv.${lifetimeXp.levelAfter}）`, `Completed a lifetime — Account XP +${lifetimeXp.gained} (Lv.${lifetimeXp.levelAfter})`)}` : "";
  return L(
    `已进入 ${enteredYear} 赛季。\n\n休赛期亮点：\n${summary}${retiredSummary}${goalSummary}${nextGoalSummary}${repSummary}${prophecySummary}${poachSummary}${coachRetireSummary}${lifetimeNote}`,
    `Entered the ${enteredYear} season.\n\nOffseason notes:\n${summary}${retiredSummary}${goalSummary}${nextGoalSummary}${repSummary}${prophecySummary}${poachSummary}${coachRetireSummary}${lifetimeNote}`,
  );
}
