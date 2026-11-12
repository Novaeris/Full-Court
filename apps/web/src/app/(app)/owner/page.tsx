import type { Metadata } from "next";
import { Suspense } from "react";
import { LeagueGrid } from "@/components/leagues/league-card";
import { Page, Section } from "@/components/layout/primitives";
import { gameMode } from "@/components/modes/mode-config";
import { ModeHero, ModeSkeleton } from "@/components/modes/mode-hero";
import { Button, ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUserContext } from "@/server/auth/session";
import { listLeagues } from "@/server/services/leagues";

export const metadata: Metadata = { title: "Owner Mode" };

const mode = gameMode("owner");

/** Systems on Owner Mode's roadmap (docs/DESIGN.md). None are built yet. */
const COMING = [
  "Season simulation, schedules and standings",
  "Draft, free agency, contracts and trades",
  "Franchise finances, revenue and expenses",
  "Stadiums, facilities and relocation",
] as const;

/**
 * Owner Mode's landing page. Its saves are leagues: each league is a world
 * with its own generated teams and players, and the franchise you own in it.
 */
export default function OwnerModePage() {
  return (
    <Page>
      <Suspense fallback={<ModeSkeleton />}>
        <OwnerMode />
      </Suspense>
    </Page>
  );
}

async function OwnerMode() {
  const ctx = await requireUserContext("/owner");
  const { leagues, limit } = await listLeagues(ctx);
  const atLimit = leagues.length >= limit;

  return (
    <>
      <ModeHero
        mode={mode}
        actions={
          <>
            {atLimit ? (
              <Button disabled aria-describedby="save-limit">
                New World
              </Button>
            ) : (
              <ButtonLink href="/leagues/new">New World</ButtonLink>
            )}
            <ButtonLink href="#saves" variant="secondary">
              Existing Saves
            </ButtonLink>
          </>
        }
      />

      <div id="saves" className="mt-10 scroll-mt-6">
        <Section
          title="Your saves"
          description={
            leagues.length > 0
              ? `${leagues.length} of ${limit} save slots used. Each save is a league with its own world.`
              : undefined
          }
        >
          {leagues.length === 0 ? (
            <EmptyState
              icon="trophy"
              headingLevel={3}
              title="No saves yet"
              description="Create a world to start. Full Court generates fictional teams and players, then you choose the franchise you'll own."
              action={
                <ButtonLink href="/leagues/new">
                  Create your first world
                </ButtonLink>
              }
            />
          ) : (
            <LeagueGrid leagues={leagues} />
          )}
          {atLimit ? (
            <p id="save-limit" className="mt-6 text-text-muted">
              You&apos;ve used all {limit} save slots. Delete a league in its
              settings to make room for a new world.
            </p>
          ) : null}
        </Section>
      </div>

      <Section
        title="Coming to Owner Mode"
        description="In development. These aren't playable yet."
      >
        <ul className="grid gap-3 tablet:grid-cols-2">
          {COMING.map((item) => (
            <li
              key={item}
              className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-surface px-4 py-3 text-text-muted"
            >
              <span
                aria-hidden="true"
                className="size-2 shrink-0 rounded-full bg-text-muted"
              />
              {item}
            </li>
          ))}
        </ul>
      </Section>
    </>
  );
}
