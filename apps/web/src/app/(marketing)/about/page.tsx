import type { Metadata } from "next";
import { Page, PageHeader, Section } from "@/components/layout/primitives";

export const metadata: Metadata = { title: "About" };

const ROADMAP = [
  ["Accounts", "Sign up, sign in and manage your profile."],
  ["Leagues", "Create and manage your saved leagues."],
  ["World", "Generated teams, players and ratings."],
  ["Games", "Simulated games, schedules, standings and box scores."],
  [
    "Seasons",
    "Advance through a season with live progress, then the playoffs.",
  ],
  ["Front office", "Draft, free agency, contracts, trades and finances."],
] as const;

export default function AboutPage() {
  return (
    <Page width="prose">
      <PageHeader
        title="About Full Court"
        description="A basketball franchise-management game, built web first."
      />
      <div className="flex flex-col gap-4 text-lg leading-relaxed">
        <p>
          You run one team inside a living, simulated league. Every other team
          drafts, signs and trades on its own, and every game is played out by a
          deterministic engine: the same league and the same decisions always
          produce the same results.
        </p>
        <p>
          The league is entirely fictional. No real leagues, teams or players
          appear in the game.
        </p>
      </div>

      <Section title="Roadmap">
        <ol className="flex flex-col gap-3">
          {ROADMAP.map(([title, body], index) => (
            <li key={title} className="flex gap-4">
              <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-on-accent-soft">
                {index + 1}
              </span>
              <div>
                <p className="font-semibold">{title}</p>
                <p className="text-text-muted">{body}</p>
              </div>
            </li>
          ))}
        </ol>
      </Section>

      <Section title="Platforms">
        <p className="text-lg leading-relaxed">
          Full Court launches on the web and is designed for phones, tablets and
          desktops. iOS and Android apps are planned, and a desktop release may
          follow. All of them will share one account and the same saved leagues.
        </p>
      </Section>
    </Page>
  );
}
