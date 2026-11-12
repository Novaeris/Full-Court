# Operations

## Environments

| Environment | Database                                            | Web                                                                   | Notes                                                                  |
| ----------- | --------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Local       | `supabase start` (Docker)                           | `pnpm dev` (http://localhost:3000)                                    | Studio at http://127.0.0.1:54323; test inbox at http://127.0.0.1:54324 |
| Staging     | Supabase `kxstopoecleaozqtjtmz` (Free, N. Virginia) | Render `full-court-staging` (https://full-court-staging.onrender.com) | Deploys from `main`                                                    |
| Production  | Added at the launch gates (Supabase Pro)            | Added at the launch gates                                             |                                                                        |

## First-time local setup

1. Start Docker Desktop, then run `supabase start`.
2. Create `apps/web/.env.local` from `.env.example`. `supabase status -o env` prints the local `API_URL` and `PUBLISHABLE_KEY`.
3. Run `pnpm dev`. Sign-up and password emails land in the local test inbox (Mailpit) at http://127.0.0.1:54324, not a real mailbox.

## Secrets inventory

The repository is public. Secrets live only in the Render dashboard and in git-ignored local files (`apps/web/.env.local`).

| Name                                   | Where                    | Notes                                                                                                                |
| -------------------------------------- | ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Render web, local        | Public                                                                                                               |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Render web, local        | Public by design; RLS protects data                                                                                  |
| `SITE_URL`                             | Local only               | Origin for auth email links. On Render, `RENDER_EXTERNAL_URL` is used                                                |
| `SUPABASE_SECRET_KEY`                  | Render web, local        | Bypasses RLS. Used only by `apps/web/src/server/admin` to write generated league worlds. Never `NEXT_PUBLIC_`        |
| Supabase database password             | Your password manager    | Needed only for direct database connections                                                                          |
| `RATE_LIMIT_SECRET`                    | Render web, local        | 32+ random characters. Keys the IP hashes and form stamps for the support form. Rotating it only resets the counters |
| `RESEND_API_KEY`                       | Render web               | Optional. Support form notifications to the support inbox. Can be a separate Resend key from the SMTP one            |
| `SUPPORT_EMAIL_FROM`                   | Render web               | Optional. Sender for support notifications, on a Resend-verified domain                                              |
| `MAINTENANCE_MODE`                     | Render web (when needed) | Set to `on` to show the maintenance page; remove it to reopen. Not in `render.yaml`                                  |

## Auth configuration

Auth settings live in `supabase/config.toml` and are versioned with the code. The `[remotes.staging]` blocks override what differs on staging:

| Setting               | Local                                                        | Staging                                      |
| --------------------- | ------------------------------------------------------------ | -------------------------------------------- |
| Site URL              | http://localhost:3000                                        | https://full-court-staging.onrender.com      |
| Redirect allowlist    | http://localhost:3000/\*\_, http://localhost:3100/\*\_ (e2e) | https://full-court-staging.onrender.com/\*\* |
| Email confirmation    | Required                                                     | Required                                     |
| Minimum password      | 10 characters                                                | 10 characters                                |
| Email templates       | `supabase/templates/*.html`                                  | Same                                         |
| Sign-in/sign-up limit | 1000 per 5 min (so e2e is not throttled)                     | 30 per 5 min (hosted default)                |

- Apply staging auth settings with `supabase config push`, and staging migrations with `supabase db push`.
- **Staging email.** Staging sends auth email through Resend SMTP (`[remotes.staging.auth.email.smtp]`), limited to 30 emails an hour by `[remotes.staging.auth.rate_limit]`. The open alpha runs on staging, so raise that limit (and check the Resend plan's quota) if sign-ups queue up.

Mobile and desktop schemes (`fullcourt://…`) are added to the allowlist when those apps start.

## Open alpha operations

- **Support requests** are stored in `app_private.support_requests` (Supabase Studio → Table editor → schema `app_private`). With `RESEND_API_KEY` and `SUPPORT_EMAIL_FROM` set, each one is also emailed to the support inbox; reply from there. Delete inbox copies 12 months after they arrive (the Privacy Policy promises this; the database deletes its copies itself).
- **Usage totals** are in `app_private.analytics_daily`, e.g. `select day, event, path, hits from app_private.analytics_daily order by day desc, hits desc;`.
- **Maintenance:** add `MAINTENANCE_MODE=on` in the Render dashboard (the service restarts), do the work, remove it.
- **Releases:** add an entry to `apps/web/src/content/changelog.ts`. Material policy changes: edit the page, then bump the version in `apps/web/src/content/policies.ts`.

## Common tasks

```sh
pnpm install                 # install everything
pnpm dev                     # run the web app
pnpm verify                  # full pre-push gate
pnpm test:e2e                # Playwright (phone, tablet, desktop; needs supabase start)
pnpm db:types                # regenerate database types into @fullcourt/api-client
supabase start               # local database + auth (needs Docker Desktop)
supabase migration new name  # new SQL migration
supabase db reset            # rebuild the local database from migrations
supabase test db             # pgTAP database and RLS tests
supabase db push             # apply migrations to the linked (staging) project
supabase config push         # apply auth settings and templates to staging
```

## Git

- Commits in this repository are authored as **Novaeris** with the GitHub noreply address. This is set in the repository's local git config, so other repositories on the machine are unaffected.
- The pre-commit hook (`.githooks/pre-commit`) scans staged changes for secrets. `pnpm install` turns it on with `git config core.hooksPath .githooks`.

## Checking that old leagues survive a migration

`pnpm check:legacy-upgrade` resets the **local** Supabase database to the last migration before Owner Mode, creates an old-style league the way the old server did, applies the newer migrations, and checks what the old data became (config left empty, stable conference and division ids with the same display names, the chosen team as Player 1's, every player still on a team). It then resets the local database to the latest migrations. It needs Docker and `supabase start`, and never touches a hosted project. Run it whenever a migration changes how existing leagues are stored.
