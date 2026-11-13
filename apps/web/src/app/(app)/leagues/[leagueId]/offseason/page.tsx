import type { Metadata } from "next";
import { Suspense } from "react";
import { AiAssistPanel } from "@/components/season/ai-assist-panel";
import { CampPanel } from "@/components/season/camp-panel";
import { DraftPanel } from "@/components/season/draft-panel";
import { OffseasonControls } from "@/components/season/offseason-controls";
import { OffseasonReport } from "@/components/season/offseason-report";
import { RosterPanel } from "@/components/season/roster-panel";
import { StaffPanel } from "@/components/season/staff-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { loadLeague } from "@/server/leagues/load";
import { getCamp } from "@/server/services/camp";
import { getDraft } from "@/server/services/draft";
import { STAGE_ACTIONS, getOffseason } from "@/server/services/offseason";
import { getRoster } from "@/server/services/roster";
import { latestSeason } from "@/server/services/season-shared";
import { getStaff } from "@/server/services/staff";
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

  const stage = report.stage;
  const inOffseason = stage !== null && season !== null;
  const mine = teams.find((t) => t.localPlayerSlot !== null);
  const [staff, camp, draft, roster] = inOffseason
    ? await Promise.all([
        getStaff(ctx, league.id),
        getCamp(ctx, league.id),
        stage === "draft" ? getDraft(ctx, league.id) : Promise.resolve(null),
        stage === "free-agency" ||
        stage === "training-camp" ||
        stage === "preseason"
          ? getRoster(ctx, league.id)
          : Promise.resolve(null),
      ])
    : [null, null, null, null];

  // The draft button depends on how far the draft has got.
  const status = report.draftStatus;
  const action =
    stage === "draft"
      ? !status?.lotteryHeld
        ? {
            button: "Hold the lottery",
            summary:
              "The lottery sets the order of the picks from how teams finished. Look over the prospects first, and hire a scout for a clearer board.",
          }
        : {
            button: "Sim the draft",
            summary:
              "The computer teams make their picks until one of yours is on the clock; then you choose, or AI Assist does it for you. When the last pick is made the offseason moves on.",
          }
      : stage
        ? STAGE_ACTIONS[stage]
        : null;

  return (
    <div className="flex flex-col gap-8">
      {inOffseason && stage && season && action ? (
        <OffseasonControls
          leagueId={league.id}
          year={season.year}
          stages={report.stages}
          action={action}
        />
      ) : null}
      {inOffseason && mine ? (
        <AiAssistPanel
          leagueId={league.id}
          teamId={mine.id}
          flags={mine.aiAssist}
        />
      ) : null}
      {draft && draft.teamId ? (
        <DraftPanel
          leagueId={league.id}
          draft={draft}
          teams={teams}
          scoutingAssist={mine?.aiAssist.scouting ?? false}
        />
      ) : null}
      {roster && roster.teamId ? (
        <RosterPanel leagueId={league.id} roster={roster} />
      ) : null}
      {staff && staff.teamId ? (
        <StaffPanel leagueId={league.id} staff={staff} />
      ) : null}
      {camp && camp.teamId && stage === "training-camp" ? (
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
