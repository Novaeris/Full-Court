"use client";

import { useId, type ComponentProps, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { buttonClasses } from "@/components/ui/button";

/** What every form Server Action returns. */
export type FormState = {
  status: "idle" | "error" | "success";
  message?: string;
  fieldErrors?: Record<string, string>;
  /** Field values to restore after a failed submit (never passwords). */
  values?: Record<string, string>;
};

export const IDLE: FormState = { status: "idle" };

/** Labelled input with hint and error text wired up for screen readers. */
export function Field({
  label,
  name,
  hint,
  error,
  ...input
}: {
  label: string;
  name: string;
  hint?: string;
  error?: string | undefined;
} & Omit<ComponentProps<"input">, "name" | "id">) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy =
    [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") ||
    undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="font-semibold">
        {label}
      </label>
      <input
        id={id}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={[
          "min-h-touch w-full rounded-md border bg-surface px-3 text-base text-text",
          "placeholder:text-text-muted",
          error ? "border-danger" : "border-text-muted",
        ].join(" ")}
        {...input}
      />
      {hint ? (
        <p id={hintId} className="text-sm text-text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** Submit button that disables itself and shows progress while pending. */
export function SubmitButton({
  children,
  pendingLabel,
  variant = "primary",
  className = "",
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: "primary" | "secondary" | "danger";
  className?: string;
}) {
  const { pending } = useFormStatus();
  const classes = buttonClasses(variant, className);
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className={classes}
    >
      {pending ? pendingLabel : children}
    </button>
  );
}

/** Result message for a form: announced to screen readers when it appears. */
export function FormMessage({ state }: { state: FormState }) {
  if (state.status === "idle" || !state.message) return null;
  const success = state.status === "success";
  return (
    <p
      role={success ? "status" : "alert"}
      className={[
        "rounded-md border px-4 py-3",
        success
          ? "border-win bg-surface text-text"
          : "border-danger bg-surface text-danger",
      ].join(" ")}
    >
      {state.message}
    </p>
  );
}
