import { formatHeight } from "@fullcourt/game-rules";
import type { Player, TeamGame } from "@fullcourt/validation";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { controlLabel } from "@/components/leagues/control";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { ResponsiveTable, type Column } from "@/components/ui/responsive-table";
import { ApiError } from "@/server/api/handler";
import { loadLeague } from "@/server/leagues/load";
import { getTeamOverview } from "@/server/services/team-overview";
import { getTeam, listTeams } from "@/server/services/world";

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
  const [overview, allTeams] = await Promise.all([
    getTeamOverview(ctx, league.id, teamId),
    listTeams(ctx, league.id),
  ]);
  const opponent = (id: string) => {
    const t = allTeams.find((x) => x.id === id);
    return t ? t.abbreviation : "?";
  };
  const gameLine = (g: TeamGame, upcoming: boolean) => (
    <li
      key={g.gameId}
      className="flex flex-wrap justify-between gap-x-3 border-t border-border py-1.5 first:border-t-0"
    >
      <Link
        href={`/leagues/${league.id}/games/${g.gameId}`}
        className="inline-flex min-h-touch items-center text-accent underline underline-offset-4"
      >
        Day {g.day}: {g.home ? "vs" : "at"} {opponent(g.opponentId)}
        {g.round ? " (playoffs)" : ""}
      </Link>
      <span className="tabular-nums">
        {upcoming ? "" : `${g.won ? "W" : "L"} ${g.score}`}
      </span>
    </li>
  );
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
      key: "status",
      header: "Status",
      cell: (p) =>
        p.injuryDays > 0 ? (
          <span className="font-semibold text-danger">
            Out {p.injuryDays} {p.injuryDays === 1 ? "day" : "days"}
            <span className="sr-only">: {p.injuryKind}</span>
          </span>
        ) : (
          <span className="text-text-muted">Fit</span>
        ),
    },
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
      <section
        aria-labelledby="overview-heading"
        className="rounded-lg border border-border bg-surface p-5"
      >
        <h3 id="overview-heading" className="text-lg font-bold">
          {overview.season ? `${overview.season.year} season` : "This season"}
        </h3>
        {overview.record ? (
          <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 tablet:grid-cols-5">
            {[
              ["Record", `${overview.record.wins}-${overview.record.losses}`],
              ["Rank", `${overview.record.rank} of ${overview.record.teams}`],
              [
                "Points",
                `${overview.record.pointsFor.toFixed(1)} for, ${overview.record.pointsAgainst.toFixed(1)} against`,
              ],
              ["Streak", overview.record.streak || "-"],
              ["Last 10", overview.record.lastTen || "-"],
            ].map(([label, value]) => (
              <div key={label} className="flex flex-col">
                <dt className="text-sm text-text-muted">{label}</dt>
                <dd className="font-bold tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p className="mt-2 text-text-muted">No games played yet.</p>
        )}
        <p className="mt-3">
          <span className="font-semibold">How they play:</span>{" "}
          {overview.style.words}{" "}
          <span className="text-sm text-text-muted">
            (
            {overview.style.setByOwner
              ? "set by the owner"
              : "chosen to suit the roster"}
            )
          </span>
        </p>
        {overview.leaders.length > 0 ? (
          <p className="mt-2 text-sm">
            <span className="font-semibold">Leaders:</span>{" "}
            {overview.leaders.map((l, i) => (
              <span key={l.category}>
                {i > 0 ? " · " : ""}
                <Link
                  href={`/leagues/${league.id}/players/${l.playerId}`}
                  className="text-accent underline underline-offset-4"
                >
                  {l.name}
                </Link>{" "}
                {l.perGame.toFixed(1)}{" "}
                {l.category === "points"
                  ? "pts"
                  : l.category === "rebounds"
                    ? "reb"
                    : "ast"}
              </span>
            ))}
          </p>
        ) : null}
        {overview.recent.length + overview.upcoming.length > 0 ? (
          <div className="mt-3 grid gap-4 tablet:grid-cols-2">
            {overview.recent.length > 0 ? (
              <div>
                <h4 className="font-semibold">Latest results</h4>
                <ul>{overview.recent.map((g) => gameLine(g, false))}</ul>
              </div>
            ) : null}
            {overview.upcoming.length > 0 ? (
              <div>
                <h4 className="font-semibold">Next games</h4>
                <ul>{overview.upcoming.map((g) => gameLine(g, true))}</ul>
              </div>
            ) : null}
          </div>
        ) : null}
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
