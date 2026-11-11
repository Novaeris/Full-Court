import type { Metadata } from "next";
import { ComingSoon } from "@/components/leagues/coming-soon";

export const metadata: Metadata = { title: "League" };

export default function LeagueOverviewPage() {
  return (
    <ComingSoon
      icon="trophy"
      title="Your league is saved"
      description="Next up: generating teams and players for this league. Once that's built, you'll pick your team here."
    />
  );
}
