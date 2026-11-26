// DB3.1 live verification against a REAL Supabase project (REST only, no browser): Auth + RLS + save_put under real JWTs,
// real PostgREST status mapping and real concurrent transactions. Run it after applying db/migrations/0001_game_saves.sql.
//   SUPABASE_URL=https://<ref>.supabase.co SUPABASE_PUBLISHABLE_KEY=<publishable or anon key> node scripts/db/verify-live.mjs
// Needs "Confirm email" OFF for the throwaway test users (it says so and stops if sign-up returns no session).
// Only the PUBLISHABLE/anon key is ever read; a secret/service_role key is refused. Leaves two throwaway users (cls-live-*@example.com).
import { isSecretKey } from "../../js/cloud/config.js";

const URL_ = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const KEY = process.env.SUPABASE_PUBLISHABLE_KEY || "";
if (!URL_.startsWith("https://") || !KEY) { console.error("Set SUPABASE_URL (https) and SUPABASE_PUBLISHABLE_KEY."); process.exit(2); }
if (isSecretKey(KEY)) { console.error("Refusing: that is a secret / service_role key. Use the publishable (anon) key."); process.exit(2); }

let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);
};
const call = async (path, { method = "GET", token, body, headers = {} } = {}) => {
  const res = await fetch(`${URL_}${path}`, { method, headers: { apikey: KEY, "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* non-JSON error body */ }
  return { status: res.status, json, text };
};
const denied = (r) => r.status === 401 || r.status === 403;
const put = (token, expected, data, key, extra = {}) => call("/rest/v1/rpc/save_put", { method: "POST", token, body: { p_slot: "career", p_expected_revision: expected, p_schema_version: 4, p_data: data, p_idempotency_key: key, ...extra } });
const rows = (token) => call("/rest/v1/game_saves?slot=eq.career&select=user_id,revision,save_data", { token });

const stamp = Date.now().toString(36);
async function register(tag) {
  const email = `cls-live-${tag}-${stamp}@example.com`;
  const password = `pw-${stamp}-${tag}-xyz`;
  const up = await call("/auth/v1/signup", { method: "POST", body: { email, password } });
  if (!up.json?.access_token) { console.error(`Sign-up gave no session (${up.status}: ${up.text.slice(0, 160)}). Turn "Confirm email" off in Auth settings and retry.`); process.exit(2); }
  return { email, password, ...up.json };
}

// ---- real authentication ----
const A = await register("a");
const B = await register("b");
check("registration returns a session with an access and a refresh token", !!A.access_token && !!A.refresh_token && A.user?.id !== B.user?.id);
const login = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: A.email, password: A.password } });
check("login with the right password", login.status === 200 && !!login.json?.access_token);
check("login with a wrong password is refused", (await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: A.email, password: "wrong-password" } })).status === 400);
const refreshed = await call("/auth/v1/token?grant_type=refresh_token", { method: "POST", body: { refresh_token: login.json.refresh_token } });
check("token refresh returns a new access token", refreshed.status === 200 && !!refreshed.json?.access_token && refreshed.json.access_token !== login.json.access_token);
const tokenA = refreshed.json.access_token;
const tokenB = B.access_token;
const logout = await call("/auth/v1/logout", { method: "POST", token: (await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email: B.email, password: B.password } })).json.access_token });
check("logout succeeds", logout.status === 204 || logout.status === 200, String(logout.status));

// ---- anonymous ----
const anonRead = await call("/rest/v1/game_saves?select=*");
check("anonymous read refused", denied(anonRead), `${anonRead.status} ${anonRead.text.slice(0, 80)}`);
check("anonymous save_put refused", denied(await put(undefined, 0, "{}", "anon-1")));
check("anonymous direct insert refused", denied(await call("/rest/v1/game_saves", { method: "POST", body: { user_id: A.user.id, slot: "career", schema_version: 4, revision: 1, save_data: "x", idempotency_key: "k" } })));

