import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout/primitives";
import { DraftNotice } from "../draft-notice";

export const metadata: Metadata = { title: "Terms" };

export default function TermsPage() {
  return (
    <Page width="prose">
      <PageHeader title="Terms of use" />
      <DraftNotice />
      <div className="mt-6 flex flex-col gap-4 text-lg leading-relaxed">
        <p>
          Full Court is in development and offered as-is for preview. Features
          may change or be removed, and anything you see here may be reset.
        </p>
        <p>Full terms of use will be published before accounts open.</p>
      </div>
    </Page>
  );
}
