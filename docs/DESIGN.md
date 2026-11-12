# Full Court: product design

Full Court is a fictional basketball franchise-management game. There are no real leagues, teams, players or likenesses.

## Product shape

- **Three game modes, one account.** Owner, Career and Dynasty Mode are separate games with separate saves (see [Game modes](#game-modes)).
- **Single-player saves.** In Owner Mode, each signed-in user owns private leagues and runs one team inside a simulated world.
- **Online-first.** Progress is stored on the server, so a save opens on any device.
- **Platforms.** Website first, then iOS/Android, and possibly desktop/Steam later ([ARCHITECTURE.md](./ARCHITECTURE.md)).
- **Simulation.** Games are simulated from player ratings and team strategy by a deterministic engine. The same seed and the same decisions always produce the same results.

## Game modes

Full Court has three separate game modes. They share one account (the Supabase Auth user) and nothing else: each mode has its own routes, its own saves and, when it is built, its own tables. There is no universal save model, and progress in one mode never feeds another.

| Mode         | Route      | Saves                                   | Status                                                                                     |
| ------------ | ---------- | --------------------------------------- | ------------------------------------------------------------------------------------------ |
| Owner Mode   | `/owner`   | Leagues (worlds and franchises)         | Open alpha. Leagues, world generation and team choice work; the rest is the roadmap below. |
| Career Mode  | `/career`  | Player careers (future tables)          | In development. Landing page only; nothing is playable or stored.                          |
| Dynasty Mode | `/dynasty` | Collections and lineups (future tables) | In development. Landing page only; nothing is playable or stored.                          |

- **Owner Mode** is a deep franchise-management simulation: full owner control of rosters, finances, stadiums and relocation, in pursuit of championships. It is the main development priority. Its saves are the existing leagues (`/leagues`), so the league pages belong to Owner Mode.
- **Career Mode** is an RPG-style career: create one player, develop their attributes and make career decisions.
- **Dynasty Mode** is a collectible-card mode: collect player cards of different rarities, build lineups and, later, play head to head.

**Game Mode Selection** (`/modes`) is the gateway. It is where people land after signing in or confirming their email, and the first item of the app navigation. It shows each mode as a card with its own artwork, a short description, its main features, whether it is playable yet, and an "Enter" button. Every mode page links back to it.

Each mode page starts with the same hero (title, description, status, actions) and a link back to `/modes`:

- **`/owner`**: "New World" (creates a league) and "Existing Saves" (the league list). At the 5-save limit, "New World" is disabled and says why. A "Coming to Owner Mode" list names roadmap systems and is labelled as in development.
- **`/career`**: a disabled "Create Player" button marked "In development", and an empty "Your careers" section.
- **`/dynasty`**: empty "Collection" and "Lineups" sections, both marked "In development". There are no packs, card economy or matchmaking.

Career and Dynasty Mode get their own design sections here, and their own tables, before any of their gameplay is built.

## Roadmap

The phases below are Owner Mode's.

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
