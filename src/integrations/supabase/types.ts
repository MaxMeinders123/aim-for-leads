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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      campaigns: {
        Row: {
          companies_count: number | null
          contacts_count: number | null
          created_at: string
          id: string
          job_titles: string | null
          name: string
          pain_points: string | null
          personas: string | null
          primary_angle: string | null
          product: string | null
          product_category: string | null
          secondary_angle: string | null
          target_region: string | null
          target_verticals: string | null
          technical_focus: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          companies_count?: number | null
          contacts_count?: number | null
          created_at?: string
          id?: string
          job_titles?: string | null
          name: string
          pain_points?: string | null
          personas?: string | null
          primary_angle?: string | null
          product?: string | null
          product_category?: string | null
          secondary_angle?: string | null
          target_region?: string | null
          target_verticals?: string | null
          technical_focus?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          companies_count?: number | null
          contacts_count?: number | null
          created_at?: string
          id?: string
          job_titles?: string | null
          name?: string
          pain_points?: string | null
          personas?: string | null
          primary_angle?: string | null
          product?: string | null
          product_category?: string | null
          secondary_angle?: string | null
          target_region?: string | null
          target_verticals?: string | null
          technical_focus?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      companies: {
        Row: {
          campaign_id: string
          created_at: string
          id: string
          linkedin_url: string | null
          name: string
          website: string | null
        }
        Insert: {
          campaign_id: string
          created_at?: string
          id?: string
          linkedin_url?: string | null
          name: string
          website?: string | null
        }
        Update: {
          campaign_id?: string
          created_at?: string
          id?: string
          linkedin_url?: string | null
          name?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          campaign_id: string
          company_id: string | null
          company_name: string | null
          created_at: string
          email: string | null
          id: string
          linkedin_url: string | null
          name: string
          phone: string | null
          priority: string | null
          title: string | null
        }
        Insert: {
          campaign_id: string
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          linkedin_url?: string | null
          name: string
          phone?: string | null
          priority?: string | null
          title?: string | null
        }
        Update: {
          campaign_id?: string
          company_id?: string | null
          company_name?: string | null
          created_at?: string
          email?: string | null
          id?: string
          linkedin_url?: string | null
          name?: string
          phone?: string | null
          priority?: string | null
          title?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string | null
          id: string
          name: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          name?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      research_results: {
        Row: {
          clay_response: Json | null
          clay_triggered: boolean | null
          company_data: Json | null
          company_domain: string
          created_at: string
          error_message: string | null
          id: string
          prospect_data: Json | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          clay_response?: Json | null
          clay_triggered?: boolean | null
          company_data?: Json | null
          company_domain: string
          created_at?: string
          error_message?: string | null
          id?: string
          prospect_data?: Json | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          clay_response?: Json | null
          clay_triggered?: boolean | null
          company_data?: Json | null
          company_domain?: string
          created_at?: string
          error_message?: string | null
          id?: string
          prospect_data?: Json | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_integrations: {
        Row: {
          clay_webhook_url: string | null
          company_research_webhook_url: string | null
          created_at: string
          dark_mode: boolean | null
          id: string
          n8n_webhook_url: string | null
          people_research_webhook_url: string | null
          salesforce_webhook_url: string | null
          sound_effects: boolean | null
          updated_at: string
          user_id: string
        }
        Insert: {
          clay_webhook_url?: string | null
          company_research_webhook_url?: string | null
          created_at?: string
          dark_mode?: boolean | null
          id?: string
          n8n_webhook_url?: string | null
          people_research_webhook_url?: string | null
          salesforce_webhook_url?: string | null
          sound_effects?: boolean | null
          updated_at?: string
          user_id: string
        }
        Update: {
          clay_webhook_url?: string | null
          company_research_webhook_url?: string | null
          created_at?: string
          dark_mode?: boolean | null
          id?: string
          n8n_webhook_url?: string | null
          people_research_webhook_url?: string | null
          salesforce_webhook_url?: string | null
          sound_effects?: boolean | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
