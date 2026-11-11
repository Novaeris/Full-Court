import { useId, type ReactNode } from "react";

/**
 * Layout primitives. Pages compose these instead of inventing their own
 * spacing and breakpoints (docs/ARCHITECTURE.md, "Responsive design").
 */

const GAP = {
  none: "gap-0",
  xs: "gap-1",
  sm: "gap-2",
  md: "gap-4",
  lg: "gap-6",
  xl: "gap-10",
} as const;
type Gap = keyof typeof GAP;

/** Centered content column with responsive gutters. */
export function Page({
  children,
  width = "content",
}: {
  children: ReactNode;
  width?: "content" | "prose";
}) {
  return (
    <div
      className={[
        "mx-auto w-full px-4 py-6 tablet:px-6 tablet:py-8 desktop:px-8 desktop:py-10",
        width === "prose" ? "max-w-prose" : "max-w-content",
      ].join(" ")}
    >
      {children}
    </div>
  );
}

/** Page title, optional description and actions. Actions stack under the title on phones. */
export function PageHeader({
  title,
  description,
  actions,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-6 flex flex-col gap-4 tablet:mb-8 tablet:flex-row tablet:items-end tablet:justify-between">
      <div className="min-w-0">
        <h1 className="text-3xl font-black tracking-tight desktop:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 max-w-prose text-lg text-text-muted">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <Cluster>{actions}</Cluster> : null}
    </header>
  );
}

/** A titled region of a page. */
export function Section({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="mt-10 first:mt-0">
      <h2 id={id} className="text-2xl font-bold tracking-tight">
        {title}
      </h2>
      {description ? (
        <p className="mt-1 text-text-muted">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Vertical stack. */
export function Stack({
  gap = "md",
  children,
}: {
  gap?: Gap;
  children: ReactNode;
}) {
  return <div className={`flex flex-col ${GAP[gap]}`}>{children}</div>;
}

/** Horizontal group that wraps onto new lines. */
export function Cluster({
  gap = "sm",
  children,
}: {
  gap?: Gap;
  children: ReactNode;
}) {
  return (
    <div className={`flex flex-wrap items-center ${GAP[gap]}`}>{children}</div>
  );
}

/**
 * Responsive grid: as many columns as fit, each at least `min` wide.
 * One column on phones without any breakpoint logic; columns that would
 * stay empty collapse, so a short list spreads across the row.
 */
export function Grid({
  min = "sm",
  gap = "md",
  children,
}: {
  min?: "sm" | "md" | "lg";
  gap?: Gap;
  children: ReactNode;
}) {
  const minClass = {
    sm: "grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]",
    md: "grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))]",
    lg: "grid-cols-[repeat(auto-fit,minmax(min(100%,24rem),1fr))]",
  }[min];
  return <div className={`grid ${minClass} ${GAP[gap]}`}>{children}</div>;
}

/** Bordered surface for grouped content. */
export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface p-5 ${className}`}
    >
      {children}
    </div>
  );
}
