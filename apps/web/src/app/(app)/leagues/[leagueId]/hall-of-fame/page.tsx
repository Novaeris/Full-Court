import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getHallOfFame } from "@/server/services/hall-of-fame";

export const metadata: Metadata = { title: "Hall of Fame" };

export default function HallOfFamePage({
  params,
}: PageProps<"/leagues/[leagueId]/hall-of-fame">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Hall params={params} />
    </Suspense>
  );
}

async function Hall({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/hall-of-fame">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);
  const hall = await getHallOfFame(ctx, league.id);
  const base = `/leagues/${league.id}`;

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`${base}/history`}
        className="-ml-2 inline-flex min-h-touch w-fit items-center rounded-md px-2 font-semibold text-text-muted hover:text-text"
      >
        History
      </Link>
      <section aria-labelledby="hall-heading" className="flex flex-col gap-3">
        <h2 id="hall-heading" className="text-xl font-bold">
          Hall of Fame
        </h2>
        <p className="text-text-muted">
          A retired player is inducted three seasons after he retires if his
          career in this league was great enough: his production, his awards,
          his All-Star Games and his championships.
          {hall.retired > 0
            ? ` ${hall.retired} ${hall.retired === 1 ? "player has" : "players have"} retired so far.`
            : ""}
        </p>
        {hall.members.length === 0 ? (
          <EmptyState
            icon="trophy"
            title="Nobody inducted yet"
            description="The Hall fills as great players retire and their waiting time passes."
          />
        ) : (
          <ul className="rounded-lg border border-border bg-surface">
            {hall.members.map((m) => (
              <li
                key={m.playerId}
                className="flex flex-col gap-1 border-t border-border px-4 py-3 first:border-t-0"
              >
                <p>
                  <Link
                    href={`${base}/players/${m.playerId}`}
                    className="font-semibold text-accent underline underline-offset-4"
                  >
                    {m.name}
                  </Link>{" "}
                  <span className="text-text-muted">
                    {m.position} · inducted {m.inductedYear}, retired{" "}
                    {m.retiredYear}
                  </span>
                </p>
                <p className="text-sm">
                  {m.seasons} {m.seasons === 1 ? "season" : "seasons"},{" "}
                  {m.points} pts, {m.rebounds} reb, {m.assists} ast
                  {m.titles > 0
                    ? ` · ${m.titles} ${m.titles === 1 ? "title" : "titles"}`
                    : ""}
                  {m.allStars > 0 ? ` · ${m.allStars}× All-Star` : ""}
                </p>
                {m.honors.length > 0 ? (
                  <p className="text-sm text-text-muted">
                    {m.honors
                      .map((h) =>
                        h.count > 1 ? `${h.label} ×${h.count}` : h.label,
                      )
                      .join(" · ")}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
