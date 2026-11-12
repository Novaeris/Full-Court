# Full Court: product design

Full Court is a fictional basketball franchise-management game. There are no real leagues, teams, players or likenesses: teams are placed in real cities, but their names, colours, logos and players are invented.

## Product shape

- **Private saves, local play.** Each signed-in user owns private leagues. Inside a league, one or more local players (couch play, up to 8) can each run one or more teams. Online multiplayer is not planned yet.
- **Online-first.** Progress is stored on the server, so a save opens on any device.
- **Platforms.** Website first, then iOS/Android, and possibly desktop/Steam later ([ARCHITECTURE.md](./ARCHITECTURE.md)).
- **Simulation.** Games are simulated from player ratings and team strategy by a deterministic engine. The same seed and the same decisions always produce the same results.

## League setup (Owner Mode)

Before a league starts, its owner chooses:

- **Structure.** The standard league is 30 teams in 2 conferences of 3 divisions with 5 teams each. A custom league has up to 32 teams in equal divisions (8 to 32 teams, 1 to 4 conferences). Divisions are geographic, and conference and division names can be renamed at any time.
- **Region.** North America, South America, Europe, Asia, or Australia and Oceania. Every team gets a real city from the region, with no repeats (several teams may share a state, province or country).
- **Playoffs.** How many teams qualify (a power of two, 16 by default), conference or league-wide seeding, whether division leaders qualify automatically and take the top seeds, and best-of-3, 5 or 7 for each round (all best-of-7 by default).
- **Fantasy draft.** A yes/no choice saved with the league; the draft itself is a later system.
- **Local players and franchises.** 1 to 8 local players, each running one or more franchises. A franchise has a city, a team name, primary and secondary colours and one of the built-in logos; anything left blank is generated. Team names are shown in white on the primary colour, so primary colours must be dark enough to read.
- **AI Assist.** For each franchise, separate permissions to let the AI handle trades, roster coverage, roster and rotation (including free agents and staff), scouting and drafting. All are off by default. The permissions are saved now; the AI behaviours are later systems.

The rest of the league is generated around those choices, and the owner can preview it, shuffle the generated teams and rename conferences and divisions before creating it. Technical detail: [ARCHITECTURE.md](./ARCHITECTURE.md#owner-mode-league-setup-and-creation).

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
