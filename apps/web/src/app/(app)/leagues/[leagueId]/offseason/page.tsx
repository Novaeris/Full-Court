import type { Metadata } from "next";
import { Suspense } from "react";
import { CampPanel } from "@/components/season/camp-panel";
import { OffseasonControls } from "@/components/season/offseason-controls";
import { OffseasonReport } from "@/components/season/offseason-report";
import { StaffPanel } from "@/components/season/staff-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { STAGE_ACTIONS, getOffseason } from "@/server/services/offseason";
import { getCamp } from "@/server/services/camp";
import { getStaff } from "@/server/services/staff";
import { latestSeason } from "@/server/services/season-shared";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "Offseason" };

export default function OffseasonPage({
  params,
}: PageProps<"/leagues/[leagueId]/offseason">) {
  return (
    <Suspense
      fallback={
        <div className="h-64 animate-pulse rounded-lg bg-surface-muted" />
      }
    >
      <Offseason params={params} />
    </Suspense>
  );
}

async function Offseason({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/offseason">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);

  const [report, teams, season] = await Promise.all([
    getOffseason(ctx, league.id),
    listTeams(ctx, league.id),
    latestSeason(ctx, league.id),
  ]);

  if (report.stage === null && report.year === null) {
    return (
      <EmptyState
        icon="trophy"
        title="No offseason yet"
        description="The offseason begins when you start it after the playoffs: players age and change, some retire, then come the draft, free agency, training camp and the preseason."
      />
    );
  }

  const inOffseason = report.stage !== null && season !== null;
  const [staff, camp] = inOffseason
    ? await Promise.all([getStaff(ctx, league.id), getCamp(ctx, league.id)])
    : [null, null];

  return (
    <div className="flex flex-col gap-8">
      {inOffseason && report.stage && season ? (
        <OffseasonControls
          leagueId={league.id}
          year={season.year}
          stages={report.stages}
          action={STAGE_ACTIONS[report.stage]}
        />
      ) : null}
      {staff && staff.teamId ? (
        <StaffPanel leagueId={league.id} staff={staff} />
      ) : null}
      {camp && camp.teamId && report.stage === "training-camp" ? (
        <CampPanel
          key={camp.roster.map((r) => r.program ?? "-").join()}
          leagueId={league.id}
          camp={camp}
        />
      ) : null}
      {report.year !== null ? (
        <OffseasonReport leagueId={league.id} report={report} teams={teams} />
      ) : null}
    </div>
  );
}
