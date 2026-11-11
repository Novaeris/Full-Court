import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Suspense } from "react";
import { PageViewTracker } from "@/components/analytics/page-view-tracker";
import { themeBootScript } from "@/components/theme/theme";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "Full Court",
    template: "%s · Full Court",
  },
  description:
    "Own a basketball franchise. Build the roster, manage the money and chase a title in a fully simulated league.",
  applicationName: "Full Court",
  openGraph: {
    type: "website",
    siteName: "Full Court",
    locale: "en_CA",
  },
  // Open alpha: keep every environment out of search results (owner decision,
  // 2026-11-11). Revisit at the launch gates.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f4f1" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1116" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript }} />
      </head>
      <body>
        {children}
        <Suspense fallback={null}>
          <PageViewTracker />
        </Suspense>
      </body>
    </html>
  );
}
