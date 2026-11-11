# Operations

## Environments

| Environment | Database                                            | Web                                                                   | Notes                            |
| ----------- | --------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------- |
| Local       | `supabase start` (Docker)                           | `pnpm dev` (http://localhost:3000)                                    | Studio at http://127.0.0.1:54323 |
| Staging     | Supabase `kxstopoecleaozqtjtmz` (Free, N. Virginia) | Render `full-court-staging` (https://full-court-staging.onrender.com) | Deploys from `main`              |
| Production  | Added at the launch gates (Supabase Pro)            | Added at the launch gates                                             |                                  |

## Secrets inventory

The repository is public. Secrets live only in the Render dashboard and in git-ignored local files (`apps/web/.env.local`).

| Name                                   | Where                   | Notes                                                       |
| -------------------------------------- | ----------------------- | ----------------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | Render web, local       | Public                                                      |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Render web, local       | Public by design; RLS protects data                         |
| `SUPABASE_SECRET_KEY`                  | Render worker (Phase 6) | Bypasses RLS. Never in the web client, never `NEXT_PUBLIC_` |
| Supabase database password             | Your password manager   | Needed for `supabase link` / `db push`                      |

## Supabase redirect allowlist

| Environment | Site URL                                | Additional redirect URLs                   |
| ----------- | --------------------------------------- | ------------------------------------------ |
| Local       | http://127.0.0.1:3000                   | http://localhost:3000/**                   |
| Staging     | https://full-court-staging.onrender.com | https://full-court-staging.onrender.com/** |

Mobile and desktop schemes (`fullcourt://…`) are added when those apps start.

## Common tasks

```sh
pnpm install                 # install everything
pnpm dev                     # run the web app
pnpm verify                  # full pre-push gate
pnpm test:e2e                # Playwright (phone, tablet, desktop)
supabase start               # local database + auth (needs Docker Desktop)
supabase migration new name  # new SQL migration
supabase db reset            # rebuild the local database from migrations
supabase db push             # apply migrations to the linked (staging) project
```

## Git

- Commits in this repository are authored as **Novaeris** with the GitHub noreply address. This is set in the repository's local git config, so other repositories on the machine are unaffected.
- The pre-commit hook (`.githooks/pre-commit`) scans staged changes for secrets. `pnpm install` turns it on with `git config core.hooksPath .githooks`.
