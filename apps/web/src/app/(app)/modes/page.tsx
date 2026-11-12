import type { Metadata } from "next";
import { Suspense } from "react";
import { Page, PageHeader } from "@/components/layout/primitives";
import { ModeCard } from "@/components/modes/mode-card";
import { GAME_MODES } from "@/components/modes/mode-config";
import { requireUserContext } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose your game mode" };

/**
 * Game Mode Selection: where people land after signing in, and the way into
 * Owner, Career and Dynasty Mode (docs/DESIGN.md, "Game modes").
 */
export default function ModesPage() {
  return (
    <Page>
      <PageHeader
        title="Choose Your Game Mode"
        description="Three ways to play Full Court, one account. Each mode keeps its own saves, so you can jump between them any time."
      />
      <Suspense fallback={<ModesSkeleton />}>
        <Modes />
      </Suspense>
    </Page>
  );
}

async function Modes() {
  await requireUserContext("/modes");
  return (
    <div className="@container">
      <ul className="grid gap-6 @4xl:grid-cols-3">
        {GAME_MODES.map((mode) => (
          <li key={mode.id}>
            <ModeCard mode={mode} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function ModesSkeleton() {
  return (
    <div aria-hidden="true" className="@container animate-pulse">
      <div className="grid gap-6 @4xl:grid-cols-3">
        {GAME_MODES.map((mode) => (
          <div key={mode.id} className="h-96 rounded-lg bg-surface-muted" />
        ))}
      </div>
    </div>
  );
}
