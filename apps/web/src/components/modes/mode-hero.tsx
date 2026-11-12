import Link from "next/link";
import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { ART_BACKGROUND, ModeArt } from "./mode-art";
import { STATUS_LABEL, type GameMode } from "./mode-config";

/** "All game modes" back link: every mode page leads back to the gateway. */
export function BackToModes() {
  return (
    <Link
      href="/modes"
      className="-ml-2 inline-flex min-h-touch items-center gap-1 rounded-md px-2 font-semibold text-text-muted hover:text-text"
    >
      <Icon name="arrowRight" className="size-4 rotate-180" />
      All game modes
    </Link>
  );
}

/** Title band at the top of a mode's landing page. */
export function ModeHero({
  mode,
  actions,
}: {
  mode: GameMode;
  actions?: ReactNode;
}) {
  return (
    <>
      <BackToModes />
      <header
        className={`@container mt-2 mb-8 overflow-hidden rounded-lg border border-border ${ART_BACKGROUND[mode.id]}`}
      >
        <div className="flex flex-col @2xl:flex-row @2xl:items-stretch">
          <div className="flex flex-1 flex-col gap-4 p-5 tablet:p-8">
            <span className="self-start rounded-full border border-border bg-surface px-2.5 py-0.5 text-xs font-semibold text-text">
              {STATUS_LABEL[mode.status]}
            </span>
            <div>
              <p className="text-sm font-semibold tracking-wide text-text-muted uppercase">
                {mode.tagline}
              </p>
              <h1 className="mt-1 text-3xl font-black tracking-tight desktop:text-4xl">
                {mode.title}
              </h1>
            </div>
            <p className="max-w-prose text-lg text-text">{mode.description}</p>
            {actions ? (
              <div className="flex flex-wrap items-center gap-2">{actions}</div>
            ) : null}
          </div>
          <ModeArt
            mode={mode.id}
            className="h-36 w-full shrink-0 self-end @2xl:h-auto @2xl:w-2/5"
          />
        </div>
      </header>
    </>
  );
}

/** Loading state for a mode page: the hero band and one section. */
export function ModeSkeleton() {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-6">
      <div className="h-72 rounded-lg bg-surface-muted" />
      <div className="h-8 w-40 rounded-md bg-surface-muted" />
      <div className="h-48 rounded-lg bg-surface-muted" />
    </div>
  );
}
