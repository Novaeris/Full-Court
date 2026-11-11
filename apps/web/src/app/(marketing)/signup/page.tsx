import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, inlineLinkClass } from "@/components/auth/auth-card";
import { SignUpForm } from "@/components/auth/auth-forms";
import { FormSkeleton } from "@/components/forms/form-skeleton";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Create an account" };

export default function SignUpPage() {
  return (
    <AuthCard
      title="Create an account"
      description="One account for Full Court on every device."
      footer={
        <>
          Already have an account?{" "}
          <Link href="/login" className={inlineLinkClass}>
            Sign in
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton fields={3} />}>
        <SignUp />
      </Suspense>
    </AuthCard>
  );
}

async function SignUp() {
  if (await getCurrentUser()) {
    redirect("/leagues");
  }
  return <SignUpForm />;
}
