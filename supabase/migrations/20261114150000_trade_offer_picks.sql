-- Picks in offers from computer teams (Phase 21). A computer team may add one
-- of its picks to what it offers the owner, so an offer carries the pick rights
-- it would send. Accepting the offer moves them with the players.

alter table public.trade_offers
  add column get_picks uuid[] not null default '{}';

-- Stores a new set of offers; each element is {team_id, partner_id, give, get,
-- get_picks}. The picks must be held by the computer team and still undrafted.
create or replace function public.admin_replace_trade_offers(
  target_season uuid,
  new_offers jsonb
)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  current_season public.seasons;
  item jsonb;
  offer_give uuid[];
  offer_get uuid[];
  offer_picks uuid[];
  made integer := 0;
begin
  select * into current_season from public.seasons where id = target_season for update;
  if not found then
    raise exception 'season_not_found' using errcode = 'P0002';
  end if;
  update public.trade_offers
  set status = 'expired', resolved_at = now()
  where season_id = target_season and status = 'open';

  for item in select * from jsonb_array_elements(coalesce(new_offers, '[]'::jsonb)) loop
    select coalesce(array_agg(x::uuid), '{}') into offer_give
    from jsonb_array_elements_text(item -> 'give') x;
    select coalesce(array_agg(x::uuid), '{}') into offer_get
    from jsonb_array_elements_text(item -> 'get') x;
    select coalesce(array_agg(x::uuid), '{}') into offer_picks
    from jsonb_array_elements_text(coalesce(item -> 'get_picks', '[]'::jsonb)) x;
    if not exists (
      select 1 from public.teams
      where id = (item ->> 'team_id')::uuid
        and league_id = current_season.league_id and local_player_slot is not null
    ) then
      raise exception 'team_not_found' using errcode = 'P0002';
    end if;
    if (select count(*) from public.players
        where league_id = current_season.league_id and status = 'active'
          and team_id = (item ->> 'team_id')::uuid and id = any (offer_give))
         <> cardinality(offer_give)
       or (select count(*) from public.players
           where league_id = current_season.league_id and status = 'active'
             and team_id = (item ->> 'partner_id')::uuid and id = any (offer_get))
            <> cardinality(offer_get) then
      raise exception 'player_not_on_team' using errcode = 'P0001';
    end if;
    if (select count(*) from public.pick_rights
        where league_id = current_season.league_id and season_year > current_season.year
          and team_id = (item ->> 'partner_id')::uuid and id = any (offer_picks))
         <> cardinality(offer_picks) then
      raise exception 'pick_not_on_team' using errcode = 'P0001';
    end if;
    insert into public.trade_offers (
      league_id, season_id, day, team_id, partner_id, give, get, get_picks
    )
    values (
      current_season.league_id, target_season,
      case when current_season.phase = 'regular-season' then current_season.day else 0 end,
      (item ->> 'team_id')::uuid, (item ->> 'partner_id')::uuid,
      offer_give, offer_get, offer_picks
    );
    made := made + 1;
  end loop;
  return made;
end;
$$;

-- Accepting makes the trade, picks included. Other open offers that used a
-- player or a pick that has now moved can't stand.
create or replace function public.admin_accept_trade_offer(target_offer uuid)
returns public.trades
language plpgsql
security invoker
set search_path = ''
as $$
declare
  found_offer public.trade_offers;
  made public.trades;
begin
  select * into found_offer from public.trade_offers where id = target_offer for update;
  if not found then
    raise exception 'offer_not_found' using errcode = 'P0002';
  end if;
  if found_offer.status <> 'open' then
    raise exception 'offer_not_open' using errcode = 'P0001';
  end if;
  made := public.admin_apply_trade(
    found_offer.season_id, found_offer.team_id, found_offer.partner_id,
    found_offer.give, found_offer.get, '{}', found_offer.get_picks
  );
  update public.trade_offers
  set status = 'accepted', resolved_at = now()
  where id = target_offer;
  update public.trade_offers
  set status = 'expired', resolved_at = now()
  where season_id = found_offer.season_id and status = 'open'
    and ((give || get) && (found_offer.give || found_offer.get)
         or get_picks && found_offer.get_picks);
  return made;
end;
$$;
