-- Offers from computer teams to the owner. Run with: supabase test db
begin;
\ir helpers.psql
\ir season_helpers.psql

select plan(14);

insert into auth.users (id, aud, role, email)
values
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'authenticated', 'authenticated', 'owner-a@example.test'),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', 'authenticated', 'authenticated', 'owner-b@example.test');

set local role service_role;
select pg_temp.make_league('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Offers');
select admin_ensure_contracts(pg_temp.league_id('Offers'),
  (select jsonb_agg(jsonb_build_object('id', p.id, 'salary', 5000, 'expires', 2030))
   from players p where p.league_id = pg_temp.league_id('Offers')));
select admin_create_season(pg_temp.league_id('Offers'), 2026, 'standard',
  '{"division": 4, "conference": 3, "interconference": 2}',
  pg_temp.tiny_schedule(pg_temp.league_id('Offers')));

create function pg_temp.team(abbr text) returns uuid language sql as $$
  select id from public.teams
  where league_id = pg_temp.league_id('Offers') and abbreviation = abbr;
$$;
create function pg_temp.season() returns uuid language sql as $$
  select id from public.seasons where league_id = pg_temp.league_id('Offers');
$$;
create function pg_temp.pl(abbr text, n integer) returns uuid language sql as $$
  select id from public.players
  where team_id = pg_temp.team(abbr) and status = 'active' order by jersey, id offset n - 1 limit 1;
$$;
create function pg_temp.offer(owner_abbr text, partner_abbr text, give_n integer, get_n integer)
returns jsonb language sql as $$
  select jsonb_build_array(jsonb_build_object(
    'team_id', pg_temp.team(owner_abbr), 'partner_id', pg_temp.team(partner_abbr),
    'give', jsonb_build_array(pg_temp.pl(owner_abbr, give_n)),
    'get', jsonb_build_array(pg_temp.pl(partner_abbr, get_n))));
$$;
grant execute on function pg_temp.team(text), pg_temp.season(), pg_temp.pl(text, integer),
  pg_temp.offer(text, text, integer, integer) to service_role;

-- The owner runs T01.
insert into league_local_players (league_id, slot)
values (pg_temp.league_id('Offers'), 1) on conflict do nothing;
update teams set local_player_slot = 1
where id = pg_temp.team('T01');
select is(
  (select count(*)::int from teams
   where league_id = pg_temp.league_id('Offers') and local_player_slot is not null),
  1, 'the owner runs one team');

select is(
  admin_replace_trade_offers(pg_temp.season(), pg_temp.offer('T01', 'T09', 1, 1)),
  1, 'an offer is stored');
select is(
  (select status from trade_offers where season_id = pg_temp.season()),
  'open', 'it starts open');
select is(
  admin_replace_trade_offers(pg_temp.season(), pg_temp.offer('T01', 'T10', 2, 2)),
  1, 'a new set replaces the old one');
select is(
  (select count(*)::int from trade_offers where season_id = pg_temp.season() and status = 'expired'),
  1, 'the old offer expired');
select throws_ok(
  $$select admin_replace_trade_offers(pg_temp.season(), pg_temp.offer('T09', 'T10', 1, 1))$$,
  'P0002', 'team_not_found', 'an offer has to be to a team the owner runs');
select throws_ok(
  $$select admin_replace_trade_offers(pg_temp.season(),
      jsonb_build_array(jsonb_build_object(
        'team_id', pg_temp.team('T01'), 'partner_id', pg_temp.team('T10'),
        'give', jsonb_build_array(pg_temp.pl('T10', 1)), 'get', '[]'::jsonb)))$$,
  'P0001', 'player_not_on_team', 'each player has to be on the team that gives him');

select is(
  (select (admin_accept_trade_offer((select id from trade_offers
     where season_id = pg_temp.season() and status = 'open'))).day::int),
  1, 'accepting an offer makes the trade');
select is(
  (select status from trade_offers where season_id = pg_temp.season() and status <> 'expired'),
  'accepted', 'and marks it accepted');
select throws_ok(
  $$select admin_accept_trade_offer((select id from trade_offers
      where season_id = pg_temp.season() and status = 'accepted'))$$,
  'P0001', 'offer_not_open', 'an offer can be accepted once');

select admin_replace_trade_offers(pg_temp.season(), pg_temp.offer('T01', 'T11', 3, 3));
select admin_decline_trade_offer((select id from trade_offers
  where season_id = pg_temp.season() and status = 'open'));
select is(
  (select count(*)::int from trade_offers where season_id = pg_temp.season() and status = 'declined'),
  1, 'an offer can be declined');

reset role;
select pg_temp.act_as('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb');
set local role authenticated;
select is(
  (select count(*)::int from public.trade_offers),
  0, 'another user cannot read the offers');

select pg_temp.act_as('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa');
select is(
  (select count(*)::int from public.trade_offers),
  3, 'the league owner reads them');
select throws_ok(
  $$update public.trade_offers set status = 'open'$$,
  '42501', null, 'and cannot change them');

select * from finish();
rollback;
