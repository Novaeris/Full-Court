import type { Metadata } from "next";
import {
  Bullets,
  LegalPage,
  TextLink,
  type LegalSection,
} from "@/components/legal/legal-page";
import { TERMS } from "@/content/policies";
import { SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The rules for using Full Court during the open alpha: accounts, resets, acceptable use and our responsibilities.",
};

const SECTIONS: readonly LegalSection[] = [
  {
    id: "about",
    title: "About these terms",
    body: (
      <>
        <p>
          These terms are an agreement between you and {SITE.operator}, the
          individual developer in {SITE.jurisdiction} who operates {SITE.name}.
          &quot;We&quot; and &quot;us&quot; mean {SITE.operator}.
        </p>
        <p>
          By creating an account or using {SITE.name}, you agree to these terms,
          the <TextLink href="/alpha">Alpha Disclaimer</TextLink> and the{" "}
          <TextLink href="/acceptable-use">Acceptable Use Policy</TextLink>. Our{" "}
          <TextLink href="/privacy">Privacy Policy</TextLink> explains how we
          handle your personal information. If you don&apos;t agree, please
          don&apos;t use {SITE.name}.
        </p>
      </>
    ),
  },
  {
    id: "alpha",
    title: "An unfinished game",
    body: (
      <p>
        {SITE.name} is in open alpha. It is incomplete, it has bugs, and it
        changes often, sometimes drastically. Leagues and saves may be reset or
        deleted at any time without notice, and the service may be unavailable.
        The <TextLink href="/alpha">Alpha Disclaimer</TextLink> explains what to
        expect. Please don&apos;t rely on {SITE.name} to keep anything you
        can&apos;t afford to lose.
      </p>
    ),
  },
  {
    id: "eligibility",
    title: "Who can use Full Court",
    body: (
      <p>
        You must be at least {SITE.minimumAge} years old to create an account.
        If you are under the age of majority where you live, you need a parent
        or guardian&apos;s permission, and they agree to these terms for you.
      </p>
    ),
  },
  {
    id: "account",
    title: "Your account",
    body: (
      <Bullets>
        <li>Give a real email address that you control.</li>
        <li>
          Keep your password to yourself. You are responsible for what happens
          under your account.
        </li>
        <li>
          One account is for one person. Don&apos;t share or sell accounts.
        </li>
        <li>
          Tell us through the <TextLink href="/support">support form</TextLink>{" "}
          if you think someone else has used your account.
        </li>
        <li>You can delete your account at any time from your account page.</li>
      </Bullets>
    ),
  },
  {
    id: "price",
    title: "Price",
    body: (
      <p>
        {SITE.name} is free during the open alpha. We may offer paid features in
        the future. If we do, we will tell you the price and the terms before
        you buy, and you will never be charged without agreeing to it first.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <p>
        Follow the{" "}
        <TextLink href="/acceptable-use">Acceptable Use Policy</TextLink>. In
        short: don&apos;t attack or overload the service, don&apos;t access
        other players&apos; data, and keep names and messages respectful.
      </p>
    ),
  },
  {
    id: "your-content",
    title: "Your content and feedback",
    body: (
      <>
        <p>
          You keep ownership of what you write, such as your display name,
          league names and support messages. You give us permission to store,
          copy and display it as needed to run {SITE.name}.
        </p>
        <p>
          If you send us ideas or feedback, we may use them to improve{" "}
          {SITE.name} without owing you anything. Thank you; it helps.
        </p>
      </>
    ),
  },
  {
    id: "our-content",
    title: "Our content",
    body: (
      <>
        <p>
          {SITE.name}, including its software, design, text and the leagues,
          teams and players it generates, belongs to {SITE.operator}. We give
          you a personal, non-commercial, revocable permission to play the game
          while you follow these terms.
        </p>
        <p>
          The league, teams and players in {SITE.name} are fictional. Any
          resemblance to real teams or people is coincidental.
        </p>
      </>
    ),
  },
  {
    id: "changes-and-availability",
    title: "Changes, resets and availability",
    body: (
      <p>
        We may change, add or remove features, change game rules and balance,
        reset or delete leagues and saves, and suspend or stop the service, at
        any time and without notice. We are not responsible for progress lost
        through a reset, a bug or an outage.
      </p>
    ),
  },
  {
    id: "termination",
    title: "Suspending or closing accounts",
    body: (
      <p>
        We may limit, suspend or close an account that breaks these terms or the
        Acceptable Use Policy, or when needed to protect other players or the
        service. If you think we made a mistake, tell us through the{" "}
        <TextLink href="/support">support form</TextLink> and we will look at it
        again.
      </p>
    ),
  },
  {
    id: "disclaimer",
    title: "No guarantees",
    body: (
      <p>
        {SITE.name} is provided &quot;as is&quot; and &quot;as available&quot;,
        without guarantees of any kind, to the extent the law allows. We
        don&apos;t promise that it will be accurate, error-free, secure or
        always available.
      </p>
    ),
  },
  {
    id: "liability",
    title: "Limits on our responsibility",
    body: (
      <>
        <p>
          To the extent the law allows, we are not responsible for indirect or
          consequential losses, or for lost game progress or data. Our total
          responsibility for any claim about {SITE.name} is limited to the
          amount you paid us for it in the 12 months before the claim. During
          the free alpha, that amount is zero.
        </p>
        <p>
          Nothing in these terms takes away rights you have under consumer
          protection law that can&apos;t be waived or limited by agreement.
        </p>
      </>
    ),
  },
  {
    id: "law",
    title: "Governing law",
    body: (
      <p>
        These terms are governed by the laws of the Province of Ontario and the
        federal laws of Canada that apply there. Disputes go to the courts of
        Ontario, unless the consumer law where you live gives you the right to
        bring them where you live.
      </p>
    ),
  },
  {
    id: "changes",
    title: "Changes to these terms",
    body: (
      <p>
        We may update these terms. We will change the date and version at the
        top of this page, and if a change is material we will ask you to accept
        the new terms when you next sign in. If you don&apos;t agree, stop using{" "}
        {SITE.name} and delete your account.
      </p>
    ),
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <p>
        Questions about these terms? Use the{" "}
        <TextLink href="/support">support form</TextLink> or email{" "}
        <TextLink href={`mailto:${SITE.contactEmail}`}>
          {SITE.contactEmail}
        </TextLink>
        .
      </p>
    ),
  },
];

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated={TERMS.updated}
      version={TERMS.version}
      summary={
        <p>
          In short: {SITE.name} is a free, unfinished game. You must be{" "}
          {SITE.minimumAge} or older. Play fair, keep your password safe and
          expect bugs, changes and resets without notice. We provide the game as
          is and can&apos;t promise it will always work or keep your saves.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
