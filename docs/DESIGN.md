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

## The season (Owner Mode)

Design for the season core. Phase 10 fixes the types and rules (`@fullcourt/game-types` `season.ts`, `@fullcourt/game-rules` `season/`); later phases build on them. Defaults marked _tunable_ are expected to change after play-testing.

- **Calendar.** A season has a `year`, a `phase` (`regular-season`, `playoffs`, `complete`) and a `day`, the next game day to simulate. Game time is data and never read from the clock.
- **Schedule.** Each pair of teams meets a fixed number of times by relationship (division, same conference, other conference). The owner picks a preset or sets custom counts of 1 to 8 for each. The standard 30-team league plays 43 games on **short** (2/2/1), **76 on standard** (4/3/2, the default) and 86 on **long** (4/4/2); other structures get their own totals, and the setup screen shows the number before the league is created. Custom counts are allowed as long as every team plays the same number of games (`validateScheduleTiers`). An exact 82-game season can't be built from these tiers in the standard league; a "target length" option can be added later if players want one. Odd counts are allowed; the generator splits those pairs' home games so each team's home and away totals differ by at most one. Teams play at most one game per day. The chosen preset and tiers are stored with the league (`LeagueConfig`, added in Phase 12 with the season tables).
- **Games, plays and box scores.** A game has a day, home and away team, a status (`scheduled` or `final`), scores and overtimes. Every game of the current season can be replayed **play by play**: an ordered list of events (shots with court position, assists, blocks, rebounds, turnovers and steals, fouls, free throws, substitutions, period starts and ends) with the running score. The box score (minutes, points, rebounds, assists, steals, blocks, turnovers, fouls and shooting splits per player) is derived from the plays, so it always matches what the viewer sees. The plays themselves are regenerated by the engine from a stored recipe rather than saved (see [Saves and history](#saves-and-history-owner-mode)). Games always have a winner; ties go to 5-minute overtimes.
- **Pace of the game.** The simulation is tuned to the NBA of 2010 to 2020: about 105 points, 46 to 47% shooting, 28 threes (35 to 36%), 22 free throws, 21 assists, 8 steals, 5 blocks, 14 turnovers and 20 fouls per team per game, and starters playing about 31 minutes. Tests keep the league-wide averages inside those bands.
- **Simulation fidelity.** Possession by possession. Four 12-minute periods. On each trip the offence may turn the ball over, draw a foul or take a shot; shooters, zones and passers are chosen from ratings, and the defence's ratings, fatigue and the coaching strategy shift the odds. Misses can be blocked or rebounded either way. Stamina drains on court and recovers on the bench, which drives substitutions. The same seed and decisions give identical plays.
- **Fast breaks and flow.** A possession can start as a fast break. Steals start them most often, then defensive rebounds, then made baskets and dead-ball turnovers. Faster teams and a faster pace start more. A break is quicker, ends mostly at the rim (layups and dunks) or with an early three, converts better than a half-court set, and is usually led by the player who got the steal or rebound, who takes the shot or makes the pass (`assistPlayerId`). Plays on a break are flagged `transition`.
- **Watching a game.** The game page (Phase 14) shows the whole court, 94 by 50 feet, with the teams switching baskets at halftime. Every play carries where it happened (shots, rebounds, lost balls, fouls, free throws) and when (the clock), and the lineups are known from the starters and substitutions. From those the page moves the ten players and the ball smoothly from one play to the next: players run back and forth on transitions, jump to a steal, crash the boards and space the floor in half-court sets. Controls play at speed, skip to the end or step play by play, and a play feed runs alongside.
- **Team strategy.** Three coaching choices feed the simulation: pace (slow, normal, fast), three-point focus (low, normal, high) and defence (balanced, perimeter, interior). AI-run franchises use the defaults.
- **Standings.** Ranked by win percentage. Ties break by record among the tied teams, then division record (all tied teams in one division), then conference record (all in one conference), then point differential, then team id so the order is always determined. The ranking feeds playoff seeding directly (`rankStandings` returns what `seedPlayoffTeams` takes).
- **Advancing time.** The player asks to simulate a day, a week or the rest of the season. A worker runs it in the background, one day at a time, and the page follows progress live. The worker is the only thing that writes results.

## Saves and history (Owner Mode)

- **Limits.** Each account has up to 5 saves (leagues), and each league can play up to 50 seasons.
- **The current season is kept in full.** Every game's score, every player's box score, and a replay of every game, so you can watch any game of the season you are in. Games are stored as a recipe the engine replays rather than as plays (see [ARCHITECTURE.md](./ARCHITECTURE.md#season-tables-replays-and-history-phase-12-and-13)).
- **Past seasons are summarised.** When the next season starts, the finished one is archived: its game detail is removed and what is kept forever is
  - each player's season totals, with per-game averages (points, rebounds, assists and so on), their best scoring game and their double-doubles and triple-doubles,
  - each team's record (overall, home, division and conference), points for and against, and where it finished,
  - award winners, including the champion.
- **Not kept for past seasons:** individual game scores and schedules, box scores, replays, head-to-head history and player game logs. If one of these matters, it has to be added to the summary before a season is archived, because it can't be recovered afterwards.
- **Replays and updates.** If the game engine is updated in a way that changes results, games already played keep their scores and box scores, but their replays may no longer be available.
- **Size.** About 9 MB for a save while a season is being played, plus about 0.35 MB for each finished season. Five saves each at 50 seasons come to roughly 130 MB.

## Roadmap

The phases below are Owner Mode's product roadmap. Engineering work is numbered separately: branches `phase-1` to `phase-9` were the league setup, and the season core continues from `phase-10` (design and rules), `phase-11` (schedule and game engine), `phase-12` (season tables), `phase-13` (simulation worker) and `phase-14` (season pages). Together they deliver roadmap phases 5 and 6.

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
