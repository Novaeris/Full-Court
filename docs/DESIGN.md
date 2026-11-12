# Full Court: product design

Full Court is a fictional basketball franchise-management game. There are no real leagues, teams, players or likenesses: teams are placed in real cities, but their names, colours, logos and players are invented.

## Product shape

- **Three game modes, one account.** Owner, Career and Dynasty Mode are separate games with separate saves (see [Game modes](#game-modes)).
- **Private saves, local play.** In Owner Mode, each signed-in user owns private leagues. Inside a league, one or more local players (couch play, up to 8) can each run one or more teams. Online multiplayer is not planned yet.
- **Online-first.** Progress is stored on the server, so a save opens on any device.
- **Platforms.** Website first, then iOS/Android, and possibly desktop/Steam later ([ARCHITECTURE.md](./ARCHITECTURE.md)).
- **Simulation.** Games are simulated from player ratings and team strategy by a deterministic engine. The same seed and the same decisions always produce the same results.

## Game modes

Full Court has three separate game modes. They share one account (the Supabase Auth user) and nothing else: each mode has its own routes, its own saves and, when it is built, its own tables. There is no universal save model, and progress in one mode never feeds another.

| Mode         | Route      | Saves                                   | Status                                                                                         |
| ------------ | ---------- | --------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Owner Mode   | `/owner`   | Leagues (worlds and franchises)         | Open alpha. League setup, world generation and franchises work; the rest is the roadmap below. |
| Career Mode  | `/career`  | Player careers (future tables)          | In development. Landing page only; nothing is playable or stored.                              |
| Dynasty Mode | `/dynasty` | Collections and lineups (future tables) | In development. Landing page only; nothing is playable or stored.                              |

- **Owner Mode** is a deep franchise-management simulation: full owner control of rosters, finances, stadiums and relocation, in pursuit of championships. It is the main development priority. Its saves are the existing leagues (`/leagues`), so the league pages belong to Owner Mode.
- **Career Mode** is an RPG-style career: create one player, develop their attributes and make career decisions.
- **Dynasty Mode** is a collectible-card mode: collect player cards of different rarities, build lineups and, later, play head to head.

**Game Mode Selection** (`/modes`) is the gateway. It is where people land after signing in or confirming their email, and the first item of the app navigation. It shows each mode as a card with its own artwork, a short description, its main features, whether it is playable yet, and an "Enter" button. Every mode page links back to it.

Each mode page starts with the same hero (title, description, status, actions) and a link back to `/modes`:

- **`/owner`**: "New World" (creates a league) and "Existing Saves" (the league list). At the 5-save limit, "New World" is disabled and says why. A "Coming to Owner Mode" list names roadmap systems and is labelled as in development.
- **`/career`**: a disabled "Create Player" button marked "In development", and an empty "Your careers" section.
- **`/dynasty`**: empty "Collection" and "Lineups" sections, both marked "In development". There are no packs, card economy or matchmaking.

Career and Dynasty Mode get their own design sections here, and their own tables, before any of their gameplay is built.

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
