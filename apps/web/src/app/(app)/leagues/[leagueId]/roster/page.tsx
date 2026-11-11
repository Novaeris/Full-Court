import type { Metadata } from "next";
import { ComingSoon } from "@/components/leagues/coming-soon";

export const metadata: Metadata = { title: "Roster" };

export default function RosterPage() {
  return (
    <ComingSoon
      icon="user"
      title="Roster coming soon"
      description="Your players, their ratings and contracts will appear here once teams are generated."
    />
  );
}
