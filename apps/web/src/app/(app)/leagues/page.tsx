import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout/primitives";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Leagues" };

export default function LeaguesPage() {
  return (
    <Page>
      <PageHeader
        title="Leagues"
        description="Your saved leagues will appear here."
      />
      <EmptyState
        icon="trophy"
        title="Leagues are coming soon"
        description="Accounts arrive first, then you'll be able to create and manage leagues from this page."
        action={
          <ButtonLink href="/about" variant="secondary">
            See the roadmap
          </ButtonLink>
        }
      />
    </Page>
  );
}
