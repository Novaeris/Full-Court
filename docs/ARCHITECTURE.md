# Architecture

The authoritative technical reference for Full Court. When an architectural decision changes, update this file before or alongside the code.

Full Court ships first as a **website**. It will later ship as an **iOS/Android app** (React Native + Expo) and possibly a **desktop/Steam app**. Every decision here keeps those later apps possible without restructuring the repository. Future platform plans: [MOBILE.md](./MOBILE.md), [DESKTOP.md](./DESKTOP.md).

## Stack

| Concern         | Choice                                                               |
| --------------- | -------------------------------------------------------------------- |
| Language        | TypeScript (strict), on Node 24                                      |
| Monorepo        | pnpm workspaces + Turborepo                                          |
| Web app and API | Next.js (App Router) on Render                                       |
| Styling         | Tailwind CSS, driven by `@fullcourt/design-tokens`                   |
| Database        | Supabase Postgres (source of truth), SQL migrations via Supabase CLI |
| Auth            | Supabase Auth                                                        |
| Validation      | zod (`@fullcourt/validation`)                                        |
| Tests           | Vitest (unit), Playwright (web e2e), pgTAP (database and RLS)        |

## 1. Repository layout

```text
apps/
  web/            Next.js: website + application API (/api/v1)
  worker/         Render background worker that runs simulation jobs
  mobile/         (future) Expo / React Native app
  desktop/        (future) desktop / Steam app
packages/
  shared/         tiny platform-free utilities (Result, invariant)
  game-types/     domain types and constants
  game-rules/     league rules and legality checks, as pure functions
  game-engine/    seeded RNG, generators, simulation: pure and deterministic
  validation/     zod schemas for every API request and response
  api-client/     typed client for /api/v1 (plus typed Supabase helpers from Phase 2)
  design-tokens/  design tokens: web CSS variables now, React Native later
supabase/         config.toml, migrations/, tests/ (pgTAP)
e2e/              Playwright specs for the web app
scripts/          verify, boundary check, secret scan, legacy-upgrade check
.github/          CI workflow that runs pnpm verify
docs/             this file, DESIGN, MOBILE, DESKTOP, operations
```

Directories marked "future" or with a phase number do not exist yet.

There is deliberately **no shared UI component package**. React DOM and React Native components don't share well. The platforms share tokens, types, rules, the engine, validation and the API client, and each app builds its own UI.

### Why pnpm + Turborepo

- **pnpm** gives each workspace only the dependencies its own `package.json` declares. A package can't silently import React because some other package installed it.
- **Turborepo** runs `build`, `typecheck` and `test` across packages in dependency order, with a local cache. The remote cache is off.
- Expo supports pnpm monorepos, so `apps/mobile` can be added later without moving anything.
- Nx was considered and rejected as more tooling than a one-developer project needs.

### Package conventions

- Every package is named `@fullcourt/<name>` and is an internal **source package**: `exports` points at `src/index.ts`, and the consuming app compiles it. Next uses `transpilePackages`, Expo uses Metro, and the worker will use tsx or a bundler. No package has a build step until one is needed.
- Each package has `typecheck` and `test` scripts. `tsconfig.json` type-checks the source with the package's platform restrictions. `tsconfig.test.json` type-checks tests with Node types.

### Dependency direction

```text
shared  ←  game-types  ←  game-rules  ←  game-engine
              ↑
         validation (zod)  ←  api-client
              ↑                  ↑
     apps/web · apps/worker · apps/mobile · apps/desktop
```

| Package         | May depend on (`@fullcourt/*`) | Third-party runtime deps |
| --------------- | ------------------------------ | ------------------------ |
| `shared`        | nothing                        | none                     |
| `game-types`    | shared                         | none                     |
| `game-rules`    | shared, game-types             | none                     |
| `game-engine`   | shared, game-types, game-rules | none                     |
| `design-tokens` | nothing                        | none                     |
| `validation`    | shared, game-types             | zod                      |
| `api-client`    | shared, game-types, validation | @supabase/supabase-js    |

- Apps may use any package. Packages never depend on apps, and apps never import each other.
- Three layers enforce these rules, and `pnpm verify` runs all of them:
  1. pnpm's strict installs.
  2. ESLint rules scoped by path (`eslint.config.mjs`).
  3. `scripts/check-boundaries.mjs`, which checks declared dependencies, every import in package source, Node built-ins and the service-role key rule (§3). The table above lives in that script, so change both together.

## 2. Shared game engine

`game-types`, `game-rules` and `game-engine` (plus `shared` and `design-tokens`) must run unchanged in Node (web server, worker), browsers, Hermes (React Native) and desktop runtimes.

