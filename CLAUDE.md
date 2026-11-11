@AGENTS.md

# Full Court: working rules

- Read `docs/ARCHITECTURE.md` before changing structure. Update it alongside any architectural change.
- Next.js here is newer than most training data. Read `apps/web/AGENTS.md` and the guides in `apps/web/node_modules/next/dist/docs/` before writing Next code.
- Game packages (`shared`, `game-types`, `game-rules`, `game-engine`, `design-tokens`) stay pure and deterministic: no platform APIs, no runtime dependencies, randomness only from the seeded RNG.
- Database changes are Supabase CLI migrations. Every table gets RLS, policies, explicit grants and pgTAP tests.
- Never put the Supabase secret key anywhere except `apps/worker` and `apps/web/src/server/admin`.
- This repository is public. Never commit secrets; `.env*` files stay local.
- Run `pnpm verify` before every push. Run `pnpm test:e2e` before ending a phase.
- Work one phase at a time on its own branch, and stop for the owner's review after each phase.
- Ask before creating or changing any Supabase or Render resource.
- Commits are authored as Novaeris (repo-local git config). Do not add `Co-Authored-By` trailers, "Generated with" lines, or any mention of Claude to commits or pull requests.
