/**
 * Cloud save service (DB3): the one object the UI talks to. Local-first: nothing here is needed to play; every method
 * degrades to a status instead of throwing. Auth, transport factory and storage are injected (real Supabase or fakes).
 *   status()            -> what to show (enabled / signed in / linked / last sync / last result)
 *   signUp/signIn/signOut, linkAccount({confirmed})
 *   sync(), restore(), keepLocal()   (restore/keepLocal are the player's explicit conflict choices)
 *   describeConflict()  -> side-by-side summaries of the local and cloud careers
 */
import { importRootSave, readRootSave } from "../data/saveRoot.js";
import { createAccountLinks } from "./accountLink.js";
import { createCloudSync } from "./cloudSync.js";

/** A short, human summary of a career root: enough for the player to tell two saves apart. */
export function summarizeRoot(root) {
  if (!root) return null;
  const p = root.reborn?.player;
  return {
    mode: root.reborn ? "reborn" : root.leagueCareer ? "league" : root.activeMode || "none",
    year: p?.seasonYear ?? null,
    games: Array.isArray(p?.seasonLog) ? p.seasonLog.length : null,
    trust: Number.isFinite(p?.coachTrust) ? p.coachTrust : null,
    role: p?.rotationRole ?? null,
    savedAt: Number.isFinite(root.savedAt) ? root.savedAt : null,
  };
}

export function createCloudService({ storage, auth, makeTransport, localAccountId, now = Date.now }) {
  const links = createAccountLinks(storage);
  let last = null;
  let transport = null;
  const remember = (result) => {
    last = { ...result, at: now() };
    return result;
  };
  const gate = () => {
    const session = auth.session();
    const localId = localAccountId();
    if (!session) return { blocked: "signed-out" };
    if (!localId) return { blocked: "guest" }; // no local account = guest: guests stay local
    if (!links.allows(localId, session.userId)) return { blocked: links.userOf(localId) ? "linked-to-other-user" : "not-linked" };
    return { session, localId };
  };
  const syncer = () => {
    const session = auth.session();
    transport ||= makeTransport();
    const localId = localAccountId();
    // Everything this call will do belongs to THIS cloud user and THIS local account; if either changes while a request is in flight
    // the late answer is dropped (see cloudSync.restore).
    const isCurrent = () => auth.session()?.userId === session.userId && localAccountId() === localId;
    return createCloudSync({ storage, transport, now, userId: session.userId, linkedAccountId: links.localOf(session.userId), isCurrent });
  };
  const guarded = (fn) => async () => {
    const g = gate();
    if (g.blocked) return remember({ status: g.blocked });
    try {
      return remember(await fn());
    } catch (error) {
      return remember({ status: "offline", error: error.message }); // never throw into the UI
    }
  };

  return {
    status() {
      const session = auth.session();
      const g = gate();
      return {
        signedIn: !!session,
        email: session?.email || null,
        blocked: g.blocked || null,
        lastSyncAt: session ? (syncer().state().at ?? null) : null,
        revision: session ? syncer().state().revision : 0,
        last,
      };
    },
    async signUp(credentials) {
      try {
        return await auth.signUp(credentials);
      } catch (error) {
        return { error: error.message };
      }
    },
    async signIn(credentials) {
      try {
        last = null;
        return await auth.signIn(credentials);
      } catch (error) {
        return { error: error.message };
      }
    },
    async signOut() {
      last = null;
      await auth.signOut();
      transport = null;
    },
    /** Attach this device's local account to the signed-in user. Needs the player's explicit yes. */
    linkAccount({ confirmed = false } = {}) {
      const session = auth.session();
      const localId = localAccountId();
      if (!session) return { ok: false, reason: "signed-out" };
      if (!localId) return { ok: false, reason: "guest" };
      return links.link(localId, session.userId, { confirmed });
    },
    sync: guarded(() => syncer().sync()),
    restore: guarded(() => syncer().restore()),
    keepLocal: guarded(() => syncer().keepLocal()),
    /** The two careers side by side (or null parts when one side is empty / unreadable). */
    async describeConflict() {
      const local = summarizeRoot(readRootSave(storage));
      const g = gate();
      if (g.blocked) return { local, cloud: null };
      try {
        transport ||= makeTransport();
        const remote = await transport.get({ slot: "career" });
        // Signed out / switched user while the request was out: never show one user's cloud career under another.
        if (auth.session()?.userId !== g.session.userId || localAccountId() !== g.localId) return { local, cloud: null, stale: true };
        if (!remote) return { local, cloud: null };
        return { local, cloud: { ...summarizeRoot(importRootSave(remote.data)), revision: remote.revision, updatedAt: remote.updatedAt || null } };
      } catch (error) {
        return { local, cloud: null, error: error.message };
      }
    },
  };
}
