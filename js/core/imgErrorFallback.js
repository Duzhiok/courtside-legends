/**
 * S-P2-5 step 1 (CSP readiness): <img> error fallbacks without inline onerror
 * attributes.
 *
 * A Content-Security-Policy without 'unsafe-inline' blocks inline event-handler
 * attributes, so the three <img> fallbacks that used to be inline onerror strings in
 * templates now declare their intent with data attributes instead, and one
 * capture-phase listener handles them all (`error` events do not bubble, but a
 * capture listener on document sees every <img> failure, including imgs inserted
 * later via innerHTML):
 *
 * - data-fb="<uri>": the photo.js retry-then-fallback (a failed remote photo is
 *   retried once with a cache-busting query, then the generated avatar takes over).
 * - data-dim-on-error: the 2D court token dims instead of vanishing.
 * - data-remove-on-error: the duel photo removes itself.
 *
 * `.onerror` property assignments (IndexedDB requests, Image objects) are NOT inline
 * handlers and are unaffected by CSP, so they stay where they are.
 */

const RETRY_DELAY_MS = 1200;

/**
 * Run the fallback for one failed <img> (real element or a { src, dataset } fake
 * in tests). Returns true when a data-* marker claimed the img, false otherwise.
 * `schedule` is injectable so tests can capture the retry timer instead of
 * waiting 1200ms; production passes the real setTimeout.
 */
export function handleImgError(img, { retryDelayMs = RETRY_DELAY_MS, schedule = setTimeout } = {}) {
  if (!img || typeof img.src !== "string" || !img.dataset) return false;
  if (img.dataset.fb !== undefined) {
    if (!img.dataset.rt && /^https?:/.test(img.src)) {
      img.dataset.rt = "1";
      const src = img.src;
      schedule(() => {
        img.src = src + (src.indexOf("?") < 0 ? "?" : "&") + "r=1";
      }, retryDelayMs);
    } else if (img.dataset.fb) {
      img.src = img.dataset.fb;
      img.dataset.fb = "";
    }
    return true;
  }
  if (img.dataset.dimOnError !== undefined) {
    if (img.style) img.style.opacity = "0.2";
    return true;
  }
  if (img.dataset.removeOnError !== undefined) {
    img.remove?.();
    return true;
  }
  return false;
}

let installed = false;

/** Install the single capture-phase listener (idempotent; no-op without a DOM). */
export function installImgErrorFallback() {
  if (installed) return false;
  if (typeof document === "undefined" || !document.addEventListener) return false;
  installed = true;
  document.addEventListener(
    "error",
    (event) => {
      if (event.target?.tagName === "IMG") handleImgError(event.target);
    },
    true,
  );
  return true;
}
