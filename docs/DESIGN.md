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
- **Watching a game.** The game page shows the whole court, 94 by 50 feet, with the teams switching baskets at halftime. Every play carries where it happened (shots, rebounds, lost balls, fouls, free throws) and when (the clock), and the lineups are known from the starters and substitutions. From those the page moves the ten players and the ball smoothly from one play to the next: players run back and forth on transitions, jump to a steal, crash the boards and space the floor in half-court sets. Controls play at speed, skip to the end or step play by play, and a play feed runs alongside.
- **Team strategy.** Three coaching choices feed the simulation: pace (slow, normal, fast), three-point focus (low, normal, high) and defence (balanced, perimeter, interior). AI-run franchises use the defaults.
- **Standings.** Ranked by win percentage. Ties break by record among the tied teams, then division record (all tied teams in one division), then conference record (all in one conference), then point differential, then team id so the order is always determined. The ranking feeds playoff seeding directly (`rankStandings` returns what `seedPlayoffTeams` takes).
- **Advancing time.** The player asks to simulate a day, a week or the rest of the season. A worker runs it in the background, one day at a time, and the page follows progress live. The worker is the only thing that writes results.

## Playoffs (Owner Mode)

The playoffs follow the league's setup choices (how many teams qualify, conference or league-wide seeding, division leaders, and best-of-3, 5 or 7 for each round). Seeding already exists (`seedPlayoffTeams`); this describes what happens next.

- **Who is in.** When the last regular-season day is played, the standings (with the standings tiebreakers) decide the field and the seeds.
- **The bracket.** A single-elimination bracket of series. In each pool the best seed plays the worst (1 v 8, 4 v 5, 3 v 6, 2 v 7 in a field of eight) so the top seeds can only meet late. With conference seeding each conference has its own bracket and the two conference winners meet in the final round; with league seeding there is one bracket.
- **A series.** The first team to win a majority of its games advances (4 in a best-of-7). The team with the better regular-season record has home court, with the usual pattern: home, home, away, away, home, away, home in a best-of-7; home, home, away, away, home in a best-of-5; home, away, home in a best-of-3. A series stops when it is won, so games 6 and 7 are only played if needed.
- **The calendar.** Every series plays one game a day. A round is over when all its series are, and the next round starts the following day. There is no play-in tournament.
- **The end.** The team that wins the final series is the champion and the loser the finalist; both are recorded as the season's awards. The season is then complete.
- **Simulating.** The simulation controls work through the playoffs the same way: a day, a week, or to the end of the playoffs. The playoff bracket page shows every series, its games and the score as it stands.
- **Starting the next season.** From a completed season, one action archives it into history and creates the next season with a new schedule. The offseason runs in between (next section); free agency, contracts and trades are later systems.
- **History.** A season's history keeps playoff statistics apart from the regular season's, and records how far each team went.

## The offseason (Owner Mode)

What happens between one season and the next. This first slice is automatic, so the world keeps moving and every league can play for 50 seasons; the owner's choices (draft picks, free agency, contracts, trades) are added on top in later phases. Numbers marked _tunable_ are expected to change after play-testing.

