/** Placeholder with the shape of a form, shown while the session is read. */
export function FormSkeleton({ fields = 2 }: { fields?: number }) {
  return (
    <div aria-hidden="true" className="flex animate-pulse flex-col gap-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="flex flex-col gap-1.5">
          <div className="h-5 w-24 rounded-sm bg-surface-muted" />
          <div className="h-11 rounded-md bg-surface-muted" />
        </div>
      ))}
      <div className="h-11 rounded-md bg-surface-muted" />
    </div>
  );
}
