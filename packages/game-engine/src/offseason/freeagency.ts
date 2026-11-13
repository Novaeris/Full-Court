import type { Position } from "@fullcourt/game-types";
import {
  ROSTER_LIMITS,
  acceptChance,
  askingSalary,
  askingYears,
  hardCeiling,
  maxSalary,
  maxYearsFor,
  minSalary,
  effectiveSalary,
  playerPriorities,
  playerValue,
  roleScore,
  signingRoute,
  type SigningRoute,
} from "@fullcourt/game-rules";
import { shuffle } from "../rng/helpers";
import type { Rng } from "../rng/rng";

/**
 * Free agency, a day at a time (docs/DESIGN.md, "Free agency day by day").
 * Pure: the day's state goes in and what happened comes out. Computer teams
 * make and raise offers, then free agents decide, the best first. Every
 * signing is checked against the cap rules as the day goes, so a team never
 * ends the day over the hard ceiling or with more than 15 players.
 */

export type FaPlayer = {
  id: string;
  position: Position;
  age: number;
  overall: number;
  potential: number;
  /** The team that had him under contract: it holds his re-signing rights. */
  rightsTeamId: string | null;
};

export type FaTeam = {
  id: string;
  /** Player salaries. Staff are paid from their own budget and don't count. */
  payroll: number;
  /** The positions of the players under contract. */
  positions: readonly Position[];
  mleUsed: boolean;
  /** True when the AI makes this team's offers (a computer team, or an owner's on AI Assist). */
  acting: boolean;
  /** How the team looks to a free agent: recent winning, the city and franchise history, each 0 to 1. */
  winning: number;
  market: number;
  history: number;
  /** The value of every player under contract, best first (for the role he would have). */
  values: readonly number[];
};

export type FaOffer = {
  id: string;
  playerId: string;
  teamId: string;
  salary: number;
  years: number;
};

export type FaSigning = {
  /** An existing offer's id, or `new:n` for an offer made today. */
  offerRef: string;
  playerId: string;
  teamId: string;
  salary: number;
  years: number;
  route: SigningRoute;
};

export type FaDayResult = {
  /** Offers the computer teams made today; `ref` is what a signing calls them. */
  newOffers: {
    ref: string;
    playerId: string;
    teamId: string;
    salary: number;
    years: number;
  }[];
  /** Offers a computer team raised. */
  raised: { offerId: string; salary: number }[];
  signings: FaSigning[];
  /** Offers that ended today: signed elsewhere, or void because they no longer fit. */
  lapsed: { offerRef: string; reason: "signed-elsewhere" | "void" }[];
};

const OFFERS_PER_TEAM_PER_DAY = 2;
const PENDING_OFFERS_PER_TEAM = 4;
const RAISE_CHANCE = 0.25;
const RAISE_BY = 1.04;

const round10 = (n: number) => Math.round(n / 10) * 10;

