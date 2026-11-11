# Mobile (iOS and Android): future plan

**Status: not started.** This describes how the mobile app will fit the existing architecture. Nothing here is implemented yet. Distribution choices are made when the project starts.

## App

- Expo and Expo Router, in `apps/mobile` (package `@fullcourt/mobile`). Expo supports pnpm workspaces, so no repository restructuring is needed.
- It consumes the same packages as the web app:
  - `@fullcourt/game-types`, `@fullcourt/game-rules` and `@fullcourt/game-engine` for display logic and rule checks, such as a trade preview.
  - `@fullcourt/validation` and `@fullcourt/api-client` for every server call.
  - `@fullcourt/design-tokens` for colors, spacing and type, through StyleSheet or NativeWind (to be decided).
- The UI is native components. The web app's React DOM components are not reused.
- The shared packages already run on Hermes, because they have no platform APIs (see [ARCHITECTURE.md](./ARCHITECTURE.md) §2). When the app starts, the engine's determinism tests also run under Hermes.

## Data access

Data access follows the same rules as the web app (ARCHITECTURE.md §3):

- Reads and Realtime go directly to Supabase with the user's JWT, under RLS.
- Coordinated writes go through `/api/v1` via `@fullcourt/api-client` with `Authorization: Bearer <access token>`.
- The app never holds the service-role key.

## Authentication

- `@supabase/supabase-js` in React Native.
- **Session storage.** AsyncStorage holds the session encrypted with a key kept in `expo-secure-store`, because SecureStore's value size limit is smaller than a full session.
- **Client setup.** Set `detectSessionInUrl: false`. Call `startAutoRefresh` and `stopAutoRefresh` on `AppState` changes.
- **Links and OAuth.** Email confirmation, password reset and OAuth use PKCE with deep links:
  - a custom scheme (`fullcourt://auth/callback`)
  - universal links (iOS) and app links (Android) on the web domain
  - `expo-auth-session` / `expo-web-browser`

  Each scheme and domain is added to the Supabase redirect allowlist.

- **Native social sign-in** can use `signInWithIdToken` (Apple, Google).
- **App Store rule:** if any third-party login is offered on iOS, Sign in with Apple is required.
- **Store requirements:** account deletion must be available in the app. The web app has it from Phase 2, and the API exposes it.

## Navigation

Bottom tabs mirror the web phone layout (ARCHITECTURE.md §5), so the information architecture is the same on both.

## Offline and caching

- Online-first. Reads may be cached for display, but writes need the network.
- Local simulation is possible in principle, because the engine is portable. It would need a separate sync design and is out of scope until decided.

## Notifications

Expo Notifications for events such as "simulation finished". The worker or an API job triggers them.

## Distribution (evaluate when active)

- EAS Build and Submit, app signing, TestFlight and Play internal testing.
- In-app purchase rules, if anything is ever sold.
- Store listings and the privacy questionnaires.
