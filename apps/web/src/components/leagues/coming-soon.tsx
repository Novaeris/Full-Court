import { EmptyState } from "@/components/ui/empty-state";
import type { IconName } from "@/components/ui/icon";

/** Placeholder for league sections that later phases fill in. */
export function ComingSoon({
  icon,
  title,
  description,
}: {
  icon: IconName;
  title: string;
  description: string;
}) {
  return <EmptyState icon={icon} title={title} description={description} />;
}
