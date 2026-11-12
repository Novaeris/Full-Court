import Link from "next/link";

/**
 * Persistent "Alpha" marker next to the logo. Links to the Alpha Disclaimer.
 * The visible pill is small; the link around it meets the 44px touch size.
 */
export function AlphaBadge({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/alpha"
      className={`inline-flex min-h-touch items-center rounded-md px-1 ${className}`}
    >
      <span className="rounded-full border border-accent px-2 py-0.5 text-xs font-bold tracking-wide text-accent uppercase">
        Alpha
      </span>
      <span className="sr-only">
        : Full Court is in open alpha. Read what that means.
      </span>
    </Link>
  );
}
