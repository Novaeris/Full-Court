-- Owner Mode: config, stable structure ids, local players, franchises, AI Assist.
-- Run with: supabase test db
begin;
\ir helpers.psql
\ir owner_helpers.psql

select plan(46);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test'),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc', 'authenticated', 'authenticated', 'owner-c@example.test');

-- Creating leagues ----------------------------------------------------------------------------
set local role service_role;
select pg_temp.make_owner_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Custom');
select pg_temp.make_league('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'Legacy');

select is(
  (select status || '/' || size from leagues where name = 'Custom'),
  'active/custom',
  'an Owner Mode league starts active with the custom size'
);
select is(
  (select config_schema_version::text || '/' || (config ->> 'region') from leagues where name = 'Custom'),
  '1/north-america',
  'the config is stored with its schema version'
);
select is(
  (select (select count(*) from league_conferences where league_id = l.id)::text || '/' ||
          (select count(*) from league_divisions where league_id = l.id)::text || '/' ||
          (select count(*) from league_local_players where league_id = l.id)::text || '/' ||
          (select count(*) from teams where league_id = l.id)::text
   from leagues l where name = 'Custom'),
  '2/4/2/12',
  'conferences, divisions, local players and teams are all written'
);
select is(
  (select count(*)::int from teams t join leagues l on l.id = t.league_id
   where l.name = 'Custom' and t.local_player_slot = 1),
  2,
  'one local player can control several franchises'
);
select is(
  (select count(*)::int from teams t join leagues l on l.id = t.league_id
   where l.name = 'Custom' and t.local_player_slot is null),
  9,
  'the other franchises are run by the AI'
);
select is(
  (select t.local_player_slot::int from leagues l join teams t on t.id = l.user_team_id where l.name = 'Custom'),
  1,
  'user_team_id mirrors a Player 1 franchise'
);
select is(
  (select ai_scouting from teams t join leagues l on l.id = t.league_id
   where l.name = 'Custom' and t.abbreviation = 'T01'),
  true,
  'AI Assist flags are stored per franchise'
);
select is(
  (select count(*)::int from teams t join leagues l on l.id = t.league_id
   where l.name = 'Custom'
     and (ai_trades or ai_roster_coverage or ai_roster_management or ai_drafting)),
  0,
  'AI Assist flags not asked for default to off'
);

-- A standard league is exactly 2 x 3 x 5 ---------------------------------------------------------
select lives_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Standard', 'standard',
      pg_temp.owner_config('standard', 16), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 3), pg_temp.owner_players(),
      pg_temp.grid_teams(2, 3, 5), pg_temp.grid_players(30))$$,
  'a 2 x 3 x 5 standard league is accepted'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Wrong', 'standard',
      pg_temp.owner_config('standard', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2), pg_temp.owner_players(),
      pg_temp.grid_teams(2, 2, 3), pg_temp.grid_players(12))$$,
  '22023', 'invalid_structure',
  'a standard league with another shape is rejected'
);

