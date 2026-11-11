-- Profiles: one row per account, holding display data only.
-- Identity is auth.users.id on every platform (docs/ARCHITECTURE.md §4);
-- nothing here keys on email.

-- Internal helpers live in a schema the Data API does not expose.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text not null
    check (char_length(display_name) between 1 and 40
           and display_name = btrim(display_name)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is
  'Public-facing display data for each account. Created by trigger on sign-up; deleted with the auth user.';

alter table public.profiles enable row level security;

-- Clients may read their own profile and change only the display name.
-- Rows are created by the sign-up trigger and removed by account deletion,
-- so there is no insert or delete grant.
grant select on public.profiles to authenticated;
grant update (display_name) on public.profiles to authenticated;

create policy "profiles: owner can read"
  on public.profiles for select
  to authenticated
  using ((select auth.uid()) = id);

create policy "profiles: owner can update"
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Keep updated_at current.
create function app_private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app_private.touch_updated_at();

-- Create a profile for every new account. The display name comes from the
-- sign-up form (user metadata), falling back to the part of the email before
-- the @, trimmed to the 40-character limit.
create function app_private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
begin
  if requested = '' then
    requested := btrim(split_part(coalesce(new.email, ''), '@', 1));
  end if;
  if requested = '' then
    requested := 'Player';
  end if;
  insert into public.profiles (id, display_name)
  values (new.id, btrim(left(requested, 40)));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app_private.create_profile_for_new_user();

-- Account deletion. Runs as its owner so it can remove the auth user;
-- it only ever deletes the caller. Every user-owned table references
-- auth.users (directly or through profiles) with on delete cascade, so this
-- removes all of the user's data.
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  delete from auth.users where id = caller;
end;
$$;

comment on function public.delete_own_account() is
  'Deletes the calling user and, by cascade, all of their data.';

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;
