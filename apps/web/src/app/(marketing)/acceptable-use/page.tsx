import type { Metadata } from "next";
import {
  Bullets,
  LegalPage,
  TextLink,
  type LegalSection,
} from "@/components/legal/legal-page";
import { ACCEPTABLE_USE } from "@/content/policies";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Acceptable Use Policy",
  description:
    "What you may and may not do on Full Court, how to report security problems and what happens when the rules are broken.",
};

const SECTIONS: readonly LegalSection[] = [
  {
    id: "service",
    title: "Respect the service",
    body: (
      <>
        <p>Don&apos;t:</p>
        <Bullets>
          <li>
            Attack, overload or disrupt {SITE.name}, or try to make it slow or
            unavailable for others.
          </li>
          <li>
            Get around limits, such as the number of leagues per account or the
            limits on support requests.
          </li>
          <li>
            Use bots, scripts or scrapers to make large numbers of requests or
            to create accounts in bulk.
          </li>
          <li>
            Reverse-engineer, copy or resell the game, except where the law
            allows it.
          </li>
        </Bullets>
      </>
    ),
  },
  {
    id: "players",
    title: "Respect other players",
    body: (
      <>
        <p>Don&apos;t:</p>
        <Bullets>
          <li>
            Access, or try to access, another player&apos;s account or data.
          </li>
          <li>Use someone else&apos;s account, or share yours.</li>
          <li>
            Choose display names or league names that are hateful, harassing,
            sexually explicit, threatening or that impersonate someone.
          </li>
          <li>Post other people&apos;s personal information.</li>
        </Bullets>
      </>
    ),
  },
  {
    id: "support",
    title: "Use support for support",
    body: (
      <Bullets>
        <li>
          Don&apos;t send spam, advertising or abuse through the support form.
        </li>
        <li>
          Never send a password, access token or payment details. We will never
          ask for them.
        </li>
      </Bullets>
    ),
  },
  {
    id: "bugs",
    title: "Bugs and security problems",
    body: (
      <>
        <p>
          Bugs are expected during the alpha. If you find one, please report it
          with the <TextLink href="/support">support form</TextLink>. Using a
          gameplay bug in your own league affects only you, but please still
          tell us about it.
        </p>
        <p>
          If you find a security problem, report it with the category
          &quot;Security concern&quot;. While investigating, don&apos;t access
          or change other players&apos; data, don&apos;t disrupt the service,
          and give us reasonable time to fix the problem before telling anyone
          else.
        </p>
      </>
    ),
  },
  {
    id: "law",
    title: "Follow the law",
    body: <p>Don&apos;t use {SITE.name} for anything illegal.</p>,
  },
  {
    id: "enforcement",
    title: "What happens if the rules are broken",
    body: (
      <p>
        Depending on how serious it is, we may rename or remove content, limit
        features, or suspend or close the account. If you think we got it wrong,
        tell us through the <TextLink href="/support">support form</TextLink>.
      </p>
    ),
  },
];

export default function AcceptableUsePage() {
  return (
    <LegalPage
      title="Acceptable Use Policy"
      updated={ACCEPTABLE_USE.updated}
      version={ACCEPTABLE_USE.version}
      summary={
        <p>
          In short: play fair, keep names respectful, don&apos;t attack the
          service or other players&apos; accounts, and report bugs and security
          problems instead of abusing them. This policy is part of the{" "}
          <TextLink href="/terms">Terms of Service</TextLink>.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
