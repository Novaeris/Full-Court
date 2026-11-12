import { AI_ASSIST_KEYS, AI_ASSIST_LABELS } from "@fullcourt/game-types";
import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { FormSkeleton } from "@/components/forms/form-skeleton";
import {
  DeleteLeagueForm,
  RenameLeagueForm,
} from "@/components/leagues/league-forms";
import { TeamBadge, teamName } from "@/components/leagues/team-badge";
import { loadLeague } from "@/server/leagues/load";
import { listTeams } from "@/server/services/world";

export const metadata: Metadata = { title: "League settings" };

export default function LeagueSettingsPage({
  params,
}: PageProps<"/leagues/[leagueId]/settings">) {
  return (
    <Suspense fallback={<FormSkeleton fields={2} />}>
      <Settings params={params} />
    </Suspense>
  );
}

async function Settings({
  params,
}: {
  params: PageProps<"/leagues/[leagueId]/settings">["params"];
}) {
  const { leagueId } = await params;
  const { ctx, league } = await loadLeague(leagueId);
  const franchises = (await listTeams(ctx, league.id)).filter(
    (team) => team.localPlayerSlot !== null,
  );
  return (
    <div className="flex max-w-prose flex-col gap-6">
      <SettingsCard title="Name">
        <RenameLeagueForm leagueId={league.id} current={league.name} />
      </SettingsCard>
      {franchises.length > 0 ? (
        <SettingsCard
          title="Franchises and AI Assist"
          description="The franchises run by people, and the AI Assist permissions saved with each. The AI that uses them isn't in the game yet, and they can't be changed after the league is created."
        >
          <ul className="flex flex-col gap-3">
            {franchises.map((team) => {
              const allowed = AI_ASSIST_KEYS.filter(
                (key) => team.aiAssist[key],
              );
              return (
                <li
                  key={team.id}
                  className="flex flex-col gap-2 rounded-md border border-border p-3"
                >
                  <div className="flex items-center gap-3">
                    <TeamBadge team={team} />
                    <div className="min-w-0">
                      <p className="font-semibold break-words">
                        {teamName(team)}
                      </p>
                      <p className="text-sm text-text-muted">
                        Player {team.localPlayerSlot}
                      </p>
                    </div>
                  </div>
                  <p className="text-sm">
                    <span className="font-semibold">AI Assist: </span>
                    {allowed.length === 0
                      ? "all off"
                      : allowed
                          .map((key) => AI_ASSIST_LABELS[key].name)
                          .join(", ")}
                  </p>
                </li>
              );
            })}
          </ul>
        </SettingsCard>
      ) : null}
      <SettingsCard
        title="Delete league"
        description="Permanently deletes this league and everything in it. This can't be undone."
        danger
      >
        <DeleteLeagueForm leagueId={league.id} name={league.name} />
      </SettingsCard>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  danger = false,
  children,
}: {
  title: string;
  description?: string;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`rounded-lg border bg-surface p-5 tablet:p-6 ${danger ? "border-danger" : "border-border"}`}
    >
      <h2 className="text-xl font-bold">{title}</h2>
      {description ? (
        <p className="mt-1 text-text-muted">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
