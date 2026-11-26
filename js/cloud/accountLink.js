/**
 * Local account <-> cloud user mapping (DB2). Local ids never change (saves, owners, shop all reference them); signing in
 * only adds a LINK. Rules: linking needs the player's explicit confirmation; a local account belongs to at most one cloud
 * user and a cloud user to at most one local account on a device; nothing syncs under a user that is not the linked one.
 */
export const LINKS_KEY = "cls_cloud_links_v1";

export function createAccountLinks(storage) {
  const read = () => {
    try {
      const v = JSON.parse(storage.getItem(LINKS_KEY) || "{}");
      return v && typeof v === "object" && !Array.isArray(v) ? v : {};
    } catch {
      return {};
    }
  };
  const write = (links) => storage.setItem(LINKS_KEY, JSON.stringify(links));
  return {
    userOf: (localId) => read()[localId] || null,
    localOf: (userId) => Object.keys(read()).find((id) => read()[id] === userId) || null,
    /** Link localId to userId. Only with `confirmed: true` (the player agreed to move/attach this progress). */
    link(localId, userId, { confirmed = false } = {}) {
      if (!localId || !userId) return { ok: false, reason: "missing-id" };
      const links = read();
      if (links[localId] === userId) return { ok: true, already: true };
      if (links[localId]) return { ok: false, reason: "account-linked-to-other-user" };
      const owner = Object.keys(links).find((id) => links[id] === userId);
      if (owner) return { ok: false, reason: "user-linked-to-other-account", localId: owner };
      if (!confirmed) return { ok: false, reason: "needs-confirmation" };
      write({ ...links, [localId]: userId });
      return { ok: true };
    },
    unlink(localId) {
      const { [localId]: _gone, ...rest } = read();
      write(rest);
    },
    /** May this local account sync under this signed-in user? */
    allows: (localId, userId) => !!localId && !!userId && read()[localId] === userId,
  };
}
