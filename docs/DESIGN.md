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
- **AI Assist.** For each franchise, separate permissions to let the AI handle trades, roster coverage, roster and rotation (including free agents and staff), scouting and drafting. All are off by default. On means the AI does the job, off means the owner does it (see "AI Assist" under the offseason). The offseason uses drafting, scouting, roster management and roster coverage; trades come with the trading phase.

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

## The calendar (Owner Mode)

A league has dates. The calendar is built around one rule: **opening night is always the second Monday of October.** Every other date is a whole number of weeks from it, so each year has the same shape and the weekdays always line up (a Monday start, a Sunday finish, a Thursday draft). A season is named for the year it starts in: the 2026 season opens on Oct 12, 2026, and its draft is the 2027 draft. _The week counts are tunable._

| When (weeks from opening night)                 | What                                                                                                      |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Week 0, a Monday (Oct 8 to 14)                  | The regular season opens (game day 1)                                                                     |
| Week 26, a Sunday                               | The regular season ends. Its game days are spread evenly over the 26 weeks, however many the schedule has |
| The Saturday after                              | The playoffs open. A playoff day is two calendar days, so even the longest finals end by mid June         |
| Week 35, a Monday (about Jun 14 to 20)          | The offseason begins: players age and some retire                                                         |
| Week 36, the Thursday (about Jun 24 to 30)      | The draft lottery and the draft                                                                           |
| Week 37, a Monday, to four weeks before opening | Free agency and the staff market (ten to eleven weeks)                                                    |
| Four weeks before, a Monday, for two weeks      | Training camp                                                                                             |
| Two weeks before, a Monday, for two weeks       | Preseason: rosters are final, camp results are in, the new schedule is ready                              |

The offseason's weeks are counted from the opening night before it (the draft is 36 weeks after last season's opening); camp and the preseason are counted back from the opening night they lead into. Because a year is 52 or 53 weeks, the offseason is a week longer in some years. There are no exhibition games: the preseason is the two weeks in which the owner reviews the roster and the camp report before the opener. The rule is the same for every league.

## The offseason (Owner Mode)

What happens between one season and the next, in order. Each step is a button the owner presses on the **Offseason** page; the stage and its dates show at the top. Numbers marked _tunable_ are expected to change after play-testing.

1. **The offseason begins** (from a complete season). The season is archived into history. Every player is a year older: young players improve towards their potential (most quickly at 19 to 21), players peak around 26 to 28, and from 29 athletic ratings (speed, strength, stamina) fade first while shooting and passing hold. Each result is the age curve plus luck. Some players retire: nobody retires young, weak players of 31 or more may, the chance climbs after 33 and everyone has retired by 40, and a player with no team retires within a few years. Staff contracts that have run out end. _tunable_
2. **The draft** (stage "Draft"). **Your decisions.** The rookie class exists from the start of the offseason, so there is a draft board to look at before anything is drawn. Prospects show _scouted_ ratings: the true overall and potential seen through noise that depends on your scout (a better scout means a clearer board), fixed for each prospect so refreshing never changes what you see. The stage has two parts. **The lottery follows how teams finished**: teams that missed the playoffs are in it, the worse the record the better the odds, with the three worst sharing the best (about 14% each in a 14-team lottery); the first four picks are drawn and the other lottery teams follow in record order, so nobody falls more than four places; playoff teams pick after, ordered by how far they got (earlier exits first, the champion last). Then the picks are made in order, two rounds, one pick per team in each. The owner can make their own pick when their team is on the clock, ask for **a suggestion**, **sim to their next pick**, or **auto-pick for them**. Computer teams take the best prospect on their board (overall and potential, leaning on potential for the young, plus a need for positions they are short of) through the noise of their own scout. When the last pick is made, undrafted prospects join the free-agent pool and the stage moves on.
3. **Free agency** (stage "Free agency"). Players who retired or were released and the undrafted rookies are free agents. **Free agency has no cap.** The owner can **release** players from their roster and **sign** any free agent (up to 15 players) while the stage is open; a signing is not yet about money (see "What is missing"). The staff market is open. When the stage ends the computer teams sign free agents (after the owner has had their turn): a team carries **12 to 15 players** and can be anywhere in that range, releasing its weakest above 15, letting go of players not worth a place, and signing up to a size of its own choosing, worst team first, preferring positions it is short of; the computer teams hire staff too. **The stage can't end while your roster is outside 12 to 15** unless AI Assist is doing that job (below).
4. **Training camp** (stage "Training camp"). Each team can send some players to camp. The owner picks who goes and what they work on; the other teams send their young, high-potential players. When the stage ends the camp is held and the gains are applied (below).
5. **Preseason** (stage "Preseason"). Rosters are final and the camp report is in. Starting the season opens the schedule on Oct 20.

### AI Assist

AI Assist is for owners who want a less hands-on game, or who simulate through a stretch and don't want to do a job they find tedious. Each franchise the user runs has five switches. **On means the AI does that job for the franchise, with the same rules as a computer team; off means the owner does it and the game waits for them.** The switches can be changed at any time, from the Offseason page or from the league's settings.

| Switch            | When on, the AI                                                                                       | When off, the owner                                                                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Drafting          | makes the franchise's draft picks                                                                     | makes each pick when the franchise is on the clock; "sim to my pick" stops there                      |
| Scouting          | ranks the draft board for the franchise's needs and suggests the best pick                            | sees the scouted ratings and ranks the board themselves (a suggestion is still one click away)        |
| Roster management | releases and signs players in free agency and the preseason, as a computer team does                  | releases and signs their own players                                                                  |
| Roster coverage   | keeps the roster legal (12 to 15) and every position covered when the owner has left it short or long | has to make the roster legal before free agency or the preseason can end; the game says what is wrong |
| Trades            | _not built yet_ (trades are a later phase)                                                            | _not built yet_                                                                                       |

