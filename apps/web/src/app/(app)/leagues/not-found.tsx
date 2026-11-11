import { Page } from "@/components/layout/primitives";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

/** A league that doesn't exist, or belongs to someone else. */
export default function LeagueNotFound() {
  return (
    <Page width="prose">
      <h1 className="sr-only">League not found</h1>
      <EmptyState
        icon="trophy"
        title="League not found"
        description="This league doesn't exist, or it isn't one of yours."
        action={<ButtonLink href="/leagues">Back to your leagues</ButtonLink>}
      />
    </Page>
  );
}
