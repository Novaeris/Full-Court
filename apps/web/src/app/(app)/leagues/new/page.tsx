import { randomUUID } from "node:crypto";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/forms/form-skeleton";
import { Page, PageHeader } from "@/components/layout/primitives";
import { LeagueSetupForm } from "@/components/leagues/setup/league-setup-form";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { requireUserContext } from "@/server/auth/session";
import { listLeagues } from "@/server/services/leagues";

export const metadata: Metadata = { title: "New league" };

export default function NewLeaguePage() {
  return (
    <Page width="prose">
      <Link
        href="/leagues"
        className="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-md px-2 font-semibold text-text-muted hover:text-text"
      >
        <Icon name="arrowRight" className="size-4 rotate-180" />
        All leagues
      </Link>
      <PageHeader
        title="New league"
        description="Choose the structure, region and playoff rules, then pick your franchise. Everything else is generated."
      />
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <NewLeague />
      </Suspense>
    </Page>
  );
}

async function NewLeague() {
  const ctx = await requireUserContext("/leagues/new");
  const { leagues, limit } = await listLeagues(ctx);
  if (leagues.length >= limit) {
    return (
      <div className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-6">
        <p>
          You already have {limit} leagues, the most an account can keep. Delete
          one to make room for a new league.
        </p>
        <ButtonLink href="/leagues" variant="secondary">
          Back to your leagues
        </ButtonLink>
      </div>
    );
  }
  // Seeds the generated franchises: the same value gives the same league.
  const identitySeed = randomUUID().replaceAll("-", "").slice(0, 16);
  return (
    <div className="rounded-lg border border-border bg-surface p-6">
      <LeagueSetupForm identitySeed={identitySeed} />
    </div>
  );
}
