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

- **Rows, not blobs.** Data lives in normal relational rows keyed by `league_id`. A simulation step writes only what changed. The one exception is a game's replay recipe (`game_replays.snapshot`), an append-only snapshot that is only ever read whole.
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
- **AI Assist.** Five booleans on `teams` (`ai_trades`, `ai_roster_coverage`, `ai_roster_management`, `ai_scouting`, `ai_drafting`), all off by default, and a check that allows them only on locally controlled franchises. On means the AI does that job for the franchise like a computer team, off means the owner does it and the game waits (see "Your decisions" in the offseason section). Drafting, scouting, roster management and roster coverage are used by the offseason; trades are stored but not built.
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
  - `simulateDay({ games, teams, rngState })` returns `{ games, plays, boxScores, replays, rngState }`: only the rows that changed. Games run in the order given and share one RNG. `replays` holds, for each game, what is needed to play it again: see [Season tables, replays and history](#season-tables-replays-and-history-phase-12-and-13).
  - `game-engine/src/season/replay.ts`: `ENGINE_VERSION`, `snapshotTeams`, `restoreTeams` (which rejects a malformed snapshot) and `replayGame(game, snapshot, rngState)`, which reproduces a stored game exactly.
  - A possession starts from an `Origin` (steal, defensive rebound or other). `transitionChance` turns that, the teams' speed ratings and pace into the chance of a fast break; breaks use a shorter clock, a rim-heavy shot mix and a make-chance bonus. Substitutions only happen on dead balls.
  - The tuning constants sit at the top of `game.ts`. `game.test.ts` keeps league-wide averages (scoring, shooting splits, threes, free throws, fouls, steals, blocks, assists, turnovers, rebounds, fast-break share, starter minutes, home edge) inside NBA 2010 to 2020 bounds, so a change that wrecks the balance fails a test.
- Player fatigue lives inside a game only. Between-game state (injuries, season-long fatigue) and `playerUpdates` come with the owner loop.
- Still to come: the offseason (ageing, draft, free agency, contracts, trades, finances).

### Season tables, replays and history (Phase 12 and 13)

Migration `20261112150000_season_core.sql`. Every table hangs off `league_id` with `on delete cascade`, is read-only for the league owner under RLS, and is written only by service-role functions.

**Storage is the main constraint**, so data lives in tiers. An account has at most 5 leagues and a league plays at most 50 seasons (`season_limit()`).

| Tier                                   | Tables                                                      | Kept                                       |
| -------------------------------------- | ----------------------------------------------------------- | ------------------------------------------ |
| Current season (detail)                | `games`, `game_replays`, `box_score_lines`                  | Until the season is archived               |
| History (summary of every past season) | `player_season_stats`, `team_season_stats`, `season_awards` | Forever (and `seasons`, marked `archived`) |
| Queue                                  | `sim_jobs`                                                  | Forever (a few rows)                       |

| Table                 | Holds                                                                                                                                                                                                                                                                                                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seasons`             | `year`, `phase` (`regular-season`, `playoffs`, `complete`), `day` (next day to simulate), `last_day`, the schedule preset and tiers, and `archived_at`                                                                                                                                                                                         |
| `games`               | One row per game: day, teams, `status`, scores, overtimes. Scores exist only when final, and there are no ties                                                                                                                                                                                                                                 |
| `game_replays`        | The recipe to replay a game: `snapshot` (both rosters' ratings and strategies as they were), `rng_state` (the league's RNG just before the game) and `engine_version`. **No plays are stored**                                                                                                                                                 |
| `box_score_lines`     | One row per player who played, derived from the plays. Each team's lines add up to its score (checked on commit)                                                                                                                                                                                                                               |
| `player_season_stats` | A player's season totals per team: games, starts, minutes, points, rebounds, assists, steals, blocks, turnovers, fouls, shooting splits, plus single-game highs in points, rebounds, assists, steals, blocks and threes (each with its day and opponent), `double_doubles` and `triple_doubles`. Per-game averages are totals divided by games |
| `team_season_stats`   | A team's record (overall, home, division, conference), points for and against, where it finished (overall, conference, division), its single-game highs and lows (most and fewest points scored and allowed, biggest win and worst loss, each with day and opponent) and its longest win and loss streaks                                      |
| `season_awards`       | Award winners per season (`award` is free text such as `champion`, with a team and/or player). Empty until playoffs and awards exist                                                                                                                                                                                                           |
| `playoff_series`      | The playoff bracket: one row per series, kept for every season (see [Playoffs](#playoffs-and-the-next-season-phase-15))                                                                                                                                                                                                                        |
| `sim_jobs`            | The queue: `kind` (`day`, `week`, `season`), `status`, `days_requested`, `days_done`, `error`, `worker` and a heartbeat. One active job per league                                                                                                                                                                                             |

**Plays are replayed, not stored.** The engine is deterministic, so a game's recipe gives back the exact plays, score and box score (`replayGame` in `@fullcourt/game-engine`, about 1.3 ms a game, on a server, in a browser or on a phone). Storing 416 plays a game as rows cost 105 MB a season; the recipe costs about 3 MB.

- **Engine versions.** `ENGINE_VERSION` (`game-engine/src/season/replay.ts`; now 2, because version 1 became 2 when the simulation moved to exact arithmetic) is stored with every recipe. Any change that makes the same recipe produce different plays must bump it: `replay.test.ts` fingerprints the engine's output and fails otherwise. Games stored under an older version keep their scores and box scores but can't be replayed exactly.
- **Self-check.** The worker replays every game of a day (after a JSON round trip, as the database stores it) and compares the plays and box score with the originals before committing. A recipe that doesn't reproduce its game fails the job instead of being stored.
- **Identical on every device.** The ECMAScript specification lets `Math.sin`, `Math.cos`, `Math.log`, `Math.exp`, `Math.pow` and `**` differ in the last digit between engines. Measured on 30,000 inputs each, they do: Node, Chromium, Firefox (SpiderMonkey) and WebKit (JavaScriptCore, the engine of every iPhone browser) disagreed on 2 to 7 percent of `log`, `cos` and `sin` inputs, and Firefox and WebKit on a few `pow` inputs. No game differed in 300 (the difference rarely flips a decision), but "rarely" isn't a guarantee, so the simulation (everything in `game-engine/src/season`) uses only operations the specification requires to be exact: `+ - * /` and `Math.sqrt`, plus `sin`, `cos` and `pow15` in `rng/dmath.ts` (Taylor series and `x * sqrt(x)`) and `normalSum` (twelve uniforms summed) in place of Box–Muller. `rng/engine-math.test.ts` fails if platform maths or `**` reappears in those files. World generation still uses `normal` and the platform maths: it runs only on the server and its result is stored. The movement timeline (`view/`) also uses them: it is presentation, and each device draws its own.
- **Cross-engine test.** `e2e/determinism.spec.ts` bundles the engine for the browser and, in the engine of each Playwright project (`desktop` Chromium, `engine-firefox`, `engine-safari`, `engine-iphone`), plays 300 games and compares every play, score and ending RNG state with Node, along with the arithmetic helpers over 20,000 inputs each, to the last bit. All four agree. Run `pnpm test:e2e:install` once to get Firefox and WebKit. **Not covered:** a physical phone, and React Native's Hermes. The engine needs nothing beyond exact IEEE arithmetic, so any compliant engine should agree, but that is reasoning, not a measurement. The viewer still checks its replay against the stored final score and falls back to the server's replay if they ever differ (`data-replay-source` on the viewer says which was used).
- **A snapshot must hold everything that affects a game.** Features that add inputs (injuries, lineup settings) have to add them to `ReplaySnapshot`.

**Highs, lows and records.** A season high is the best of the players' (or teams') highs in that season, and a career high or an all-time record is the best across seasons: both are queries over the history tables, so they need no tables of their own. Ties go to the earliest day, then the game id, so they are repeatable.

**Archiving.** `admin_archive_season(season, standings_order)` runs in one transaction. It computes player and team summaries from the stored games and box scores, takes only the ranking from `rankStandings` (so the tiebreakers stay in one place), checks that each team's points equal its players' points and that wins equal losses, and only then deletes the season's games (their box scores and replays go with them). It needs the season to be `complete`. `admin_create_season` refuses to start a season while an earlier one isn't archived, so detail for more than one season never builds up. **What archiving doesn't summarise is lost for good**, so change the history tables before a season is archived. The offseason flow (Phase 7+) calls it when starting the next season; until playoffs exist nothing marks a season `complete`, so nothing is archived yet.

**Measured** on a local database for one 30-team season (1,140 games), plus a league's own teams and players (about 0.5 MB):

| Part                                | Size                          |
| ----------------------------------- | ----------------------------- |
| `games`                             | 0.6 MB                        |
| `game_replays`                      | 3.4 MB                        |
| `box_score_lines` (21,700 lines)    | 4.6 MB                        |
| **Detail of the current season**    | **8.7 MB**                    |
| History per archived season         | about 0.3 MB                  |
| Time to simulate and store a season | about 8 seconds on the worker |

So a slot costs about 9 MB plus 0.3 MB for each archived season, and an account's five slots at the same point cost:

| Seasons simulated | One slot | Five slots |
| ----------------- | -------- | ---------- |
| 1                 | 9 MB     | 46 MB      |
| 10                | 12 MB    | 60 MB      |
| 20                | 15 MB    | 75 MB      |
| 50 (the limit)    | 24 MB    | 120 MB     |

Box scores are the largest piece of the current season. They could be regenerated from the replays on demand (saving about 4.6 MB a slot), but then they'd disappear for older games after an engine update, so they're stored for now.

Other rules that keep it consistent:

- **Same-league references.** Games, replays, lines, history and jobs reference seasons, teams and players by `(league_id, id)`, so nothing can point into another league. `players` has `unique (league_id, id)` for this.
- **The calendar.** `packages/game-rules/src/season/calendar.ts` holds one rule and counts everything else in weeks from it: opening night is the second Monday of October (`openingDay`, via `nthWeekday`), the regular season runs 26 weeks to a Sunday (`regularSeasonEnd`), the playoffs open the Saturday after and run every other day, the offseason begins 35 weeks after the previous opening night, the draft is that week's following Thursday (week 36), free agency opens in week 37 and runs to four weeks before the next opening night, training camp is the two weeks from four weeks before, and the preseason the two weeks from two weeks before (`CALENDAR`, `stageDates`). The date arithmetic, including the weekday (`weekday`), uses no platform date API. A season is named for the year it starts in, so the 2026 season's offseason, draft and camp fall in 2027. Game days are spread evenly over the 26 weeks (`regularSeasonDate`). `seasonDate` gives the league date a season is at; the API returns it as `Season.date` and the pages show it. The tests pin the weekday of every date over 60 years.

**A season has an offseason in front of it.** `seasons.phase` is `offseason`, `regular-season`, `playoffs` or `complete`, and while it is an `offseason` the row has a `stage`: `draft`, `free-agency`, `training-camp` or `preseason`. The next season's row is created when the offseason begins (with its schedule, so nothing has to be generated at opening night) and the stage moves on with each step; `admin_start_season` makes it a regular season. The simulation refuses a season in its offseason (`season_not_running`).

**The steps, and where each runs.** Each step is one database function that only the service role may call, so it commits atomically and refuses a step out of order (`wrong_stage`).

| Step                                                 | Calculation (pure, seeded)                    | Stored by                                                                               |
| ---------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------- |
| Begin: players age, some retire, staff contracts end | `ageAndRetire`, `ageStaff`, `replenishMarket` | `admin_apply_progression`, `admin_add_staff` (also `admin_create_staff` the first time) |
| Draft: lottery and picks (stage `draft`)             | `holdDraft`, `draftOrder`                     | `admin_apply_draft` (stage becomes `free-agency`)                                       |
| Free agency: rosters and the computer teams' staff   | `fillRosters`, `hireStaff`                    | `admin_apply_rosters` (stage becomes `training-camp`)                                   |
| Training camp                                        | `chooseCamp`, `runCamp`                       | `admin_apply_camp` (stage becomes `preseason`)                                          |
| Preseason: the season opens                          | none                                          | `admin_start_season`                                                                    |
| Owner actions in any stage                           | none                                          | `admin_hire_staff`, `admin_release_staff`, `admin_set_camp` (camp stage only)           |

The server code is in `apps/web/src/server/services/offseason.ts` (`beginOffseason`, `advanceOffseason`, `getOffseason`), `staff.ts` and `camp.ts`; each step seeds its RNG from the league id, the step and the year (`league id : draft : 2027`), so a step is repeatable. `POST /leagues/:id/next-season` archives the season, runs `beginOffseason` and creates the next season in its offseason, safe to retry: `seasons.offseason_done_at` makes the ageing run once and the market top-up only adds what is missing. `POST /leagues/:id/offseason/advance` takes the current stage's step; `GET /offseason`, `GET|POST|DELETE /staff` and `GET|PUT /camp` are the reads and the owner's actions.

**Rules in the database as well.** The staff budget (`app_private.staff_budget()`, 10000, in thousands of dollars) and the camp places (`app_private.camp_places`) are held in the database so a client can't get round them, and pinned to `@fullcourt/game-rules` by the pgTAP tests. Every team must have 12 to 15 active players and be within its staff budget when free agency ends and when the season opens (`app_private.check_league`).

**Ageing, retirement and the draft** (Phase 16). Expected change in overall by age runs from +4.5 at 19 to -3 after 33, with noise, capped near potential for players of 25 or under; athletic ratings fade from 29, skills hold. Nobody retires before 31 (and then only weak players); the chance climbs steeply after 33 and everyone has retired by 40. A player with no team retires within a few years, sooner if older or weak, but free agency has no cap. **The lottery follows the season's finish** (`draftOrder`): teams that missed the playoffs are in it, the worst three sharing the best odds (`lotteryOdds`, 14% each for 14 teams), the first four picks are drawn with those odds, the other lottery teams follow in record order (a team falls at most four places), and playoff teams pick after, ordered by how far they got. Each pick keeps the team's finish, the pick it would have had and its odds (`draft_picks`). Every team takes the best prospect on its board (overall and potential, weighted towards potential for the young) seen through noise that a better scout reduces (`draftNoise`).

**Rosters run from 12 to 15.** A team releases its weakest above 15, lets go of players who are not worth a place when above the size it aims for, and signs free agents (worst team first, preferring positions it is short of) up to a target between 12 and 15 that it picks itself. Free agency has no cap.

**Training camp** (Phase 17). `CAMP_PROGRAMS` (rules) are six groups of ratings. A team has 3 places, plus 1 for a head coach rated 60 or more and 2 for 80 or more. A player's gain per rating is about 1.5 plus up to 2.5 for the coach who runs the program (conditioning for athleticism, development for the rest), times an age factor (1.4 to 22 down to 0.3 after 30), plus luck, and he never ends camp past his potential. The owner's picks are saved in `camp_assignments` (only the owner's teams); a team with nobody saved is chosen for by its coaches, like every computer team (`chooseCamp`: the young with the most room to grow, each in the program he is weakest in). `camp_results` keeps what changed, for every year.

**Staff** (Phase 17). `staff_members` has four roles, one person each per team (a unique index): head coach (camp places), development coach and conditioning coach (camp gains), scout (draft noise). Every member has a rating (30 to 95), age, a salary that rises steeply with rating (`staffSalary`) and a contract of one to three years; a member with no team is on the market. Staff over 64 retire, and contracts that run out put the person back on the market, where each role keeps at least six people. Computer teams fill empty roles with the best person they can afford when free agency ends; the owner's team hires through `admin_hire_staff`, which replaces whoever holds the role and refuses a team over its budget.

**Your decisions (Phase 18).** The draft class exists from the start of the offseason: `ensureProspects` creates it as players with the status `prospect` (no team) when the next season is created. The owner never sees the true ratings: the draft board shows `scoutedView`, the true overall and potential through noise that depends on the team's scout (`draftNoise`) and is fixed for each prospect and team (seeded from both), and the player detail endpoint refuses a prospect. The stage has two parts. `POST /draft/lottery` (or the stage button) holds the lottery, which stores every pick as a row of `draft_picks` with no player yet (`admin_hold_lottery`). Picks are then made in order: `POST /draft/sim` makes the computer teams' picks until one of the owner's teams is on the clock (`autoMine` picks for the owner's teams too), `POST /draft/pick` makes the owner's pick, and `admin_make_picks` refuses a pick out of order. Each pick seeds its own RNG from the league, the year and the pick number, so a pick is the same however the draft is batched. After the last pick the undrafted prospects become free agents and the stage moves on.

**AI Assist as built.** The five switches live on `teams` and are changed with `PATCH /leagues/:id/ai-assist` (`admin_set_ai_assist`; the table's own check allows them only on a franchise a user runs). _Drafting_: with it on, `simulatePicks` makes the owner's picks like any computer team's; off, it stops when the owner is on the clock. _Scouting_: with it on, the suggested pick is shown on the board; off, the owner asks for it. _Roster management_: the owner's team is treated like a computer team when free agency ends and when the preseason ends. _Roster coverage_: `coverRoster` makes a roster legal and covers every position (too many players: the weakest go from the most crowded positions; too few, or a position nobody plays: the best free agent signs). A team on neither must already be 12 to 15 players or the stage cannot end (`roster_not_legal`, with the count in the message). Free agency has no first pick: every team's offers compete for 21 days.

**Roster moves.** `GET /roster` returns one of the owner's rosters and the best 40 free agents; `POST /roster` signs a free agent (a roster holds at most 15) and `DELETE /roster` releases a player, from free agency to the end of the preseason. A signing now has a contract (see below).

**Contracts, the cap and free agency in days (Phase 19).** The rules are `packages/game-rules/src/season/finance.ts` (pure, in thousands of dollars): the cap starts at $125 million in a league's first season and rises 3% a year (`salaryCap`); the hard ceiling is 120% of it (`hardCeiling`); the minimum is 0.8% and the maximum 30% of the cap; the mid-level exception is 8% of the cap, once a year. `askingSalary` prices a player from his value (overall and potential, leaning on potential for the young) on a cubic curve from the minimum to the maximum, calibrated so that a typical roster asks for about 88% of the cap, leaving room for staff. `signingRoute` says how a team can sign someone: the minimum contract, cap room, re-signing its own free agent, or the mid-level exception, and never past the ceiling. `rookieContract` gives a first-round pick three years from 8% of the cap down, and a second-round pick two years at the minimum. A player has `salary`, `contract_expires` (the last season it covers) and `rights_team_id`; payroll is player salaries only. Staff have their own budget (`staffBudget`, 8% of the cap; `app_private.staff_budget` in the database) and never count against the cap or the ceiling.

_What the database holds._ The hard ceiling and the roster size, which nothing can pass: `seasons.salary_cap` is stored per season (so the cap rises without a formula in SQL), `app_private.salary_ceiling` is 120% of it, `app_private.team_payroll` adds the players' salaries, and every signing, offer and the end of free agency is checked against the ceiling (`over_ceiling`, which says which team); a staff hire is checked against the staff budget (`staff_over_budget`). The cap-room and exception rules are checked by the server before it calls the database, because they depend on the exceptions each team has used. `player_transactions` records every draft pick, signing, release and contract that ends (with how a signing fitted under the cap), `fa_offers` holds the offers, and `seasons.fa_day` counts the days simulated.

_A day._ `admin_apply_fa_day` takes what the engine worked out: new offers, raised offers, signings and lapsed offers; it checks each signing, then moves the day on. In the engine (`simulateFreeAgencyDay`), computer teams (and the owner's team when roster management is on AI Assist) raise a quarter of their offers by 4%, then pick up to two targets (the best player for the money and for a position of need, favouring their own free agents), bid near his asking price, and never take their payroll past 112% of the cap, which leaves them room to fill a roster. Then free agents decide, the best first: he compares what each offer is worth to him (`effectiveSalary` in `game-rules/src/season/preferences.ts`: the salary adjusted by how the team looks on the things he cares about), and accepts the best with the chance `acceptChance` gives (never under 80% of his ask, always at 110%, rising 3% a day); an offer that no longer fits (the team's payroll or roster changed) is void and his other offers lapse when he signs. Each day seeds its RNG from the league, the year and the day. At the end, computer teams fill their rosters with minimum contracts from players who would take one, never past the ceiling; a team with no room to do that lets its best-paid players go first (`shedPayroll`), and computer teams' staff hiring is limited by the staff budget.

_Leagues made earlier._ `ensureContracts` gives a league without contracts its first ones (`generateContracts`: each team's payroll lands between 85% and 105% of the cap, less its staff) the first time its offseason begins. Contracts that ended with the season make free agents at the start of the offseason, and a team keeps a player's re-signing rights until free agency ends.

_The API._ `GET /free-agency` returns the day, the cap figures, the best 60 free agents with what each asks, your offers and what has happened; `POST /free-agency/offers` makes or changes an offer (refused with the reason if it breaks the rules), `DELETE` withdraws it, `POST /free-agency/sim` simulates a day, a week or the rest, and ending the stage plays whatever days are left. `GET /roster` shows contracts and the cap figures. Outside the days, `POST /roster` signs a free agent outright at 75% of his asking price for a year, and during them only a player who would take a minimum contract can be signed that way.

**Trades and roster moves in the season (Phase 20).** Product design: [DESIGN.md](./DESIGN.md#trades-and-roster-moves-in-the-season). The rules are `packages/game-rules/src/season/trade.ts` (pure): `tradeValue` (a player's value raised steeply for stars, then his contract and age), `salaryMatches` (a team over the cap after a trade takes back at most 125% of what it sends out plus the minimum), `tradeProblems` (both teams legal: rosters, the hard ceiling and matching), `answerTrade` (a computer team accepts when it gets at least 8% more value than it gives, 40% more to give up one of its two best, and its roster stays legal) and `tradeDeadlineDay` (two thirds through the regular season). `shopPlayers` (engine) finds, for each computer team, the best one- or two-player package it would accept that is legal for both. A league made before contracts existed gets them when its first season is created (`ensureContracts` in `createSeason`), not only when its first offseason begins.

_In the database._ `trades` (the two teams, who each gave, the day) and `player_transactions` (kind `traded`) are the history, read-only for the owner. `admin_apply_trade` holds what nothing can pass: both players are on the team that gives them, rosters of at most 15 (and at least 12 in the season), both payrolls under the hard ceiling, and the window (free agency to the preseason, or the regular season up to the deadline: `day <= last_day * 2 / 3`). `admin_sign_player` and `admin_release_player` are now open through the regular season; in the season a release that leaves fewer than 12 players is refused (`roster_too_small`), and a signing is a one-year contract that ends with the season.

_The API._ `GET /trades` (is it open, your roster with contracts and trade values, the teams to trade with, recent trades), `GET /trades/partner` (a computer team's roster), `POST /trades/evaluate` (legal? what would they say, with reasons) and `POST /trades` (made if it is legal and they accept), `POST /trades/shop` (what they would give for up to three of your players). The **Moves** tab shows the trade panel and the roster panel (release, sign). Not built yet: offers from computer teams to the owner, trades between computer teams, and draft picks as assets (the AI Assist _trades_ switch is stored for those).

**What is stored.** `players.status` is `active` or `retired` (a retired player keeps his row, because statistics and awards point at him, but has no team and a `retired_year`). `draft_picks`, `player_ratings_history` (age, overall, potential and previous overall for every season, updated by camp), `camp_results` and `staff_members` are read-only for the league owner (RLS). Everything that lists rosters or team strength reads active players only, and retired players are never fetched in bulk, so the 1,000-row API limit is not reached.

**Pages.** The **Offseason** tab (`offseason/page.tsx`) shows the stages with their dates and the button for the current step (`offseason-controls.tsx`), the staff panel (`staff-panel.tsx`), the camp panel during training camp (`camp-panel.tsx`), and the reports: the draft lottery and the draft, the camp report, the biggest improvements and declines and who retired (`offseason-report.tsx`). The playoffs page offers "Start the offseason" once the season is complete, and the simulation panel shows the date and links to the offseason while one is under way.

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
