/**
 * Supabase Auth over plain fetch (GoTrue REST; no SDK, nothing to bundle). Injectable `fetch` and `storage`, so it is
 * unit-testable. The session (tokens) lives in storage under SESSION_KEY; only the publishable key is ever used.
 * Interface (shared with the test fake):  signUp / signIn / signOut / session() / accessToken()
 */
export const SESSION_KEY = "cls_cloud_session_v1";
const EXPIRY_SKEW_MS = 30_000;

export function createSupabaseAuth({ url, key, fetch: doFetch = globalThis.fetch, storage, now = Date.now }) {
  const headers = { apikey: key, "Content-Type": "application/json" };
  const read = () => {
    try {
      return JSON.parse(storage.getItem(SESSION_KEY) || "null");
    } catch {
      return null;
    }
  };
  const write = (s) => (s ? storage.setItem(SESSION_KEY, JSON.stringify(s)) : storage.removeItem(SESSION_KEY));

  async function call(path, body, token) {
    const res = await doFetch(`${url}/auth/v1${path}`, {
      method: "POST",
      headers: token ? { ...headers, Authorization: `Bearer ${token}` } : headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    if (!res.ok) throw new Error(json.msg || json.error_description || json.message || `auth failed (${res.status})`);
    return json;
  }

  const toSession = (j) => ({
    accessToken: j.access_token,
    refreshToken: j.refresh_token,
    expiresAt: now() + (Number(j.expires_in) || 3600) * 1000,
    userId: j.user?.id,
    email: j.user?.email || null,
  });

  async function enter(path, body) {
    const j = await call(path, body);
    if (!j.access_token) return { needsConfirmation: true }; // sign-up with e-mail confirmation on: no session yet
    const s = toSession(j);
    write(s);
    return { userId: s.userId, email: s.email };
  }

  return {
    signUp: ({ email, password }) => enter("/signup", { email, password }),
    signIn: ({ email, password }) => enter("/token?grant_type=password", { email, password }),
    async signOut() {
      const s = read();
      write(null); // local first: signing out must work offline
      if (s) await call("/logout", null, s.accessToken).catch(() => {});
    },
    session() {
      const s = read();
      return s ? { userId: s.userId, email: s.email } : null;
    },
    /** A valid access token, refreshed when it is about to expire. Throws "not signed in" when there is no session. */
    async accessToken() {
      const s = read();
      if (!s) throw new Error("not signed in");
      if (s.expiresAt - EXPIRY_SKEW_MS > now()) return s.accessToken;
      const j = await call("/token?grant_type=refresh_token", { refresh_token: s.refreshToken });
      const next = toSession({ ...j, user: j.user || { id: s.userId, email: s.email } });
      write(next);
      return next.accessToken;
    },
  };
}
