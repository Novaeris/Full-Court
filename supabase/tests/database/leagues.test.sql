-- Row-level security, the per-account limit and cascades for public.leagues.
-- Run with: supabase test db
begin;
create extension if not exists pgtap with schema extensions;
do $$
begin
  perform set_config(
    'search_path',
    'public, extensions, ' || (
      select quote_ident(n.nspname)
      from pg_extension e
      join pg_namespace n on n.oid = e.extnamespace
      where e.extname = 'pgtap'
    ),
    true
  );
end
$$;

select plan(26);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

-- Switch the session to act as a user, the way PostgREST does.
create function pg_temp.act_as(user_id uuid) returns void language sql as $$
  select set_config('request.jwt.claims',
    json_build_object('sub', user_id, 'role', 'authenticated')::text, true);
$$;
-- The baseline migration withholds EXECUTE on new functions; grant it here.
grant execute on function pg_temp.act_as(uuid) to authenticated;

-- Anonymous ------------------------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok('select * from leagues', '42501', null, 'anon cannot read leagues');
select throws_ok($$select create_league('Nope')$$, '42501', null, 'anon cannot create leagues');

-- Owner A creates leagues -------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select is(
  (select owner_id from create_league('  Harbor City Dynasty  ')),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'create_league makes the caller the owner'
);
select is(
  (select name from leagues limit 1),
  'Harbor City Dynasty',
  'the name is trimmed'
);
select is((select status from leagues limit 1), 'setup', 'new leagues start in setup');

select throws_ok($$select create_league('')$$, '23514', null, 'an empty name is rejected');
select throws_ok($$select create_league(repeat('x', 41))$$, '23514', null, 'a name over 40 characters is rejected');

select throws_ok(
  $$insert into leagues (owner_id, name) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Direct')$$,
  '42501', null,
  'clients cannot insert directly (the limit cannot be bypassed)'
);

select lives_ok($$select create_league('Two')$$, 'second league');
select lives_ok($$select create_league('Three')$$, 'third league');
select lives_ok($$select create_league('Four')$$, 'fourth league');
select lives_ok($$select create_league('Five')$$, 'fifth league');
select throws_ok(
  $$select create_league('Six')$$,
  'P0001', 'league_limit_reached',
  'a sixth league is refused'
);
select is((select count(*)::int from leagues), 5, 'owner A has exactly five leagues');

select lives_ok(
  $$update leagues set name = 'Renamed' where name = 'Two'$$,
  'the owner can rename a league'
);
select throws_ok(
  $$update leagues set status = 'active' where name = 'Renamed'$$,
  '42501', null,
  'clients cannot change columns other than name'
);
select throws_ok(
  $$update leagues set owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' where name = 'Renamed'$$,
  '42501', null,
  'clients cannot hand a league to someone else'
);

-- Owner B sees none of A's leagues ------------------------------------------------
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is_empty('select * from leagues', 'another user sees none of the owner''s leagues');
select is_empty(
  $$update leagues set name = 'Stolen' returning id$$,
  'another user cannot rename the owner''s leagues'
);
select is_empty(
  $$delete from leagues returning id$$,
  'another user cannot delete the owner''s leagues'
);
select lives_ok($$select create_league('B''s league')$$, 'the limit is per account');

-- Deleting ---------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select results_eq(
  $$delete from leagues where name = 'Five' returning name$$,
  $$values ('Five')$$,
  'the owner can delete a league'
);
select lives_ok($$select create_league('Five again')$$, 'deleting frees a slot');

-- Deleting the account removes its leagues -----------------------------------------
select lives_ok('select delete_own_account()', 'owner A deletes their account');
reset role;
select is(
  (select count(*)::int from leagues where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'deleting the account deletes its leagues'
);
select is(
  (select count(*)::int from leagues where owner_id = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'),
  1,
  'other accounts keep their leagues'
);

select * from finish();
rollback;
