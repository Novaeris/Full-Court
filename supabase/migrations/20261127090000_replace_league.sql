-- Restoring a backup over a league (Phase 44). admin_replace_league() removes
-- one of the owner's leagues and creates a league from a backup document in its
-- place, in one transaction: if the backup can't be restored, the league is
-- left exactly as it was. The league is removed first, so a replace also works
-- when the owner is at the league limit. (The restored league has new ids, as
-- every restore does; see admin_import_league.)

create function public.admin_replace_league(
  owner uuid,
  old_league uuid,
  payload jsonb
)
returns public.leagues
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.leagues where id = old_league and owner_id = owner
  ) then
    raise exception 'league_not_found' using errcode = 'P0002';
  end if;
  delete from public.leagues where id = old_league;
  return public.admin_import_league(owner, payload);
end;
$$;

comment on function public.admin_replace_league is
  'Replaces one of an owner''s leagues with a restored backup, all or nothing. Service role only.';
revoke execute on function public.admin_replace_league(uuid, uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.admin_replace_league(uuid, uuid, jsonb) to service_role;
