import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { Sheet } from "@/components/ui/sheet";
import { SignedInOnly, SignOutButton } from "@/components/auth/sign-out";
import { AccountSlot } from "./account-slot";
import { Brand, SkipLink } from "./brand";
import { AlphaGate } from "@/components/alpha/alpha-gate";
import { AlphaBadge } from "./alpha-badge";
import { APP_NAV, LEGAL_NAV, SECONDARY_NAV, type NavItem } from "./nav-config";
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
  /** Overrides the account area (tests, previews). Defaults to the signed-in user. */
  account?: ReactNode;
}) {
  const accountSlot = account ?? <AccountSlot />;
  return (
    <div className="min-h-dvh tablet:grid tablet:grid-cols-[var(--spacing-rail)_minmax(0,1fr)] desktop:grid-cols-[var(--spacing-sidebar)_minmax(0,1fr)]">
      <SkipLink />

      {/* Tablet rail / desktop sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col overflow-y-auto border-r border-border bg-surface px-2 py-4 tablet:flex desktop:px-4">
        <div className="flex flex-col items-center desktop:flex-row desktop:gap-1">
          <Brand href="/leagues" compact />
          <AlphaBadge />
        </div>
        <nav aria-label="Main" className="mt-6 flex-1">
          <Suspense
            fallback={<NavLinksFallback items={APP_NAV} form="sidebar" />}
          >
            <NavLinks items={APP_NAV} form="sidebar" />
          </Suspense>
        </nav>
        <div className="flex flex-col items-center gap-3 border-t border-border pt-4 desktop:items-stretch">
          <div className="hidden flex-col desktop:flex">
            <SidebarLinks items={SECONDARY_NAV} />
            <details className="group">
              <summary className="flex min-h-touch cursor-pointer list-none items-center justify-between rounded-md px-3 text-sm text-text-muted hover:bg-surface-muted hover:text-text">
                Legal
                <span
                  aria-hidden="true"
                  className="transition-transform group-open:rotate-90"
                >
                  ›
                </span>
              </summary>
              <SidebarLinks items={LEGAL_NAV} />
            </details>
          </div>
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
          {/* Tablet uses the More sheet; desktop gets a row here. */}
          <div className="hidden w-full desktop:block">
            <SignedInOnly>
              <SignOutButton look="sidebar" />
            </SignedInOnly>
          </div>
        </div>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col">
        {/* Phone top bar */}
        <header className="sticky top-0 z-(--fc-z-nav) flex items-center justify-between border-b border-border bg-surface/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur tablet:hidden">
          <div className="flex items-center gap-1">
            <Brand href="/leagues" />
            <AlphaBadge />
          </div>
          {accountSlot}
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="flex-1 pb-[calc(var(--spacing-tab-bar)+env(safe-area-inset-bottom))] outline-none tablet:pb-0"
        >
          {children}
        </main>
        <AlphaGate />
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

function SidebarLinks({ items }: { items: readonly NavItem[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {items.map((item) => (
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
  );
}

function MoreLinks({ items }: { items: readonly NavItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
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
  );
}

function MoreSheetContent() {
  return (
    <div className="flex flex-col gap-6">
      <MoreLinks items={SECONDARY_NAV} />
      <div>
        <p className="mb-1 text-sm font-semibold text-text-muted">Legal</p>
        <MoreLinks items={LEGAL_NAV} />
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-text-muted">Theme</p>
        <ThemeToggle />
      </div>
      <SignedInOnly>
        <div className="border-t border-border pt-4">
          <SignOutButton look="row" />
        </div>
      </SignedInOnly>
    </div>
  );
}