- **No platform APIs.** These packages type-check with `lib: ["ES2022"]` and `types: []`, so `window`, `document`, `process`, `Buffer` and `fetch` don't exist for them. ESLint also bans those globals and the `react`, `next` and `node:*` imports.
- **No platform dependencies.** These packages have no third-party runtime dependencies. React, Next, Supabase and I/O are not allowed.
- **Deterministic.** All randomness comes from the engine's seeded RNG (`createRng(seedState(seed))`). Its state is four 32-bit integers that save as JSON and resume exactly.
  - ESLint bans `Math.random`, `Date.now`, `new Date()`, `performance.now` and `crypto.randomUUID`.
  - Game time is passed in as data and never read from the clock.
  - A pinned-sequence test locks the RNG output across releases and platforms.
- **JSON-safe data.** Values that cross a package boundary are plain objects, arrays, strings, numbers and booleans. No `Map`, `Set`, class instances or `bigint`. The same value can then be a Postgres row, an API response or mobile storage.
- **Rows in, rows out.** Simulation functions take only the rows they need and return only the rows that changed, e.g. `simulateDay(input) → { games, plays, boxScores, rngState }`. There is no whole-league save object.

## 3. Shared backend

Supabase Postgres is the single source of truth for accounts, leagues, players, games, stats and progress on every platform. The product is **online-first**: progress always lives in Postgres. The portable engine keeps an offline mode possible later, but none is designed now.

### Choosing a data path

| Path                              | Use it for                                                                                                                                          | Who calls it                   |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| **Direct Supabase, RLS enforced** | Reads, Realtime subscriptions, trivial owner-scoped writes (rename a league, edit display name)                                                     | every client, with its own JWT |
| **Postgres function (RPC)**       | Atomic multi-row writes that need no TypeScript game logic                                                                                          | every client, `supabase.rpc`   |
| **Application API `/api/v1`**     | Anything that needs game rules or the engine, authorization beyond RLS, or coordinated writes: create a league, sign a player, enqueue a simulation | every client, over HTTPS       |

Rule: if a write needs game rules or touches more than one aggregate, it goes through the API, or through an RPC when no TypeScript logic is involved. Clients never assemble multi-table game writes themselves.

### Application API

- **Versioned JSON** under `/api/v1/*`. Every request and response has a zod schema in `@fullcourt/validation`, and the server validates both directions. Errors always use `{ "error": { "code": string, "message": string } }`.
- **`apiRoute()`** (`apps/web/src/server/api/handler.ts`) wraps every route handler. It runs at request time, parses and validates the body, validates the response, and maps errors: `ApiError` becomes its status and code, and anything unexpected becomes a generic 500 without the details. Unknown `/api/v1` paths return a JSON 404.
- **`@fullcourt/api-client`** wraps the API with typed functions built on an injected `fetch`. It has no React or Next dependency, so mobile and desktop use it as-is.
- **One service layer.** Business logic lives in `apps/web/src/server/services/*` as functions of `(ctx, input)`. Route handlers, Server Actions and Server Components are thin adapters that call these services. If the API ever needs its own Render service, the services move to `apps/api` unchanged.
- **Auth.** The API accepts either the web session cookie or `Authorization: Bearer <Supabase access token>` (mobile, desktop). It verifies the token with Supabase and queries as that user, so RLS still applies inside the API.

### Database rules

- **Rows, not blobs.** Data lives in normal relational rows keyed by `league_id`. A simulation step writes only what changed.
- **Migrations.** Every schema change is a Supabase CLI migration in `supabase/migrations/`. `supabase gen types` writes the database types into `@fullcourt/api-client`.
- **No client access by default.** The baseline migration revokes the grants Supabase normally gives `anon` and `authenticated` on new objects in `public`. A migration that adds a table must enable RLS, write policies, and grant only what clients need. pgTAP tests prove one user can't read or change another user's data.
- **Internal tables** (job queue internals, audit logs) live in a schema the Data API doesn't expose.

### Current tables

