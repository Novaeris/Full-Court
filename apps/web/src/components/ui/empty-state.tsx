import type { ReactNode } from "react";
import { Icon, type IconName } from "./icon";

/** Placeholder for a view with nothing in it yet. */
export function EmptyState({
  icon,
  title,
  description,
  action,
  headingLevel = 2,
}: {
  icon: IconName;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  /** 3 when the empty state sits inside a titled Section. */
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 3 ? "h3" : "h2";
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-border bg-surface px-6 py-12 text-center">
      <span className="flex size-14 items-center justify-center rounded-full bg-accent-soft text-on-accent-soft">
        <Icon name={icon} className="size-7" />
      </span>
      <Heading className="mt-4 text-xl font-bold">{title}</Heading>
      <div className="mt-2 max-w-prose text-text-muted">{description}</div>
      {action ? <div className="mt-6">{action}</div> : null}
    </div>
  );
}
