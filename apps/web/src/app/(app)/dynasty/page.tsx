import type { Metadata } from "next";
import { Suspense } from "react";
import { Page, Section } from "@/components/layout/primitives";
import { gameMode } from "@/components/modes/mode-config";
import { ModeHero, ModeSkeleton } from "@/components/modes/mode-hero";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUserContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Dynasty Mode" };

const mode = gameMode("dynasty");

/**
 * Dynasty Mode's landing page. Nothing is playable or stored yet: collections
 * and lineups will get their own tables. No packs, economy or matchmaking.
 */
export default function DynastyModePage() {
  return (
    <Page>
      <Suspense fallback={<ModeSkeleton />}>
        <DynastyMode />
      </Suspense>
    </Page>
  );
}

async function DynastyMode() {
  await requireUserContext("/dynasty");
  return (
    <>
      <ModeHero mode={mode} />
      <div className="mt-10 grid gap-x-6 gap-y-10 desktop:grid-cols-2">
        <div>
          <Section title="Collection" description="In development.">
            <EmptyState
              icon="cards"
              headingLevel={3}
              title="Your collection is empty"
              description="Player cards you collect, and how rare each one is, will show up here when Dynasty Mode opens."
            />
          </Section>
        </div>
        <div>
          <Section title="Lineups" description="In development.">
            <EmptyState
              icon="list"
              headingLevel={3}
              title="No lineups yet"
              description="You'll build lineups from your collection here, ready for head-to-head play later."
            />
          </Section>
        </div>
      </div>
    </>
  );
}
