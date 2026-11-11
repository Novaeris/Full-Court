import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Full Court",
  description: "Basketball franchise management.",
  // Pre-launch: keep every environment out of search results. Remove at the launch gates.
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
