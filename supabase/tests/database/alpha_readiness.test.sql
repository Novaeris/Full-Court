-- Policy acknowledgments, support requests, rate limits and analytics.
-- Run with: supabase test db
begin;
\ir helpers.psql

select plan(26);

insert into auth.users (id, aud, role, email, raw_user_meta_data)
values
  ('11111111-1111-1111-1111-111111111111', 'authenticated', 'authenticated',
   'alice@example.test', '{"display_name": "Alice", "terms_version": "1"}'),
  ('22222222-2222-2222-2222-222222222222', 'authenticated', 'authenticated',
   'bob@example.test', '{"display_name": "Bob", "terms_version": "not a number"}');

-- Terms accepted at sign-up ------------------------------------------------------------
select is(
  (select terms_version from profiles where id = '11111111-1111-1111-1111-111111111111'),
  1,
  'sign-up records the Terms version from the form'
);
select isnt(
  (select terms_accepted_at from profiles where id = '11111111-1111-1111-1111-111111111111'),
  null,
  'sign-up records when the Terms were accepted'
);
select is(
  (select terms_version from profiles where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'a malformed Terms version is ignored'
);
select is(
  (select alpha_notice_version from profiles where id = '11111111-1111-1111-1111-111111111111'),
  null,
  'new accounts have not acknowledged the alpha notice yet'
);

-- Clients change acknowledgments only through the functions ---------------------------
set local role authenticated;
select pg_temp.act_as('22222222-2222-2222-2222-222222222222');

select throws_ok(
  'update profiles set terms_version = 5, terms_accepted_at = now()',
  '42501',
  null,
  'users cannot write the Terms columns directly'
);
select throws_ok(
  'update profiles set alpha_notice_version = 5, alpha_notice_acknowledged_at = now()',
  '42501',
  null,
  'users cannot write the alpha notice columns directly'
);

select lives_ok('select accept_terms(2)', 'users can accept the Terms');
select lives_ok('select acknowledge_alpha_notice(3)', 'users can acknowledge the alpha notice');
select throws_ok('select acknowledge_alpha_notice(0)', '22023', null, 'versions must be positive');

select is(
  (select terms_version from profiles where id = '22222222-2222-2222-2222-222222222222'),
  2,
  'accept_terms stores the version'
);
select is(
  (select alpha_notice_version from profiles where id = '22222222-2222-2222-2222-222222222222'),
  3,
  'acknowledge_alpha_notice stores the version'
);
select isnt(
  (select alpha_notice_acknowledged_at from profiles where id = '22222222-2222-2222-2222-222222222222'),
  null,
  'acknowledge_alpha_notice stores the time'
);

reset role;
select is(
  (select alpha_notice_version from profiles where id = '11111111-1111-1111-1111-111111111111'),
  null,
  'acknowledging changes only the caller''s own profile'
);

-- Private tables are out of every client's reach ----------------------------------------
set local role anon;
select throws_ok('select * from app_private.support_requests', '42501', null,
  'anon cannot read support requests');
select throws_ok(
  $$select admin_submit_support_request('0123456789abcdef', null, 'A', 'a@example.test', 'bug', 'S', 'M')$$,
  '42501', null, 'anon cannot submit through the server-only function');
select throws_ok('select accept_terms(1)', '42501', null, 'anon cannot accept Terms');

set local role authenticated;
select pg_temp.act_as('11111111-1111-1111-1111-111111111111');
select throws_ok('select * from app_private.support_requests', '42501', null,
  'signed-in users cannot read support requests');
select throws_ok('select * from app_private.analytics_daily', '42501', null,
  'signed-in users cannot read analytics');
select throws_ok($$select admin_record_event('page_view', '/')$$, '42501', null,
  'signed-in users cannot record analytics directly');

-- Support requests and rate limits (server only) -----------------------------------------
reset role;
set local role service_role;

select isnt(
  admin_submit_support_request('sender-aaaaaaaaaaaaaaaa', '11111111-1111-1111-1111-111111111111',
    ' Alice ', 'alice@example.test', 'bug', ' Crash ', ' It broke. '),
  null,
  'the server can store a support request'
);
select admin_submit_support_request('sender-aaaaaaaaaaaaaaaa', null, 'A', 'a@example.test', 'general', 'S', 'M');
select admin_submit_support_request('sender-aaaaaaaaaaaaaaaa', null, 'A', 'a@example.test', 'general', 'S', 'M');
select is(
  admin_submit_support_request('sender-aaaaaaaaaaaaaaaa', null, 'A', 'a@example.test', 'general', 'S', 'M'),
  null,
  'a fourth request in ten minutes from one sender is refused'
);
select isnt(
  admin_submit_support_request('sender-bbbbbbbbbbbbbbbb', null, 'B', 'b@example.test', 'feature', 'S', 'M'),
  null,
  'other senders are not affected'
);

reset role;
select is(
  (select subject from app_private.support_requests where user_id = '11111111-1111-1111-1111-111111111111'),
  'Crash',
  'support requests are stored trimmed'
);

-- Analytics -----------------------------------------------------------------------------
set local role service_role;
select admin_record_event('page_view', '/pgtap/[only]');
select admin_record_event('page_view', '/pgtap/[only]');
select admin_record_event('league_created');
reset role;

select is(
  (select hits from app_private.analytics_daily
   where day = current_date and event = 'page_view' and path = '/pgtap/[only]'),
  2::bigint,
  'events are counted per day and route pattern'
);
select throws_ok(
  $$select admin_record_event('purchase', '')$$,
  '23514', null, 'only known events can be recorded'
);

-- Deleting an account deletes its support requests ----------------------------------------
delete from auth.users where id = '11111111-1111-1111-1111-111111111111';
select is(
  (select count(*)::int from app_private.support_requests
   where user_id = '11111111-1111-1111-1111-111111111111'),
  0,
  'support requests are deleted with the account'
);

select * from finish();
rollback;
