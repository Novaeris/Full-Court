import type { Metadata } from "next";
import { AuthCard } from "@/components/auth/auth-card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Account deleted" };

export default function AccountDeletedPage() {
  return (
    <AuthCard title="Your account has been deleted">
      <div className="flex flex-col gap-4">
        <p>
          Your account, profile and saved data have been permanently removed.
          Thanks for playing Full Court.
        </p>
        <ButtonLink href="/">Back to home</ButtonLink>
      </div>
    </AuthCard>
  );
}