-- Rejected input leaves nothing behind -------------------------------------------------------------
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Bad cfg', 'custom',
      jsonb_set(pg_temp.owner_config('custom', 4), '{playoffs,roundSeriesLengths}', '[7, 4]'),
      's', array[1,2,3,4]::bigint[], pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2),
      pg_temp.owner_players(), pg_temp.grid_teams(2, 2, 3), pg_temp.grid_players(12))$$,
  '22023', 'invalid_config',
  'a series length other than 3, 5 or 7 is rejected'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Mismatch', 'standard',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 3), pg_temp.owner_players(),
      pg_temp.grid_teams(2, 3, 5), pg_temp.grid_players(30))$$,
  '22023', 'invalid_config',
  'the preset must match the league size'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Too many', 'custom',
      pg_temp.owner_config('custom', 16), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2), pg_temp.owner_players(),
      pg_temp.grid_teams(2, 2, 3), pg_temp.grid_players(12))$$,
  '22023', 'invalid_config',
  'more playoff teams than teams is rejected'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Bad size', 'huge',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2), pg_temp.owner_players(),
      pg_temp.grid_teams(2, 2, 3), pg_temp.grid_players(12))$$,
  '22023', 'invalid_league_size',
  'an unknown league size is rejected'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Dup city', 'custom',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2), pg_temp.owner_players(),
      (select jsonb_agg(case when t ->> 'abbreviation' = 'T02'
                             then jsonb_set(t, '{city_id}', '"na-us-city-1"') else t end)
       from jsonb_array_elements(pg_temp.grid_teams(2, 2, 3)) t),
      pg_temp.grid_players(12))$$,
  '23505', null,
  'two franchises cannot share a city'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Idle player', 'custom',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2),
      '[{"slot": 1, "label": null}, {"slot": 2, "label": null}, {"slot": 3, "label": null}]'::jsonb,
      pg_temp.grid_teams(2, 2, 3), pg_temp.grid_players(12))$$,
  '22023', 'invalid_local_players',
  'every local player needs a franchise'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Gap', 'custom',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2),
      '[{"slot": 1, "label": null}, {"slot": 3, "label": null}]'::jsonb,
      (select jsonb_agg(case when t ->> 'abbreviation' = 'T07'
                             then jsonb_set(t, '{local_player_slot}', '3') else t end)
       from jsonb_array_elements(pg_temp.grid_teams(2, 2, 3)) t),
      pg_temp.grid_players(12))$$,
  '22023', 'invalid_local_players',
  'local players are numbered 1, 2, 3 without gaps'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'AI assist', 'custom',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2), pg_temp.owner_players(),
      (select jsonb_agg(case when t ->> 'abbreviation' = 'T12'
                             then jsonb_set(t, '{ai_drafting}', 'true') else t end)
       from jsonb_array_elements(pg_temp.grid_teams(2, 2, 3)) t),
      pg_temp.grid_players(12))$$,
  '23514', null,
  'AI Assist on an AI-run franchise is rejected'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Cross', 'custom',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2), pg_temp.owner_players(),
      (select jsonb_agg(case when t ->> 'abbreviation' = 'T01'
                             then jsonb_set(t, '{division_id}', '"d-2-1"') else t end)
       from jsonb_array_elements(pg_temp.grid_teams(2, 2, 3)) t),
      pg_temp.grid_players(12))$$,
  '23503', null,
  'a team cannot sit in a division of another conference'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Empty div', 'custom',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 3), pg_temp.owner_players(),
      pg_temp.grid_teams(2, 2, 3), pg_temp.grid_players(12))$$,
  '22023', 'invalid_structure',
  'a division with no teams is rejected'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'No logo', 'custom',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2), pg_temp.owner_players(),
      (select jsonb_agg(case when t ->> 'abbreviation' = 'T05' then t - 'logo_id' else t end)
       from jsonb_array_elements(pg_temp.grid_teams(2, 2, 3)) t),
      pg_temp.grid_players(12))$$,
  '22023', 'invalid_world',
  'every franchise needs a logo'
);
select throws_ok(
  $$select admin_create_owner_league('cccccccc-cccc-cccc-cccc-cccccccccccc', 'Short', 'custom',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2), pg_temp.owner_players(),
      pg_temp.grid_teams(2, 2, 3), '[]'::jsonb)$$,
  '22023', 'invalid_world',
  'a league without full rosters is rejected'
);
select is(
  (select count(*)::int from leagues where owner_id = 'cccccccc-cccc-cccc-cccc-cccccccccccc'),
  1,
  'rejected leagues leave nothing behind (only the standard league exists)'
);

-- Config validation in the database ------------------------------------------------------------------
select ok(
  not app_private.valid_league_config('{}'::jsonb)
  and not app_private.valid_league_config(jsonb_set(pg_temp.owner_config('custom', 4), '{schemaVersion}', '2'))
  and not app_private.valid_league_config(jsonb_set(pg_temp.owner_config('custom', 4), '{region}', '"mars"'))
  and not app_private.valid_league_config(jsonb_set(pg_temp.owner_config('custom', 4), '{playoffs,teams}', '6'))
  and not app_private.valid_league_config(jsonb_set(pg_temp.owner_config('custom', 4), '{playoffs,divisionLeaderTopSeeds}', '1.5'))
  and not app_private.valid_league_config(jsonb_set(pg_temp.owner_config('custom', 4), '{fantasyDraft}', '"yes"'))
  and app_private.valid_league_config(pg_temp.owner_config('custom', 4))
  and app_private.valid_league_config(pg_temp.owner_config('standard', 16)),
  'valid_league_config accepts version 1 configs and rejects malformed ones'
);

-- Legacy leagues keep working ------------------------------------------------------------------------
select is(
  (select (config is null)::text || '/' || coalesce(config_schema_version::text, 'null')
   from leagues where name = 'Legacy'),
  'true/null',
  'a legacy league has no config'
);
select is(
  (select string_agg(c.id || ':' || c.name, ',' order by c.sort_order)
   from league_conferences c join leagues l on l.id = c.league_id where l.name = 'Legacy'),
  'east:Eastern,west:Western',
  'legacy conferences get stable ids and keep their display names'
);
select is(
  (select count(*)::int from teams t join leagues l on l.id = t.league_id
   where l.name = 'Legacy' and t.local_player_slot is not null),
  0,
  'a legacy league starts with no franchise chosen'
);

