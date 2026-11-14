import "server-only";
import { AWARD_NAMES } from "@fullcourt/game-rules";
import type { NewsItem, NewsResponse } from "@fullcourt/validation";
import type { UserContext } from "@/server/auth/session";
import { getHallOfFame } from "./hall-of-fame";
import { getLeague, parseLeagueId } from "./leagues";

/**
 * What has happened around the league (docs/DESIGN.md, "League news"): the
 * moves every team makes, worked out from the league's own records when asked,
 * the same records for every team (the owner's included), newest first.
 */

/** The most each kind of record contributes. */
const EACH = 60;
/** The most items returned. */
const MOST = 100;
/** An injury is news from this many days out. */
const BIG_INJURY_DAYS = 21;

type Draft = Omit<NewsItem, "id"> & { order: number };

export async function getNews(
  ctx: UserContext,
  leagueIdParam: string,
): Promise<NewsResponse> {
  const league = await getLeague(ctx, parseLeagueId(leagueIdParam));
  const base = `/leagues/${league.id}`;

  const [moves, trades, injuries, retired, awards, seasons, teams, hall] =
    await Promise.all([
      ctx.supabase
        .from("player_transactions")
        .select("season_year, day, kind, player_id, team_id, salary, years")
        .eq("league_id", league.id)
        .in("kind", ["signed", "re-signed", "extended", "released"])
        .order("season_year", { ascending: false })
        .order("day", { ascending: false })
        .order("id", { ascending: false })
        .limit(EACH),
      ctx.supabase
        .from("trades")
        .select(
          "season_year, day, team_a, team_b, gave_a, gave_b, gave_picks_a, gave_picks_b",
        )
        .eq("league_id", league.id)
        .order("created_at", { ascending: false })
        .limit(EACH),
      ctx.supabase
        .from("player_injuries")
        .select("season_id, player_id, team_id, day, days, kind")
        .eq("league_id", league.id)
        .gte("days", BIG_INJURY_DAYS)
        .order("created_at", { ascending: false })
        .limit(EACH),
      ctx.supabase
        .from("players")
        .select("id, first_name, last_name, position, retired_year")
        .eq("league_id", league.id)
        .eq("status", "retired")
        .not("retired_year", "is", null)
        .order("retired_year", { ascending: false })
        .order("overall", { ascending: false })
        .limit(20),
      ctx.supabase
        .from("season_awards")
        .select("season_id, award, team_id, player_id")
        .eq("league_id", league.id)
        .in("award", ["champion", "mvp"])
        .order("created_at", { ascending: false })
        .limit(EACH),
      ctx.supabase
        .from("seasons")
        .select("id, year")
        .eq("league_id", league.id),
      ctx.supabase
        .from("teams")
        .select("id, city, nickname")
        .eq("league_id", league.id),
      getHallOfFame(ctx, league.id),
    ]);
  for (const r of [moves, trades, injuries, retired, awards, seasons, teams]) {
    if (r.error) throw r.error;
  }
  const yearOf = new Map(seasons.data?.map((s) => [s.id, s.year]));
  const teamName = (id: string | null) => {
    const t = teams.data?.find((x) => x.id === id);
    return t ? `${t.city} ${t.nickname}` : "A team";
  };

  const wanted = new Set<string>();
  for (const m of moves.data ?? []) wanted.add(m.player_id);
  for (const t of trades.data ?? []) {
    for (const id of [...t.gave_a, ...t.gave_b]) wanted.add(id);
  }
  for (const i of injuries.data ?? []) wanted.add(i.player_id);
  for (const a of awards.data ?? []) if (a.player_id) wanted.add(a.player_id);
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
  const list = (players: readonly string[]) =>
    players.length > 0 ? players.map(who).join(", ") : "nobody";
  const years = (n: number | null) =>
    n ? ` for ${n} ${n === 1 ? "year" : "years"}` : "";
  const money = (salary: number | null) =>
    salary === null ? "" : ` at $${(salary / 1000).toFixed(1)}M`;

  const items: Draft[] = [];
  const add = (item: Draft) => items.push(item);

  for (const m of moves.data ?? []) {
    const team = teamName(m.team_id);
    const player = who(m.player_id);
    const verb =
      m.kind === "signed"
        ? "signed"
        : m.kind === "re-signed"
          ? "re-signed"
          : "extended";
    add({
      year: m.season_year,
      day: m.day,
      kind: "move",
      order: 2,
      text:
        m.kind === "released"
          ? `${team} released ${player}.`
          : `${team} ${verb} ${player}${money(m.salary)}${years(m.years)}.`,
      href: `${base}/players/${m.player_id}`,
    });
  }

  for (const t of trades.data ?? []) {
    const picks = (n: number) =>
      n > 0 ? ` and ${n} draft ${n === 1 ? "pick" : "picks"}` : "";
    add({
      year: t.season_year,
      day: t.day,
      kind: "trade",
      order: 3,
      text: `${teamName(t.team_a)} traded ${list(t.gave_a)}${picks(t.gave_picks_a.length)} to ${teamName(t.team_b)} for ${list(t.gave_b)}${picks(t.gave_picks_b.length)}.`,
      href: `${base}/teams/${t.team_a}`,
    });
  }

  for (const i of injuries.data ?? []) {
    add({
      year: yearOf.get(i.season_id) ?? 0,
      day: i.day,
      kind: "injury",
      order: 4,
      text: `${who(i.player_id)} of ${teamName(i.team_id)} was hurt: ${i.kind}. Out ${i.days} days.`,
      href: `${base}/players/${i.player_id}`,
    });
  }

  for (const p of retired.data ?? []) {
    add({
      year: p.retired_year as number,
      day: 998,
      kind: "retirement",
      order: 1,
      text: `${p.first_name} ${p.last_name} (${p.position}) retired.`,
      href: `${base}/players/${p.id}`,
    });
  }

  for (const a of awards.data ?? []) {
    const year = yearOf.get(a.season_id) ?? 0;
    if (a.award === "champion") {
      add({
        year,
        day: 999,
        kind: "award",
        order: 0,
        text: `${teamName(a.team_id)} won the championship.`,
        href: `${base}/history`,
      });
    } else if (a.player_id) {
      add({
        year,
        day: 998,
        kind: "award",
        order: 1,
        text: `${who(a.player_id)} of ${teamName(a.team_id)} was named ${(AWARD_NAMES[a.award] ?? a.award).toLowerCase()}.`,
        href: `${base}/history`,
      });
    }
  }

  // Inductions come with the new season, before its first game.
  for (const m of hall.members) {
    add({
      year: m.inductedYear,
      day: 0,
      kind: "award",
      order: 1,
      text: `${m.name} (${m.position}) was inducted into the Hall of Fame.`,
      href: `${base}/hall-of-fame`,
    });
  }

  items.sort((a, b) => b.year - a.year || b.day - a.day || b.order - a.order);
  return {
    items: items.slice(0, MOST).map(({ order: _order, ...item }, i) => ({
      ...item,
      id: `${item.kind}-${i}`,
    })),
  };
}
