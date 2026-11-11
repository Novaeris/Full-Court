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
  worker/         (Phase 6) Render background worker that runs simulation jobs
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
scripts/          verify, boundary check, secret scan
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
- **Rows in, rows out.** Simulation functions take only the rows they need and return only the rows that changed, e.g. `simulateDay(input) → { games, boxScores, playerUpdates, rngState }`. There is no whole-league save object.

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

| Table              | Owner check             | Client grants                 | Writes that must go through a function                                                                                                                                                                    |
| ------------------ | ----------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `profiles`         | `id = auth.uid()`       | select; update `display_name` | Created by the sign-up trigger; removed by `delete_own_account()`                                                                                                                                         |
| `leagues`          | `owner_id = auth.uid()` | select, delete; update `name` | Created only by `admin_create_league(...)` (service role), together with its world; enforces the 5-per-account limit under an advisory lock. The user's team is set once with `choose_team(league, team)` |
| `teams`, `players` | owner of `league_id`    | select                        | Written only by `admin_create_league`, so no client can forge a roster                                                                                                                                    |

- **Server-generated worlds.** `createLeague` generates the world with `@fullcourt/game-engine` from a random seed on the server, then calls `admin_create_league` through the admin client in `apps/web/src/server/admin/`, the only code allowed to use the secret key. The league stores its seed and the RNG state after generation, so later simulation continues deterministically.
- **Not found, not forbidden.** Another user's row isn't visible under RLS, so the services report `404 league_not_found` rather than revealing that it exists.
- **Cascades.** Deleting the auth user cascades to profiles and leagues. Every future table hangs off `league_id` with `on delete cascade`, so deleting a league deletes everything in it.
- **Pages and the API share one service layer.** `/leagues`, `/leagues/new` and `/leagues/[leagueId]/…` use Server Actions, and `GET`/`POST /api/v1/leagues` plus `GET`/`PATCH`/`DELETE /api/v1/leagues/:leagueId` serve other clients. Both call `apps/web/src/server/services/leagues.ts`.

### Secrets and the service role

- The Supabase **publishable (anon) key** is public by design and may go to browsers and apps. RLS protects the data.
- The **secret (service-role) key** bypasses RLS. Only `apps/worker` and the audited modules in `apps/web/src/server/admin/` may use it. It lives only in Render environment variables and git-ignored local env files.
- `scripts/check-boundaries.mjs` fails the build when the key is mentioned anywhere else, or when any `NEXT_PUBLIC_` variable looks like a secret.
- The repository is **public**. `scripts/scan-secrets.mjs` runs in a pre-commit hook and in `pnpm verify`.

### Simulation (Phase 6)

1. Clients call `POST /api/v1/leagues/:id/sim`, which adds a row to a `sim_jobs` queue.
2. `apps/worker` claims jobs with `FOR UPDATE SKIP LOCKED`, runs the engine, and commits each simulated day as a small transaction.
3. Clients follow progress through Supabase Realtime.

Long simulations never run inside an HTTP request or on a client device.

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
- **Proxy is not the gate.** `src/proxy.ts` only refreshes the session cookies. Each page, Server Action and API route checks the user itself.
- **Cache Components.** Session reads happen at request time (`connection()`) inside `<Suspense>`. The page shell stays static and the signed-in parts stream in. Protected pages (`/leagues`, `/account`) redirect visitors to `/login?next=…`.
- **Redirects.** `safeNextPath()` accepts only same-site paths, so `?next=` can't send people to another site. Email links are built from `SITE_URL`, or Render's `RENDER_EXTERNAL_URL`, and go through `/auth/confirm`, which verifies the `token_hash` and continues to `next`.
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
- **Navigation changes form.** Desktop uses a persistent sidebar. Tablet uses a collapsible icon rail. Phone uses a bottom tab bar (4–5 sections) plus a "More" sheet, mirroring the future native tab navigator.
- **Data-heavy views have phone layouts.**
  - Stat tables pin the first column and show columns by priority. Any horizontal scroll stays inside the table.
  - Rosters and standings become list rows on phones.
  - Box scores switch teams with a toggle on phones.
- **Touch.** Targets are at least 44×44 px, nothing depends on hover, layouts respect safe-area insets, `100dvh` replaces `100vh`, and pages never scroll sideways at 320 px.
- **Layout primitives.** Pages compose `Page`, `PageHeader`, `Section`, `Stack`, `Cluster`, `Grid` and `Card` (`components/layout/primitives.tsx`), plus `ResponsiveTable`, `Sheet` (native `<dialog>`), `EmptyState` and `Button` (`components/ui/`).
- **Frames.** `AppShell` is the application frame (sidebar, rail or bottom tabs). `SiteChrome` is the public site frame (header with a phone menu sheet, and a footer). Both read their links from `components/navigation/nav-config.ts`, the one list that will also drive the native app's tabs. Navigation that highlights the current page sits inside `<Suspense>`, because with Cache Components `usePathname` suspends on routes with unknown dynamic params.
- **Design system page.** `/styleguide` shows every token and component in the current theme.
- **Accessibility.** WCAG AA contrast in both themes (tested over token pairs), visible focus, and `prefers-reduced-motion` respected.
- **Checks.** Playwright runs against a production build (with local Supabase for the account flows) at phone (iPhone 13), tablet (820×1180) and desktop (1440×900) sizes. Every page listed in `e2e/pages.ts` is checked for axe (WCAG 2.2 AA) in both themes, for no horizontal scrolling at its size and at 320 px, and for touch targets of at least 44 px. Navigation form, theme switching and the API are tested too. Visual baselines live in `e2e/visual.spec.ts-snapshots/`; after an intended UI change, run `pnpm test:e2e:update` and review every changed image.

## 6. Deployment

- **Render web service** (`render.yaml`):
  - Builds `@fullcourt/web` and the packages it depends on, using pnpm through corepack.
  - Health check: `/api/health`.
  - `buildFilter` redeploys only when the web app, packages or workspace config change.
- **Render background worker** (Phase 6): same repository and blueprint, its own build filter, and the only holder of the service-role key outside the admin modules.
- **Environments:**
  - Local: `supabase start` in Docker.
  - Staging: a Supabase project paired with a Render service.
  - Production: added at the launch gates.
- Mobile (EAS) and Steam distribution are evaluated when those projects start. Nothing in this repository depends on them.

## 7. Verification

`pnpm verify` is the gate before every push. It runs the secret scan, boundary check, tooling tests, typecheck, lint, format check and unit tests. Before a phase ends, `pnpm test:e2e` also runs. From Phase 2, `supabase db reset` and `supabase test db` run too.
