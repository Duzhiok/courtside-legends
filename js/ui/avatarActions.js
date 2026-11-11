/**
 * Creator preview actions: which clip plays for which button. Pure (no THREE), so it is unit-tested without WebGL.
 *
 * Every Stylized GLB carries the same `Stylized_*` clips on the same skeleton (scripts/avatar/stylized_clips.py), so a new
 * outfit needs no animation work. The older Man model (Bobblehead) keeps its own `Man_*` clips: `clips` is an ordered list
 * of name suffixes and the first one the model has wins, so one action list serves both.
 *
 * mode  once: plays once, then the figure returns to idle · loop: repeats until idle is requested ·
 *       hold: plays once and stays in the last pose until idle is requested (needs a seat prop; without one it is `once`)
 * ball  false: the basketball is put away for this action (clapping with a ball in one hand looks wrong)
 * seat  true: show the stool prop while this action is active
 * exit  a clip that plays when a held pose is released (standing up)
 * frame camera distance multiplier, so a jump with raised arms is not cropped
 */
export const AVATAR_ACTIONS = Object.freeze([
  { id: "celebrate", clips: ["Stylized_Celebrate", "Man_Clapping"], zh: "庆祝", en: "Celebrate", mode: "once", ball: false, frame: 1.3 },
  { id: "clap", clips: ["Stylized_Clap", "Man_Clapping"], zh: "鼓掌", en: "Clap", mode: "once", ball: false, frame: 1 },
  { id: "jump", clips: ["Stylized_Jump", "Man_Jump"], zh: "跳跃", en: "Jump", mode: "once", ball: true, frame: 1.45 },
  { id: "run", clips: ["Stylized_Run", "Man_Run"], zh: "跑步", en: "Run", mode: "loop", ball: true, frame: 1 },
  { id: "sit", clips: ["Stylized_Sit", "Man_Sitting"], zh: "坐下", en: "Sit", mode: "hold", ball: true, seat: true, exit: ["Stylized_Stand"], frame: 1 },
]);

const nameOf = (c) => String(c?.name ?? c);

/** Pure: the first clip (by suffix priority) among `clips`; the suffix must end the name, so Man_Run never matches Man_RunningJump. */
export function findClipBySuffix(clips, suffixes) {
  for (const suffix of suffixes || []) {
    const hit = (clips || []).find((c) => nameOf(c).endsWith(suffix));
    if (hit) return hit;
  }
  return null;
}

/** Pure: pick the clip for an action id from a list of clip names (or clip-like objects). Null when absent. */
export function findActionClip(clips, actionId) {
  const def = AVATAR_ACTIONS.find((a) => a.id === actionId);
  return def ? findClipBySuffix(clips, def.clips) : null;
}

/** Pure: the clip that releases a held pose (Stand for Sit), or null. */
export function findExitClip(clips, actionId) {
  const def = AVATAR_ACTIONS.find((a) => a.id === actionId);
  return def?.exit ? findClipBySuffix(clips, def.exit) : null;
}

/** Pure: does a held action really hold on this model? Only when the model brings its own seat. */
export const holdsPose = (def, hasSeat) => def?.mode === "hold" && !!hasSeat;
