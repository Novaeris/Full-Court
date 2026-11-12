"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "@/components/ui/icon";
import { isActive, type NavItem } from "./nav-config";

/**
 * Navigation links in one of three forms. Marks the current page with
 * aria-current. Must sit inside <Suspense> (see NavLinksFallback): with Cache
 * Components, usePathname suspends on routes with unknown dynamic params.
 */
export type NavForm = "sidebar" | "tabs";

const FORM_CLASSES: Record<NavForm, { list: string; link: string }> = {
  // Tablet: icon rail with small labels. Desktop: icon + label rows.
  sidebar: {
    list: "flex flex-col gap-1",
    link: [
      "flex min-h-touch flex-col items-center justify-center gap-1 rounded-md px-1 py-2 text-xs font-medium",
      "desktop:flex-row desktop:justify-start desktop:gap-3 desktop:px-3 desktop:text-base",
    ].join(" "),
  },
  // Phone: bottom tab bar, icon above label.
  tabs: {
    list: "flex w-full",
    link: "flex min-h-touch flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5 text-xs font-medium",
  },
};

function linkState(active: boolean, form: NavForm) {
  if (form === "tabs") {
    // Tabs mark the active item with a pill behind the icon, not a block.
    return active
      ? "font-semibold text-text"
      : "text-text-muted hover:text-text";
  }
  return active
    ? "bg-accent-soft text-on-accent-soft"
    : "text-text-muted hover:bg-surface-muted hover:text-text";
}

export function NavLinks({
  items,
  form,
}: {
  items: readonly NavItem[];
  form: NavForm;
}) {
  const pathname = usePathname();
  return <NavList items={items} form={form} pathname={pathname} />;
}

/** Same links without the active state, rendered while the pathname resolves. */
export function NavLinksFallback({
  items,
  form,
}: {
  items: readonly NavItem[];
  form: NavForm;
}) {
  return <NavList items={items} form={form} pathname={null} />;
}

function NavList({
  items,
  form,
  pathname,
}: {
  items: readonly NavItem[];
  form: NavForm;
  pathname: string | null;
}) {
  const classes = FORM_CLASSES[form];
  return (
    <ul className={classes.list}>
      {items.map((item) => {
        const active = pathname !== null && isActive(pathname, item);
        return (
          <li key={item.href} className={form === "tabs" ? "flex flex-1" : ""}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`${classes.link} ${linkState(active, form)} transition-colors duration-(--fc-duration-fast)`}
            >
              {form === "tabs" ? (
                <span
                  className={`rounded-full px-4 py-0.5 ${active ? "bg-accent-soft text-on-accent-soft" : ""}`}
                >
                  <Icon name={item.icon} className="size-6" />
                </span>
              ) : (
                <Icon name={item.icon} className="size-6 shrink-0" />
              )}
              <span>{item.label}</span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
