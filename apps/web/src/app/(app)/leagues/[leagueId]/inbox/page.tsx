import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { InboxItem } from "@fullcourt/validation";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getInbox } from "@/server/services/inbox";

export const metadata: Metadata = { title: "Inbox" };

export default function InboxPage({
  params,
}: PageProps<"/leagues/[leagueId]/inbox">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Inbox params={params} />
    </Suspense>
  );
}

const KIND_LABEL: Record<InboxItem["kind"], string> = {
  injury: "Injury",
  move: "Roster",
  trade: "Trade",
  award: "Award",
  offer: "Offer",
  reminder: "Reminder",
};

/** When it happened, in words. */
function when(item: InboxItem): string {
  if (item.day >= 998) return `${item.year}, end of season`;
  if (item.day === 0) return `${item.year} offseason`;
  return `${item.year}, day ${item.day}`;
}

async function Inbox({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/inbox">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);
  const inbox = await getInbox(ctx, league.id);

  if (!inbox.teamId || league.status !== "active") {
    return (
      <EmptyState
        icon="trophy"
        title="Choose your team first"
        description="Your inbox tells you what happens to the team you run."
      />
    );
  }
  if (inbox.items.length === 0) {
    return (
      <EmptyState
        icon="info"
        title="Nothing yet"
        description="Injuries, signings, trades and awards for your team show up here as the season is played."
      />
    );
  }
  return (
    <section aria-labelledby="inbox-heading" className="flex flex-col gap-3">
      <h2 id="inbox-heading" className="text-xl font-bold">
        What has happened to your team
      </h2>
      <ul className="rounded-lg border border-border bg-surface">
        {inbox.items.map((item) => (
          <li
            key={item.id}
            className="flex flex-col gap-1 border-t border-border px-4 py-3 first:border-t-0"
          >
            <p className="text-sm text-text-muted">
              <span className="font-semibold">{KIND_LABEL[item.kind]}</span> ·{" "}
              {when(item)}
            </p>
            <p>
              {item.href ? (
                <Link
                  href={item.href}
                  className="text-accent underline underline-offset-4"
                >
                  {item.text}
                </Link>
              ) : (
                item.text
              )}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