/** Plays one day of free agency. */
export function simulateFreeAgencyDay(
  rng: Rng,
  input: {
    day: number;
    cap: number;
    players: readonly FaPlayer[];
    teams: readonly FaTeam[];
    /** Offers still waiting for an answer, the owner's and the computer's. */
    offers: readonly FaOffer[];
  },
): FaDayResult {
  const { cap, day } = input;
  const min = minSalary(cap);
  const max = maxSalary(cap);
  const teams = new Map(
    input.teams.map((t) => [
      t.id,
      {
        ...t,
        positions: [...t.positions],
        values: [...t.values],
        payroll: t.payroll,
        mleUsed: t.mleUsed,
      },
    ]),
  );
  const byPlayer = new Map(input.players.map((p) => [p.id, p]));
  const ask = new Map(
    input.players.map((p) => [p.id, askingSalary(p, cap)] as const),
  );
  const open = new Set(input.players.map((p) => p.id));

  type Pending = FaOffer & { ref: string; fromAi: boolean };
  const pending: Pending[] = input.offers.map((o) => ({
    ...o,
    ref: o.id,
    fromAi: teams.get(o.teamId)?.acting ?? false,
  }));
  const result: FaDayResult = {
    newOffers: [],
    raised: [],
    signings: [],
    lapsed: [],
  };

  const route = (teamId: string, playerId: string, salary: number) => {
    const team = teams.get(teamId);
    const player = byPlayer.get(playerId);
    if (!team || !player) return null;
    return signingRoute({
      payroll: team.payroll,
      salary,
      cap,
      rights: player.rightsTeamId === teamId,
      mleAvailable: !team.mleUsed,
    });
  };
  // A computer team uses its cap room up to the cap, like any team. Past the
  // cap it can only use the exceptions, and it keeps well under the hard
  // ceiling (110% of the cap for an exception, and room for the minimum
  // contracts it will need to fill its roster when free agency ends).
  const aiOk = (teamId: string, playerId: string, salary: number) => {
    const taken = route(teamId, playerId, salary);
    if (!taken) return false;
    const payroll = teams.get(teamId)?.payroll ?? 0;
    if (taken === "minimum")
      return payroll + salary <= hardCeiling(cap) - 4 * min;
    if (taken === "room") return true;
    return payroll + salary <= Math.round(cap * 1.1);
  };
  const priorities = new Map(
    input.players.map((p) => [p.id, playerPriorities(p.id)] as const),
  );
  /** What an offer is worth to the player: the salary, adjusted for how the team looks to him. */
  const worth = (playerId: string, teamId: string, salary: number) => {
    const team = teams.get(teamId);
    const player = byPlayer.get(playerId);
    if (!team || !player) return salary;
    return effectiveSalary(salary, priorities.get(playerId)!, {
      winning: team.winning,
      role: roleScore(
        playerValue(player.overall, player.potential, player.age),
        team.values,
      ),
      market: team.market,
      history: Math.min(
        1,
        team.history + (player.rightsTeamId === teamId ? 0.3 : 0),
      ),
    });
  };
  const rosterSize = (teamId: string) =>
    teams.get(teamId)?.positions.length ?? 0;
  const valueOf = (p: FaPlayer) => playerValue(p.overall, p.potential, p.age);

  // 1. The computer teams raise some of their offers.
  for (const offer of pending.filter((o) => o.fromAi)) {
    if (rng.next() >= RAISE_CHANCE) continue;
    const raised = Math.min(max, round10(offer.salary * RAISE_BY));
    if (raised > offer.salary && aiOk(offer.teamId, offer.playerId, raised)) {
      offer.salary = raised;
      result.raised.push({ offerId: offer.id, salary: raised });
    }
  }

  // 2. The computer teams make new offers, in a different order each day.
  for (const team of shuffle(
    rng,
    input.teams.filter((t) => t.acting),
  )) {
    const state = teams.get(team.id);
    if (!state) continue;
    const have = pending.filter((o) => o.teamId === team.id);
    if (have.length >= PENDING_OFFERS_PER_TEAM) continue;
    const room = ROSTER_LIMITS.max - rosterSize(team.id) - have.length;
    if (room <= 0) continue;

    const counts = (position: Position) =>
      state.positions.filter((p) => p === position).length;
    const targets = [...open]
      .map((id) => byPlayer.get(id) as FaPlayer)
      .filter(
        (p) =>
          valueOf(p) >= 50 &&
          !pending.some((o) => o.teamId === team.id && o.playerId === p.id),
      )
      .map((p) => ({
        p,
        // The best player the team can use: for a position of need, for a
        // price it can pay, and one who will like the team (a player who
        // would value its offer above his asking price is worth chasing).
        score:
          valueOf(p) -
          counts(p.position) * 3 -
          (ask.get(p.id) as number) / 6000 +
          (p.rightsTeamId === team.id ? 6 : 0) +
          (worth(p.id, team.id, ask.get(p.id) as number) /
            (ask.get(p.id) as number) -
            1) *
            25,
      }))
      .sort((a, b) => b.score - a.score || a.p.id.localeCompare(b.p.id));

    let made = 0;
    for (const { p } of targets) {
      if (made >= Math.min(OFFERS_PER_TEAM_PER_DAY, room)) break;
      const base = ask.get(p.id) as number;
      const factor =
        p.rightsTeamId === team.id
          ? 1 + rng.next() * 0.06
          : 0.95 + rng.next() * 0.15;
      let salary = Math.min(max, Math.max(min, round10(base * factor)));
      if (!aiOk(team.id, p.id, salary)) {
        // Can't afford his price: try a minimum deal for a player who would take one.
        if (base <= min * 1.3 && aiOk(team.id, p.id, min)) salary = min;
        else continue;
      }
      const years = Math.min(
        maxYearsFor(p.age),
        Math.max(1, askingYears(p.age) + (rng.next() < 0.3 ? 1 : 0)),
      );
      const ref = `new:${result.newOffers.length}`;
      result.newOffers.push({
        ref,
        playerId: p.id,
        teamId: team.id,
        salary,
        years,
      });
      pending.push({
        id: ref,
        ref,
        playerId: p.id,
        teamId: team.id,
        salary,
        years,
        fromAi: true,
      });
      made += 1;
    }
  }

  // 3. Free agents decide, the best first.
  const byValue = [...open]
    .map((id) => byPlayer.get(id) as FaPlayer)
    .filter((p) => pending.some((o) => o.playerId === p.id))
    .sort((a, b) => valueOf(b) - valueOf(a) || a.id.localeCompare(b.id));
  for (const player of byValue) {
    const offers = pending
      .filter((o) => o.playerId === player.id)
      .sort(
        (a, b) =>
          worth(player.id, b.teamId, b.salary) -
            worth(player.id, a.teamId, a.salary) || a.ref.localeCompare(b.ref),
      );
    const price = ask.get(player.id) as number;
    for (const offer of offers) {
      // What the offer is worth to him, not just what it pays.
      const ratio = worth(player.id, offer.teamId, offer.salary) / price;
      if (rng.next() >= acceptChance(ratio, day)) break;
      const taken = route(offer.teamId, player.id, offer.salary);
      if (!taken || rosterSize(offer.teamId) >= ROSTER_LIMITS.max) {
        result.lapsed.push({ offerRef: offer.ref, reason: "void" });
        pending.splice(pending.indexOf(offer), 1);
        continue;
      }
      const team = teams.get(offer.teamId)!;
      team.payroll += offer.salary;
      team.positions.push(player.position);
      team.values = [...team.values, valueOf(player)].sort((a, b) => b - a);
      if (taken === "mle") team.mleUsed = true;
      open.delete(player.id);
      result.signings.push({
        offerRef: offer.ref,
        playerId: player.id,
        teamId: offer.teamId,
        salary: offer.salary,
        years: offer.years,
        route: taken,
      });
      for (const other of pending.filter(
        (o) => o.playerId === player.id && o !== offer,
      )) {
        result.lapsed.push({ offerRef: other.ref, reason: "signed-elsewhere" });
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i]?.playerId === player.id) pending.splice(i, 1);
      }
      break;
    }
  }

  // Offers that no longer fit anyone's roster (the team filled up) lapse too.
  for (let i = pending.length - 1; i >= 0; i--) {
    const offer = pending[i] as Pending;
    if (rosterSize(offer.teamId) >= ROSTER_LIMITS.max) {
      result.lapsed.push({ offerRef: offer.ref, reason: "void" });
      pending.splice(i, 1);
    }
  }
  return result;
}

