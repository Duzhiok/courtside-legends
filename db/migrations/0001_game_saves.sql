-- Cloud saves, slice 1 (docs/implementation/DB-PHASE0-AUDIT.md). Postgres / Supabase.
-- Not applied to a real project until DB3.1 (verify first with scripts/db/verify-save-put.mjs, real Postgres via PGlite).
-- Contract: js/cloud/cloudSync.js + js/cloud/supabaseTransport.js. Security review notes are next to each statement.

create table if not exists public.game_saves (
  user_id         uuid        not null references auth.users (id) on delete cascade,
  slot            text        not null check (slot in ('career')),
  schema_version  integer     not null check (schema_version > 0),
  revision        integer     not null check (revision > 0),
  save_data       text        not null check (length(save_data) <= 4000000),  -- the export envelope, as text
  idempotency_key text        not null,
  updated_at      timestamptz not null default now(),
  primary key (user_id, slot)
);

alter table public.game_saves enable row level security;

-- Supabase grants new public tables to anon/authenticated by default. RLS would still block writes (no write policy),
-- but the least-privilege rule is: the API roles may only SELECT, and only their own rows. Writes go through save_put().
revoke all on table public.game_saves from anon, authenticated;
grant select on table public.game_saves to authenticated;

drop policy if exists game_saves_select_own on public.game_saves;
create policy game_saves_select_own on public.game_saves
  for select to authenticated using (user_id = (select auth.uid()));

-- Atomic compare-and-swap. Returns jsonb:
--   { "revision": n }                      applied (or replayed: same key AND same payload as the last applied write)
--   { "conflict": true, "revision": n }    stale / missing expected_revision, or lost a race; nothing was written
-- Errors (PostgREST maps the SQLSTATE): 28000 -> 403 not signed in, PT413 -> 413 too large, 22023 -> 400 rejected
-- (bad slot / key reused with a different payload / older schema than the stored one).
-- SECURITY DEFINER runs as the function owner (it bypasses RLS on purpose), so ownership is enforced INSIDE: the row
-- owner is always auth.uid(), never a parameter. search_path is empty and every name is schema-qualified.
create or replace function public.save_put(
  p_slot text,
  p_expected_revision integer,
  p_schema_version integer,
  p_data text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  cur public.game_saves%rowtype;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;
  if p_slot is distinct from 'career' or p_data is null or p_idempotency_key is null
     or p_schema_version is null or p_schema_version < 1 then
    raise exception 'bad save request' using errcode = '22023';
  end if;
  if length(p_data) > 4000000 then
    raise exception 'save too large' using errcode = 'PT413';
  end if;

  -- Serialise concurrent writers of the same (user, slot).
  select * into cur from public.game_saves where user_id = uid and slot = p_slot for update;

  if found then
    if cur.idempotency_key = p_idempotency_key then
      if cur.save_data is distinct from p_data then
        raise exception 'idempotency key reused with a different payload' using errcode = '22023';
      end if;
      return jsonb_build_object('revision', cur.revision);       -- retried / lost-response upload
    end if;
    if p_expected_revision is distinct from cur.revision then     -- also catches NULL
      return jsonb_build_object('conflict', true, 'revision', cur.revision);
    end if;
    if p_schema_version < cur.schema_version then
      raise exception 'older save format than the stored one' using errcode = '22023';
    end if;
    update public.game_saves
       set revision = cur.revision + 1, schema_version = p_schema_version, save_data = p_data,
           idempotency_key = p_idempotency_key, updated_at = now()
     where user_id = uid and slot = p_slot;
    return jsonb_build_object('revision', cur.revision + 1);
  end if;

  if p_expected_revision is distinct from 0 then
    return jsonb_build_object('conflict', true, 'revision', 0);
  end if;
  begin
    insert into public.game_saves (user_id, slot, schema_version, revision, save_data, idempotency_key)
    values (uid, p_slot, p_schema_version, 1, p_data, p_idempotency_key);
  exception when unique_violation then
    -- Two devices created the first save at the same moment: the loser gets a conflict, not an error.
    select * into cur from public.game_saves where user_id = uid and slot = p_slot;
    return jsonb_build_object('conflict', true, 'revision', cur.revision);
  end;
  return jsonb_build_object('revision', 1);
end;
$$;

-- Supabase also grants EXECUTE to anon on new public functions explicitly, which "revoke from public" does not remove.
revoke all on function public.save_put(text, integer, integer, text, text) from public, anon, authenticated;
grant execute on function public.save_put(text, integer, integer, text, text) to authenticated;
