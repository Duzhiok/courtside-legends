/**
 * Player Voice, client side (ADR-008a Q2). Until a server endpoint exists nothing can be submitted, so this module
 * only owns the draft: category, optional 1-5 rating and a note, kept per owner on this device. It never claims
 * anything was sent; the screen enables "Submit" only when a real submit function is injected.
 * A draft written before the module field existed simply reads as "game".
 */
export const FEEDBACK_CATEGORIES = ["suggestion", "bug", "rating"];
/** Which part of the game the feedback is about; "game" = the whole game. */
export const FEEDBACK_MODULES = ["game", "world", "myteam", "career", "gameplay", "custom", "account", "other"];
export const FEEDBACK_NOTE_MAX = 600;
export const DRAFT_KEY_PREFIX = "cls_feedback_draft_v1:";

const store = (storage) => storage ?? globalThis.localStorage ?? null;
const keyOf = (owner) => `${DRAFT_KEY_PREFIX}${owner || "guest"}`;

export const emptyDraft = () => ({ category: "suggestion", module: "game", stars: 0, note: "" });

/** Anything stored or typed is coerced into the draft shape; unknown categories and out-of-range stars are dropped. */
export function normalizeDraft(raw) {
  const d = raw && typeof raw === "object" ? raw : {};
  const stars = Number(d.stars);
  return {
    category: FEEDBACK_CATEGORIES.includes(d.category) ? d.category : "suggestion",
    module: FEEDBACK_MODULES.includes(d.module) ? d.module : "game",
    stars: Number.isInteger(stars) && stars >= 1 && stars <= 5 ? stars : 0,
    note: typeof d.note === "string" ? d.note.slice(0, FEEDBACK_NOTE_MAX) : "",
  };
}

export const isBlankDraft = (draft) => !draft.note.trim() && !draft.stars;

export function readDraft(owner, storage) {
  try {
    const raw = store(storage)?.getItem(keyOf(owner));
    return raw ? normalizeDraft(JSON.parse(raw)) : emptyDraft();
  } catch {
    return emptyDraft();
  }
}

/** A blank draft removes the key. Returns false when the browser refused the write (the player is told, nothing throws). */
export function writeDraft(owner, draft, storage) {
  try {
    const target = store(storage);
    if (!target) return false;
    const clean = normalizeDraft(draft);
    if (isBlankDraft(clean)) target.removeItem(keyOf(owner));
    else target.setItem(keyOf(owner), JSON.stringify(clean));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(owner, storage) {
  try {
    store(storage)?.removeItem(keyOf(owner));
  } catch {
    /* nothing to clear */
  }
}
