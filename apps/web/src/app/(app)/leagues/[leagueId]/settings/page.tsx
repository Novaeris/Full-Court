import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { FormSkeleton } from "@/components/forms/form-skeleton";
import {
  DeleteLeagueForm,
  RenameLeagueForm,
} from "@/components/leagues/league-forms";
import { loadLeague } from "@/server/leagues/load";

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
  const { league } = await loadLeague(leagueId);
  return (
    <div className="flex max-w-prose flex-col gap-6">
      <SettingsCard title="Name">
        <RenameLeagueForm leagueId={league.id} current={league.name} />
      </SettingsCard>
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
