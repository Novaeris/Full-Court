import type { IconName } from "@/components/ui/icon";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Other sections that count as this item for the active state. */
  match?: readonly string[];
};

/**
 * Primary app sections. The same list drives the desktop sidebar, the tablet
 * rail, the phone tab bar and (later) the native app's tab navigator, so the
 * information architecture is identical everywhere. Keep it to 4 entries;
 * the phone tab bar adds "More" as the fifth.
 */
export const APP_NAV: readonly NavItem[] = [
  { href: "/modes", label: "Modes", icon: "grid" },
  // Owner Mode's saves are leagues, so league pages belong to Owner Mode.
  { href: "/owner", label: "Owner", icon: "trophy", match: ["/leagues"] },
  { href: "/career", label: "Career", icon: "star" },
  { href: "/dynasty", label: "Dynasty", icon: "cards" },
];

/** Account settings: first entry of the account menu and the "More" sheet. */
export const ACCOUNT_LINK: NavItem = {
  href: "/account",
  label: "Account settings",
  icon: "user",
};

/** Help and info links: the account menu on desktop and tablet, "More" on phones. */
export const SECONDARY_NAV: readonly NavItem[] = [
  { href: "/support", label: "Contact & Support", icon: "mail" },
  { href: "/changelog", label: "Changelog", icon: "list" },
  { href: "/about", label: "About", icon: "info" },
];

/** Policies: linked from every footer, the sidebar and the "More" sheet. */
export const LEGAL_NAV: readonly NavItem[] = [
  { href: "/terms", label: "Terms of Service", icon: "file" },
  { href: "/privacy", label: "Privacy Policy", icon: "shield" },
  { href: "/alpha", label: "Alpha Disclaimer", icon: "alert" },
  { href: "/acceptable-use", label: "Acceptable Use", icon: "flag" },
];

/** The public site footer, in columns. */
export const FOOTER_NAV: readonly {
  title: string;
  items: readonly NavItem[];
}[] = [
  {
    title: "Full Court",
    items: [
      { href: "/about", label: "About", icon: "info" },
      { href: "/changelog", label: "Changelog", icon: "list" },
    ],
  },
  {
    title: "Help",
    items: [{ href: "/support", label: "Contact & Support", icon: "mail" }],
  },
  { title: "Legal", items: LEGAL_NAV },
];

/** Public site header links. */
export const MARKETING_NAV: readonly NavItem[] = [
  { href: "/about", label: "About", icon: "info" },
  { href: "/styleguide", label: "Design system", icon: "palette" },
];

function inSection(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Whether `pathname` is inside the item's section (or one it claims). */
export function isActive(
  pathname: string,
  item: Pick<NavItem, "href" | "match">,
): boolean {
  return [item.href, ...(item.match ?? [])].some((href) =>
    inSection(pathname, href),
  );
}
