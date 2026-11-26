/**
 * Cloud feature flag + config (DB2). The cloud is OFF unless the flag is set AND a config with a public URL + key exists.
 * Sources (no credentials are ever committed): localStorage `cls_cloud_flag_v1` = "1" (or `?cloud=1` in the URL) and
 * localStorage `cls_cloud_config_v1` = {"url": "...", "key": "<publishable/anon key>"} (or globalThis.CLS_CLOUD).
 * A key that is a SECRET (service_role JWT or an `sb_secret_...` key) is refused outright: it must never run in a browser.
 */
export const CLOUD_FLAG_KEY = "cls_cloud_flag_v1";
export const CLOUD_CONFIG_KEY = "cls_cloud_config_v1";

export function isSecretKey(key) {
  if (typeof key !== "string") return false;
  if (key.startsWith("sb_secret_")) return true;
  const parts = key.split(".");
  if (parts.length !== 3) return false;
  try {
    return JSON.parse(atob(parts[1].replace(/-/g, "+").replace(/_/g, "/"))).role === "service_role";
  } catch {
    return false;
  }
}

const readJson = (storage, key) => {
  try {
    return JSON.parse(storage.getItem(key) || "null");
  } catch {
    return null;
  }
};

/** `{ url, key }` when the cloud may run; otherwise `{ off: reason }`. Never throws. */
export function cloudConfig(storage, { search = "", globals = globalThis } = {}) {
  const flagged = storage.getItem(CLOUD_FLAG_KEY) === "1" || /(?:^|[?&])cloud=1(?:&|$)/.test(search);
  if (!flagged) return { off: "flag" };
  const raw = readJson(storage, CLOUD_CONFIG_KEY) || globals.CLS_CLOUD || null;
  const url = typeof raw?.url === "string" ? raw.url.replace(/\/+$/, "") : "";
  const key = typeof raw?.key === "string" ? raw.key : "";
  if (!/^https:\/\/[^/\s]+$/.test(url) || !key) return { off: "config" };
  if (isSecretKey(key)) return { off: "secret-key" };
  return { url, key };
}
