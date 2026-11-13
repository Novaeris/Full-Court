"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { STAFF_ROLES } from "@fullcourt/game-types";
import { STAFF_ROLE_INFO } from "@fullcourt/game-rules";
import type { StaffMember, StaffResponse } from "@fullcourt/validation";
import { Button } from "@/components/ui/button";

type ErrorBody = { error?: { message?: string } };

/** Thousands of dollars as "$2.17M". */
function money(thousands: number): string {
  return `$${(thousands / 1000).toFixed(2)}M`;
}

/**
 * Your team's staff and the staff market. Each role has one person; hiring
 * from the market replaces whoever holds the role, within the budget.
 */
export function StaffPanel({
  leagueId,
  staff,
}: {
  leagueId: string;
  staff: StaffResponse;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [years, setYears] = useState<Record<string, number>>({});

  async function send(method: "POST" | "DELETE", body: object, key: string) {
    setBusy(key);
    setError(null);
    try {
      const response = await fetch(`/api/v1/leagues/${leagueId}/staff`, {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const json: unknown = await response.json().catch(() => null);
      if (!response.ok) {
        setError(
          (json as ErrorBody | null)?.error?.message ??
            "Something went wrong. Please try again.",
        );
      } else {
        router.refresh();
      }
    } catch {
      setError("Couldn't reach the server. Try again.");
    }
    setBusy(null);
  }

  const byRole = new Map(staff.team.map((s) => [s.role, s]));
  const left = staff.budget - staff.payroll;

  function row(member: StaffMember, action: "hire" | "release") {
    const id = member.id;
    return (
      <li
        key={id}
        className="flex flex-wrap items-center justify-between gap-3 border-t border-border py-3 first:border-t-0"
      >
        <div className="min-w-0">
          <p className="font-semibold">
            {member.name}{" "}
            <span className="font-normal text-text-muted">
              · {member.rating} rating · age {member.age}
            </span>
          </p>
          <p className="text-sm text-text-muted">
            {money(member.salary)} a year
            {member.contractYears !== null
              ? ` · ${member.contractYears} ${member.contractYears === 1 ? "year" : "years"} left`
              : ""}
          </p>
        </div>
        {staff.open ? (
          action === "hire" ? (
            <div className="flex items-center gap-2">
              <label className="text-sm text-text-muted">
                <span className="sr-only">
                  Contract length for {member.name}
                </span>
                <select
                  className="min-h-touch rounded-md border border-border bg-surface px-2"
                  value={years[id] ?? 2}
                  onChange={(e) =>
                    setYears({ ...years, [id]: Number(e.target.value) })
                  }
                >
                  {[1, 2, 3].map((y) => (
                    <option key={y} value={y}>
                      {y} {y === 1 ? "year" : "years"}
                    </option>
                  ))}
                </select>
              </label>
              <Button
                variant="secondary"
                disabled={busy !== null}
                onClick={() =>
                  send(
                    "POST",
                    {
                      teamId: staff.teamId,
                      staffId: id,
                      years: years[id] ?? 2,
                    },
                    id,
                  )
                }
              >
                Hire
                <span className="sr-only"> {member.name}</span>
              </Button>
            </div>
          ) : (
            <Button
              variant="ghost"
              disabled={busy !== null}
              onClick={() =>
                send("DELETE", { teamId: staff.teamId, staffId: id }, id)
              }
            >
              Let go
              <span className="sr-only"> {member.name}</span>
            </Button>
          )
        ) : null}
      </li>
    );
  }

  return (
    <section
      aria-labelledby="staff-heading"
      className="rounded-lg border border-border bg-surface p-5"
    >
      <h2 id="staff-heading" className="text-xl font-bold">
        Staff
      </h2>
      <p className="mt-1 text-text-muted">
        Payroll {money(staff.payroll)} of {money(staff.budget)}; {money(left)}{" "}
        left to spend.
      </p>

      <h3 className="mt-5 font-bold">Your staff</h3>
      <ul>
        {STAFF_ROLES.map((role) => {
          const member = byRole.get(role);
          return member ? (
            <li key={role} className="border-t border-border first:border-t-0">
              <p className="pt-3 text-sm font-semibold text-text-muted">
                {STAFF_ROLE_INFO[role].label}: {STAFF_ROLE_INFO[role].effect}
              </p>
              <ul>{row(member, "release")}</ul>
            </li>
          ) : (
            <li
              key={role}
              className="border-t border-border py-3 first:border-t-0"
            >
              <p className="text-sm font-semibold text-text-muted">
                {STAFF_ROLE_INFO[role].label}: {STAFF_ROLE_INFO[role].effect}
              </p>
              <p>Vacant</p>
            </li>
          );
        })}
      </ul>

      <h3 className="mt-5 font-bold">The market</h3>
      {STAFF_ROLES.map((role) => {
        const members = staff.market.filter((m) => m.role === role);
        return (
          <div key={role} className="mt-2">
            <h4 className="text-sm font-semibold text-text-muted">
              {STAFF_ROLE_INFO[role].label}s
            </h4>
            {members.length > 0 ? (
              <ul>{members.map((m) => row(m, "hire"))}</ul>
            ) : (
              <p className="text-text-muted">Nobody on the market.</p>
            )}
          </div>
        );
      })}
      {error ? (
        <p role="alert" className="mt-3 font-semibold text-danger">
          {error}
        </p>
      ) : null}
    </section>
  );
}
