import { useId } from "react";
import { ButtonLink } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { ART_BACKGROUND, ModeArt } from "./mode-art";
import { STATUS_LABEL, type GameMode } from "./mode-config";

/**
 * One game mode on the selection screen. The card responds to its own width
 * (container query), not the viewport: art above the text when narrow, beside
 * it when there's room. Its only control is the "Enter" button, so keyboard
 * users meet one tab stop per mode.
 */
export function ModeCard({ mode }: { mode: GameMode }) {
  const titleId = useId();
  return (
    <article
      aria-labelledby={titleId}
      data-mode={mode.id}
      className="@container h-full rounded-lg border border-border bg-surface transition-[translate,border-color,box-shadow] duration-(--fc-duration-base) focus-within:border-accent hover:-translate-y-1 hover:border-accent hover:shadow-lg"
    >
      <div className="flex h-full flex-col @xl:flex-row">
        <div
          className={`flex h-40 shrink-0 items-end overflow-hidden rounded-t-lg @xl:h-auto @xl:w-2/5 @xl:items-center @xl:rounded-t-none @xl:rounded-l-lg @xl:px-4 ${ART_BACKGROUND[mode.id]}`}
        >
          <ModeArt mode={mode.id} className="h-full w-full @xl:h-auto" />
        </div>

        <div className="flex flex-1 flex-col gap-4 p-5 desktop:p-6">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold tracking-wide text-text-muted uppercase">
                {mode.tagline}
              </p>
              <span className="rounded-full border border-border bg-surface-muted px-2.5 py-0.5 text-xs font-semibold text-text">
                {STATUS_LABEL[mode.status]}
              </span>
            </div>
            <h2
              id={titleId}
              className="mt-1 flex items-center gap-2 text-2xl font-black tracking-tight"
            >
              <Icon name={mode.icon} className="size-6 shrink-0 text-accent" />
              {mode.title}
            </h2>
          </div>
          <p className="text-text-muted">{mode.description}</p>
          <ul
            aria-label={`${mode.title} features`}
            className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm font-medium"
          >
            {mode.features.map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-2 shrink-0 rounded-full bg-accent"
                />
                {feature}
              </li>
            ))}
          </ul>
          <ButtonLink href={mode.href} className="mt-auto w-full">
            {mode.cta}
            <Icon name="arrowRight" className="size-5" />
          </ButtonLink>
        </div>
      </div>
    </article>
  );
}
