/**
 * Which avatar renderer a screen mounts: one place, so My World and the duel preview can never disagree.
 *
 * Order: the URL override (`?avatar=3d` / `2d` / `2d-proto`, for QA) > this device's saved choice (the My World toggle) >
 * the default, 2D. The saved choice is a device preference in localStorage: it is not part of the account save, so it adds
 * no persisted account field and never travels between devices.
 */
import { mountAvatar3d } from "./avatar3d.js";
import { avatarRenderer, mountAvatar2d, mountAvatar2dProto } from "./avatar2d/avatar2dRenderer.js";

export const RENDERER_PREF_KEY = "cls_avatar_renderer_v1";

const MOUNTS = { "2d": mountAvatar2d, "2d-proto": mountAvatar2dProto, "3d": mountAvatar3d };
const store = (storage) => storage ?? globalThis.localStorage ?? null;

/** The saved device choice: "2d" | "3d" | null (nothing saved, or storage unavailable / holds junk). */
export function readRendererPref(storage) {
  try {
    const v = store(storage)?.getItem(RENDERER_PREF_KEY);
    return v === "2d" || v === "3d" ? v : null;
  } catch {
    return null;
  }
}

/** Save the device choice. Returns false when storage refuses (private mode): the toggle then simply does not stick. */
export function writeRendererPref(choice, storage) {
  if (choice !== "2d" && choice !== "3d") return false;
  try {
    store(storage)?.setItem(RENDERER_PREF_KEY, choice);
    return !!store(storage);
  } catch {
    return false;
  }
}

/** True when the URL forces a renderer (then the My World toggle has nothing to decide, so it is hidden). */
export const hasRendererOverride = (search) => /[?&]avatar=/.test(String(search || ""));

/** "2d" | "3d" | "2d-proto" for this page load. */
export const chosenRenderer = (search, storage) => avatarRenderer(search, readRendererPref(storage));

/** The mount function for this page load (same `(container, opts) => Promise<handle>` contract for every renderer). */
export const chooseAvatarMount = (search = globalThis.location?.search, storage) => MOUNTS[chosenRenderer(search, storage)] || mountAvatar2d;

/**
 * Can a figure that is already on screen be kept through a re-render of its panel instead of being built again? Putting a 2D figure
 * together costs ~80 ms (260 ms on a phone) and the home screen re-rendered My World several times while starting up. Only when it is
 * a 2D canvas whose look, jersey and renderer choice are EXACTLY what it was mounted with: `mountedKey` is cleared whenever the figure
 * is touched (a slider preview, an edit), so a preview that was never saved can never survive a re-render.
 * @param {{renderer?: string, canvas?: unknown}|null} handle the mounted figure
 * @param {string|null} mountedKey describes what it was built from, null once it was changed since
 * @param {string} nowKey describes what the panel would build now
 */
export const canReuseViewer = (handle, mountedKey, nowKey) => !!handle && handle.renderer === "2d" && !!handle.canvas && mountedKey != null && mountedKey === nowKey;

