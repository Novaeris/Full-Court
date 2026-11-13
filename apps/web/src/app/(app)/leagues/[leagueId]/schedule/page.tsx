import type { Metadata } from "next";
import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/empty-state";
import { SimPanel } from "@/components/season/sim-panel";
import { DaySchedule, TeamSchedule } from "@/components/season/schedule-views";
import { teamName } from "@/components/leagues/team-badge";
import { loadLeague } from "@/server/leagues/load";
import { listSchedule } from "@/server/services/season";
import { getSimulation } from "@/server/services/simulation";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage({
  params,
  searchParams,
}: PageProps<"/leagues/[leagueId]/schedule">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Schedule params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const tab = (active: boolean) =>
  [
    "inline-flex min-h-touch items-center rounded-md border px-4 font-semibold",
    active
      ? "border-accent bg-accent-soft text-on-accent-soft"
      : "border-border bg-surface text-text hover:bg-surface-muted",
  ].join(" ");

async function Schedule({
  params,
  searchParams,
}: {
  params: PageProps<"/leagues/[leagueId]/schedule">["params"];
  searchParams: PageProps<"/leagues/[leagueId]/schedule">["searchParams"];
}) {
  const { leagueId } = await params;
  const query = await searchParams;
  const { ctx, league } = await loadLeague(leagueId);
  const base = `/leagues/${league.id}/schedule`;

  if (league.status !== "active" || !league.userTeamId) {
    return (
      <EmptyState
        icon="calendar"
        title="Choose your team first"
        description="The schedule is built when you start the league. Pick the team you'll run from the overview."
        action={
          <Link
            href={`/leagues/${league.id}`}
            className="inline-flex min-h-touch items-center rounded-md bg-accent px-5 font-semibold text-on-accent hover:bg-accent-strong"
          >
            Choose a team
          </Link>
        }
      />
    );
  }

  const [teams, sim] = await Promise.all([
    listTeams(ctx, league.id),
    getSimulation(ctx, league.id),
  ]);
  const teamMap = new Map(teams.map((t) => [t.id, t]));
  const mine = teams.filter((t) => t.localPlayerSlot !== null);
  const view = query.view === "day" ? "day" : "team";

  const champion = teamMap.get(sim.season?.championTeamId ?? "");
  const panel = (
    <SimPanel
      leagueId={league.id}
      initial={sim}
      championName={champion ? teamName(champion) : null}
    />
  );
  if (!sim.season) {
    return (
      <div className="flex flex-col gap-6">
        {panel}
        <EmptyState
          icon="calendar"
          title="No schedule yet"
          description="Simulate a day to start the season. The schedule is created for you the first time."
        />
      </div>
    );
  }
  const season = sim.season;

  let body: ReactNode;
  if (view === "team") {
    const wanted = typeof query.team === "string" ? query.team : undefined;
    const teamId =
      wanted && teamMap.has(wanted)
        ? wanted
        : (league.userTeamId ?? mine[0]?.id);
    const { games } = await listSchedule(ctx, league.id, { team: teamId });
    const team = teamId ? teamMap.get(teamId) : undefined;
    body = (
      <section aria-label="Team schedule" className="flex flex-col gap-4">
        {mine.length > 1 ? (
          <nav aria-label="Your teams" className="flex flex-wrap gap-2">
            {mine.map((t) => (
              <Link
                key={t.id}
                href={`${base}?team=${t.id}`}
                aria-current={t.id === teamId ? "true" : undefined}
                className={tab(t.id === teamId)}
              >
                {teamName(t)}
              </Link>
            ))}
          </nav>
        ) : null}
        {team ? <h2 className="text-2xl font-bold">{teamName(team)}</h2> : null}
        {teamId ? (
          <TeamSchedule
            leagueId={league.id}
            teamId={teamId}
            games={games}
            teams={teamMap}
          />
        ) : null}
      </section>
    );
  } else {
    const requested = Number(typeof query.day === "string" ? query.day : "");
    const day =
      Number.isInteger(requested) && requested >= 1
        ? Math.min(requested, season.lastDay)
        : Math.min(season.day, season.lastDay);
    const { games } = await listSchedule(ctx, league.id, { day });
    body = (
      <section aria-label="Games by day" className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          {day > 1 ? (
            <Link
              href={`${base}?view=day&day=${day - 1}`}
              className={tab(false)}
            >
              ← Day {day - 1}
            </Link>
          ) : (
            <span aria-hidden="true" className="min-h-touch" />
          )}
          <h2 className="text-xl font-bold">
            Day {day} of {season.lastDay}
          </h2>
          {day < season.lastDay ? (
            <Link
              href={`${base}?view=day&day=${day + 1}`}
              className={tab(false)}
            >
              Day {day + 1} →
            </Link>
          ) : (
            <span aria-hidden="true" className="min-h-touch" />
          )}
        </div>
        {games.length > 0 ? (
          <DaySchedule leagueId={league.id} games={games} teams={teamMap} />
        ) : (
          <p className="text-text-muted">No games on this day.</p>
        )}
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {panel}
      <nav aria-label="Schedule view" className="flex gap-2">
        <Link
          href={base}
          aria-current={view === "team" ? "true" : undefined}
          className={tab(view === "team")}
        >
          My team
        </Link>
        <Link
          href={`${base}?view=day&day=${Math.min(season.day, season.lastDay)}`}
          aria-current={view === "day" ? "true" : undefined}
          className={tab(view === "day")}
        >
          By day
        </Link>
      </nav>
      {body}
    </div>
  );
}
