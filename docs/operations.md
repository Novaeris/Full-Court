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

| Name                                   | Where                   | Notes                                                                 |
| -------------------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Render web, local       | Public                                                                |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Render web, local       | Public by design; RLS protects data                                   |
| `SITE_URL`                             | Local only              | Origin for auth email links. On Render, `RENDER_EXTERNAL_URL` is used |
| `SUPABASE_SECRET_KEY`                  | Render worker (Phase 6) | Bypasses RLS. Never in the web client, never `NEXT_PUBLIC_`           |
| Supabase database password             | Your password manager   | Needed only for direct database connections                           |

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
- **Staging email limits.** Without custom SMTP, Supabase's built-in mailer only delivers to members of the Supabase organisation, and only a few emails an hour. That's enough to test with your own address. Custom SMTP (for example Resend) is a launch gate.

Mobile and desktop schemes (`fullcourt://…`) are added to the allowlist when those apps start.

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
