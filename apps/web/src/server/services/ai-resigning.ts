import "server-only";
import {
  askingSalary,
  askingYears,
  extensionFactor,
  hardCeiling,
  maxYearsFor,
  minimumExtension,
  playerPriorities,
  playerValue,
  resignTeam,
  roleScore,
  type ExpiringPlayer,
} from "@fullcourt/game-rules";
import { extendContract } from "@/server/admin/offseason";
import type { UserContext } from "@/server/auth/session";
import {
  loadPayrollPlayers,
  payrolls,
  rosterValues,
  teamAppeals,
} from "./finance";
import { allRows, ownedTeams } from "./offseason-data";
import type { SeasonRow } from "./season-shared";

/**
 * Computer teams re-signing their own players (docs/DESIGN.md, "Computer
 * teams re-sign players"). It runs once, when a season has been archived and
 * before its contracts end: each computer team decides, best player first,
 * which players whose contracts end with that season it keeps, and a player
 * who agrees (by the same rule an owner's extension uses) signs a longer one.
 *
 * Returns how many were re-signed.
 */

/** A computer team re-signs only while its payroll stays within this share of the cap. */
const PAYROLL_LIMIT = 1.1;

export async function resignComputerPlayers(
  ctx: UserContext,
  leagueId: string,
  finished: SeasonRow,
): Promise<number> {
  const cap = finished.salary_cap;
  const [rows, everyone, owned] = await Promise.all([
    allRows((from, to) =>
      ctx.supabase
        .from("players")
        .select(
          "id, team_id, age, overall, potential, salary, contract_expires",
        )
        .eq("league_id", leagueId)
        .eq("status", "active")
        .not("team_id", "is", null)
        .eq("contract_expires", finished.year)
        .order("id")
        .range(from, to),
    ),
    loadPayrollPlayers(ctx, leagueId),
    ownedTeams(ctx, leagueId),
  ]);
  if (rows.length === 0) return 0;
  // How teams look to their players is judged as it is in the free agency that
  // follows: from the season that has just ended.
  const appeals = await teamAppeals(ctx, leagueId, {
    ...finished,
    year: finished.year + 1,
  }).catch(() => new Map());
  const values = rosterValues(everyone);
  const payroll = payrolls(everyone);
  const ownedIds = new Set(owned.map((t) => t.id));
  const limit = Math.min(Math.round(cap * PAYROLL_LIMIT), hardCeiling(cap));

  const byTeam = new Map<string, typeof rows>();
  for (const r of rows) {
    const team = String(r.team_id);
    if (ownedIds.has(team)) continue;
    byTeam.set(team, [...(byTeam.get(team) ?? []), r]);
  }

  let signed = 0;
  for (const [teamId, expiring] of [...byTeam].sort(([a], [b]) =>
    a.localeCompare(b),
  )) {
    const base = appeals.get(teamId) ?? {
      winning: 0.5,
      market: 0.5,
      history: 0.5,
    };
    const roster = values.get(teamId) ?? [];
    const candidates: ExpiringPlayer[] = expiring.map((p) => {
      const age = Number(p.age);
      const overall = Number(p.overall);
      const potential = Number(p.potential);
      const value = playerValue(overall, potential, age);
      const ask = askingSalary({ overall, potential, age }, cap);
      const appeal = {
        ...base,
        role: roleScore(value, roster),
        // He already plays here, which counts for the team's history.
        history: Math.min(1, base.history + 0.3),
      };
      const priorities = playerPriorities(String(p.id));
      return {
        id: String(p.id),
        age,
        overall,
        potential,
        salary: Number(p.salary),
        // 1 is the team's best player by value (ties by id, so the order is fixed).
        rank: roster.filter((v) => v > value).length + 1,
        ask,
        askYears: askingYears(age),
        maxYears: Math.min(maxYearsFor(age), 5),
        minimum:
          extensionFactor(priorities, appeal) > 0
            ? minimumExtension(ask, priorities, appeal)
            : Number.POSITIVE_INFINITY,
      };
    });
    for (const offer of resignTeam(
      candidates,
      payroll.get(teamId) ?? 0,
      limit,
      cap,
    )) {
      try {
        await extendContract({
          seasonId: finished.id,
          playerId: offer.id,
          salary: offer.salary,
          years: offer.years,
        });
        signed += 1;
      } catch (error) {
        // A refusal (say, the hard ceiling) leaves the contract to run out.
        console.error("Computer re-signing refused", {
          leagueId,
          player: offer.id,
          error,
        });
      }
    }
  }
  return signed;
}
