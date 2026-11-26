-- Cloud saves, slice 1 (docs/implementation/DB-PHASE0-AUDIT.md). Postgres / Supabase.
-- NOT applied anywhere yet: it needs a real project (the owner creates it). The contract below is exactly what
-- tests/helpers/fakeCloud.js implements and js/cloud/cloudSync.js expects.

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

-- A user can only ever see or touch their own rows. Writes go through save_put() only (no direct insert/update policy).
create policy game_saves_select_own on public.game_saves
  for select using (user_id = auth.uid());

-- Atomic compare-and-swap. Returns jsonb:
--   { "revision": n }                      applied (or replayed: same idempotency key as the last applied write)
--   { "conflict": true, "revision": n }    stale expected_revision; nothing was written
create or replace function public.save_put(
  p_slot text,
  p_expected_revision integer,
  p_schema_version integer,
  p_data text,
  p_idempotency_key text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
  cur public.game_saves%rowtype;
begin
  if uid is null then
    raise exception 'not signed in' using errcode = '28000';
  end if;

  -- Serialise concurrent writers of the same (user, slot).
  select * into cur from public.game_saves where user_id = uid and slot = p_slot for update;

  if found then
    if cur.idempotency_key = p_idempotency_key then
      return jsonb_build_object('revision', cur.revision);       -- retried / lost-response upload
    end if;
    if cur.revision <> p_expected_revision then
      return jsonb_build_object('conflict', true, 'revision', cur.revision);
    end if;
    update public.game_saves
       set revision = cur.revision + 1, schema_version = p_schema_version, save_data = p_data,
           idempotency_key = p_idempotency_key, updated_at = now()
     where user_id = uid and slot = p_slot;
    return jsonb_build_object('revision', cur.revision + 1);
  end if;

  if p_expected_revision <> 0 then
    return jsonb_build_object('conflict', true, 'revision', 0);
  end if;
  insert into public.game_saves (user_id, slot, schema_version, revision, save_data, idempotency_key)
  values (uid, p_slot, p_schema_version, 1, p_data, p_idempotency_key);
  return jsonb_build_object('revision', 1);
end;
$$;

revoke all on function public.save_put(text, integer, integer, text, text) from public;
grant execute on function public.save_put(text, integer, integer, text, text) to authenticated;
