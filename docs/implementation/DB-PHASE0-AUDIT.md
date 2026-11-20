# DB Phase 0 — persistence audit (2026-11-20, code-puppy-d8e9bb)

Read-only audit of `origin/main`. No production code changed. Goal: decide what a database foundation has to look like **given what
the code really does today**, before any schema is written.

## Verdict

PostgreSQL with versioned JSONB saves is still the right target. But three facts in the code change the plan from "add a database":

1. **There is already a backend, and it is duel-only** (`server/online-*.mjs`, 1519 lines): a WebSocket server with its own accounts,
   Elo, a duel economy and prize ledger, persisted as **JSON files in the user's home directory** (`~/.courtside-online-*.json`,
   whole-file rewrite, sessions in memory, single process). It is a candidate to move to Postgres *later*; it is not the place to start.
2. **Local accounts have no authentication at all.** `createAccount(name)` stores a name and a random id in `localStorage`
   (`cls_accounts_v1`). The online server has a *different* account system (name + scrypt password). Two identities, unrelated.
   Cloud saves need a real identity, so this is the first thing to design, not an afterthought.
3. **Gold, rewards and ranked results are computed in the browser.** A "server-authoritative economy" is therefore a change of trust
   boundary, not a schema change. Until the server can replay or run the match, a cloud wallet is *synced, not trusted*, and must not
   back a leaderboard or anything competitive.

## What is stored where today

| Data | Where (key / store) | Format / version | Authoritative? | Sync? |
|---|---|---|---|---|
| Accounts: name, gold, `playerIds`, `cardMods`, coaches, daily draw, shop, jerseys, avatar look/portrait, legacy museum | `localStorage` `cls_accounts_v1` (+ `cls_active_account`, corrupt copy `cls_accounts_v1_corrupt`) | `{ accounts: [...] }`, **no schema version** (only corrupt-store quarantine) | yes (client) | yes, per account, **after a version field is added** |
| Long career / Reborn root | `cls_root_v3` (+ `cls_root_v3_tmp`, `cls_root_v3_backup`) | `ROOT_SAVE_VERSION = 4`, min readable 3, migration in `saveMigration.js`; Reborn has `version: 1` | yes | **first slice** |
| Mid-game autosave | `cls_savegame_v1` | `v: 1` (`SAVE_VERSION`), embeds `sim.exportState()` | yes | later; a live match is device-bound |
| Quick single season | `cls_season_v1` | own shape | yes | later |
| My Team season | `cls_myteam_season_v1` | own shape | yes | later |
| Save ownership (who owns each device slot) | `cls_save_owners_v1` | `{owner, sig}` per slot, owner = account id / `guest` / `null` | device metadata | maps to cloud ownership, see below |
| Guest data | `cls_guest_avatar_v1`, `cls_guest_portrait_v1`, `cls_guest_profile_v1`, `cls_guest_hometown_v1`, `cls_challenge_archive_v1` | small JSON | yes, guest only | never: guests stay local |
| Duel record, duel avatar, online record | `cls_duel_record_v1`, `cls_duel_avatar_v1`, `courtside-online-record` | small | client copy; server has the real one | server wins |
| Roster / processed cards cache | IndexedDB `courtside-legends` (`rosterCache.js`) + `courtside-roster-cache-key` | rebuilt from `roster.json` | **no, a cache** | **never sync** |
| Preferences | `courtside.lang`, `cls_avatar_renderer_v1`, `courtside-court-effects`, `courtside-simple-players`, audio keys | tiny | device-local | never |
| Feedback drafts / attachments | `cls_feedback_draft_v1:*`, IndexedDB store | small / blobs | device-local | never |

Save ownership is an existing, deliberate design (ADR-008a Q1): a save is read-only to everyone but its owner, an unassociated save can
be claimed only after explicit confirmation, **nothing replaces another identity's save silently**. Cloud sync has to preserve that,
not bypass it.

**Not measured:** per-key byte sizes and write frequency of a played-through season. Fixtures do not represent them; Phase 1 must
measure them from a real run before choosing chunking. Known risk: every key above shares one origin's ~5 MB `localStorage` quota,
so cloud storage is also capacity relief.

## Consequences for the design

- **Identity first.** Use a hosted auth provider (Supabase Auth) for cloud identity. Guests remain local-only. Signing in creates a
  *link* `cloud user <-> local account id`; it never rewrites local ids (saves, owners, shop all reference them).
- **Conflicts never overwrite silently** (same principle as `saveOwnership`). Writes are compare-and-swap on `revision`; a stale write is
  rejected and the player chooses local vs cloud (or keeps both). No last-writer-wins.
- **Prerequisite found:** the account store has no schema version, so it cannot be migrated safely once copies live in the cloud. Add a
  version field (read old = version 0) before the account slice, not after.
- **Idempotent writes.** Every write carries a client-generated idempotency key, so a retried/interrupted upload cannot double-apply.
- **Cloud is a backup and a transfer channel for the three durable save kinds first; the roster cache, preferences, drafts and
  guest data never leave the device.**
- **Economy:** sync balances as data (`wallet_ledger` with idempotency keys) but label them untrusted. Server validation is a separate
  later phase: GameSim is deterministic and already runs under Node (`server/online-server.mjs` imports `js/data/*`), so replaying a
  seeded match on the server is feasible; that, not a bigger schema, is what would make rewards trustworthy.
- **Service credentials never reach the browser.** Only the project URL and the anon key (public by design, protected by RLS) are
  shipped; the service-role key stays server-side.

## Proposed Phase 1/2 slice (one slot, behind a feature flag)

Slot: the **long career root (`cls_root_v3`)**: the largest and most valuable save, with an explicit version and migration path.

```
game_saves(user_id, slot, schema_version, revision, save_data jsonb, idempotency_key, updated_at)  -- PK (user_id, slot)
save_put(slot, expected_revision, schema_version, data, idempotency_key)  -- plpgsql, atomic compare-and-swap
RLS: a user can only read/write rows where user_id = auth.uid()
```

Client: a sync module with an **injectable transport**, so the whole flow (local save -> upload -> download -> validate -> restore,
conflict, interrupted upload, old save, account isolation, rollback) is unit-testable against an in-memory fake server, with no
network and no credentials. A real Supabase project plugs in as one more transport.

## Decisions I need from you

1. **Who creates the Supabase project?** It needs your account; I cannot and should not create one. I can deliver the migrations, RLS,
   the RPC, the API contract and the tested client against the fake server now, and wire the real project once you give me the URL and
   anon key as an environment value (never committed).
2. **Confirm "guests stay local-only; signing in is required for cloud".** The alternative (anonymous cloud users) makes
   claiming/ownership much harder.
3. **Confirm conflict policy:** reject-and-ask, never last-writer-wins.
4. Whether the existing online-duel server accounts should eventually be folded into the same identity (my recommendation: yes, but
   after the save slice, not before).
