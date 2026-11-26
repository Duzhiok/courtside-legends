// Real-Postgres check of db/migrations/0001_game_saves.sql (PGlite = actual Postgres compiled to WASM; not a JS imitation of the SQL).
// It recreates what Supabase provides around the migration: roles anon/authenticated, auth.users, auth.uid() reading the JWT subject,
// and Supabase's DEFAULT grants (new public objects are granted to anon/authenticated) -- applied BEFORE the migration, which is
// exactly the trap the migration's explicit revokes exist for. Then it exercises the security contract as each role.
// What PGlite cannot show (one connection = no real concurrent transactions; no PostgREST status mapping; no real JWTs) is covered
// by scripts/db/verify-live.mjs against the real project.
// Usage: node scripts/db/verify-save-put.mjs   (needs @electric-sql/pglite: PGLITE_DIR=/tmp/pgtest/node_modules by default)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

const dir = process.env.PGLITE_DIR || "/tmp/pgtest/node_modules";
const { PGlite } = await import(pathToFileURL(createRequire(`${dir}/`).resolve("@electric-sql/pglite")).href);
const db = new PGlite();
const MIGRATION = readFileSync(process.env.MIGRATION || new URL("../../db/migrations/0001_game_saves.sql", import.meta.url), "utf8"); // MIGRATION=<file> checks another version
let failed = 0;
const check = (label, ok, detail = "") => {
  if (!ok) failed += 1;
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${detail !== "" ? ` — ${detail}` : ""}`);
};

const A = "11111111-1111-1111-1111-111111111111";
const B = "22222222-2222-2222-2222-222222222222";

await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable
    as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated;
  grant execute on function auth.uid() to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant execute on functions to anon, authenticated;
  insert into auth.users values ('${A}'), ('${B}');
`);
await db.exec(MIGRATION);

/** Run one statement as a role (anon | authenticated) with a JWT subject (or none). Returns { rows } or { error: {code,message} }. */
async function as(role, sub, sql, params = []) {
  await db.exec(`set role ${role}; select set_config('request.jwt.claim.sub', '${sub || ""}', false);`);
  try {
    return { rows: (await db.query(sql, params)).rows };
  } catch (e) {
    return { error: { code: e.code, message: e.message } };
  } finally {
    await db.exec("reset role");
  }
}
const put = (sub, expected, data, key, { slot = "career", schema = 4, role = "authenticated" } = {}) =>
  as(role, sub, "select public.save_put($1, $2, $3, $4, $5) as r", [slot, expected, schema, data, key]);
const result = (x) => x.rows?.[0]?.r;

// --- anonymous: no read, no write, no RPC ---
const anonRead = await as("anon", null, "select * from public.game_saves");
check("anonymous cannot read the table", !!anonRead.error && anonRead.error.code === "42501", anonRead.error?.message);
const anonRpc = await put(null, 0, "{}", "k0", { role: "anon" });
check("anonymous cannot execute save_put (anon EXECUTE revoked, not just PUBLIC)", anonRpc.error?.code === "42501", anonRpc.error?.message);
const anonInsert = await as("anon", null, `insert into public.game_saves values ('${A}','career',4,1,'x','k')`);
check("anonymous cannot insert directly", anonInsert.error?.code === "42501", anonInsert.error?.message);
const noSub = await put(null, 0, "{}", "k0");
check("an authenticated role without a subject (no auth.uid) is refused with 28000", noSub.error?.code === "28000", noSub.error?.message);

// --- happy path + ownership ---
check("A: first write is revision 1", result(await put(A, 0, '{"who":"A"}', "a1"))?.revision === 1);
check("A: next write with the right revision is 2", result(await put(A, 1, '{"who":"A2"}', "a2"))?.revision === 2);
const aRead = await as("authenticated", A, "select user_id, revision, save_data from public.game_saves");
check("A sees only A's row", aRead.rows?.length === 1 && aRead.rows[0].user_id === A && aRead.rows[0].revision === 2);
check("B sees nothing of A's", (await as("authenticated", B, "select * from public.game_saves")).rows?.length === 0);
check("B cannot read A's row even by filtering on A's id", (await as("authenticated", B, `select * from public.game_saves where user_id = '${A}'`)).rows?.length === 0);
for (const [label, sql] of [
  ["update", `update public.game_saves set save_data = 'hacked' where user_id = '${A}'`],
  ["delete", `delete from public.game_saves where user_id = '${A}'`],
  ["insert as someone else", `insert into public.game_saves values ('${A}','career',4,9,'x','k9')`],
]) {
  const r = await as("authenticated", B, sql);
  check(`B cannot ${label} A's save (no write privilege at all)`, r.error?.code === "42501", r.error?.message);
}
const ownA = await as("authenticated", A, `update public.game_saves set save_data = 'direct' where user_id = '${A}'`);
check("even the owner cannot write the table directly (only through save_put)", ownA.error?.code === "42501");
// forged ownership: save_put has no owner parameter, and the function resolves the owner from auth.uid() only
const forged = await as("authenticated", B, "select public.save_put('career', 0, 4, '{\"who\":\"B\"}', 'b1', $1) as r", [A]);
check("a forged extra owner argument matches no function signature", !!forged.error && forged.error.code === "42883", forged.error?.message);
check("B's own first write lands under B", result(await put(B, 0, '{"who":"B"}', "b1"))?.revision === 1);
const owners = (await db.query("select user_id, save_data from public.game_saves order by user_id")).rows;
check("two rows, each under its own user, A's content untouched", owners.length === 2 && owners[0].user_id === A && owners[0].save_data === '{"who":"A2"}' && owners[1].user_id === B);