- **Ageing.** Every player is a year older. Players under 25 improve towards their potential, most quickly at 19 to 21; players peak around 26 to 28; from 29 athletic ratings (speed, strength, stamina) fade first while shooting and passing hold; after 33 the decline steepens. Each player's result is the age curve plus luck, so some young players stall and some veterans hold on. _tunable_
- **Retirement.** Nobody retires young. Weak players of 31 or more may. After 33 the chance climbs each year and everyone has retired by 40. Free agents of 28 or more, and weak free agents of any age, retire sooner. A retired player stays in the history (his statistics and awards remain) but is off every roster and out of the pool.
- **The draft lottery.** It follows how teams finished. Teams that missed the playoffs are in the lottery; the worse the record, the better the odds, with the three worst teams sharing the best odds (about 14% each for the first pick in a 14-team lottery). The first four picks are drawn; the other lottery teams then pick in record order, so no team falls more than four places. Playoff teams pick after the lottery, ordered by how far they got: teams knocked out earlier pick first, then the finalist, with the champion last, and the worse record first among teams that went equally far. The page shows each lottery team's finish, odds, the pick it would have had and where it landed.
- **The draft.** Two rounds, one pick per team in each. A class of rookies aged 19 to 22 is created with names not used before in the league: mostly 40s and 50s overall with high potential, a few in the 60s and 70s. Every team takes the best prospect on the board, a blend of overall and potential that leans on potential for the young, with a little noise so teams don't all agree.
- **Rosters.** A team carries 12 to 15 players and can be anywhere in that range. It releases its weakest above 15, lets go of players who aren't worth a place when it is above the size it aims for, and signs free agents up to a size of its own choosing between 12 and 15. Undrafted rookies join the pool.
- **Free agency has no cap.** Nothing pushes a free agent out because the pool is big. Players leave only by retiring: a player with no team retires within a few years, sooner if older or weak.
- **What the owner sees.** An **Offseason** page after each new season starts: the draft pick by pick (with the lottery's result in the order), the biggest improvements and declines, and who retired. Players' ratings for each season are kept, so their development can be shown later.
- **Not yet.** Choosing your own picks, free agency with offers and contracts, the salary cap, trades and owner finances. Until those exist, the owner's team is run by the same rules as every other.

## Saves and history (Owner Mode)

- **Limits.** Each account has up to 5 saves (leagues), and each league can play up to 50 seasons.
- **The current season is kept in full.** Every game's score, every player's box score, and a replay of every game, so you can watch any game of the season you are in. Games are stored as a recipe the engine replays rather than as plays (see [ARCHITECTURE.md](./ARCHITECTURE.md#season-tables-replays-and-history-phase-12-and-13)).
- **Past seasons are summarised.** When the next season starts, the finished one is archived: its game detail is removed and what is kept forever is
  - each player's season totals, with per-game averages (points, rebounds, assists and so on), their season highs (best game in points, rebounds, assists, steals, blocks and threes, with the day and the opponent) and their double-doubles and triple-doubles,
  - each team's record (overall, home, division and conference), points for and against, where it finished, its highs and lows (most and fewest points scored and allowed, biggest win, worst loss, each with day and opponent) and its longest win and loss streaks,
  - award winners, including the champion.
- **Not kept for past seasons:** individual game scores and schedules, box scores, replays, head-to-head history and player game logs (apart from each player's and team's single-game highs above). If one of these matters, it has to be added to the summary before a season is archived, because it can't be recovered afterwards.
- **Replays and updates.** If the game engine is updated in a way that changes results, games already played keep their scores and box scores, but their replays may no longer be available.
- **Highs and records.** A season high is the best of the players' or teams' highs that season, and a career high or all-time record is the best across seasons, so a record book can be built from this history.
- **Size.** About 9 MB for a save while a season is being played, plus about 0.3 MB for each finished season. Five saves each at 50 seasons come to roughly 120 MB.

## Roadmap

The phases below are Owner Mode's product roadmap. Engineering work is numbered separately: branches `phase-1` to `phase-9` were the league setup, and the season core continues from `phase-10` (design and rules), `phase-11` (schedule and game engine), `phase-12` (season tables), `phase-13` (simulation worker) and `phase-14` (season pages). Together they deliver roadmap phases 5 and 6.

| Phase | Scope                                                                                                              |
| ----- | ------------------------------------------------------------------------------------------------------------------ |
| 0     | Monorepo foundations, architecture checks, hosting connected                                                       |
| 1     | Website shell: landing pages, responsive layout system, design tokens                                              |
| 2     | Accounts: sign up, confirm, log in, reset, profile, delete account                                                 |
| 3     | Save slots: create, rename, delete and open leagues                                                                |
| 4     | World generation: teams, players, ratings                                                                          |
| 5     | Game simulation, schedule, standings, box scores                                                                   |
| 6     | Simulation worker: advance day/week/season with live progress                                                      |
| 7+    | Playoffs (done), the offseason: ageing, retirement, draft (done), then free agency, contracts, trades and finances |

Game-design detail for each system is written here before that system is built.
