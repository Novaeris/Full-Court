import "server-only";
import { AWARD_NAMES } from "@fullcourt/game-rules";
import type { InboxItem, InboxResponse } from "@fullcourt/validation";
import { ApiError } from "@/server/api/handler";
import type { UserContext } from "@/server/auth/session";
import { getLeague, parseLeagueId } from "./leagues";
import { ownedTeams } from "./offseason-data";
import { latestSeason } from "./season-shared";

/**
 * What has happened to your team (docs/DESIGN.md, "The inbox"): worked out from
 * the league's own records when asked, so there is nothing extra to keep in step.
 * Newest first.
 */

/** The most each kind of record contributes. */
const EACH = 60;
/** The most items returned. */
const MOST = 80;

/** Awards that are the team's, not a player's, and the ones worth a line. */
const TEAM_AWARDS = new Set(["champion", "finalist"]);

type Draft = Omit<InboxItem, "id"> & { order: number };

export async function getInbox(
  ctx: UserContext,
  leagueIdParam: string,
  teamParam?: string,
): Promise<InboxResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const owned = await ownedTeams(ctx, league.id);
  const teamId = teamParam ?? owned[0]?.id ?? null;
  if (teamParam !== undefined && !owned.some((t) => t.id === teamParam)) {
    throw new ApiError(404, "team_not_found", "That isn't one of your teams.");
  }
  if (!teamId) return { teamId: null, items: [] };

  const season = await latestSeason(ctx, league.id);
  const base = `/leagues/${league.id}`;

  const [injuries, moves, trades, awards, offers, seasons, teams] =
    await Promise.all([
      ctx.supabase
        .from("player_injuries")
        .select("id, season_id, player_id, day, days, kind")
        .eq("league_id", league.id)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(EACH),
      ctx.supabase
        .from("player_transactions")
        .select("id, season_year, day, kind, player_id, salary, years")
        .eq("league_id", league.id)
        .eq("team_id", teamId)
        .neq("kind", "traded")
        .order("season_year", { ascending: false })
        .order("day", { ascending: false })
        .limit(EACH),
      ctx.supabase
        .from("trades")
        .select(
          "id, season_year, day, team_a, team_b, gave_a, gave_b, gave_picks_a, gave_picks_b",
        )
        .eq("league_id", league.id)
        .or(`team_a.eq.${teamId},team_b.eq.${teamId}`)
        .order("created_at", { ascending: false })
        .limit(EACH),
      ctx.supabase
        .from("season_awards")
        .select("id, season_id, award, team_id, player_id")
        .eq("league_id", league.id)
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .limit(EACH),
      season
        ? ctx.supabase
            .from("trade_offers")
            .select("id, day, partner_id, give, get")
            .eq("league_id", league.id)
            .eq("season_id", season.id)
            .eq("team_id", teamId)
            .eq("status", "open")
        : Promise.resolve({ data: [], error: null }),
      ctx.supabase
        .from("seasons")
        .select("id, year")
        .eq("league_id", league.id),
      ctx.supabase
        .from("teams")
        .select("id, city, nickname, abbreviation")
        .eq("league_id", league.id),
    ]);
  for (const r of [injuries, moves, trades, awards, offers, seasons, teams]) {
    if (r.error) throw r.error;
  }
  const yearOf = new Map(seasons.data?.map((s) => [s.id, s.year]));
  const teamName = (id: string | null) => {
    const t = teams.data?.find((x) => x.id === id);
    return t ? `${t.city} ${t.nickname}` : "another team";
  };

  // Everyone named in an item.
  const wanted = new Set<string>();
  for (const i of injuries.data ?? []) wanted.add(i.player_id);
  for (const m of moves.data ?? []) wanted.add(m.player_id);
  for (const t of trades.data ?? []) {
    for (const id of [...t.gave_a, ...t.gave_b]) wanted.add(id);
  }
  for (const a of awards.data ?? []) if (a.player_id) wanted.add(a.player_id);
  for (const o of offers.data ?? []) {
    for (const id of [...o.give, ...o.get]) wanted.add(id);
  }
  const names = new Map<string, string>();
  const ids = [...wanted];
  for (let i = 0; i < ids.length; i += 150) {
    const { data, error } = await ctx.supabase
      .from("players")
      .select("id, first_name, last_name, position")
      .eq("league_id", league.id)
      .in("id", ids.slice(i, i + 150));
    if (error) throw error;
    for (const p of data) {
      names.set(p.id, `${p.first_name} ${p.last_name} (${p.position})`);
    }
  }
  const who = (id: string) => names.get(id) ?? "A player";
  const list = (ids: readonly string[]) =>
    ids.length > 0 ? ids.map(who).join(", ") : "nobody";

  const items: Draft[] = [];
  const add = (item: Draft) => items.push(item);

  for (const i of injuries.data ?? []) {
    add({
      year: yearOf.get(i.season_id) ?? 0,
      day: i.day,
      kind: "injury",
      order: 3,
      text: `${who(i.player_id)} was hurt: ${i.kind}. Out ${i.days} ${i.days === 1 ? "day" : "days"}.`,
      href: `${base}/players/${i.player_id}`,
    });
  }

  const money = (salary: number | null) =>
    salary === null ? "" : ` for $${(salary / 1000).toFixed(1)}M`;
  for (const m of moves.data ?? []) {
    const player = who(m.player_id);
    const text =
      m.kind === "drafted"
        ? `You drafted ${player}.`
        : m.kind === "signed"
          ? `You signed ${player}${money(m.salary)}${m.years ? ` for ${m.years} ${m.years === 1 ? "year" : "years"}` : ""}.`
          : m.kind === "re-signed"
            ? `You re-signed ${player}${money(m.salary)}${m.years ? ` for ${m.years} ${m.years === 1 ? "year" : "years"}` : ""}.`
            : m.kind === "released"
              ? `You released ${player}.`
              : `${player}'s contract ended.`;
    add({
      year: m.season_year,
      day: m.day,
      kind: "move",
      order: 2,
      text,
      href: `${base}/players/${m.player_id}`,
    });
  }

  for (const t of trades.data ?? []) {
    const mine = t.team_a === teamId;
    const gave = mine ? t.gave_a : t.gave_b;
    const got = mine ? t.gave_b : t.gave_a;
    const gavePicks = (mine ? t.gave_picks_a : t.gave_picks_b).length;
    const gotPicks = (mine ? t.gave_picks_b : t.gave_picks_a).length;
    const picks = (n: number) =>
      n > 0 ? ` and ${n} draft ${n === 1 ? "pick" : "picks"}` : "";
    add({
      year: t.season_year,
      day: t.day,
      kind: "trade",
      order: 4,
      text: `Trade with ${teamName(mine ? t.team_b : t.team_a)}: you gave ${list(gave)}${picks(gavePicks)} and got ${list(got)}${picks(gotPicks)}.`,
      href: `${base}/moves`,
    });
  }

  for (const a of awards.data ?? []) {
    const year = yearOf.get(a.season_id) ?? 0;
    const label = AWARD_NAMES[a.award] ?? a.award;
    if (a.player_id) {
      add({
        year,
        // The awards come after the season's games.
        day: 998,
        kind: "award",
        order: 1,
        text: `${who(a.player_id)} won ${label.toLowerCase()}.`,
        href: `${base}/history`,
      });
    } else if (TEAM_AWARDS.has(a.award)) {
      add({
        year,
        day: 999,
        kind: "award",
        order: 0,
        text:
          a.award === "champion"
            ? "Your team won the championship."
            : "Your team reached the finals.",
        href: `${base}/history`,
      });
    }
  }

  for (const o of offers.data ?? []) {
    add({
      year: season?.year ?? 0,
      day: o.day,
      kind: "offer",
      order: 5,
      text: `${teamName(o.partner_id)} offers ${list(o.get)} for ${list(o.give)}. Accept or decline it on the Moves page.`,
      href: `${base}/moves`,
    });
  }

  // A reminder that contracts end, while there is still time to act on it.
  if (season && season.phase !== "offseason") {
    const ending = await ctx.supabase
      .from("players")
      .select("id, first_name, last_name, position")
      .eq("league_id", league.id)
      .eq("team_id", teamId)
      .eq("status", "active")
      .eq("contract_expires", season.year);
    if (ending.error) throw ending.error;
    if (ending.data.length > 0) {
      add({
        year: season.year,
        day: 1000,
        kind: "reminder",
        order: 6,
        text: `${ending.data.length} ${ending.data.length === 1 ? "contract ends" : "contracts end"} after this season: ${ending.data
          .map((p) => `${p.first_name} ${p.last_name} (${p.position})`)
          .join(", ")}.`,
        href: `${base}/roster`,
      });
    }
  }

  items.sort((a, b) => b.year - a.year || b.day - a.day || b.order - a.order);
  return {
    teamId,
    items: items.slice(0, MOST).map(({ order: _order, ...item }, i) => ({
      ...item,
      id: `${item.kind}-${i}`,
    })),
  };
}
