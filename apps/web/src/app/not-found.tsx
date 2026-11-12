import type { Metadata } from "next";
import { SiteChrome } from "@/components/navigation/site-chrome";
import { Page } from "@/components/layout/primitives";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <SiteChrome>
      <Page width="prose">
        <h1 className="sr-only">Page not found</h1>
        <EmptyState
          icon="ball"
          title="Air ball"
          description="We couldn't find that page. It may have moved, or the link may be wrong."
          action={
            <div className="flex flex-col gap-3 tablet:flex-row">
              <ButtonLink href="/">Back to home</ButtonLink>
              <ButtonLink href="/support" variant="secondary">
                Report a broken link
              </ButtonLink>
            </div>
          }
        />
      </Page>
    </SiteChrome>
  );
}
