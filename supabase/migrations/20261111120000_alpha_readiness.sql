-- Open alpha readiness: policy acknowledgments, support requests, rate
-- limits and first-party aggregate analytics (docs/ARCHITECTURE.md §3).

-- Policy acknowledgments on profiles ----------------------------------------------
--
-- Which version of the Terms and of the alpha notice each account has seen,
-- and when. Clients can read these (they already read their own profile) but
-- only change them through the functions below, which always stamp now().

alter table public.profiles
  add column terms_version integer check (terms_version > 0),
  add column terms_accepted_at timestamptz,
  add column alpha_notice_version integer check (alpha_notice_version > 0),
  add column alpha_notice_acknowledged_at timestamptz,
  add constraint profiles_terms_pair
    check ((terms_version is null) = (terms_accepted_at is null)),
  add constraint profiles_alpha_notice_pair
    check ((alpha_notice_version is null) = (alpha_notice_acknowledged_at is null));

comment on column public.profiles.terms_version is
  'Version of the Terms of Service the user accepted (null: not yet accepted).';
comment on column public.profiles.alpha_notice_version is
  'Version of the open-alpha notice the user acknowledged (null: not yet).';

-- The sign-up form sends the Terms version the user agreed to as user
-- metadata; record it with the time the account was created.
create or replace function app_private.create_profile_for_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  requested text := btrim(coalesce(new.raw_user_meta_data ->> 'display_name', ''));
  accepted_terms text := new.raw_user_meta_data ->> 'terms_version';
  terms integer;
begin
  if requested = '' then
    requested := btrim(split_part(coalesce(new.email, ''), '@', 1));
  end if;
  if requested = '' then
    requested := 'Player';
  end if;
  if accepted_terms ~ '^[1-9][0-9]{0,3}$' then
    terms := accepted_terms::integer;
  end if;
  insert into public.profiles (id, display_name, terms_version, terms_accepted_at)
  values (
    new.id,
    btrim(left(requested, 40)),
    terms,
    case when terms is null then null else now() end
  );
  return new;
end;
$$;

