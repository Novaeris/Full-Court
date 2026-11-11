import { SiteChrome } from "@/components/navigation/site-chrome";

export default function MarketingLayout({ children }: LayoutProps<"/">) {
  return <SiteChrome>{children}</SiteChrome>;
}
