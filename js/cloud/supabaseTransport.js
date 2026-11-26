/**
 * Supabase transport for cloudSync (PostgREST + the save_put RPC from db/migrations/0001_game_saves.sql).
 * Row Level Security does the isolation: with the user's token the table only ever shows that user's rows, and
 * save_put writes only for auth.uid(). Anonymous calls (no token) are refused before any request is made.
 */
/** Errors carry a `kind` that cloudSync turns into a status: offline | auth | rejected | too-large. */
const classified = (kind, message) => Object.assign(new Error(message), { kind });
const KIND_BY_STATUS = { 401: "auth", 403: "auth", 413: "too-large" };

export function createSupabaseTransport({ url, key, auth, fetch: doFetch = globalThis.fetch }) {
  async function request(path, init = {}) {
    let token;
    try {
      token = await auth.accessToken();
    } catch (error) {
      throw classified("auth", error.message);
    }
    let res;
    try {
      res = await doFetch(`${url}${path}`, {
        ...init,
        headers: { apikey: key, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...init.headers },
      });
    } catch (error) {
      throw classified("offline", error.message); // fetch itself failed: no network / DNS / CORS
    }
    if (!res.ok) throw classified(KIND_BY_STATUS[res.status] || (res.status >= 500 ? "offline" : "rejected"), `cloud request failed (${res.status})`);
    return res.json();
  }
  return {
    async get({ slot }) {
      const rows = await request(`/rest/v1/game_saves?slot=eq.${encodeURIComponent(slot)}&select=revision,schema_version,save_data,updated_at`);
      const row = rows[0];
      return row ? { revision: row.revision, schemaVersion: row.schema_version, data: row.save_data, updatedAt: row.updated_at } : null;
    },
    async put({ slot, expectedRevision, schemaVersion, data, idempotencyKey }) {
      return request("/rest/v1/rpc/save_put", {
        method: "POST",
        body: JSON.stringify({ p_slot: slot, p_expected_revision: expectedRevision, p_schema_version: schemaVersion, p_data: data, p_idempotency_key: idempotencyKey }),
      });
    },
  };
}
