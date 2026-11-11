# Desktop and Steam: future plan

**Status: not started.** This describes how a desktop or Steam app would fit the existing architecture. Nothing here is implemented yet. Shell and distribution choices are made when the project starts.

## App

- Lives in `apps/desktop` (package `@fullcourt/desktop`).
- **Runtime: Tauri or Electron, decided when the project starts.** Criteria:
  - Steamworks bindings: steamworks.js for Electron, steamworks-rs for Tauri
  - Steam overlay support
  - Bundle size and memory use
  - Auto-update
  - OS keychain access
  - How much of the web UI can be reused
- **UI options:**
  1. Wrap the web app's UI. Fastest, and the web layouts already handle large screens.
  2. A dedicated desktop UI built on the shared packages.
- In both cases the app uses `@fullcourt/api-client`, `@fullcourt/validation`, the game packages and `@fullcourt/design-tokens`, like every other client.

## Data and saves

- Postgres in Supabase stays the source of truth (online-first). Steam Cloud is not used for saves, because the server already stores all progress.
- Data access rules are the same as on web and mobile ([ARCHITECTURE.md](./ARCHITECTURE.md) §3). The app never holds the service-role key.
- Offline play with local simulation is possible in principle, because the engine is portable, but it needs a sync design. Decide before building the desktop app, since Steam players may expect it.

## Authentication

- **Sign-in.** `supabase-js` with PKCE in the **system browser**, never an embedded webview. The redirect returns through a custom URL scheme (`fullcourt://`) or a loopback address.
- **Storage.** Refresh tokens live in the OS keychain: Electron `safeStorage`, or a keyring plugin on Tauri.
- **Steam.** Steam is not a Supabase Auth provider. Planned approach:
  1. The player signs in to their Full Court account.
  2. The app sends a Steam session ticket to `POST /api/v1/steam/link`.
  3. The server verifies it with the Steam Web API (`ISteamUserAuth/AuthenticateUserTicket`) and stores the Steam id in `linked_accounts`. The id is then used for entitlement checks.
- **"Log in with Steam" only.** Skipping the Full Court account entirely would need a custom token exchange. It is deferred.

## Distribution (evaluate when active)

- Steamworks partner setup, depots, the build pipeline and code signing (Windows and macOS).
- Achievements, if any, and Steam overlay testing.
