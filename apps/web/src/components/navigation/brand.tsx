import Link from "next/link";
import { Icon } from "@/components/ui/icon";

/** Logo mark and wordmark. `compact` hides the wordmark (tablet rail). */
export function Brand({
  href = "/",
  compact = false,
}: {
  href?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-touch items-center gap-2 rounded-md font-black tracking-tight"
      aria-label="Full Court home"
    >
      <span className="flex size-9 items-center justify-center rounded-md bg-accent text-on-accent">
        <Icon name="ball" className="size-6" />
      </span>
      <span
        className={compact ? "sr-only desktop:not-sr-only text-xl" : "text-xl"}
      >
        Full Court
      </span>
    </Link>
  );
}

/** First focusable element on every page: jumps past the navigation. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-(--fc-z-toast) focus:rounded-md focus:bg-surface focus:px-4 focus:py-3 focus:font-semibold focus:shadow-lg"
    >
      Skip to content
    </a>
  );
}
