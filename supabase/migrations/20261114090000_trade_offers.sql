-- Offers from computer teams to the owner (Phase 21). A computer team offers
-- players for one of the owner's; the owner accepts or declines. The owner can
-- only read offers: they are made, expired and accepted by the service role.

create table public.trade_offers (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null references public.leagues (id) on delete cascade,
  season_id uuid not null references public.seasons (id) on delete cascade,
  -- The season's day when it was offered, or 0 in the offseason.
  day smallint not null default 0,
  -- The owner's team, the computer team, what the owner gives and what he gets.
  team_id uuid not null,
  partner_id uuid not null,
  give uuid[] not null,
  get uuid[] not null,
  status text not null default 'open'
    check (status in ('open', 'accepted', 'declined', 'expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  foreign key (league_id, team_id)
    references public.teams (league_id, id) on delete cascade,
  foreign key (league_id, partner_id)
    references public.teams (league_id, id) on delete cascade,
  check (team_id <> partner_id),
  check (cardinality(give) + cardinality(get) > 0)
);

create index trade_offers_team_idx on public.trade_offers (league_id, team_id, status);
create index trade_offers_season_idx on public.trade_offers (season_id, status);

alter table public.trade_offers enable row level security;
grant select on public.trade_offers to authenticated;
create policy "trade_offers: league owner can read"
  on public.trade_offers for select to authenticated
  using (app_private.owns_league(league_id));

-- Replaces the season's open offers with a new set: every open offer expires,
-- then each element of `new_offers` ({team_id, partner_id, give, get}) is
-- stored. The players must be on the teams that would give them.
create function public.admin_replace_trade_offers(
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
    insert into public.trade_offers (
      league_id, season_id, day, team_id, partner_id, give, get
    )
    values (
      current_season.league_id, target_season,
      case when current_season.phase = 'regular-season' then current_season.day else 0 end,
      (item ->> 'team_id')::uuid, (item ->> 'partner_id')::uuid,
      offer_give, offer_get
    );
    made := made + 1;
  end loop;
  return made;
end;
$$;

comment on function public.admin_replace_trade_offers is
  'Expires the season''s open trade offers and stores a new set. Service role only.';

-- Accepts an open offer: makes the trade (with all of admin_apply_trade's
-- checks) and marks the offer accepted, in one transaction.
create function public.admin_accept_trade_offer(target_offer uuid)
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
    found_offer.give, found_offer.get
  );
  update public.trade_offers
  set status = 'accepted', resolved_at = now()
  where id = target_offer;
  -- Other offers that used a player who has now moved can't stand.
  update public.trade_offers
  set status = 'expired', resolved_at = now()
  where season_id = found_offer.season_id and status = 'open'
    and (give || get) && (found_offer.give || found_offer.get);
  return made;
end;
$$;

comment on function public.admin_accept_trade_offer is
  'Accepts an open trade offer by making the trade. Service role only.';

-- Declines an open offer.
create function public.admin_decline_trade_offer(target_offer uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.trade_offers
  set status = 'declined', resolved_at = now()
  where id = target_offer and status = 'open';
  if not found then
    raise exception 'offer_not_open' using errcode = 'P0001';
  end if;
end;
$$;

comment on function public.admin_decline_trade_offer is
  'Declines an open trade offer. Service role only.';

revoke execute on function public.admin_replace_trade_offers(uuid, jsonb),
  public.admin_accept_trade_offer(uuid), public.admin_decline_trade_offer(uuid)
  from public, anon, authenticated;
grant execute on function public.admin_replace_trade_offers(uuid, jsonb),
  public.admin_accept_trade_offer(uuid), public.admin_decline_trade_offer(uuid)
  to service_role;
