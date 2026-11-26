# Cloud save — connecting a real Supabase project

Status: DB1–DB3 code is done and dormant (feature flag off). Verified against a faithful fake (`scripts/qa/cloud-save.mjs`,
`tests/cloud*.test.js`); **not yet verified against a real Postgres / RLS / Auth** — that is step 5 below.

1. Create the project (`courtside-legends-dev`). Keep the database password out of Git.
2. Auth → Providers: enable Email. For the first test, turn "Confirm email" off (otherwise sign-up answers "check your e-mail"
   and the player must confirm before signing in; the game handles both).
3. SQL editor: run `db/migrations/0001_game_saves.sql` (table, select-own RLS policy, `save_put` RPC).
4. Turn the cloud on in a browser (nothing is committed; the key is the **publishable/anon** key, never `service_role` / `sb_secret_…` —
   the game refuses a secret key outright):
   ```js
   localStorage.setItem("cls_cloud_flag_v1", "1");
   localStorage.setItem("cls_cloud_config_v1", JSON.stringify({ url: "https://<ref>.supabase.co", key: "<publishable key>" }));
   ```
   (`?cloud=1` also works for the flag.) My World then shows the cloud panel.
5. Real-service checks (DB3.1), in this order. Only the publishable key is ever used; the scripts refuse a secret key:
   - `node scripts/db/verify-save-put.mjs` — no project needed: runs the migration on real Postgres (PGlite) with Supabase's default
     grants and checks RLS/RPC security. 38 checks. The ORIGINAL migration fails 20 of them (anon could execute save_put; a NULL expected
     revision overwrote an existing save; same key + different payload was accepted; no 413; no downgrade guard).
   - Apply `db/migrations/0001_game_saves.sql` in the Supabase SQL editor.
   - `SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… node scripts/db/verify-live.mjs` — real Auth (register/login/refresh/logout), anonymous and
     cross-user denial, forged owner, 8 truly concurrent writers (exactly one wins), idempotent retry, key reuse, 413.
   - `SUPABASE_URL=… SUPABASE_PUBLISHABLE_KEY=… node scripts/qa/cloud-save.mjs http://127.0.0.1:5551/ /tmp/cls-qa/cloud-live` — two real
     browser contexts through the real project: link, sync, conflict, restore + backup, offline recovery.
6. CSP: `connect-src` now allows `https://*.supabase.co` (index.html, online.html, preview-3d-match.html). A custom Supabase domain needs
   its own entry, in all three pages and in `tests/cspReadiness.test.js`.

Decisions in force: guests stay local; cloud needs sign-in; a conflict is never resolved silently (the player picks; the replaced save is
backed up first); linking a local account to a cloud user needs an explicit confirm; no automatic merge in v1; offline never blocks play.
