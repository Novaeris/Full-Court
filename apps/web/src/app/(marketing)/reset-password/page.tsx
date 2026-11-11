import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { NewPasswordForm } from "@/components/auth/auth-forms";
import { FormSkeleton } from "@/components/forms/form-skeleton";
import { buttonClasses } from "@/components/ui/button";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Choose a new password" };

/** Reached from a password reset email, which signs the user in first. */
export default function ResetPasswordPage() {
  return (
    <AuthCard title="Choose a new password">
      <Suspense fallback={<FormSkeleton fields={1} />}>
        <ResetPassword />
      </Suspense>
    </AuthCard>
  );
}

async function ResetPassword() {
  if (!(await getCurrentUser())) {
    return (
      <div className="flex flex-col gap-4">
        <p>
          This page opens from the link in a password reset email. That link may
          have expired.
        </p>
        <Link href="/forgot-password" className={buttonClasses("primary")}>
          Request a new link
        </Link>
      </div>
    );
  }
  return <NewPasswordForm />;
}
