import Link from "next/link";
import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Sheet } from "@/components/ui/sheet";
import { Brand, SkipLink } from "./brand";
import { CURRENT_VERSION } from "@/content/changelog";
import { AlphaBadge } from "./alpha-badge";
import { FOOTER_NAV, MARKETING_NAV } from "./nav-config";
import { SiteAuthActions } from "./site-auth-actions";

/** Public site frame: header, content, footer. */
export function SiteChrome({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SkipLink />
      <header className="sticky top-0 z-(--fc-z-nav) border-b border-border bg-canvas/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex max-w-content items-center justify-between gap-4 px-4 py-2 tablet:px-6 desktop:px-8">
          <div className="flex items-center gap-1">
            <Brand />
            <AlphaBadge />
          </div>
          <nav aria-label="Site" className="hidden tablet:block">
            <ul className="flex items-center gap-1">
              {MARKETING_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="inline-flex min-h-touch items-center rounded-md px-3 font-medium text-text-muted hover:bg-surface-muted hover:text-text"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
              <li className="ml-2">
                <SiteAuthActions placement="header" />
              </li>
            </ul>
          </nav>
          <div className="tablet:hidden">
            <Sheet
              title="Menu"
              triggerLabel="Menu"
              triggerIcon="menu"
              triggerClassName="inline-flex min-h-touch items-center gap-2 rounded-md px-3 font-semibold hover:bg-surface-muted"
            >
              <nav aria-label="Site">
                <ul className="flex flex-col">
                  {MARKETING_NAV.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="flex min-h-touch items-center rounded-md px-2 text-lg font-medium hover:bg-surface-muted"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
                <div className="mt-4">
                  <SiteAuthActions placement="menu" />
                </div>
              </nav>
            </Sheet>
          </div>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="flex-1 outline-none">
        {children}
      </main>

      <footer className="border-t border-border bg-surface pb-[env(safe-area-inset-bottom)]">
        <div className="mx-auto flex max-w-content flex-col gap-8 px-4 py-8 tablet:px-6 desktop:flex-row desktop:justify-between desktop:px-8">
          <div className="flex max-w-sm flex-col gap-2">
            <Brand />
            <p className="text-sm text-text-muted">
              A fictional basketball league. Any resemblance to real teams or
              players is coincidental.
            </p>
            <p className="text-sm text-text-muted">
              Open alpha ·{" "}
              <Link
                href="/changelog"
                className="inline-flex min-h-touch items-center font-mono underline underline-offset-4 hover:text-text"
              >
                {CURRENT_VERSION}
              </Link>
            </p>
          </div>
          <nav
            aria-label="Footer"
            className="grid grid-cols-2 gap-6 tablet:grid-cols-3 desktop:grid-cols-[repeat(3,max-content)] desktop:gap-10"
          >
            {FOOTER_NAV.map((group) => (
              <div key={group.title}>
                <h2 className="px-3 text-sm font-semibold">{group.title}</h2>
                <ul className="mt-1 flex flex-col">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className="inline-flex min-h-touch items-center rounded-md px-3 text-sm text-text-muted hover:bg-surface-muted hover:text-text desktop:whitespace-nowrap"
                      >
                        {item.label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
          <div>
            <ThemeToggle />
          </div>
        </div>
      </footer>
    </div>
  );
}
