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
  ENGINE_VERSION,
  createRng,
  generateSchedule,
  generateWorld,
  replayGame,
  seedState,
  type ReplaySnapshot,
} from "@fullcourt/game-engine";
import {
  buildFirstRound,
  defaultPlayoffConfig,
  rankStandings,
  seedPlayoffTeams,
  validateScheduleTiers,
} from "@fullcourt/game-rules";
import { DEFAULT_SCHEDULE_TIERS } from "@fullcourt/game-types";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { work } from "../src/loop";
import { toRngState } from "../src/map";
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

    // Box scores add up, and the stored recipe replays the game, as the owner sees it.
    const first = played[0] as {
      id: string;
      home_score: number;
      away_score: number;
    };
    const lines = must(
      await owner
        .from("box_score_lines")
        .select("player_id, team_id, points")
        .eq("game_id", first.id),
    );
    check(
      lines.reduce((s, l) => s + l.points, 0) ===
        first.home_score + first.away_score,
      "a box score adds up to its game's score",
    );
    const firstGame = must(
      await owner
        .from("games")
        .select("id, day, home_team_id, away_team_id")
        .eq("id", first.id)
        .single(),
    );
    const recipe = must(
      await owner
        .from("game_replays")
        .select("engine_version, rng_state, snapshot")
        .eq("game_id", first.id)
        .single(),
    );
    check(
      recipe.engine_version === ENGINE_VERSION,
      `the recipe records engine version ${ENGINE_VERSION}`,
    );
    const replayed = replayGame(
      {
        id: firstGame.id,
        day: firstGame.day,
        homeTeamId: firstGame.home_team_id,
        awayTeamId: firstGame.away_team_id,
      },
      recipe.snapshot as unknown as ReplaySnapshot,
      toRngState(recipe.rng_state),
    );
    check(
      replayed.game.homeScore === first.home_score &&
        replayed.game.awayScore === first.away_score,
      `replaying the stored recipe (${replayed.plays.length} plays) gives the final score`,
    );
    check(
      replayed.boxScore.lines.length === lines.length &&
        replayed.boxScore.lines.every(
          (l) =>
            lines.find((s) => s.player_id === l.playerId)?.points === l.points,
        ),
      "the replay's box score matches the stored one",
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

    const detailRows = await Promise.all(
      ["game_replays", "box_score_lines", "games"].map(async (table) => {
        const r = await admin
          .from(table as "games")
          .select("*", { count: "exact", head: true })
          .eq("league_id", leagueId);
        return `${table}: ${r.count}`;
      }),
    );
    console.log(`     the season's detail: ${detailRows.join(", ")}`);

    // The playoffs: seeded from the standings, then played to a champion.
    const entries = standings.map((s) => ({
      teamId: s.teamId,
      conferenceId: s.conferenceId,
      divisionId: s.divisionId,
    }));
    const playoffConfig = defaultPlayoffConfig(structure);
    const pools = seedPlayoffTeams(structure, playoffConfig, entries);
    const firstRound = buildFirstRound(
      pools,
      entries.map((e) => e.teamId),
      playoffConfig,
    );
    check(
      firstRound.length === playoffConfig.teams / 2,
      `the bracket has ${playoffConfig.teams} teams and ${firstRound.length} first-round series`,
    );
    must(
      await admin.rpc("admin_create_playoffs", {
        target_season: season.id,
        config: { ...playoffConfig },
        series: firstRound.map((s) => ({
          slot: s.slot,
          best_of: s.bestOf,
          team_a: s.a.teamId,
          seed_a: s.a.seed,
          rank_a: s.a.rank,
          team_b: s.b.teamId,
          seed_b: s.b.seed,
          rank_b: s.b.rank,
        })),
      }),
    );
    must(
      await owner.rpc("enqueue_sim_job", {
        target_league: leagueId,
        sim_kind: "season",
      }),
    );
    const t3 = Date.now();
    await run();
    console.log(`     the playoffs took ${Date.now() - t3} ms`);

    const ended = must(
      await owner.from("seasons").select("*").eq("id", season.id).single(),
    );
    check(
      ended.phase === "complete",
      "the season is complete once the final is won",
    );
    const rounds = Math.log2(playoffConfig.teams);
    const series = must(
      await owner.from("playoff_series").select("*").eq("season_id", season.id),
    );
    check(
      series.length === playoffConfig.teams - 1,
      `${series.length} series were played, one for every team but the champion`,
    );
    check(
      series.every(
        (s) =>
          s.winner_team_id !== null &&
          Math.max(s.wins_a, s.wins_b) === (s.best_of + 1) / 2 &&
          Math.min(s.wins_a, s.wins_b) < (s.best_of + 1) / 2,
      ),
      "every series ended as soon as a team had a majority of its games",
    );
    const playoffGames = must(
      await admin
        .from("games")
        .select(
          "id, status, series_id, home_team_id, away_team_id, game_number, round",
        )
        .eq("season_id", season.id)
        .not("round", "is", null)
        .range(0, 999),
    );
    check(
      playoffGames.every((g) => g.status === "final") &&
        playoffGames.length ===
          series.reduce((n, s) => n + s.wins_a + s.wins_b, 0),
      `${playoffGames.length} playoff games, one for every win in a series`,
    );
    const finalSeries = series.find((s) => s.round === rounds);
    const awards = must(
      await owner
        .from("season_awards")
        .select("award, team_id")
        .eq("season_id", season.id),
    );
    const championId = awards.find((a) => a.award === "champion")?.team_id;
    check(
      championId === finalSeries?.winner_team_id &&
        awards.some(
          (a) =>
            a.award === "finalist" &&
            a.team_id ===
              (finalSeries?.winner_team_id === finalSeries?.team_a
                ? finalSeries?.team_b
                : finalSeries?.team_a),
        ),
      "the champion and the finalist are the two teams in the final",
    );
    const champion = teams.find((t) => t.id === championId);
    const champRank = standings.findIndex((s) => s.teamId === championId) + 1;
    console.log(
      `     champion: the team that finished ${champRank} in the standings (${champion?.id.slice(0, 8)})`,
    );
    // Home court: in every series the better regular-season record hosts game one.
    const gameOneHosts = series.every((s) => {
      const first = playoffGames.find(
        (g) => g.series_id === s.id && g.game_number === 1,
      );
      const better = s.rank_a < s.rank_b ? s.team_a : s.team_b;
      return first?.home_team_id === better;
    });
    check(gameOneHosts, "the better record hosts game one of every series");

    if (process.env.SMOKE_KEEP === "before-archive") {
      console.log(
        `     SMOKE_KEEP: stopped before archiving; league ${leagueId} kept`,
      );
      return;
    }

    // Archive the finished season into history.
    // The real extremes, read before the box scores are deleted.
    const bestLine = must(
      await admin
        .from("box_score_lines")
        .select("points, rebounds, assists")
        .eq("league_id", leagueId)
        .order("points", { ascending: false })
        .limit(1),
    )[0];
    const biggestMargin = Math.max(
      ...all.map((g) =>
        Math.abs((g.home_score as number) - (g.away_score as number)),
      ),
    );
    const pointsInGames = all.reduce(
      (s, g) => s + (g.home_score as number) + (g.away_score as number),
      0,
    );
    const archived = must(
      await admin.rpc("admin_archive_season", {
        target_season: season.id,
        standings_order: standings.map((s) => s.teamId),
      }),
    );
    check(archived.archived_at !== null, "the season is archived");

    const teamStats = must(
      await owner
        .from("team_season_stats")
        .select(
          "team_id, wins, losses, points_for, rank_overall, biggest_win, worst_loss, low_points, high_points, longest_win_streak, playoff_round, playoff_result",
        )
        .eq("season_id", season.id),
    );
    check(teamStats.length === 30, "all 30 teams have season records");
    check(
      teamStats.reduce((s, t) => s + t.wins, 0) === 1140 &&
        teamStats.reduce((s, t) => s + t.points_for, 0) === pointsInGames,
      "the records add up to the 1140 games and every point scored",
    );
    check(
      teamStats.find((t) => t.rank_overall === 1)?.team_id ===
        standings[0]?.teamId,
      "the best team in the standings ranks first",
    );
    check(
      teamStats.filter((t) => t.playoff_result === "champion").length === 1 &&
        teamStats.find((t) => t.playoff_result === "champion")?.team_id ===
          championId &&
        teamStats.filter((t) => t.playoff_result === "finalist").length === 1 &&
        teamStats.filter((t) => t.playoff_round !== null).length ===
          playoffConfig.teams,
      "the history records the champion, the finalist and every team that made the playoffs",
    );
    const playerStats = must(
      await owner
        .from("player_season_stats")
        .select(
          "player_id, playoffs, games_played, points, high_points, high_rebounds, high_assists, high_threes",
        )
        .eq("season_id", season.id),
    );
    const regularStats = playerStats.filter((p) => !p.playoffs);
    check(
      regularStats.reduce((s, p) => s + p.points, 0) === pointsInGames,
      `${regularStats.length} players' regular-season points add up to every point scored; ${playerStats.length - regularStats.length} more have playoff rows`,
    );
    const top = [...regularStats].sort((a, b) => b.points - a.points)[0];
    console.log(
      `     top scorer: ${((top?.points ?? 0) / (top?.games_played ?? 1)).toFixed(1)} per game, best game ${top?.high_points}`,
    );
    const seasonHigh = (
      key: "high_points" | "high_rebounds" | "high_assists" | "high_threes",
    ) => Math.max(...playerStats.map((p) => p[key]));
    console.log(
      `     season highs: ${seasonHigh("high_points")} points, ${seasonHigh("high_rebounds")} rebounds, ${seasonHigh("high_assists")} assists, ${seasonHigh("high_threes")} threes`,
    );
    check(
      seasonHigh("high_points") === bestLine?.points,
      "the season's highest-scoring game is among the players' highs",
    );
    check(
      playerStats.every((p) => p.high_points * 1 <= (bestLine?.points ?? 0)) &&
        playerStats.every((p) => p.high_points <= p.points),
      "no player's best game is more than the league's best or his own total",
    );
    check(
      Math.max(...teamStats.map((t) => t.biggest_win ?? 0)) === biggestMargin,
      `the biggest win in the league (${biggestMargin}) is the best of the teams' biggest wins`,
    );
    check(
      teamStats.every(
        (t) =>
          (t.low_points ?? 0) <= (t.high_points ?? 0) &&
          t.longest_win_streak >= 1 &&
          (t.biggest_win ?? 0) >= 1 &&
          (t.worst_loss ?? 0) >= 1,
      ),
      "every team has sensible highs, lows and a win streak",
    );
    const streak = [...teamStats].sort(
      (a, b) => b.longest_win_streak - a.longest_win_streak,
    )[0];
    console.log(`     longest win streak: ${streak?.longest_win_streak}`);

    const left = await Promise.all(
      ["game_replays", "box_score_lines", "games"].map(async (table) => {
        const r = await admin
          .from(table as "games")
          .select("*", { count: "exact", head: true })
          .eq("league_id", leagueId);
        return r.count;
      }),
    );
    check(
      left.every((n) => n === 0),
      "the season's games, box scores and replays are deleted",
    );

    // The next season can start; the previous one was archived first.
    must(
      await admin.rpc("admin_create_season", {
        target_league: leagueId,
        season_year: 2027,
        preset: "standard",
        tiers: { ...DEFAULT_SCHEDULE_TIERS },
        schedule: games.map((g) => ({
          day: g.day,
          home_team_id: g.homeTeamId,
          away_team_id: g.awayTeamId,
        })),
      }),
    );
    check(true, "the next season starts after the last was archived");

    must(await admin.from("leagues").delete().eq("id", leagueId).select());
  } finally {
    if (!process.env.SMOKE_KEEP) await admin.auth.admin.deleteUser(userId);
  }
  console.log("smoke test passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
