import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { Brand, SkipLink } from "./brand";
import { APP_NAV, SECONDARY_NAV } from "./nav-config";
import { NavLinks, NavLinksFallback } from "./nav-links";

/**
 * Signed-in application frame. Navigation changes form with the screen:
 *
 * - desktop (≥1024px): sidebar with labels
 * - tablet (640–1023px): icon rail with small labels
 * - phone (<640px): top bar + bottom tab bar with a "More" sheet
 */
export function AppShell({
  children,
  account,
}: {
  children: ReactNode;
  /** Account menu slot. Phase 2 fills it; signed-out until then. */
  account?: ReactNode;
}) {
  const accountSlot = account ?? <SignedOutAccount />;
  return (
    <div className="min-h-dvh tablet:grid tablet:grid-cols-[var(--spacing-rail)_minmax(0,1fr)] desktop:grid-cols-[var(--spacing-sidebar)_minmax(0,1fr)]">
      <SkipLink />

      {/* Tablet rail / desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-surface px-2 py-4 tablet:flex desktop:px-4">
        <div className="flex justify-center desktop:justify-start">
          <Brand href="/leagues" compact />
        </div>
        <nav aria-label="Main" className="mt-6 flex-1">
          <Suspense
            fallback={<NavLinksFallback items={APP_NAV} form="sidebar" />}
          >
            <NavLinks items={APP_NAV} form="sidebar" />
          </Suspense>
        </nav>
        <div className="flex flex-col items-center gap-3 border-t border-border pt-4 desktop:items-stretch">
          <ul className="hidden flex-col gap-1 desktop:flex">
            {SECONDARY_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex min-h-touch items-center rounded-md px-3 text-sm text-text-muted hover:bg-surface-muted hover:text-text"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="hidden desktop:block">
            <ThemeToggle compact />
          </div>
          {/* Tablet rail: secondary links and theme live in a sheet. */}
          <div className="flex w-full desktop:hidden">
            <Sheet
              title="More"
              triggerLabel="More"
              triggerIcon="more"
              side="left"
              triggerClassName={MORE_TRIGGER}
            >
              <MoreSheetContent />
            </Sheet>
          </div>
          {accountSlot}
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-(--fc-z-nav) flex items-center justify-between border-b border-border bg-surface/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur tablet:hidden">
          <Brand href="/leagues" />
          {accountSlot}
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="flex-1 pb-[calc(var(--spacing-tab-bar)+env(safe-area-inset-bottom))] outline-none tablet:pb-0"
        >
          {children}
        </main>
      </div>

      {/* Phone bottom tab bar */}
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-(--fc-z-nav) flex border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] tablet:hidden"
      >
        {/* Every tab, including More, gets an equal share of the width. */}
        <div className="flex" style={{ flex: APP_NAV.length }}>
          <Suspense fallback={<NavLinksFallback items={APP_NAV} form="tabs" />}>
            <NavLinks items={APP_NAV} form="tabs" />
          </Suspense>
        </div>
        <div className="flex flex-1">
          <Sheet
            title="More"
            triggerLabel="More"
            triggerIcon="more"
            triggerClassName={MORE_TRIGGER}
          >
            <MoreSheetContent />
          </Sheet>
        </div>
      </nav>
    </div>
  );
}

const MORE_TRIGGER =
  "flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 rounded-md px-1 py-1.5 text-xs font-medium text-text-muted hover:bg-surface-muted hover:text-text";

function MoreSheetContent() {
  return (
    <div className="flex flex-col gap-6">
      <ul className="flex flex-col">
        {SECONDARY_NAV.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              className="flex min-h-touch items-center gap-3 rounded-md px-2 text-base hover:bg-surface-muted"
            >
              <Icon name={item.icon} className="size-5 text-text-muted" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-muted">Theme</p>
        <ThemeToggle />
      </div>
    </div>
  );
}

/** Signed-out account slot until accounts exist (Phase 2). */
function SignedOutAccount() {
  return (
    <Link
      href="/account"
      className="inline-flex min-h-touch items-center gap-2 rounded-full px-3 text-sm font-semibold text-text-muted hover:bg-surface-muted hover:text-text"
    >
      <Icon name="user" className="size-5" />
      <span className="tablet:sr-only desktop:not-sr-only">Sign in</span>
    </Link>
  );
}
