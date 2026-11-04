/**
 * B1/B18 — 连续得分（"10-0 攻击波"）。feedEventTier 一次只看一个事件，认不出"连续"，
 * 所以这里在渲染层按事件顺序累计：每个得分事件自带出手后的比分快照，用相邻两次的比分差
 * 就能得出是谁得了几分——罚球、灌篮、加罚都不用单独处理，也不依赖文字或随机。
 */

export const RUN_MILESTONE_STEP = 5; // 每 5 分一个里程碑……
export const RUN_MILESTONE_MIN = 10; // ……但从 10-0 才开始算
const MAX_SINGLE_EVENT_POINTS = 4; // 一次事件不可能超过这个分差；超过就是读档/换局，需要重新对齐

/**
 * @returns {{ observe(ev): ({ side: "home"|"away", points: number, milestone: boolean } | null) }}
 *   observe() 必须按事件顺序对每个事件调用一次；非得分事件返回 null、不改变状态。
 */
export function createRunTracker() {
  let prev = null;
  let run = { side: null, points: 0 };

  return {
    observe(ev) {
      const s = ev?.score;
      if (ev?.type !== "score" || !s) return null;

      // First event ever, or a score going DOWN (a new game on the same feed): count from 0-0 again.
      if (!prev || s.home < prev.home || s.away < prev.away) {
        prev = { home: 0, away: 0 };
        run = { side: null, points: 0 };
      }
      const dh = s.home - prev.home;
      const da = s.away - prev.away;
      const impossible = dh > MAX_SINGLE_EVENT_POINTS || da > MAX_SINGLE_EVENT_POINTS || (dh > 0 && da > 0);
      if (impossible) {
        // e.g. the feed attached mid-game after a reload: resync silently, never invent a run
        prev = { home: s.home, away: s.away };
        run = { side: null, points: 0 };
        return null;
      }
      if (dh === 0 && da === 0) return null;

      const side = dh > 0 ? "home" : "away";
      const points = dh > 0 ? dh : da;
      const before = run.side === side ? run.points : 0;
      run = { side, points: before + points };
      prev = { home: s.home, away: s.away };

      const step = (n) => Math.floor(n / RUN_MILESTONE_STEP);
      const milestone = run.points >= RUN_MILESTONE_MIN && step(run.points) > step(before);
      return { side, points: run.points, milestone };
    },
  };
}
