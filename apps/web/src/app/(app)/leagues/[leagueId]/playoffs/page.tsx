import type { Metadata } from "next";
import { Suspense } from "react";
import { teamName } from "@/components/leagues/team-badge";
import { PlayoffBracket } from "@/components/season/playoff-bracket";
import { SimPanel } from "@/components/season/sim-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getPlayoffs } from "@/server/services/playoffs";
import { getSimulation } from "@/server/services/simulation";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Playoffs" };

export default function PlayoffsPage({
  params,
}: PageProps<"/leagues/[leagueId]/playoffs">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Playoffs params={params} />
    </Suspense>
  );
}

async function Playoffs({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/playoffs">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);

  if (league.status !== "active") {
    return (
      <EmptyState
        icon="trophy"
        title="Choose your team first"
        description="The playoffs come at the end of the season, once you've started the league."
      />
    );
  }

  const [bracket, teams, sim] = await Promise.all([
    getPlayoffs(ctx, league.id),
    listTeams(ctx, league.id),
    getSimulation(ctx, league.id),
  ]);
  const champion = teams.find((t) => t.id === bracket.season?.championTeamId);
  const season = bracket.season;

  return (
    <div className="flex flex-col gap-6">
      <SimPanel
        leagueId={league.id}
        initial={sim}
        championName={champion ? teamName(champion) : null}
      />
      {champion && season ? (
        <p
          role="status"
          className="rounded-lg border border-win bg-surface px-4 py-3 text-lg font-bold"
        >
          {teamName(champion)} are the {season.year} champions.
        </p>
      ) : null}
      {bracket.series.length > 0 ? (
        <PlayoffBracket
          leagueId={league.id}
          rounds={bracket.rounds}
          series={bracket.series}
          teams={teams}
        />
      ) : season?.phase === "playoffs" ? (
        <EmptyState
          icon="trophy"
          title="The playoffs are about to begin"
          description="The regular season is over. Simulate a day and the bracket is built from the final standings."
        />
      ) : (
        <EmptyState
          icon="trophy"
          title="The playoffs come after the regular season"
          description={
            season
              ? `The bracket is built from the final standings once all ${season.lastDay} days of the regular season have been played.`
              : "Start the season from the schedule. The playoffs follow the regular season."
          }
        />
      )}
    </div>
  );
}
