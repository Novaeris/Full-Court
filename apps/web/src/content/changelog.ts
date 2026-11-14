/**
 * Public changelog, newest first. Add an entry with every release.
 * Versions follow MAJOR.MINOR.PATCH-alpha while Full Court is in alpha.
 */
export type ChangelogEntry = {
  version: string;
  /** Release date, YYYY-MM-DD. */
  date: string;
  title: string;
  added?: readonly string[];
  improved?: readonly string[];
  fixed?: readonly string[];
};

export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    version: "0.12.0-alpha",
    date: "2026-11-14",
    title: "History, stats and the All-Star Game",
    added: [
      "Awards at the end of every season: most valuable player, finals MVP, defensive player, rookie, sixth man, most improved, the scoring, rebounding, assists, steals and blocks titles, and three all-league teams.",
      "A History tab with every season's champion, awards and all-league teams, how many titles each team has, and a record book of the best single games, seasons and team records. A player's page lists his awards and his seasons.",
      "A Stats tab with the league leaders in eight categories, for the regular season and the playoffs, and a season line and latest games on every player's page.",
      "An All-Star Game half way through the season: the 24 best players so far, drafted into two squads by the two best, play a real game with a most valuable player.",
      "A written recap on every finished game: who won, who led each team, standout lines like a triple-double, and what kind of game it was.",
      "An overview on every team's page: record and rank, scoring, streak, last ten, how the team plays, its leaders, its latest results and its next games.",
      "An Inbox tab that tells you what happened to your team: injuries, signings and releases, trades, awards, open trade offers and which contracts end.",
      "Download a backup of a league from its Settings page, and restore a backup as a new league from the Leagues page.",
      "A trading block: put up to five of your players on it and computer teams make offers for them.",
      "Power rankings on the Standings tab: every team ranked by its record, how much it wins and loses by, and its last ten games.",
      "A cap outlook on your roster: what your contracts commit in each of the next five seasons, the cap, your room and how many contracts end, for planning extensions and free agency.",
      "Contract extensions: give a player with two years or fewer left a new contract from the Moves page. He signs if the offer is worth enough to him, and you can see the least he will take.",
    ],
    improved: [
      "A league page you reach by following a link now opens at the top, so its first link is never hidden under the header on a phone.",
    ],
  },
  {
    version: "0.11.0-alpha",
    date: "2026-11-14",
    title: "Coaching and injuries",
    added: [
      "Set how your team plays: pace, three-point focus and defence, and name your starting five, from the Moves page. Computer teams now choose a style that suits their roster, so the league has a mix of fast teams, shooting teams and defensive teams.",
      "Head coaches matter: every team has one from its first season, and a better coach adds a little to every player in your games. Choose how many players the coach uses, from seven to twelve.",
      "Injuries during games: a hurt player leaves the game at once and is out for some days (a few for a sprain, weeks for something worse). The team and player pages say who is out and for how long, and the offseason heals everyone.",
      "Draft picks are trade assets, valued by round, how far away they are and how weak the original team is, and the draft shows where a traded pick came from. Computer teams trade with each other, offer you trades, and add picks to close a deal.",
    ],
    improved: [
      "A named starter who is hurt is replaced by the best healthy player on game day.",
    ],
    fixed: [
      "A computer team that had to let players go to stay under the hard ceiling could end free agency with too few players. It is filled properly now.",
      "Saving your strategy no longer wipes its own confirmation message.",
    ],
  },
  {
    version: "0.10.0-alpha",
    date: "2026-11-13",
    title: "Contracts, free agency and trades",
    added: [
      "A salary cap with a hard ceiling. Every player has a salary and a contract length, and free agency lasts 21 days of offers: players weigh the money against how a team wins, the role they would play, its city and its history.",
      "Trades with the computer teams, shopping a player to see what teams would give, and roster moves (release and sign) through the season, with a trade deadline two thirds of the way through.",
    ],
  },
  {
    version: "0.9.0-alpha",
    date: "2026-11-13",
    title: "The offseason",
    added: [
      "A full offseason after every season: players age and some retire, a draft lottery that follows how teams finished, a draft board you can scout and pick from, free agency, training camp and a calendar that runs from the finals to opening night.",
      "Staff: a head coach, a development coach, a conditioning coach and a scout for every team, with a market to hire from.",
      "AI Assist now does its jobs: it makes your picks, keeps your roster legal and covers the work you leave undone, and you can always act first.",
    ],
  },
  {
    version: "0.8.0-alpha",
    date: "2026-11-12",
    title: "Seasons and playoffs",
    added: [
      "Play a season: a schedule for every team, games simulated play by play, standings, box scores and a game viewer where you can watch any game on the court.",
      "Simulate a day, a week or a whole season, with live progress.",
      "The playoffs, drawn as a bracket, a champion, and starting the next season. A league can play up to 50 seasons.",
    ],
  },
  {
    version: "0.7.0-alpha",
    date: "2026-11-12",
    title: "League setup",
    added: [
      "Set up your league before it starts: the standard 30-team layout, or a custom league of up to 32 teams.",
      "Pick a region: North America, South America, Europe, Asia, or Australia and Oceania. Every team gets a real city from the region, and no two teams share a city.",
      "Choose the playoffs: how many teams qualify, conference or league-wide seeding, automatic spots for division leaders, and best-of-3, 5 or 7 series, round by round.",
      "Run one team or several, and let friends on the same device run their own: up to 8 local players, each with one or more franchises.",
      "Customise your franchises with a city, team name, colours and one of 24 logos. Everything else is generated, and you can preview the whole league and shuffle it before you create it.",
      "AI Assist settings for each franchise: trades, roster coverage, roster and rotation, scouting and drafting. Your choices are saved, but the AI itself isn't in the game yet.",
      "A fantasy draft option, saved with your league. The draft itself comes later.",
      "Rename conferences and divisions when you create a league, or later from league settings.",
    ],
    improved: [
      "Your league page shows every team you run.",
      "Teams show their logo.",
      "League settings show the rules your league was created with.",
    ],
  },
  {
    version: "0.6.0-alpha",
    date: "2026-11-11",
    title: "Game modes",
    added: [
      "Choose Your Game Mode: the new home of the app after you sign in, with Owner, Career and Dynasty Mode.",
      "An Owner Mode page for starting a new world and opening your saved leagues.",
      "Career Mode and Dynasty Mode pages. Both are in development and not playable yet.",
    ],
    improved: [
      "The app navigation now leads with the game modes.",
      "A tidier sidebar: account settings, theme, help, legal and sign out now live in one account menu under your name.",
      "Policies, the changelog and support now open inside the game when you're signed in, and the Full Court logo takes you back to your game modes instead of the home page.",
    ],
  },
  {
    version: "0.5.0-alpha",
    date: "2026-11-11",
    title: "Open alpha",
    added: [
      "Full Court is open to everyone as an open alpha.",
      "Terms of Service, Privacy Policy, Alpha Disclaimer and Acceptable Use Policy.",
      "A Contact & Support form for bug reports, feedback and questions.",
      "An alpha introduction the first time you sign in, and an alpha badge in the app.",
      "This changelog.",
      "Anonymous usage totals (no cookies or personal identifiers) that respect Global Privacy Control and Do Not Track.",
    ],
    improved: [
      "Sign-up now explains the alpha conditions and asks you to agree to the Terms.",
      "The footer links to every policy, support and the changelog.",
      "The account page explains exactly what deleting your account removes.",
    ],
  },
  {
    version: "0.4.0-alpha",
    date: "2026-11-10",
    title: "Generated league worlds",
    added: [
      "Every new league generates its own fictional teams and 15-player rosters.",
      "Players have 13 ratings, an overall and potential rating, age, height and weight.",
      "Choose a standard (30-team) or compact (12-team) league.",
      "Choose the team you manage, browse every team and open player pages.",
    ],
    fixed: [
      "League creation could fail on rare generated body weights.",
      "Team badges and sheet backdrops used colors missing from the theme.",
    ],
  },
  {
    version: "0.3.0-alpha",
    date: "2026-11-10",
    title: "Leagues",
    added: [
      "Create, rename and delete leagues, up to five per account.",
      "League pages with Overview, Roster, Schedule, Standings and Settings tabs.",
      "Sign out from the sidebar, the More menu and the site header.",
    ],
  },
  {
    version: "0.2.0-alpha",
    date: "2026-11-10",
    title: "Accounts",
    added: [
      "Sign up with email confirmation, sign in and sign out.",
      "Reset a forgotten password.",
      "Change your display name, email address and password, or delete your account.",
      "Sign in and sign up straight from the home page.",
    ],
    improved: [
      "Emails we send explain how to find them if they land in your junk folder.",
    ],
  },
  {
    version: "0.1.0-alpha",
    date: "2026-11-10",
    title: "Website and design system",
    added: [
      "The Full Court website, built for phones, tablets and desktops.",
      "Light and dark themes that follow your device or your choice.",
      "Navigation that adapts to your screen: sidebar, icon rail or bottom tabs.",
    ],
  },
];

/** The newest released version, shown in the footer. */
export const CURRENT_VERSION = CHANGELOG[0]!.version;