| Table                                                                                    | Owner check             | Client grants                 | Writes that must go through a function                                                                                                                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------------------------- | ----------------------- | ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`                                                                               | `id = auth.uid()`       | select; update `display_name` | Created by the sign-up trigger; removed by `delete_own_account()`                                                                                                                                                                                                                                                                                                                                                                      |
| `leagues`                                                                                | `owner_id = auth.uid()` | select, delete; update `name` | Created only by `admin_create_league(...)` (original layouts) or `admin_create_owner_league(...)` (Owner Mode), both service role, together with the whole world; they enforce the 5-per-account limit under an advisory lock. Owner Mode leagues store `config` and `config_schema_version`; leagues from before Owner Mode have both null. The user's team in an original-layout league is set once with `choose_team(league, team)` |
| `teams`, `players`                                                                       | owner of `league_id`    | select                        | Written only by the two creation functions, so no client can forge a roster. `teams` also holds the franchise: `conference_id`/`division_id`, `city_id` (unique per league), `logo_id`, `local_player_slot`, and the five `ai_*` flags                                                                                                                                                                                                 |
| `league_conferences`, `league_divisions`                                                 | owner of `league_id`    | select                        | Created with the league. Display names change only through `rename_structure(...)`; ids never change                                                                                                                                                                                                                                                                                                                                   |
| `league_local_players`                                                                   | owner of `league_id`    | select                        | Created with the league (and by `choose_team` for Player 1)                                                                                                                                                                                                                                                                                                                                                                            |
| `profiles` (policy columns)                                                              | `id = auth.uid()`       | select                        | `terms_version`/`terms_accepted_at` are set by the sign-up trigger or `accept_terms(v)`; `alpha_notice_version`/`alpha_notice_acknowledged_at` by `acknowledge_alpha_notice(v)`. Both stamp `now()`                                                                                                                                                                                                                                    |
| `app_private.support_requests`, `app_private.rate_limits`, `app_private.analytics_daily` | none                    | none (no client role)         | Written only through `admin_submit_support_request(...)` and `admin_record_event(...)` (service role). Retention is enforced inside those functions: support 12 months, rate limits 24 hours, analytics 24 months                                                                                                                                                                                                                      |

- **Server-generated worlds.** `createLeague` generates the world with `@fullcourt/game-engine` from a random seed on the server, then calls `admin_create_league` through the admin client in `apps/web/src/server/admin/`, the only code allowed to use the secret key. The league stores its seed and the RNG state after generation, so later simulation continues deterministically.
- **Not found, not forbidden.** Another user's row isn't visible under RLS, so the services report `404 league_not_found` rather than revealing that it exists.
- **Cascades.** Deleting the auth user cascades to profiles and leagues. Every future table hangs off `league_id` with `on delete cascade`, so deleting a league deletes everything in it.
- **Pages and the API share one service layer.** `/leagues`, `/leagues/new` and `/leagues/[leagueId]/…` use Server Actions, and `GET`/`POST /api/v1/leagues` plus `GET`/`PATCH`/`DELETE /api/v1/leagues/:leagueId` serve other clients. Both call `apps/web/src/server/services/leagues.ts`.

### Owner Mode: league setup and creation

Owner Mode is how a league is set up before it starts: structure, region, playoffs, local players and franchises. It extends the existing creation pipeline rather than replacing it.

**Data model** (`*_owner_mode.sql`, `*_rename_structure.sql`)

- **Stable ids, editable names.** `league_conferences` and `league_divisions` hold an immutable `id` (a slug) and a display `name`. `teams` references them by id through composite foreign keys, so renaming never breaks a reference and a team can't sit in a division of another conference or league. Names are unique per league (conferences) and per conference (divisions).
- **Local players and franchises.** `league_local_players` holds Player 1…8. `teams.local_player_slot` says who runs a franchise (null = AI) and is deliberately not unique, so one player can run several franchises. `leagues.user_team_id` remains as a legacy mirror of Player 1's first franchise.
- **AI Assist.** Five booleans on `teams` (`ai_trades`, `ai_roster_coverage`, `ai_roster_management`, `ai_scouting`, `ai_drafting`), all off by default, and a check that allows them only on locally controlled franchises. Only the permissions are stored; no AI behaviour exists yet.
- **Rules config.** `leagues.config` (jsonb) and `leagues.config_schema_version` hold `{ schemaVersion, preset, region, fantasyDraft, playoffs }`. Both are null for leagues created before Owner Mode. The JSON's `schemaVersion` must equal the column and `app_private.valid_league_config` checks the shape. Structure, teams and local players live in their own tables and are not repeated in the config.
- **Playoffs** are stored as `{ teams, seeding: "conference" | "league", autoQualifyDivisionLeaders, divisionLeaderTopSeeds, roundSeriesLengths }`: structured so a future simulation can use them. `seedPlayoffTeams` in `game-rules` defines the seeding semantics (division leaders qualify and take the top seeds, the rest go by record) and is tested, but nothing simulates playoffs yet.
- **Functions.** Clients have no write grants on any of these tables. `admin_create_owner_league(...)` (service role) writes a whole league in one transaction and re-checks structure, local players, cities, logos and config; `admin_create_league(...)` still creates the original fictional-city layouts and writes the same structure rows; `rename_structure(...)` (`security definer`, owner-checked) renames many conferences and divisions atomically, even swapping two names.

**Rules, engine and validation** (pure packages, no platform APIs)

- `game-types/owner-mode`: types and constants. `game-rules/owner-mode`: structure rules (integrity always; "supported" rules for what the creation flow offers now: equal divisions, 1–4 conferences, 8–32 teams, at least two divisions), playoff rules and defaults, local-player and franchise rules, `seedPlayoffTeams`, and `legacySettings`. The stored model is an explicit list of conferences and divisions, so unequal divisions are representable later by changing only the supported-structure rule.
- `game-engine`: the city catalogue (`world/cities/`: ids like `na-us-new-york`, integer coordinates, five regions), `selectCities`, `assignGeography` (balanced clustering into conferences then divisions, no trigonometry so every JavaScript engine agrees), `planOwnerLeague` (cities, geographic structure and a franchise identity for every team, with no rosters) and `generateOwnerWorld` (the plan plus full rosters). The original `generateWorld` is unchanged and pinned by a test. Pinned hashes also lock every region's geography and generated leagues.
- `validation/owner-mode`: zod shapes (`LeagueConfigSchema` discriminated on `schemaVersion`, the create-league `setup`, the rename request, settings). Cross-field rules live in `game-rules`; callers run both.
- The Australia region is "Australia & Oceania" and includes New Zealand and a few Pacific capitals, because Australia alone has too few major cities for a 32-team league with no repeated city. Region boundaries: Mexico and Central America count as North America, Russia west of the Urals as Europe and east as Asia, and Turkey and the Middle East as Asia.

**Creation flow** (`/leagues/new`)

1. A four-step form (basics, playoffs and options, franchises, review) edits a plain draft with a reducer (`components/leagues/setup/draft.ts`). It posts `{ name, setup }` to the same `createLeague` service as `POST /api/v1/leagues`.
2. The service validates against the game rules, generates the league with `generateOwnerWorld`, checks the generated league against the rules again, and writes it with `admin_create_owner_league`. The client sends an `identitySeed` that fixes the generated franchises; the server picks the roster seed itself, so no client can choose a roster.
3. A request without `setup` still creates the original league (`standard` or `compact`, fictional cities, no team chosen yet).
4. The server re-validates everything: cities belong to the region and are unique, logos are built in, team names are unique, primary colours stay readable in white, AI Assist is only on local franchises, and name overrides refer to real ids.

**Franchises, preview and names**

- Each local player runs one or more franchises. A franchise has a city, an optional team name, primary and secondary colours and one of 24 built-in logos (stable ids `logo-01`…`logo-24`, drawn as inline SVG in `components/leagues/team-logo.tsx`). Anything left blank is generated.
- The review step previews the whole league with `planOwnerLeague`, the same pure function the server runs, so the preview is exactly what is created. **Shuffle league** picks a new `identitySeed`. Generated conferences and divisions can be renamed in the preview (sent as `names` overrides keyed by id) and later from league settings (`renameStructureAction`, or `GET`/`PATCH /api/v1/leagues/:leagueId/structure`).
- League pages show every team people run: "Your team" for one, "Your teams" for several, grouped by player when more than one person plays (`League.localPlayerCount`). The teams list marks each team with its player, and the roster tab lets you pick which of your teams to open.

**Reading back and compatibility**

- `getSettings` (`GET /api/v1/leagues/:leagueId/settings`) returns the stored rules, or for a league created before Owner Mode a view derived from its size by `legacySettings`. Nothing is ever written back to old leagues. League settings shows them read-only, with each franchise's AI Assist.
- Old leagues keep working: the migration backfills conference and division ids (`east`/`west` keep the display names "Eastern"/"Western"), makes the chosen team Player 1's and leaves `config` null. `pnpm check:legacy-upgrade` proves this against a populated local database (see [operations.md](./operations.md)).

**Out of scope for this feature:** AI behaviour behind AI Assist, the fantasy draft itself, playoff simulation, online multiplayer, franchise relocation, custom logo uploads, and editing franchises after creation.

**Defaults chosen** (change by editing the named constants or rules): division leaders seeded first = best 4 (`divisionLeaderTopSeeds`), at most 8 local players (`MAX_LOCAL_PLAYERS`), 8–32 teams with equal divisions, power-of-two playoff team counts with no byes or play-in, directional generated names (editable), and AI franchises are not editable during creation.

### Secrets and the service role

- The Supabase **publishable (anon) key** is public by design and may go to browsers and apps. RLS protects the data.
- The **secret (service-role) key** bypasses RLS. Only `apps/worker` and the audited modules in `apps/web/src/server/admin/` may use it. It lives only in Render environment variables and git-ignored local env files.
- `scripts/check-boundaries.mjs` fails the build when the key is mentioned anywhere else, or when any `NEXT_PUBLIC_` variable looks like a secret.
- The repository is **public**. `scripts/scan-secrets.mjs` runs in a pre-commit hook and in `pnpm verify`.

### Season model (roadmap phases 5 and 6)

Product design: [DESIGN.md](./DESIGN.md#the-season-owner-mode). Where the pieces live:

- `game-types/src/season.ts`: `SeasonState`, `ScheduleTiers`, `Game`, `PlayerGameLine`, `BoxScore`, `TeamStrategy` and their defaults.
  - Plays are placed on a full court in feet (`CourtPoint`: x 0 to 94 along the court, y 0 to 50 across; `LEFT_BASKET`, `RIGHT_BASKET`). `attacksRight(period, home)` in `game-rules/src/season/court.ts` says which basket a team attacks: home attacks right in periods 1 and 2, left afterwards. `PlayEvent.transition` flags fast-break plays.
- `game-rules/src/season/schedule.ts`: matchup tiers, opponent counts, `seasonLength` and `validateScheduleTiers`.
- `game-rules/src/season/standings.ts`: `rankStandings` (deterministic tiebreakers). Its rows extend `StandingEntry`, so they pass straight to `seedPlayoffTeams`.
- `game-engine/src/season/` (Phase 11):
  - `generateSchedule({ structure, teams, tiers }, rng)` returns every regular-season `Game`. Pairs with an odd meeting count get their extra home game along an Euler circuit, so each team's home and away totals differ by at most one. Games go on the earliest day both teams are free.
  - `simulateGame(game, home, away, rng)` plays a game possession by possession and returns `{ game, plays, boxScore, starters }`. Inputs are `SimTeam` (id, roster of `SimPlayer`, `TeamStrategy`), so the engine needs no database rows.
  - `buildBoxScore(gameId, plays, starters, teamOf)` derives the box score from the plays alone. `simulateGame` uses it, and the tests check that lines add up to the score.
  - `simulateDay({ games, teams, rngState })` returns `{ games, plays, boxScores, rngState }`: only the rows that changed. Games run in the order given and share one RNG.
  - A possession starts from an `Origin` (steal, defensive rebound or other). `transitionChance` turns that, the teams' speed ratings and pace into the chance of a fast break; breaks use a shorter clock, a rim-heavy shot mix and a make-chance bonus. Substitutions only happen on dead balls.
  - The tuning constants sit at the top of `game.ts`. `game.test.ts` keeps league-wide averages (scoring, shooting splits, threes, free throws, fouls, steals, blocks, assists, turnovers, rebounds, fast-break share, starter minutes, home edge) inside NBA 2010 to 2020 bounds, so a change that wrecks the balance fails a test.
- Player fatigue lives inside a game only. Between-game state (injuries, season-long fatigue) and `playerUpdates` come with the owner loop.
- Still to come: the season pages.

### Season tables and the simulation queue (Phase 12)

Migration `20261112150000_season_core.sql`. Every table hangs off `league_id` with `on delete cascade`, is read-only for the league owner under RLS, and is written only by service-role functions.

| Table             | Holds                                                                                                                                              |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seasons`         | `year`, `phase` (`regular-season`, `playoffs`, `complete`), `day` (next day to simulate), `last_day`, and the schedule preset and tiers used       |
| `games`           | One row per scheduled game: day, home and away team, `status`, scores and overtimes. Scores exist only when final, and there are no ties           |
| `play_events`     | The play-by-play, one row per `PlayEvent` (snake_case columns, `at_x`/`at_y` on the full court). Primary key `(game_id, seq)`                      |
| `box_score_lines` | One row per player who played, derived from the plays. The lines of each team add up to the game's score (checked on commit)                       |
| `sim_jobs`        | The queue: `kind` (`day`, `week`, `season`), `status`, `days_requested`, `days_done`, `error`, `worker` and a heartbeat. One active job per league |

