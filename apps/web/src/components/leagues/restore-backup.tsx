"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

type ErrorBody = { error?: { message?: string } };

/** Packs text the way the server unpacks it, so a big league stays small on the wire. */
async function gzip(text: string): Promise<Blob> {
  const stream = new Blob([text])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  return new Response(stream).blob();
}

/** Restores a league from a backup file (the one Settings downloads). */
export function RestoreBackup() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function restore() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/v1/leagues/import", {
        method: "POST",
        headers: { "content-type": "application/gzip" },
        body: await gzip(await file.text()),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
        return;
      }
      router.push(`/leagues/${(json as { id: string }).id}`);
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="restore-heading"
      className="mt-10 max-w-prose rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="restore-heading" className="text-xl font-bold">
        Restore a backup
      </h2>
      <p className="mt-1 text-text-muted">
        Choose a backup file you downloaded from a league&apos;s settings. It
        comes back as a new league, so the original is left as it is.
      </p>
      <div className="mt-3 flex flex-col gap-3">
        <label className="flex flex-col gap-1 font-semibold">
          Backup file
          <input
            type="file"
            accept=".json,application/json"
            className="min-h-touch font-normal"
            disabled={busy}
            onChange={(e) => {
              setError(null);
              setFile(e.target.files?.[0] ?? null);
            }}
          />
        </label>
        <div>
          <Button disabled={busy || !file} onClick={() => void restore()}>
            {busy ? "Restoring…" : "Restore this backup"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="font-semibold text-danger">
            {error}
          </p>
        ) : null}
      </div>
    </section>
  );
}
