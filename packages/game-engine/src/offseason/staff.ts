import {
  STAFF_BUDGET,
  STAFF_CONTRACT_YEARS,
  STAFF_RATING_MAX,
  STAFF_RATING_MIN,
  STAFF_RETIREMENT_AGE,
  STAFF_ROLES,
  staffSalary,
  type StaffRole,
} from "@fullcourt/game-rules";
import { normalSum } from "../rng/helpers";
import type { Rng } from "../rng/rng";
import { uniqueName } from "../world/generate";

/**
 * Coaches and scouts: how a league's staff is first made, how it ages and
 * turns over each offseason, and whom the computer teams hire.
 */

export type StaffMember = {
  id: string;
  firstName: string;
  lastName: string;
  role: StaffRole;
  rating: number;
  age: number;
  /** Thousands of dollars a year. */
  salary: number;
  /** null on the market. */
  teamId: string | null;
  contractYears: number | null;
  retired: boolean;
};

/** A new staff member before he has a database id. */
export type NewStaff = Omit<StaffMember, "id" | "retired">;

/** Each role has at least this many people on the market. */
export const MARKET_PER_ROLE = 6;

function newMember(
  rng: Rng,
  role: StaffRole,
  mean: number,
  teamId: string | null,
  taken: Set<string>,
): NewStaff {
  const rating = Math.round(
    Math.min(
      STAFF_RATING_MAX,
      Math.max(STAFF_RATING_MIN, normalSum(rng, mean, 12)),
    ),
  );
  return {
    ...uniqueName(rng, taken),
    role,
    rating,
    age: rng.int(34, 62),
    salary: staffSalary(rating),
    teamId,
    contractYears:
      teamId === null
        ? null
        : rng.int(STAFF_CONTRACT_YEARS.min, STAFF_CONTRACT_YEARS.max),
  };
}

/**
 * A league's first staff: every team has one of each role, within its budget,
 * and each role has a market of free agents. `taken` holds names already used.
 */
export function generateStaff(
  rng: Rng,
  teams: readonly string[],
  taken: Set<string>,
): NewStaff[] {
  const out: NewStaff[] = [];
  for (const team of teams) {
    const members = STAFF_ROLES.map((role) =>
      newMember(rng, role, 55, team, taken),
    );
    // Over budget: trim the best-paid until the team fits.
    while (members.reduce((s, m) => s + m.salary, 0) > STAFF_BUDGET) {
      const top = members.reduce((a, b) => (b.rating > a.rating ? b : a));
      top.rating -= 3;
      top.salary = staffSalary(top.rating);
    }
    out.push(...members);
  }
  out.push(...replenishMarket(rng, [], taken));
  return out;
}

/** Enough new free agents that every role has MARKET_PER_ROLE people to choose from. */
export function replenishMarket(
  rng: Rng,
  market: readonly Pick<StaffMember, "role">[],
  taken: Set<string>,
): NewStaff[] {
  const out: NewStaff[] = [];
  for (const role of STAFF_ROLES) {
    const have = market.filter((m) => m.role === role).length;
    for (let i = have; i < MARKET_PER_ROLE; i++) {
      out.push(newMember(rng, role, 52, null, taken));
    }
  }
  return out;
}

/**
 * A year older. Staff of retirement age retire. A contract with a year left
 * runs down; one that ends puts the person back on the market. Returns only
 * the people who changed.
 */
export function ageStaff(
  rng: Rng,
  staff: readonly StaffMember[],
): StaffMember[] {
  const changed: StaffMember[] = [];
  for (const s of staff) {
    if (s.retired) continue;
    const age = s.age + 1;
    // Someone left unemployed for a while may give up before the age limit.
    const quits = s.teamId === null && rng.next() < 0.1;
    if (age >= STAFF_RETIREMENT_AGE || quits) {
      changed.push({
        ...s,
        age,
        retired: true,
        teamId: null,
        contractYears: null,
      });
    } else if (s.teamId !== null && (s.contractYears ?? 1) <= 1) {
      changed.push({ ...s, age, teamId: null, contractYears: null });
    } else if (s.teamId !== null) {
      changed.push({ ...s, age, contractYears: (s.contractYears ?? 1) - 1 });
    }
  }
  return changed;
}

/** What a team has already spent on staff. */
export function staffPayroll(
  staff: readonly Pick<StaffMember, "teamId" | "salary" | "retired">[],
  teamId: string,
): number {
  return staff
    .filter((s) => s.teamId === teamId && !s.retired)
    .reduce((sum, s) => sum + s.salary, 0);
}

/**
 * The computer teams fill their empty roles: each takes the best person it can
 * afford from the market, teams in order (worst record first, so the weaker
 * teams choose first). Returns who was hired and for how long.
 */
export function hireStaff(
  rng: Rng,
  input: {
    /** The teams that hire, worst record first. */
    teams: readonly string[];
    staff: readonly StaffMember[];
    /**
     * The most a team may spend on staff in all, where that is less than the
     * usual budget: a team with its players near the hard ceiling can hire less.
     */
    limit?: ReadonlyMap<string, number>;
  },
): { id: string; teamId: string; contractYears: number }[] {
  const hires: { id: string; teamId: string; contractYears: number }[] = [];
  const taken = new Set<string>();
  const market = input.staff.filter((s) => s.teamId === null && !s.retired);
  for (const team of input.teams) {
    const filled = new Set(
      input.staff
        .filter((s) => s.teamId === team && !s.retired)
        .map((s) => s.role),
    );
    let spent = staffPayroll(input.staff, team);
    for (const role of STAFF_ROLES) {
      if (filled.has(role)) continue;
      const best = market
        .filter(
          (m) =>
            m.role === role &&
            !taken.has(m.id) &&
            spent + m.salary <=
              Math.min(STAFF_BUDGET, input.limit?.get(team) ?? STAFF_BUDGET),
        )
        .sort((a, b) => b.rating - a.rating || a.id.localeCompare(b.id))[0];
      if (!best) continue;
      taken.add(best.id);
      spent += best.salary;
      hires.push({
        id: best.id,
        teamId: team,
        contractYears: rng.int(
          STAFF_CONTRACT_YEARS.min,
          STAFF_CONTRACT_YEARS.max,
        ),
      });
    }
  }
  return hires;
}