Rules that keep it consistent:

- **Same-league references.** Games, plays, lines and jobs reference seasons, teams and players by `(league_id, id)`, so nothing can point into another league. `players` gained `unique (league_id, id)` for this.
- **The calendar.** A season is in `regular-season` exactly while `day <= last_day`. Committing the last day moves it to `playoffs`.
- **Schedule choice.** The preset and tiers are stored on the season. The league setup does not collect them yet; until it does, the server creates seasons with the standard preset.

Functions:

| Function                                                         | Caller       | Does                                                                                                                                                                                                              |
| ---------------------------------------------------------------- | ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `enqueue_sim_job(league, kind)`                                  | owner (RPC)  | Queues a day, week (capped at the days left) or the rest of the regular season. Needs an active league and a running season; refuses a second active job                                                          |
| `cancel_sim_job(job)`                                            | owner (RPC)  | Cancels a queued or running job. Days already committed stay                                                                                                                                                      |
| `admin_create_season(league, year, preset, tiers, schedule)`     | service role | Creates the season and its games in one transaction; refuses an empty schedule or a team playing twice in a day                                                                                                   |
| `admin_claim_sim_job(worker)`                                    | worker       | Claims the oldest queued job with `FOR UPDATE SKIP LOCKED`, or returns nothing                                                                                                                                    |
| `admin_commit_sim_day(job, day, rng_state, games, plays, lines)` | worker       | Commits one day atomically: results, plays, box scores, the league's RNG state, the calendar and job progress. Refuses a repeat, an out-of-order day, a cancelled job or a box score that doesn't match the score |
| `admin_fail_sim_job(job, message)`                               | worker       | Marks a job failed with a trimmed error                                                                                                                                                                           |
| `admin_requeue_stale_sim_jobs(max_age)`                          | worker       | Puts running jobs whose heartbeat is older than `max_age` back in the queue; committed days are never repeated, so the next worker resumes                                                                        |

