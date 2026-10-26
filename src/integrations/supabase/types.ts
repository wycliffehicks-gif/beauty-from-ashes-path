export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      bfa_p3b_admissions: {
        Row: {
          charged_units: number | null
          created_at: string
          fingerprint: string
          mode: string
          owner_id: string
          receipt_id: string | null
          request_id: string
          reserved_units: number
          state: string
          thread_id: string
          thread_revision: number
          updated_at: string
        }
        Insert: {
          charged_units?: number | null
          created_at?: string
          fingerprint: string
          mode: string
          owner_id: string
          receipt_id?: string | null
          request_id: string
          reserved_units: number
          state?: string
          thread_id: string
          thread_revision: number
          updated_at?: string
        }
        Update: {
          charged_units?: number | null
          created_at?: string
          fingerprint?: string
          mode?: string
          owner_id?: string
          receipt_id?: string | null
          request_id?: string
          reserved_units?: number
          state?: string
          thread_id?: string
          thread_revision?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bfa_p3b_admissions_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "bfa_p3b_threads"
            referencedColumns: ["id"]
          },
        ]
      }
      bfa_p3b_allowances: {
        Row: {
          mode: string
          owner_id: string
          remaining_units: number
          reservation_units: number
        }
        Insert: {
          mode: string
          owner_id: string
          remaining_units?: number
          reservation_units?: number
        }
        Update: {
          mode?: string
          owner_id?: string
          remaining_units?: number
          reservation_units?: number
        }
        Relationships: []
      }
      bfa_p3b_staging_accounts: {
        Row: {
          admitted: boolean
          created_at: string
          expires_at: string
          user_id: string
        }
        Insert: {
          admitted?: boolean
          created_at?: string
          expires_at: string
          user_id: string
        }
        Update: {
          admitted?: boolean
          created_at?: string
          expires_at?: string
          user_id?: string
        }
        Relationships: []
      }
      bfa_p3b_threads: {
        Row: {
          created_at: string
          deleted_at: string | null
          id: string
          owner_id: string
          revision: number
          saved_at: string | null
          saved_revision: number | null
          saved_snapshot: Json | null
        }
        Insert: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          owner_id: string
          revision?: number
          saved_at?: string | null
          saved_revision?: number | null
          saved_snapshot?: Json | null
        }
        Update: {
          created_at?: string
          deleted_at?: string | null
          id?: string
          owner_id?: string
          revision?: number
          saved_at?: string | null
          saved_revision?: number | null
          saved_snapshot?: Json | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bfa_p3b_assert_staging: { Args: { p_owner: string }; Returns: undefined }
      bfa_p3b_claim: {
        Args: {
          p_fingerprint: string
          p_mode: string
          p_owner: string
          p_request: string
          p_revision: number
          p_thread: string
        }
        Returns: boolean
      }
      bfa_p3b_create: { Args: { p_owner: string }; Returns: string }
      bfa_p3b_fence: {
        Args: { p_action: string; p_owner: string; p_thread: string }
        Returns: number
      }
      bfa_p3b_finish: {
        Args: {
          p_owner: string
          p_request: string
          p_revision: number
          p_thread: string
        }
        Returns: number
      }
      bfa_p3b_guard: {
        Args: { p_owner: string; p_thread: string }
        Returns: {
          created_at: string
          deleted_at: string | null
          id: string
          owner_id: string
          revision: number
          saved_at: string | null
          saved_revision: number | null
          saved_snapshot: Json | null
        }
        SetofOptions: {
          from: "*"
          to: "bfa_p3b_threads"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      bfa_p3b_is_staging: { Args: never; Returns: boolean }
      bfa_p3b_reserve: {
        Args: {
          p_fingerprint: string
          p_mode: string
          p_owner: string
          p_request: string
          p_revision: number
          p_thread: string
        }
        Returns: Json
      }
      bfa_p3b_settle: {
        Args: {
          p_charged: number
          p_owner: string
          p_receipt: string
          p_request: string
        }
        Returns: boolean
      }
      bfa_p3b_transition: {
        Args: {
          p_action: string
          p_owner: string
          p_revision: number
          p_snapshot?: Json
          p_thread: string
        }
        Returns: number
      }
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
