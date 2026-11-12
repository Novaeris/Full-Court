import { formatHeight } from "@fullcourt/game-rules";
import type { Player } from "@fullcourt/validation";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { controlLabel } from "@/components/leagues/control";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { ApiError } from "@/server/api/handler";
import { loadLeague } from "@/server/leagues/load";
import { getTeam } from "@/server/services/world";

export const metadata: Metadata = { title: "Team" };

export default function TeamPage({
  params,
}: PageProps<"/leagues/[leagueId]/teams/[teamId]">) {
  return (
    <Suspense
      fallback={
        <div className="h-96 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <TeamRoster params={params} />
    </Suspense>
  );
}

async function TeamRoster({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/teams/[teamId]">["params"];
}) {
  const { leagueId, teamId } = await params;
  const { ctx, league } = await loadLeague(leagueId);
  const detail = await getTeam(ctx, league.id, teamId).catch((error) => {
    if (error instanceof ApiError && error.status === 404) notFound();
    throw error;
  });
  const { team, players } = detail;
  const control = controlLabel(team.localPlayerSlot, league.localPlayerCount);

  const columns: Column<Player>[] = [
    {
      key: "name",
      header: "Player",
      cell: (p) => (
        <Link
          href={`/leagues/${league.id}/players/${p.id}`}
          className="inline-flex min-h-touch items-center gap-2 text-accent underline-offset-4 hover:underline"
        >
          <span className="w-6 text-right text-xs text-text-muted tabular-nums">
            {p.jersey}
          </span>
          {p.firstName} {p.lastName}
        </Link>
      ),
    },
    { key: "pos", header: "Position", abbr: "Pos", cell: (p) => p.position },
    {
      key: "ovr",
      header: "Overall",
      abbr: "OVR",
      align: "end",
      cell: (p) => p.overall,
    },
    {
      key: "pot",
      header: "Potential",
      abbr: "POT",
      align: "end",
      priority: 2,
      cell: (p) => p.potential,
    },
    {
      key: "age",
      header: "Age",
      align: "end",
      priority: 2,
      cell: (p) => p.age,
    },
    {
      key: "ht",
      header: "Height",
      abbr: "HT",
      align: "end",
      priority: 2,
      cell: (p) => formatHeight(p.heightInches),
    },
    {
      key: "ins",
      header: "Inside",
      abbr: "INS",
      align: "end",
      priority: 3,
      cell: (p) => p.ratings.inside,
    },
    {
      key: "3pt",
      header: "Three-point",
      abbr: "3PT",
      align: "end",
      priority: 3,
      cell: (p) => p.ratings.threePoint,
    },
    {
      key: "pas",
      header: "Passing",
      abbr: "PAS",
      align: "end",
      priority: 3,
      cell: (p) => p.ratings.passing,
    },
    {
      key: "reb",
      header: "Rebounding",
      abbr: "REB",
      align: "end",
      priority: 3,
      cell: (p) =>
        Math.round((p.ratings.offRebound + p.ratings.defRebound) / 2),
    },
    {
      key: "def",
      header: "Defense",
      abbr: "DEF",
      align: "end",
      priority: 3,
      cell: (p) => Math.round((p.ratings.perimeterD + p.ratings.interiorD) / 2),
    },
    {
      key: "ath",
      header: "Athleticism",
      abbr: "ATH",
      align: "end",
      priority: 3,
      cell: (p) => Math.round((p.ratings.speed + p.ratings.strength) / 2),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <section
        aria-label="Team"
        className="flex items-center gap-4 rounded-lg border bg-surface p-5"
        style={{ borderColor: team.primaryColor }}
      >
        <TeamBadge team={team} size="lg" />
        <div className="min-w-0">
          <h2 className="text-2xl font-bold">{teamName(team)}</h2>
          <p className="text-text-muted">
            {team.conference} Conference · {team.division} Division · Strength{" "}
            {team.strength}
            {control ? ` · ${control}` : ""}
          </p>
        </div>
      </section>
      <ResponsiveTable
        caption={`${teamName(team)} roster`}
        columns={columns}
        rows={players}
        rowKey={(p) => p.id}
      />
      <p className="text-sm text-text-muted">
        Ratings run from 25 to 99. Overall weighs each skill by what the
        player&apos;s position needs. Potential is how good a player could
        become.
      </p>
    </div>
  );
}
