import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { AuthCard, inlineLinkClass } from "@/components/auth/auth-card";
import { SignInForm } from "@/components/auth/auth-forms";
import { FormSkeleton } from "@/components/forms/form-skeleton";
import { safeNextPath } from "@/server/auth/redirects";
import { getCurrentUser } from "@/server/auth/session";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthCard
      title="Sign in"
      description="Welcome back to Full Court."
      footer={
        <>
          New here?{" "}
          <Link href="/signup" className={inlineLinkClass}>
            Create an account
          </Link>
        </>
      }
    >
      <Suspense fallback={<FormSkeleton fields={2} />}>
        <SignIn searchParams={searchParams} />
      </Suspense>
    </AuthCard>
  );
}

async function SignIn({
  searchParams,
}: {
  searchParams: PageProps<"/login">["searchParams"];
}) {
  const params = await searchParams;
  const next = safeNextPath(
    typeof params.next === "string" ? params.next : null,
  );
  if (await getCurrentUser()) {
    redirect(next);
  }
  return (
    <div className="flex flex-col gap-4">
      {params.error === "link" ? (
        <p
          role="alert"
          className="rounded-md border border-danger px-4 py-3 text-danger"
        >
          That link is invalid or has expired. Sign in, or request a new link.
        </p>
      ) : null}
      <SignInForm next={next} />
    </div>
  );
}