`sim_jobs` and `seasons` are in the `supabase_realtime` publication, so a client sees progress and the calendar change as days commit.

### Simulation (Phase 13)

1. **Queue.** `POST /api/v1/leagues/:id/sim` (`{ "kind": "day" | "week" | "season" }`) calls `startSimulation` in `apps/web/src/server/services/simulation.ts`. It requires an active league, creates the league's first season if there is none, then calls `enqueue_sim_job`. The first season uses the standard schedule preset, built by `generateSchedule` from the league's own structure and teams, with an RNG seeded from the league id and year so it never disturbs the league's simulation RNG. `GET` returns the season and the latest job; `DELETE` cancels the active job. Errors use the usual envelope (`league_not_active`, `season_not_running`, `job_already_running`, `job_not_found`, `schedule_not_supported`). A successful `POST` counts `simulation_started`.
2. **Worker.** `apps/worker` (Node, run with tsx) loops: it puts jobs whose heartbeat is older than `STALE_AFTER_MS` back in the queue, claims a job with `admin_claim_sim_job`, plays it, and polls every `POLL_INTERVAL_MS` when the queue is empty. For each day it loads that day's games, the rosters of the teams playing and the league's RNG state, runs `simulateDay` from `@fullcourt/game-engine`, and commits with `admin_commit_sim_day`. Teams use the default coaching strategy until strategies are stored.
   - `src/db.ts` is the `WorkerDb` interface, `src/supabase-db.ts` the real implementation, `src/map.ts` the row mapping, `src/run-job.ts` the job logic and `src/loop.ts` the loop. Tests run the job logic against an in-memory `WorkerDb`.
   - **Cancelled or repeated work.** If the commit is refused because the job was cancelled, requeued or the day was already committed, the worker stops without failing anything. Days already committed stay.
   - **Bad data.** If the engine can't simulate the day (a team with fewer than five players, an invalid RNG state), or the database rejects the data (a constraint, or the commit's own consistency checks), the job is marked failed with the reason: retrying the same data can't succeed.
   - **Transient errors.** A network or database error leaves the job running; its heartbeat goes stale and it is requeued, resuming at the next uncommitted day.
   - **Configuration.** `SUPABASE_URL` (or `NEXT_PUBLIC_SUPABASE_URL`) and `SUPABASE_SECRET_KEY`, plus optional `WORKER_ID`, `POLL_INTERVAL_MS` and `STALE_AFTER_MS`. `pnpm --filter @fullcourt/worker once` runs until the queue is empty.