Nothing the AI does is hidden: what it did shows in the offseason report. Simulating never blocks on a job that the AI is doing.

### Training camp

- **Programs.** Six, each improving a group of ratings: Shooting (mid-range, three-point, free throw), Inside game (inside scoring, offensive and defensive rebounding), Playmaking (passing, ball handling), Perimeter defense, Interior defense, and Athleticism (speed, strength, stamina).
- **Places.** A team has 3 places in camp, plus 1 if its head coach is rated 60 or more and 2 if 80 or more. A player attends one program.
- **Gains.** Each rating in the program improves by about 1.5, plus up to 2.5 for a development coach at 99 (athleticism: the conditioning coach instead), times a factor for age (1.4 up to 22, 1.0 to 27, 0.6 to 30, 0.3 after), plus luck. A player can't be pushed past his potential in overall, and the gains are small enough that no single camp makes a star.
- **The camp report** lists every player who attended, the program and what changed.

### Staff

- **Roles.** Four, one person each: **head coach** (camp places), **development coach** (camp gains), **conditioning coach** (athleticism gains at camp) and **scout** (a clearer draft board). Every staff member has a rating from 30 to 95, an age and a salary that rises steeply with the rating.
- **Budget.** Every team has a staff budget of $10 million, and total staff salary can't exceed it, so a team can't have the best of everyone.
- **Contracts.** One to three years. At the start of each offseason, contracts that have run out end and the person joins the staff market, and staff over 64 retire.
- **The market.** Every league starts with staff on every team and a pool of free agents. The owner can hire a free agent into a role (an existing person in that role is released into the market) or let someone go. The computer teams hire the best they can afford for each role.

### What the owner sees

An **Offseason** page: the stage and calendar at the top with the button for the next step, then, for the current stage, the lottery and draft, the staff market, the camp (choose players and programs) and the camp report. The draft and the camp reports of past years stay readable.

### Not yet

Money: contracts and salaries for players, the salary cap, offers in free agency, trades, and owner finances (see below).

## What is missing, and the order to build it (Owner Mode)

An audit after Phase 17, before the next phase. Each gap is something the owner should be able to do or see and can't yet.

**1. AI Assist is stored but not used, so the owner has no say.** Every team has five AI Assist switches (trades, roster coverage, roster management, scouting, drafting), and the setup screen saves them, but nothing reads them. The offseason runs your team's draft and roster moves with the computer teams' rules whatever the switches say. The intended meaning is the opposite: with a switch off the owner decides, with it on the AI decides for that job. This is the first thing to fix because every other owner action hangs on it.

**2. Draft and roster moves.** The draft class doesn't exist until the draft is held, so there is nothing to scout, rank or choose from. The owner can't pick, can't trade picks, can't release or sign a player (the free agents are listed nowhere), can't set the roster before free agency ends, and has no say in who retires or is cut when a team is over 15. During the season there are no roster moves at all.

**3. Player signings, and with them money.** Players have no contract, no salary and no length, so there is nothing to offer, extend, let expire or cap. Free agency is only the computer filling rosters. Signings need a money model first: a salary for every player, contract years, a salary cap (soft or hard, and the rules for exceptions), the draft's rookie scale, and how a free agent chooses between offers. Without it "sign a player" would be a button with no consequence.

**The money model, as agreed.** One cap decides everything; there is no owner profit to manage. It is a **soft cap with a hard ceiling**, so exceptions exist but can't be abused. A team under the cap can sign anyone it can afford. Over the cap a team can still add players through **exceptions**: re-signing its own players (a team may go over the cap to keep a player it already has), a mid-level exception for a free agent, minimum contracts, the rookie scale for draft picks, and a disabled-player exception when someone is badly hurt (injuries are not built yet, so that one waits for them). Above the cap there is a second line, the **hard ceiling** (a set percentage over the cap) that nothing can take a team past, so money alone can't buy every good player. Staff salaries count in the same payroll. The cap grows slowly with the league's revenue, which has no model of its own; it is a number the league sets each year.

**4. Staff salaries are only a budget check.** Staff have salaries and contracts, but nothing is ever paid, because the league has no finances: no revenue (tickets, TV, merchandise), no payroll, no owner profit, no budget that changes with success or market size. Every team has the same $10 million, forever. The staff budget should become part of the same finances as player salaries (one payroll, one cap or tax rule, a budget that depends on the team).

**5. Staff do less than the design says.** The head coach only sets camp places, and nothing carries into games. `TeamStrategy` (pace, three-point focus, defence) exists in the engine but is the same default for every team and can't be set, stored or changed, and starters are chosen automatically. A head coach, lineups and a strategy page belong together.

**6. Smaller gaps.** Only the champion and the finalist are recorded as awards (no MVP, rookie of the year, all-league teams, scoring titles); no injuries; no all-star game; no record book or league history page; no notification when a player retires or a contract ends; a rookie class that doesn't age into a story (no prospects before the draft); no trades, even between computer teams.

**Order.** (a) Make AI Assist real and move the offseason's decisions to the owner: a draft board that exists before the draft, choosing picks, roster moves in free agency and the preseason. (b) Finances and contracts: salaries, the cap, rookie scale, owner budget, staff payroll folded into it. (c) Free agency with offers and negotiation, extensions, releases. (d) In-season roster moves and trades. (e) Strategy, lineups and the head coach's effect on games. (f) Awards and history.

Decisions the design needs from the owner are listed with each phase when it is planned.

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
