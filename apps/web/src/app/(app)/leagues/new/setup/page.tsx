import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/forms/form-skeleton";
import { Page, PageHeader } from "@/components/layout/primitives";
import { LeagueSetupForm } from "@/components/leagues/setup/league-setup-form";
import { Icon } from "@/components/ui/icon";
import { requireUserContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "League setup" };

export default function LeagueSetupPage() {
  return (
    <Page width="prose">
      <Link
        href="/leagues/new"
        className="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-md px-2 font-semibold text-text-muted hover:text-text"
      >
        <Icon name="arrowRight" className="size-4 rotate-180" />
        New league
      </Link>
      <PageHeader
        title="League setup"
        description="Choose the structure, region and playoff rules for your league."
      />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <Setup />
      </Suspense>
    </Page>
  );
}

async function Setup() {
  await requireUserContext("/leagues/new/setup");
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <LeagueSetupForm />
    </div>
  );
}
