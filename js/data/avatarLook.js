/**
 * My World avatar look (ADR-008a N-1f step 2): which preset colours the player picked for their 3D avatar.
 *
 * Cosmetic only. It never touches ratings, height, weight or any save: the account keeps it in `account.avatar`,
 * guests in ONE local key. Only whitelisted preset ids are ever stored, so a hand-edited or corrupt value
 * falls back to the default instead of reaching the renderer. The model's materials (Skin, Hair, Shirt, Pants)
 * are recoloured; there is no hairstyle choice because the CC0 model ships a single hair mesh.
 */
import { defaultStore } from "./profile.js";
import { saveAccount } from "./account.js";

export const GUEST_LOOK_KEY = "cls_guest_avatar_v1";

export const SKIN_TONES = Object.freeze([
  { id: "light", hex: "#f1c9a5", zh: "浅色", en: "Light" },
  { id: "warm", hex: "#d9a477", zh: "暖米", en: "Warm" },
  { id: "tan", hex: "#b9814f", zh: "小麦", en: "Tan" },
  { id: "brown", hex: "#8a5a35", zh: "棕色", en: "Brown" },
  { id: "deep", hex: "#5b3a22", zh: "深棕", en: "Deep" },
]);
export const HAIR_COLORS = Object.freeze([
  { id: "black", hex: "#1b1b1b", zh: "黑", en: "Black" },
  { id: "brown", hex: "#4a2f1b", zh: "棕", en: "Brown" },
  { id: "blond", hex: "#c9a23a", zh: "金", en: "Blond" },
  { id: "red", hex: "#a8431f", zh: "红", en: "Red" },
  { id: "gray", hex: "#9aa0a6", zh: "灰", en: "Gray" },
]);
export const OUTFITS = Object.freeze([
  { id: "forest", shirt: "#1f6b45", pants: "#14281d", zh: "森林绿", en: "Forest" },
  { id: "orange", shirt: "#e85d04", pants: "#2b2b2b", zh: "活力橙", en: "Orange" },
  { id: "royal", shirt: "#5b2a86", pants: "#f0b429", zh: "紫金", en: "Purple & gold" },
  { id: "white", shirt: "#f4f4f0", pants: "#1e2a44", zh: "经典白", en: "Classic white" },
]);

export const DEFAULT_LOOK = Object.freeze({ skin: "warm", hair: "black", outfit: "forest" });

const pick = (list, id, fallback) => (list.some((item) => item.id === id) ? id : fallback);

/** Whitelist every field; anything unknown becomes the default for that field. */
export function sanitizeLook(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    skin: pick(SKIN_TONES, r.skin, DEFAULT_LOOK.skin),
    hair: pick(HAIR_COLORS, r.hair, DEFAULT_LOOK.hair),
    outfit: pick(OUTFITS, r.outfit, DEFAULT_LOOK.outfit),
  };
}

/** Model material name -> hex, for the renderer. */
export function lookColors(look) {
  const l = sanitizeLook(look);
  const outfit = OUTFITS.find((o) => o.id === l.outfit);
  return {
    Skin: SKIN_TONES.find((s) => s.id === l.skin).hex,
    Hair: HAIR_COLORS.find((h) => h.id === l.hair).hex,
    Shirt: outfit.shirt,
    Pants: outfit.pants,
  };
}

export function readLook(account, store = defaultStore()) {
  if (account) return sanitizeLook(account.avatar);
  try {
    return sanitizeLook(JSON.parse(store?.getItem(GUEST_LOOK_KEY) || "{}"));
  } catch {
    return sanitizeLook();
  }
}

/** Save one or more fields. @returns the resulting look plus `saved` (false only when guest storage is unavailable) */
export function saveLook(account, patch, { store = defaultStore(), persist = saveAccount } = {}) {
  const next = sanitizeLook({ ...readLook(account, store), ...patch });
  if (!account) {
    try {
      if (!store) throw new Error("no storage");
      store.setItem(GUEST_LOOK_KEY, JSON.stringify(next));
    } catch {
      return { ...next, saved: false };
    }
    return { ...next, saved: true };
  }
  account.avatar = next;
  persist(account);
  return { ...next, saved: true };
}
