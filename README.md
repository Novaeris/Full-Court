# Full Court

A fictional basketball franchise-management game. Website first; iOS, Android and desktop later.

## Getting started

Requirements: Node 24, pnpm 10 (`corepack enable`), Docker Desktop (for the local database).

```sh
pnpm install
cp .env.example apps/web/.env.local
pnpm dev            # http://localhost:3000
pnpm verify         # run before every push
```

## Docs

- [Architecture](docs/ARCHITECTURE.md): monorepo layout, engine rules, backend, auth, responsive design, deployment
- [Product design](docs/DESIGN.md): scope and roadmap
- [Mobile](docs/MOBILE.md) and [Desktop](docs/DESKTOP.md): future platform plans
- [Operations](docs/operations.md): environments, secrets, common commands

## Licence

All rights reserved. See [LICENSE](LICENSE).
