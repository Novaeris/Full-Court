import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout/primitives";
import { formatDate, TextLink } from "@/components/legal/legal-page";
import { CHANGELOG, type ChangelogEntry } from "@/content/changelog";

export const metadata: Metadata = {
  title: "Changelog",
  description:
    "Every Full Court release: version, date, new features, improvements and bug fixes.",
};

const GROUPS = [
  { key: "added", title: "New" },
  { key: "improved", title: "Improved" },
  { key: "fixed", title: "Fixed" },
] as const satisfies readonly { key: keyof ChangelogEntry; title: string }[];

export default function ChangelogPage() {
  return (
    <Page width="prose">
      <PageHeader
        title="Changelog"
        description="What changed in each version of Full Court."
      />
      <p className="text-lg leading-relaxed">
        Full Court is in open alpha, so things change quickly and saves may be
        reset. See the <TextLink href="/alpha">Alpha Disclaimer</TextLink>, and
        report problems through{" "}
        <TextLink href="/support">Contact &amp; Support</TextLink>.
      </p>
      <ol className="mt-8 flex flex-col">
        {CHANGELOG.map((entry) => (
          <li key={entry.version}>
            <article
              aria-labelledby={`v-${entry.version}`}
              className="border-t border-border py-6"
            >
              <h2
                id={`v-${entry.version}`}
                className="text-2xl font-bold tracking-tight"
              >
                {entry.title}
              </h2>
              <p className="mt-1 text-text-muted">
                <span className="font-mono font-semibold text-text">
                  {entry.version}
                </span>
                {" · "}
                <time dateTime={entry.date}>{formatDate(entry.date)}</time>
              </p>
              {GROUPS.map(({ key, title }) => {
                const items = entry[key];
                if (!items?.length) return null;
                return (
                  <div key={key} className="mt-4">
                    <h3 className="font-semibold">{title}</h3>
                    <ul className="mt-2 ml-6 flex list-disc flex-col gap-1.5 leading-relaxed">
                      {items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </article>
          </li>
        ))}
      </ol>
    </Page>
  );
}
