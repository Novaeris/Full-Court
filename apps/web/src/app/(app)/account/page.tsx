import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout/primitives";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Account" };

export default function AccountPage() {
  return (
    <Page>
      <PageHeader title="Account" />
      <EmptyState
        icon="user"
        title="Sign-in is coming soon"
        description="Accounts are the next part of Full Court to be built. You'll be able to sign up, sign in and manage your profile here."
      />
    </Page>
  );
}
