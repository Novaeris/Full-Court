import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import type { NewsItem } from "@fullcourt/validation";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getNews } from "@/server/services/news";

export const metadata: Metadata = { title: "League news" };

export default function NewsPage({
  params,
}: PageProps<"/leagues/[leagueId]/news">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <News params={params} />
    </Suspense>
  );
}

const KIND_LABEL: Record<NewsItem["kind"], string> = {
  move: "Roster",
  trade: "Trade",
  injury: "Injury",
  retirement: "Retirement",
  award: "Award",
};

/** When it happened, in words. */
function when(item: NewsItem): string {
  if (item.day >= 998) return `${item.year}, end of season`;
  if (item.day === 0) return `${item.year} offseason`;
  return `${item.year}, day ${item.day}`;
}

async function News({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/news">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);
  const { items } = await getNews(ctx, league.id);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="info"
        title="Nothing yet"
        description="Signings, trades, serious injuries, retirements and awards from around the league show up here as the season is played."
      />
    );
  }
  return (
    <section aria-labelledby="news-heading" className="flex flex-col gap-3">
      <h2 id="news-heading" className="text-xl font-bold">
        Around the league
      </h2>
      <ul className="rounded-lg border border-border bg-surface">
        {items.map((item) => (
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
