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
  { href: "/about", label: "About", icon: "info" },
  { href: "/privacy", label: "Privacy", icon: "shield" },
  { href: "/terms", label: "Terms", icon: "file" },
];

/** Public site header links. */
export const MARKETING_NAV: readonly NavItem[] = [
  { href: "/about", label: "About", icon: "info" },
  { href: "/styleguide", label: "Design system", icon: "palette" },
];

export function isActive(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}
