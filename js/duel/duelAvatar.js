/**
 * Legend Duel D2 — the player's My World Avatar as a challenger.
 *
 * The Duel Profile is SEPARATE from the avatar's appearance: the look (skin /
 * hair / outfit / body preset, js/data/avatarLook.js) stays cosmetic and the
 * 3D preview (js/ui/avatar3d.js) keeps showing it, while the profile below
 * holds the ratings the DuelSim plays with. The profile is NEVER derived from
 * appearance at display time and NEVER touches the gacha / card economy: no
 * new currency, no grind, no upgrade shop in D2. It is created automatically
 * on the first Avatar challenge and stored per account as `account.duelAvatar`
 * (same additive pattern as `account.duel`); guests keep theirs in one
 * localStorage key. There is nothing to buy or upgrade — the profile is a
 * fixed, deterministic function of the avatar's body preset + height scale.
 *
 * Derivation (deterministic: same look in, same profile out):
 * - BASE ratings are a capable amateur, not a legend: every rating sits in
 *   the low-60s with stamina 70, so an avatar can beat a legend on Rookie
 *   and must play well on Pro/Legend.
 * - BODY LEAN: the preset tilts the profile toward the build it shows.
 *   broad ("壮实") leans post/strength (+strength, +finishing, -speed,
 *   -shooting, post skill, PF); slim ("精瘦") leans quickness/outside
 *   (+speed, +shooting, +handles, -strength, -finishing, outside skill,
 *   SG); standard stays balanced (no tilt, no skill, SF).
 * - HEIGHT: the preset's height scale (broad 1.03, standard 1.00, slim 0.97)
 *   nudges the same way — taller adds a little strength/finishing and costs
 *   a little speed; shorter adds a little speed/handles and costs a little
 *   strength. h = round((height - 1) * 100), so the swing is at most +-3.
 * - OVR is the rounded mean of the seven ratings (a display number only;
 *   the sim reads the individual ratings). Skills are real skill ids from
 *   js/data/skills.js, already understood by duelSim's make model.
 *
 * The sim needs no change: the profile is the same player-like shape D1's
 * cardToDuelist() produces, so createDuel() accepts it as-is.
 */
import { BODY_PRESETS, GUEST_LOOK_KEY, readLook, sanitizeLook } from "../data/avatarLook.js";
import { saveAccount } from "../data/account.js";

export const DUEL_AVATAR_KEY = "cls_duel_avatar_v1";

/** Base ratings for every avatar: a capable amateur, not a legend. */
export const DUEL_AVATAR_BASE = Object.freeze({
  shooting: 64,
  finishing: 64,
  handles: 64,
  defense: 62,
  strength: 64,
  speed: 64,
  stamina: 70,
});

/**
 * Per-preset lean: rating deltas, the one skill the build earns (a real skill
 * id the DuelSim already understands), and the position the build plays.
 */
export const DUEL_AVATAR_BODY_LEAN = Object.freeze({
  broad: {
    deltas: { strength: 10, finishing: 6, speed: -6, shooting: -2 },
    skills: ["paint_bully"],
    pos: "PF",
  },
  slim: {
    deltas: { speed: 8, shooting: 6, handles: 4, strength: -8, finishing: -2 },
    skills: ["rainmaker"],
    pos: "SG",
  },
  standard: { deltas: {}, skills: [], pos: "SF" },
});

const RATING_KEYS = ["shooting", "finishing", "handles", "defense", "strength", "speed", "stamina"];
const clampRating = (v) => Math.max(1, Math.min(99, Math.round(v)));

/**
 * Pure: body preset id + height scale -> ratings + skills + position.
 * Unknown presets fall back to standard (same rule as bodyBoneScales).
 */
