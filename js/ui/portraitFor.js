/** The one place that turns "an account (or guest)" into the portrait to show, so every surface agrees. */
import { readLook } from "../data/avatarLook.js";
import { readPortrait, resolvePortrait } from "../data/avatarPortrait.js";
import { portraitSrc } from "./avatarPortraitArt.js";

/** @returns {{kind, presetId, image, stale, chosen, src}} */
export function portraitFor(account, opts) {
  const resolved = resolvePortrait(readPortrait(account, opts?.store), readLook(account, opts?.store), account?.id || "guest");
  return { ...resolved, src: portraitSrc(resolved) };
}
