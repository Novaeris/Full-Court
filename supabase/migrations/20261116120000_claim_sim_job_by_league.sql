-- A worker can be limited to one league's jobs. Without a league it claims the
-- oldest queued job of any league, as before. The e2e suite needs this: several
-- tests share one database, each runs a worker, and a worker that claims another
-- test's job (one it left queued on purpose) changes what that test sees.

drop function public.admin_claim_sim_job(text);

create function public.admin_claim_sim_job(
  worker_name text,
  only_league uuid default null
)
returns setof public.sim_jobs
language sql
security invoker
set search_path = ''
as $$
  update public.sim_jobs
  set status = 'running',
      worker = worker_name,
      started_at = coalesce(started_at, now()),
      heartbeat_at = now()
  where id = (
    select id from public.sim_jobs
    where status = 'queued'
      and (only_league is null or league_id = only_league)
    order by created_at
    for update skip locked
    limit 1
  )
  returning *;
$$;

comment on function public.admin_claim_sim_job is
  'Claims the oldest queued job (of one league, if given). Service role only.';
revoke execute on function public.admin_claim_sim_job(text, uuid)
  from public, anon, authenticated;
grant execute on function public.admin_claim_sim_job(text, uuid) to service_role;
