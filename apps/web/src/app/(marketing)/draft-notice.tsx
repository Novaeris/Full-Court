/** Marks a legal page as a placeholder until the real text is written (launch gate). */
export function DraftNotice() {
  return (
    <p
      role="note"
      className="rounded-md border border-border bg-accent-soft px-4 py-3 text-on-accent-soft"
    >
      <strong>Placeholder.</strong> This page is a draft and will be replaced
      before Full Court opens to the public.
    </p>
  );
}
