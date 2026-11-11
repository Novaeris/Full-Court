import type { Metadata } from "next";
import {
  Bullets,
  LegalPage,
  TextLink,
  type LegalSection,
} from "@/components/legal/legal-page";
import { PRIVACY } from "@/content/policies";
import { SERVICE_PROVIDERS, SITE } from "@/content/site";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What personal information Full Court collects, why, where it is stored, how long it is kept and how to access or delete it.",
};

const mail = `mailto:${SITE.contactEmail}`;

const SECTIONS: readonly LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          {SITE.name} is a free online basketball management game operated by{" "}
          {SITE.operator}, an individual developer in {SITE.jurisdiction}.{" "}
          {SITE.name} is not run by a company. In this policy, &quot;we&quot;
          and &quot;us&quot; mean {SITE.operator}.
        </p>
        <p>
          {SITE.operator} is responsible for the personal information described
          here and answers privacy questions. Contact us through the{" "}
          <TextLink href="/support">support form</TextLink> or at{" "}
          <TextLink href={mail}>{SITE.contactEmail}</TextLink>.
        </p>
      </>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <p>
          <strong>Your account.</strong> Your email address, the display name
          you choose and your password. Your password is stored only as a
          one-way hash by our sign-in provider, so nobody can read it.
        </p>
        <p>
          <strong>Your agreements.</strong> Which version of the Terms of
          Service you accepted and which version of the open-alpha notice you
          acknowledged, with the time of each.
        </p>
        <p>
          <strong>Your game.</strong> Your leagues, the names you give them, the
          team you choose and the generated teams and players in them.
        </p>
        <p>
          <strong>Support requests.</strong> When you use the support form: your
          name, email address, the category, subject and message, and a link to
          your account if you were signed in. Please don&apos;t include
          passwords or other sensitive information. The form turns back messages
          that look like they contain a password or access token.
        </p>
        <p>
          <strong>Spam protection.</strong> When you send a support request, we
          keep a scrambled code made from your IP address (a keyed hash, not the
          address itself) for up to 24 hours, to limit how many requests one
          sender can make.
        </p>
        <p>
          <strong>Sign-in and server records.</strong> Our sign-in provider
          records sign-in activity, including IP addresses and browser details,
          to secure accounts. Our hosting providers may also record IP addresses
          and similar technical details in their logs.
        </p>
        <p>
          <strong>Usage totals.</strong> We count how often pages are viewed and
          how often a few things happen (an account is created, a league is
          created, a team is chosen, a simulation is started). We store only
          daily totals, such as &quot;the standings page was viewed 40 times
          today&quot;. The totals contain no user ID, IP address, cookie or
          device identifier, and they can&apos;t be traced back to you. See{" "}
          <TextLink href="#your-choices">your choices</TextLink> to opt out.
        </p>
        <p>
          <strong>Storage in your browser.</strong> Sign-in cookies keep you
          signed in; the site can&apos;t work without them. Your color theme
          choice is saved in your browser&apos;s local storage and never sent to
          us. We don&apos;t use advertising or tracking cookies.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use-it",
    title: "How we use it",
    body: (
      <>
        <Bullets>
          <li>To create your account, sign you in and save your leagues.</li>
          <li>
            To send account emails, such as email confirmation and password
            reset links.
          </li>
          <li>
            To answer your support requests and fix the problems you report.
          </li>
          <li>
            To protect the service and its players from abuse and attacks.
          </li>
          <li>To see, in aggregate, which parts of the game are used.</li>
          <li>To meet our legal obligations.</li>
        </Bullets>
        <p>
          We don&apos;t sell or rent personal information, we don&apos;t show
          ads, and we don&apos;t send marketing email.
        </p>
      </>
    ),
  },
  {
    id: "consent",
    title: "Consent",
    body: (
      <p>
        By creating an account or sending a support request, you consent to the
        uses described in this policy. You can withdraw your consent at any time
        by deleting your account (or asking us to delete a support request). We
        then stop using the information, except where the law requires us to
        keep it.
      </p>
    ),
  },
  {
    id: "providers",
    title: "Service providers and where your data is stored",
    body: (
      <>
        <p>
          We use these service providers to run {SITE.name}. They process
          personal information on our behalf.
        </p>
        <ul className="flex flex-col gap-3">
          {SERVICE_PROVIDERS.map((provider) => (
            <li
              key={provider.name}
              className="rounded-md border border-border bg-surface px-4 py-3"
            >
              <p className="font-semibold">{provider.name}</p>
              <p>{provider.purpose}</p>
              <p className="text-text-muted">Location: {provider.location}</p>
            </li>
          ))}
        </ul>
        <p>
          Your information is stored and processed outside Canada, mainly in the
          United States. While it is there, it is subject to the laws of that
          country and may be accessed by its courts, law enforcement and
          national security authorities.
        </p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <Bullets>
        <li>
          <strong>Account and game data:</strong> until you delete your account.
          During the open alpha, leagues and saves may also be reset or deleted
          at any time.
        </li>
        <li>
          <strong>Support requests:</strong> deleted 12 months after we receive
          them. Deleting your account removes requests linked to it from our
          database straight away. Copies in our support inbox are deleted on the
          12-month schedule.
        </li>
        <li>
          <strong>Spam-protection codes:</strong> deleted within 24 hours.
        </li>
        <li>
          <strong>Usage totals:</strong> deleted after 24 months.
        </li>
        <li>
          <strong>Provider logs and backups:</strong> our service providers keep
          logs and backups for limited periods under their own policies, so some
          information can remain there for a short time after you delete it.
        </li>
      </Bullets>
    ),
  },
  {
    id: "your-choices",
    title: "Your choices and rights",
    body: (
      <>
        <Bullets>
          <li>
            <strong>See and correct your information.</strong> Your display name
            and email address are on your{" "}
            <TextLink href="/account">account page</TextLink>, where you can
            change them.
          </li>
          <li>
            <strong>Delete your account.</strong> Use &quot;Delete account&quot;
            on your account page. Your account, leagues and linked support
            requests are deleted immediately.
          </li>
          <li>
            <strong>Opt out of usage totals.</strong> Turn on Global Privacy
            Control or &quot;Do Not Track&quot; in your browser, and your visits
            and actions won&apos;t be counted.
          </li>
          <li>
            <strong>Ask for a copy</strong> of the personal information we hold
            about you, or ask any other privacy question.
          </li>
        </Bullets>
        <p>
          Send requests through the{" "}
          <TextLink href="/support">support form</TextLink> or to{" "}
          <TextLink href={mail}>{SITE.contactEmail}</TextLink>. We may need to
          confirm your identity first, and we respond within 30 days.
        </p>
        <p>
          If you aren&apos;t satisfied with our answer, you can complain to the{" "}
          <TextLink href="https://www.priv.gc.ca/">
            Office of the Privacy Commissioner of Canada
          </TextLink>
          . If you live outside Canada, you may also have rights under your
          local law; contact us and we will help.
        </p>
      </>
    ),
  },
  {
    id: "children",
    title: "Children",
    body: (
      <p>
        You must be at least {SITE.minimumAge} to create an account. We
        don&apos;t knowingly collect personal information from children under{" "}
        {SITE.minimumAge}. If you believe a child under {SITE.minimumAge} has an
        account, contact us and we will delete it.
      </p>
    ),
  },
  {
    id: "security",
    title: "Security",
    body: (
      <>
        <p>
          Connections to {SITE.name} are encrypted (HTTPS). Passwords are stored
          only as hashes. Each player can reach only their own data, and the
          keys that can bypass those rules are kept on our servers.
        </p>
        <p>
          No system is perfectly secure. If a breach of security puts your
          personal information at real risk of significant harm, we will tell
          you and the Privacy Commissioner as the law requires.
        </p>
      </>
    ),
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: (
      <p>
        We will update this page when our practices change and change the date
        at the top. If a change materially affects how we handle your
        information, we will also tell you when you next sign in.
      </p>
    ),
  },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      updated={PRIVACY.updated}
      version={PRIVACY.version}
      summary={
        <p>
          In short: we collect what we need to run your account, your leagues
          and support. We don&apos;t sell your information, show ads or use
          tracking cookies. Usage statistics are anonymous daily totals. Your
          data is stored in the United States, and you can delete your account
          at any time.
        </p>
      }
      sections={SECTIONS}
    />
  );
}
