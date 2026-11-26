/**
 * A fake backend that behaves like Supabase for what cloudSync needs: auth users with tokens, and a game_saves table
 * where every read and write is scoped to the caller's user id (the RLS + save_put rules from the SQL migration).
 * `auth(...)` has the same interface as js/cloud/auth.js; `transportFor(auth)` the same as supabaseTransport.js.
 */
export function createFakeBackend() {
  const users = new Map(); // email -> { id, password }
  const tokens = new Map(); // token -> user id
  const rows = new Map(); // `${userId}|${slot}` -> row
  let seq = 0;
  const backend = {
    rows,
    offline: false,
    failNext: null,
    auth(storageLike = new Map()) {
      let current = null;
      return {
        async signUp({ email, password }) {
          if (users.has(email)) throw new Error("User already registered");
          users.set(email, { id: `user-${(seq += 1)}`, password });
          return this.signIn({ email, password });
        },
        async signIn({ email, password }) {
          const u = users.get(email);
          if (!u || u.password !== password) throw new Error("Invalid login credentials");
          const token = `tok-${(seq += 1)}`;
          tokens.set(token, u.id);
          current = { userId: u.id, email, token };
          storageLike.set("session", current);
          return { userId: u.id, email };
        },
        async signOut() {
          current = null;
        },
        session: () => (current ? { userId: current.userId, email: current.email } : null),
        async accessToken() {
          if (!current) throw new Error("not signed in");
          return current.token;
        },
      };
    },
    transportFor(auth) {
      const caller = async () => {
        if (backend.offline) throw Object.assign(new Error("network down"), { kind: "offline" });
        let token;
        try {
          token = await auth.accessToken();
        } catch (error) {
          throw Object.assign(error, { kind: "auth" });
        }
        const uid = tokens.get(token);
        if (!uid) throw Object.assign(new Error("cloud request failed (401)"), { kind: "auth" });
        return uid;
      };
      return {
        async get({ slot }) {
          const r = rows.get(`${await caller()}|${slot}`);
          return r ? { revision: r.revision, schemaVersion: r.schemaVersion, data: r.data, updatedAt: r.updatedAt } : null;
        },
        async put({ slot, expectedRevision, schemaVersion, data, idempotencyKey }) {
          const uid = await caller();
          const fail = backend.failNext;
          backend.failNext = null;
          if (fail === "before") throw Object.assign(new Error("network down"), { kind: "offline" });
          const k = `${uid}|${slot}`;
          const r = rows.get(k) || { revision: 0, lastKey: null };
          let out;
          if (r.lastKey === idempotencyKey) out = { revision: r.revision };
          else if (expectedRevision !== r.revision) out = { conflict: true, revision: r.revision };
          else {
            rows.set(k, { revision: r.revision + 1, schemaVersion, data, lastKey: idempotencyKey, updatedAt: "2026-11-26T12:00:00Z" });
            out = { revision: r.revision + 1 };
          }
          if (fail === "after") throw Object.assign(new Error("response lost"), { kind: "offline" });
          return out;
        },
      };
    },
  };
  return backend;
}
