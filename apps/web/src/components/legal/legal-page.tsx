import Link from "next/link";
import type { ReactNode } from "react";
import { Page, PageHeader } from "@/components/layout/primitives";

export type LegalSection = {
  /** Anchor for the table of contents. */
  id: string;
  title: string;
  body: ReactNode;
};

const DATE = new Intl.DateTimeFormat("en-CA", {
  dateStyle: "long",
  timeZone: "UTC",
});

/** "2026-11-11" → "November 11, 2026" (fixed, not the visitor's clock). */
export function formatDate(isoDate: string): string {
  return DATE.format(new Date(`${isoDate}T00:00:00Z`));
}

/**
 * Shared frame for the policy pages: title, version and date, a short
 * plain-language summary, a table of contents and numbered sections.
 */
export function LegalPage({
  title,
  updated,
  version,
  summary,
  sections,
}: {
  title: string;
  updated: string;
  version?: number;
  summary: ReactNode;
  sections: readonly LegalSection[];
}) {
  return (
    <Page width="prose">
      <PageHeader
        title={title}
        description={
          <>
            Last updated {formatDate(updated)}
            {version ? ` · Version ${version}` : null}
          </>
        }
      />
      <div className="rounded-md border border-border bg-surface px-4 py-3 text-lg leading-relaxed">
        {summary}
      </div>

      <nav aria-label="On this page" className="mt-8">
        <h2 className="text-sm font-semibold tracking-wide text-text-muted uppercase">
          On this page
        </h2>
        <ol className="mt-2 flex flex-col">
          {sections.map((section, index) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="inline-flex min-h-touch items-center gap-2 rounded-md text-accent underline-offset-4 hover:underline"
              >
                <span className="w-6 text-text-muted tabular-nums">
                  {index + 1}.
                </span>
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-6 flex flex-col">
        {sections.map((section, index) => (
          <section
            key={section.id}
            id={section.id}
            aria-labelledby={`${section.id}-title`}
            className="scroll-mt-20 border-t border-border py-6"
          >
            <h2
              id={`${section.id}-title`}
              className="text-2xl font-bold tracking-tight"
            >
              {index + 1}. {section.title}
            </h2>
            <div className="mt-3 flex flex-col gap-3 text-lg leading-relaxed">
              {section.body}
            </div>
          </section>
        ))}
      </div>
    </Page>
  );
}

/** Inline link styled for running text (underlined, so it isn't color-only). */
export function TextLink({
  href,
  children,
}: {
  href: string;
  children: ReactNode;
}) {
  const className = "font-semibold text-accent underline underline-offset-4";
  return href.startsWith("/") ? (
    <Link href={href} className={className}>
      {children}
    </Link>
  ) : (
    <a href={href} className={className}>
      {children}
    </a>
  );
}

/** Bulleted list for policy text. */
export function Bullets({ children }: { children: ReactNode }) {
  return <ul className="ml-6 flex list-disc flex-col gap-2">{children}</ul>;
}