3. **Progress.** Clients follow `sim_jobs` and `seasons` through Supabase Realtime.

Long simulations never run inside an HTTP request or on a client device.

`pnpm --filter @fullcourt/worker smoke` checks the whole chain against a local Supabase (a league, a season, a week, the rest of the season, standings and scoring, then deleting the league). It found that a player could commit a seventh foul, and that deleting a league with a played season took 28 seconds, past the API's 8 second limit, until the cascading foreign keys were indexed.

Measured on a local database for one 30-team season (1,140 games): about 30 seconds to simulate and store (roughly 0.4 seconds a day, 7 days in about 6), 470,000 play rows and 22,000 box score lines, and about 105 MB (67 MB of rows, 38 MB of indexes). Plays are by far the largest table, so how long to keep them is the next storage decision.

### Open alpha: policies, support and analytics

- **Policy text and versions** live in `apps/web/src/content/` (`site.ts`, `policies.ts`, `changelog.ts`). Every page reads from there. Bump a version in `policies.ts` only for a material change: signed-in players are then asked again.
- **Acknowledgments.** Sign-up requires a Terms checkbox (`SignUpRequestSchema.acceptTerms`) and sends `terms_version` as user metadata, which the profile trigger records. `AlphaGate` in `AppShell` shows a modal (`AlphaIntroDialog`) to players whose stored versions are older than the current ones; it records the alpha notice, and the Terms for accounts that predate them.
- **Support form** (`/support`): zod schema in `@fullcourt/validation` (`support.ts`, also rejects messages that look like passwords or tokens), a honeypot field, an HMAC-signed form timestamp (2 s minimum), then `admin_submit_support_request` limits each sender to 3 per 10 minutes and 10 per day, and everyone to 200 per day. The sender is the account, or an HMAC of the IP address keyed by `RATE_LIMIT_SECRET` (`src/server/security/request-signing.ts`); raw IPs are never stored. After the response, `src/server/email/resend.ts` emails a plain-text copy to the support inbox when `RESEND_API_KEY` and `SUPPORT_EMAIL_FROM` are set.
- **Analytics** are first-party daily totals, never per person. Browsers send `page_view` and `registration_started` to `POST /api/v1/events` with `credentials: "omit"`; the server reduces paths to route patterns (`src/server/analytics/routes.ts`, unknown paths become `/(other)`). The server records `registration_completed` (at `/auth/confirm`), `league_created` and `team_selected` with `trackEvent()`. `simulation_started` (at `POST /api/v1/leagues/:id/sim`) is recorded the same way. Global Privacy Control and Do Not Track switch counting off, in the browser and on the server.
- **Maintenance mode.** `MAINTENANCE_MODE=on` makes `src/proxy.ts` answer pages with a self-contained 503 page and `/api/*` with the JSON error envelope (`code: "maintenance"`). The health checks are outside the proxy matcher and keep answering.

## 4. Authentication across platforms

There is one identity per person on every platform: the Supabase Auth user id (`auth.users.id`, a UUID). All data keys on that id, never on email. Display data lives in `profiles`. Later sign-in methods (Apple, Google) attach to the same user through identity linking. Platform ids such as a Steam id go in a future `linked_accounts` table.

