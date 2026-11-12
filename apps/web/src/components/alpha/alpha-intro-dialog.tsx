"use client";

import Link from "next/link";
import {
  useActionState,
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from "react";
import {
  CheckboxField,
  FormMessage,
  IDLE,
  SubmitButton,
} from "@/components/forms/form";
import { ALPHA_NOTICE } from "@/content/policies";
import { acknowledgeAlphaAction } from "@/server/alpha/actions";

/** A policy link that opens in a new tab, so the dialog stays put. */
function NewTabLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      target="_blank"
      className="font-semibold underline underline-offset-4"
    >
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </Link>
  );
}

/**
 * Modal alpha introduction on the native <dialog> (focus trap, inert page).
 * It can't be dismissed without acknowledging, because it records consent.
 */
export function AlphaIntroDialog({
  needsTerms,
  returning,
}: {
  needsTerms: boolean;
  /** True when an earlier notice version was acknowledged. */
  returning: boolean;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [state, action] = useActionState(acknowledgeAlphaAction, IDLE);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (state.status === "success") {
      if (dialog.open) dialog.close();
    } else if (!dialog.open) {
      dialog.showModal();
    }
  }, [state.status]);

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      // Escape would dismiss it without recording the acknowledgment.
      onCancel={(event) => event.preventDefault()}
      className="fixed inset-0 m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-lg bg-surface p-0 text-text shadow-2xl backdrop:bg-[rgb(0_0_0/0.55)]"
    >
      <form
        action={action}
        className="flex flex-col gap-4 p-5 tablet:p-6"
        noValidate
      >
        <div>
          <p className="inline-flex rounded-full bg-accent-soft px-3 py-1 text-sm font-semibold text-on-accent-soft">
            Open alpha
          </p>
          <h2 id={titleId} className="mt-3 text-2xl font-black tracking-tight">
            {returning
              ? "The alpha notice has changed"
              : "Welcome to the Full Court open alpha"}
          </h2>
          <p className="mt-2 text-text-muted">{ALPHA_NOTICE.summary}</p>
        </div>
        <ul className="ml-5 flex list-disc flex-col gap-1.5">
          {ALPHA_NOTICE.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        <p>
          Found a bug or have an idea? Tell us through{" "}
          <NewTabLink href="/support">Contact &amp; Support</NewTabLink>. The{" "}
          <NewTabLink href="/alpha">Alpha Disclaimer</NewTabLink> has the
          details.
        </p>
        <FormMessage state={state} />
        {needsTerms ? (
          <CheckboxField
            name="acceptTerms"
            required
            error={state.fieldErrors?.acceptTerms}
            label={
              <>
                I agree to the{" "}
                <NewTabLink href="/terms">Terms of Service</NewTabLink> and{" "}
                <NewTabLink href="/acceptable-use">
                  Acceptable Use Policy
                </NewTabLink>
                , and I have read the{" "}
                <NewTabLink href="/privacy">Privacy Policy</NewTabLink>.
              </>
            }
          />
        ) : null}
        <SubmitButton pendingLabel="Saving…" className="w-full">
          I understand, let&apos;s play
        </SubmitButton>
      </form>
    </dialog>
  );
}
