/**
 * The account side of the collection (J1 + the J3 projection). Reuses the shop for everything it already does:
 * gold, ownership and the single-save purchase live in js/data/shop.js; this module adds the jersey views on top.
 *
 *   account.shop.owned[`jersey-<templateId>`]  bought replicas (permanent, via purchaseShopItem)
 *   account.shop.equippedJersey                the owned key being worn, or null
 *   account.jerseyCollection                   exchange jerseys earned in a Reborn run, deduped by instance id
 *
 * An "owned key" is the shop item id for a bought jersey and the instance id for an exchange jersey, so the two never
 * collide. Equipping records the choice only: the avatar renderer does not draw jersey templates yet (see the doc).
 */
import { saveAccount } from "../data/account.js";
import { getShop } from "../data/shop.js";
import { SHOP_ITEMS } from "../data/shopCatalog.js";
import { getJerseyTemplate } from "./jerseyCatalog.js";

const jerseyItems = () => SHOP_ITEMS.filter((i) => i.effect?.type === "jersey");

/** Merge incoming instances into an existing list by id; the first one seen wins (idempotent). */
export function mergeJerseyInstances(existing, incoming) {
  const out = Array.isArray(existing) ? existing.filter((j) => j && j.id) : [];
  const seen = new Set(out.map((j) => j.id));
  let added = 0;
  for (const j of incoming || []) {
    if (!j?.id || seen.has(j.id)) continue;
    seen.add(j.id);
    out.push(structuredClone(j));
    added += 1;
  }
  return { list: out, added };
}

/**
 * Project a run's kept jerseys onto the account. Calling it twice changes nothing. Mutates `account.jerseyCollection`
 * and returns how many were new; the caller saves (same contract as mirrorRivalriesToAccount).
 */
export function mirrorJerseysToAccount(account, state) {
  if (!account) return 0;
  const { list, added } = mergeJerseyInstances(account.jerseyCollection, state?.collection);
  if (added) account.jerseyCollection = list;
  return added;
}

/** Every jersey the account owns, newest exchange first after the bought ones: [{ key, source, template, instance }]. */
export function listOwnedJerseys(account) {
  if (!account) return [];
  const owned = getShop(account).owned;
  const bought = jerseyItems()
    .filter((i) => owned[i.id])
    .map((i) => ({ key: i.id, source: "shop", template: getJerseyTemplate(i.effect.templateId), instance: null }))
    .filter((j) => j.template);
  const exchanged = (Array.isArray(account.jerseyCollection) ? account.jerseyCollection : [])
    .filter((j) => j && j.id && j.template)
    .map((j) => ({ key: j.id, source: "exchange", template: j.template, instance: j }));
  return [...bought, ...exchanged.reverse()];
}

/** The template of the worn jersey, or null (nothing worn, or the worn key is no longer in the collection). */
export function equippedJerseyTemplate(account) {
  const key = equippedJerseyKey(account);
  return key ? listOwnedJerseys(account).find((j) => j.key === key)?.template || null : null;
}

/** The owned key currently worn, or null (and null again if the item is no longer owned). */
export function equippedJerseyKey(account) {
  const key = account ? getShop(account).equippedJersey : null;
  return key && listOwnedJerseys(account).some((j) => j.key === key) ? key : null;
}

/** Wear an owned jersey (records the choice; the renderer shows a simplified preview). */
export function equipJersey(account, key) {
  if (!account) return { ok: false, reason: "guest" };
  if (!listOwnedJerseys(account).some((j) => j.key === key)) return { ok: false, reason: "not-owned" };
  account.shop = { ...getShop(account), equippedJersey: key };
  saveAccount(account);
  return { ok: true, key };
}

/** Take the worn jersey off. */
export function unequipJersey(account) {
  if (!account) return { ok: false, reason: "guest" };
  if (!getShop(account).equippedJersey) return { ok: false, reason: "not-equipped" };
  account.shop = { ...getShop(account), equippedJersey: null };
  saveAccount(account);
  return { ok: true };
}

/** Full provenance of one owned jersey (shop purchase or exchange story), or null. */
export function getJerseyProvenance(account, key) {
  const j = listOwnedJerseys(account).find((x) => x.key === key);
  if (!j) return null;
  if (j.source === "exchange") return { source: "exchange", signed: j.instance.signed === true, ...j.instance.provenance, template: j.template };
  const bought = (getShop(account).purchases || []).find((p) => p.itemId === key);
  return { source: "shop", signed: false, boughtAt: bought?.at ?? null, template: j.template };
}
