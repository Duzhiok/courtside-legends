/**
 * Lightweight coach origin stories (T14/E-adjacent, inserted ahead of B4 per user request): a
 * flavor-and-modifier layer picked at career creation, NOT a second roster or a simulated
 * overseas/G-League competition. No new player data, no fabricated box scores for leagues this
 * game doesn't model -- an origin only nudges the numbers the interview/career flow already
 * reads (offer trust/pressure/authority, starting reputation) and leaves a narrative tag behind
 * for future story-event work to key off of.
 *
 * Pure module: every function takes plain data and returns new data, never mutates its input.
 */

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export const DEFAULT_COACH_ORIGIN = "generalist";

export const COACH_ORIGINS = {
  generalist: {
    id: "generalist",
    label: "通才教练",
    labelEn: "Generalist Coach",
    description: "没有特别鲜明的背景标签，管理层对你没有先入为主的看法。",
    descriptionEn: "No particular background label -- front offices have no preconceptions about you.",
    reputationDelta: 0,
    trustDelta: 0,
    pressureDelta: 0,
    authorityDelta: 0,
  },
  grassroots: {
    id: "grassroots",
    label: "本土草根",
    labelEn: "Grassroots Climber",
    description: "从社区联赛、高中和发展联盟一步步爬上来，没什么名气，但管理层信你肯干脏活。",
    descriptionEn: "Clawed up through rec leagues, high school ball, and the G League -- no name recognition, but front offices trust you to do the unglamorous work.",
    reputationDelta: -8,
    trustDelta: 6,
    pressureDelta: -5,
    authorityDelta: -5,
  },
  overseas: {
    id: "overseas",
    label: "海外执教经历",
    labelEn: "Overseas Coaching Experience",
    description: "在海外联赛执教多年，战术理念超前，但本土球队对你的适应能力心存疑虑。",
    descriptionEn: "Years coaching overseas left you with advanced tactical ideas, but teams here aren't convinced you'll adapt.",
    reputationDelta: 4,
    trustDelta: -4,
    pressureDelta: 5,
    authorityDelta: 8,
  },
  formerPlayer: {
    id: "formerPlayer",
    label: "NBA 球员转型",
    labelEn: "Former NBA Player",
    description: "你曾经就在这个联盟打球，更衣室天然信你，但没人把你当战术型教练看待。",
    descriptionEn: "You played in this league yourself -- the locker room trusts you on instinct, but nobody sees you as an X's-and-O's coach yet.",
    reputationDelta: 10,
    trustDelta: 10,
    pressureDelta: 10,
    authorityDelta: -8,
  },
  collegeAssistant: {
    id: "collegeAssistant",
    label: "名校助教出身",
    labelEn: "Blue-Blood Assistant",
    description: "在顶尖大学当了多年助教，培养球员的口碑很好，但从未独自带过一支职业球队。",
    descriptionEn: "Years as an assistant at a blue-blood program built a reputation for developing players, but you've never run a pro team solo.",
    reputationDelta: 2,
    trustDelta: 2,
    pressureDelta: -8,
    authorityDelta: -3,
  },
};

/** Ordering for UI display -- object key order would work too (all string keys, insertion
 * order preserved), but an explicit list makes the intended picker order a visible decision
 * instead of an accident of how COACH_ORIGINS happened to be written. */
export const COACH_ORIGIN_ORDER = [
  "generalist",
  "grassroots",
  "overseas",
  "formerPlayer",
  "collegeAssistant",
];

export function isKnownCoachOrigin(id) {
  return Object.prototype.hasOwnProperty.call(COACH_ORIGINS, id);
}

/** Safe lookup: unknown or missing ids fall back to the zero-modifier default rather than
 * throwing, so every other function in this module stays total (defined for any input) even
 * though createTimeTravelPrologue()/acceptInterviewOffer() separately choose to validate and
 * throw on a bad *explicit* choice -- this fallback is for internal callers that already trust
 * their input, not a replacement for that validation. */
export function coachOrigin(id) {
  return COACH_ORIGINS[id] || COACH_ORIGINS[DEFAULT_COACH_ORIGIN];
}

export function listCoachOrigins() {
  return COACH_ORIGIN_ORDER.map((id) => COACH_ORIGINS[id]);
}

/**
 * Nudge one interview offer's trust/pressure/authority by the origin's deltas, clamped back into
 * 0-100. Applied to every offer on the prologue, not just the one the player eventually accepts --
 * a grassroots climber reads as more trustworthy-but-lower-authority on all three offers, not
 * just the one they pick.
 */
export function applyOriginToOffer(offer, originId) {
  const origin = coachOrigin(originId);
  return {
    ...offer,
    trust: clamp(offer.trust + origin.trustDelta, 0, 100),
    pressure: clamp(offer.pressure + origin.pressureDelta, 0, 100),
    authority: clamp(offer.authority + origin.authorityDelta, 0, 100),
  };
}

/** Nudge a fresh coach profile's starting reputation by the origin's delta, clamped to 0-100.
 * Deliberately does NOT touch coach.perks or root.story.relationships -- neither is read by any
 * gameplay logic yet (perks: no code ever consults coach.perks.<line>; relationships: accumulated
 * by story-event effects but never consulted either), so seeding either would just be adding more
 * inert data to an already-unwired field instead of a real effect -- the same trap A1 documented
 * for coachProfile.js's own fields before this session wired reputation into B3's renewal menu. */
export function applyOriginToCoach(coach, originId) {
  const origin = coachOrigin(originId);
  return { ...coach, reputation: clamp(coach.reputation + origin.reputationDelta, 0, 100) };
}
