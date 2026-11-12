import type { Metadata } from "next";
import { Suspense } from "react";
import { Page, Section } from "@/components/layout/primitives";
import { gameMode } from "@/components/modes/mode-config";
import { ModeHero, ModeSkeleton } from "@/components/modes/mode-hero";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { requireUserContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Career Mode" };

const mode = gameMode("career");

/**
 * Career Mode's landing page. Nothing is playable or stored yet: careers will
 * get their own tables, separate from Owner Mode's leagues.
 */
export default function CareerModePage() {
  return (
    <Page>
      <Suspense fallback={<ModeSkeleton />}>
        <CareerMode />
      </Suspense>
    </Page>
  );
}

async function CareerMode() {
  await requireUserContext("/career");
  return (
    <>
      <ModeHero
        mode={mode}
        actions={
          <>
            <Button disabled aria-describedby="create-player-note">
              Create Player
            </Button>
            <span
              id="create-player-note"
              className="text-sm font-semibold text-text-muted"
            >
              In development
            </span>
          </>
        }
      />
      <Section title="Your careers">
        <EmptyState
          icon="star"
          headingLevel={3}
          title="No careers yet"
          description="When Career Mode opens, the players you create will appear here. Each career is its own save, separate from your Owner Mode leagues."
        />
      </Section>
    </>
  );
}
