import Link from "next/link";
import { Suspense } from "react";
import { SignOutButton } from "@/components/auth/sign-out";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { AccountMenuPopover } from "./account-menu-popover";
import { getAccountSummary, SignInSlot } from "./account-slot";
import {
  ACCOUNT_LINK,
  LEGAL_NAV,
  SECONDARY_NAV,
  type NavItem,
} from "./nav-config";

/**
 * Foot of the sidebar and tablet rail: one row with the member's avatar and
 * name, opening a menu with account settings, theme, help, legal and sign
 * out. Visitors get "Sign in". Streams in behind Suspense.
 */
export function AccountMenu() {
  return (
    <Suspense
      fallback={<span aria-hidden="true" className="block h-12 w-full" />}
    >
      <Member />
    </Suspense>
  );
}

async function Member() {
  const account = await getAccountSummary();
  if (!account) return <SignInSlot />;
  return (
    <AccountMenuPopover name={account.name} initial={account.initial}>
      <AccountMenuContent />
    </AccountMenuPopover>
  );
}

const ROW =
  "flex min-h-touch w-full items-center gap-3 rounded-md px-2 text-sm hover:bg-surface-muted";

function MenuLinks({ items }: { items: readonly NavItem[] }) {
  return (
    <ul className="flex flex-col">
      {items.map((item) => (
        <li key={item.href}>
          <Link href={item.href} className={ROW}>
            <Icon
              name={item.icon}
              className="size-5 shrink-0 text-text-muted"
            />
            {item.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function AccountMenuContent() {
  return (
    <div className="flex flex-col gap-1">
      <MenuLinks items={[ACCOUNT_LINK]} />
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <span className="text-sm text-text-muted">Theme</span>
        <ThemeToggle compact />
      </div>
      <div className="border-t border-border pt-1">
        <MenuLinks items={SECONDARY_NAV} />
        <details className="group">
          <summary className={`${ROW} cursor-pointer list-none`}>
            <Icon name="file" className="size-5 shrink-0 text-text-muted" />
            <span className="flex-1">Legal</span>
            <span
              aria-hidden="true"
              className="text-text-muted transition-transform group-open:rotate-90"
            >
              ›
            </span>
          </summary>
          <div className="pl-6">
            <MenuLinks items={LEGAL_NAV} />
          </div>
        </details>
      </div>
      <div className="border-t border-border pt-1">
        <SignOutButton look="menu" />
      </div>
    </div>
  );
}
