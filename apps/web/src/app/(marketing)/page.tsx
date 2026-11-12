import { Card, Page, Section } from "@/components/layout/primitives";
import { ButtonLink } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import { SiteAuthActions } from "@/components/navigation/site-auth-actions";
import { ALPHA_NOTICE } from "@/content/policies";

const FEATURES: readonly { icon: IconName; title: string; body: string }[] = [
  {
    icon: "user",
    title: "Build the roster",
    body: "Draft prospects, sign free agents and trade for the pieces you need. Every player has ratings, a contract and a career that unfolds season by season.",
  },
  {
    icon: "chart",
    title: "Run the business",
    body: "Ticket prices, payroll, facilities and sponsors. Win on the court without going broke off it.",
  },
  {
    icon: "ball",
    title: "Every game simulated",
    body: "A full league plays out around you, possession by possession, with box scores, standings and playoff races.",
  },
  {
    icon: "calendar",
    title: "Play at your pace",
    body: "Advance a day, a week or a whole season. Your league is saved online, so it's there on any device.",
  },
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-border bg-surface">
        <div className="mx-auto grid max-w-content items-center gap-10 px-4 py-12 tablet:px-6 tablet:py-16 desktop:grid-cols-[1.1fr_1fr] desktop:px-8 desktop:py-24">
          <div>
            <p className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-on-accent-soft">
              Open alpha
            </p>
            <h1 className="mt-4 text-4xl font-black tracking-tight text-balance tablet:text-5xl">
              Own the franchise. Build a dynasty.
            </h1>
            <p className="mt-4 max-w-prose text-lg text-text-muted tablet:text-xl">
              Full Court is a basketball management game. Run a team in a fully
              simulated league: shape the roster, balance the books and chase a
              championship.
            </p>
            <div className="mt-8 flex flex-col gap-3 tablet:flex-row">
              <SiteAuthActions placement="hero" />
            </div>
          </div>
          <ScreenshotPlaceholder />
        </div>
      </section>

      <Page>
        <AlphaAnnouncement />

        <Section
          title="What you'll do"
          description="Full Court is being built in the open. These systems are on the roadmap."
        >
          <div className="grid gap-4 tablet:grid-cols-2 desktop:grid-cols-4">
            {FEATURES.map((feature) => (
              <Card key={feature.title}>
                <span className="flex size-11 items-center justify-center rounded-md bg-accent-soft text-on-accent-soft">
                  <Icon name={feature.icon} className="size-6" />
                </span>
                <h3 className="mt-4 text-lg font-bold">{feature.title}</h3>
                <p className="mt-2 text-text-muted">{feature.body}</p>
              </Card>
            ))}
          </div>
        </Section>

        <Section title="On every screen">
          <Card className="flex flex-col gap-4 desktop:flex-row desktop:items-center desktop:justify-between">
            <p className="max-w-prose text-text-muted">
              Full Court starts on the web and works on phones, tablets and
              desktops. Native mobile apps come later, sharing the same account
              and saved leagues.
            </p>
            <ButtonLink href="/about" variant="secondary">
              Read the plan
            </ButtonLink>
          </Card>
        </Section>
      </Page>
    </>
  );
}

/** Open-alpha announcement: what to expect before signing up. */
function AlphaAnnouncement() {
  return (
    <section
      aria-labelledby="alpha-announcement"
      className="mb-10 rounded-lg border border-accent bg-surface p-5 tablet:p-6"
    >
      <div className="flex items-start gap-4">
        <span className="hidden size-11 shrink-0 items-center justify-center rounded-md bg-accent-soft text-on-accent-soft tablet:flex">
          <Icon name="alert" className="size-6" />
        </span>
        <div className="min-w-0">
          <h2
            id="alpha-announcement"
            className="text-2xl font-bold tracking-tight"
          >
            {ALPHA_NOTICE.title}
          </h2>
          <p className="mt-2 max-w-prose text-text-muted">
            Anyone can sign up and play while the game is being built.{" "}
            {ALPHA_NOTICE.summary}
          </p>
          <ul className="mt-3 ml-5 flex list-disc flex-col gap-1">
            {ALPHA_NOTICE.points.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-3 tablet:flex-row">
            <ButtonLink href="/alpha" variant="secondary">
              Read the Alpha Disclaimer
            </ButtonLink>
            <ButtonLink href="/changelog" variant="secondary">
              See what&apos;s new
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}

/** Stand-in for product screenshots until the game exists. */
function ScreenshotPlaceholder() {
  const rows = [
    ["Harbor City", "41–12", "W5"],
    ["Ridgeport", "38–15", "W2"],
    ["Lakeview", "35–18", "L1"],
    ["Summit Bay", "31–22", "W1"],
  ];
  return (
    <figure
      aria-label="Example standings (illustration)"
      className="rounded-lg border border-border bg-canvas p-4 shadow-sm"
    >
      <div className="flex items-center justify-between">
        <span className="font-bold">Standings</span>
        <span className="text-sm text-text-muted">Illustration</span>
      </div>
      <ol className="mt-3 flex flex-col gap-2">
        {rows.map(([team, record, streak], index) => (
          <li
            key={team}
            className="flex items-center justify-between rounded-md bg-surface px-3 py-2"
          >
            <span className="flex items-center gap-3">
              <span className="w-4 text-sm text-text-muted tabular-nums">
                {index + 1}
              </span>
              <span className="font-semibold">{team}</span>
            </span>
            <span className="flex items-center gap-4 tabular-nums">
              <span>{record}</span>
              <span
                className={
                  streak?.startsWith("W")
                    ? "w-8 text-right font-semibold text-win"
                    : "w-8 text-right font-semibold text-loss"
                }
              >
                {streak}
              </span>
            </span>
          </li>
        ))}
      </ol>
    </figure>
  );
}