| Platform      | Session handling                                                                                                                                                                                                                                                                                                   |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web (Phase 2) | `@supabase/ssr` cookie sessions, refreshed in Next's proxy. Email confirmation and password reset use the `token_hash` link flow through a `/auth/confirm` route.                                                                                                                                                  |
| iOS/Android   | `supabase-js` with an encrypted AsyncStorage session (key held in `expo-secure-store`), `detectSessionInUrl: false`, and auto-refresh tied to `AppState`. Email and OAuth flows use PKCE and deep links. If any third-party login is offered on iOS, Sign in with Apple is required. See [MOBILE.md](./MOBILE.md). |
| Desktop/Steam | `supabase-js` with PKCE in the system browser and a custom-scheme or loopback redirect. Refresh tokens are kept in the OS keychain. Steam is not a Supabase provider: a Steam id is verified server-side and linked to an existing account. See [DESKTOP.md](./DESKTOP.md).                                        |

Fixed now so later clients fit:

- The API accepts Bearer tokens from Phase 2 onward, with tests.
- Email templates use the `token_hash` format.
- The redirect-URL allowlist is managed per environment in [operations.md](./operations.md).

### How the web app does it

- **One seam.** `apps/web/src/server/auth/session.ts` provides `getUserContext()`, `getCurrentUser()` and `requireUserContext(returnTo)`. It verifies the JWT with `getClaims()` and returns a Supabase client acting as the user. Pages, Server Actions and API routes all go through it; nothing reads auth cookies directly.
- **Proxy is not the gate.** `src/proxy.ts` refreshes the session cookies and routes signed-in players (below), but never decides access. Each page, Server Action and API route checks the user itself.
- **Staying in the game.** Signed-in players never drop out of the app frame. The proxy applies `memberRoute()` (`src/server/navigation/member-routes.ts`): `/` redirects members to `/modes`, and the public info pages (`/about`, `/acceptable-use`, `/alpha`, `/changelog`, `/privacy`, `/support`, `/terms`) keep their URLs but are rewritten to in-game copies under `src/app/(app)/in-game/`, which re-export the same page so the content exists once. Links between those pages therefore stay in the game too. The `/in-game/*` URLs redirect to the public paths, so they are never addressed directly. Visitors always get the public site. Signing out is the way out: it returns to the public landing page.
- **Cache Components.** Session reads happen at request time (`connection()`) inside `<Suspense>`. The page shell stays static and the signed-in parts stream in. Protected pages (`/modes`, `/owner`, `/career`, `/dynasty`, `/leagues`, `/account`) redirect visitors to `/login?next=…`.
- **Redirects.** Without a `?next=`, signing in, confirming an email and "Open the app" all go to `DEFAULT_AFTER_SIGN_IN` (`/modes`, Game Mode Selection). `safeNextPath()` accepts only same-site paths, so `?next=` can't send people to another site. Email links are built from `SITE_URL`, or Render's `RENDER_EXTERNAL_URL`, and go through `/auth/confirm`, which verifies the `token_hash` and continues to `next`.
- **Sensitive changes.** Changing the email or password, or deleting the account, requires the current password. It is checked on a throwaway client whose extra session is revoked straight away. Email changes must be confirmed from both the old and the new address.
- **Account deletion.** `public.delete_own_account()` is a `security definer` function that only ever deletes the caller. User data cascades from `auth.users`. No secret key is needed.
- **Shared rules.** Form and API input share the zod schemas in `@fullcourt/validation` (`account.ts`). Business logic lives in `src/server/services/account.ts` and is called by both the Server Actions and `/api/v1/me`.
- **API.**
  - `GET`/`PATCH`/`DELETE /api/v1/me` accept the cookie or `Authorization: Bearer <access token>`. `@fullcourt/api-client` exposes them as `me()`, `updateMe()` and `deleteMe()`.
  - `scripts/scan-bundle.mjs` runs after every build, on Render and in e2e, and fails if a secret key reaches the browser bundle.

## 5. Responsive design

The website must work well on phones, tablets and desktops. Layouts change shape between sizes rather than shrinking.

