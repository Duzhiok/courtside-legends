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
5. Real-service checks to run once (this is what the fake cannot prove):
   - sign up, link, sync from two browsers; the conflict panel shows both saves;
   - user B cannot read user A's row (RLS) and an anonymous request is refused;
   - two concurrent `save_put` calls with the same expected revision: exactly one wins, the other gets `conflict`;
   - the same call retried with the same idempotency key does not bump the revision twice;
   - `save_data` over 4,000,000 characters is rejected and the game reports "too large".
6. CSP: `connect-src` now allows `https://*.supabase.co` (index.html, online.html, preview-3d-match.html). A custom Supabase domain needs
   its own entry, in all three pages and in `tests/cspReadiness.test.js`.

Decisions in force: guests stay local; cloud needs sign-in; a conflict is never resolved silently (the player picks; the replaced save is
backed up first); linking a local account to a cloud user needs an explicit confirm; no automatic merge in v1; offline never blocks play.
