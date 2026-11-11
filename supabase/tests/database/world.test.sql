-- Teams, players and choosing a team. Run with: supabase test db
begin;
\ir helpers.psql

select plan(18);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'World');
select pg_temp.make_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Other');

-- A malformed world is refused as a whole.
select throws_ok(
  $$select admin_create_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Short', 'compact', 's',
      array[1,2,3,4]::bigint[], pg_temp.world_teams(), '[]'::jsonb)$$,
  '22023', 'invalid_world',
  'a league without full rosters is rejected'
);
select is(
  (select count(*)::int from leagues where name = 'Short'),
  0,
  'a rejected world leaves no league behind'
);
select throws_ok(
  $$select admin_create_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Odd', 'huge', 's',
      array[1,2,3,4]::bigint[], pg_temp.world_teams(), pg_temp.world_players())$$,
  '22023', 'invalid_league_size',
  'an unknown league size is rejected'
);

-- The owner reads their world -----------------------------------------------------------
set local role authenticated;
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is((select count(*)::int from teams), 12, 'the owner sees their 12 teams');
select is((select count(*)::int from players), 180, 'the owner sees their 180 players');
select is(
  (select count(*)::int from players where team_id is null),
  0,
  'every generated player is on a team'
);

-- Nobody can forge a roster ---------------------------------------------------------------
select throws_ok(
  $$insert into players (league_id, first_name, last_name, position, age, height_inches,
      weight_pounds, jersey, overall, potential, inside, mid_range, three_point, free_throw,
      passing, ball_handling, off_rebound, def_rebound, perimeter_d, interior_d, speed,
      strength, stamina)
    select id, 'Fake', 'Star', 'PG', 25, 75, 190, 0, 99, 99, 99, 99, 99, 99, 99, 99, 99, 99,
      99, 99, 99, 99, 99 from leagues limit 1$$,
  '42501', null,
  'clients cannot add players'
);
select throws_ok($$update players set overall = 99$$, '42501', null, 'clients cannot edit players');
select throws_ok($$update teams set city = 'X'$$, '42501', null, 'clients cannot edit teams');
select throws_ok($$delete from players$$, '42501', null, 'clients cannot delete players');

-- Choosing a team ----------------------------------------------------------------------------
select is(
  (select status from choose_team(
     (select id from leagues where name = 'World'),
     (select id from teams where abbreviation = 'T03'))),
  'active',
  'choosing a team starts the league'
);
select is(
  (select t.abbreviation from leagues l join teams t on t.id = l.user_team_id where l.name = 'World'),
  'T03',
  'the chosen team is saved'
);
select throws_ok(
  $$select choose_team((select id from leagues where name = 'World'),
                       (select id from teams where abbreviation = 'T04'))$$,
  'P0001', 'team_already_chosen',
  'the team can only be chosen once'
);

-- Another user sees nothing and can't choose in someone else's league ---------------------------
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is((select count(*)::int from teams), 12, 'another user sees only their own 12 teams');
select is(
  (select count(*)::int from players p join leagues l on l.id = p.league_id where l.name = 'World'),
  0,
  'another user sees none of the owner''s players'
);

reset role;
create temp table owner_ids as
  select (select id from leagues where name = 'World') as league,
         (select id from teams t where t.league_id = (select id from leagues where name = 'World') limit 1) as team;
grant select on owner_ids to authenticated;
set local role authenticated;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select throws_ok(
  $$select choose_team((select league from owner_ids), (select team from owner_ids))$$,
  'P0002', 'league_not_found',
  'another user cannot choose a team in the owner''s league'
);
select throws_ok(
  $$select choose_team((select id from leagues where name = 'Other'), (select team from owner_ids))$$,
  'P0002', 'team_not_found',
  'a team from another league cannot be chosen'
);

-- Deleting a league deletes its world -------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
delete from leagues where name = 'World';
reset role;
select is(
  (select count(*)::int from players p where p.league_id = (select league from owner_ids)),
  0,
  'deleting a league deletes its teams and players'
);

select * from finish();
rollback;