-- Records that the caller accepted a version of the Terms.
create function public.accept_terms(accepted_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if accepted_version is null or accepted_version not between 1 and 9999 then
    raise exception 'invalid_version' using errcode = '22023';
  end if;
  update public.profiles
     set terms_version = accepted_version, terms_accepted_at = now()
   where id = caller;
end;
$$;

-- Records that the caller acknowledged a version of the open-alpha notice.
create function public.acknowledge_alpha_notice(acknowledged_version integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'Not signed in' using errcode = '42501';
  end if;
  if acknowledged_version is null or acknowledged_version not between 1 and 9999 then
    raise exception 'invalid_version' using errcode = '22023';
  end if;
  update public.profiles
     set alpha_notice_version = acknowledged_version,
         alpha_notice_acknowledged_at = now()
   where id = caller;
end;
$$;

revoke execute on function public.accept_terms(integer) from public, anon;
grant execute on function public.accept_terms(integer) to authenticated;
revoke execute on function public.acknowledge_alpha_notice(integer) from public, anon;
grant execute on function public.acknowledge_alpha_notice(integer) to authenticated;

-- Support requests ---------------------------------------------------------------
--
-- Private: no client role can read or write this table. The web server
-- inserts through admin_submit_support_request() with the secret key.
-- Requests are deleted 12 months after they arrive (Privacy Policy), and
-- with the account that sent them.

create table app_private.support_requests (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  email text not null check (char_length(email) between 3 and 254),
  category text not null check (category in (
    'bug', 'account', 'gameplay', 'feature', 'security', 'general'
  )),
  subject text not null check (char_length(subject) between 1 and 120),
  message text not null check (char_length(message) between 1 and 5000)
);

create index support_requests_created_at on app_private.support_requests (created_at);
create index support_requests_user_id on app_private.support_requests (user_id);

alter table app_private.support_requests enable row level security;
revoke all on app_private.support_requests from public, anon, authenticated, service_role;

comment on table app_private.support_requests is
  'Contact form submissions. Server only. Kept 12 months, deleted with the account.';

-- Fixed-window rate limit counters. `subject` is an HMAC of the client IP
-- address (or a user id), never the raw address. Rows live at most 24 hours.
create table app_private.rate_limits (
  bucket text not null,
  subject text not null,
  window_start timestamptz not null,
  hits integer not null default 0,
  primary key (bucket, subject, window_start)
);

create index rate_limits_window_start on app_private.rate_limits (window_start);

alter table app_private.rate_limits enable row level security;
revoke all on app_private.rate_limits from public, anon, authenticated, service_role;

-- Adds one hit and reports whether the subject is still within `max_hits`
-- for the current window. Also clears counters older than 24 hours.
create function app_private.hit_rate_limit(
  bucket_name text,
  subject_key text,
  window_length interval,
  max_hits integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_window timestamptz :=
    to_timestamp(floor(extract(epoch from now()) / extract(epoch from window_length))
                 * extract(epoch from window_length));
  total integer;
begin
  delete from app_private.rate_limits where window_start < now() - interval '24 hours';

  insert into app_private.rate_limits as r (bucket, subject, window_start, hits)
  values (bucket_name, subject_key, current_window, 1)
  on conflict (bucket, subject, window_start)
    do update set hits = r.hits + 1
  returning hits into total;

  return total <= max_hits;
end;
$$;

revoke execute on function app_private.hit_rate_limit(text, text, interval, integer)
  from public, anon, authenticated, service_role;

-- Stores a support request if the sender is within the limits:
-- 3 per 10 minutes and 10 per day for each sender, 200 per day overall
-- (which also protects the notification email quota).
-- Returns the new request id, or null when a limit was reached.
create function public.admin_submit_support_request(
  sender_key text,
  sender_user uuid,
  sender_name text,
  sender_email text,
  request_category text,
  request_subject text,
  request_message text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  created uuid;
begin
  if sender_key is null or char_length(sender_key) not between 16 and 128 then
    raise exception 'invalid_sender' using errcode = '22023';
  end if;

  -- Keep the retention promise without a scheduler.
  delete from app_private.support_requests where created_at < now() - interval '12 months';

  if not app_private.hit_rate_limit('support:short', sender_key, interval '10 minutes', 3)
     or not app_private.hit_rate_limit('support:day', sender_key, interval '1 day', 10)
     or not app_private.hit_rate_limit('support:all', 'all', interval '1 day', 200) then
    return null;
  end if;

  insert into app_private.support_requests (
    user_id, name, email, category, subject, message
  )
  values (
    sender_user, btrim(sender_name), btrim(sender_email), request_category,
    btrim(request_subject), btrim(request_message)
  )
  returning id into created;

  return created;
end;
$$;

comment on function public.admin_submit_support_request is
  'Stores a contact form submission after rate limiting. Service role only.';

revoke execute on function public.admin_submit_support_request(text, uuid, text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.admin_submit_support_request(text, uuid, text, text, text, text, text)
  to service_role;

-- First-party analytics ------------------------------------------------------------
--
-- Daily totals only: an event name, a route pattern (never a real id) and a
-- count. No user id, IP address, cookie or device identifier is stored, so
-- nothing here identifies a person. Totals are kept 24 months.

create table app_private.analytics_daily (
  day date not null,
  event text not null check (event in (
    'page_view', 'registration_started', 'registration_completed',
    'league_created', 'team_selected', 'simulation_started'
  )),
  path text not null default '' check (char_length(path) <= 120 and path ~ '^(/[A-Za-z0-9_\-\[\]()/]*)?$'),
  hits bigint not null default 0,
  primary key (day, event, path)
);

alter table app_private.analytics_daily enable row level security;
revoke all on app_private.analytics_daily from public, anon, authenticated, service_role;

comment on table app_private.analytics_daily is
  'Aggregate daily usage counts. No personal information. Kept 24 months.';

create function public.admin_record_event(event_name text, event_path text default '')
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into app_private.analytics_daily as a (day, event, path, hits)
  values (current_date, event_name, coalesce(event_path, ''), 1)
  on conflict (day, event, path) do update set hits = a.hits + 1;

  -- Retention: drop totals older than 24 months. Runs only on the first hit
  -- of each total each day, so it stays cheap.
  if not exists (
    select 1 from app_private.analytics_daily
    where day = current_date and event = event_name and path = coalesce(event_path, '') and hits > 1
  ) then
    delete from app_private.analytics_daily where day < current_date - interval '24 months';
  end if;
end;
$$;

comment on function public.admin_record_event is
  'Adds one to today''s total for an event (and route pattern). Service role only.';

revoke execute on function public.admin_record_event(text, text) from public, anon, authenticated;
grant execute on function public.admin_record_event(text, text) to service_role;
