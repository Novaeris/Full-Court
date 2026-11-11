import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import {
  ChangeEmailForm,
  ChangePasswordForm,
  DeleteAccountForm,
  DisplayNameForm,
} from "@/components/auth/account-forms";
import { FormSkeleton } from "@/components/forms/form-skeleton";
import { Page, PageHeader } from "@/components/layout/primitives";
import { TextLink } from "@/components/legal/legal-page";
import { buttonClasses } from "@/components/ui/button";
import { signOutAction } from "@/server/auth/actions";
import { requireUserContext } from "@/server/auth/session";
import { getProfile } from "@/server/services/account";

export const metadata: Metadata = { title: "Account" };

const NOTICES: Record<string, string> = {
  "password-reset": "Your new password is saved.",
  "email-changed": "Your email change is confirmed.",
};

export default function AccountPage({ searchParams }: PageProps<"/account">) {
  return (
    <Page width="prose">
      <PageHeader title="Account" />
      <Suspense fallback={<FormSkeleton fields={4} />}>
        <AccountSettings searchParams={searchParams} />
      </Suspense>
    </Page>
  );
}

async function AccountSettings({
  searchParams,
}: {
  searchParams: PageProps<"/account">["searchParams"];
}) {
  const ctx = await requireUserContext("/account");
  const [profile, params] = await Promise.all([getProfile(ctx), searchParams]);
  const notice =
    typeof params.notice === "string" ? NOTICES[params.notice] : undefined;

  return (
    <div className="flex flex-col gap-6">
      {notice ? (
        <p
          role="status"
          className="rounded-md border border-win bg-surface px-4 py-3"
        >
          {notice}
        </p>
      ) : null}

      <SettingsCard title="Profile">
        <DisplayNameForm current={profile.displayName} />
      </SettingsCard>

      <SettingsCard
        title="Email"
        description={
          <>
            Signed in as <strong className="text-text">{profile.email}</strong>.
          </>
        }
      >
        <ChangeEmailForm />
      </SettingsCard>

      <SettingsCard title="Password">
        <ChangePasswordForm />
      </SettingsCard>

      <SettingsCard title="Sign out" description="Sign out on this device.">
        <form action={signOutAction}>
          <button type="submit" className={buttonClasses("secondary")}>
            Sign out
          </button>
        </form>
      </SettingsCard>

      <SettingsCard
        title="Delete account"
        description={
          <>
            Permanently and immediately deletes your account, your profile,
            every league you own and any support requests you sent while signed
            in. This can&apos;t be undone. Copies kept by our service providers
            (backups, logs, the support inbox) expire on the schedules in the{" "}
            <TextLink href="/privacy#retention">Privacy Policy</TextLink>.
          </>
        }
        danger
      >
        <DeleteAccountForm />
      </SettingsCard>
    </div>
  );
}

function SettingsCard({
  title,
  description,
  danger = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <section
      aria-label={title}
      className={`rounded-lg border bg-surface p-5 tablet:p-6 ${danger ? "border-danger" : "border-border"}`}
    >
      <h2 className="text-xl font-bold">{title}</h2>
      {description ? (
        <p className="mt-1 text-text-muted">{description}</p>
      ) : null}
      <div className="mt-4">{children}</div>
    </section>
  );
}