// ---- ownership ----
const first = await put(tokenA, 0, '{"who":"A"}', `a-${stamp}-1`);
check("A: first write is revision 1", first.status === 200 && first.json?.revision === 1, first.text.slice(0, 100));
check("A reads exactly their own row", (await rows(tokenA)).json?.length === 1);
check("B sees none of A's rows", (await rows(tokenB)).json?.length === 0);
check("B filtering on A's id still sees nothing", (await call(`/rest/v1/game_saves?user_id=eq.${A.user.id}`, { token: tokenB })).json?.length === 0);
const bPatch = await call(`/rest/v1/game_saves?user_id=eq.${A.user.id}`, { method: "PATCH", token: tokenB, body: { save_data: "hacked" }, headers: { Prefer: "return=representation" } });
check("B cannot modify A's save", denied(bPatch) || (bPatch.status < 300 && (bPatch.json?.length || 0) === 0), `${bPatch.status}`);
const bDelete = await call(`/rest/v1/game_saves?user_id=eq.${A.user.id}`, { method: "DELETE", token: tokenB });
check("B cannot delete A's save (refused, and the row survives: see the intact check below)", denied(bDelete), String(bDelete.status));
check("B cannot insert a row for A", denied(await call("/rest/v1/game_saves", { method: "POST", token: tokenB, body: { user_id: A.user.id, slot: "career", schema_version: 4, revision: 99, save_data: "x", idempotency_key: "k" } })));
const forged = await put(tokenB, 0, '{"who":"B"}', `b-${stamp}-1`, { p_user_id: A.user.id });
check("a forged owner argument is not accepted by save_put", forged.status === 404 || forged.status === 400, `${forged.status} ${forged.text.slice(0, 100)}`);
check("A's save is intact after all of that", (await rows(tokenA)).json?.[0]?.save_data === '{"who":"A"}');
check("B's own first write works", (await put(tokenB, 0, '{"who":"B"}', `b-${stamp}-2`)).json?.revision === 1);

// ---- CAS, idempotency, validation ----
const stale = await put(tokenA, 0, '{"x":1}', `a-${stamp}-s`);
check("stale expected revision -> conflict", stale.json?.conflict === true && stale.json.revision === 1);
check("identical key + payload replays without a new revision", (await put(tokenA, 0, '{"who":"A"}', `a-${stamp}-1`)).json?.revision === 1);
const reuse = await put(tokenA, 1, '{"who":"OTHER"}', `a-${stamp}-1`);
check("identical key + DIFFERENT payload rejected", reuse.status === 400, `${reuse.status} ${reuse.text.slice(0, 100)}`);
check("null expected revision is a conflict, never an overwrite", (await put(tokenA, null, '{"x":2}', `a-${stamp}-n`)).json?.conflict === true);
const huge = await put(tokenA, 1, "x".repeat(4_000_001), `a-${stamp}-h`);
check("over 4,000,000 characters -> HTTP 413", huge.status === 413, String(huge.status));
check("A's content still the original", (await rows(tokenA)).json?.[0]?.save_data === '{"who":"A"}');

// ---- real concurrency: N devices write the same revision at once; exactly one wins ----
const race = await Promise.all(Array.from({ length: 8 }, (_, i) => put(tokenA, 1, `{"race":${i}}`, `a-${stamp}-r${i}`)));
const winners = race.filter((r) => r.json?.revision === 2);
const losers = race.filter((r) => r.json?.conflict === true);
check("8 concurrent writes at revision 1: exactly one applied, seven conflicts", winners.length === 1 && losers.length === 7, `${winners.length} won / ${losers.length} conflicted / ${race.filter((r) => r.status !== 200).length} errors`);
check("the stored revision is 2", (await rows(tokenA)).json?.[0]?.revision === 2);
const firstRace = await Promise.all(Array.from({ length: 6 }, (_, i) => put(B.access_token, 0, `{"first":${i}}`, `b-${stamp}-f${i}`)));
check("concurrent FIRST writes by one user never produce a server error (one wins, the rest conflict)", firstRace.every((r) => r.status === 200), firstRace.map((r) => r.status).join(","));

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
