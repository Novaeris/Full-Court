"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { gzip } from "./backup-file";

type ErrorBody = { error?: { message?: string } };

/**
 * Restores a backup over this league. It replaces the league (the old one is
 * removed once the backup has been restored), so it has to be confirmed by
 * typing the league's name.
 */
export function ReplaceLeagueForm({
  leagueId,
  name,
}: {
  leagueId: string;
  name: string;
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function replace() {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/leagues/${leagueId}/restore`, {
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
    <div className="flex flex-col gap-4">
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
      <label className="flex flex-col gap-1 font-semibold">
        Type the league&apos;s name to confirm
        <input
          type="text"
          value={confirm}
          autoComplete="off"
          disabled={busy}
          onChange={(e) => setConfirm(e.target.value)}
          className="min-h-touch rounded-md border border-text-muted bg-surface px-3 font-normal"
        />
      </label>
      <div>
        <Button
          variant="danger"
          disabled={busy || !file || confirm !== name}
          onClick={() => void replace()}
        >
          {busy ? "Restoring…" : "Replace this league"}
        </Button>
      </div>
      {error ? (
        <p role="alert" className="font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
