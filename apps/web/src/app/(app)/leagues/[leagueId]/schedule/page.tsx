import type { Metadata } from "next";
import { ComingSoon } from "@/components/leagues/coming-soon";

export const metadata: Metadata = { title: "Schedule" };

export default function SchedulePage() {
  return (
    <ComingSoon
      icon="calendar"
      title="Schedule coming soon"
      description="The season schedule and game results will appear here once games can be simulated."
    />
  );
}