/**
 * Contracts for a league that has none: every player gets a salary near his
 * asking price and a length that suits his age, and each team's total is then
 * scaled to a payroll between 85% and 105% of the cap, so teams
 * differ: some have room to spend, some are up against the cap.
 */
export function generateContracts(
  rng: Rng,
  input: {
    cap: number;
    /** The season the contracts are for (the first year of the contract). */
    year: number;
    players: readonly {
      id: string;
      teamId: string;
      age: number;
      overall: number;
      potential: number;
    }[];
  },
): { id: string; salary: number; expires: number }[] {
  const { cap, year } = input;
  const min = minSalary(cap);
  const max = maxSalary(cap);
  const out: { id: string; salary: number; expires: number }[] = [];
  const teams = new Map<string, typeof input.players>();
  for (const p of input.players) {
    teams.set(p.teamId, [...(teams.get(p.teamId) ?? []), p]);
  }
  for (const roster of teams.values()) {
    const raw = roster.map((p) => ({
      p,
      salary: askingSalary(p, cap) * (0.9 + rng.next() * 0.2),
    }));
    const total = raw.reduce((s, r) => s + r.salary, 0);
    const target = Math.max(
      min * roster.length,
      cap * (0.85 + rng.next() * 0.2),
    );
    const scale = target / total;
    for (const { p, salary } of raw) {
      const years = Math.max(
        1,
        Math.min(maxYearsFor(p.age), askingYears(p.age) + rng.int(-1, 1)),
      );
      out.push({
        id: p.id,
        salary: Math.min(max, Math.max(min, round10(salary * scale))),
        expires: year + years - 1,
      });
    }
  }
  return out;
}
