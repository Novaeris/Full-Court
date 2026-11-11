import type { ReactNode } from "react";

/** Centered card used by the sign-in, sign-up and password pages. */
export function AuthCard({
  title,
  description,
  children,
  footer,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <div className="mx-auto w-full max-w-md px-4 py-10 tablet:py-16">
      <div className="rounded-lg border border-border bg-surface p-6 shadow-sm tablet:p-8">
        <h1 className="text-3xl font-black tracking-tight">{title}</h1>
        {description ? (
          <div className="mt-2 text-text-muted">{description}</div>
        ) : null}
        <div className="mt-6">{children}</div>
      </div>
      {footer ? (
        <div className="mt-6 text-center text-text-muted">{footer}</div>
      ) : null}
    </div>
  );
}

/** Text link styled for use inside auth copy, with a 44px tap target. */
export const inlineLinkClass =
  "inline-flex min-h-touch items-center font-semibold text-accent underline underline-offset-4";
