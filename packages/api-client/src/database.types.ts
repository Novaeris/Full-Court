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
      players: {
        Row: {
          age: number
          ball_handling: number
          def_rebound: number
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
          speed: number
          stamina: number
          strength: number
          team_id: string | null
          three_point: number
          weight_pounds: number
        }
        Insert: {
          age: number
          ball_handling: number
          def_rebound: number
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
          speed: number
          stamina: number
          strength: number
          team_id?: string | null
          three_point: number
          weight_pounds: number
        }
        Update: {
          age?: number
          ball_handling?: number
          def_rebound?: number
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
          speed?: number
          stamina?: number
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
            foreignKeyName: "players_league_id_team_id_fkey"
            columns: ["league_id", "team_id"]
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
      admin_record_event: {
        Args: { event_name: string; event_path?: string }
        Returns: undefined
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
      league_limit: { Args: never; Returns: number }
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

