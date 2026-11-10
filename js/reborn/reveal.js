/**
 * Player Reborn — identity-reveal buildup (integration sprint, workstream A).
 *
 * The trust-40 reveal stays, but it must land as a surprise, not a sudden
 * name pop. Before trust 40 the player gets small, layered foreshadowing —
 * a teammate remark, a coach's double-take, a newspaper photo — each tied
 * to a trust threshold, each naming nobody. Pure functions; the hints never
 * contain the real name (pinned by tests — a leak would spoil the reveal).
 */
import { REVEAL_TRUST } from "./identity.js";

/** Foreshadowing beats on the way to the trust-40 reveal. */
export const REVEAL_HINTS = [
  {
    id: "teammate-remark",
    trust: 28,
    zh: "训练结束后，老队员拍了拍你：“你这招转身，我好像在哪见过。”",
    en: "After practice a veteran clapped your shoulder: “That spin move… I swear I’ve seen it before.”",
  },
  {
    id: "coach-double-take",
    trust: 33,
    zh: "录像课上，教练盯着你的跑位看了很久：“这个习惯……不像是训练营里学的。”",
    en: "In film session the coach stared at your cuts for a long time: “Those habits… you don’t learn those at camp.”",
  },
  {
    id: "newspaper-photo",
    trust: 37,
    zh: "当地报纸登了一张几年前的旧照片，照片里的背影和你一模一样，队友们传着看。",
    en: "The local paper ran an old photo from years ago — the silhouette in it looks exactly like you, and the locker room is passing it around.",
  },
];

/**
 * The foreshadowing unlocked so far. Only historical identities that are
 * still unrevealed get hints — a fictional identity is yours from the
 * start, and a revealed one has nothing left to foreshadow.
 */
export function revealHints(identity, trust) {
  if (!identity || identity.kind !== "historical" || identity.revealed) return [];
  const t = Number(trust) || 0;
  return REVEAL_HINTS.filter((hint) => t >= hint.trust);
}

/** The most recent unlocked hint, or null when nothing has unlocked yet. */
export function latestRevealHint(identity, trust) {
  const hints = revealHints(identity, trust);
  return hints.length ? hints[hints.length - 1] : null;
}

/** The reveal moment itself: the real name, finally. Only call after the reveal. */
export function revealLine(identity, lang = "zh") {
  if (!identity) return null;
  const name = lang === "en" ? identity.nameEn || identity.name : identity.name;
  return lang === "en"
    ? `So you are ${name}. The camp player was never a stranger — he was you all along.`
    : `原来你就是 ${name}。这个无名试训球员从来不是陌生人——他一直就是你。`;
}

export { REVEAL_TRUST };
