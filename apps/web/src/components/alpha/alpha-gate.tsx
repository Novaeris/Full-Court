import { Suspense } from "react";
import { ALPHA_NOTICE, TERMS } from "@/content/policies";
import { getUserContext } from "@/server/auth/session";
import { getAcknowledgments } from "@/server/services/account";
import { AlphaIntroDialog } from "./alpha-intro-dialog";

/**
 * Shows the alpha introduction to signed-in players who haven't acknowledged
 * the current notice version (or accepted the current Terms). Players see it
 * once, and again only after a material change bumps a version.
 */
export function AlphaGate() {
  return (
    <Suspense fallback={null}>
      <Gate />
    </Suspense>
  );
}

async function Gate() {
  const ctx = await getUserContext();
  if (!ctx) return null;
  const current = await getAcknowledgments(ctx).catch(() => null);
  if (!current) return null;
  const needsTerms = (current.termsVersion ?? 0) < TERMS.version;
  const needsAlpha = (current.alphaNoticeVersion ?? 0) < ALPHA_NOTICE.version;
  if (!needsTerms && !needsAlpha) return null;
  return (
    <AlphaIntroDialog
      needsTerms={needsTerms}
      returning={current.alphaNoticeVersion !== null}
    />
  );
}
