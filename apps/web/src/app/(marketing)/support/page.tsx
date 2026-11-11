import type { Metadata } from "next";
import { Suspense } from "react";
import { FormSkeleton } from "@/components/forms/form-skeleton";
import { Card, Page, PageHeader } from "@/components/layout/primitives";
import { TextLink } from "@/components/legal/legal-page";
import { SupportForm } from "@/components/support/support-form";
import { SITE } from "@/content/site";
import { getUserContext } from "@/server/auth/session";
import { issueFormToken } from "@/server/security/request-signing";
import { getProfile } from "@/server/services/account";

export const metadata: Metadata = {
  title: "Contact & Support",
  description:
    "Report a bug, get help with your account, send feedback or report a security concern.",
};

export default function SupportPage() {
  return (
    <Page width="prose">
      <PageHeader
        title="Contact & Support"
        description="Report a bug, get help with your account or tell us what you think."
      />
      <div className="flex flex-col gap-4 text-lg leading-relaxed">
        <p>
          {SITE.name} is made by one developer. Every request is read, but
          replies can take a few days, and not every message needs one.
        </p>
        <Card>
          <h2 className="font-bold">Before you write</h2>
          <ul className="mt-2 ml-6 flex list-disc flex-col gap-1.5 text-base">
            <li>
              <strong>Never send your password</strong> or any access token. We
              will never ask for them.
            </li>
            <li>
              Bugs are expected in the alpha. The{" "}
              <TextLink href="/changelog">changelog</TextLink> shows what
              changed recently.
            </li>
            <li>
              Found a security problem? Choose &quot;Security concern&quot; and
              see the{" "}
              <TextLink href="/acceptable-use#bugs">guidelines</TextLink>.
            </li>
            <li>
              Privacy requests, or the form isn&apos;t working? Email{" "}
              <TextLink href={`mailto:${SITE.contactEmail}`}>
                {SITE.contactEmail}
              </TextLink>
              .
            </li>
          </ul>
        </Card>
      </div>
      <section aria-labelledby="support-form" className="mt-8">
        <h2 id="support-form" className="text-2xl font-bold tracking-tight">
          Send a request
        </h2>
        <p className="mt-1 text-text-muted">
          All fields are required. See the{" "}
          <TextLink href="/privacy">Privacy Policy</TextLink> for how we handle
          what you send.
        </p>
        <div className="mt-4">
          <Suspense fallback={<FormSkeleton fields={5} />}>
            <SupportFormLoader />
          </Suspense>
        </div>
      </section>
    </Page>
  );
}

/** Pre-fills name and email for signed-in players, and stamps the form time. */
async function SupportFormLoader() {
  const ctx = await getUserContext();
  const name = ctx
    ? await getProfile(ctx)
        .then((profile) => profile.displayName)
        .catch(() => "")
    : "";
  return (
    <SupportForm
      formToken={issueFormToken()}
      defaultName={name}
      defaultEmail={ctx?.user.email ?? ""}
    />
  );
}
