-- Row-level security and account lifecycle for public.profiles.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(22);

-- Two accounts, created the way Supabase Auth creates them.
insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'alice@example.test', '{"display_name": "  Alice Coach  "}'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'bob.builder@example.test', '{}');

-- Sign-up trigger -------------------------------------------------------------
select is(
  (select display_name from profiles where id = '11111111-1111-1111-1111-111111111111'),
  'Alice Coach',
  'sign-up creates a profile with the trimmed display name from the form'
);
select is(
  (select display_name from profiles where id = '22222222-2222-2222-2222-222222222222'),
  'bob.builder',
  'without a display name, the profile falls back to the email name'
);

-- Every table in public has RLS -------------------------------------------------
select is(
  (select count(*)::int from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity),
  0,
  'every table in public has row-level security enabled'
);

-- Anonymous visitors ------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);

select throws_ok(
  'select * from profiles',
  '42501',
  null,
  'anon cannot read profiles at all'
);
select throws_ok(
  'select delete_own_account()',
  '42501',
  null,
  'anon cannot call delete_own_account'
);

-- Alice -------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub": "11111111-1111-1111-1111-111111111111", "role": "authenticated"}', true);

select results_eq(
  'select id from profiles',
  $$values ('11111111-1111-1111-1111-111111111111'::uuid)$$,
  'a user sees only their own profile'
);

select is_empty(
  $$update profiles set display_name = 'Hacked'
    where id = '22222222-2222-2222-2222-222222222222' returning id$$,
  'a user cannot update someone else''s profile'
);

select lives_ok(
  $$update profiles set display_name = 'Coach Alice'
    where id = '11111111-1111-1111-1111-111111111111'$$,
  'a user can rename themselves'
);
select is(
  (select display_name from profiles),
  'Coach Alice',
  'the rename is stored'
);

select throws_ok(
  $$update profiles set display_name = ''
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'an empty display name is rejected'
);
select throws_ok(
  $$update profiles set display_name = repeat('x', 41)
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'a display name over 40 characters is rejected'
);
select throws_ok(
  $$update profiles set display_name = ' padded '
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '23514',
  null,
  'a display name with surrounding spaces is rejected'
);

select throws_ok(
  $$update profiles set created_at = now()
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'a user cannot change columns other than display_name'
);
select throws_ok(
  $$update profiles set id = '33333333-3333-3333-3333-333333333333'
    where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'a user cannot change their profile id'
);
select throws_ok(
  $$insert into profiles (id, display_name)
    values ('33333333-3333-3333-3333-333333333333', 'Fake')$$,
  '42501',
  null,
  'a user cannot create profiles'
);
select throws_ok(
  $$delete from profiles where id = '11111111-1111-1111-1111-111111111111'$$,
  '42501',
  null,
  'a user cannot delete profile rows directly'
);

select throws_ok(
  'select app_private.create_profile_for_new_user()',
  '42501',
  null,
  'internal helpers are not callable by clients'
);

-- Account deletion ----------------------------------------------------------------
select lives_ok('select delete_own_account()', 'a user can delete their own account');

reset role;
select is(
  (select count(*)::int from auth.users where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'deleting the account removes the auth user'
);
select is(
  (select count(*)::int from profiles where id = '11111111-1111-1111-1111-111111111111'),
  0,
  'deleting the account removes the profile'
);
select is(
  (select count(*)::int from profiles where id = '22222222-2222-2222-2222-222222222222'),
  1,
  'deleting one account leaves other accounts alone'
);

-- A request with no signed-in user cannot delete anything.
set local role authenticated;
select set_config('request.jwt.claims', '{"role": "authenticated"}', true);
select throws_ok(
  'select delete_own_account()',
  '42501',
  'Not signed in',
  'delete_own_account refuses a request without a user'
);

select * from finish();
rollback;
