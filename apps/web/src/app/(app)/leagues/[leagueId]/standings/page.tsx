import type { Metadata } from "next";
import { ComingSoon } from "@/components/leagues/coming-soon";

export const metadata: Metadata = { title: "Standings" };

export default function StandingsPage() {
  return (
    <ComingSoon
      icon="chart"
      title="Standings coming soon"
      description="Conference and league standings will appear here once the season starts."
    />
  );
}
