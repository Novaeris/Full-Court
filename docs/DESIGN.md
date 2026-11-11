# Full Court: product design

Full Court is a fictional basketball franchise-management game. There are no real leagues, teams, players or likenesses.

## Product shape

- **Single-player saves.** Each signed-in user owns private leagues and runs one team inside a simulated world.
- **Online-first.** Progress is stored on the server, so a save opens on any device.
- **Platforms.** Website first, then iOS/Android, and possibly desktop/Steam later ([ARCHITECTURE.md](./ARCHITECTURE.md)).
- **Simulation.** Games are simulated from player ratings and team strategy by a deterministic engine. The same seed and the same decisions always produce the same results.

## Roadmap

| Phase | Scope                                                                                         |
| ----- | --------------------------------------------------------------------------------------------- |
| 0     | Monorepo foundations, architecture checks, hosting connected                                  |
| 1     | Website shell: landing pages, responsive layout system, design tokens                         |
| 2     | Accounts: sign up, confirm, log in, reset, profile, delete account                            |
| 3     | Save slots: create, rename, delete and open leagues                                           |
| 4     | World generation: teams, players, ratings                                                     |
| 5     | Game simulation, schedule, standings, box scores                                              |
| 6     | Simulation worker: advance day/week/season with live progress                                 |
| 7+    | Playoffs, then the offseason and owner loop (draft, free agency, contracts, trades, finances) |

Game-design detail for each system is written here before that system is built.
