export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      box_score_lines: {
        Row: {
          assists: number
          blocks: number
          fga: number
          fgm: number
          fouls: number
          fta: number
          ftm: number
          game_id: string
          league_id: string
          minutes: number
          player_id: string
          points: number
          rebounds: number
          started: boolean
          steals: number
          team_id: string
          tpa: number
          tpm: number
          turnovers: number
        }
        Insert: {
          assists: number
          blocks: number
          fga: number
          fgm: number
          fouls: number
          fta: number
          ftm: number
          game_id: string
          league_id: string
          minutes: number
          player_id: string
          points: number
          rebounds: number
          started: boolean
          steals: number
          team_id: string
          tpa: number
          tpm: number
          turnovers: number
        }
        Update: {
          assists?: number
          blocks?: number
          fga?: number
          fgm?: number
          fouls?: number
          fta?: number
          ftm?: number
          game_id?: string
          league_id?: string
          minutes?: number
          player_id?: string
          points?: number
          rebounds?: number
          started?: boolean
          steals?: number
          team_id?: string
          tpa?: number
          tpm?: number
          turnovers?: number
        }
        Relationships: [
          {
            foreignKeyName: "box_score_lines_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "box_score_lines_league_id_game_id_fkey"
            columns: ["league_id", "game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "box_score_lines_league_id_player_id_fkey"
            columns: ["league_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "box_score_lines_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      camp_assignments: {
        Row: {
          league_id: string
          player_id: string
          program: string
          season_id: string
          team_id: string
        }
        Insert: {
          league_id: string
          player_id: string
          program: string
          season_id: string
          team_id: string
        }
        Update: {
          league_id?: string
          player_id?: string
          program?: string
          season_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "camp_assignments_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_assignments_league_id_player_id_fkey"
            columns: ["league_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "camp_assignments_league_id_season_id_fkey"
            columns: ["league_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "camp_assignments_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      camp_results: {
        Row: {
          league_id: string
          overall_after: number
          overall_before: number
          player_id: string
          program: string
          season_year: number
          team_id: string
        }
        Insert: {
          league_id: string
          overall_after: number
          overall_before: number
          player_id: string
          program: string
          season_year: number
          team_id: string
        }
        Update: {
          league_id?: string
          overall_after?: number
          overall_before?: number
          player_id?: string
          program?: string
          season_year?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "camp_results_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "camp_results_league_id_player_id_fkey"
            columns: ["league_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "camp_results_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      draft_picks: {
        Row: {
          expected_pick: number
          finish_rank: number
          league_id: string
          lottery_odds: number | null
          pick: number
          player_id: string | null
          round: number
          season_year: number
          team_id: string
        }
        Insert: {
          expected_pick: number
          finish_rank: number
          league_id: string
          lottery_odds?: number | null
          pick: number
          player_id?: string | null
          round: number
          season_year: number
          team_id: string
        }
        Update: {
          expected_pick?: number
          finish_rank?: number
          league_id?: string
          lottery_odds?: number | null
          pick?: number
          player_id?: string | null
          round?: number
          season_year?: number
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "draft_picks_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "draft_picks_league_id_player_id_fkey"
            columns: ["league_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "draft_picks_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      fa_offers: {
        Row: {
          id: string
          league_id: string
          made_day: number
          player_id: string
          salary: number
          season_id: string
          status: string
          team_id: string
          years: number
        }
        Insert: {
          id?: string
          league_id: string
          made_day?: number
          player_id: string
          salary: number
          season_id: string
          status?: string
          team_id: string
          years: number
        }
        Update: {
          id?: string
          league_id?: string
          made_day?: number
          player_id?: string
          salary?: number
          season_id?: string
          status?: string
          team_id?: string
          years?: number
        }
        Relationships: [
          {
            foreignKeyName: "fa_offers_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fa_offers_league_id_player_id_fkey"
            columns: ["league_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "fa_offers_league_id_season_id_fkey"
            columns: ["league_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "fa_offers_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      game_replays: {
        Row: {
          engine_version: number
          game_id: string
          league_id: string
          rng_state: number[]
          snapshot: Json
        }
        Insert: {
          engine_version: number
          game_id: string
          league_id: string
          rng_state: number[]
          snapshot: Json
        }
        Update: {
          engine_version?: number
          game_id?: string
          league_id?: string
          rng_state?: number[]
          snapshot?: Json
        }
        Relationships: [
          {
            foreignKeyName: "game_replays_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "game_replays_league_id_game_id_fkey"
            columns: ["league_id", "game_id"]
            isOneToOne: false
            referencedRelation: "games"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      games: {
        Row: {
          away_score: number | null
          away_team_id: string
          day: number
          game_number: number | null
          home_score: number | null
          home_team_id: string
          id: string
          league_id: string
          overtimes: number
          round: number | null
          season_id: string
          series_id: string | null
          status: string
        }
        Insert: {
          away_score?: number | null
          away_team_id: string
          day: number
          game_number?: number | null
          home_score?: number | null
          home_team_id: string
          id?: string
          league_id: string
          overtimes?: number
          round?: number | null
          season_id: string
          series_id?: string | null
          status?: string
        }
        Update: {
          away_score?: number | null
          away_team_id?: string
          day?: number
          game_number?: number | null
          home_score?: number | null
          home_team_id?: string
          id?: string
          league_id?: string
          overtimes?: number
          round?: number | null
          season_id?: string
          series_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "games_league_id_away_team_id_fkey"
            columns: ["league_id", "away_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "games_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "games_league_id_home_team_id_fkey"
            columns: ["league_id", "home_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "games_league_id_season_id_fkey"
            columns: ["league_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "games_league_id_series_id_fkey"
            columns: ["league_id", "series_id"]
            isOneToOne: false
            referencedRelation: "playoff_series"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      league_conferences: {
        Row: {
          id: string
          league_id: string
          name: string
          sort_order: number
        }
        Insert: {
          id: string
          league_id: string
          name: string
          sort_order: number
        }
        Update: {
          id?: string
          league_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_conferences_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_divisions: {
        Row: {
          conference_id: string
          id: string
          league_id: string
          name: string
          sort_order: number
        }
        Insert: {
          conference_id: string
          id: string
          league_id: string
          name: string
          sort_order: number
        }
        Update: {
          conference_id?: string
          id?: string
          league_id?: string
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_divisions_league_id_conference_id_fkey"
            columns: ["league_id", "conference_id"]
            isOneToOne: false
            referencedRelation: "league_conferences"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      league_local_players: {
        Row: {
          label: string | null
          league_id: string
          slot: number
        }
        Insert: {
          label?: string | null
          league_id: string
          slot: number
        }
        Update: {
          label?: string | null
          league_id?: string
          slot?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_local_players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          config: Json | null
          config_schema_version: number | null
          created_at: string
          id: string
          name: string
          owner_id: string
          rng_state: number[]
          seed: string
          size: string
          status: string
          updated_at: string
          user_team_id: string | null
        }
        Insert: {
          config?: Json | null
          config_schema_version?: number | null
          created_at?: string
          id?: string
          name: string
          owner_id: string
          rng_state?: number[]
          seed: string
          size?: string
          status?: string
          updated_at?: string
          user_team_id?: string | null
        }
        Update: {
          config?: Json | null
          config_schema_version?: number | null
          created_at?: string
          id?: string
          name?: string
          owner_id?: string
          rng_state?: number[]
          seed?: string
          size?: string
          status?: string
          updated_at?: string
          user_team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leagues_id_user_team_id_fkey"
            columns: ["id", "user_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      player_ratings_history: {
        Row: {
          age: number
          league_id: string
          overall: number
          player_id: string
          potential: number
          previous_overall: number | null
          season_year: number
          team_id: string | null
        }
        Insert: {
          age: number
          league_id: string
          overall: number
          player_id: string
          potential: number
          previous_overall?: number | null
          season_year: number
          team_id?: string | null
        }
        Update: {
          age?: number
          league_id?: string
          overall?: number
          player_id?: string
          potential?: number
          previous_overall?: number | null
          season_year?: number
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "player_ratings_history_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_ratings_history_league_id_player_id_fkey"
            columns: ["league_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "player_ratings_history_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      player_season_stats: {
        Row: {
          assists: number
          blocks: number
          double_doubles: number
          fga: number
          fgm: number
          fouls: number
          fta: number
          ftm: number
          games_played: number
          games_started: number
          high_assists: number
          high_assists_day: number
          high_assists_opponent_id: string
          high_blocks: number
          high_blocks_day: number
          high_blocks_opponent_id: string
          high_points: number
          high_points_day: number
          high_points_opponent_id: string
          high_rebounds: number
          high_rebounds_day: number
          high_rebounds_opponent_id: string
          high_steals: number
          high_steals_day: number
          high_steals_opponent_id: string
          high_threes: number
          high_threes_day: number
          high_threes_opponent_id: string
          league_id: string
          minutes: number
          player_id: string
          playoffs: boolean
          points: number
          rebounds: number
          season_id: string
          steals: number
          team_id: string
          tpa: number
          tpm: number
          triple_doubles: number
          turnovers: number
        }
        Insert: {
          assists: number
          blocks: number
          double_doubles: number
          fga: number
          fgm: number
          fouls: number
          fta: number
          ftm: number
          games_played: number
          games_started: number
          high_assists: number
          high_assists_day: number
          high_assists_opponent_id: string
          high_blocks: number
          high_blocks_day: number
          high_blocks_opponent_id: string
          high_points: number
          high_points_day: number
          high_points_opponent_id: string
          high_rebounds: number
          high_rebounds_day: number
          high_rebounds_opponent_id: string
          high_steals: number
          high_steals_day: number
          high_steals_opponent_id: string
          high_threes: number
          high_threes_day: number
          high_threes_opponent_id: string
          league_id: string
          minutes: number
          player_id: string
          playoffs?: boolean
          points: number
          rebounds: number
          season_id: string
          steals: number
          team_id: string
          tpa: number
          tpm: number
          triple_doubles: number
          turnovers: number
        }
        Update: {
          assists?: number
          blocks?: number
          double_doubles?: number
          fga?: number
          fgm?: number
          fouls?: number
          fta?: number
          ftm?: number
          games_played?: number
          games_started?: number
          high_assists?: number
          high_assists_day?: number
          high_assists_opponent_id?: string
          high_blocks?: number
          high_blocks_day?: number
          high_blocks_opponent_id?: string
          high_points?: number
          high_points_day?: number
          high_points_opponent_id?: string
          high_rebounds?: number
          high_rebounds_day?: number
          high_rebounds_opponent_id?: string
          high_steals?: number
          high_steals_day?: number
          high_steals_opponent_id?: string
          high_threes?: number
          high_threes_day?: number
          high_threes_opponent_id?: string
          league_id?: string
          minutes?: number
          player_id?: string
          playoffs?: boolean
          points?: number
          rebounds?: number
          season_id?: string
          steals?: number
          team_id?: string
          tpa?: number
          tpm?: number
          triple_doubles?: number
          turnovers?: number
        }
        Relationships: [
          {
            foreignKeyName: "player_season_stats_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_season_stats_league_id_player_id_fkey"
            columns: ["league_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "player_season_stats_league_id_season_id_fkey"
            columns: ["league_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "player_season_stats_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      player_transactions: {
        Row: {
          day: number
          id: string
          kind: string
          league_id: string
          player_id: string
          route: string | null
          salary: number | null
          season_year: number
          team_id: string | null
          years: number | null
        }
        Insert: {
          day?: number
          id?: string
          kind: string
          league_id: string
          player_id: string
          route?: string | null
          salary?: number | null
          season_year: number
          team_id?: string | null
          years?: number | null
        }
        Update: {
          day?: number
          id?: string
          kind?: string
          league_id?: string
          player_id?: string
          route?: string | null
          salary?: number | null
          season_year?: number
          team_id?: string | null
          years?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "player_transactions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_transactions_league_id_player_id_fkey"
            columns: ["league_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "player_transactions_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      players: {
        Row: {
          age: number
          ball_handling: number
          contract_expires: number | null
          def_rebound: number
          draft_pick: number | null
          draft_round: number | null
          draft_year: number | null
          first_name: string
          free_throw: number
          height_inches: number
          id: string
          inside: number
          interior_d: number
          jersey: number
          last_name: string
          league_id: string
          mid_range: number
          off_rebound: number
          overall: number
          passing: number
          perimeter_d: number
          position: string
          potential: number
          retired_year: number | null
          rights_team_id: string | null
          salary: number | null
          speed: number
          stamina: number
          status: string
          strength: number
          team_id: string | null
          three_point: number
          weight_pounds: number
        }
        Insert: {
          age: number
          ball_handling: number
          contract_expires?: number | null
          def_rebound: number
          draft_pick?: number | null
          draft_round?: number | null
          draft_year?: number | null
          first_name: string
          free_throw: number
          height_inches: number
          id?: string
          inside: number
          interior_d: number
          jersey: number
          last_name: string
          league_id: string
          mid_range: number
          off_rebound: number
          overall: number
          passing: number
          perimeter_d: number
          position: string
          potential: number
          retired_year?: number | null
          rights_team_id?: string | null
          salary?: number | null
          speed: number
          stamina: number
          status?: string
          strength: number
          team_id?: string | null
          three_point: number
          weight_pounds: number
        }
        Update: {
          age?: number
          ball_handling?: number
          contract_expires?: number | null
          def_rebound?: number
          draft_pick?: number | null
          draft_round?: number | null
          draft_year?: number | null
          first_name?: string
          free_throw?: number
          height_inches?: number
          id?: string
          inside?: number
          interior_d?: number
          jersey?: number
          last_name?: string
          league_id?: string
          mid_range?: number
          off_rebound?: number
          overall?: number
          passing?: number
          perimeter_d?: number
          position?: string
          potential?: number
          retired_year?: number | null
          rights_team_id?: string | null
          salary?: number | null
          speed?: number
          stamina?: number
          status?: string
          strength?: number
          team_id?: string | null
          three_point?: number
          weight_pounds?: number
        }
        Relationships: [
          {
            foreignKeyName: "players_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "players_league_id_rights_team_id_fkey"
            columns: ["league_id", "rights_team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "players_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      playoff_series: {
        Row: {
          best_of: number
          id: string
          league_id: string
          rank_a: number
          rank_b: number
          round: number
          season_id: string
          seed_a: number
          seed_b: number
          slot: number
          team_a: string
          team_b: string
          winner_team_id: string | null
          wins_a: number
          wins_b: number
        }
        Insert: {
          best_of: number
          id?: string
          league_id: string
          rank_a: number
          rank_b: number
          round: number
          season_id: string
          seed_a: number
          seed_b: number
          slot: number
          team_a: string
          team_b: string
          winner_team_id?: string | null
          wins_a?: number
          wins_b?: number
        }
        Update: {
          best_of?: number
          id?: string
          league_id?: string
          rank_a?: number
          rank_b?: number
          round?: number
          season_id?: string
          seed_a?: number
          seed_b?: number
          slot?: number
          team_a?: string
          team_b?: string
          winner_team_id?: string | null
          wins_a?: number
          wins_b?: number
        }
        Relationships: [
          {
            foreignKeyName: "playoff_series_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "playoff_series_league_id_season_id_fkey"
            columns: ["league_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "playoff_series_league_id_team_a_fkey"
            columns: ["league_id", "team_a"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "playoff_series_league_id_team_b_fkey"
            columns: ["league_id", "team_b"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      profiles: {
        Row: {
          alpha_notice_acknowledged_at: string | null
          alpha_notice_version: number | null
          created_at: string
          display_name: string
          id: string
          terms_accepted_at: string | null
          terms_version: number | null
          updated_at: string
        }
        Insert: {
          alpha_notice_acknowledged_at?: string | null
          alpha_notice_version?: number | null
          created_at?: string
          display_name: string
          id: string
          terms_accepted_at?: string | null
          terms_version?: number | null
          updated_at?: string
        }
        Update: {
          alpha_notice_acknowledged_at?: string | null
          alpha_notice_version?: number | null
          created_at?: string
          display_name?: string
          id?: string
          terms_accepted_at?: string | null
          terms_version?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      season_awards: {
        Row: {
          award: string
          created_at: string
          id: string
          league_id: string
          player_id: string | null
          season_id: string
          team_id: string | null
        }
        Insert: {
          award: string
          created_at?: string
          id?: string
          league_id: string
          player_id?: string | null
          season_id: string
          team_id?: string | null
        }
        Update: {
          award?: string
          created_at?: string
          id?: string
          league_id?: string
          player_id?: string | null
          season_id?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "season_awards_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "season_awards_league_id_player_id_fkey"
            columns: ["league_id", "player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "season_awards_league_id_season_id_fkey"
            columns: ["league_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "season_awards_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      seasons: {
        Row: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        Insert: {
          archived_at?: string | null
          created_at?: string
          day?: number
          fa_day?: number
          id?: string
          last_day: number
          league_id: string
          offseason_done_at?: string | null
          phase?: string
          playoff_config?: Json | null
          salary_cap?: number
          schedule_preset?: string
          schedule_tiers: Json
          stage?: string | null
          year: number
        }
        Update: {
          archived_at?: string | null
          created_at?: string
          day?: number
          fa_day?: number
          id?: string
          last_day?: number
          league_id?: string
          offseason_done_at?: string | null
          phase?: string
          playoff_config?: Json | null
          salary_cap?: number
          schedule_preset?: string
          schedule_tiers?: Json
          stage?: string | null
          year?: number
        }
        Relationships: [
          {
            foreignKeyName: "seasons_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      sim_jobs: {
        Row: {
          created_at: string
          days_done: number
          days_requested: number
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          league_id: string
          season_id: string
          started_at: string | null
          status: string
          worker: string | null
        }
        Insert: {
          created_at?: string
          days_done?: number
          days_requested: number
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind: string
          league_id: string
          season_id: string
          started_at?: string | null
          status?: string
          worker?: string | null
        }
        Update: {
          created_at?: string
          days_done?: number
          days_requested?: number
          error?: string | null
          finished_at?: string | null
          heartbeat_at?: string | null
          id?: string
          kind?: string
          league_id?: string
          season_id?: string
          started_at?: string | null
          status?: string
          worker?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sim_jobs_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sim_jobs_league_id_season_id_fkey"
            columns: ["league_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      staff_members: {
        Row: {
          age: number
          contract_years: number | null
          first_name: string
          id: string
          last_name: string
          league_id: string
          rating: number
          role: string
          salary: number
          status: string
          team_id: string | null
        }
        Insert: {
          age: number
          contract_years?: number | null
          first_name: string
          id?: string
          last_name: string
          league_id: string
          rating: number
          role: string
          salary: number
          status?: string
          team_id?: string | null
        }
        Update: {
          age?: number
          contract_years?: number | null
          first_name?: string
          id?: string
          last_name?: string
          league_id?: string
          rating?: number
          role?: string
          salary?: number
          status?: string
          team_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "staff_members_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_members_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      team_season_stats: {
        Row: {
          biggest_win: number | null
          biggest_win_day: number | null
          biggest_win_opponent_id: string | null
          conference_losses: number
          conference_wins: number
          division_losses: number
          division_wins: number
          high_points: number | null
          high_points_allowed: number | null
          high_points_allowed_day: number | null
          high_points_allowed_opponent_id: string | null
          high_points_day: number | null
          high_points_opponent_id: string | null
          home_losses: number
          home_wins: number
          league_id: string
          longest_loss_streak: number
          longest_win_streak: number
          losses: number
          low_points: number | null
          low_points_allowed: number | null
          low_points_allowed_day: number | null
          low_points_allowed_opponent_id: string | null
          low_points_day: number | null
          low_points_opponent_id: string | null
          playoff_result: string | null
          playoff_round: number | null
          points_against: number
          points_for: number
          rank_conference: number
          rank_division: number
          rank_overall: number
          season_id: string
          team_id: string
          wins: number
          worst_loss: number | null
          worst_loss_day: number | null
          worst_loss_opponent_id: string | null
        }
        Insert: {
          biggest_win?: number | null
          biggest_win_day?: number | null
          biggest_win_opponent_id?: string | null
          conference_losses: number
          conference_wins: number
          division_losses: number
          division_wins: number
          high_points?: number | null
          high_points_allowed?: number | null
          high_points_allowed_day?: number | null
          high_points_allowed_opponent_id?: string | null
          high_points_day?: number | null
          high_points_opponent_id?: string | null
          home_losses: number
          home_wins: number
          league_id: string
          longest_loss_streak?: number
          longest_win_streak?: number
          losses: number
          low_points?: number | null
          low_points_allowed?: number | null
          low_points_allowed_day?: number | null
          low_points_allowed_opponent_id?: string | null
          low_points_day?: number | null
          low_points_opponent_id?: string | null
          playoff_result?: string | null
          playoff_round?: number | null
          points_against: number
          points_for: number
          rank_conference: number
          rank_division: number
          rank_overall: number
          season_id: string
          team_id: string
          wins: number
          worst_loss?: number | null
          worst_loss_day?: number | null
          worst_loss_opponent_id?: string | null
        }
        Update: {
          biggest_win?: number | null
          biggest_win_day?: number | null
          biggest_win_opponent_id?: string | null
          conference_losses?: number
          conference_wins?: number
          division_losses?: number
          division_wins?: number
          high_points?: number | null
          high_points_allowed?: number | null
          high_points_allowed_day?: number | null
          high_points_allowed_opponent_id?: string | null
          high_points_day?: number | null
          high_points_opponent_id?: string | null
          home_losses?: number
          home_wins?: number
          league_id?: string
          longest_loss_streak?: number
          longest_win_streak?: number
          losses?: number
          low_points?: number | null
          low_points_allowed?: number | null
          low_points_allowed_day?: number | null
          low_points_allowed_opponent_id?: string | null
          low_points_day?: number | null
          low_points_opponent_id?: string | null
          playoff_result?: string | null
          playoff_round?: number | null
          points_against?: number
          points_for?: number
          rank_conference?: number
          rank_division?: number
          rank_overall?: number
          season_id?: string
          team_id?: string
          wins?: number
          worst_loss?: number | null
          worst_loss_day?: number | null
          worst_loss_opponent_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_season_stats_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_season_stats_league_id_season_id_fkey"
            columns: ["league_id", "season_id"]
            isOneToOne: false
            referencedRelation: "seasons"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "team_season_stats_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["league_id", "id"]
          },
        ]
      }
      teams: {
        Row: {
          abbreviation: string
          ai_drafting: boolean
          ai_roster_coverage: boolean
          ai_roster_management: boolean
          ai_scouting: boolean
          ai_trades: boolean
          city: string
          city_id: string | null
          conference_id: string
          division_id: string
          id: string
          league_id: string
          local_player_slot: number | null
          logo_id: string | null
          nickname: string
          primary_color: string
          secondary_color: string
        }
        Insert: {
          abbreviation: string
          ai_drafting?: boolean
          ai_roster_coverage?: boolean
          ai_roster_management?: boolean
          ai_scouting?: boolean
          ai_trades?: boolean
          city: string
          city_id?: string | null
          conference_id: string
          division_id: string
          id?: string
          league_id: string
          local_player_slot?: number | null
          logo_id?: string | null
          nickname: string
          primary_color: string
          secondary_color: string
        }
        Update: {
          abbreviation?: string
          ai_drafting?: boolean
          ai_roster_coverage?: boolean
          ai_roster_management?: boolean
          ai_scouting?: boolean
          ai_trades?: boolean
          city?: string
          city_id?: string | null
          conference_id?: string
          division_id?: string
          id?: string
          league_id?: string
          local_player_slot?: number | null
          logo_id?: string | null
          nickname?: string
          primary_color?: string
          secondary_color?: string
        }
        Relationships: [
          {
            foreignKeyName: "teams_league_id_conference_id_division_id_fkey"
            columns: ["league_id", "conference_id", "division_id"]
            isOneToOne: false
            referencedRelation: "league_divisions"
            referencedColumns: ["league_id", "conference_id", "id"]
          },
          {
            foreignKeyName: "teams_league_id_conference_id_fkey"
            columns: ["league_id", "conference_id"]
            isOneToOne: false
            referencedRelation: "league_conferences"
            referencedColumns: ["league_id", "id"]
          },
          {
            foreignKeyName: "teams_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "teams_league_id_local_player_slot_fkey"
            columns: ["league_id", "local_player_slot"]
            isOneToOne: false
            referencedRelation: "league_local_players"
            referencedColumns: ["league_id", "slot"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_terms: { Args: { accepted_version: number }; Returns: undefined }
      acknowledge_alpha_notice: {
        Args: { acknowledged_version: number }
        Returns: undefined
      }
      admin_add_staff: {
        Args: { members: Json; target_league: string }
        Returns: number
      }
      admin_apply_camp: {
        Args: { results: Json; target_season: string }
        Returns: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_apply_fa_day: {
        Args: {
          lapsed: Json
          new_offers: Json
          raised: Json
          signings: Json
          target_season: string
        }
        Returns: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_apply_progression: {
        Args: { changes: Json; staff_changes: Json; target_season: string }
        Returns: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_apply_rosters: {
        Args: { moves: Json; staff_moves: Json; target_season: string }
        Returns: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_archive_season: {
        Args: { standings_order: string[]; target_season: string }
        Returns: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_claim_sim_job: {
        Args: { worker_name: string }
        Returns: {
          created_at: string
          days_done: number
          days_requested: number
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          league_id: string
          season_id: string
          started_at: string | null
          status: string
          worker: string | null
        }[]
        SetofOptions: {
          from: "*"
          to: "sim_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      admin_commit_sim_day: {
        Args: {
          day_games: Json
          day_lines: Json
          day_replays: Json
          new_rng_state: number[]
          sim_day: number
          target_job: string
        }
        Returns: {
          created_at: string
          days_done: number
          days_requested: number
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          league_id: string
          season_id: string
          started_at: string | null
          status: string
          worker: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sim_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_league: {
        Args: {
          league_name: string
          league_rng_state: number[]
          league_seed: string
          league_size: string
          owner: string
          world_players: Json
          world_teams: Json
        }
        Returns: {
          config: Json | null
          config_schema_version: number | null
          created_at: string
          id: string
          name: string
          owner_id: string
          rng_state: number[]
          seed: string
          size: string
          status: string
          updated_at: string
          user_team_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_owner_league: {
        Args: {
          league_config: Json
          league_name: string
          league_rng_state: number[]
          league_seed: string
          league_size: string
          owner: string
          world_conferences: Json
          world_divisions: Json
          world_local_players: Json
          world_players: Json
          world_teams: Json
        }
        Returns: {
          config: Json | null
          config_schema_version: number | null
          created_at: string
          id: string
          name: string
          owner_id: string
          rng_state: number[]
          seed: string
          size: string
          status: string
          updated_at: string
          user_team_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_playoffs: {
        Args: { config: Json; series: Json; target_season: string }
        Returns: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_prospects: {
        Args: { prospects: Json; target_season: string }
        Returns: number
      }
      admin_create_season: {
        Args: {
          in_offseason?: boolean
          preset: string
          schedule: Json
          season_cap?: number
          season_year: number
          target_league: string
          tiers: Json
        }
        Returns: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_create_staff: {
        Args: { members: Json; target_league: string }
        Returns: number
      }
      admin_ensure_contracts: {
        Args: { contracts: Json; target_league: string }
        Returns: number
      }
      admin_fail_sim_job: {
        Args: { message: string; target_job: string }
        Returns: {
          created_at: string
          days_done: number
          days_requested: number
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          league_id: string
          season_id: string
          started_at: string | null
          status: string
          worker: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sim_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_hire_staff: {
        Args: {
          hire_team: string
          staff: string
          target_season: string
          years: number
        }
        Returns: {
          age: number
          contract_years: number | null
          first_name: string
          id: string
          last_name: string
          league_id: string
          rating: number
          role: string
          salary: number
          status: string
          team_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "staff_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_hold_lottery: {
        Args: { slots: Json; target_season: string }
        Returns: number
      }
      admin_make_offer: {
        Args: {
          offer_salary: number
          offer_team: string
          offer_years: number
          player: string
          target_season: string
        }
        Returns: {
          id: string
          league_id: string
          made_day: number
          player_id: string
          salary: number
          season_id: string
          status: string
          team_id: string
          years: number
        }
        SetofOptions: {
          from: "*"
          to: "fa_offers"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_make_picks: {
        Args: { picks: Json; target_season: string }
        Returns: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_record_event: {
        Args: { event_name: string; event_path?: string }
        Returns: undefined
      }
      admin_release_player: {
        Args: { player: string; release_team: string; target_season: string }
        Returns: number
      }
      admin_release_staff: {
        Args: { staff: string; target_season: string }
        Returns: {
          age: number
          contract_years: number | null
          first_name: string
          id: string
          last_name: string
          league_id: string
          rating: number
          role: string
          salary: number
          status: string
          team_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "staff_members"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_requeue_stale_sim_jobs: {
        Args: { max_age: string }
        Returns: number
      }
      admin_set_ai_assist: {
        Args: { flags: Json; target_team: string }
        Returns: {
          abbreviation: string
          ai_drafting: boolean
          ai_roster_coverage: boolean
          ai_roster_management: boolean
          ai_scouting: boolean
          ai_trades: boolean
          city: string
          city_id: string | null
          conference_id: string
          division_id: string
          id: string
          league_id: string
          local_player_slot: number | null
          logo_id: string | null
          nickname: string
          primary_color: string
          secondary_color: string
        }
        SetofOptions: {
          from: "*"
          to: "teams"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_set_camp: {
        Args: { assignments: Json; camp_team: string; target_season: string }
        Returns: number
      }
      admin_sign_player: {
        Args: {
          player: string
          sign_salary: number
          sign_team: string
          sign_years: number
          target_season: string
        }
        Returns: number
      }
      admin_start_season: {
        Args: { target_season: string }
        Returns: {
          archived_at: string | null
          created_at: string
          day: number
          fa_day: number
          id: string
          last_day: number
          league_id: string
          offseason_done_at: string | null
          phase: string
          playoff_config: Json | null
          salary_cap: number
          schedule_preset: string
          schedule_tiers: Json
          stage: string | null
          year: number
        }
        SetofOptions: {
          from: "*"
          to: "seasons"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      admin_submit_support_request: {
        Args: {
          request_category: string
          request_message: string
          request_subject: string
          sender_email: string
          sender_key: string
          sender_name: string
          sender_user: string
        }
        Returns: string
      }
      admin_withdraw_offer: {
        Args: { offer: string; target_season: string }
        Returns: number
      }
      cancel_sim_job: {
        Args: { target_job: string }
        Returns: {
          created_at: string
          days_done: number
          days_requested: number
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          league_id: string
          season_id: string
          started_at: string | null
          status: string
          worker: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sim_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      choose_team: {
        Args: { target_league: string; target_team: string }
        Returns: {
          config: Json | null
          config_schema_version: number | null
          created_at: string
          id: string
          name: string
          owner_id: string
          rng_state: number[]
          seed: string
          size: string
          status: string
          updated_at: string
          user_team_id: string | null
        }
        SetofOptions: {
          from: "*"
          to: "leagues"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      delete_own_account: { Args: never; Returns: undefined }
      enqueue_sim_job: {
        Args: { sim_kind: string; target_league: string }
        Returns: {
          created_at: string
          days_done: number
          days_requested: number
          error: string | null
          finished_at: string | null
          heartbeat_at: string | null
          id: string
          kind: string
          league_id: string
          season_id: string
          started_at: string | null
          status: string
          worker: string | null
        }
        SetofOptions: {
          from: "*"
          to: "sim_jobs"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      league_limit: { Args: never; Returns: number }
      rename_structure: {
        Args: {
          conference_names: Json
          division_names: Json
          target_league: string
        }
        Returns: undefined
      }
      season_limit: { Args: never; Returns: number }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

