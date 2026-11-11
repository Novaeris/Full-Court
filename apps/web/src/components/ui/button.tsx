import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Variant = "primary" | "secondary" | "ghost";

const base =
  "inline-flex min-h-touch items-center justify-center gap-2 rounded-md px-5 text-base font-semibold transition-colors duration-(--fc-duration-fast) disabled:cursor-not-allowed disabled:opacity-60";

const variants: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-strong",
  secondary: "border border-border bg-surface text-text hover:bg-surface-muted",
  ghost: "text-text hover:bg-surface-muted",
};

export function buttonClasses(variant: Variant = "primary", extra = "") {
  return [base, variants[variant], extra].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ComponentProps<"button"> & { variant?: Variant }) {
  return (
    <button
      type="button"
      className={buttonClasses(variant, className)}
      {...props}
    />
  );
}

export function ButtonLink({
  href,
  variant = "primary",
  className = "",
  children,
}: {
  href: ComponentProps<typeof Link>["href"];
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link href={href} className={buttonClasses(variant, className)}>
      {children}
    </Link>
  );
}
