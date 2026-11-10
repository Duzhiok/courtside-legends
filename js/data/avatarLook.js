/**
 * My World avatar look (ADR-008a N-1f step 2; W3 Creator slice): which preset colours and build the player
 * picked for their 3D avatar.
 *
 * Cosmetic only. It never touches ratings, height, weight or any save: the account keeps it in `account.avatar`,
 * guests in ONE local key. Only whitelisted preset ids are ever stored, so a hand-edited or corrupt value
 * falls back to the default instead of reaching the renderer. The model's materials (Skin, Hair, Shirt, Pants)
 * are recoloured. Hairstyle is a two-way switch (short / shaved): the model's hair is its own mesh, so hiding it is
 * the only hairstyle change possible without art work.
 *
 * Build (W3): three presets, bone scaling only — shoulders, spine girth, limb thickness — plus an overall
 * scale for visual height. The model has NO UVs and NO textures (verified from the GLB: no TEXCOORD_0 on any
 * primitive, no images), so a shirt pattern/number texture is impossible without a Blender UV unwrap; that is
 * BACKLOG B55, not faked here. Build/height are appearance only and never reach any ability or stat code.
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
  // Shop-exclusive (Gold Lifestyle Shop, `outfit-champion-gold`): the avatar editor
  // locks it until owned (see avatarLookView groupHtml) so the shop purchase is real —
  // without the lock this outfit would be pickable for free and the sale would be fake.
  { id: "champion", shirt: "#d6b25a", pants: "#1f2937", zh: "冠军金", en: "Champion Gold", shop: "outfit-champion-gold" },
  // Shop-exclusive outfits added by the Economy workstream (2026-11-09): data rows only,
  // one per new catalog outfit. The editor lock in avatarLookView is generic — any outfit
  // with a `shop` field is locked until owned — so no editor change was needed here.
  { id: "midnight", shirt: "#1e2a44", pants: "#d6b25a", zh: "午夜蓝", en: "Midnight Navy", shop: "outfit-midnight" },
  { id: "crimson", shirt: "#a31621", pants: "#f4f4f0", zh: "绯红", en: "Crimson", shop: "outfit-crimson" },
  { id: "street", shirt: "#1b1b1b", pants: "#e85d04", zh: "街头黑橙", en: "Street Black-Orange", shop: "outfit-street" },
  { id: "vintage", shirt: "#0f766e", pants: "#f1e6cf", zh: "复古青绿", en: "Vintage Teal", shop: "outfit-vintage" },
]);

export const HAIR_STYLES = Object.freeze([
  { id: "short", zh: "短发", en: "Short" },
  { id: "shaved", zh: "光头", en: "Shaved" },
]);

/**
 * Body presets (W3 Creator slice, no art): bone scaling only, kept deliberately modest (0.88–1.16) so the
 * skinned mesh never stretches visibly. `height` is the overall visual scale, chosen per preset — there is no
 * free slider. `scales` are per bone group: shoulders = shoulder-line width (x), spine = torso girth (x/z),
 * arms/legs = limb thickness (x/z); limb and spine length (y) are never changed, so hands and feet stay where
 * the animations expect them.
 */
export const BODY_PRESETS = Object.freeze([
  { id: "standard", zh: "标准", en: "Standard", height: 1.0, scales: { shoulders: 1.0, spine: 1.0, arms: 1.0, legs: 1.0 } },
  { id: "broad", zh: "壮实", en: "Broad", height: 1.03, scales: { shoulders: 1.16, spine: 1.07, arms: 1.05, legs: 1.04 } },
  { id: "slim", zh: "精瘦", en: "Slim", height: 0.97, scales: { shoulders: 0.88, spine: 0.93, arms: 0.96, legs: 0.97 } },
]);

