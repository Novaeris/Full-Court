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
          action={<ButtonLink href="/">Back to home</ButtonLink>}
        />
      </Page>
    </SiteChrome>
  );
}
