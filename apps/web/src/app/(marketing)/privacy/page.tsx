import type { Metadata } from "next";
import { Page, PageHeader } from "@/components/layout/primitives";
import { DraftNotice } from "../draft-notice";

export const metadata: Metadata = { title: "Privacy" };

export default function PrivacyPage() {
  return (
    <Page width="prose">
      <PageHeader title="Privacy" />
      <DraftNotice />
      <div className="mt-6 flex flex-col gap-4 text-lg leading-relaxed">
        <p>
          Full Court does not have accounts yet and does not collect personal
          information. The site stores your color theme choice in your
          browser&apos;s local storage; nothing else is saved.
        </p>
        <p>
          A full privacy policy covering accounts, saved leagues and the
          services that host them will be published before accounts open.
        </p>
      </div>
    </Page>
  );
}