// --- compare-and-swap ---
const stale = result(await put(A, 1, '{"x":1}', "a3"));
check("stale expected revision -> conflict with the current revision, nothing written", stale?.conflict === true && stale.revision === 2);
check("expected_revision NULL on an existing save is a conflict, not an overwrite", result(await put(A, null, '{"x":2}', "a4"))?.conflict === true);
check("first-write claim (expected 0) on an existing save is a conflict", result(await put(A, 0, '{"x":3}', "a5"))?.conflict === true);
check("new user claiming a non-zero revision is a conflict, no row created", result(await put("33333333-3333-3333-3333-333333333333", 5, "{}", "z1"))?.conflict === true);
await db.exec(`insert into auth.users values ('33333333-3333-3333-3333-333333333333') on conflict do nothing`);
check("...and still no row for that user", (await db.query("select 1 from public.game_saves where user_id = '33333333-3333-3333-3333-333333333333'")).rows.length === 0);
check("A's save is still revision 2 with the original content", (await db.query(`select revision, save_data from public.game_saves where user_id='${A}'`)).rows[0].save_data === '{"who":"A2"}');

// --- idempotency ---
check("same key + same payload replays the same revision (no double bump)", result(await put(A, 1, '{"who":"A2"}', "a2"))?.revision === 2);
check("...revision still 2", (await db.query(`select revision from public.game_saves where user_id='${A}'`)).rows[0].revision === 2);
const reuse = await put(A, 1, '{"who":"DIFFERENT"}', "a2");
check("same key + DIFFERENT payload is rejected (22023)", reuse.error?.code === "22023", reuse.error?.message);
check("...and nothing changed", (await db.query(`select save_data from public.game_saves where user_id='${A}'`)).rows[0].save_data === '{"who":"A2"}');

// --- validation ---
check("unknown slot rejected", (await put(A, 2, "{}", "s1", { slot: "other" })).error?.code === "22023");
check("null payload rejected", (await put(A, 2, null, "s2")).error?.code === "22023");
check("schema_version 0 rejected", (await put(A, 2, "{}", "s3", { schema: 0 })).error?.code === "22023");
const big = await put(A, 2, "x".repeat(4_000_001), "s4");
check("payload over 4,000,000 characters rejected with PT413 (PostgREST -> HTTP 413)", big.error?.code === "PT413", big.error?.message);
check("exactly 4,000,000 is accepted", result(await put(A, 2, "y".repeat(4_000_000), "s5"))?.revision === 3);
const older = await put(A, 3, "{}", "s6", { schema: 3 });
check("a write with an OLDER schema than the stored one is rejected (no silent downgrade)", older.error?.code === "22023", older.error?.message);
check("a newer schema is accepted", result(await put(A, 3, '{"v":5}', "s7", { schema: 5 }))?.revision === 4);

// --- function properties (SECURITY DEFINER review) ---
const meta = (await db.query(`select prosecdef, proconfig, pg_get_userbyid(proowner) as owner, has_function_privilege('anon','public.save_put(text,integer,integer,text,text)','execute') as anon_exec, has_function_privilege('authenticated','public.save_put(text,integer,integer,text,text)','execute') as auth_exec, has_function_privilege('public','public.save_put(text,integer,integer,text,text)','execute') as public_exec from pg_proc where proname='save_put'`)).rows[0];
check("save_put is SECURITY DEFINER with an empty, fixed search_path", meta.prosecdef === true && JSON.stringify(meta.proconfig) === '["search_path=\\"\\""]', JSON.stringify(meta.proconfig));
check("EXECUTE: authenticated yes; anon no; PUBLIC no", meta.auth_exec && !meta.anon_exec && !meta.public_exec);
const tbl = (await db.query(`select has_table_privilege('anon','public.game_saves','select') a_s, has_table_privilege('authenticated','public.game_saves','select') u_s, has_table_privilege('authenticated','public.game_saves','insert') u_i, has_table_privilege('authenticated','public.game_saves','update') u_u, has_table_privilege('authenticated','public.game_saves','delete') u_d, (select relrowsecurity from pg_class where relname='game_saves') rls`)).rows[0];
check("table: anon none; authenticated SELECT only; RLS on", !tbl.a_s && tbl.u_s && !tbl.u_i && !tbl.u_u && !tbl.u_d && tbl.rls);
check("the migration is idempotent to re-run", !(await db.exec(MIGRATION).then(() => null, (e) => e)));

console.log(failed ? `\n${failed} FAILED` : "\nALL PASS");
process.exit(failed ? 1 : 0);
