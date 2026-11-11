"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Icon, type IconName } from "./icon";

/**
 * Modal panel built on the native <dialog> element (focus trapping, Escape
 * and the inert background come from the browser). Slides up from the bottom
 * on phones and opens from the side on larger screens.
 */
export function Sheet({
  title,
  triggerLabel,
  triggerIcon,
  triggerClassName,
  side = "right",
  children,
}: {
  title: string;
  /** Visible trigger text. */
  triggerLabel: string;
  triggerIcon?: IconName;
  triggerClassName: string;
  side?: "left" | "right";
  /** Sheet content. Following any link inside closes the sheet. */
  children: ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
        className={triggerClassName}
      >
        {triggerIcon ? <Icon name={triggerIcon} className="size-6" /> : null}
        <span>{triggerLabel}</span>
      </button>
      <dialog
        ref={dialogRef}
        aria-labelledby={titleId}
        onClose={close}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === event.currentTarget) close();
          // Following a link navigates away, so dismiss the sheet.
          if (event.target instanceof Element && event.target.closest("a"))
            close();
        }}
        className={[
          "fixed m-0 max-h-[85dvh] w-full max-w-none overflow-y-auto bg-surface p-0 text-text shadow-2xl backdrop:bg-black/50",
          "inset-x-0 top-auto bottom-0 rounded-t-lg pb-[env(safe-area-inset-bottom)]",
          side === "right"
            ? "tablet:inset-y-0 tablet:right-0 tablet:left-auto tablet:h-dvh tablet:max-h-none tablet:w-96 tablet:rounded-none tablet:rounded-l-lg"
            : "tablet:inset-y-0 tablet:right-auto tablet:left-0 tablet:h-dvh tablet:max-h-none tablet:w-96 tablet:rounded-none tablet:rounded-r-lg",
        ].join(" ")}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="inline-flex size-touch items-center justify-center rounded-full text-text-muted hover:bg-surface-muted hover:text-text"
          >
            <Icon name="close" className="size-6" />
          </button>
        </div>
        <div className="p-4">{children}</div>
      </dialog>
    </>
  );
}
