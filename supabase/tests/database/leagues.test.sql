-- Row-level security, the per-account limit and cascades for public.leagues.
-- Run with: supabase test db
begin;
\ir helpers.psql

select plan(22);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

-- Only the server creates leagues ----------------------------------------------------
set local role anon;
select set_config('request.jwt.claims', '{"role": "anon"}', true);
select throws_ok('select * from leagues', '42501', null, 'anon cannot read leagues');

set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok(
  $$select admin_create_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Mine', 'compact',
      's', array[1,2,3,4]::bigint[], '[]'::jsonb, '[]'::jsonb)$$,
  '42501', null,
  'signed-in users cannot call the server-only create function'
);
select throws_ok(
  $$insert into leagues (owner_id, name, seed) values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Direct', 's')$$,
  '42501', null,
  'clients cannot insert leagues directly'
);

-- The server creates leagues, up to the limit -----------------------------------------
set local role service_role;
select is(
  (select owner_id from pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '  Harbor City  ')),
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid,
  'the server creates a league for the given owner'
);
select is(
  (select name from leagues where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  'Harbor City',
  'the name is trimmed'
);
select lives_ok($$select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Two')$$, 'second league');
select lives_ok($$select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Three')$$, 'third league');
select lives_ok($$select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Four')$$, 'fourth league');
select lives_ok($$select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Five')$$, 'fifth league');
select throws_ok(
  $$select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Six')$$,
  'P0001', 'league_limit_reached',
  'a sixth league is refused'
);
select throws_ok(
  $$select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', '')$$,
  'P0001', 'league_limit_reached',
  'the limit is checked before anything else'
);
select lives_ok(
  $$select pg_temp.make_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'B''s league')$$,
  'the limit is per account'
);

-- Owners rename and delete; others see nothing ------------------------------------------
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from leagues), 5, 'owner A sees exactly their five leagues');
select lives_ok($$update leagues set name = 'Renamed' where name = 'Two'$$, 'the owner can rename a league');
select throws_ok(
  $$update leagues set status = 'active' where name = 'Renamed'$$,
  '42501', null,
  'clients cannot change columns other than name'
);
select throws_ok(
  $$update leagues set seed = 'cheat' where name = 'Renamed'$$,
  '42501', null,
  'clients cannot change the seed'
);

select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from leagues), 1, 'another user sees only their own league');
select is_empty($$update leagues set name = 'Stolen' where owner_id <> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning id$$,
  'another user cannot rename the owner''s leagues');
select is_empty($$delete from leagues where owner_id <> 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb' returning id$$,
  'another user cannot delete the owner''s leagues');

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select results_eq($$delete from leagues where name = 'Five' returning name$$, $$values ('Five')$$,
  'the owner can delete a league');

-- Deleting the account removes its leagues ------------------------------------------------
select lives_ok('select delete_own_account()', 'owner A deletes their account');
reset role;
select is(
  (select count(*)::int from leagues where owner_id = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'),
  0,
  'deleting the account deletes its leagues'
);

select * from finish();
rollback;