/** Bone names as they appear in the GLB, grouped by what a preset scales. Pure data, no Three.js needed. */
export const BODY_BONE_GROUPS = Object.freeze({
  shoulders: ["Shoulder.L", "Shoulder.R"],
  spine: ["Abdomen", "Torso"],
  arms: ["UpperArm.L", "UpperArm.R", "LowerArm.L", "LowerArm.R"],
  legs: ["UpperLeg.L", "UpperLeg.R", "LowerLeg.L", "LowerLeg.R"],
});

/**
 * Character style: one identity, two presentations. The same skin / hair / outfit / build, drawn either as a
 * stylized athlete or as a bobblehead toy. Bobblehead is bone scaling on the SAME model, with the same safety rule
 * as the build presets: the head grows UNIFORMLY (a uniform scale on a bone cannot shear its children) and limbs only
 * get thicker (x/z), never shorter (y), so knees, hands and feet stay where the animations put them. The toy feel
 * comes from the head-to-body ratio, plus a smaller overall figure so the big head still fits the frame.
 */
export const FIGURE_STYLES = Object.freeze([
  { id: "stylized", zh: "风格化写实", en: "Stylized", head: 1, limbs: 1, height: 1 },
  { id: "bobblehead", zh: "Q 版大头", en: "Bobblehead", head: 2.3, limbs: 1.32, height: 0.78 },
]);

/**
 * Pure: (build preset id, figure style id) -> { height, bones: { boneName: [x, y, z] } }.
 * Unknown ids fall back to standard / stylized.
 */
export function bodyBoneScales(presetId, figureId = "stylized") {
  const p = BODY_PRESETS.find((b) => b.id === presetId) || BODY_PRESETS[0];
  const f = FIGURE_STYLES.find((x) => x.id === figureId) || FIGURE_STYLES[0];
  const s = p.scales;
  const bones = {};
  for (const name of BODY_BONE_GROUPS.shoulders) bones[name] = [s.shoulders, 1, 1];
  for (const name of BODY_BONE_GROUPS.spine) bones[name] = [s.spine, 1, s.spine];
  for (const name of BODY_BONE_GROUPS.arms) bones[name] = [s.arms * f.limbs, 1, s.arms * f.limbs];
  for (const name of BODY_BONE_GROUPS.legs) bones[name] = [s.legs * f.limbs, 1, s.legs * f.limbs];
  bones.Head = [f.head, f.head, f.head]; // always set, so switching back to stylized resets the head
  return { height: p.height * f.height, bones };
}

export const DEFAULT_LOOK = Object.freeze({ skin: "warm", hair: "black", outfit: "forest", style: "short", body: "standard", figure: "stylized" });

const pick = (list, id, fallback) => (list.some((item) => item.id === id) ? id : fallback);

/** Whitelist every field; anything unknown becomes the default for that field. */
export function sanitizeLook(raw) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    skin: pick(SKIN_TONES, r.skin, DEFAULT_LOOK.skin),
    hair: pick(HAIR_COLORS, r.hair, DEFAULT_LOOK.hair),
    outfit: pick(OUTFITS, r.outfit, DEFAULT_LOOK.outfit),
    style: pick(HAIR_STYLES, r.style, DEFAULT_LOOK.style),
    body: pick(BODY_PRESETS, r.body, DEFAULT_LOOK.body),
    figure: pick(FIGURE_STYLES, r.figure, DEFAULT_LOOK.figure),
  };
}

/** Model material name -> hex, for the renderer. */
export function lookColors(look) {
  const l = sanitizeLook(look);
  const outfit = OUTFITS.find((o) => o.id === l.outfit);
  return {
    Skin: SKIN_TONES.find((s) => s.id === l.skin).hex,
    // Shaved = the scalp tinted like the skin, NOT a hidden mesh: the model's skull cap lives in the Hair mesh, so hiding
    // it left the back of the head open and the eyeballs visible from behind.
    Hair: l.style === "shaved" ? SKIN_TONES.find((s) => s.id === l.skin).hex : HAIR_COLORS.find((h) => h.id === l.hair).hex,
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
