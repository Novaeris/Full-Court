import type { IconName } from "@/components/ui/icon";

export type NavItem = {
  href: string;
  label: string;
  icon: IconName;
};

/**
 * Primary app sections. The same list drives the desktop sidebar, the tablet
 * rail, the phone tab bar and (later) the native app's tab navigator, so the
 * information architecture is identical everywhere. Keep it to 4 entries;
 * the phone tab bar adds "More" as the fifth.
 */
export const APP_NAV: readonly NavItem[] = [
  { href: "/leagues", label: "Leagues", icon: "trophy" },
  { href: "/account", label: "Account", icon: "user" },
];

/** Secondary links: sidebar footer on desktop, "More" sheet on phones. */
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

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
