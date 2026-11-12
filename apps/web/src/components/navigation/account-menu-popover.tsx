"use client";

import { useId, useState, type ReactNode } from "react";
import { Icon } from "@/components/ui/icon";

/**
 * The trigger and panel of the account menu, built on the native popover API:
 * the browser closes it on Escape or a click outside and returns focus to the
 * trigger. It isn't an ARIA menu (it holds links, a theme switch and a form),
 * so the trigger is a plain disclosure button with aria-expanded.
 *
 * Placement: on the tablet rail it opens beside the rail; on desktop it opens
 * upward from the foot of the sidebar.
 */
export function AccountMenuPopover({
  name,
  initial,
  children,
}: {
  name: string;
  initial: string;
  children: ReactNode;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        popoverTarget={id}
        aria-expanded={open}
        aria-controls={id}
        className={[
          "flex min-h-touch w-full items-center justify-center gap-3 rounded-md px-1 py-1.5 text-left text-text-muted hover:bg-surface-muted hover:text-text",
          "desktop:justify-start desktop:px-2",
          open ? "bg-surface-muted text-text" : "",
        ].join(" ")}
      >
        <span
          aria-hidden="true"
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-accent-soft font-bold text-on-accent-soft"
        >
          {initial}
        </span>
        <span className="sr-only">Account: {name}</span>
        {/* Visible name on desktop only; the rail shows just the avatar. */}
        <span
          aria-hidden="true"
          className="hidden min-w-0 flex-1 truncate font-semibold text-text desktop:block"
        >
          {name}
        </span>
        <Icon
          name="chevronUp"
          className={`hidden size-4 shrink-0 transition-transform duration-(--fc-duration-fast) desktop:block ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div
        id={id}
        popover="auto"
        aria-label="Account menu"
        onToggle={(event) => setOpen(event.newState === "open")}
        onClick={(event) => {
          // Following a link navigates away, so dismiss the menu.
          if (event.target instanceof Element && event.target.closest("a")) {
            event.currentTarget.hidePopover();
          }
        }}
        className={[
          "fixed inset-auto m-0 max-h-[calc(100dvh-2rem)] w-72 overflow-y-auto rounded-lg border border-border bg-surface p-2 text-text shadow-xl",
          // Tablet: beside the rail, aligned to its foot.
          "bottom-4 left-[calc(var(--spacing-rail)+0.5rem)]",
          // Desktop: inside the sidebar, above the trigger.
          "desktop:bottom-20 desktop:left-4 desktop:w-64",
          "transition-[opacity,translate] duration-(--fc-duration-fast) starting:open:translate-y-1 starting:open:opacity-0",
        ].join(" ")}
      >
        {children}
      </div>
    </>
  );
}