-- Direct writes cannot bypass the config check (run as the table owner) ----------------------------
reset role;
select throws_ok(
  $$update leagues set config = '{}'::jsonb, config_schema_version = 1 where name = 'Legacy'$$,
  '23514', null,
  'an empty config object is rejected'
);
select throws_ok(
  $$update leagues set config_schema_version = 1 where name = 'Legacy'$$,
  '23514', null,
  'a config version without a config is rejected'
);
select throws_ok(
  $$update leagues set config = (select config from leagues where name = 'Custom'), config_schema_version = 2
    where name = 'Legacy'$$,
  '23514', null,
  'the column version must match the version inside the config'
);
select throws_ok(
  $$update leagues set size = 'custom' where name = 'Legacy'$$,
  '23514', null,
  'a custom league must have a config'
);

-- Choosing a team in a legacy league records Player 1 ----------------------------------------------------
set local role authenticated;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
select is(
  (select status from choose_team(
     (select id from leagues where name = 'Legacy'),
     (select id from teams where abbreviation = 'T05'))),
  'active',
  'choosing a team still starts a legacy league'
);
select is(
  (select t.local_player_slot::int from teams t where t.abbreviation = 'T05'),
  1,
  'the chosen team is now Player 1''s franchise'
);
select is(
  (select count(*)::int from league_local_players),
  1,
  'Player 1 is recorded for the legacy league'
);

-- Read access: owners only ----------------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (select (select count(*) from league_conferences)::text || '/' ||
          (select count(*) from league_divisions)::text || '/' ||
          (select count(*) from league_local_players)::text),
  '2/4/2',
  'the owner reads their conferences, divisions and local players'
);
select pg_temp.act_as('cccccccc-cccc-cccc-cccc-cccccccccccc');
select is(
  (select count(*)::int from league_conferences c join leagues l on l.id = c.league_id where l.name = 'Custom'),
  0,
  'another user cannot see the owner''s conferences'
);
select is(
  (select count(*)::int from league_divisions d join leagues l on l.id = d.league_id where l.name = 'Custom'),
  0,
  'another user cannot see the owner''s divisions'
);
select is(
  (select count(*)::int from league_local_players p join leagues l on l.id = p.league_id where l.name = 'Custom'),
  0,
  'another user cannot see the owner''s local players'
);

-- Clients cannot write -----------------------------------------------------------------------------------------
select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select throws_ok(
  $$insert into league_local_players (league_id, slot) select id, 3 from leagues limit 1$$,
  '42501', null, 'clients cannot add local players'
);
select throws_ok(
  $$update league_divisions set name = 'Renamed'$$,
  '42501', null, 'clients cannot rename divisions'
);
select throws_ok(
  $$delete from league_conferences$$,
  '42501', null, 'clients cannot delete conferences'
);
select throws_ok(
  $$update teams set ai_trades = true$$,
  '42501', null, 'clients cannot change AI Assist'
);
select throws_ok(
  $$update leagues set config = '{}'::jsonb$$,
  '42501', null, 'clients cannot change a league''s config'
);
select throws_ok(
  $$select admin_create_owner_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Hack', 'custom',
      pg_temp.owner_config('custom', 4), 's', array[1,2,3,4]::bigint[],
      pg_temp.grid_conferences(2), pg_temp.grid_divisions(2, 2), pg_temp.owner_players(),
      pg_temp.grid_teams(2, 2, 3), pg_temp.grid_players(12))$$,
  '42501', null,
  'clients cannot call the Owner Mode create function'
);

-- Renaming display names never breaks references ----------------------------------------------------------------
reset role;
update league_divisions set name = 'Renamed division'
  where league_id = (select id from leagues where name = 'Custom') and id = 'd-1-1';
select is(
  (select count(*)::int from teams t join league_divisions d
     on d.league_id = t.league_id and d.id = t.division_id
   where t.league_id = (select id from leagues where name = 'Custom') and d.name = 'Renamed division'),
  3,
  'renaming a division leaves its teams attached by id'
);

-- Deleting a league deletes its structure ----------------------------------------------------------------------------
create temp table custom_league as select id from leagues where name = 'Custom';
delete from leagues where name = 'Custom';
select is(
  (select (select count(*) from league_conferences where league_id = (select id from custom_league))::text || '/' ||
          (select count(*) from league_divisions where league_id = (select id from custom_league))::text || '/' ||
          (select count(*) from league_local_players where league_id = (select id from custom_league))::text),
  '0/0/0',
  'deleting a league deletes its conferences, divisions and local players'
);

select * from finish();
rollback;
