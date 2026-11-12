-- Renaming conferences and divisions. Run with: supabase test db
begin;
\ir helpers.psql
\ir owner_helpers.psql

select plan(18);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_owner_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Custom');
select pg_temp.make_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Legacy');

reset role;
create temp table ids as
  select (select id from leagues where name = 'Custom') as custom,
         (select id from leagues where name = 'Legacy') as legacy;
grant select on ids to authenticated, anon;

-- Renaming ----------------------------------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');

select lives_ok(
  $$select rename_structure((select custom from ids),
      '[{"id": "c-1", "name": "  Atlantic  "}]'::jsonb,
      '[{"id": "d-1-1", "name": "Harbour"}, {"id": "d-2-1", "name": "Harbour"}]'::jsonb)$$,
  'the owner renames a conference and divisions (the same division name is fine in different conferences)'
);
select is(
  (select name from league_conferences where league_id = (select custom from ids) and id = 'c-1'),
  'Atlantic',
  'the new conference name is saved, trimmed'
);
select is(
  (select name from league_divisions where league_id = (select custom from ids) and id = 'd-1-1'),
  'Harbour',
  'the new division name is saved'
);
select is(
  (select count(*)::int from teams t
   where t.league_id = (select custom from ids) and t.conference_id = 'c-1' and t.division_id = 'd-1-1'),
  3,
  'renaming leaves the teams attached by id'
);
select is(
  (select string_agg(id, ',' order by id) from league_conferences where league_id = (select custom from ids)),
  'c-1,c-2',
  'ids never change'
);

-- Swapping two names in one request works.
select lives_ok(
  $$select rename_structure((select custom from ids),
      '[{"id": "c-1", "name": "Conference 2"}, {"id": "c-2", "name": "Atlantic"}]'::jsonb,
      '[]'::jsonb)$$,
  'two conferences can swap names in one request'
);
select is(
  (select name from league_conferences where league_id = (select custom from ids) and id = 'c-2'),
  'Atlantic',
  'the swap took effect'
);

-- Duplicates and bad input are rejected, and nothing changes ---------------------------------
select throws_ok(
  $$select rename_structure((select custom from ids),
      '[{"id": "c-1", "name": "same"}, {"id": "c-2", "name": " SAME "}]'::jsonb, '[]'::jsonb)$$,
  '23505', null,
  'two conferences cannot share a name, ignoring case and spaces'
);
select throws_ok(
  $$select rename_structure((select custom from ids), '[]'::jsonb,
      '[{"id": "d-1-1", "name": "Twin"}, {"id": "d-1-2", "name": "twin"}]'::jsonb)$$,
  '23505', null,
  'two divisions in one conference cannot share a name'
);
select throws_ok(
  $$select rename_structure((select custom from ids),
      '[{"id": "nope", "name": "X"}]'::jsonb, '[]'::jsonb)$$,
  '22023', 'unknown_conference',
  'an unknown conference id is rejected'
);
select throws_ok(
  $$select rename_structure((select custom from ids), '[]'::jsonb,
      '[{"id": "nope", "name": "X"}]'::jsonb)$$,
  '22023', 'unknown_division',
  'an unknown division id is rejected'
);
select throws_ok(
  $$select rename_structure((select custom from ids),
      '[{"id": "c-1", "name": "   "}]'::jsonb, '[]'::jsonb)$$,
  '23514', null,
  'a blank name is rejected'
);
select throws_ok(
  $$select rename_structure((select custom from ids), '{}'::jsonb, '[]'::jsonb)$$,
  '22023', 'invalid_names',
  'names must be sent as lists'
);
select is(
  (select name from league_conferences where league_id = (select custom from ids) and id = 'c-1'),
  'Conference 2',
  'rejected renames change nothing'
);

-- Legacy leagues can be renamed too ---------------------------------------------------------
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select lives_ok(
  $$select rename_structure((select legacy from ids),
      '[{"id": "east", "name": "Atlantic"}]'::jsonb, '[]'::jsonb)$$,
  'a league created before Owner Mode can be renamed'
);

-- Only the owner ---------------------------------------------------------------------------------
select throws_ok(
  $$select rename_structure((select custom from ids),
      '[{"id": "c-1", "name": "Hijacked"}]'::jsonb, '[]'::jsonb)$$,
  'P0002', 'league_not_found',
  'another user cannot rename someone else''s conferences'
);
select throws_ok(
  $$update league_conferences set name = 'Direct'$$,
  '42501', null,
  'clients still cannot update the structure tables directly'
);
set local role anon;
select throws_ok(
  $$select rename_structure((select custom from ids), '[]'::jsonb, '[]'::jsonb)$$,
  '42501', null,
  'signed-out visitors cannot call the function'
);

select * from finish();
rollback;
