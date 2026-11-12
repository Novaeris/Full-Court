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