- **Tokens first.** `@fullcourt/design-tokens` holds the semantic colors (canvas, surface, text, accent, win/loss…), radius, type scale, motion, z-index, layout sizes and breakpoints, in light and dark. Sizes are unitless pixels, so React Native can use the same objects. Web components use the semantic tokens and never raw values.
- **Web wiring.** `renderWebCss()` turns the tokens into `apps/web/src/styles/tokens.css`: CSS variables for both themes plus a Tailwind `@theme` block. Tailwind's default palette and breakpoints are removed, so only tokens exist. After changing tokens, run `pnpm --filter @fullcourt/web tokens`; a test fails while the file is out of date. Utilities read `bg-surface`, `text-text-muted`, `min-h-touch` and so on.
- **Themes.** `<html data-theme="light|dark">` forces a theme; without it the OS preference applies. The choice is saved in `localStorage` and applied by an inline script before first paint. A test checks WCAG AA contrast for every text and background pair in both themes.
- **Breakpoints.** Phone < 640 px, tablet 640–1023, desktop ≥ 1024, wide ≥ 1440. Tailwind variants are named after them: `tablet:`, `desktop:`, `wide:`. CSS is mobile-first: base styles target phones, and the variants add structure.
- **Navigation changes form.** Desktop uses a persistent sidebar. Tablet uses a collapsible icon rail. Phone uses a bottom tab bar (4–5 sections) plus a "More" sheet, mirroring the future native tab navigator. The sidebar and rail hold only the main sections and, at their foot, the account menu (`AccountMenu`): one avatar row that opens a native `popover` with account settings, theme, help links, legal and sign out. On phones the same items live in the "More" sheet.
- **Data-heavy views have phone layouts.**
  - Stat tables pin the first column and show columns by priority. Any horizontal scroll stays inside the table.
  - Rosters and standings become list rows on phones.
  - Box scores switch teams with a toggle on phones.
- **Touch.** Targets are at least 44×44 px, nothing depends on hover, layouts respect safe-area insets, `100dvh` replaces `100vh`, and pages never scroll sideways at 320 px.
- **Layout primitives.** Pages compose `Page`, `PageHeader`, `Section`, `Stack`, `Cluster`, `Grid` and `Card` (`components/layout/primitives.tsx`), plus `ResponsiveTable`, `Sheet` (native `<dialog>`), `EmptyState` and `Button` (`components/ui/`).
- **Frames.** `AppShell` is the application frame (sidebar, rail or bottom tabs). `SiteChrome` is the public site frame (header with a phone menu sheet, and a footer). Both read their links from `components/navigation/nav-config.ts`, the one list that will also drive the native app's tabs. Navigation that highlights the current page sits inside `<Suspense>`, because with Cache Components `usePathname` suspends on routes with unknown dynamic params.
- **Game modes.** The app navigation is Modes, Owner, Career, Dynasty (`APP_NAV`); Account settings sits in the account menu (`ACCOUNT_LINK`). A nav item can claim other sections with `match` (Owner claims `/leagues`). Each mode is its own route tree under `(app)` (`/owner`, `/career`, `/dynasty`) and starts with `ModeHero`, which links back to `/modes`. `/owner` reads saves through `listLeagues()` and shares `LeagueGrid` with `/leagues`; Career and Dynasty read no data yet. Mode copy and status live in `components/modes/mode-config.ts`, which is presentation only: modes share no save model or game logic ([DESIGN.md](./DESIGN.md#game-modes)). Mode cards and heroes size themselves with container queries (`@container`, Tailwind's default container sizes), because the space next to the sidebar or rail varies more than the viewport does.
- **Design system page.** `/styleguide` shows every token and component in the current theme.
- **Accessibility.** WCAG AA contrast in both themes (tested over token pairs), visible focus, and `prefers-reduced-motion` respected.
- **Checks.** Playwright runs against a production build (with local Supabase for the account flows) at phone (iPhone 13), tablet (820×1180) and desktop (1440×900) sizes. Every page listed in `e2e/pages.ts` is checked for axe (WCAG 2.2 AA) in both themes, for no horizontal scrolling at its size and at 320 px, and for touch targets of at least 44 px. Navigation form, theme switching and the API are tested too. Visual baselines live in `e2e/visual.spec.ts-snapshots/`; after an intended UI change, run `pnpm test:e2e:update` and review every changed image.

## 6. Deployment

- **Render web service** (`render.yaml`):
  - Builds `@fullcourt/web` and the packages it depends on, using pnpm through corepack.
  - Health check: `/api/health`.
  - `buildFilter` redeploys only when the web app, packages or workspace config change.
- **Render background worker** (not created yet; `apps/worker` runs locally for now): same repository and blueprint, its own build filter, and the only holder of the service-role key outside the admin modules. Start command `pnpm --filter @fullcourt/worker start`.
- **Environments:**
  - Local: `supabase start` in Docker.
  - Staging: a Supabase project paired with a Render service.
  - Production: added at the launch gates.
- Mobile (EAS) and Steam distribution are evaluated when those projects start. Nothing in this repository depends on them.

## 7. Verification

`pnpm verify` is the gate before every push. It runs the secret scan, boundary check, tooling tests, typecheck, lint, format check and unit tests. GitHub Actions (`.github/workflows/verify.yml`) runs `pnpm verify` again on every pull request and every push to `main`, using no secrets. E2E tests stay local for now because they need a local Supabase.

Before a phase ends, also run:

- `pnpm test:e2e`: Playwright against a production build, at phone, tablet and desktop sizes, including axe in light and dark themes and 320 px checks for the league pages.
- `supabase db reset` and `supabase test db`: migrations and the pgTAP suite (RLS, grants, constraints, the creation and rename functions).
- `pnpm check:legacy-upgrade`: whenever a migration changes how existing leagues are stored.
