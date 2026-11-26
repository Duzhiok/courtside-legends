/** The app's single cloud service, or null when the feature flag/config says the cloud is off (the default). */
import { getActiveAccountId } from "../data/account.js";
import { createSupabaseAuth } from "./auth.js";
import { cloudConfig } from "./config.js";
import { createCloudService } from "./cloudService.js";
import { createSupabaseTransport } from "./supabaseTransport.js";

let resolved = false;
let service = null;

export function getCloudService({ storage = globalThis.localStorage, search = globalThis.location?.search || "" } = {}) {
  if (resolved) return service;
  resolved = true;
  let cfg = { off: "storage" };
  try {
    cfg = cloudConfig(storage, { search });
  } catch {
    /* storage unavailable: the cloud stays off, the game is unaffected */
  }
  if (cfg.off) return service;
  const auth = createSupabaseAuth({ url: cfg.url, key: cfg.key, storage });
  service = createCloudService({
    storage,
    auth,
    makeTransport: () => createSupabaseTransport({ url: cfg.url, key: cfg.key, auth }),
    localAccountId: getActiveAccountId,
  });
  return service;
}