export function deriveAvatarRatings(bodyId, height = 1.0) {
  const preset = BODY_PRESETS.find((b) => b.id === bodyId) || BODY_PRESETS[0];
  const lean = DUEL_AVATAR_BODY_LEAN[preset.id] || DUEL_AVATAR_BODY_LEAN.standard;
  const ratings = { ...DUEL_AVATAR_BASE };
  for (const [key, delta] of Object.entries(lean.deltas)) ratings[key] += delta;
  // Height nudge: h = +3 for broad (1.03), -3 for slim (0.97), 0 for standard.
  const h = Math.round(((typeof height === "number" && Number.isFinite(height) ? height : 1.0) - 1) * 100);
  if (h > 0) {
    ratings.strength += h;
    ratings.finishing += Math.round((h * 2) / 3);
    ratings.speed -= Math.round((h * 2) / 3);
  } else if (h < 0) {
    ratings.speed += -h;
    ratings.handles += Math.round((-h * 2) / 3);
    ratings.strength -= Math.round((-h * 2) / 3);
  }
  for (const key of RATING_KEYS) ratings[key] = clampRating(ratings[key]);
  return { ...ratings, skills: [...lean.skills], pos: lean.pos };
}

/** The challenger-list key for an account's avatar (stable per account). */
export function avatarChallengerKey(account) {
  return `avatar:${account?.id || "guest"}`;
}

/**
 * Has this account ever saved an avatar look? Accounts: the raw
 * `account.avatar` field (readLook() always returns defaults, so it cannot
 * tell a real avatar from no avatar). Guests: the guest look key in storage.
 */
export function hasAvatar(account, storage = typeof localStorage !== "undefined" ? localStorage : null) {
  if (account) return !!account.avatar;
  try {
    return !!storage?.getItem(GUEST_LOOK_KEY);
  } catch {
    return false;
  }
}

/**
 * Pure: a sanitized look -> a DuelSim-ready duelist, or null when there is no
 * look at all. `name` is the display name (the account's name, or "我的头像"
 * when unknown); `ownerId` scopes the id per account.
 */
export function avatarToDuelist(look, { ownerId = "guest", name = "我的头像" } = {}) {
  if (!look || typeof look !== "object") return null;
  const clean = sanitizeLook(look);
  const preset = BODY_PRESETS.find((b) => b.id === clean.body) || BODY_PRESETS[0];
  const derived = deriveAvatarRatings(preset.id, preset.height);
  const ovr = Math.round(RATING_KEYS.reduce((sum, key) => sum + derived[key], 0) / RATING_KEYS.length);
  return {
    id: `avatar:${ownerId}`,
    name,
    nameEn: null,
    bref: null,
    season: null,
    pos: derived.pos,
    ovr,
    shooting: derived.shooting,
    finishing: derived.finishing,
    handles: derived.handles,
    defense: derived.defense,
    strength: derived.strength,
    speed: derived.speed,
    stamina: derived.stamina,
    skills: derived.skills,
    kind: "avatar",
    body: preset.id,
  };
}

function readGuestProfile(storage) {
  if (!storage) return null;
  try {
    const parsed = JSON.parse(storage.getItem(DUEL_AVATAR_KEY) || "null");
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function writeGuestProfile(profile, storage) {
  if (!storage) return;
  try {
    storage.setItem(DUEL_AVATAR_KEY, JSON.stringify(profile));
  } catch {
    // Storage full/blocked: the in-memory profile still plays this session.
  }
}

/**
 * The account's Duel Profile: created automatically on the first Avatar
 * challenge from the current look, then stored per account alongside the
 * duel record (`account.duelAvatar`; guests: one localStorage key). The
 * derivation is deterministic, so re-deriving from an unchanged look
 * returns the same profile; the stored copy is the record of what played.
 * Returns null when the account has no avatar yet — the caller prompts the
 * player to create one instead of crashing.
 */
export function getOrCreateAvatarDuelist(
  account,
  { name = "我的头像", save = saveAccount, storage = typeof localStorage !== "undefined" ? localStorage : null } = {},
) {
  if (!hasAvatar(account, storage)) return null;
  const look = readLook(account, storage);
  const duelist = avatarToDuelist(look, { ownerId: account?.id || "guest", name });
  if (!duelist) return null;
  if (account) {
    account.duelAvatar = duelist;
    try {
      save(account);
    } catch {
      // A save failure must not lose the in-memory profile.
    }
  } else {
    writeGuestProfile(duelist, storage);
  }
  return duelist;
}

/** The stored profile, if one was created by an earlier challenge. */
export function readAvatarDuelist(account, storage = typeof localStorage !== "undefined" ? localStorage : null) {
  if (account) return account.duelAvatar && typeof account.duelAvatar === "object" ? account.duelAvatar : null;
  return readGuestProfile(storage);
}
