-- Storing season awards. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(8);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Awards');
select admin_create_season(pg_temp.league_id('Awards'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Awards')));

create function pg_temp.season() returns uuid language sql stable as $$
  select id from public.seasons where league_id = pg_temp.league_id('Awards');
$$;
create function pg_temp.team(abbr text) returns uuid language sql stable as $$
  select id from public.teams
  where league_id = pg_temp.league_id('Awards') and abbreviation = abbr;
$$;
create function pg_temp.pl(abbr text, n integer) returns uuid language sql stable as $$
  select id from public.players
  where team_id = pg_temp.team(abbr) and status = 'active' order by jersey, id offset n - 1 limit 1;
$$;
create function pg_temp.awards(variadic names text[]) returns jsonb language sql stable as $$
  select jsonb_agg(jsonb_build_object('award', n, 'player_id', pg_temp.pl('T01', i::int),
                                      'team_id', pg_temp.team('T01')))
  from unnest(names) with ordinality as t(n, i);
$$;
grant execute on function pg_temp.season(), pg_temp.team(text), pg_temp.pl(text, integer),
  pg_temp.awards(text[]) to service_role, authenticated;

select throws_ok(
  $$select admin_set_season_awards(pg_temp.season(), pg_temp.awards('mvp'))$$,
  'P0001', 'season_not_archived', 'awards wait until the season is archived');

reset role;
update seasons set archived_at = now() where id = pg_temp.season();
-- The champion was recorded when the final was won.
insert into season_awards (league_id, season_id, award, team_id)
values (pg_temp.league_id('Awards'), pg_temp.season(), 'champion', pg_temp.team('T02'));
set local role service_role;

select is(
  admin_set_season_awards(pg_temp.season(), pg_temp.awards('mvp', 'scoring-title', 'all-league-1')),
  3, 'the awards are stored');
select is(
  admin_set_season_awards(pg_temp.season(), pg_temp.awards('mvp', 'scoring-title', 'all-league-1')),
  3, 'doing it again stores them again');
select is(
  (select count(*)::int from season_awards where season_id = pg_temp.season() and award <> 'champion'),
  3, 'without doubling them');
select is(
  (select count(*)::int from season_awards where season_id = pg_temp.season() and award = 'champion'),
  1, 'and the champion is kept');
select is(
  admin_set_season_awards(pg_temp.season(),
    jsonb_build_array(jsonb_build_object('award', 'champion', 'team_id', pg_temp.team('T03')))),
  0, 'a champion cannot be set here');
select throws_ok(
  $$select admin_set_season_awards(pg_temp.season(),
      jsonb_build_array(jsonb_build_object('award', 'Bad Name', 'team_id', pg_temp.team('T01'))))$$,
  '23514', null, 'an award name has to be a slug');

reset role;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select is((select count(*)::int from public.season_awards), 0, 'another user cannot read the awards');

select * from finish();
rollback;
