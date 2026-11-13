/**
 * End-to-end check of the simulation path against a local Supabase:
 *
 *   league -> season -> owner queues a job -> worker plays it -> results.
 *
 * Needs `supabase start`. Set SUPABASE_URL, SUPABASE_SECRET_KEY and
 * SUPABASE_PUBLISHABLE_KEY (from `supabase status -o env`), then run
 * `pnpm --filter @fullcourt/worker smoke`. It creates a throwaway user and
 * league and deletes both at the end.
 */
import type { Database } from "@fullcourt/api-client";
import {
  createRng,
  generateSchedule,
  generateWorld,
  seedState,
} from "@fullcourt/game-engine";
import { rankStandings, validateScheduleTiers } from "@fullcourt/game-rules";
import { DEFAULT_SCHEDULE_TIERS } from "@fullcourt/game-types";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { work } from "../src/loop";
import { createSupabaseDb } from "../src/supabase-db";

const url = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
const secret = process.env.SUPABASE_SECRET_KEY;
const publishable = process.env.SUPABASE_PUBLISHABLE_KEY;
if (!secret || !publishable) {
  console.error(
    "Set SUPABASE_SECRET_KEY and SUPABASE_PUBLISHABLE_KEY (see `supabase status -o env`).",
  );
  process.exit(1);
}

const options = {
  auth: { persistSession: false, autoRefreshToken: false },
} as const;
const admin = createClient<Database>(url, secret, options);
const owner = createClient<Database>(url, publishable, options);

function check(condition: boolean, message: string): void {
  if (!condition) throw new Error(`CHECK FAILED: ${message}`);
  console.log(`ok   ${message}`);
}
const must = <T>(result: { data: T; error: unknown }): NonNullable<T> => {
  if (result.error) throw result.error;
  return result.data as NonNullable<T>;
};

