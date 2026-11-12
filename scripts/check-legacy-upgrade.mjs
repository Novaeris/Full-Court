#!/usr/bin/env node
/**
 * Checks that leagues created before Owner Mode survive the Owner Mode
 * migrations: it resets the LOCAL Supabase database to the last migration
 * before them, creates an old-style league the way the old server did, applies
 * the newer migrations, and asserts what the old data became.
 *
 * Needs Docker and the Supabase CLI with `supabase start` running. It only
 * touches the local database, and finishes with a full `supabase db reset`.
 *
 * Usage: node scripts/check-legacy-upgrade.mjs
 */
import { execFileSync, execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/** The newest migration that existed before Owner Mode. */
const LAST_LEGACY_MIGRATION = "20261111120000";

const projectId =
  /^project_id\s*=\s*"([^"]+)"/m.exec(
    readFileSync("supabase/config.toml", "utf8"),
  )?.[1] ?? "full-court";
const container = `supabase_db_${projectId}`;

const psql = (sql) =>
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      container,
      "psql",
      "-U",
      "postgres",
      "-v",
      "ON_ERROR_STOP=1",
      "-tA",
    ],
    { encoding: "utf8", input: sql, stdio: ["pipe", "pipe", "inherit"] },
  ).trim();
// The Supabase CLI may be a .cmd shim on Windows, so run it through the shell.
// Every argument is a constant in this file.
const supabase = (...args) =>
  execSync(`supabase ${args.join(" ")} --local`, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

console.log(`Resetting the local database to ${LAST_LEGACY_MIGRATION}…`);
supabase("db", "reset", "--version", LAST_LEGACY_MIGRATION);

console.log("Creating an old-style league and a league still in setup…");
psql(`
insert into auth.users (id, aud, role, email)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa','authenticated','authenticated','legacy@example.test');
select public.admin_create_league(
  'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Legacy', 'compact', 'seed', array[1,2,3,4]::bigint[],
  (select jsonb_agg(jsonb_build_object(
     'abbreviation','T'||lpad(n::text,2,'0'), 'city','City '||n, 'nickname','Team '||n,
     'conference', case when n <= 6 then 'East' else 'West' end,
     'division', 'Mountain West ' || ((n-1)/3),
     'primary_color','#1d4ed8', 'secondary_color','#facc15') order by n)
   from generate_series(1,12) n),
  (select jsonb_agg(jsonb_build_object(
     'team','T'||lpad(t::text,2,'0'), 'first_name','P', 'last_name', t||'-'||s,
     'position','PG', 'age',25, 'height_inches',78, 'weight_pounds',215, 'jersey',s,
     'overall',60, 'potential',65, 'inside',60, 'mid_range',60, 'three_point',60,
     'free_throw',60, 'passing',60, 'ball_handling',60, 'off_rebound',60,
     'def_rebound',60, 'perimeter_d',60, 'interior_d',60, 'speed',60, 'strength',60,
     'stamina',60))
   from generate_series(1,12) t, generate_series(1,15) s));
update public.leagues set user_team_id = (select id from public.teams where abbreviation = 'T03'),
  status = 'active' where name = 'Legacy';
insert into public.leagues (owner_id, name, size, seed, rng_state)
values ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', 'Setup league', 'compact', 's2', '{}');
`);

console.log("Applying the newer migrations…");
supabase("migration", "up");

const checks = [
  [
    "old leagues have no config and keep their size and status",
    `select string_agg(name||':'||size||':'||status||':'||(config is null)||':'||coalesce(config_schema_version::text,'-'), ',' order by name) from public.leagues`,
    "Legacy:compact:active:true:-,Setup league:compact:setup:true:-",
  ],
  [
    "conferences became rows with stable ids and the same display names",
    `select string_agg(id||'='||name, ',' order by sort_order) from public.league_conferences`,
    "east=Eastern,west=Western",
  ],
  [
    "divisions became rows under their conferences",
    `select count(*)||':'||count(distinct conference_id) from public.league_divisions`,
    "4:2",
  ],
  [
    "every team references a conference and division, and nothing was lost",
    `select count(*)||':'||count(*) filter (where conference_id is not null and division_id is not null) from public.teams`,
    "12:12",
  ],
  [
    "all 180 players are still there on their teams",
    `select count(*)||':'||count(team_id) from public.players`,
    "180:180",
  ],
  [
    "the chosen team became Player 1's, and only that team",
    `select string_agg(abbreviation, ',') from public.teams where local_player_slot = 1`,
    "T03",
  ],
  [
    "Player 1 exists for the league with a chosen team only",
    `select count(*) from public.league_local_players`,
    "1",
  ],
  [
    "user_team_id still points at the chosen team",
    `select t.abbreviation from public.leagues l join public.teams t on t.id = l.user_team_id`,
    "T03",
  ],
  [
    "no AI Assist is on anywhere",
    `select count(*) from public.teams where ai_trades or ai_roster_coverage or ai_roster_management or ai_scouting or ai_drafting`,
    "0",
  ],
];

let failed = 0;
for (const [label, sql, expected] of checks) {
  const actual = psql(sql);
  const ok = actual === expected;
  if (!ok) failed++;
  console.log(
    `${ok ? "ok  " : "FAIL"} ${label}${ok ? "" : `\n     expected ${expected}\n     got      ${actual}`}`,
  );
}

console.log("Restoring the local database to the latest migrations…");
supabase("db", "reset");

if (failed > 0) {
  console.error(`\n${failed} check(s) failed.`);
  process.exit(1);
}
console.log("\nLegacy leagues survive the upgrade.");
