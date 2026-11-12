import type { Metadata } from "next";
import {
  Bullets,
  LegalPage,
  TextLink,
  type LegalSection,
} from "@/components/legal/legal-page";
import { ALPHA_DISCLAIMER, ALPHA_NOTICE } from "@/content/policies";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Alpha Disclaimer",
  description:
    "Full Court is in open alpha: unfinished, buggy and changing fast. Saves and leagues may be reset without notice.",
};

const SECTIONS: readonly LegalSection[] = [
  {
    id: "what-to-expect",
    title: "What to expect",
    body: (
      <Bullets>
        {ALPHA_NOTICE.points.map((point) => (
          <li key={point}>{point}</li>
        ))}
      </Bullets>
    ),
  },
  {
    id: "resets",
    title: "Resets",
    body: (
      <>
        <p>
          While {SITE.name} is in alpha, we may reset or delete leagues and
          saves, for one player or for everyone, whenever the game needs it. We
          won&apos;t always give notice, and lost progress can&apos;t be
          restored.
        </p>
        <p>
          Your account itself is kept unless you delete it or it breaks the{" "}
          <TextLink href="/terms">Terms of Service</TextLink>.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to the game",
    body: (
      <p>
        Ratings, rules, balance, screens and whole features can change between
        updates, sometimes drastically. The{" "}
        <TextLink href="/changelog">changelog</TextLink> lists what changed in
        each version.
      </p>
    ),
  },
  {
    id: "help",
    title: "How you can help",
    body: (
      <p>
        Tell us what breaks, what&apos;s confusing and what you&apos;d like to
        see. Use the <TextLink href="/support">support form</TextLink> and pick
        a category: bug report, gameplay feedback or feature suggestion. Every
        report is read.
      </p>
    ),
  },
];

export default function AlphaPage() {
  return (
    <LegalPage
      title="Alpha Disclaimer"
      updated={ALPHA_DISCLAIMER.updated}
      version={ALPHA_NOTICE.version}
      summary={
        <>
          <p className="font-semibold">{ALPHA_NOTICE.title}.</p>
          <p className="mt-2">{ALPHA_NOTICE.summary}</p>
        </>
      }
      sections={SECTIONS}
    />
  );
}