async function main(): Promise<void> {
  const email = `smoke-${randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${randomUUID()}`;
  const created = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (created.error) throw created.error;
  const userId = created.data.user.id;

  try {
    // A standard 30-team league, the way the server creates one.
    const seed = `smoke-${randomUUID().slice(0, 8)}`;
    const world = generateWorld({ seed, size: "standard" });
    const league = must(
      await admin.rpc("admin_create_league", {
        owner: userId,
        league_name: "Smoke test",
        league_size: "standard",
        league_seed: seed,
        league_rng_state: [...world.rngState],
        world_teams: world.teams.map((t) => ({
          abbreviation: t.abbreviation,
          city: t.city,
          nickname: t.nickname,
          conference: t.conference,
          division: t.division,
          primary_color: t.primaryColor,
          secondary_color: t.secondaryColor,
        })),
        world_players: world.players.map((p) => ({
          team: p.team,
          first_name: p.firstName,
          last_name: p.lastName,
          position: p.position,
          age: p.age,
          height_inches: p.heightInches,
          weight_pounds: p.weightPounds,
          jersey: p.jersey,
          overall: p.overall,
          potential: p.potential,
          inside: p.ratings.inside,
          mid_range: p.ratings.midRange,
          three_point: p.ratings.threePoint,
          free_throw: p.ratings.freeThrow,
          passing: p.ratings.passing,
          ball_handling: p.ratings.ballHandling,
          off_rebound: p.ratings.offRebound,
          def_rebound: p.ratings.defRebound,
          perimeter_d: p.ratings.perimeterD,
          interior_d: p.ratings.interiorD,
          speed: p.ratings.speed,
          strength: p.ratings.strength,
          stamina: p.ratings.stamina,
        })),
      }),
    );
    const leagueId = league.id;

    // The owner signs in and chooses a team.
    const signedIn = await owner.auth.signInWithPassword({ email, password });
    if (signedIn.error) throw signedIn.error;
    const teams = must(
      await admin
        .from("teams")
        .select("id, conference_id, division_id")
        .eq("league_id", leagueId),
    );
    must(
      await owner.rpc("choose_team", {
        target_league: leagueId,
        target_team: (teams[0] as { id: string }).id,
      }),
    );

    // The season, built the way the web service builds it.
    const conferences = must(
      await admin
        .from("league_conferences")
        .select("id, name, sort_order")
        .eq("league_id", leagueId)
        .order("sort_order"),
    );
    const divisions = must(
      await admin
        .from("league_divisions")
        .select("id, conference_id, name, sort_order")
        .eq("league_id", leagueId)
        .order("sort_order"),
    );
    const structure = {
      conferences: conferences.map((c) => ({
        id: c.id,
        name: c.name,
        divisions: divisions
          .filter((d) => d.conference_id === c.id)
          .map((d) => ({
            id: d.id,
            name: d.name,
            teamCount: teams.filter((t) => t.division_id === d.id).length,
          })),
      })),
    };
    check(
      validateScheduleTiers(structure, DEFAULT_SCHEDULE_TIERS).length === 0,
      "the league's structure supports the standard schedule",
    );
    const games = generateSchedule(
      {
        structure,
        teams: teams.map((t) => ({
          teamId: t.id,
          conferenceId: t.conference_id,
          divisionId: t.division_id,
        })),
        tiers: DEFAULT_SCHEDULE_TIERS,
      },
      createRng(seedState(`${leagueId}:schedule:2026`)),
    );
    must(
      await admin.rpc("admin_create_season", {
        target_league: leagueId,
        season_year: 2026,
        preset: "standard",
        tiers: { ...DEFAULT_SCHEDULE_TIERS },
        schedule: games.map((g) => ({
          day: g.day,
          home_team_id: g.homeTeamId,
          away_team_id: g.awayTeamId,
        })),
      }),
    );
    check(games.length === 1140, `the schedule has ${games.length} games`);

    const db = createSupabaseDb({
      supabaseUrl: url,
      secretKey: secret as string,
      workerId: "smoke",
      pollMs: 100,
      staleAfterMs: 60_000,
      once: true,
    });
    const run = () =>
      work(db, {
        workerId: "smoke",
        pollMs: 100,
        staleAfterMs: 60_000,
        once: true,
        shouldStop: () => false,
        log: (m) => console.log(`     ${m}`),
      });

    // A week.
    const week = must(
      await owner.rpc("enqueue_sim_job", {
        target_league: leagueId,
        sim_kind: "week",
      }),
    );
    check(week.days_requested === 7, "a week is seven days");
    const before = must(
      await admin
        .from("leagues")
        .select("rng_state")
        .eq("id", leagueId)
        .single(),
    ).rng_state;
    const started = Date.now();
    await run();
    console.log(`     week took ${Date.now() - started} ms`);

    const season = must(
      await owner
        .from("seasons")
        .select("*")
        .eq("league_id", leagueId)
        .single(),
    );
    check(season.day === 8, "the season is at day 8 after a week");
    const played = must(
      await owner
        .from("games")
        .select("id, status, home_score, away_score")
        .eq("season_id", season.id)
        .eq("status", "final"),
    );
    check(played.length > 0, `${played.length} games are final`);
    const job = must(
      await owner.from("sim_jobs").select("*").eq("id", week.id).single(),
    );
    check(job.status === "done" && job.days_done === 7, "the job is done");
    const after = must(
      await admin
        .from("leagues")
        .select("rng_state")
        .eq("id", leagueId)
        .single(),
    ).rng_state;
    check(
      JSON.stringify(before) !== JSON.stringify(after),
      "the league's RNG state moved on",
    );

    // Plays and box scores add up, read as the owner.
    const first = played[0] as {
      id: string;
      home_score: number;
      away_score: number;
    };
    const lines = must(
      await owner
        .from("box_score_lines")
        .select("team_id, points")
        .eq("game_id", first.id),
    );
    check(
      lines.reduce((s, l) => s + l.points, 0) ===
        first.home_score + first.away_score,
      "a box score adds up to its game's score",
    );
    const plays = must(
      await owner
        .from("play_events")
        .select("seq, kind, home_score, away_score")
        .eq("game_id", first.id)
        .order("seq"),
    );
    const last = plays[plays.length - 1] as {
      home_score: number;
      away_score: number;
    };
    check(
      last.home_score === first.home_score &&
        last.away_score === first.away_score,
      `the play-by-play (${plays.length} plays) ends on the final score`,
    );

    // The rest of the regular season.
    const rest = must(
      await owner.rpc("enqueue_sim_job", {
        target_league: leagueId,
        sim_kind: "season",
      }),
    );
    check(
      rest.days_requested === season.last_day - 7,
      "the season job covers the days left",
    );
    const t2 = Date.now();
    await run();
    console.log(`     rest of the season took ${Date.now() - t2} ms`);

    const done = must(
      await owner
        .from("seasons")
        .select("*")
        .eq("league_id", leagueId)
        .single(),
    );
    check(done.phase === "playoffs", "the season moves to the playoffs");
    // PostgREST returns at most 1000 rows per request, so read in pages.
    const all = [];
    for (let from = 0; ; from += 1000) {
      const page = must(
        await admin
          .from("games")
          .select("home_team_id, away_team_id, home_score, away_score, status")
          .eq("season_id", season.id)
          .order("id")
          .range(from, from + 999),
      );
      all.push(...page);
      if (page.length < 1000) break;
    }
    check(
      all.length === 1140 && all.every((g) => g.status === "final"),
      "all 1140 games are final",
    );
    const standings = rankStandings(
      teams.map((t) => ({
        teamId: t.id,
        conferenceId: t.conference_id,
        divisionId: t.division_id,
      })),
      all.map((g) => ({
        homeTeamId: g.home_team_id,
        awayTeamId: g.away_team_id,
        homeScore: g.home_score as number,
        awayScore: g.away_score as number,
      })),
    );
    check(
      standings.every((s) => s.wins + s.losses === 76),
      "every team played 76 games",
    );
    const best = standings[0];
    const worst = standings[standings.length - 1];
    console.log(
      `     best record ${best?.wins}-${best?.losses}, worst ${worst?.wins}-${worst?.losses}`,
    );
    const avgPoints =
      all.reduce(
        (s, g) => s + (g.home_score as number) + (g.away_score as number),
        0,
      ) /
      (all.length * 2);
    console.log(`     average score ${avgPoints.toFixed(1)} points per team`);
    check(avgPoints > 98 && avgPoints < 112, "scoring is in the NBA-era range");

    const counts = await Promise.all(
      ["play_events", "box_score_lines"].map(async (table) => {
        const r = await admin
          .from(table as "play_events")
          .select("*", { count: "exact", head: true })
          .eq("league_id", leagueId);
        return `${table}: ${r.count}`;
      }),
    );
    console.log(`     stored ${counts.join(", ")}`);

    must(await admin.from("leagues").delete().eq("id", leagueId).select());
  } finally {
    await admin.auth.admin.deleteUser(userId);
  }
  console.log("smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
