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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      admin_project_settings: {
        Row: { id: boolean; knowledge: string; security_notes: string; revision: number; updated_at: string; updated_by: string | null }
        Insert: { id?: boolean; knowledge?: string; security_notes?: string; revision?: number; updated_at?: string; updated_by?: string | null }
        Update: { knowledge?: string; security_notes?: string; revision?: number; updated_at?: string; updated_by?: string | null }
        Relationships: []
      }
      ace_knowledge: {
        Row: {
          body: string
          created_at: string
          id: string
          kind: string
          quality: number
          region: string | null
          search: unknown
          source: string
          source_ref: string
          state: string | null
          tags: string[]
          title: string
          updated_at: string
        }
        Insert: {
          body: string
          created_at?: string
          id?: string
          kind: string
          quality?: number
          region?: string | null
          search?: unknown
          source: string
          source_ref: string
          state?: string | null
          tags?: string[]
          title: string
          updated_at?: string
        }
        Update: {
          body?: string
          created_at?: string
          id?: string
          kind?: string
          quality?: number
          region?: string | null
          search?: unknown
          source?: string
          source_ref?: string
          state?: string | null
          tags?: string[]
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      ace_knowledge_runs: {
        Row: {
          added: number
          finished_at: string | null
          id: string
          note: string | null
          started_at: string
          updated: number
        }
        Insert: {
          added?: number
          finished_at?: string | null
          id?: string
          note?: string | null
          started_at?: string
          updated?: number
        }
        Update: {
          added?: number
          finished_at?: string | null
          id?: string
          note?: string | null
          started_at?: string
          updated?: number
        }
        Relationships: []
      }
      achievements: {
        Row: {
          category: Database["public"]["Enums"]["achievement_category"]
          coin_reward: number
          created_at: string
          description: string
          icon: string
          key: string
          name: string
          sort_order: number
          tier: Database["public"]["Enums"]["achievement_tier"]
          xp_reward: number
        }
        Insert: {
          category: Database["public"]["Enums"]["achievement_category"]
          coin_reward?: number
          created_at?: string
          description: string
          icon?: string
          key: string
          name: string
          sort_order?: number
          tier?: Database["public"]["Enums"]["achievement_tier"]
          xp_reward?: number
        }
        Update: {
          category?: Database["public"]["Enums"]["achievement_category"]
          coin_reward?: number
          created_at?: string
          description?: string
          icon?: string
          key?: string
          name?: string
          sort_order?: number
          tier?: Database["public"]["Enums"]["achievement_tier"]
          xp_reward?: number
        }
        Relationships: []
      }
      action_items: {
        Row: {
          category: string
          completed_at: string | null
          created_at: string
          current_value: number
          description: string | null
          due_date: string | null
          id: string
          is_system: boolean
          priority: number
          status: string
          system_key: string | null
          target_value: number | null
          title: string
          unit: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          category?: string
          completed_at?: string | null
          created_at?: string
          current_value?: number
          description?: string | null
          due_date?: string | null
          id?: string
          is_system?: boolean
          priority?: number
          status?: string
          system_key?: string | null
          target_value?: number | null
          title: string
          unit?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          category?: string
          completed_at?: string | null
          created_at?: string
          current_value?: number
          description?: string | null
          due_date?: string | null
          id?: string
          is_system?: boolean
          priority?: number
          status?: string
          system_key?: string | null
          target_value?: number | null
          title?: string
          unit?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      admin_override_log: {
        Row: {
          action: string
          admin_id: string
          created_at: string
          entity_id: string
          entity_type: string
          id: string
          new_value: Json | null
          old_value: Json | null
          reason: string
        }
        Insert: {
          action: string
          admin_id: string
          created_at?: string
          entity_id: string
          entity_type: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason: string
        }
        Update: {
          action?: string
          admin_id?: string
          created_at?: string
          entity_id?: string
          entity_type?: string
          id?: string
          new_value?: Json | null
          old_value?: Json | null
          reason?: string
        }
        Relationships: []
      }
      admin_settings: {
        Row: {
          id: boolean
          last_activity_at: string | null
          last_seeded_at: string | null
          mock_data_enabled: boolean
          platform_config: Json
          sandbox_email: string | null
          sandbox_password_hint: string | null
          sandbox_user_id: string | null
          updated_at: string
        }
        Insert: {
          id?: boolean
          last_activity_at?: string | null
          last_seeded_at?: string | null
          mock_data_enabled?: boolean
          platform_config?: Json
          sandbox_email?: string | null
          sandbox_password_hint?: string | null
          sandbox_user_id?: string | null
          updated_at?: string
        }
        Update: {
          id?: boolean
          last_activity_at?: string | null
          last_seeded_at?: string | null
          mock_data_enabled?: boolean
          platform_config?: Json
          sandbox_email?: string | null
          sandbox_password_hint?: string | null
          sandbox_user_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      app_bottom_nav_default: {
        Row: {
          id: boolean
          keys: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          id?: boolean
          keys?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          id?: boolean
          keys?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      app_user_connections: {
        Row: {
          connection_key_ciphertext: string
          connector_id: string
          created_at: string
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          connection_key_ciphertext: string
          connector_id: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          connection_key_ciphertext?: string
          connector_id?: string
          created_at?: string
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      avatar_configs: {
        Row: {
          accessory_item_id: string | null
          ai_prompt: Json | null
          background: string
          body_type: string
          brow_style: string
          builder_glb_url: string | null
          builder_morphs: Json | null
          created_at: string
          details: Json
          eye_color: string
          eye_shape: string
          facial_hair: string
          glasses_item_id: string | null
          hair_color: string
          hair_style: string
          hat_item_id: string | null
          height_cm: number
          jacket_item_id: string | null
          library_preset_id: string | null
          mouth_style: string
          pose: string
          rpm_avatar_updated_at: string | null
          rpm_avatar_url: string | null
          shirt_item_id: string | null
          shoes_item_id: string | null
          shorts_item_id: string | null
          skin_tone: string
          source: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accessory_item_id?: string | null
          ai_prompt?: Json | null
          background?: string
          body_type?: string
          brow_style?: string
          builder_glb_url?: string | null
          builder_morphs?: Json | null
          created_at?: string
          details?: Json
          eye_color?: string
          eye_shape?: string
          facial_hair?: string
          glasses_item_id?: string | null
          hair_color?: string
          hair_style?: string
          hat_item_id?: string | null
          height_cm?: number
          jacket_item_id?: string | null
          library_preset_id?: string | null
          mouth_style?: string
          pose?: string
          rpm_avatar_updated_at?: string | null
          rpm_avatar_url?: string | null
          shirt_item_id?: string | null
          shoes_item_id?: string | null
          shorts_item_id?: string | null
          skin_tone?: string
          source?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accessory_item_id?: string | null
          ai_prompt?: Json | null
          background?: string
          body_type?: string
          brow_style?: string
          builder_glb_url?: string | null
          builder_morphs?: Json | null
          created_at?: string
          details?: Json
          eye_color?: string
          eye_shape?: string
          facial_hair?: string
          glasses_item_id?: string | null
          hair_color?: string
          hair_style?: string
          hat_item_id?: string | null
          height_cm?: number
          jacket_item_id?: string | null
          library_preset_id?: string | null
          mouth_style?: string
          pose?: string
          rpm_avatar_updated_at?: string | null
          rpm_avatar_url?: string | null
          shirt_item_id?: string | null
          shoes_item_id?: string | null
          shorts_item_id?: string | null
          skin_tone?: string
          source?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_configs_accessory_item_id_fkey"
            columns: ["accessory_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_configs_glasses_item_id_fkey"
            columns: ["glasses_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_configs_hat_item_id_fkey"
            columns: ["hat_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_configs_jacket_item_id_fkey"
            columns: ["jacket_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_configs_library_preset_id_fkey"
            columns: ["library_preset_id"]
            isOneToOne: false
            referencedRelation: "avatar_library_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_configs_shirt_item_id_fkey"
            columns: ["shirt_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_configs_shoes_item_id_fkey"
            columns: ["shoes_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "avatar_configs_shorts_item_id_fkey"
            columns: ["shorts_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
        ]
      }
      avatar_library_presets: {
        Row: {
          avg_rating: number | null
          created_at: string
          created_by: string | null
          glb_url: string
          id: string
          is_official: boolean
          morphs: Json
          name: string
          slug: string
          source: string
          tags: string[]
          thumbnail_url: string | null
          updated_at: string
          usage_count: number
        }
        Insert: {
          avg_rating?: number | null
          created_at?: string
          created_by?: string | null
          glb_url: string
          id?: string
          is_official?: boolean
          morphs?: Json
          name: string
          slug: string
          source: string
          tags?: string[]
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number
        }
        Update: {
          avg_rating?: number | null
          created_at?: string
          created_by?: string | null
          glb_url?: string
          id?: string
          is_official?: boolean
          morphs?: Json
          name?: string
          slug?: string
          source?: string
          tags?: string[]
          thumbnail_url?: string | null
          updated_at?: string
          usage_count?: number
        }
        Relationships: []
      }
      avatar_library_uses: {
        Row: {
          id: string
          preset_id: string
          used_at: string
          user_id: string
        }
        Insert: {
          id?: string
          preset_id: string
          used_at?: string
          user_id: string
        }
        Update: {
          id?: string
          preset_id?: string
          used_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "avatar_library_uses_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "avatar_library_presets"
            referencedColumns: ["id"]
          },
        ]
      }
      bag_configs: {
        Row: {
          bag_item_id: string | null
          bag_primary_color: string
          bag_secondary_color: string
          cart_item_id: string | null
          cart_primary_color: string
          cart_secondary_color: string
          created_at: string
          patch_text: string | null
          updated_at: string
          user_id: string
          wheel_style: string
        }
        Insert: {
          bag_item_id?: string | null
          bag_primary_color?: string
          bag_secondary_color?: string
          cart_item_id?: string | null
          cart_primary_color?: string
          cart_secondary_color?: string
          created_at?: string
          patch_text?: string | null
          updated_at?: string
          user_id: string
          wheel_style?: string
        }
        Update: {
          bag_item_id?: string | null
          bag_primary_color?: string
          bag_secondary_color?: string
          cart_item_id?: string | null
          cart_primary_color?: string
          cart_secondary_color?: string
          created_at?: string
          patch_text?: string | null
          updated_at?: string
          user_id?: string
          wheel_style?: string
        }
        Relationships: [
          {
            foreignKeyName: "bag_configs_bag_item_id_fkey"
            columns: ["bag_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bag_configs_cart_item_id_fkey"
            columns: ["cart_item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_feedback: {
        Row: {
          assigned_to: string | null
          body: string | null
          build_label: string | null
          comment_count: number
          created_at: string
          feature_area: string | null
          id: string
          kind: Database["public"]["Enums"]["beta_feedback_kind"]
          page_label: string | null
          priority: number
          rating: number | null
          resolution_note: string | null
          resolved_at: string | null
          route_path: string | null
          screenshot_path: string | null
          severity: Database["public"]["Enums"]["beta_feedback_severity"] | null
          status: Database["public"]["Enums"]["beta_feedback_status"]
          title: string
          updated_at: string
          user_agent: string | null
          user_id: string
          viewport: string | null
          vote_count: number
        }
        Insert: {
          assigned_to?: string | null
          body?: string | null
          build_label?: string | null
          comment_count?: number
          created_at?: string
          feature_area?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["beta_feedback_kind"]
          page_label?: string | null
          priority?: number
          rating?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          route_path?: string | null
          screenshot_path?: string | null
          severity?:
            | Database["public"]["Enums"]["beta_feedback_severity"]
            | null
          status?: Database["public"]["Enums"]["beta_feedback_status"]
          title: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          viewport?: string | null
          vote_count?: number
        }
        Update: {
          assigned_to?: string | null
          body?: string | null
          build_label?: string | null
          comment_count?: number
          created_at?: string
          feature_area?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["beta_feedback_kind"]
          page_label?: string | null
          priority?: number
          rating?: number | null
          resolution_note?: string | null
          resolved_at?: string | null
          route_path?: string | null
          screenshot_path?: string | null
          severity?:
            | Database["public"]["Enums"]["beta_feedback_severity"]
            | null
          status?: Database["public"]["Enums"]["beta_feedback_status"]
          title?: string
          updated_at?: string
          user_agent?: string | null
          user_id?: string
          viewport?: string | null
          vote_count?: number
        }
        Relationships: []
      }
      beta_feedback_comments: {
        Row: {
          body: string
          created_at: string
          feedback_id: string
          id: string
          is_internal: boolean
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          feedback_id: string
          id?: string
          is_internal?: boolean
          user_id?: string
        }
        Update: {
          body?: string
          created_at?: string
          feedback_id?: string
          id?: string
          is_internal?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_feedback_comments_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "beta_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_feedback_votes: {
        Row: {
          created_at: string
          feedback_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          feedback_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          feedback_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "beta_feedback_votes_feedback_id_fkey"
            columns: ["feedback_id"]
            isOneToOne: false
            referencedRelation: "beta_feedback"
            referencedColumns: ["id"]
          },
        ]
      }
      beta_program: {
        Row: {
          build_label: string
          contact_email: string | null
          focus_areas: string[]
          id: boolean
          is_enabled: boolean
          program_name: string
          show_banner: boolean
          updated_at: string
          updated_by: string | null
          welcome_message: string
        }
        Insert: {
          build_label?: string
          contact_email?: string | null
          focus_areas?: string[]
          id?: boolean
          is_enabled?: boolean
          program_name?: string
          show_banner?: boolean
          updated_at?: string
          updated_by?: string | null
          welcome_message?: string
        }
        Update: {
          build_label?: string
          contact_email?: string | null
          focus_areas?: string[]
          id?: boolean
          is_enabled?: boolean
          program_name?: string
          show_banner?: boolean
          updated_at?: string
          updated_by?: string | null
          welcome_message?: string
        }
        Relationships: []
      }
      billing_events: {
        Row: {
          created_at: string
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          processed_ok: boolean
          provider: string
          provider_event_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          event_type: string
          id?: string
          payload?: Json
          processed_ok?: boolean
          provider: string
          provider_event_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          processed_ok?: boolean
          provider?: string
          provider_event_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      blocks: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
        }
        Relationships: []
      }
      caddy_conversations: {
        Row: {
          created_at: string
          id: string
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      caddy_messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string
          id: string
          role: string
          user_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string
          id?: string
          role: string
          user_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "caddy_messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "caddy_conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_round_sources: {
        Row: {
          canonical_round_id: string
          created_at: string
          id: string
          match_level: string
          source: string
          source_round_rating: number | null
          source_row_id: string
          source_score: number | null
          source_table: string
          user_id: string
        }
        Insert: {
          canonical_round_id: string
          created_at?: string
          id?: string
          match_level: string
          source: string
          source_round_rating?: number | null
          source_row_id: string
          source_score?: number | null
          source_table: string
          user_id: string
        }
        Update: {
          canonical_round_id?: string
          created_at?: string
          id?: string
          match_level?: string
          source?: string
          source_round_rating?: number | null
          source_row_id?: string
          source_score?: number | null
          source_table?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "canonical_round_sources_canonical_round_id_fkey"
            columns: ["canonical_round_id"]
            isOneToOne: false
            referencedRelation: "canonical_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      canonical_rounds: {
        Row: {
          course_id: string | null
          course_key: string | null
          course_name: string | null
          created_at: string
          eligibility: string
          event_id: string | null
          event_kind: string | null
          event_name: string | null
          event_round_number: number | null
          format: string
          has_possible_duplicate: boolean
          id: string
          layout_id: string | null
          layout_name: string | null
          played_on: string
          primary_source: string
          score: number | null
          source_count: number
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          course_key?: string | null
          course_name?: string | null
          created_at?: string
          eligibility?: string
          event_id?: string | null
          event_kind?: string | null
          event_name?: string | null
          event_round_number?: number | null
          format?: string
          has_possible_duplicate?: boolean
          id?: string
          layout_id?: string | null
          layout_name?: string | null
          played_on: string
          primary_source: string
          score?: number | null
          source_count?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string | null
          course_key?: string | null
          course_name?: string | null
          created_at?: string
          eligibility?: string
          event_id?: string | null
          event_kind?: string | null
          event_name?: string | null
          event_round_number?: number | null
          format?: string
          has_possible_duplicate?: boolean
          id?: string
          layout_id?: string | null
          layout_name?: string | null
          played_on?: string
          primary_source?: string
          score?: number | null
          source_count?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      challenges: {
        Row: {
          active: boolean
          coin_reward: number
          created_at: string
          description: string
          ends_at: string | null
          goal_target: number
          goal_type: Database["public"]["Enums"]["challenge_goal_type"]
          id: string
          key: string
          kind: Database["public"]["Enums"]["challenge_kind"]
          starts_at: string
          title: string
          xp_reward: number
        }
        Insert: {
          active?: boolean
          coin_reward?: number
          created_at?: string
          description: string
          ends_at?: string | null
          goal_target: number
          goal_type: Database["public"]["Enums"]["challenge_goal_type"]
          id?: string
          key: string
          kind: Database["public"]["Enums"]["challenge_kind"]
          starts_at?: string
          title: string
          xp_reward?: number
        }
        Update: {
          active?: boolean
          coin_reward?: number
          created_at?: string
          description?: string
          ends_at?: string | null
          goal_target?: number
          goal_type?: Database["public"]["Enums"]["challenge_goal_type"]
          id?: string
          key?: string
          kind?: Database["public"]["Enums"]["challenge_kind"]
          starts_at?: string
          title?: string
          xp_reward?: number
        }
        Relationships: []
      }
      club_members: {
        Row: {
          club_id: string
          created_at: string
          role: Database["public"]["Enums"]["club_role"]
          user_id: string
        }
        Insert: {
          club_id: string
          created_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          user_id: string
        }
        Update: {
          club_id?: string
          created_at?: string
          role?: Database["public"]["Enums"]["club_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "club_members_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
        ]
      }
      clubhouse_checkins: {
        Row: {
          avatar_url: string | null
          checked_in_at: string
          display_name: string
          room_key: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          checked_in_at?: string
          display_name?: string
          room_key: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          avatar_url?: string | null
          checked_in_at?: string
          display_name?: string
          room_key?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      clubhouse_reports: {
        Row: {
          created_at: string
          id: string
          note: string | null
          reason: string
          reported_user_id: string
          reporter_id: string
          room_key: string
          status: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          reason: string
          reported_user_id: string
          reporter_id?: string
          room_key: string
          status?: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          reason?: string
          reported_user_id?: string
          reporter_id?: string
          room_key?: string
          status?: string
        }
        Relationships: []
      }
      clubs: {
        Row: {
          avatar_url: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          discgolfscene_url: string | null
          discord_url: string | null
          external_id: string | null
          external_source: string | null
          facebook_url: string | null
          id: string
          instagram_url: string | null
          last_synced_at: string | null
          latitude: number | null
          location: string | null
          longitude: number | null
          member_count: number
          name: string
          owner_id: string
          slug: string
          tiktok_url: string | null
          updated_at: string
          website_url: string | null
          x_url: string | null
          youtube_url: string | null
        }
        Insert: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          discgolfscene_url?: string | null
          discord_url?: string | null
          external_id?: string | null
          external_source?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          member_count?: number
          name: string
          owner_id: string
          slug: string
          tiktok_url?: string | null
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Update: {
          avatar_url?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          discgolfscene_url?: string | null
          discord_url?: string | null
          external_id?: string | null
          external_source?: string | null
          facebook_url?: string | null
          id?: string
          instagram_url?: string | null
          last_synced_at?: string | null
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          member_count?: number
          name?: string
          owner_id?: string
          slug?: string
          tiktok_url?: string | null
          updated_at?: string
          website_url?: string | null
          x_url?: string | null
          youtube_url?: string | null
        }
        Relationships: []
      }
      comment_likes: {
        Row: {
          comment_id: string
          created_at: string
          reaction: string
          user_id: string
        }
        Insert: {
          comment_id: string
          created_at?: string
          reaction?: string
          user_id: string
        }
        Update: {
          comment_id?: string
          created_at?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comment_likes_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
        ]
      }
      comments: {
        Row: {
          author_id: string
          body: string
          created_at: string
          id: string
          like_count: number
          parent_id: string | null
          post_id: string
        }
        Insert: {
          author_id: string
          body: string
          created_at?: string
          id?: string
          like_count?: number
          parent_id?: string | null
          post_id: string
        }
        Update: {
          author_id?: string
          body?: string
          created_at?: string
          id?: string
          like_count?: number
          parent_id?: string | null
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "comments_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      community_events: {
        Row: {
          capacity: number | null
          cause: string | null
          course_id: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          ends_at: string | null
          host_id: string
          id: string
          kind: Database["public"]["Enums"]["community_event_kind"]
          latitude: number | null
          location: string | null
          longitude: number | null
          starts_at: string
          status: string
          title: string
          updated_at: string
        }
        Insert: {
          capacity?: number | null
          cause?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          host_id: string
          id?: string
          kind: Database["public"]["Enums"]["community_event_kind"]
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          starts_at: string
          status?: string
          title: string
          updated_at?: string
        }
        Update: {
          capacity?: number | null
          cause?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          ends_at?: string | null
          host_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["community_event_kind"]
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          starts_at?: string
          status?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "community_events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ambassadors: {
        Row: {
          approved_by: string | null
          created_at: string
          ended_at: string | null
          entity_id: string
          entity_kind: Database["public"]["Enums"]["ambassador_entity"]
          entity_name: string | null
          id: string
          is_active: boolean
          notes: string | null
          role_title: string | null
          since: string
          updated_at: string
          user_id: string
        }
        Insert: {
          approved_by?: string | null
          created_at?: string
          ended_at?: string | null
          entity_id: string
          entity_kind: Database["public"]["Enums"]["ambassador_entity"]
          entity_name?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          role_title?: string | null
          since?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          approved_by?: string | null
          created_at?: string
          ended_at?: string | null
          entity_id?: string
          entity_kind?: Database["public"]["Enums"]["ambassador_entity"]
          entity_name?: string | null
          id?: string
          is_active?: boolean
          notes?: string | null
          role_title?: string | null
          since?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      content_drafts: {
        Row: {
          body: string | null
          club_id: string | null
          course_id: string | null
          created_at: string
          cross_post_targets: Json
          event_id: string | null
          id: string
          kind: Database["public"]["Enums"]["content_draft_kind"]
          media: Json
          mentions: string[]
          publish_error: string | null
          published_at: string | null
          published_post_id: string | null
          round_id: string | null
          scheduled_at: string | null
          series_id: string | null
          status: Database["public"]["Enums"]["content_draft_status"]
          tags: string[]
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          body?: string | null
          club_id?: string | null
          course_id?: string | null
          created_at?: string
          cross_post_targets?: Json
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["content_draft_kind"]
          media?: Json
          mentions?: string[]
          publish_error?: string | null
          published_at?: string | null
          published_post_id?: string | null
          round_id?: string | null
          scheduled_at?: string | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["content_draft_status"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          body?: string | null
          club_id?: string | null
          course_id?: string | null
          created_at?: string
          cross_post_targets?: Json
          event_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["content_draft_kind"]
          media?: Json
          mentions?: string[]
          publish_error?: string | null
          published_at?: string | null
          published_post_id?: string | null
          round_id?: string | null
          scheduled_at?: string | null
          series_id?: string | null
          status?: Database["public"]["Enums"]["content_draft_status"]
          tags?: string[]
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "content_drafts_published_post_id_fkey"
            columns: ["published_post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_drafts_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "content_series"
            referencedColumns: ["id"]
          },
        ]
      }
      content_ideas: {
        Row: {
          created_at: string
          id: string
          is_used: boolean
          notes: string | null
          prompt: string
          source: string | null
          suggested_kind:
            | Database["public"]["Enums"]["content_draft_kind"]
            | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_used?: boolean
          notes?: string | null
          prompt: string
          source?: string | null
          suggested_kind?:
            | Database["public"]["Enums"]["content_draft_kind"]
            | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          is_used?: boolean
          notes?: string | null
          prompt?: string
          source?: string | null
          suggested_kind?:
            | Database["public"]["Enums"]["content_draft_kind"]
            | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      content_series: {
        Row: {
          cadence: string | null
          color: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          name: string
          slug: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cadence?: string | null
          color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          slug?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cadence?: string | null
          color?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          slug?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      contribution_verifications: {
        Row: {
          contribution_id: string
          created_at: string
          id: string
          note: string | null
          verifier_id: string
          vote: Database["public"]["Enums"]["verification_vote"]
        }
        Insert: {
          contribution_id: string
          created_at?: string
          id?: string
          note?: string | null
          verifier_id: string
          vote: Database["public"]["Enums"]["verification_vote"]
        }
        Update: {
          contribution_id?: string
          created_at?: string
          id?: string
          note?: string | null
          verifier_id?: string
          vote?: Database["public"]["Enums"]["verification_vote"]
        }
        Relationships: [
          {
            foreignKeyName: "contribution_verifications_contribution_id_fkey"
            columns: ["contribution_id"]
            isOneToOne: false
            referencedRelation: "contributions"
            referencedColumns: ["id"]
          },
        ]
      }
      contributions: {
        Row: {
          approve_count: number
          course_id: string | null
          created_at: string
          details: string | null
          evidence_url: string | null
          hole_id: string | null
          id: string
          kind: Database["public"]["Enums"]["contribution_kind"]
          layout_id: string | null
          points: number
          quantity: number
          reject_count: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["contribution_status"]
          summary: string
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          approve_count?: number
          course_id?: string | null
          created_at?: string
          details?: string | null
          evidence_url?: string | null
          hole_id?: string | null
          id?: string
          kind: Database["public"]["Enums"]["contribution_kind"]
          layout_id?: string | null
          points?: number
          quantity?: number
          reject_count?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
          summary: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          approve_count?: number
          course_id?: string | null
          created_at?: string
          details?: string | null
          evidence_url?: string | null
          hole_id?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["contribution_kind"]
          layout_id?: string | null
          points?: number
          quantity?: number
          reject_count?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["contribution_status"]
          summary?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contributions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "contributions_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_hole_id_fkey"
            columns: ["hole_id"]
            isOneToOne: false
            referencedRelation: "holes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contributions_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_invites: {
        Row: {
          conversation_id: string
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          max_uses: number | null
          token: string
          uses: number
        }
        Insert: {
          conversation_id: string
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          token: string
          uses?: number
        }
        Update: {
          conversation_id?: string
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          max_uses?: number | null
          token?: string
          uses?: number
        }
        Relationships: [
          {
            foreignKeyName: "conversation_invites_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversation_members: {
        Row: {
          conversation_id: string
          created_at: string
          last_read_at: string
          user_id: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          last_read_at?: string
          user_id: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          last_read_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_members_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          avatar_url: string | null
          created_at: string
          created_by: string | null
          event_id: string | null
          event_kind: string | null
          id: string
          is_group: boolean
          kind: string
          last_message_at: string
          name: string | null
          title: string | null
          topic: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          event_kind?: string | null
          id?: string
          is_group?: boolean
          kind?: string
          last_message_at?: string
          name?: string | null
          title?: string | null
          topic?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          event_id?: string | null
          event_kind?: string | null
          id?: string
          is_group?: boolean
          kind?: string
          last_message_at?: string
          name?: string | null
          title?: string | null
          topic?: string | null
        }
        Relationships: []
      }
      course_atlas_runs: {
        Row: {
          finished_at: string | null
          id: string
          idle_passes: number
          last_error: string | null
          last_pass_at: string | null
          lease_until: string | null
          passes: number
          stages: Json
          started_at: string
          started_by: string | null
          status: string
          totals: Json
        }
        Insert: {
          finished_at?: string | null
          id?: string
          idle_passes?: number
          last_error?: string | null
          last_pass_at?: string | null
          lease_until?: string | null
          passes?: number
          stages?: Json
          started_at?: string
          started_by?: string | null
          status?: string
          totals?: Json
        }
        Update: {
          finished_at?: string | null
          id?: string
          idle_passes?: number
          last_error?: string | null
          last_pass_at?: string | null
          lease_until?: string | null
          passes?: number
          stages?: Json
          started_at?: string
          started_by?: string | null
          status?: string
          totals?: Json
        }
        Relationships: []
      }
      course_baskets: {
        Row: {
          course_hole_id: string
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          source: string
          source_observation_id: string | null
          status: string
        }
        Insert: {
          course_hole_id: string
          course_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          source?: string
          source_observation_id?: string | null
          status?: string
        }
        Update: {
          course_hole_id?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          source?: string
          source_observation_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_baskets_course_hole_id_fkey"
            columns: ["course_hole_id"]
            isOneToOne: false
            referencedRelation: "course_holes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_baskets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_baskets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_baskets_source_observation_id_fkey"
            columns: ["source_observation_id"]
            isOneToOne: false
            referencedRelation: "course_geometry_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      course_book_entries: {
        Row: {
          course_id: string | null
          course_key: string
          created_at: string
          display_name: string
          id: string
          location: string | null
          notes: string | null
          pinned: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          course_id?: string | null
          course_key: string
          created_at?: string
          display_name: string
          id?: string
          location?: string | null
          notes?: string | null
          pinned?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          course_id?: string | null
          course_key?: string
          created_at?: string
          display_name?: string
          id?: string
          location?: string | null
          notes?: string | null
          pinned?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_book_entries_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_book_entries_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_book_media: {
        Row: {
          caption: string | null
          created_at: string
          entry_id: string
          id: string
          kind: string
          storage_path: string
          taken_on: string | null
          user_id: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          entry_id: string
          id?: string
          kind: string
          storage_path: string
          taken_on?: string | null
          user_id: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          entry_id?: string
          id?: string
          kind?: string
          storage_path?: string
          taken_on?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_book_media_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "course_book_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      course_change_proposals: {
        Row: {
          course_id: string
          created_at: string
          current_value: Json | null
          effective_from: string | null
          feature_id: string | null
          id: string
          kind: string
          photo_url: string | null
          proposed_by: string
          proposed_value: Json
          reason: string | null
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          risk: string
          status: string
        }
        Insert: {
          course_id: string
          created_at?: string
          current_value?: Json | null
          effective_from?: string | null
          feature_id?: string | null
          id?: string
          kind: string
          photo_url?: string | null
          proposed_by?: string
          proposed_value: Json
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk?: string
          status?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          current_value?: Json | null
          effective_from?: string | null
          feature_id?: string | null
          id?: string
          kind?: string
          photo_url?: string | null
          proposed_by?: string
          proposed_value?: Json
          reason?: string | null
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          risk?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_change_proposals_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_change_proposals_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_condition_categories: {
        Row: {
          archive_days: number
          default_priority: string
          duplicate_radius_ft: number
          key: string
          label: string
          recheck_days: number
          sort_order: number
          stale_days: number
        }
        Insert: {
          archive_days: number
          default_priority?: string
          duplicate_radius_ft?: number
          key: string
          label: string
          recheck_days: number
          sort_order?: number
          stale_days: number
        }
        Update: {
          archive_days?: number
          default_priority?: string
          duplicate_radius_ft?: number
          key?: string
          label?: string
          recheck_days?: number
          sort_order?: number
          stale_days?: number
        }
        Relationships: []
      }
      course_condition_responses: {
        Row: {
          created_at: string
          id: string
          note: string | null
          photo_url: string | null
          report_id: string
          response: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          note?: string | null
          photo_url?: string | null
          report_id: string
          response: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          note?: string | null
          photo_url?: string | null
          report_id?: string
          response?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_condition_responses_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "course_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      course_contributor_trust: {
        Row: {
          accepted_reports: number
          accurate_responses: number
          approved_proposals: number
          rejected_proposals: number
          rejected_reports: number
          score: number
          updated_at: string
          user_id: string
        }
        Insert: {
          accepted_reports?: number
          accurate_responses?: number
          approved_proposals?: number
          rejected_proposals?: number
          rejected_reports?: number
          score?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          accepted_reports?: number
          accurate_responses?: number
          approved_proposals?: number
          rejected_proposals?: number
          rejected_reports?: number
          score?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      course_edit_requests: {
        Row: {
          course_id: string
          created_at: string
          id: string
          payload: Json
          rejection_reason: string | null
          requested_by: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["moderation_status"]
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          id?: string
          payload: Json
          rejection_reason?: string | null
          requested_by: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["moderation_status"]
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          id?: string
          payload?: Json
          rejection_reason?: string | null
          requested_by?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["moderation_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_edit_requests_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_edit_requests_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_event_overlays: {
        Row: {
          course_id: string
          created_at: string
          created_by: string
          ends_on: string | null
          id: string
          layout_id: string | null
          league_event_id: string | null
          name: string
          starts_on: string | null
          tournament_id: string | null
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by?: string
          ends_on?: string | null
          id?: string
          layout_id?: string | null
          league_event_id?: string | null
          name: string
          starts_on?: string | null
          tournament_id?: string | null
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string
          ends_on?: string | null
          id?: string
          layout_id?: string | null
          league_event_id?: string | null
          name?: string
          starts_on?: string | null
          tournament_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_event_overlays_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_event_overlays_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_event_overlays_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      course_feature_history: {
        Row: {
          action: string
          after_data: Json | null
          before_data: Json | null
          changed_by: string | null
          course_id: string
          created_at: string
          feature_id: string
          id: string
          revision: number | null
          verification: string | null
        }
        Insert: {
          action: string
          after_data?: Json | null
          before_data?: Json | null
          changed_by?: string | null
          course_id: string
          created_at?: string
          feature_id: string
          id?: string
          revision?: number | null
          verification?: string | null
        }
        Update: {
          action?: string
          after_data?: Json | null
          before_data?: Json | null
          changed_by?: string | null
          course_id?: string
          created_at?: string
          feature_id?: string
          id?: string
          revision?: number | null
          verification?: string | null
        }
        Relationships: []
      }
      course_features: {
        Row: {
          boundary_confidence: string | null
          color: string | null
          course_id: string
          created_at: string
          created_by: string
          effective_from: string | null
          effective_to: string | null
          event_overlay_id: string | null
          flagged_for_review: boolean
          geometry: Json
          hole_number: number | null
          hole_numbers: number[] | null
          id: string
          label: string | null
          layer: string
          layout_id: string | null
          notes: string | null
          ob_side: Database["public"]["Enums"]["ob_side"]
          publish_state: string
          ref_feature_id: string | null
          revision: number
          type: Database["public"]["Enums"]["course_feature_type"]
          updated_at: string
          verification: string
        }
        Insert: {
          boundary_confidence?: string | null
          color?: string | null
          course_id: string
          created_at?: string
          created_by: string
          effective_from?: string | null
          effective_to?: string | null
          event_overlay_id?: string | null
          flagged_for_review?: boolean
          geometry: Json
          hole_number?: number | null
          hole_numbers?: number[] | null
          id?: string
          label?: string | null
          layer?: string
          layout_id?: string | null
          notes?: string | null
          ob_side?: Database["public"]["Enums"]["ob_side"]
          publish_state?: string
          ref_feature_id?: string | null
          revision?: number
          type: Database["public"]["Enums"]["course_feature_type"]
          updated_at?: string
          verification?: string
        }
        Update: {
          boundary_confidence?: string | null
          color?: string | null
          course_id?: string
          created_at?: string
          created_by?: string
          effective_from?: string | null
          effective_to?: string | null
          event_overlay_id?: string | null
          flagged_for_review?: boolean
          geometry?: Json
          hole_number?: number | null
          hole_numbers?: number[] | null
          id?: string
          label?: string | null
          layer?: string
          layout_id?: string | null
          notes?: string | null
          ob_side?: Database["public"]["Enums"]["ob_side"]
          publish_state?: string
          ref_feature_id?: string | null
          revision?: number
          type?: Database["public"]["Enums"]["course_feature_type"]
          updated_at?: string
          verification?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_features_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_features_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_features_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_features_ref_feature_id_fkey"
            columns: ["ref_feature_id"]
            isOneToOne: false
            referencedRelation: "course_features"
            referencedColumns: ["id"]
          },
        ]
      }
      course_geometry_observations: {
        Row: {
          applied_hole_id: string | null
          confidence: string
          course_id: string | null
          feature_type: string
          first_seen: string
          hole_ref: number | null
          hole_ref_inferred: boolean
          id: string
          last_seen: string
          latitude: number
          longitude: number
          match_state: string
          metadata: Json
          source: string
          source_external_id: string
          source_site_id: string | null
          source_version: string | null
        }
        Insert: {
          applied_hole_id?: string | null
          confidence?: string
          course_id?: string | null
          feature_type: string
          first_seen?: string
          hole_ref?: number | null
          hole_ref_inferred?: boolean
          id?: string
          last_seen?: string
          latitude: number
          longitude: number
          match_state?: string
          metadata?: Json
          source: string
          source_external_id: string
          source_site_id?: string | null
          source_version?: string | null
        }
        Update: {
          applied_hole_id?: string | null
          confidence?: string
          course_id?: string | null
          feature_type?: string
          first_seen?: string
          hole_ref?: number | null
          hole_ref_inferred?: boolean
          id?: string
          last_seen?: string
          latitude?: number
          longitude?: number
          match_state?: string
          metadata?: Json
          source?: string
          source_external_id?: string
          source_site_id?: string | null
          source_version?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_geometry_observations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_geometry_observations_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_hole_status: {
        Row: {
          course_id: string
          hole_number: number
          note: string | null
          set_by: string | null
          status: string
          updated_at: string
        }
        Insert: {
          course_id: string
          hole_number: number
          note?: string | null
          set_by?: string | null
          status: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          hole_number?: number
          note?: string | null
          set_by?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_hole_status_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_hole_status_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_holes: {
        Row: {
          course_id: string
          created_at: string
          created_by: string | null
          hole_number: number | null
          id: string
          label: string
          notes: string | null
          source: string
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by?: string | null
          hole_number?: number | null
          id?: string
          label: string
          notes?: string | null
          source?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string | null
          hole_number?: number | null
          id?: string
          label?: string
          notes?: string | null
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_holes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_holes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_ingest_jobs: {
        Row: {
          attempts: number
          course_id: string
          created_at: string
          finished_at: string | null
          id: string
          last_error: string | null
          next_run_at: string
          requested_by: string | null
          result: Json | null
          status: string
          target_source: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          course_id: string
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          next_run_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
          target_source: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          course_id?: string
          created_at?: string
          finished_at?: string | null
          id?: string
          last_error?: string | null
          next_run_at?: string
          requested_by?: string | null
          result?: Json | null
          status?: string
          target_source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_ingest_jobs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_ingest_jobs_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_intel: {
        Row: {
          avg_round_rating: number | null
          avg_score: number | null
          avg_ssa: number | null
          avg_stroke_value: number | null
          avg_to_par: number | null
          best_round_rating: number | null
          course_id: string | null
          course_key: string
          course_name: string | null
          easiest_score: number | null
          est_ssa: number | null
          est_stroke_value: number | null
          hardest_score: number | null
          last_played_on: string | null
          match_key: string | null
          pdga_rounds_count: number
          rating_rounds_count: number
          rounds_count: number
          udisc_rounds_count: number
          updated_at: string
        }
        Insert: {
          avg_round_rating?: number | null
          avg_score?: number | null
          avg_ssa?: number | null
          avg_stroke_value?: number | null
          avg_to_par?: number | null
          best_round_rating?: number | null
          course_id?: string | null
          course_key: string
          course_name?: string | null
          easiest_score?: number | null
          est_ssa?: number | null
          est_stroke_value?: number | null
          hardest_score?: number | null
          last_played_on?: string | null
          match_key?: string | null
          pdga_rounds_count?: number
          rating_rounds_count?: number
          rounds_count?: number
          udisc_rounds_count?: number
          updated_at?: string
        }
        Update: {
          avg_round_rating?: number | null
          avg_score?: number | null
          avg_ssa?: number | null
          avg_stroke_value?: number | null
          avg_to_par?: number | null
          best_round_rating?: number | null
          course_id?: string | null
          course_key?: string
          course_name?: string | null
          easiest_score?: number | null
          est_ssa?: number | null
          est_stroke_value?: number | null
          hardest_score?: number | null
          last_played_on?: string | null
          match_key?: string | null
          pdga_rounds_count?: number
          rating_rounds_count?: number
          rounds_count?: number
          udisc_rounds_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      course_layout_profiles: {
        Row: {
          course_id: string
          created_at: string
          data: Json
          difficulty: string | null
          holes: number | null
          id: string
          layout_name: string
          length_ft: number | null
          par: number | null
          source: string
          updated_at: string
        }
        Insert: {
          course_id: string
          created_at?: string
          data?: Json
          difficulty?: string | null
          holes?: number | null
          id?: string
          layout_name: string
          length_ft?: number | null
          par?: number | null
          source: string
          updated_at?: string
        }
        Update: {
          course_id?: string
          created_at?: string
          data?: Json
          difficulty?: string | null
          holes?: number | null
          id?: string
          layout_name?: string
          length_ft?: number | null
          par?: number | null
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_layout_profiles_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_layout_profiles_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_layouts: {
        Row: {
          copied_from_layout_id: string | null
          course_id: string
          created_at: string
          created_by: string | null
          current_version: number
          description: string | null
          design_summary: Json
          design_updated_at: string | null
          distance_total: number | null
          dropzone_count: number
          effective_from: string | null
          effective_to: string | null
          family: string | null
          hole_count: number
          id: string
          is_default: boolean
          island_green_count: number
          longest_hole_ft: number | null
          manager_notes: string | null
          mando_count: number
          name: string
          numbering_mode: string
          ob_area_count: number
          ob_line_feet: number
          par_total: number | null
          played_rule_ids: string[] | null
          public_notes: string | null
          scratch_rating: number
          season_notes: string | null
          shortest_hole_ft: number | null
          status: string
          stroke_value: number
          water_hole_count: number
        }
        Insert: {
          copied_from_layout_id?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          design_summary?: Json
          design_updated_at?: string | null
          distance_total?: number | null
          dropzone_count?: number
          effective_from?: string | null
          effective_to?: string | null
          family?: string | null
          hole_count?: number
          id?: string
          is_default?: boolean
          island_green_count?: number
          longest_hole_ft?: number | null
          manager_notes?: string | null
          mando_count?: number
          name: string
          numbering_mode?: string
          ob_area_count?: number
          ob_line_feet?: number
          par_total?: number | null
          played_rule_ids?: string[] | null
          public_notes?: string | null
          scratch_rating?: number
          season_notes?: string | null
          shortest_hole_ft?: number | null
          status?: string
          stroke_value?: number
          water_hole_count?: number
        }
        Update: {
          copied_from_layout_id?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          current_version?: number
          description?: string | null
          design_summary?: Json
          design_updated_at?: string | null
          distance_total?: number | null
          dropzone_count?: number
          effective_from?: string | null
          effective_to?: string | null
          family?: string | null
          hole_count?: number
          id?: string
          is_default?: boolean
          island_green_count?: number
          longest_hole_ft?: number | null
          manager_notes?: string | null
          mando_count?: number
          name?: string
          numbering_mode?: string
          ob_area_count?: number
          ob_line_feet?: number
          par_total?: number | null
          played_rule_ids?: string[] | null
          public_notes?: string | null
          scratch_rating?: number
          season_notes?: string | null
          shortest_hole_ft?: number | null
          status?: string
          stroke_value?: number
          water_hole_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_layouts_copied_from_layout_id_fkey"
            columns: ["copied_from_layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_layouts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_layouts_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_match_candidates: {
        Row: {
          confidence: string
          course_a: string
          course_b: string
          created_at: string
          decided_at: string | null
          decided_by: string | null
          distance_m: number
          id: string
          kept_course_id: string | null
          name_score: number
          note: string | null
          reasons: Json
          status: string
        }
        Insert: {
          confidence: string
          course_a: string
          course_b: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          distance_m: number
          id?: string
          kept_course_id?: string | null
          name_score: number
          note?: string | null
          reasons?: Json
          status?: string
        }
        Update: {
          confidence?: string
          course_a?: string
          course_b?: string
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          distance_m?: number
          id?: string
          kept_course_id?: string | null
          name_score?: number
          note?: string | null
          reasons?: Json
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_match_candidates_course_a_fkey"
            columns: ["course_a"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_match_candidates_course_a_fkey"
            columns: ["course_a"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_match_candidates_course_b_fkey"
            columns: ["course_b"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_match_candidates_course_b_fkey"
            columns: ["course_b"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_match_candidates_kept_course_id_fkey"
            columns: ["kept_course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_match_candidates_kept_course_id_fkey"
            columns: ["kept_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_rating_profiles: {
        Row: {
          auto_populated: boolean
          confidence: number | null
          course_id: string | null
          course_name: string
          created_at: string
          event_refs: string[]
          id: string
          locked: boolean
          matched_course: Json | null
          notes: string | null
          par_total: number | null
          pdga_course_name: string | null
          pdga_course_ref: string | null
          pdga_course_url: string | null
          rated_rounds: Json
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          round_summaries: Json
          sample_size: number
          source_mix: Json
          ssa: number
          status: Database["public"]["Enums"]["moderation_status"]
          stroke_value: number
          submitted_by: string
          updated_at: string
        }
        Insert: {
          auto_populated?: boolean
          confidence?: number | null
          course_id?: string | null
          course_name: string
          created_at?: string
          event_refs?: string[]
          id?: string
          locked?: boolean
          matched_course?: Json | null
          notes?: string | null
          par_total?: number | null
          pdga_course_name?: string | null
          pdga_course_ref?: string | null
          pdga_course_url?: string | null
          rated_rounds?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_summaries?: Json
          sample_size?: number
          source_mix?: Json
          ssa: number
          status?: Database["public"]["Enums"]["moderation_status"]
          stroke_value: number
          submitted_by: string
          updated_at?: string
        }
        Update: {
          auto_populated?: boolean
          confidence?: number | null
          course_id?: string | null
          course_name?: string
          created_at?: string
          event_refs?: string[]
          id?: string
          locked?: boolean
          matched_course?: Json | null
          notes?: string | null
          par_total?: number | null
          pdga_course_name?: string | null
          pdga_course_ref?: string | null
          pdga_course_url?: string | null
          rated_rounds?: Json
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          round_summaries?: Json
          sample_size?: number
          source_mix?: Json
          ssa?: number
          status?: Database["public"]["Enums"]["moderation_status"]
          stroke_value?: number
          submitted_by?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_rating_profiles_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_rating_profiles_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_report_events: {
        Row: {
          actor_id: string | null
          created_at: string
          from_state: string | null
          id: string
          note: string | null
          photo_url: string | null
          report_id: string
          to_state: string
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          from_state?: string | null
          id?: string
          note?: string | null
          photo_url?: string | null
          report_id: string
          to_state: string
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          from_state?: string | null
          id?: string
          note?: string | null
          photo_url?: string | null
          report_id?: string
          to_state?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_report_events_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "course_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      course_report_votes: {
        Row: {
          created_at: string
          id: string
          report_id: string
          user_id: string
          vote: Database["public"]["Enums"]["course_report_vote_kind"]
        }
        Insert: {
          created_at?: string
          id?: string
          report_id: string
          user_id: string
          vote: Database["public"]["Enums"]["course_report_vote_kind"]
        }
        Update: {
          created_at?: string
          id?: string
          report_id?: string
          user_id?: string
          vote?: Database["public"]["Enums"]["course_report_vote_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "course_report_votes_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "course_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      course_reports: {
        Row: {
          archived_at: string | null
          category: string | null
          confidence: string
          confirm_count: number
          course_id: string
          created_at: string
          credited: boolean
          description: string | null
          dispute_count: number
          expires_at: string
          feature_id: string | null
          freshness_state: string
          hole_id: string | null
          hole_number: number | null
          id: string
          kind: Database["public"]["Enums"]["course_report_kind"]
          last_confirmed_at: string | null
          last_observed_at: string | null
          lat: number | null
          lifecycle: string
          lng: number | null
          not_found_count: number
          observed_on: string | null
          photo_url: string | null
          priority: string
          reopened_from: string | null
          reporter_id: string
          resolution_photo_url: string | null
          resolved_at: string | null
          resolved_count: number
          severity: string
          status: Database["public"]["Enums"]["course_report_status"]
          updated_at: string
          work_group: string | null
        }
        Insert: {
          archived_at?: string | null
          category?: string | null
          confidence?: string
          confirm_count?: number
          course_id: string
          created_at?: string
          credited?: boolean
          description?: string | null
          dispute_count?: number
          expires_at?: string
          feature_id?: string | null
          freshness_state?: string
          hole_id?: string | null
          hole_number?: number | null
          id?: string
          kind: Database["public"]["Enums"]["course_report_kind"]
          last_confirmed_at?: string | null
          last_observed_at?: string | null
          lat?: number | null
          lifecycle?: string
          lng?: number | null
          not_found_count?: number
          observed_on?: string | null
          photo_url?: string | null
          priority?: string
          reopened_from?: string | null
          reporter_id: string
          resolution_photo_url?: string | null
          resolved_at?: string | null
          resolved_count?: number
          severity?: string
          status?: Database["public"]["Enums"]["course_report_status"]
          updated_at?: string
          work_group?: string | null
        }
        Update: {
          archived_at?: string | null
          category?: string | null
          confidence?: string
          confirm_count?: number
          course_id?: string
          created_at?: string
          credited?: boolean
          description?: string | null
          dispute_count?: number
          expires_at?: string
          feature_id?: string | null
          freshness_state?: string
          hole_id?: string | null
          hole_number?: number | null
          id?: string
          kind?: Database["public"]["Enums"]["course_report_kind"]
          last_confirmed_at?: string | null
          last_observed_at?: string | null
          lat?: number | null
          lifecycle?: string
          lng?: number | null
          not_found_count?: number
          observed_on?: string | null
          photo_url?: string | null
          priority?: string
          reopened_from?: string | null
          reporter_id?: string
          resolution_photo_url?: string | null
          resolved_at?: string | null
          resolved_count?: number
          severity?: string
          status?: Database["public"]["Enums"]["course_report_status"]
          updated_at?: string
          work_group?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_reports_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_reports_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_reports_hole_id_fkey"
            columns: ["hole_id"]
            isOneToOne: false
            referencedRelation: "holes"
            referencedColumns: ["id"]
          },
        ]
      }
      course_reviews: {
        Row: {
          body: string | null
          course_id: string
          created_at: string
          design: number | null
          id: string
          rating: number
          scenery: number | null
          updated_at: string
          upkeep: number | null
          user_id: string
        }
        Insert: {
          body?: string | null
          course_id: string
          created_at?: string
          design?: number | null
          id?: string
          rating: number
          scenery?: number | null
          updated_at?: string
          upkeep?: number | null
          user_id: string
        }
        Update: {
          body?: string | null
          course_id?: string
          created_at?: string
          design?: number | null
          id?: string
          rating?: number
          scenery?: number | null
          updated_at?: string
          upkeep?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_reviews_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_reviews_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_sign_terrain: {
        Row: {
          bbox: number[]
          course_id: string
          features: Json
          fetched_at: string
          source: string
        }
        Insert: {
          bbox: number[]
          course_id: string
          features?: Json
          fetched_at?: string
          source?: string
        }
        Update: {
          bbox?: number[]
          course_id?: string
          features?: Json
          fetched_at?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_sign_terrain_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_sign_terrain_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_sources: {
        Row: {
          canonical_url: string | null
          confidence: number
          course_id: string
          created_at: string
          external_id: string | null
          id: string
          last_error: string | null
          last_fetched_at: string
          matched_name: string | null
          raw: Json
          source: string
          updated_at: string
        }
        Insert: {
          canonical_url?: string | null
          confidence?: number
          course_id: string
          created_at?: string
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_fetched_at?: string
          matched_name?: string | null
          raw?: Json
          source: string
          updated_at?: string
        }
        Update: {
          canonical_url?: string | null
          confidence?: number
          course_id?: string
          created_at?: string
          external_id?: string | null
          id?: string
          last_error?: string | null
          last_fetched_at?: string
          matched_name?: string | null
          raw?: Json
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_sources_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_sources_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_sponsors: {
        Row: {
          category: string
          course_id: string
          created_at: string
          created_by: string
          hole_number: number | null
          id: string
          link_url: string | null
          logo_url: string | null
          name: string
          sort_order: number
        }
        Insert: {
          category?: string
          course_id: string
          created_at?: string
          created_by?: string
          hole_number?: number | null
          id?: string
          link_url?: string | null
          logo_url?: string | null
          name: string
          sort_order?: number
        }
        Update: {
          category?: string
          course_id?: string
          created_at?: string
          created_by?: string
          hole_number?: number | null
          id?: string
          link_url?: string | null
          logo_url?: string | null
          name?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "course_sponsors_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_sponsors_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_status: {
        Row: {
          authority: string
          conditions_checked_at: string | null
          course_id: string
          layout_verified_at: string | null
          note: string | null
          set_by: string | null
          status: string
          updated_at: string
          valid_until: string | null
          verified_playable_at: string | null
        }
        Insert: {
          authority?: string
          conditions_checked_at?: string | null
          course_id: string
          layout_verified_at?: string | null
          note?: string | null
          set_by?: string | null
          status?: string
          updated_at?: string
          valid_until?: string | null
          verified_playable_at?: string | null
        }
        Update: {
          authority?: string
          conditions_checked_at?: string | null
          course_id?: string
          layout_verified_at?: string | null
          note?: string | null
          set_by?: string | null
          status?: string
          updated_at?: string
          valid_until?: string | null
          verified_playable_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_status_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_status_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: true
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_status_history: {
        Row: {
          actor_id: string | null
          course_id: string
          created_at: string
          from_status: string | null
          hole_number: number | null
          id: string
          note: string | null
          to_status: string
        }
        Insert: {
          actor_id?: string | null
          course_id: string
          created_at?: string
          from_status?: string | null
          hole_number?: number | null
          id?: string
          note?: string | null
          to_status: string
        }
        Update: {
          actor_id?: string | null
          course_id?: string
          created_at?: string
          from_status?: string | null
          hole_number?: number | null
          id?: string
          note?: string | null
          to_status?: string
        }
        Relationships: []
      }
      course_stewards: {
        Row: {
          course_id: string
          created_at: string
          granted_by: string | null
          id: string
          role: string
          user_id: string
        }
        Insert: {
          course_id: string
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: string
          user_id: string
        }
        Update: {
          course_id?: string
          created_at?: string
          granted_by?: string | null
          id?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_stewards_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_stewards_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_tee_sets: {
        Row: {
          color: string
          course_id: string
          display_order: number
          id: string
          name: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          color?: string
          course_id: string
          display_order?: number
          id?: string
          name: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          color?: string
          course_id?: string
          display_order?: number
          id?: string
          name?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_tee_sets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_tee_sets_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      course_tees: {
        Row: {
          color: string | null
          course_hole_id: string
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          source: string
          source_observation_id: string | null
        }
        Insert: {
          color?: string | null
          course_hole_id: string
          course_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          source?: string
          source_observation_id?: string | null
        }
        Update: {
          color?: string | null
          course_hole_id?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          source?: string
          source_observation_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "course_tees_course_hole_id_fkey"
            columns: ["course_hole_id"]
            isOneToOne: false
            referencedRelation: "course_holes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_tees_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "course_tees_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_tees_source_observation_id_fkey"
            columns: ["source_observation_id"]
            isOneToOne: false
            referencedRelation: "course_geometry_observations"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          boundary_locked: boolean
          city: string | null
          country: string | null
          cover_url: string | null
          created_at: string
          created_by: string
          description: string | null
          designer: string | null
          difficulty: string | null
          enriched_at: string | null
          enrichment_source: string | null
          flythrough_path: string | null
          flythrough_poster_url: string | null
          flythrough_url: string | null
          hole_count: number
          hole_count_verified: boolean | null
          id: string
          is_ghost: boolean
          latitude: number | null
          location_quality: string
          location_source: string | null
          longitude: number | null
          merged_into_course_id: string | null
          moderation_status: Database["public"]["Enums"]["moderation_status"]
          name: string
          overview_snapshot_path: string | null
          pdga_course_id: string | null
          pdga_rating: number | null
          pdga_rating_votes: number | null
          pdga_url: string | null
          postal_code: string | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          slug: string
          source: string | null
          source_ref: string | null
          state: string | null
          submitted_at: string
          updated_at: string
          year_established: number | null
        }
        Insert: {
          boundary_locked?: boolean
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          created_by: string
          description?: string | null
          designer?: string | null
          difficulty?: string | null
          enriched_at?: string | null
          enrichment_source?: string | null
          flythrough_path?: string | null
          flythrough_poster_url?: string | null
          flythrough_url?: string | null
          hole_count?: number
          hole_count_verified?: boolean | null
          id?: string
          is_ghost?: boolean
          latitude?: number | null
          location_quality?: string
          location_source?: string | null
          longitude?: number | null
          merged_into_course_id?: string | null
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          name: string
          overview_snapshot_path?: string | null
          pdga_course_id?: string | null
          pdga_rating?: number | null
          pdga_rating_votes?: number | null
          pdga_url?: string | null
          postal_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug: string
          source?: string | null
          source_ref?: string | null
          state?: string | null
          submitted_at?: string
          updated_at?: string
          year_established?: number | null
        }
        Update: {
          boundary_locked?: boolean
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string
          description?: string | null
          designer?: string | null
          difficulty?: string | null
          enriched_at?: string | null
          enrichment_source?: string | null
          flythrough_path?: string | null
          flythrough_poster_url?: string | null
          flythrough_url?: string | null
          hole_count?: number
          hole_count_verified?: boolean | null
          id?: string
          is_ghost?: boolean
          latitude?: number | null
          location_quality?: string
          location_source?: string | null
          longitude?: number | null
          merged_into_course_id?: string | null
          moderation_status?: Database["public"]["Enums"]["moderation_status"]
          name?: string
          overview_snapshot_path?: string | null
          pdga_course_id?: string | null
          pdga_rating?: number | null
          pdga_rating_votes?: number | null
          pdga_url?: string | null
          postal_code?: string | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          slug?: string
          source?: string | null
          source_ref?: string | null
          state?: string | null
          submitted_at?: string
          updated_at?: string
          year_established?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "courses_merged_into_course_id_fkey"
            columns: ["merged_into_course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "courses_merged_into_course_id_fkey"
            columns: ["merged_into_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      creator_profiles: {
        Row: {
          applied_at: string | null
          approved_at: string | null
          approved_by: string | null
          bio: string | null
          content_pillars: string[]
          created_at: string
          external_links: Json
          headline: string | null
          is_verified: boolean
          monthly_reach: number | null
          niche_tags: string[]
          pitch: string | null
          reviewer_notes: string | null
          status: Database["public"]["Enums"]["creator_status"]
          tier: Database["public"]["Enums"]["creator_tier"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bio?: string | null
          content_pillars?: string[]
          created_at?: string
          external_links?: Json
          headline?: string | null
          is_verified?: boolean
          monthly_reach?: number | null
          niche_tags?: string[]
          pitch?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["creator_status"]
          tier?: Database["public"]["Enums"]["creator_tier"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string | null
          approved_at?: string | null
          approved_by?: string | null
          bio?: string | null
          content_pillars?: string[]
          created_at?: string
          external_links?: Json
          headline?: string | null
          is_verified?: boolean
          monthly_reach?: number | null
          niche_tags?: string[]
          pitch?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["creator_status"]
          tier?: Database["public"]["Enums"]["creator_tier"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      data_ingest_jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          result: Json | null
          source_url: string | null
          status: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind: string
          result?: Json | null
          source_url?: string | null
          status?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          result?: Json | null
          source_url?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      dgcr_courses: {
        Row: {
          avg_score: number | null
          basket_count: number | null
          basket_type: string | null
          city: string | null
          conditions: string | null
          country: string | null
          course_id: string | null
          course_type: string | null
          created_at: string
          description: string | null
          designer: string | null
          dgcr_id: string
          directions: string | null
          fetched_at: string
          foliage: string | null
          hole_count: number | null
          id: string
          latitude: number | null
          length_max_ft: number | null
          length_min_ft: number | null
          longitude: number | null
          name: string
          park_name: string | null
          pars: number[]
          postal_code: string | null
          rating: number | null
          raw: Json
          review_count: number | null
          rounds_recorded: number | null
          slug: string | null
          sse: number[]
          state: string | null
          tee_type: string | null
          terrain: string | null
          updated_at: string
          url: string
          water_holes: number | null
          year_established: number | null
        }
        Insert: {
          avg_score?: number | null
          basket_count?: number | null
          basket_type?: string | null
          city?: string | null
          conditions?: string | null
          country?: string | null
          course_id?: string | null
          course_type?: string | null
          created_at?: string
          description?: string | null
          designer?: string | null
          dgcr_id: string
          directions?: string | null
          fetched_at?: string
          foliage?: string | null
          hole_count?: number | null
          id?: string
          latitude?: number | null
          length_max_ft?: number | null
          length_min_ft?: number | null
          longitude?: number | null
          name: string
          park_name?: string | null
          pars?: number[]
          postal_code?: string | null
          rating?: number | null
          raw?: Json
          review_count?: number | null
          rounds_recorded?: number | null
          slug?: string | null
          sse?: number[]
          state?: string | null
          tee_type?: string | null
          terrain?: string | null
          updated_at?: string
          url: string
          water_holes?: number | null
          year_established?: number | null
        }
        Update: {
          avg_score?: number | null
          basket_count?: number | null
          basket_type?: string | null
          city?: string | null
          conditions?: string | null
          country?: string | null
          course_id?: string | null
          course_type?: string | null
          created_at?: string
          description?: string | null
          designer?: string | null
          dgcr_id?: string
          directions?: string | null
          fetched_at?: string
          foliage?: string | null
          hole_count?: number | null
          id?: string
          latitude?: number | null
          length_max_ft?: number | null
          length_min_ft?: number | null
          longitude?: number | null
          name?: string
          park_name?: string | null
          pars?: number[]
          postal_code?: string | null
          rating?: number | null
          raw?: Json
          review_count?: number | null
          rounds_recorded?: number | null
          slug?: string | null
          sse?: number[]
          state?: string | null
          tee_type?: string | null
          terrain?: string | null
          updated_at?: string
          url?: string
          water_holes?: number | null
          year_established?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dgcr_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "dgcr_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_benchmark_versions: {
        Row: {
          benchmark_date: string
          benchmark_version: string
          created_at: string
          model_version: string
          population_definition: string
          sample_size: number
          skill_quantiles: Json
          status: string
        }
        Insert: {
          benchmark_date: string
          benchmark_version: string
          created_at?: string
          model_version: string
          population_definition: string
          sample_size: number
          skill_quantiles: Json
          status?: string
        }
        Update: {
          benchmark_date?: string
          benchmark_version?: string
          created_at?: string
          model_version?: string
          population_definition?: string
          sample_size?: number
          skill_quantiles?: Json
          status?: string
        }
        Relationships: []
      }
      dgd_calc_runs: {
        Row: {
          convergence_status: string | null
          events_written: number
          failures: Json
          final_delta: Json | null
          finished_at: string | null
          id: string
          iteration_count: number | null
          layouts_fitted: number
          model_version: string
          players_seen: number
          players_skipped: number
          started_at: string
          status: string
          stop_reason: string | null
          triggered_by: string | null
          validation: Json | null
        }
        Insert: {
          convergence_status?: string | null
          events_written?: number
          failures?: Json
          final_delta?: Json | null
          finished_at?: string | null
          id?: string
          iteration_count?: number | null
          layouts_fitted?: number
          model_version: string
          players_seen?: number
          players_skipped?: number
          started_at?: string
          status?: string
          stop_reason?: string | null
          triggered_by?: string | null
          validation?: Json | null
        }
        Update: {
          convergence_status?: string | null
          events_written?: number
          failures?: Json
          final_delta?: Json | null
          finished_at?: string | null
          id?: string
          iteration_count?: number | null
          layouts_fitted?: number
          model_version?: string
          players_seen?: number
          players_skipped?: number
          started_at?: string
          status?: string
          stop_reason?: string | null
          triggered_by?: string | null
          validation?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dgd_calc_runs_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "rating_model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_calibration_notes: {
        Row: {
          note: string
          subject_id: string
          tags: string[]
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          note?: string
          subject_id: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          note?: string
          subject_id?: string
          tags?: string[]
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dgd_calibration_notes_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: true
            referencedRelation: "dgd_calibration_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_calibration_reports: {
        Row: {
          finished_at: string | null
          id: string
          model_version: string
          players: Json
          report: Json
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          finished_at?: string | null
          id?: string
          model_version: string
          players?: Json
          report?: Json
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          finished_at?: string | null
          id?: string
          model_version?: string
          players?: Json
          report?: Json
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      dgd_calibration_rounds: {
        Row: {
          dedupe_key: string
          distance_ft: number | null
          division: string | null
          evaluated: boolean | null
          event_name: string | null
          fetched_at: string
          hole_count: number | null
          id: string
          included: boolean | null
          layout_name: string | null
          layout_node_ids: string[]
          par: number | null
          pdga_event_id: string | null
          played_on: string
          round_number: number | null
          round_rating: number | null
          score: number | null
          source: string
          source_url: string
          subject_id: string
          tier: string | null
        }
        Insert: {
          dedupe_key: string
          distance_ft?: number | null
          division?: string | null
          evaluated?: boolean | null
          event_name?: string | null
          fetched_at?: string
          hole_count?: number | null
          id?: string
          included?: boolean | null
          layout_name?: string | null
          layout_node_ids?: string[]
          par?: number | null
          pdga_event_id?: string | null
          played_on: string
          round_number?: number | null
          round_rating?: number | null
          score?: number | null
          source?: string
          source_url: string
          subject_id: string
          tier?: string | null
        }
        Update: {
          dedupe_key?: string
          distance_ft?: number | null
          division?: string | null
          evaluated?: boolean | null
          event_name?: string | null
          fetched_at?: string
          hole_count?: number | null
          id?: string
          included?: boolean | null
          layout_name?: string | null
          layout_node_ids?: string[]
          par?: number | null
          pdga_event_id?: string | null
          played_on?: string
          round_number?: number | null
          round_rating?: number | null
          score?: number | null
          source?: string
          source_url?: string
          subject_id?: string
          tier?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dgd_calibration_rounds_subject_id_fkey"
            columns: ["subject_id"]
            isOneToOne: false
            referencedRelation: "dgd_calibration_subjects"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_calibration_subjects: {
        Row: {
          added_by: string | null
          cohort: string
          created_at: string
          display_name: string | null
          id: string
          last_error: string | null
          last_fetched_at: string | null
          linked_user_id: string | null
          official_rating: number | null
          pdga_number: string
          rounds_parsed: number
          sampling: Json | null
          source_history: Json
          status: string
          updated_at: string
        }
        Insert: {
          added_by?: string | null
          cohort?: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_error?: string | null
          last_fetched_at?: string | null
          linked_user_id?: string | null
          official_rating?: number | null
          pdga_number: string
          rounds_parsed?: number
          sampling?: Json | null
          source_history?: Json
          status?: string
          updated_at?: string
        }
        Update: {
          added_by?: string | null
          cohort?: string
          created_at?: string
          display_name?: string | null
          id?: string
          last_error?: string | null
          last_fetched_at?: string | null
          linked_user_id?: string | null
          official_rating?: number | null
          pdga_number?: string
          rounds_parsed?: number
          sampling?: Json | null
          source_history?: Json
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      dgd_candidate_reports: {
        Row: {
          candidate_model: string
          control_model: string
          error: string | null
          finished_at: string | null
          id: string
          report: Json | null
          started_at: string
          status: string
          triggered_by: string | null
        }
        Insert: {
          candidate_model: string
          control_model: string
          error?: string | null
          finished_at?: string | null
          id?: string
          report?: Json | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Update: {
          candidate_model?: string
          control_model?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          report?: Json | null
          started_at?: string
          status?: string
          triggered_by?: string | null
        }
        Relationships: []
      }
      dgd_credentials: {
        Row: {
          created_at: string
          expires_at: string | null
          id: string
          kind: string
          note: string | null
          source: string
          source_record: string | null
          status: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          id?: string
          kind: string
          note?: string | null
          source: string
          source_record?: string | null
          status?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          id?: string
          kind?: string
          note?: string | null
          source?: string
          source_record?: string | null
          status?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      dgd_display_scales: {
        Row: {
          anchor: number
          calibration_dataset_version: string
          created_at: string
          max_behavior: string
          min_behavior: string
          model_version: string
          notes: string | null
          params: Json
          scale_version: string
          slope: number
          status: string
          transform_type: string
        }
        Insert: {
          anchor: number
          calibration_dataset_version: string
          created_at?: string
          max_behavior: string
          min_behavior: string
          model_version: string
          notes?: string | null
          params?: Json
          scale_version: string
          slope: number
          status?: string
          transform_type: string
        }
        Update: {
          anchor?: number
          calibration_dataset_version?: string
          created_at?: string
          max_behavior?: string
          min_behavior?: string
          model_version?: string
          notes?: string | null
          params?: Json
          scale_version?: string
          slope?: number
          status?: string
          transform_type?: string
        }
        Relationships: []
      }
      dgd_divisions: {
        Row: {
          age_max: number | null
          age_min: number | null
          cash_allowed: boolean
          code: string
          competitive_class: string
          id: string
          name: string
          skill_max: number | null
          skill_min: number | null
          sort: number
          version_id: string
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          cash_allowed?: boolean
          code: string
          competitive_class: string
          id?: string
          name: string
          skill_max?: number | null
          skill_min?: number | null
          sort?: number
          version_id: string
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          cash_allowed?: boolean
          code?: string
          competitive_class?: string
          id?: string
          name?: string
          skill_max?: number | null
          skill_min?: number | null
          sort?: number
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_divisions_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "rule_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_duplicate_reviews: {
        Row: {
          applied: boolean
          canonical_round_id: string
          counterpart_round_id: string | null
          created_at: string
          evidence: Json
          id: string
          reason: string
          resolution: string
          updated_at: string
          user_id: string
        }
        Insert: {
          applied?: boolean
          canonical_round_id: string
          counterpart_round_id?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          reason: string
          resolution: string
          updated_at?: string
          user_id: string
        }
        Update: {
          applied?: boolean
          canonical_round_id?: string
          counterpart_round_id?: string | null
          created_at?: string
          evidence?: Json
          id?: string
          reason?: string
          resolution?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dgd_event_round_difficulty: {
        Row: {
          adjustment_uncertainty: number | null
          baseline_layout_difficulty: number | null
          calculation_version: string
          contextual_layout_difficulty: number | null
          created_at: string
          effective_participant_count: number
          event_round_adjustment: number | null
          event_round_key: string
          event_round_layout_difficulty_mu: number
          event_round_layout_difficulty_sigma: number
          id: string
          layout_key: string
          participant_count: number
          played_on: string
          report_id: string
        }
        Insert: {
          adjustment_uncertainty?: number | null
          baseline_layout_difficulty?: number | null
          calculation_version: string
          contextual_layout_difficulty?: number | null
          created_at?: string
          effective_participant_count: number
          event_round_adjustment?: number | null
          event_round_key: string
          event_round_layout_difficulty_mu: number
          event_round_layout_difficulty_sigma: number
          id?: string
          layout_key: string
          participant_count: number
          played_on: string
          report_id: string
        }
        Update: {
          adjustment_uncertainty?: number | null
          baseline_layout_difficulty?: number | null
          calculation_version?: string
          contextual_layout_difficulty?: number | null
          created_at?: string
          effective_participant_count?: number
          event_round_adjustment?: number | null
          event_round_key?: string
          event_round_layout_difficulty_mu?: number
          event_round_layout_difficulty_sigma?: number
          id?: string
          layout_key?: string
          participant_count?: number
          played_on?: string
          report_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_event_round_difficulty_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "dgd_candidate_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_layout_difficulty: {
        Row: {
          course_key: string | null
          course_name: string | null
          difficulty_mu: number
          difficulty_sigma: number
          effective_player_count: number
          fitted_at: string
          fitted_run_id: string | null
          layout_key: string
          layout_mapping: string | null
          layout_name: string | null
          model_version: string
          player_count: number
          recent_round_count: number
          sample_size: number
          skill_range: number | null
          status: string
        }
        Insert: {
          course_key?: string | null
          course_name?: string | null
          difficulty_mu: number
          difficulty_sigma: number
          effective_player_count?: number
          fitted_at?: string
          fitted_run_id?: string | null
          layout_key: string
          layout_mapping?: string | null
          layout_name?: string | null
          model_version: string
          player_count?: number
          recent_round_count?: number
          sample_size?: number
          skill_range?: number | null
          status: string
        }
        Update: {
          course_key?: string | null
          course_name?: string | null
          difficulty_mu?: number
          difficulty_sigma?: number
          effective_player_count?: number
          fitted_at?: string
          fitted_run_id?: string | null
          layout_key?: string
          layout_mapping?: string | null
          layout_name?: string | null
          model_version?: string
          player_count?: number
          recent_round_count?: number
          sample_size?: number
          skill_range?: number | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_layout_difficulty_fitted_run_id_fkey"
            columns: ["fitted_run_id"]
            isOneToOne: false
            referencedRelation: "dgd_calc_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgd_layout_difficulty_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "rating_model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_player_experience: {
        Row: {
          course_breadth: number | null
          created_at: string
          diagnostics: Json
          effective_layout_count: number | null
          experience_version: string
          generalization_confidence: number | null
          id: string
          model_version: string
          run_id: string | null
          unique_courses: number
          unique_layouts: number
          updated_at: string
          user_id: string
        }
        Insert: {
          course_breadth?: number | null
          created_at?: string
          diagnostics?: Json
          effective_layout_count?: number | null
          experience_version: string
          generalization_confidence?: number | null
          id?: string
          model_version: string
          run_id?: string | null
          unique_courses?: number
          unique_layouts?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          course_breadth?: number | null
          created_at?: string
          diagnostics?: Json
          effective_layout_count?: number | null
          experience_version?: string
          generalization_confidence?: number | null
          id?: string
          model_version?: string
          run_id?: string | null
          unique_courses?: number
          unique_layouts?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_player_experience_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dgd_calc_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_player_layout_experience: {
        Row: {
          average_dgd_round_performance: number | null
          average_strokes_vs_expectation: number | null
          competitive_round_count: number
          course_key: string | null
          created_at: string
          eligible_round_count: number
          experience_version: string
          experienced_layout_performance: number | null
          familiarity_mu: number
          familiarity_sigma: number
          first_played_at: string | null
          first_time_layout_performance: number | null
          id: string
          last_played_at: string | null
          layout_key: string
          model_version: string
          recent_round_count: number
          round_count: number
          run_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          average_dgd_round_performance?: number | null
          average_strokes_vs_expectation?: number | null
          competitive_round_count?: number
          course_key?: string | null
          created_at?: string
          eligible_round_count?: number
          experience_version: string
          experienced_layout_performance?: number | null
          familiarity_mu?: number
          familiarity_sigma: number
          first_played_at?: string | null
          first_time_layout_performance?: number | null
          id?: string
          last_played_at?: string | null
          layout_key: string
          model_version: string
          recent_round_count?: number
          round_count?: number
          run_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          average_dgd_round_performance?: number | null
          average_strokes_vs_expectation?: number | null
          competitive_round_count?: number
          course_key?: string | null
          created_at?: string
          eligible_round_count?: number
          experience_version?: string
          experienced_layout_performance?: number | null
          familiarity_mu?: number
          familiarity_sigma?: number
          first_played_at?: string | null
          first_time_layout_performance?: number | null
          id?: string
          last_played_at?: string | null
          layout_key?: string
          model_version?: string
          recent_round_count?: number
          round_count?: number
          run_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_player_layout_experience_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dgd_calc_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_player_state: {
        Row: {
          confidence: number
          display_rating: number
          effective_observations: number
          eligible_rounds: number
          form: number | null
          ineligible_rounds: number
          input_hash: string
          last_played_on: string | null
          last_run_id: string | null
          model_version: string
          skill_mu: number
          skill_sigma: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          confidence: number
          display_rating: number
          effective_observations?: number
          eligible_rounds?: number
          form?: number | null
          ineligible_rounds?: number
          input_hash: string
          last_played_on?: string | null
          last_run_id?: string | null
          model_version: string
          skill_mu: number
          skill_sigma: number
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          confidence?: number
          display_rating?: number
          effective_observations?: number
          eligible_rounds?: number
          form?: number | null
          ineligible_rounds?: number
          input_hash?: string
          last_played_on?: string | null
          last_run_id?: string | null
          model_version?: string
          skill_mu?: number
          skill_sigma?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_player_state_last_run_id_fkey"
            columns: ["last_run_id"]
            isOneToOne: false
            referencedRelation: "dgd_calc_runs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgd_player_state_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "rating_model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_preview_testers: {
        Row: {
          added_by: string | null
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          added_by?: string | null
          created_at?: string
          note?: string | null
          user_id: string
        }
        Update: {
          added_by?: string | null
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dgd_rating_events: {
        Row: {
          actual_score: number
          calc_type: string
          canonical_round_id: string
          confidence_after: number
          confidence_before: number
          created_at: string
          days_since_last: number | null
          display_after: number
          display_before: number
          expected_score: number
          id: string
          layout_difficulty_mu: number
          layout_difficulty_sigma: number
          layout_key: string
          model_version: string
          mu_after: number
          mu_before: number
          observation_sigma: number
          played_on: string
          round_performance_display: number
          round_performance_latent: number
          run_id: string | null
          seq: number
          sigma_after: number
          sigma_before: number
          sigma_before_drifted: number
          source_refs: Json
          status: string
          strokes_vs_expectation: number
          superseded_at: string | null
          superseded_reason: string | null
          user_id: string
        }
        Insert: {
          actual_score: number
          calc_type?: string
          canonical_round_id: string
          confidence_after: number
          confidence_before: number
          created_at?: string
          days_since_last?: number | null
          display_after: number
          display_before: number
          expected_score: number
          id?: string
          layout_difficulty_mu: number
          layout_difficulty_sigma: number
          layout_key: string
          model_version: string
          mu_after: number
          mu_before: number
          observation_sigma: number
          played_on: string
          round_performance_display: number
          round_performance_latent: number
          run_id?: string | null
          seq: number
          sigma_after: number
          sigma_before: number
          sigma_before_drifted: number
          source_refs?: Json
          status?: string
          strokes_vs_expectation: number
          superseded_at?: string | null
          superseded_reason?: string | null
          user_id: string
        }
        Update: {
          actual_score?: number
          calc_type?: string
          canonical_round_id?: string
          confidence_after?: number
          confidence_before?: number
          created_at?: string
          days_since_last?: number | null
          display_after?: number
          display_before?: number
          expected_score?: number
          id?: string
          layout_difficulty_mu?: number
          layout_difficulty_sigma?: number
          layout_key?: string
          model_version?: string
          mu_after?: number
          mu_before?: number
          observation_sigma?: number
          played_on?: string
          round_performance_display?: number
          round_performance_latent?: number
          run_id?: string | null
          seq?: number
          sigma_after?: number
          sigma_before?: number
          sigma_before_drifted?: number
          source_refs?: Json
          status?: string
          strokes_vs_expectation?: number
          superseded_at?: string | null
          superseded_reason?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_rating_events_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "rating_model_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgd_rating_events_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "dgd_calc_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_round_eligibility: {
        Row: {
          canonical_round_id: string
          checked_at: string
          eligible: boolean
          layout_key: string | null
          model_version: string
          reason_codes: string[]
          reasons: string[]
          state: string
          user_id: string
        }
        Insert: {
          canonical_round_id: string
          checked_at?: string
          eligible: boolean
          layout_key?: string | null
          model_version: string
          reason_codes?: string[]
          reasons?: string[]
          state?: string
          user_id: string
        }
        Update: {
          canonical_round_id?: string
          checked_at?: string
          eligible?: boolean
          layout_key?: string | null
          model_version?: string
          reason_codes?: string[]
          reasons?: string[]
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_round_eligibility_canonical_round_id_fkey"
            columns: ["canonical_round_id"]
            isOneToOne: false
            referencedRelation: "canonical_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgd_round_eligibility_model_version_fkey"
            columns: ["model_version"]
            isOneToOne: false
            referencedRelation: "rating_model_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_round_normalization: {
        Row: {
          canonical_round_id: string
          course_id: string | null
          data_issue: string | null
          data_issue_detail: string | null
          hole_count: number | null
          hole_count_origin: string
          layout_id: string | null
          layout_mapping: string
          mapping_evidence: Json
          normalized_at: string
          par_played: number | null
          to_par: number | null
          user_id: string
        }
        Insert: {
          canonical_round_id: string
          course_id?: string | null
          data_issue?: string | null
          data_issue_detail?: string | null
          hole_count?: number | null
          hole_count_origin?: string
          layout_id?: string | null
          layout_mapping?: string
          mapping_evidence?: Json
          normalized_at?: string
          par_played?: number | null
          to_par?: number | null
          user_id: string
        }
        Update: {
          canonical_round_id?: string
          course_id?: string | null
          data_issue?: string | null
          data_issue_detail?: string | null
          hole_count?: number | null
          hole_count_origin?: string
          layout_id?: string | null
          layout_mapping?: string
          mapping_evidence?: Json
          normalized_at?: string
          par_played?: number | null
          to_par?: number | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_round_normalization_canonical_round_id_fkey"
            columns: ["canonical_round_id"]
            isOneToOne: true
            referencedRelation: "canonical_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      dgd_source_conflicts: {
        Row: {
          canonical_round_id: string
          detail: Json
          detected_at: string
          id: string
          kind: string
          last_seen_at: string
          review_status: string
          state: string
          user_id: string
        }
        Insert: {
          canonical_round_id: string
          detail?: Json
          detected_at?: string
          id?: string
          kind: string
          last_seen_at?: string
          review_status?: string
          state?: string
          user_id: string
        }
        Update: {
          canonical_round_id?: string
          detail?: Json
          detected_at?: string
          id?: string
          kind?: string
          last_seen_at?: string
          review_status?: string
          state?: string
          user_id?: string
        }
        Relationships: []
      }
      dgd_tier_adjustments: {
        Row: {
          admin_id: string
          category: string
          created_at: string
          id: string
          points: number
          reason: string
          revoked_at: string | null
          user_id: string
        }
        Insert: {
          admin_id: string
          category: string
          created_at?: string
          id?: string
          points: number
          reason: string
          revoked_at?: string | null
          user_id: string
        }
        Update: {
          admin_id?: string
          category?: string
          created_at?: string
          id?: string
          points?: number
          reason?: string
          revoked_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dgd_tier_history: {
        Row: {
          created_at: string
          from_tier: string | null
          id: string
          reason: string
          tier_score: number
          tier_version: string
          to_tier: string
          user_id: string
        }
        Insert: {
          created_at?: string
          from_tier?: string | null
          id?: string
          reason: string
          tier_score: number
          tier_version: string
          to_tier: string
          user_id: string
        }
        Update: {
          created_at?: string
          from_tier?: string | null
          id?: string
          reason?: string
          tier_score?: number
          tier_version?: string
          to_tier?: string
          user_id?: string
        }
        Relationships: []
      }
      dgd_tier_jobs: {
        Row: {
          queued_at: string
          reason: string
          user_id: string
        }
        Insert: {
          queued_at?: string
          reason: string
          user_id: string
        }
        Update: {
          queued_at?: string
          reason?: string
          user_id?: string
        }
        Relationships: []
      }
      dgd_tier_ledger: {
        Row: {
          category: string
          computed_at: string
          detail: string | null
          id: string
          occurred_on: string | null
          points: number
          source: string
          source_record: string | null
          tier_version: string
          user_id: string
          verification: string
        }
        Insert: {
          category: string
          computed_at?: string
          detail?: string | null
          id?: string
          occurred_on?: string | null
          points: number
          source: string
          source_record?: string | null
          tier_version: string
          user_id: string
          verification: string
        }
        Update: {
          category?: string
          computed_at?: string
          detail?: string | null
          id?: string
          occurred_on?: string | null
          points?: number
          source?: string
          source_record?: string | null
          tier_version?: string
          user_id?: string
          verification?: string
        }
        Relationships: []
      }
      dgd_tier_state: {
        Row: {
          career: Json
          categories: Json
          current_tier: string
          highest_tier_earned: string
          next_tier: Json | null
          tier_earned_at: string
          tier_score: number
          tier_version: string
          updated_at: string
          user_id: string
        }
        Insert: {
          career?: Json
          categories?: Json
          current_tier?: string
          highest_tier_earned?: string
          next_tier?: Json | null
          tier_earned_at?: string
          tier_score?: number
          tier_version: string
          updated_at?: string
          user_id: string
        }
        Update: {
          career?: Json
          categories?: Json
          current_tier?: string
          highest_tier_earned?: string
          next_tier?: Json | null
          tier_earned_at?: string
          tier_score?: number
          tier_version?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dgd_v11_freshness: {
        Row: {
          last_calculated_at: string | null
          last_error: string | null
          last_job_status: string | null
          latest_eligible_round_at: string | null
          latest_source_change_at: string | null
          model_version: string
          recalculation_pending: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          last_calculated_at?: string | null
          last_error?: string | null
          last_job_status?: string | null
          latest_eligible_round_at?: string | null
          latest_source_change_at?: string | null
          model_version?: string
          recalculation_pending?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          last_calculated_at?: string | null
          last_error?: string | null
          last_job_status?: string | null
          latest_eligible_round_at?: string | null
          latest_source_change_at?: string | null
          model_version?: string
          recalculation_pending?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dgd_v11_jobs: {
        Row: {
          attempts: number
          created_at: string
          duration_ms: number | null
          earliest_affected_on: string | null
          finished_at: string | null
          id: string
          last_error: string | null
          max_attempts: number
          mode: string | null
          model_version: string
          reasons: string[]
          replay_from: string | null
          rows_changed: number | null
          run_after: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          duration_ms?: number | null
          earliest_affected_on?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          mode?: string | null
          model_version?: string
          reasons?: string[]
          replay_from?: string | null
          rows_changed?: number | null
          run_after?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          attempts?: number
          created_at?: string
          duration_ms?: number | null
          earliest_affected_on?: string | null
          finished_at?: string | null
          id?: string
          last_error?: string | null
          max_attempts?: number
          mode?: string | null
          model_version?: string
          reasons?: string[]
          replay_from?: string | null
          rows_changed?: number | null
          run_after?: string
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dgd_v11_layout_expectations: {
        Row: {
          avg_score: number | null
          best_score: number | null
          expected: number
          layout_confidence: string
          layout_key: string
          layout_name: string | null
          likely_high: number
          likely_low: number
          model_version: string
          par: number | null
          player_rounds: number
          rounds_on_layout: number
          user_id: string
        }
        Insert: {
          avg_score?: number | null
          best_score?: number | null
          expected: number
          layout_confidence: string
          layout_key: string
          layout_name?: string | null
          likely_high: number
          likely_low: number
          model_version: string
          par?: number | null
          player_rounds?: number
          rounds_on_layout: number
          user_id: string
        }
        Update: {
          avg_score?: number | null
          best_score?: number | null
          expected?: number
          layout_confidence?: string
          layout_key?: string
          layout_name?: string | null
          likely_high?: number
          likely_low?: number
          model_version?: string
          par?: number | null
          player_rounds?: number
          rounds_on_layout?: number
          user_id?: string
        }
        Relationships: []
      }
      dgd_v11_player_state: {
        Row: {
          change_180: number | null
          change_30: number | null
          change_90: number | null
          confidence: number
          coverage: Json
          display_rating: number
          display_status: string
          eligible_rounds: number
          excluded_rounds: number
          form_delta: number | null
          form_rounds: number
          form_value: number | null
          input_basis: string
          last_played_on: string | null
          model_version: string
          rating_status: string
          recent: Json
          report_id: string | null
          skill_latent: number
          skill_sigma: number
          source_mix: Json
          state_hash: string | null
          subject_id: string | null
          trend: string
          updated_at: string
          user_id: string
          volatility: number | null
        }
        Insert: {
          change_180?: number | null
          change_30?: number | null
          change_90?: number | null
          confidence: number
          coverage?: Json
          display_rating: number
          display_status?: string
          eligible_rounds?: number
          excluded_rounds?: number
          form_delta?: number | null
          form_rounds?: number
          form_value?: number | null
          input_basis?: string
          last_played_on?: string | null
          model_version: string
          rating_status?: string
          recent?: Json
          report_id?: string | null
          skill_latent: number
          skill_sigma: number
          source_mix?: Json
          state_hash?: string | null
          subject_id?: string | null
          trend?: string
          updated_at?: string
          user_id: string
          volatility?: number | null
        }
        Update: {
          change_180?: number | null
          change_30?: number | null
          change_90?: number | null
          confidence?: number
          coverage?: Json
          display_rating?: number
          display_status?: string
          eligible_rounds?: number
          excluded_rounds?: number
          form_delta?: number | null
          form_rounds?: number
          form_value?: number | null
          input_basis?: string
          last_played_on?: string | null
          model_version?: string
          rating_status?: string
          recent?: Json
          report_id?: string | null
          skill_latent?: number
          skill_sigma?: number
          source_mix?: Json
          state_hash?: string | null
          subject_id?: string | null
          trend?: string
          updated_at?: string
          user_id?: string
          volatility?: number | null
        }
        Relationships: []
      }
      dgd_v11_round_results: {
        Row: {
          calibration_round_id: string | null
          canonical_round_id: string | null
          category: string | null
          confidence_after: number | null
          confidence_before: number | null
          context_status: string | null
          course_name: string | null
          created_at: string
          ctx_expected: number | null
          ctx_strokes_vs_expectation: number | null
          display_after: number | null
          display_before: number | null
          division: string | null
          effective_field_count: number | null
          event_adjustment: number | null
          event_name: string | null
          field_context_confidence: string | null
          field_coverage_ratio: number | null
          field_full_count: number | null
          field_known_players: number | null
          field_known_scores: number | null
          id: string
          layout_key: string | null
          layout_knowledge: string | null
          layout_name: string | null
          legacy_round_rating: number | null
          likely_high: number | null
          likely_low: number | null
          model_version: string
          origin_source: string | null
          par: number | null
          pdga_round_rating: number | null
          played_on: string
          pre_expected: number | null
          pre_strokes_vs_expectation: number | null
          round_number: number | null
          round_performance_display: number | null
          row_hash: string | null
          score: number
          seq: number
          source_conflict: string | null
          sources: string[]
          status: string
          status_reason: string | null
          udisc_round_rating: number | null
          user_id: string
        }
        Insert: {
          calibration_round_id?: string | null
          canonical_round_id?: string | null
          category?: string | null
          confidence_after?: number | null
          confidence_before?: number | null
          context_status?: string | null
          course_name?: string | null
          created_at?: string
          ctx_expected?: number | null
          ctx_strokes_vs_expectation?: number | null
          display_after?: number | null
          display_before?: number | null
          division?: string | null
          effective_field_count?: number | null
          event_adjustment?: number | null
          event_name?: string | null
          field_context_confidence?: string | null
          field_coverage_ratio?: number | null
          field_full_count?: number | null
          field_known_players?: number | null
          field_known_scores?: number | null
          id?: string
          layout_key?: string | null
          layout_knowledge?: string | null
          layout_name?: string | null
          legacy_round_rating?: number | null
          likely_high?: number | null
          likely_low?: number | null
          model_version: string
          origin_source?: string | null
          par?: number | null
          pdga_round_rating?: number | null
          played_on: string
          pre_expected?: number | null
          pre_strokes_vs_expectation?: number | null
          round_number?: number | null
          round_performance_display?: number | null
          row_hash?: string | null
          score: number
          seq: number
          source_conflict?: string | null
          sources?: string[]
          status: string
          status_reason?: string | null
          udisc_round_rating?: number | null
          user_id: string
        }
        Update: {
          calibration_round_id?: string | null
          canonical_round_id?: string | null
          category?: string | null
          confidence_after?: number | null
          confidence_before?: number | null
          context_status?: string | null
          course_name?: string | null
          created_at?: string
          ctx_expected?: number | null
          ctx_strokes_vs_expectation?: number | null
          display_after?: number | null
          display_before?: number | null
          division?: string | null
          effective_field_count?: number | null
          event_adjustment?: number | null
          event_name?: string | null
          field_context_confidence?: string | null
          field_coverage_ratio?: number | null
          field_full_count?: number | null
          field_known_players?: number | null
          field_known_scores?: number | null
          id?: string
          layout_key?: string | null
          layout_knowledge?: string | null
          layout_name?: string | null
          legacy_round_rating?: number | null
          likely_high?: number | null
          likely_low?: number | null
          model_version?: string
          origin_source?: string | null
          par?: number | null
          pdga_round_rating?: number | null
          played_on?: string
          pre_expected?: number | null
          pre_strokes_vs_expectation?: number | null
          round_number?: number | null
          round_performance_display?: number | null
          row_hash?: string | null
          score?: number
          seq?: number
          source_conflict?: string | null
          sources?: string[]
          status?: string
          status_reason?: string | null
          udisc_round_rating?: number | null
          user_id?: string
        }
        Relationships: []
      }
      dgd_v11_worker_secret: {
        Row: {
          id: number
          token: string
        }
        Insert: {
          id?: number
          token?: string
        }
        Update: {
          id?: number
          token?: string
        }
        Relationships: []
      }
      dgd_v12_display_candidates: {
        Row: {
          benchmark_version: string | null
          computed_at: string
          confidence: number | null
          display_form: number | null
          display_rating: number
          latent_skill: number
          model_version: string
          percentile: number | null
          scale_version: string
          user_id: string
        }
        Insert: {
          benchmark_version?: string | null
          computed_at?: string
          confidence?: number | null
          display_form?: number | null
          display_rating: number
          latent_skill: number
          model_version: string
          percentile?: number | null
          scale_version: string
          user_id: string
        }
        Update: {
          benchmark_version?: string | null
          computed_at?: string
          confidence?: number | null
          display_form?: number | null
          display_rating?: number
          latent_skill?: number
          model_version?: string
          percentile?: number | null
          scale_version?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgd_v12_display_candidates_benchmark_version_fkey"
            columns: ["benchmark_version"]
            isOneToOne: false
            referencedRelation: "dgd_benchmark_versions"
            referencedColumns: ["benchmark_version"]
          },
          {
            foreignKeyName: "dgd_v12_display_candidates_scale_version_fkey"
            columns: ["scale_version"]
            isOneToOne: false
            referencedRelation: "dgd_display_scales"
            referencedColumns: ["scale_version"]
          },
        ]
      }
      dgd_v12_player_state: {
        Row: {
          change_180: number | null
          change_30: number | null
          change_90: number | null
          confidence: number
          coverage: Json
          display_rating: number
          display_status: string
          eligible_rounds: number
          excluded_rounds: number
          form_confidence: string | null
          form_delta: number | null
          form_effective_rounds: number | null
          form_method: string | null
          form_reliable_rounds: number | null
          form_rounds: number
          form_state: string | null
          form_value: number | null
          input_basis: string
          last_played_on: string | null
          model_version: string
          rating_status: string
          recent: Json
          report_id: string | null
          skill_latent: number
          skill_sigma: number
          source_mix: Json
          state_hash: string | null
          subject_id: string | null
          trend: string
          updated_at: string
          user_id: string
          volatility: number | null
        }
        Insert: {
          change_180?: number | null
          change_30?: number | null
          change_90?: number | null
          confidence: number
          coverage?: Json
          display_rating: number
          display_status?: string
          eligible_rounds?: number
          excluded_rounds?: number
          form_confidence?: string | null
          form_delta?: number | null
          form_effective_rounds?: number | null
          form_method?: string | null
          form_reliable_rounds?: number | null
          form_rounds?: number
          form_state?: string | null
          form_value?: number | null
          input_basis?: string
          last_played_on?: string | null
          model_version: string
          rating_status?: string
          recent?: Json
          report_id?: string | null
          skill_latent: number
          skill_sigma: number
          source_mix?: Json
          state_hash?: string | null
          subject_id?: string | null
          trend?: string
          updated_at?: string
          user_id: string
          volatility?: number | null
        }
        Update: {
          change_180?: number | null
          change_30?: number | null
          change_90?: number | null
          confidence?: number
          coverage?: Json
          display_rating?: number
          display_status?: string
          eligible_rounds?: number
          excluded_rounds?: number
          form_confidence?: string | null
          form_delta?: number | null
          form_effective_rounds?: number | null
          form_method?: string | null
          form_reliable_rounds?: number | null
          form_rounds?: number
          form_state?: string | null
          form_value?: number | null
          input_basis?: string
          last_played_on?: string | null
          model_version?: string
          rating_status?: string
          recent?: Json
          report_id?: string | null
          skill_latent?: number
          skill_sigma?: number
          source_mix?: Json
          state_hash?: string | null
          subject_id?: string | null
          trend?: string
          updated_at?: string
          user_id?: string
          volatility?: number | null
        }
        Relationships: []
      }
      dgd_v12_state_history: {
        Row: {
          id: string
          model_version: string
          reason: string | null
          state: Json
          superseded_at: string
          user_id: string
        }
        Insert: {
          id?: string
          model_version: string
          reason?: string | null
          state: Json
          superseded_at?: string
          user_id: string
        }
        Update: {
          id?: string
          model_version?: string
          reason?: string | null
          state?: Json
          superseded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dgd_v13_player_state: {
        Row: {
          change_180: number | null
          change_30: number | null
          change_90: number | null
          confidence: number
          coverage: Json
          display_rating: number
          display_status: string
          eligible_rounds: number
          excluded_rounds: number
          form_confidence: string | null
          form_delta: number | null
          form_effective_rounds: number | null
          form_method: string | null
          form_reliable_rounds: number | null
          form_rounds: number
          form_state: string | null
          form_value: number | null
          input_basis: string
          last_played_on: string | null
          model_version: string
          rating_status: string
          recent: Json
          report_id: string | null
          skill_latent: number
          skill_sigma: number
          source_mix: Json
          state_hash: string | null
          subject_id: string | null
          trend: string
          updated_at: string
          user_id: string
          volatility: number | null
        }
        Insert: {
          change_180?: number | null
          change_30?: number | null
          change_90?: number | null
          confidence: number
          coverage?: Json
          display_rating: number
          display_status?: string
          eligible_rounds?: number
          excluded_rounds?: number
          form_confidence?: string | null
          form_delta?: number | null
          form_effective_rounds?: number | null
          form_method?: string | null
          form_reliable_rounds?: number | null
          form_rounds?: number
          form_state?: string | null
          form_value?: number | null
          input_basis?: string
          last_played_on?: string | null
          model_version: string
          rating_status?: string
          recent?: Json
          report_id?: string | null
          skill_latent: number
          skill_sigma: number
          source_mix?: Json
          state_hash?: string | null
          subject_id?: string | null
          trend?: string
          updated_at?: string
          user_id: string
          volatility?: number | null
        }
        Update: {
          change_180?: number | null
          change_30?: number | null
          change_90?: number | null
          confidence?: number
          coverage?: Json
          display_rating?: number
          display_status?: string
          eligible_rounds?: number
          excluded_rounds?: number
          form_confidence?: string | null
          form_delta?: number | null
          form_effective_rounds?: number | null
          form_method?: string | null
          form_reliable_rounds?: number | null
          form_rounds?: number
          form_state?: string | null
          form_value?: number | null
          input_basis?: string
          last_played_on?: string | null
          model_version?: string
          rating_status?: string
          recent?: Json
          report_id?: string | null
          skill_latent?: number
          skill_sigma?: number
          source_mix?: Json
          state_hash?: string | null
          subject_id?: string | null
          trend?: string
          updated_at?: string
          user_id?: string
          volatility?: number | null
        }
        Relationships: []
      }
      dgd_v13_state_history: {
        Row: {
          id: string
          model_version: string
          reason: string | null
          state: Json
          superseded_at: string
          user_id: string
        }
        Insert: {
          id?: string
          model_version: string
          reason?: string | null
          state: Json
          superseded_at?: string
          user_id: string
        }
        Update: {
          id?: string
          model_version?: string
          reason?: string | null
          state?: Json
          superseded_at?: string
          user_id?: string
        }
        Relationships: []
      }
      dgp_ingest_runs: {
        Row: {
          answers_written: number
          created_at: string
          failures: number
          finished_at: string | null
          id: string
          notes: string | null
          pages_fetched: number
          profiles_written: number
          source: string
          started_at: string
        }
        Insert: {
          answers_written?: number
          created_at?: string
          failures?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          pages_fetched?: number
          profiles_written?: number
          source?: string
          started_at?: string
        }
        Update: {
          answers_written?: number
          created_at?: string
          failures?: number
          finished_at?: string | null
          id?: string
          notes?: string | null
          pages_fetched?: number
          profiles_written?: number
          source?: string
          started_at?: string
        }
        Relationships: []
      }
      dgp_shot_answers: {
        Row: {
          answer_kind: string
          brand: string | null
          created_at: string
          distance_max_ft: number | null
          distance_min_ft: number | null
          fade: number | null
          glide: number | null
          id: string
          label: string
          mold: string | null
          mold_id: string | null
          profile_id: string
          rank: number
          share: number | null
          speed: number | null
          submissions: number
          turn: number | null
          weight_max_g: number | null
          weight_min_g: number | null
        }
        Insert: {
          answer_kind: string
          brand?: string | null
          created_at?: string
          distance_max_ft?: number | null
          distance_min_ft?: number | null
          fade?: number | null
          glide?: number | null
          id?: string
          label: string
          mold?: string | null
          mold_id?: string | null
          profile_id: string
          rank?: number
          share?: number | null
          speed?: number | null
          submissions?: number
          turn?: number | null
          weight_max_g?: number | null
          weight_min_g?: number | null
        }
        Update: {
          answer_kind?: string
          brand?: string | null
          created_at?: string
          distance_max_ft?: number | null
          distance_min_ft?: number | null
          fade?: number | null
          glide?: number | null
          id?: string
          label?: string
          mold?: string | null
          mold_id?: string | null
          profile_id?: string
          rank?: number
          share?: number | null
          speed?: number | null
          submissions?: number
          turn?: number | null
          weight_max_g?: number | null
          weight_min_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "dgp_shot_answers_mold_id_fkey"
            columns: ["mold_id"]
            isOneToOne: false
            referencedRelation: "disc_molds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dgp_shot_answers_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "dgp_shot_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      dgp_shot_profiles: {
        Row: {
          created_at: string
          disc_class: string
          id: string
          shot_shape: string
          skill_group_id: string
          source_url: string
          speed_max: number | null
          speed_min: number | null
          submissions: number
          throw_style: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          disc_class: string
          id?: string
          shot_shape: string
          skill_group_id: string
          source_url: string
          speed_max?: number | null
          speed_min?: number | null
          submissions?: number
          throw_style: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          disc_class?: string
          id?: string
          shot_shape?: string
          skill_group_id?: string
          source_url?: string
          speed_max?: number | null
          speed_min?: number | null
          submissions?: number
          throw_style?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dgp_shot_profiles_skill_group_id_fkey"
            columns: ["skill_group_id"]
            isOneToOne: false
            referencedRelation: "dgp_skill_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      dgp_skill_groups: {
        Row: {
          created_at: string
          group_code: string
          id: string
          pdga_band: string
          pdga_max: number | null
          pdga_min: number | null
          source_url: string
          udisc_band: string
          udisc_max: number | null
          udisc_min: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          group_code: string
          id?: string
          pdga_band: string
          pdga_max?: number | null
          pdga_min?: number | null
          source_url: string
          udisc_band: string
          udisc_max?: number | null
          udisc_min?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          group_code?: string
          id?: string
          pdga_band?: string
          pdga_max?: number | null
          pdga_min?: number | null
          source_url?: string
          udisc_band?: string
          udisc_max?: number | null
          udisc_min?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      director_profiles: {
        Row: {
          applied_at: string
          approved_at: string | null
          approved_by: string | null
          contact_email: string | null
          created_at: string
          experience: string | null
          org_name: string | null
          pdga_number: number | null
          pitch: string | null
          region: string | null
          reviewer_notes: string | null
          status: Database["public"]["Enums"]["director_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applied_at?: string
          approved_at?: string | null
          approved_by?: string | null
          contact_email?: string | null
          created_at?: string
          experience?: string | null
          org_name?: string | null
          pdga_number?: number | null
          pitch?: string | null
          region?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["director_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applied_at?: string
          approved_at?: string | null
          approved_by?: string | null
          contact_email?: string | null
          created_at?: string
          experience?: string | null
          org_name?: string | null
          pdga_number?: number | null
          pitch?: string | null
          region?: string | null
          reviewer_notes?: string | null
          status?: Database["public"]["Enums"]["director_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      disc_manufacturers: {
        Row: {
          country: string | null
          created_at: string
          id: string
          name: string
          slug: string
          website: string | null
        }
        Insert: {
          country?: string | null
          created_at?: string
          id?: string
          name: string
          slug: string
          website?: string | null
        }
        Update: {
          country?: string | null
          created_at?: string
          id?: string
          name?: string
          slug?: string
          website?: string | null
        }
        Relationships: []
      }
      disc_market_trends: {
        Row: {
          brand: string | null
          created_at: string
          description: string | null
          fade: number | null
          fetched_at: string
          glide: number | null
          id: string
          image_url: string | null
          mold_id: string | null
          name: string
          plastic: string | null
          product_url: string
          rank: number
          rating: number | null
          review_count: number | null
          source: string
          speed: number | null
          turn: number | null
          week_of: string
        }
        Insert: {
          brand?: string | null
          created_at?: string
          description?: string | null
          fade?: number | null
          fetched_at?: string
          glide?: number | null
          id?: string
          image_url?: string | null
          mold_id?: string | null
          name: string
          plastic?: string | null
          product_url: string
          rank: number
          rating?: number | null
          review_count?: number | null
          source?: string
          speed?: number | null
          turn?: number | null
          week_of: string
        }
        Update: {
          brand?: string | null
          created_at?: string
          description?: string | null
          fade?: number | null
          fetched_at?: string
          glide?: number | null
          id?: string
          image_url?: string | null
          mold_id?: string | null
          name?: string
          plastic?: string | null
          product_url?: string
          rank?: number
          rating?: number | null
          review_count?: number | null
          source?: string
          speed?: number | null
          turn?: number | null
          week_of?: string
        }
        Relationships: [
          {
            foreignKeyName: "disc_market_trends_mold_id_fkey"
            columns: ["mold_id"]
            isOneToOne: false
            referencedRelation: "disc_molds"
            referencedColumns: ["id"]
          },
        ]
      }
      disc_molds: {
        Row: {
          category: Database["public"]["Enums"]["disc_category"]
          created_at: string
          description: string | null
          diameter_cm: number | null
          fade: number | null
          flexibility_kg: number | null
          glide: number | null
          height_cm: number | null
          id: string
          image_url: string | null
          inside_rim_diameter_cm: number | null
          last_production_year: number | null
          link_url: string | null
          manufacturer_id: string
          max_weight_g: number | null
          name: string
          pdga_approved: boolean
          pdga_approved_on: string | null
          pdga_class: string | null
          rim_depth_cm: number | null
          rim_depth_ratio: number | null
          rim_width_cm: number | null
          slug: string | null
          source: string
          speed: number | null
          stability: Database["public"]["Enums"]["disc_stability"] | null
          turn: number | null
          updated_at: string
        }
        Insert: {
          category?: Database["public"]["Enums"]["disc_category"]
          created_at?: string
          description?: string | null
          diameter_cm?: number | null
          fade?: number | null
          flexibility_kg?: number | null
          glide?: number | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          inside_rim_diameter_cm?: number | null
          last_production_year?: number | null
          link_url?: string | null
          manufacturer_id: string
          max_weight_g?: number | null
          name: string
          pdga_approved?: boolean
          pdga_approved_on?: string | null
          pdga_class?: string | null
          rim_depth_cm?: number | null
          rim_depth_ratio?: number | null
          rim_width_cm?: number | null
          slug?: string | null
          source?: string
          speed?: number | null
          stability?: Database["public"]["Enums"]["disc_stability"] | null
          turn?: number | null
          updated_at?: string
        }
        Update: {
          category?: Database["public"]["Enums"]["disc_category"]
          created_at?: string
          description?: string | null
          diameter_cm?: number | null
          fade?: number | null
          flexibility_kg?: number | null
          glide?: number | null
          height_cm?: number | null
          id?: string
          image_url?: string | null
          inside_rim_diameter_cm?: number | null
          last_production_year?: number | null
          link_url?: string | null
          manufacturer_id?: string
          max_weight_g?: number | null
          name?: string
          pdga_approved?: boolean
          pdga_approved_on?: string | null
          pdga_class?: string | null
          rim_depth_cm?: number | null
          rim_depth_ratio?: number | null
          rim_width_cm?: number | null
          slug?: string | null
          source?: string
          speed?: number | null
          stability?: Database["public"]["Enums"]["disc_stability"] | null
          turn?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "disc_molds_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "disc_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      disc_plastics: {
        Row: {
          created_at: string
          durability: number
          grip: number
          id: string
          manufacturer_id: string
          name: string
          tier: Database["public"]["Enums"]["disc_plastic_tier"]
        }
        Insert: {
          created_at?: string
          durability?: number
          grip?: number
          id?: string
          manufacturer_id: string
          name: string
          tier?: Database["public"]["Enums"]["disc_plastic_tier"]
        }
        Update: {
          created_at?: string
          durability?: number
          grip?: number
          id?: string
          manufacturer_id?: string
          name?: string
          tier?: Database["public"]["Enums"]["disc_plastic_tier"]
        }
        Relationships: [
          {
            foreignKeyName: "disc_plastics_manufacturer_id_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "disc_manufacturers"
            referencedColumns: ["id"]
          },
        ]
      }
      duel_participants: {
        Row: {
          created_at: string
          duel_id: string
          id: string
          invite_status: string
          role: string
          score: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          duel_id: string
          id?: string
          invite_status?: string
          role?: string
          score?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          duel_id?: string
          id?: string
          invite_status?: string
          role?: string
          score?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "duel_participants_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "game_duels"
            referencedColumns: ["id"]
          },
        ]
      }
      duel_submissions: {
        Row: {
          created_at: string
          dispute_reason: string | null
          duel_id: string
          id: string
          notes: string | null
          score: number | null
          status: string
          updated_at: string
          user_id: string
          verified_at: string | null
          verified_by: string | null
          video_path: string | null
          video_url: string | null
        }
        Insert: {
          created_at?: string
          dispute_reason?: string | null
          duel_id: string
          id?: string
          notes?: string | null
          score?: number | null
          status?: string
          updated_at?: string
          user_id: string
          verified_at?: string | null
          verified_by?: string | null
          video_path?: string | null
          video_url?: string | null
        }
        Update: {
          created_at?: string
          dispute_reason?: string | null
          duel_id?: string
          id?: string
          notes?: string | null
          score?: number | null
          status?: string
          updated_at?: string
          user_id?: string
          verified_at?: string | null
          verified_by?: string | null
          video_path?: string | null
          video_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "duel_submissions_duel_id_fkey"
            columns: ["duel_id"]
            isOneToOne: false
            referencedRelation: "game_duels"
            referencedColumns: ["id"]
          },
        ]
      }
      entitlement_overrides: {
        Row: {
          created_at: string
          expires_at: string | null
          granted_by: string | null
          id: string
          reason: string | null
          tier_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          reason?: string | null
          tier_key: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string | null
          granted_by?: string | null
          id?: string
          reason?: string | null
          tier_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "entitlement_overrides_tier_key_fkey"
            columns: ["tier_key"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["key"]
          },
        ]
      }
      entity_revisions: {
        Row: {
          after_data: Json
          before_data: Json | null
          changed_by: string
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_kind"]
          id: string
          note: string | null
        }
        Insert: {
          after_data: Json
          before_data?: Json | null
          changed_by: string
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_kind"]
          id?: string
          note?: string | null
        }
        Update: {
          after_data?: Json
          before_data?: Json | null
          changed_by?: string
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_kind"]
          id?: string
          note?: string | null
        }
        Relationships: []
      }
      event_alerts: {
        Row: {
          body: string | null
          created_at: string
          created_by: string
          delay_minutes: number | null
          hole_number: number | null
          id: string
          is_active: boolean
          kind: string
          resolved_at: string | null
          title: string
          tournament_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          created_by?: string
          delay_minutes?: number | null
          hole_number?: number | null
          id?: string
          is_active?: boolean
          kind: string
          resolved_at?: string | null
          title: string
          tournament_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          created_by?: string
          delay_minutes?: number | null
          hole_number?: number | null
          id?: string
          is_active?: boolean
          kind?: string
          resolved_at?: string | null
          title?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_alerts_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      event_announcements: {
        Row: {
          body: string
          created_at: string
          created_by: string
          id: string
          pinned: boolean
          tournament_id: string
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string
          id?: string
          pinned?: boolean
          tournament_id: string
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string
          id?: string
          pinned?: boolean
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_announcements_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      event_card_assignments: {
        Row: {
          card_label: string
          created_at: string
          created_by: string
          id: string
          registration_id: string
          round_id: string
          starting_hole: number | null
          tee_time: string | null
          tournament_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          card_label: string
          created_at?: string
          created_by?: string
          id?: string
          registration_id: string
          round_id: string
          starting_hole?: number | null
          tee_time?: string | null
          tournament_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          card_label?: string
          created_at?: string
          created_by?: string
          id?: string
          registration_id?: string
          round_id?: string
          starting_hole?: number | null
          tee_time?: string | null
          tournament_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_card_assignments_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "tournament_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_card_assignments_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "tournament_rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_card_assignments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      event_claim_requests: {
        Row: {
          created_at: string
          evidence: string
          id: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          evidence: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          evidence?: string
          id?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_claim_requests_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      event_directory: {
        Row: {
          city: string | null
          country: string | null
          cover_url: string | null
          created_at: string
          discovered_via: string | null
          end_date: string | null
          field_capacity: number | null
          field_size: number | null
          id: string
          kind: string
          latitude: number | null
          longitude: number | null
          name: string
          pdga_event_ref: string | null
          refreshed_at: string
          registration_status: string | null
          sanctioning: string | null
          source: string
          source_event_id: string
          start_date: string | null
          state: string | null
          tier: string | null
          updated_at: string
          url: string | null
          venue_name: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          discovered_via?: string | null
          end_date?: string | null
          field_capacity?: number | null
          field_size?: number | null
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          pdga_event_ref?: string | null
          refreshed_at?: string
          registration_status?: string | null
          sanctioning?: string | null
          source: string
          source_event_id: string
          start_date?: string | null
          state?: string | null
          tier?: string | null
          updated_at?: string
          url?: string | null
          venue_name?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          discovered_via?: string | null
          end_date?: string | null
          field_capacity?: number | null
          field_size?: number | null
          id?: string
          kind?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          pdga_event_ref?: string | null
          refreshed_at?: string
          registration_status?: string | null
          sanctioning?: string | null
          source?: string
          source_event_id?: string
          start_date?: string | null
          state?: string | null
          tier?: string | null
          updated_at?: string
          url?: string | null
          venue_name?: string | null
        }
        Relationships: []
      }
      event_directory_syncs: {
        Row: {
          error: string | null
          finished_at: string | null
          found: number
          id: string
          ok: boolean
          scope: string | null
          source: string
          started_at: string
          upserted: number
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          found?: number
          id?: string
          ok?: boolean
          scope?: string | null
          source: string
          started_at?: string
          upserted?: number
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          found?: number
          id?: string
          ok?: boolean
          scope?: string | null
          source?: string
          started_at?: string
          upserted?: number
        }
        Relationships: []
      }
      event_invites: {
        Row: {
          created_at: string
          email_sent_at: string | null
          error_message: string | null
          event_id: string
          event_kind: Database["public"]["Enums"]["event_invite_kind"]
          event_location: string | null
          event_starts_at: string | null
          event_title: string | null
          id: string
          invitee_email: string | null
          invitee_name: string | null
          invitee_phone: string | null
          invitee_user_id: string | null
          inviter_id: string
          personal_message: string | null
          responded_at: string | null
          rsvp: Database["public"]["Enums"]["event_invite_rsvp"]
          send_email: boolean
          status: Database["public"]["Enums"]["event_invite_status"]
          token: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email_sent_at?: string | null
          error_message?: string | null
          event_id: string
          event_kind: Database["public"]["Enums"]["event_invite_kind"]
          event_location?: string | null
          event_starts_at?: string | null
          event_title?: string | null
          id?: string
          invitee_email?: string | null
          invitee_name?: string | null
          invitee_phone?: string | null
          invitee_user_id?: string | null
          inviter_id: string
          personal_message?: string | null
          responded_at?: string | null
          rsvp?: Database["public"]["Enums"]["event_invite_rsvp"]
          send_email?: boolean
          status?: Database["public"]["Enums"]["event_invite_status"]
          token?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email_sent_at?: string | null
          error_message?: string | null
          event_id?: string
          event_kind?: Database["public"]["Enums"]["event_invite_kind"]
          event_location?: string | null
          event_starts_at?: string | null
          event_title?: string | null
          id?: string
          invitee_email?: string | null
          invitee_name?: string | null
          invitee_phone?: string | null
          invitee_user_id?: string | null
          inviter_id?: string
          personal_message?: string | null
          responded_at?: string | null
          rsvp?: Database["public"]["Enums"]["event_invite_rsvp"]
          send_email?: boolean
          status?: Database["public"]["Enums"]["event_invite_status"]
          token?: string
          updated_at?: string
        }
        Relationships: []
      }
      event_join_codes: {
        Row: {
          ai_allowance: number
          allow_caddy: boolean
          allow_guest_cards: boolean
          code: string
          course_id: string | null
          created_at: string
          created_by: string
          expires_at: string | null
          id: string
          is_active: boolean
          label: string | null
          layout_id: string | null
          league_event_id: string | null
          league_id: string | null
          max_uses: number | null
          pin_hash: string | null
          pin_salt: string | null
          round_id: string | null
          target_kind: string
          tournament_id: string | null
          tournament_round_id: string | null
          updated_at: string
          use_count: number
        }
        Insert: {
          ai_allowance?: number
          allow_caddy?: boolean
          allow_guest_cards?: boolean
          code: string
          course_id?: string | null
          created_at?: string
          created_by: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          layout_id?: string | null
          league_event_id?: string | null
          league_id?: string | null
          max_uses?: number | null
          pin_hash?: string | null
          pin_salt?: string | null
          round_id?: string | null
          target_kind: string
          tournament_id?: string | null
          tournament_round_id?: string | null
          updated_at?: string
          use_count?: number
        }
        Update: {
          ai_allowance?: number
          allow_caddy?: boolean
          allow_guest_cards?: boolean
          code?: string
          course_id?: string | null
          created_at?: string
          created_by?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean
          label?: string | null
          layout_id?: string | null
          league_event_id?: string | null
          league_id?: string | null
          max_uses?: number | null
          pin_hash?: string | null
          pin_salt?: string | null
          round_id?: string | null
          target_kind?: string
          tournament_id?: string | null
          tournament_round_id?: string | null
          updated_at?: string
          use_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "event_join_codes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "event_join_codes_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_join_codes_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_join_codes_league_event_id_fkey"
            columns: ["league_event_id"]
            isOneToOne: false
            referencedRelation: "league_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_join_codes_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_join_codes_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_join_codes_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_join_codes_tournament_round_id_fkey"
            columns: ["tournament_round_id"]
            isOneToOne: false
            referencedRelation: "tournament_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      event_manager_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          event_id: string
          id: string
          kind: string
          message: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          event_id: string
          id?: string
          kind: string
          message?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          event_id?: string
          id?: string
          kind?: string
          message?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_managers: {
        Row: {
          access_level: string
          created_at: string
          event_id: string
          extra_capabilities: string[]
          granted_by: string | null
          id: string
          kind: string
          revoked_capabilities: string[]
          staff_role: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_level?: string
          created_at?: string
          event_id: string
          extra_capabilities?: string[]
          granted_by?: string | null
          id?: string
          kind: string
          revoked_capabilities?: string[]
          staff_role?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_level?: string
          created_at?: string
          event_id?: string
          extra_capabilities?: string[]
          granted_by?: string | null
          id?: string
          kind?: string
          revoked_capabilities?: string[]
          staff_role?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      event_prize_audit: {
        Row: {
          action: string
          actor: string | null
          at: string
          detail: Json
          id: string
          prize_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          detail?: Json
          id?: string
          prize_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          detail?: Json
          id?: string
          prize_id?: string
        }
        Relationships: []
      }
      event_prize_recipients: {
        Row: {
          amount: number
          created_at: string
          created_by: string
          id: string
          paid: boolean
          prize_id: string
          recipient_name: string
          user_id: string | null
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          paid?: boolean
          prize_id: string
          recipient_name: string
          user_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string
          id?: string
          paid?: boolean
          prize_id?: string
          recipient_name?: string
          user_id?: string | null
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "event_prize_recipients_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "event_prizes"
            referencedColumns: ["id"]
          },
        ]
      }
      event_prizes: {
        Row: {
          added_cash: number
          amount: number
          award_type: string
          carryover_in: number
          contributors: number
          cost: number | null
          created_at: string
          created_by: string
          description: string | null
          division_eligibility: string | null
          event_id: string
          event_kind: string
          fund_scope_id: string | null
          fund_scope_kind: string
          funding_source: string | null
          hole_number: number | null
          id: string
          name: string
          notes: string | null
          payout_rule: string
          per_player: number
          remainder_action: string
          round_to_5: boolean
          sponsor_name: string | null
          status: string
          team_award: boolean
          team_size: number
          updated_at: string
          value_kind: string
          visibility: string
          winner_percent: number
        }
        Insert: {
          added_cash?: number
          amount?: number
          award_type: string
          carryover_in?: number
          contributors?: number
          cost?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          division_eligibility?: string | null
          event_id: string
          event_kind: string
          fund_scope_id?: string | null
          fund_scope_kind?: string
          funding_source?: string | null
          hole_number?: number | null
          id?: string
          name: string
          notes?: string | null
          payout_rule?: string
          per_player?: number
          remainder_action?: string
          round_to_5?: boolean
          sponsor_name?: string | null
          status?: string
          team_award?: boolean
          team_size?: number
          updated_at?: string
          value_kind?: string
          visibility?: string
          winner_percent?: number
        }
        Update: {
          added_cash?: number
          amount?: number
          award_type?: string
          carryover_in?: number
          contributors?: number
          cost?: number | null
          created_at?: string
          created_by?: string
          description?: string | null
          division_eligibility?: string | null
          event_id?: string
          event_kind?: string
          fund_scope_id?: string | null
          fund_scope_kind?: string
          funding_source?: string | null
          hole_number?: number | null
          id?: string
          name?: string
          notes?: string | null
          payout_rule?: string
          per_player?: number
          remainder_action?: string
          round_to_5?: boolean
          sponsor_name?: string | null
          status?: string
          team_award?: boolean
          team_size?: number
          updated_at?: string
          value_kind?: string
          visibility?: string
          winner_percent?: number
        }
        Relationships: []
      }
      event_role_capabilities: {
        Row: {
          capability: string
          staff_role: string
        }
        Insert: {
          capability: string
          staff_role: string
        }
        Update: {
          capability?: string
          staff_role?: string
        }
        Relationships: []
      }
      event_rsvps: {
        Row: {
          attended: boolean
          created_at: string
          event_id: string
          status: Database["public"]["Enums"]["event_rsvp_status"]
          user_id: string
        }
        Insert: {
          attended?: boolean
          created_at?: string
          event_id: string
          status?: Database["public"]["Enums"]["event_rsvp_status"]
          user_id: string
        }
        Update: {
          attended?: boolean
          created_at?: string
          event_id?: string
          status?: Database["public"]["Enums"]["event_rsvp_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_rsvps_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "community_events"
            referencedColumns: ["id"]
          },
        ]
      }
      event_series: {
        Row: {
          award_places: number
          club_id: string | null
          copied_from_id: string | null
          counting_events: number | null
          created_at: string
          description: string | null
          division_change: string
          drop_worst: number
          field_size_bonus: number
          finale_event_id: string | null
          finale_multiplier: number
          host_name: string | null
          id: string
          management_status: string
          min_event_points: number
          name: string
          owner_id: string | null
          participation_bonus: number
          points_system: string
          points_table: Json
          qualify_min_events: number
          sanction_level: string
          scoring_version: string
          season: string | null
          season_end: string | null
          season_start: string | null
          slug: string
          status: string
          updated_at: string
          visibility: string
          year: number | null
        }
        Insert: {
          award_places?: number
          club_id?: string | null
          copied_from_id?: string | null
          counting_events?: number | null
          created_at?: string
          description?: string | null
          division_change?: string
          drop_worst?: number
          field_size_bonus?: number
          finale_event_id?: string | null
          finale_multiplier?: number
          host_name?: string | null
          id?: string
          management_status?: string
          min_event_points?: number
          name: string
          owner_id?: string | null
          participation_bonus?: number
          points_system?: string
          points_table?: Json
          qualify_min_events?: number
          sanction_level?: string
          scoring_version?: string
          season?: string | null
          season_end?: string | null
          season_start?: string | null
          slug: string
          status?: string
          updated_at?: string
          visibility?: string
          year?: number | null
        }
        Update: {
          award_places?: number
          club_id?: string | null
          copied_from_id?: string | null
          counting_events?: number | null
          created_at?: string
          description?: string | null
          division_change?: string
          drop_worst?: number
          field_size_bonus?: number
          finale_event_id?: string | null
          finale_multiplier?: number
          host_name?: string | null
          id?: string
          management_status?: string
          min_event_points?: number
          name?: string
          owner_id?: string | null
          participation_bonus?: number
          points_system?: string
          points_table?: Json
          qualify_min_events?: number
          sanction_level?: string
          scoring_version?: string
          season?: string | null
          season_end?: string | null
          season_start?: string | null
          slug?: string
          status?: string
          updated_at?: string
          visibility?: string
          year?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "event_series_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "event_series_copied_from_id_fkey"
            columns: ["copied_from_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      event_setup_drafts: {
        Row: {
          created_at: string
          id: string
          kind: string
          series_id: string | null
          state: Json
          step: number
          title: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          series_id?: string | null
          state?: Json
          step?: number
          title?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          series_id?: string | null
          state?: Json
          step?: number
          title?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_setup_drafts_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      event_volunteer_tasks: {
        Row: {
          assigned_to: string | null
          completed_at: string | null
          created_at: string
          created_by: string
          due_at: string | null
          hole_number: number | null
          id: string
          notes: string | null
          status: string
          title: string
          tournament_id: string
          updated_at: string
        }
        Insert: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_at?: string | null
          hole_number?: number | null
          id?: string
          notes?: string | null
          status?: string
          title: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          assigned_to?: string | null
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_at?: string | null
          hole_number?: number | null
          id?: string
          notes?: string | null
          status?: string
          title?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "event_volunteer_tasks_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      external_chat_links: {
        Row: {
          created_at: string
          created_by: string
          id: string
          label: string | null
          owner_id: string
          owner_type: string
          platform: string
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          created_by: string
          id?: string
          label?: string | null
          owner_id: string
          owner_type: string
          platform: string
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          created_by?: string
          id?: string
          label?: string | null
          owner_id?: string
          owner_type?: string
          platform?: string
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      external_round_holes: {
        Row: {
          created_at: string
          external_round_id: string
          hole_number: number
          id: string
          par: number | null
          strokes: number | null
        }
        Insert: {
          created_at?: string
          external_round_id: string
          hole_number: number
          id?: string
          par?: number | null
          strokes?: number | null
        }
        Update: {
          created_at?: string
          external_round_id?: string
          hole_number?: number
          id?: string
          par?: number | null
          strokes?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "external_round_holes_external_round_id_fkey"
            columns: ["external_round_id"]
            isOneToOne: false
            referencedRelation: "external_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      external_rounds: {
        Row: {
          chainlink_rating: number | null
          course_name: string
          created_at: string
          division: string | null
          evaluated_on: string | null
          event_context: string | null
          event_name: string | null
          field_size: number | null
          format: string
          id: string
          included: boolean | null
          layout_name: string | null
          mock_pdga_rating: number | null
          mock_pdga_source: string | null
          notes: string | null
          participant_count: number | null
          participant_count_source: string
          pdga_event_ref: string | null
          place: number | null
          played_on: string
          points: number | null
          rating_exclusion_reason: string | null
          round_format_class: string | null
          round_rating: number | null
          score: number | null
          source: string
          ssa: number | null
          to_par: number | null
          trust_level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          chainlink_rating?: number | null
          course_name: string
          created_at?: string
          division?: string | null
          evaluated_on?: string | null
          event_context?: string | null
          event_name?: string | null
          field_size?: number | null
          format?: string
          id?: string
          included?: boolean | null
          layout_name?: string | null
          mock_pdga_rating?: number | null
          mock_pdga_source?: string | null
          notes?: string | null
          participant_count?: number | null
          participant_count_source?: string
          pdga_event_ref?: string | null
          place?: number | null
          played_on: string
          points?: number | null
          rating_exclusion_reason?: string | null
          round_format_class?: string | null
          round_rating?: number | null
          score?: number | null
          source?: string
          ssa?: number | null
          to_par?: number | null
          trust_level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          chainlink_rating?: number | null
          course_name?: string
          created_at?: string
          division?: string | null
          evaluated_on?: string | null
          event_context?: string | null
          event_name?: string | null
          field_size?: number | null
          format?: string
          id?: string
          included?: boolean | null
          layout_name?: string | null
          mock_pdga_rating?: number | null
          mock_pdga_source?: string | null
          notes?: string | null
          participant_count?: number | null
          participant_count_source?: string
          pdga_event_ref?: string | null
          place?: number | null
          played_on?: string
          points?: number | null
          rating_exclusion_reason?: string | null
          round_format_class?: string | null
          round_rating?: number | null
          score?: number | null
          source?: string
          ssa?: number | null
          to_par?: number | null
          trust_level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      feature_flags: {
        Row: {
          category: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean
          key: string
          label: string
          sort_order: number
          unit: string
          updated_at: string
        }
        Insert: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key: string
          label: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          category?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean
          key?: string
          label?: string
          sort_order?: number
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      feature_usage: {
        Row: {
          count: number
          feature_key: string
          id: string
          period_start: string
          updated_at: string
          user_id: string
        }
        Insert: {
          count?: number
          feature_key: string
          id?: string
          period_start: string
          updated_at?: string
          user_id: string
        }
        Update: {
          count?: number
          feature_key?: string
          id?: string
          period_start?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "feature_usage_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
        ]
      }
      field_observations: {
        Row: {
          entity_id: string
          entity_type: string
          field: string
          id: string
          observed_at: string
          parser_version: string | null
          snapshot_id: string | null
          source: string
          superseded_at: string | null
          value: Json | null
          verified: boolean
        }
        Insert: {
          entity_id: string
          entity_type: string
          field: string
          id?: string
          observed_at?: string
          parser_version?: string | null
          snapshot_id?: string | null
          source: string
          superseded_at?: string | null
          value?: Json | null
          verified?: boolean
        }
        Update: {
          entity_id?: string
          entity_type?: string
          field?: string
          id?: string
          observed_at?: string
          parser_version?: string | null
          snapshot_id?: string | null
          source?: string
          superseded_at?: string | null
          value?: Json | null
          verified?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "field_observations_snapshot_id_fkey"
            columns: ["snapshot_id"]
            isOneToOne: false
            referencedRelation: "source_snapshots"
            referencedColumns: ["id"]
          },
        ]
      }
      field_registry: {
        Row: {
          created_at: string
          data_type: string
          deprecated: boolean
          editable_by_admin: boolean
          editable_by_owner: boolean
          entity_type: Database["public"]["Enums"]["entity_kind"]
          field_group: string
          field_key: string
          help_text: string | null
          id: string
          label: string
          options: Json | null
          order_index: number
          required: boolean
          source_key: string | null
          updated_at: string
          visible_to_public: boolean
        }
        Insert: {
          created_at?: string
          data_type: string
          deprecated?: boolean
          editable_by_admin?: boolean
          editable_by_owner?: boolean
          entity_type: Database["public"]["Enums"]["entity_kind"]
          field_group?: string
          field_key: string
          help_text?: string | null
          id?: string
          label: string
          options?: Json | null
          order_index?: number
          required?: boolean
          source_key?: string | null
          updated_at?: string
          visible_to_public?: boolean
        }
        Update: {
          created_at?: string
          data_type?: string
          deprecated?: boolean
          editable_by_admin?: boolean
          editable_by_owner?: boolean
          entity_type?: Database["public"]["Enums"]["entity_kind"]
          field_group?: string
          field_key?: string
          help_text?: string | null
          id?: string
          label?: string
          options?: Json | null
          order_index?: number
          required?: boolean
          source_key?: string | null
          updated_at?: string
          visible_to_public?: boolean
        }
        Relationships: []
      }
      follows: {
        Row: {
          created_at: string
          followee_id: string
          follower_id: string
        }
        Insert: {
          created_at?: string
          followee_id: string
          follower_id: string
        }
        Update: {
          created_at?: string
          followee_id?: string
          follower_id?: string
        }
        Relationships: []
      }
      friendships: {
        Row: {
          addressee_id: string
          created_at: string
          id: string
          requester_id: string
          status: string
          updated_at: string
        }
        Insert: {
          addressee_id: string
          created_at?: string
          id?: string
          requester_id: string
          status?: string
          updated_at?: string
        }
        Update: {
          addressee_id?: string
          created_at?: string
          id?: string
          requester_id?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      game_duels: {
        Row: {
          arena: string
          completed_at: string | null
          created_at: string
          created_by: string
          due_at: string | null
          game_key: string
          id: string
          requires_video: boolean
          rules: string | null
          status: string
          target_metric: string | null
          title: string
          updated_at: string
          wager_xp: number
          winner_id: string | null
        }
        Insert: {
          arena?: string
          completed_at?: string | null
          created_at?: string
          created_by: string
          due_at?: string | null
          game_key: string
          id?: string
          requires_video?: boolean
          rules?: string | null
          status?: string
          target_metric?: string | null
          title: string
          updated_at?: string
          wager_xp?: number
          winner_id?: string | null
        }
        Update: {
          arena?: string
          completed_at?: string | null
          created_at?: string
          created_by?: string
          due_at?: string | null
          game_key?: string
          id?: string
          requires_video?: boolean
          rules?: string | null
          status?: string
          target_metric?: string | null
          title?: string
          updated_at?: string
          wager_xp?: number
          winner_id?: string | null
        }
        Relationships: []
      }
      geo_place_cache: {
        Row: {
          label: string | null
          latitude: number | null
          longitude: number | null
          place: string
          updated_at: string
        }
        Insert: {
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          place: string
          updated_at?: string
        }
        Update: {
          label?: string | null
          latitude?: number | null
          longitude?: number | null
          place?: string
          updated_at?: string
        }
        Relationships: []
      }
      geometry_harvest_cells: {
        Row: {
          attempts: number
          courses_matched: number
          east: number
          holes_filled: number
          id: string
          last_error: string | null
          last_run_at: string | null
          next_run_at: string
          north: number
          observations: number
          region: string
          sites_found: number
          south: number
          status: string
          updated_at: string
          west: number
        }
        Insert: {
          attempts?: number
          courses_matched?: number
          east: number
          holes_filled?: number
          id: string
          last_error?: string | null
          last_run_at?: string | null
          next_run_at?: string
          north: number
          observations?: number
          region: string
          sites_found?: number
          south: number
          status?: string
          updated_at?: string
          west: number
        }
        Update: {
          attempts?: number
          courses_matched?: number
          east?: number
          holes_filled?: number
          id?: string
          last_error?: string | null
          last_run_at?: string | null
          next_run_at?: string
          north?: number
          observations?: number
          region?: string
          sites_found?: number
          south?: number
          status?: string
          updated_at?: string
          west?: number
        }
        Relationships: []
      }
      guest_score_entries: {
        Row: {
          created_at: string
          hole_number: number
          id: string
          penalties: number
          round_id: string
          round_player_id: string
          scorer_id: string
          strokes: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          hole_number: number
          id?: string
          penalties?: number
          round_id: string
          round_player_id: string
          scorer_id: string
          strokes?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          hole_number?: number
          id?: string
          penalties?: number
          round_id?: string
          round_player_id?: string
          scorer_id?: string
          strokes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_score_entries_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_score_entries_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_score_entries_scorer_id_fkey"
            columns: ["scorer_id"]
            isOneToOne: false
            referencedRelation: "guest_scorers"
            referencedColumns: ["id"]
          },
        ]
      }
      guest_scorers: {
        Row: {
          ai_used: number
          claim_token: string | null
          claimed_at: string | null
          claimed_by: string | null
          code_id: string
          created_at: string
          display_name: string
          division_name: string | null
          id: string
          last_seen_at: string
          pdga_number: string | null
          round_id: string | null
          round_player_id: string | null
          scores_whole_card: boolean
          token_hash: string
          updated_at: string
        }
        Insert: {
          ai_used?: number
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          code_id: string
          created_at?: string
          display_name: string
          division_name?: string | null
          id?: string
          last_seen_at?: string
          pdga_number?: string | null
          round_id?: string | null
          round_player_id?: string | null
          scores_whole_card?: boolean
          token_hash: string
          updated_at?: string
        }
        Update: {
          ai_used?: number
          claim_token?: string | null
          claimed_at?: string | null
          claimed_by?: string | null
          code_id?: string
          created_at?: string
          display_name?: string
          division_name?: string | null
          id?: string
          last_seen_at?: string
          pdga_number?: string | null
          round_id?: string | null
          round_player_id?: string | null
          scores_whole_card?: boolean
          token_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "guest_scorers_code_id_fkey"
            columns: ["code_id"]
            isOneToOne: false
            referencedRelation: "event_join_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_scorers_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "guest_scorers_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      hidden_posts: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hidden_posts_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      hole_baskets: {
        Row: {
          accuracy_m: number | null
          basket_type: string | null
          color: string | null
          created_at: string
          distance_ft: number | null
          hole_id: string
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          sort_order: number
          source: string | null
          split_point: Json | null
          status: string
        }
        Insert: {
          accuracy_m?: number | null
          basket_type?: string | null
          color?: string | null
          created_at?: string
          distance_ft?: number | null
          hole_id: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          sort_order?: number
          source?: string | null
          split_point?: Json | null
          status?: string
        }
        Update: {
          accuracy_m?: number | null
          basket_type?: string | null
          color?: string | null
          created_at?: string
          distance_ft?: number | null
          hole_id?: string
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          sort_order?: number
          source?: string | null
          split_point?: Json | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "hole_baskets_hole_id_fkey"
            columns: ["hole_id"]
            isOneToOne: false
            referencedRelation: "holes"
            referencedColumns: ["id"]
          },
        ]
      }
      hole_intel: {
        Row: {
          ace_count: number
          avg_strokes: number | null
          birdie_count: number
          bogey_count: number
          c1_putts_made: number
          c1_putts_missed: number
          c2_putts_made: number
          c2_putts_missed: number
          double_plus_count: number
          eagle_count: number
          hole_number: number
          layout_id: string
          longest_throw_ft: number | null
          ob_strokes_total: number
          par: number | null
          par_count: number
          scores_count: number
          throw_in_count: number
          updated_at: string
        }
        Insert: {
          ace_count?: number
          avg_strokes?: number | null
          birdie_count?: number
          bogey_count?: number
          c1_putts_made?: number
          c1_putts_missed?: number
          c2_putts_made?: number
          c2_putts_missed?: number
          double_plus_count?: number
          eagle_count?: number
          hole_number: number
          layout_id: string
          longest_throw_ft?: number | null
          ob_strokes_total?: number
          par?: number | null
          par_count?: number
          scores_count?: number
          throw_in_count?: number
          updated_at?: string
        }
        Update: {
          ace_count?: number
          avg_strokes?: number | null
          birdie_count?: number
          bogey_count?: number
          c1_putts_made?: number
          c1_putts_missed?: number
          c2_putts_made?: number
          c2_putts_missed?: number
          double_plus_count?: number
          eagle_count?: number
          hole_number?: number
          layout_id?: string
          longest_throw_ft?: number | null
          ob_strokes_total?: number
          par?: number | null
          par_count?: number
          scores_count?: number
          throw_in_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      hole_media: {
        Row: {
          caption: string | null
          created_at: string
          created_by: string | null
          hole_id: string
          id: string
          kind: Database["public"]["Enums"]["hole_media_kind"]
          sort_order: number
          storage_path: string
          updated_at: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          hole_id: string
          id?: string
          kind?: Database["public"]["Enums"]["hole_media_kind"]
          sort_order?: number
          storage_path: string
          updated_at?: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          created_by?: string | null
          hole_id?: string
          id?: string
          kind?: Database["public"]["Enums"]["hole_media_kind"]
          sort_order?: number
          storage_path?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hole_media_hole_id_fkey"
            columns: ["hole_id"]
            isOneToOne: false
            referencedRelation: "holes"
            referencedColumns: ["id"]
          },
        ]
      }
      hole_pin_placements: {
        Row: {
          hole_id: string
          id: string
          pin_name: string | null
          previous_pin: string | null
          set_at: string
          set_by: string | null
        }
        Insert: {
          hole_id: string
          id?: string
          pin_name?: string | null
          previous_pin?: string | null
          set_at?: string
          set_by?: string | null
        }
        Update: {
          hole_id?: string
          id?: string
          pin_name?: string | null
          previous_pin?: string | null
          set_at?: string
          set_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hole_pin_placements_hole_id_fkey"
            columns: ["hole_id"]
            isOneToOne: false
            referencedRelation: "holes"
            referencedColumns: ["id"]
          },
        ]
      }
      hole_tees: {
        Row: {
          accuracy_m: number | null
          bearing: number | null
          color: string | null
          created_at: string
          distance_ft: number | null
          flight_path: Json
          hole_id: string
          id: string
          is_drop_zone: boolean
          latitude: number | null
          longitude: number | null
          name: string
          route_mode: string
          sort_order: number
          source: string | null
          surface: string | null
          updated_at: string
        }
        Insert: {
          accuracy_m?: number | null
          bearing?: number | null
          color?: string | null
          created_at?: string
          distance_ft?: number | null
          flight_path?: Json
          hole_id: string
          id?: string
          is_drop_zone?: boolean
          latitude?: number | null
          longitude?: number | null
          name: string
          route_mode?: string
          sort_order?: number
          source?: string | null
          surface?: string | null
          updated_at?: string
        }
        Update: {
          accuracy_m?: number | null
          bearing?: number | null
          color?: string | null
          created_at?: string
          distance_ft?: number | null
          flight_path?: Json
          hole_id?: string
          id?: string
          is_drop_zone?: boolean
          latitude?: number | null
          longitude?: number | null
          name?: string
          route_mode?: string
          sort_order?: number
          source?: string | null
          surface?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "hole_tees_hole_id_fkey"
            columns: ["hole_id"]
            isOneToOne: false
            referencedRelation: "holes"
            referencedColumns: ["id"]
          },
        ]
      }
      holes: {
        Row: {
          basket_accuracy_m: number | null
          basket_color: string | null
          basket_lat: number | null
          basket_lng: number | null
          basket_name: string | null
          basket_source: string | null
          caddy_notes: string | null
          current_pin: string | null
          designer_notes: string | null
          distance_ft: number | null
          elevation_ft: number | null
          flight_path: Json
          flythrough_path: string | null
          flythrough_url: string | null
          hazards: string[]
          id: string
          layout_id: string
          map_center_lat: number | null
          map_center_lng: number | null
          map_snapshot_path: string | null
          map_snapshot_url: string | null
          map_zoom: number | null
          nickname: string | null
          notes: string | null
          number: number
          par: number
          par_confirmed: boolean
          par_source: string | null
          physical_hole_key: string
          shot_shape: string | null
          tee_accuracy_m: number | null
          tee_bearing: number | null
          tee_color: string | null
          tee_lat: number | null
          tee_lng: number | null
          tee_name: string | null
          tee_sign_url: string | null
          tee_source: string | null
        }
        Insert: {
          basket_accuracy_m?: number | null
          basket_color?: string | null
          basket_lat?: number | null
          basket_lng?: number | null
          basket_name?: string | null
          basket_source?: string | null
          caddy_notes?: string | null
          current_pin?: string | null
          designer_notes?: string | null
          distance_ft?: number | null
          elevation_ft?: number | null
          flight_path?: Json
          flythrough_path?: string | null
          flythrough_url?: string | null
          hazards?: string[]
          id?: string
          layout_id: string
          map_center_lat?: number | null
          map_center_lng?: number | null
          map_snapshot_path?: string | null
          map_snapshot_url?: string | null
          map_zoom?: number | null
          nickname?: string | null
          notes?: string | null
          number: number
          par?: number
          par_confirmed?: boolean
          par_source?: string | null
          physical_hole_key?: string
          shot_shape?: string | null
          tee_accuracy_m?: number | null
          tee_bearing?: number | null
          tee_color?: string | null
          tee_lat?: number | null
          tee_lng?: number | null
          tee_name?: string | null
          tee_sign_url?: string | null
          tee_source?: string | null
        }
        Update: {
          basket_accuracy_m?: number | null
          basket_color?: string | null
          basket_lat?: number | null
          basket_lng?: number | null
          basket_name?: string | null
          basket_source?: string | null
          caddy_notes?: string | null
          current_pin?: string | null
          designer_notes?: string | null
          distance_ft?: number | null
          elevation_ft?: number | null
          flight_path?: Json
          flythrough_path?: string | null
          flythrough_url?: string | null
          hazards?: string[]
          id?: string
          layout_id?: string
          map_center_lat?: number | null
          map_center_lng?: number | null
          map_snapshot_path?: string | null
          map_snapshot_url?: string | null
          map_zoom?: number | null
          nickname?: string | null
          notes?: string | null
          number?: number
          par?: number
          par_confirmed?: boolean
          par_source?: string | null
          physical_hole_key?: string
          shot_shape?: string | null
          tee_accuracy_m?: number | null
          tee_bearing?: number | null
          tee_color?: string | null
          tee_lat?: number | null
          tee_lng?: number | null
          tee_name?: string | null
          tee_sign_url?: string | null
          tee_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "holes_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      ingest_queue: {
        Row: {
          attempts: number
          created_at: string
          finished_at: string | null
          id: string
          kind: string
          last_error: string | null
          next_run_at: string
          payload: Json
          priority: number
          region: string | null
          source: string
          started_at: string | null
          status: string
          target: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          kind: string
          last_error?: string | null
          next_run_at?: string
          payload?: Json
          priority?: number
          region?: string | null
          source: string
          started_at?: string | null
          status?: string
          target: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          finished_at?: string | null
          id?: string
          kind?: string
          last_error?: string | null
          next_run_at?: string
          payload?: Json
          priority?: number
          region?: string | null
          source?: string
          started_at?: string | null
          status?: string
          target?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingest_regions: {
        Row: {
          active: boolean
          country: string
          courses_seen: number
          created_at: string
          events_seen: number
          id: string
          last_directory_at: string | null
          last_promoted_at: string | null
          paused: boolean
          players_seen: number
          priority: number
          ring: number
          state_code: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          country?: string
          courses_seen?: number
          created_at?: string
          events_seen?: number
          id?: string
          last_directory_at?: string | null
          last_promoted_at?: string | null
          paused?: boolean
          players_seen?: number
          priority?: number
          ring?: number
          state_code: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          country?: string
          courses_seen?: number
          created_at?: string
          events_seen?: number
          id?: string
          last_directory_at?: string | null
          last_promoted_at?: string | null
          paused?: boolean
          players_seen?: number
          priority?: number
          ring?: number
          state_code?: string
          updated_at?: string
        }
        Relationships: []
      }
      ingest_runs: {
        Row: {
          claimed: number
          detail: Json
          discovered: number
          errors: string[]
          failed: number
          finished_at: string | null
          id: string
          pages_used: number
          started_at: string
          succeeded: number
        }
        Insert: {
          claimed?: number
          detail?: Json
          discovered?: number
          errors?: string[]
          failed?: number
          finished_at?: string | null
          id?: string
          pages_used?: number
          started_at?: string
          succeeded?: number
        }
        Update: {
          claimed?: number
          detail?: Json
          discovered?: number
          errors?: string[]
          failed?: number
          finished_at?: string | null
          id?: string
          pages_used?: number
          started_at?: string
          succeeded?: number
        }
        Relationships: []
      }
      ingest_state: {
        Row: {
          batch_size: number
          budget_day: string
          created_at: string
          daily_page_budget: number
          id: string
          last_run_at: string | null
          lease_owner: string | null
          lease_until: string | null
          pages_used_today: number
          pause_reason: string | null
          paused: boolean
          paused_at: string | null
          updated_at: string
        }
        Insert: {
          batch_size?: number
          budget_day?: string
          created_at?: string
          daily_page_budget?: number
          id?: string
          last_run_at?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          pages_used_today?: number
          pause_reason?: string | null
          paused?: boolean
          paused_at?: string | null
          updated_at?: string
        }
        Update: {
          batch_size?: number
          budget_day?: string
          created_at?: string
          daily_page_budget?: number
          id?: string
          last_run_at?: string | null
          lease_owner?: string | null
          lease_until?: string | null
          pages_used_today?: number
          pause_reason?: string | null
          paused?: boolean
          paused_at?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      kiosk_guest_checkins: {
        Row: {
          created_at: string
          created_by: string
          division_name: string | null
          email: string | null
          event_kind: string
          full_name: string
          id: string
          league_event_id: string | null
          league_id: string | null
          linked_user_id: string | null
          notes: string | null
          payment_method: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pdga_number: string | null
          phone: string | null
          signup_email_sent_at: string | null
          signup_opt_in: boolean
          tournament_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by: string
          division_name?: string | null
          email?: string | null
          event_kind: string
          full_name: string
          id?: string
          league_event_id?: string | null
          league_id?: string | null
          linked_user_id?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pdga_number?: string | null
          phone?: string | null
          signup_email_sent_at?: string | null
          signup_opt_in?: boolean
          tournament_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string
          division_name?: string | null
          email?: string | null
          event_kind?: string
          full_name?: string
          id?: string
          league_event_id?: string | null
          league_id?: string | null
          linked_user_id?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pdga_number?: string | null
          phone?: string | null
          signup_email_sent_at?: string | null
          signup_opt_in?: boolean
          tournament_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "kiosk_guest_checkins_league_event_id_fkey"
            columns: ["league_event_id"]
            isOneToOne: false
            referencedRelation: "league_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_guest_checkins_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "kiosk_guest_checkins_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_manager_notes: {
        Row: {
          course_id: string
          layout_id: string
          notes: string | null
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          course_id: string
          layout_id: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          course_id?: string
          layout_id?: string
          notes?: string | null
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "layout_manager_notes_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: true
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_slots: {
        Row: {
          basket_id: string | null
          course_hole_id: string
          created_at: string
          display_label: string
          flight_path: Json | null
          id: string
          included: boolean
          layout_id: string
          legacy_hole_id: string | null
          par: number | null
          position: number
          rules: Json
          tee_id: string | null
        }
        Insert: {
          basket_id?: string | null
          course_hole_id: string
          created_at?: string
          display_label: string
          flight_path?: Json | null
          id?: string
          included?: boolean
          layout_id: string
          legacy_hole_id?: string | null
          par?: number | null
          position: number
          rules?: Json
          tee_id?: string | null
        }
        Update: {
          basket_id?: string | null
          course_hole_id?: string
          created_at?: string
          display_label?: string
          flight_path?: Json | null
          id?: string
          included?: boolean
          layout_id?: string
          legacy_hole_id?: string | null
          par?: number | null
          position?: number
          rules?: Json
          tee_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "layout_slots_basket_id_fkey"
            columns: ["basket_id"]
            isOneToOne: false
            referencedRelation: "course_baskets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_slots_course_hole_id_fkey"
            columns: ["course_hole_id"]
            isOneToOne: false
            referencedRelation: "course_holes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_slots_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "layout_slots_tee_id_fkey"
            columns: ["tee_id"]
            isOneToOne: false
            referencedRelation: "course_tees"
            referencedColumns: ["id"]
          },
        ]
      }
      layout_versions: {
        Row: {
          id: string
          layout_id: string
          published_at: string
          published_by: string | null
          snapshot: Json
          summary: string | null
          version: number
        }
        Insert: {
          id?: string
          layout_id: string
          published_at?: string
          published_by?: string | null
          snapshot: Json
          summary?: string | null
          version: number
        }
        Update: {
          id?: string
          layout_id?: string
          published_at?: string
          published_by?: string | null
          snapshot?: Json
          summary?: string | null
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "layout_versions_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      league_checklist_items: {
        Row: {
          created_at: string
          done: boolean
          id: string
          label: string
          league_id: string
          phase: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          label: string
          league_id: string
          phase: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          label?: string
          league_id?: string
          phase?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_checklist_items_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_divisions: {
        Row: {
          age_max: number | null
          age_min: number | null
          code: string
          created_at: string
          entry_fee_cents: number
          gender: string | null
          id: string
          league_id: string
          max_rating: number | null
          min_rating: number | null
          name: string
          pdga_code: string | null
          sort_order: number
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          code: string
          created_at?: string
          entry_fee_cents?: number
          gender?: string | null
          id?: string
          league_id: string
          max_rating?: number | null
          min_rating?: number | null
          name: string
          pdga_code?: string | null
          sort_order?: number
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          code?: string
          created_at?: string
          entry_fee_cents?: number
          gender?: string | null
          id?: string
          league_id?: string
          max_rating?: number | null
          min_rating?: number | null
          name?: string
          pdga_code?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_divisions_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_event_checkins: {
        Row: {
          check_in_method: string
          checked_in_at: string
          checked_in_by: string | null
          created_at: string
          id: string
          league_event_id: string
          league_id: string
          paid: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in_method?: string
          checked_in_at?: string
          checked_in_by?: string | null
          created_at?: string
          id?: string
          league_event_id: string
          league_id: string
          paid?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in_method?: string
          checked_in_at?: string
          checked_in_by?: string | null
          created_at?: string
          id?: string
          league_event_id?: string
          league_id?: string
          paid?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_event_checkins_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_event_checkins_league_event_id_fkey"
            columns: ["league_event_id"]
            isOneToOne: false
            referencedRelation: "league_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_event_checkins_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_event_checkins_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      league_events: {
        Row: {
          check_in_time: string | null
          course_id: string | null
          created_at: string
          details: string | null
          entry_fee_cents: number | null
          event_date: string
          format: string | null
          holes_played: number | null
          id: string
          layout_id: string | null
          layout_version_id: string | null
          league_id: string
          name: string | null
          payout_notes: string | null
          rounds: number
          rules_snapshot: Json
          start_time: string | null
          status: string
          week_number: number
        }
        Insert: {
          check_in_time?: string | null
          course_id?: string | null
          created_at?: string
          details?: string | null
          entry_fee_cents?: number | null
          event_date: string
          format?: string | null
          holes_played?: number | null
          id?: string
          layout_id?: string | null
          layout_version_id?: string | null
          league_id: string
          name?: string | null
          payout_notes?: string | null
          rounds?: number
          rules_snapshot?: Json
          start_time?: string | null
          status?: string
          week_number: number
        }
        Update: {
          check_in_time?: string | null
          course_id?: string | null
          created_at?: string
          details?: string | null
          entry_fee_cents?: number | null
          event_date?: string
          format?: string | null
          holes_played?: number | null
          id?: string
          layout_id?: string | null
          layout_version_id?: string | null
          league_id?: string
          name?: string | null
          payout_notes?: string | null
          rounds?: number
          rules_snapshot?: Json
          start_time?: string | null
          status?: string
          week_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "league_events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "league_events_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_events_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_events_layout_version_id_fkey"
            columns: ["layout_version_id"]
            isOneToOne: false
            referencedRelation: "layout_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_events_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      league_registrations: {
        Row: {
          created_at: string
          division: string | null
          division_id: string | null
          id: string
          league_id: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pdga_number: string | null
          status: Database["public"]["Enums"]["registration_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          division?: string | null
          division_id?: string | null
          id?: string
          league_id: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pdga_number?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          division?: string | null
          division_id?: string | null
          id?: string
          league_id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pdga_number?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "league_registrations_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "league_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "league_registrations_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
        ]
      }
      leagues: {
        Row: {
          ace_pot_cents: number
          agenda: Json
          best_n_weeks: number | null
          card_creation: string
          card_selection_required: boolean
          club_id: string | null
          course_id: string | null
          cover_url: string | null
          created_at: string
          ctp_cents: number
          day_of_week: number | null
          description: string | null
          end_date: string | null
          entry_fee_cents: number
          event_template: string | null
          event_type: string
          external_scoring: string | null
          format: string
          format_family: string
          governing_ruleset: string
          handicap_enabled: boolean
          handicap_method: string | null
          holes_played: number | null
          id: string
          layout_id: string | null
          min_nights_for_average: number
          name: string
          owner_id: string
          pairing_method: string | null
          payout_notes: string | null
          pdga_event_number: string | null
          pdga_sanctioned: boolean
          pdga_tier: string | null
          play_style: string | null
          points_system: string
          reentry_allowed: boolean
          registration_closes: string | null
          registration_opens: string | null
          rules_url: string | null
          rules_version_id: string | null
          scorecard_message: string | null
          scoring_mode: string
          season: string | null
          series_id: string | null
          setup: Json
          signup_type: string
          slug: string
          standings_style: string
          start_date: string | null
          start_time: string | null
          stats_mode: string
          status: Database["public"]["Enums"]["league_status"]
          td_email: string | null
          td_name: string | null
          td_phone: string | null
          team_size: number | null
          tiebreaker: string
          updated_at: string
          visibility: string
          weeks_planned: number | null
        }
        Insert: {
          ace_pot_cents?: number
          agenda?: Json
          best_n_weeks?: number | null
          card_creation?: string
          card_selection_required?: boolean
          club_id?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          ctp_cents?: number
          day_of_week?: number | null
          description?: string | null
          end_date?: string | null
          entry_fee_cents?: number
          event_template?: string | null
          event_type?: string
          external_scoring?: string | null
          format?: string
          format_family?: string
          governing_ruleset?: string
          handicap_enabled?: boolean
          handicap_method?: string | null
          holes_played?: number | null
          id?: string
          layout_id?: string | null
          min_nights_for_average?: number
          name: string
          owner_id: string
          pairing_method?: string | null
          payout_notes?: string | null
          pdga_event_number?: string | null
          pdga_sanctioned?: boolean
          pdga_tier?: string | null
          play_style?: string | null
          points_system?: string
          reentry_allowed?: boolean
          registration_closes?: string | null
          registration_opens?: string | null
          rules_url?: string | null
          rules_version_id?: string | null
          scorecard_message?: string | null
          scoring_mode?: string
          season?: string | null
          series_id?: string | null
          setup?: Json
          signup_type?: string
          slug: string
          standings_style?: string
          start_date?: string | null
          start_time?: string | null
          stats_mode?: string
          status?: Database["public"]["Enums"]["league_status"]
          td_email?: string | null
          td_name?: string | null
          td_phone?: string | null
          team_size?: number | null
          tiebreaker?: string
          updated_at?: string
          visibility?: string
          weeks_planned?: number | null
        }
        Update: {
          ace_pot_cents?: number
          agenda?: Json
          best_n_weeks?: number | null
          card_creation?: string
          card_selection_required?: boolean
          club_id?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          ctp_cents?: number
          day_of_week?: number | null
          description?: string | null
          end_date?: string | null
          entry_fee_cents?: number
          event_template?: string | null
          event_type?: string
          external_scoring?: string | null
          format?: string
          format_family?: string
          governing_ruleset?: string
          handicap_enabled?: boolean
          handicap_method?: string | null
          holes_played?: number | null
          id?: string
          layout_id?: string | null
          min_nights_for_average?: number
          name?: string
          owner_id?: string
          pairing_method?: string | null
          payout_notes?: string | null
          pdga_event_number?: string | null
          pdga_sanctioned?: boolean
          pdga_tier?: string | null
          play_style?: string | null
          points_system?: string
          reentry_allowed?: boolean
          registration_closes?: string | null
          registration_opens?: string | null
          rules_url?: string | null
          rules_version_id?: string | null
          scorecard_message?: string | null
          scoring_mode?: string
          season?: string | null
          series_id?: string | null
          setup?: Json
          signup_type?: string
          slug?: string
          standings_style?: string
          start_date?: string | null
          start_time?: string | null
          stats_mode?: string
          status?: Database["public"]["Enums"]["league_status"]
          td_email?: string | null
          td_name?: string | null
          td_phone?: string | null
          team_size?: number | null
          tiebreaker?: string
          updated_at?: string
          visibility?: string
          weeks_planned?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "leagues_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "leagues_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_rules_version_id_fkey"
            columns: ["rules_version_id"]
            isOneToOne: false
            referencedRelation: "rule_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leagues_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      live_event_scores: {
        Row: {
          card_number: string | null
          completed: boolean
          created_at: string
          division: string | null
          event_ref: string
          hole_length_units: string | null
          hole_lengths: number[] | null
          hole_pars: number[] | null
          hole_scores: number[] | null
          id: string
          last_synced_at: string
          pdga_number: string
          place: number | null
          player_name: string | null
          pool: string | null
          round_number: number
          round_score: number | null
          round_started: boolean
          round_to_par: number | null
          running_place: number | null
          tee_time: string | null
          thru: number
          to_par: number | null
          total: number | null
          tourn_id: string | null
          updated_at: string
        }
        Insert: {
          card_number?: string | null
          completed?: boolean
          created_at?: string
          division?: string | null
          event_ref: string
          hole_length_units?: string | null
          hole_lengths?: number[] | null
          hole_pars?: number[] | null
          hole_scores?: number[] | null
          id?: string
          last_synced_at?: string
          pdga_number: string
          place?: number | null
          player_name?: string | null
          pool?: string | null
          round_number?: number
          round_score?: number | null
          round_started?: boolean
          round_to_par?: number | null
          running_place?: number | null
          tee_time?: string | null
          thru?: number
          to_par?: number | null
          total?: number | null
          tourn_id?: string | null
          updated_at?: string
        }
        Update: {
          card_number?: string | null
          completed?: boolean
          created_at?: string
          division?: string | null
          event_ref?: string
          hole_length_units?: string | null
          hole_lengths?: number[] | null
          hole_pars?: number[] | null
          hole_scores?: number[] | null
          id?: string
          last_synced_at?: string
          pdga_number?: string
          place?: number | null
          player_name?: string | null
          pool?: string | null
          round_number?: number
          round_score?: number | null
          round_started?: boolean
          round_to_par?: number | null
          running_place?: number | null
          tee_time?: string | null
          thru?: number
          to_par?: number | null
          total?: number | null
          tourn_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      live_sync_registry: {
        Row: {
          active: boolean
          created_at: string
          end_date: string | null
          event_ref: string
          last_error: string | null
          last_field_synced_at: string | null
          last_status: string | null
          last_synced_at: string | null
          location: string | null
          name: string | null
          priority: number
          source: string
          start_date: string | null
          tourn_id: string | null
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          event_ref: string
          last_error?: string | null
          last_field_synced_at?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          location?: string | null
          name?: string | null
          priority?: number
          source?: string
          start_date?: string | null
          tourn_id?: string | null
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          end_date?: string | null
          event_ref?: string
          last_error?: string | null
          last_field_synced_at?: string | null
          last_status?: string | null
          last_synced_at?: string | null
          location?: string | null
          name?: string | null
          priority?: number
          source?: string
          start_date?: string | null
          tourn_id?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      live_sync_tokens: {
        Row: {
          created_at: string
          label: string
          token: string
        }
        Insert: {
          created_at?: string
          label: string
          token: string
        }
        Update: {
          created_at?: string
          label?: string
          token?: string
        }
        Relationships: []
      }
      lost_disc_claims: {
        Row: {
          claimant_id: string
          conversation_id: string | null
          created_at: string
          id: string
          message: string | null
          report_id: string
          state: Database["public"]["Enums"]["lost_disc_claim_state"]
          updated_at: string
        }
        Insert: {
          claimant_id: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          report_id: string
          state?: Database["public"]["Enums"]["lost_disc_claim_state"]
          updated_at?: string
        }
        Update: {
          claimant_id?: string
          conversation_id?: string | null
          created_at?: string
          id?: string
          message?: string | null
          report_id?: string
          state?: Database["public"]["Enums"]["lost_disc_claim_state"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lost_disc_claims_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lost_disc_claims_report_id_fkey"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "lost_disc_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      lost_disc_reports: {
        Row: {
          brand: string | null
          city: string | null
          color: string | null
          course_id: string | null
          created_at: string
          handoff_notes: string | null
          hole_number: number | null
          id: string
          ink_name: string | null
          ink_pdga_number: number | null
          ink_phone: string | null
          kind: Database["public"]["Enums"]["lost_disc_kind"]
          latitude: number | null
          longitude: number | null
          mold_name: string
          occurred_on: string
          photo_url: string | null
          reunited_at: string | null
          reward: string | null
          state: string | null
          status: Database["public"]["Enums"]["lost_disc_status"]
          updated_at: string
          user_id: string
          weight_grams: number | null
        }
        Insert: {
          brand?: string | null
          city?: string | null
          color?: string | null
          course_id?: string | null
          created_at?: string
          handoff_notes?: string | null
          hole_number?: number | null
          id?: string
          ink_name?: string | null
          ink_pdga_number?: number | null
          ink_phone?: string | null
          kind: Database["public"]["Enums"]["lost_disc_kind"]
          latitude?: number | null
          longitude?: number | null
          mold_name: string
          occurred_on?: string
          photo_url?: string | null
          reunited_at?: string | null
          reward?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["lost_disc_status"]
          updated_at?: string
          user_id: string
          weight_grams?: number | null
        }
        Update: {
          brand?: string | null
          city?: string | null
          color?: string | null
          course_id?: string | null
          created_at?: string
          handoff_notes?: string | null
          hole_number?: number | null
          id?: string
          ink_name?: string | null
          ink_pdga_number?: number | null
          ink_phone?: string | null
          kind?: Database["public"]["Enums"]["lost_disc_kind"]
          latitude?: number | null
          longitude?: number | null
          mold_name?: string
          occurred_on?: string
          photo_url?: string | null
          reunited_at?: string | null
          reward?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["lost_disc_status"]
          updated_at?: string
          user_id?: string
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lost_disc_reports_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "lost_disc_reports_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listing_photos: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          sort_order: number
          url: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          sort_order?: number
          url: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          sort_order?: number
          url?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listing_photos_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_listings: {
        Row: {
          brand: string | null
          bumped_at: string
          city: string | null
          color: string | null
          condition: Database["public"]["Enums"]["disc_condition"] | null
          course_id: string | null
          created_at: string
          description: string | null
          disc_type: string | null
          fade: number | null
          glide: number | null
          id: string
          ink_name: string | null
          ink_notes: string | null
          ink_pdga_number: number | null
          latitude: number | null
          longitude: number | null
          mold_id: string | null
          mold_name: string
          plastic_id: string | null
          plastic_name: string | null
          price_cents: number | null
          seller_id: string
          sold_at: string | null
          sold_to_user_id: string | null
          speed: number | null
          state: string | null
          status: Database["public"]["Enums"]["marketplace_listing_status"]
          trade_only: boolean
          turn: number | null
          updated_at: string
          user_disc_id: string | null
          view_count: number
          weight_grams: number | null
        }
        Insert: {
          brand?: string | null
          bumped_at?: string
          city?: string | null
          color?: string | null
          condition?: Database["public"]["Enums"]["disc_condition"] | null
          course_id?: string | null
          created_at?: string
          description?: string | null
          disc_type?: string | null
          fade?: number | null
          glide?: number | null
          id?: string
          ink_name?: string | null
          ink_notes?: string | null
          ink_pdga_number?: number | null
          latitude?: number | null
          longitude?: number | null
          mold_id?: string | null
          mold_name: string
          plastic_id?: string | null
          plastic_name?: string | null
          price_cents?: number | null
          seller_id: string
          sold_at?: string | null
          sold_to_user_id?: string | null
          speed?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["marketplace_listing_status"]
          trade_only?: boolean
          turn?: number | null
          updated_at?: string
          user_disc_id?: string | null
          view_count?: number
          weight_grams?: number | null
        }
        Update: {
          brand?: string | null
          bumped_at?: string
          city?: string | null
          color?: string | null
          condition?: Database["public"]["Enums"]["disc_condition"] | null
          course_id?: string | null
          created_at?: string
          description?: string | null
          disc_type?: string | null
          fade?: number | null
          glide?: number | null
          id?: string
          ink_name?: string | null
          ink_notes?: string | null
          ink_pdga_number?: number | null
          latitude?: number | null
          longitude?: number | null
          mold_id?: string | null
          mold_name?: string
          plastic_id?: string | null
          plastic_name?: string | null
          price_cents?: number | null
          seller_id?: string
          sold_at?: string | null
          sold_to_user_id?: string | null
          speed?: number | null
          state?: string | null
          status?: Database["public"]["Enums"]["marketplace_listing_status"]
          trade_only?: boolean
          turn?: number | null
          updated_at?: string
          user_disc_id?: string | null
          view_count?: number
          weight_grams?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_listings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "marketplace_listings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_mold_id_fkey"
            columns: ["mold_id"]
            isOneToOne: false
            referencedRelation: "disc_molds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_plastic_id_fkey"
            columns: ["plastic_id"]
            isOneToOne: false
            referencedRelation: "disc_plastics"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_listings_user_disc_id_fkey"
            columns: ["user_disc_id"]
            isOneToOne: false
            referencedRelation: "user_discs"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_match_flags: {
        Row: {
          created_at: string
          evidence: Json
          found_report_id: string | null
          id: string
          listing_id: string | null
          lost_report_id: string
          lost_reporter_id: string
          moderator_notes: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          score: number
          status: Database["public"]["Enums"]["marketplace_flag_status"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          evidence?: Json
          found_report_id?: string | null
          id?: string
          listing_id?: string | null
          lost_report_id: string
          lost_reporter_id: string
          moderator_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          status?: Database["public"]["Enums"]["marketplace_flag_status"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          evidence?: Json
          found_report_id?: string | null
          id?: string
          listing_id?: string | null
          lost_report_id?: string
          lost_reporter_id?: string
          moderator_notes?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          score?: number
          status?: Database["public"]["Enums"]["marketplace_flag_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_match_flags_found_report_id_fkey"
            columns: ["found_report_id"]
            isOneToOne: false
            referencedRelation: "lost_disc_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_match_flags_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_match_flags_lost_report_id_fkey"
            columns: ["lost_report_id"]
            isOneToOne: false
            referencedRelation: "lost_disc_reports"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_price_history: {
        Row: {
          changed_at: string
          id: string
          listing_id: string
          price_cents: number | null
        }
        Insert: {
          changed_at?: string
          id?: string
          listing_id: string
          price_cents?: number | null
        }
        Update: {
          changed_at?: string
          id?: string
          listing_id?: string
          price_cents?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_price_history_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_saved_searches: {
        Row: {
          created_at: string
          filters: Json
          id: string
          label: string
          last_notified_at: string | null
          notify: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filters?: Json
          id?: string
          label: string
          last_notified_at?: string | null
          notify?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          filters?: Json
          id?: string
          label?: string
          last_notified_at?: string | null
          notify?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      marketplace_watches: {
        Row: {
          created_at: string
          id: string
          listing_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          listing_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          listing_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_watches_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "marketplace_listings"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string
          created_at: string
          id: string
          is_announcement: boolean
          media: Json | null
          sender_id: string
        }
        Insert: {
          body?: string | null
          conversation_id: string
          created_at?: string
          id?: string
          is_announcement?: boolean
          media?: Json | null
          sender_id: string
        }
        Update: {
          body?: string | null
          conversation_id?: string
          created_at?: string
          id?: string
          is_announcement?: boolean
          media?: Json | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      mock_seed_registry: {
        Row: {
          batch: string
          id: string
          row_id: string
          seeded_at: string
          seeded_by: string
          table_name: string
        }
        Insert: {
          batch?: string
          id?: string
          row_id: string
          seeded_at?: string
          seeded_by: string
          table_name: string
        }
        Update: {
          batch?: string
          id?: string
          row_id?: string
          seeded_at?: string
          seeded_by?: string
          table_name?: string
        }
        Relationships: []
      }
      muted_authors: {
        Row: {
          created_at: string
          muted_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          muted_id: string
          user_id?: string
        }
        Update: {
          created_at?: string
          muted_id?: string
          user_id?: string
        }
        Relationships: []
      }
      notifications: {
        Row: {
          actor_id: string | null
          club_id: string | null
          comment_id: string | null
          created_at: string
          data: Json | null
          id: string
          post_id: string | null
          read_at: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Insert: {
          actor_id?: string | null
          club_id?: string | null
          comment_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          post_id?: string | null
          read_at?: string | null
          type: Database["public"]["Enums"]["notification_type"]
          user_id: string
        }
        Update: {
          actor_id?: string | null
          club_id?: string | null
          comment_id?: string | null
          created_at?: string
          data?: Json | null
          id?: string
          post_id?: string | null
          read_at?: string | null
          type?: Database["public"]["Enums"]["notification_type"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_comment_id_fkey"
            columns: ["comment_id"]
            isOneToOne: false
            referencedRelation: "comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      open_event_plans: {
        Row: {
          created_at: string
          edit_token: string
          id: string
          plan: Json
          share_token: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          edit_token: string
          id?: string
          plan?: Json
          share_token: string
          title?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          edit_token?: string
          id?: string
          plan?: Json
          share_token?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      osm_places: {
        Row: {
          address: string | null
          first_seen_at: string
          id: string
          imported_club_id: string | null
          imported_course_id: string | null
          kind: string
          last_seen_at: string
          latitude: number
          longitude: number
          name: string | null
          osm_id: number
          osm_type: string
          tags: Json
        }
        Insert: {
          address?: string | null
          first_seen_at?: string
          id?: string
          imported_club_id?: string | null
          imported_course_id?: string | null
          kind: string
          last_seen_at?: string
          latitude: number
          longitude: number
          name?: string | null
          osm_id: number
          osm_type: string
          tags?: Json
        }
        Update: {
          address?: string | null
          first_seen_at?: string
          id?: string
          imported_club_id?: string | null
          imported_course_id?: string | null
          kind?: string
          last_seen_at?: string
          latitude?: number
          longitude?: number
          name?: string | null
          osm_id?: number
          osm_type?: string
          tags?: Json
        }
        Relationships: [
          {
            foreignKeyName: "osm_places_imported_club_id_fkey"
            columns: ["imported_club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "osm_places_imported_course_id_fkey"
            columns: ["imported_course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "osm_places_imported_course_id_fkey"
            columns: ["imported_course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      payout_curve_sets: {
        Row: {
          created_at: string
          created_by: string | null
          curves: Json
          id: string
          label: string
          notes: string | null
          published_at: string | null
          source: string
          status: string
          version: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          curves: Json
          id?: string
          label: string
          notes?: string | null
          published_at?: string | null
          source?: string
          status?: string
          version: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          curves?: Json
          id?: string
          label?: string
          notes?: string | null
          published_at?: string | null
          source?: string
          status?: string
          version?: string
        }
        Relationships: []
      }
      payout_snapshots: {
        Row: {
          curve_version: string
          division_id: string | null
          division_label: string
          event_id: string
          event_kind: string
          finalized_at: string
          finalized_by: string
          id: string
          remainder_cents: number
          remainder_destination: string | null
          ruleset_version: string | null
          snapshot: Json
          superseded_at: string | null
          superseded_by: string | null
          superseded_reason: string | null
          total_paid_cents: number
        }
        Insert: {
          curve_version: string
          division_id?: string | null
          division_label?: string
          event_id: string
          event_kind?: string
          finalized_at?: string
          finalized_by?: string
          id?: string
          remainder_cents?: number
          remainder_destination?: string | null
          ruleset_version?: string | null
          snapshot: Json
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_reason?: string | null
          total_paid_cents?: number
        }
        Update: {
          curve_version?: string
          division_id?: string | null
          division_label?: string
          event_id?: string
          event_kind?: string
          finalized_at?: string
          finalized_by?: string
          id?: string
          remainder_cents?: number
          remainder_destination?: string | null
          ruleset_version?: string | null
          snapshot?: Json
          superseded_at?: string | null
          superseded_by?: string | null
          superseded_reason?: string | null
          total_paid_cents?: number
        }
        Relationships: []
      }
      pdga_dgs_links: {
        Row: {
          dgs_course_id: string | null
          dgs_course_name: string | null
          dgs_course_slug: string | null
          dgs_course_url: string | null
          dgs_event_slug: string | null
          dgs_event_url: string | null
          event_ref: string
          resolved_at: string
        }
        Insert: {
          dgs_course_id?: string | null
          dgs_course_name?: string | null
          dgs_course_slug?: string | null
          dgs_course_url?: string | null
          dgs_event_slug?: string | null
          dgs_event_url?: string | null
          event_ref: string
          resolved_at?: string
        }
        Update: {
          dgs_course_id?: string | null
          dgs_course_name?: string | null
          dgs_course_slug?: string | null
          dgs_course_url?: string | null
          dgs_event_slug?: string | null
          dgs_event_url?: string | null
          event_ref?: string
          resolved_at?: string
        }
        Relationships: []
      }
      pdga_event_field: {
        Row: {
          division: string | null
          event_ref: string
          id: string
          name: string
          pdga_number: string
          place: number | null
          points: number | null
          prize: number | null
          rating: number | null
          synced_at: string
          total_strokes: number | null
          total_to_par: number | null
        }
        Insert: {
          division?: string | null
          event_ref: string
          id?: string
          name: string
          pdga_number: string
          place?: number | null
          points?: number | null
          prize?: number | null
          rating?: number | null
          synced_at?: string
          total_strokes?: number | null
          total_to_par?: number | null
        }
        Update: {
          division?: string | null
          event_ref?: string
          id?: string
          name?: string
          pdga_number?: string
          place?: number | null
          points?: number | null
          prize?: number | null
          rating?: number | null
          synced_at?: string
          total_strokes?: number | null
          total_to_par?: number | null
        }
        Relationships: []
      }
      pdga_events: {
        Row: {
          created_at: string
          distance_from_seed_km: number | null
          division: string | null
          enriched_at: string | null
          event_date: string | null
          event_name: string
          event_ref: string | null
          field_size: number | null
          id: string
          latitude: number | null
          longitude: number | null
          pdga_number: string
          place: number | null
          points: number | null
          postal_code: string | null
          prize_cents: number | null
          tier: string | null
          url: string | null
        }
        Insert: {
          created_at?: string
          distance_from_seed_km?: number | null
          division?: string | null
          enriched_at?: string | null
          event_date?: string | null
          event_name: string
          event_ref?: string | null
          field_size?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          pdga_number: string
          place?: number | null
          points?: number | null
          postal_code?: string | null
          prize_cents?: number | null
          tier?: string | null
          url?: string | null
        }
        Update: {
          created_at?: string
          distance_from_seed_km?: number | null
          division?: string | null
          enriched_at?: string | null
          event_date?: string | null
          event_name?: string
          event_ref?: string | null
          field_size?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          pdga_number?: string
          place?: number | null
          points?: number | null
          postal_code?: string | null
          prize_cents?: number | null
          tier?: string | null
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pdga_events_pdga_number_fkey"
            columns: ["pdga_number"]
            isOneToOne: false
            referencedRelation: "pdga_players"
            referencedColumns: ["pdga_number"]
          },
        ]
      }
      pdga_friend_invites: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          invite_token: string
          inviter_id: string
          joined_user_id: string | null
          location: string | null
          pdga_number: string
          pdga_rating: number | null
          status: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          invite_token?: string
          inviter_id: string
          joined_user_id?: string | null
          location?: string | null
          pdga_number: string
          pdga_rating?: number | null
          status?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          invite_token?: string
          inviter_id?: string
          joined_user_id?: string | null
          location?: string | null
          pdga_number?: string
          pdga_rating?: number | null
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      pdga_import_corrections: {
        Row: {
          affects_legacy: boolean
          affects_v1: boolean
          affects_v11: boolean
          canonical_round_id: string | null
          canonical_snapshot: Json | null
          created_at: string
          duplicate_of: string | null
          external_round_id: string
          id: string
          match_basis: string | null
          original_row: Json
          phase: string
          real_pdga: Json | null
          review_note: string | null
          reviewed_by: string | null
          status: string
          user_id: string
        }
        Insert: {
          affects_legacy?: boolean
          affects_v1?: boolean
          affects_v11?: boolean
          canonical_round_id?: string | null
          canonical_snapshot?: Json | null
          created_at?: string
          duplicate_of?: string | null
          external_round_id: string
          id?: string
          match_basis?: string | null
          original_row: Json
          phase?: string
          real_pdga?: Json | null
          review_note?: string | null
          reviewed_by?: string | null
          status: string
          user_id: string
        }
        Update: {
          affects_legacy?: boolean
          affects_v1?: boolean
          affects_v11?: boolean
          canonical_round_id?: string | null
          canonical_snapshot?: Json | null
          created_at?: string
          duplicate_of?: string | null
          external_round_id?: string
          id?: string
          match_basis?: string | null
          original_row?: Json
          phase?: string
          real_pdga?: Json | null
          review_note?: string | null
          reviewed_by?: string | null
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      pdga_kb_courses: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          designer: string | null
          fetched_at: string
          hole_count: number | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          pdga_course_id: string | null
          pdga_url: string | null
          postal_code: string | null
          raw: Json
          state: string | null
          updated_at: string
          year_established: number | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          designer?: string | null
          fetched_at?: string
          hole_count?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          pdga_course_id?: string | null
          pdga_url?: string | null
          postal_code?: string | null
          raw?: Json
          state?: string | null
          updated_at?: string
          year_established?: number | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          designer?: string | null
          fetched_at?: string
          hole_count?: number | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          pdga_course_id?: string | null
          pdga_url?: string | null
          postal_code?: string | null
          raw?: Json
          state?: string | null
          updated_at?: string
          year_established?: number | null
        }
        Relationships: []
      }
      pdga_kb_events: {
        Row: {
          city: string | null
          country: string | null
          course_refs: string[] | null
          created_at: string
          distance_from_seed_km: number | null
          end_date: string | null
          fetched_at: string
          host_club: string | null
          id: string
          latitude: number | null
          longitude: number | null
          name: string
          pdga_event_id: string
          pdga_url: string | null
          postal_code: string | null
          raw: Json
          start_date: string | null
          state: string | null
          tier: string | null
          updated_at: string
        }
        Insert: {
          city?: string | null
          country?: string | null
          course_refs?: string[] | null
          created_at?: string
          distance_from_seed_km?: number | null
          end_date?: string | null
          fetched_at?: string
          host_club?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name: string
          pdga_event_id: string
          pdga_url?: string | null
          postal_code?: string | null
          raw?: Json
          start_date?: string | null
          state?: string | null
          tier?: string | null
          updated_at?: string
        }
        Update: {
          city?: string | null
          country?: string | null
          course_refs?: string[] | null
          created_at?: string
          distance_from_seed_km?: number | null
          end_date?: string | null
          fetched_at?: string
          host_club?: string | null
          id?: string
          latitude?: number | null
          longitude?: number | null
          name?: string
          pdga_event_id?: string
          pdga_url?: string | null
          postal_code?: string | null
          raw?: Json
          start_date?: string | null
          state?: string | null
          tier?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pdga_kb_players: {
        Row: {
          career_wins: number | null
          city: string | null
          class: string | null
          country: string | null
          created_at: string
          fetched_at: string
          id: string
          member_since: number | null
          name: string
          official_status: string | null
          pdga_number: number
          pdga_url: string | null
          rating: number | null
          raw: Json
          state: string | null
          updated_at: string
        }
        Insert: {
          career_wins?: number | null
          city?: string | null
          class?: string | null
          country?: string | null
          created_at?: string
          fetched_at?: string
          id?: string
          member_since?: number | null
          name: string
          official_status?: string | null
          pdga_number: number
          pdga_url?: string | null
          rating?: number | null
          raw?: Json
          state?: string | null
          updated_at?: string
        }
        Update: {
          career_wins?: number | null
          city?: string | null
          class?: string | null
          country?: string | null
          created_at?: string
          fetched_at?: string
          id?: string
          member_since?: number | null
          name?: string
          official_status?: string | null
          pdga_number?: number
          pdga_url?: string | null
          rating?: number | null
          raw?: Json
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      pdga_kb_seed_regions: {
        Row: {
          active: boolean
          created_at: string
          cursor: Json
          id: string
          label: string | null
          latitude: number
          longitude: number
          paused: boolean
          postal_code: string | null
          radius_km: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          cursor?: Json
          id?: string
          label?: string | null
          latitude: number
          longitude: number
          paused?: boolean
          postal_code?: string | null
          radius_km?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          cursor?: Json
          id?: string
          label?: string | null
          latitude?: number
          longitude?: number
          paused?: boolean
          postal_code?: string | null
          radius_km?: number
          updated_at?: string
        }
        Relationships: []
      }
      pdga_kb_sync_jobs: {
        Row: {
          attempts: number
          created_at: string
          error: string | null
          finished_at: string | null
          http_status: number | null
          id: string
          kind: string
          next_run_at: string
          result: Json | null
          started_at: string | null
          status: string
          target: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          kind: string
          next_run_at?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          target: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          error?: string | null
          finished_at?: string | null
          http_status?: number | null
          id?: string
          kind?: string
          next_run_at?: string
          result?: Json | null
          started_at?: string | null
          status?: string
          target?: string
          updated_at?: string
        }
        Relationships: []
      }
      pdga_players: {
        Row: {
          career_events: number | null
          career_wins: number | null
          city: string | null
          class: string | null
          classification: string | null
          country: string | null
          created_at: string
          current_rating: number | null
          drop_below: number | null
          enriched_at: string | null
          last_changed: string | null
          location: string | null
          member_since: number | null
          membership_expires: string | null
          membership_status: string | null
          name: string | null
          next_update: string | null
          official_expires: string | null
          official_status: string | null
          pdga_number: string
          photo_url: string | null
          rating_delta: number | null
          raw: Json | null
          refreshed_at: string
          rounds_used: number | null
          state: string | null
          std_dev: number | null
          updated_at: string
        }
        Insert: {
          career_events?: number | null
          career_wins?: number | null
          city?: string | null
          class?: string | null
          classification?: string | null
          country?: string | null
          created_at?: string
          current_rating?: number | null
          drop_below?: number | null
          enriched_at?: string | null
          last_changed?: string | null
          location?: string | null
          member_since?: number | null
          membership_expires?: string | null
          membership_status?: string | null
          name?: string | null
          next_update?: string | null
          official_expires?: string | null
          official_status?: string | null
          pdga_number: string
          photo_url?: string | null
          rating_delta?: number | null
          raw?: Json | null
          refreshed_at?: string
          rounds_used?: number | null
          state?: string | null
          std_dev?: number | null
          updated_at?: string
        }
        Update: {
          career_events?: number | null
          career_wins?: number | null
          city?: string | null
          class?: string | null
          classification?: string | null
          country?: string | null
          created_at?: string
          current_rating?: number | null
          drop_below?: number | null
          enriched_at?: string | null
          last_changed?: string | null
          location?: string | null
          member_since?: number | null
          membership_expires?: string | null
          membership_status?: string | null
          name?: string | null
          next_update?: string | null
          official_expires?: string | null
          official_status?: string | null
          pdga_number?: string
          photo_url?: string | null
          rating_delta?: number | null
          raw?: Json | null
          refreshed_at?: string
          rounds_used?: number | null
          state?: string | null
          std_dev?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      pdga_round_context: {
        Row: {
          created_at: string
          distance_ft: number | null
          division: string | null
          event_name: string | null
          external_round_id: string
          hole_count: number | null
          id: string
          layout_name: string | null
          layout_node_ids: string[]
          match_method: string
          par: number | null
          pdga_event_id: string | null
          played_on: string | null
          pool_count: number
          provenance: string
          round_number: number | null
          source_fetched_at: string | null
          source_row_id: string | null
          source_url: string | null
          superseded_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          distance_ft?: number | null
          division?: string | null
          event_name?: string | null
          external_round_id: string
          hole_count?: number | null
          id?: string
          layout_name?: string | null
          layout_node_ids?: string[]
          match_method: string
          par?: number | null
          pdga_event_id?: string | null
          played_on?: string | null
          pool_count?: number
          provenance?: string
          round_number?: number | null
          source_fetched_at?: string | null
          source_row_id?: string | null
          source_url?: string | null
          superseded_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          distance_ft?: number | null
          division?: string | null
          event_name?: string | null
          external_round_id?: string
          hole_count?: number | null
          id?: string
          layout_name?: string | null
          layout_node_ids?: string[]
          match_method?: string
          par?: number | null
          pdga_event_id?: string | null
          played_on?: string | null
          pool_count?: number
          provenance?: string
          round_number?: number | null
          source_fetched_at?: string | null
          source_row_id?: string | null
          source_url?: string | null
          superseded_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "pdga_round_context_external_round_id_fkey"
            columns: ["external_round_id"]
            isOneToOne: false
            referencedRelation: "external_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      pdga_src_conflicts: {
        Row: {
          detail_url: string | null
          detail_value: string | null
          event_url: string | null
          event_value: string | null
          field: string
          first_seen_at: string
          id: string
          last_seen_at: string
          pdga_number: string
          round_key: string
          status: string
        }
        Insert: {
          detail_url?: string | null
          detail_value?: string | null
          event_url?: string | null
          event_value?: string | null
          field: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          pdga_number: string
          round_key: string
          status?: string
        }
        Update: {
          detail_url?: string | null
          detail_value?: string | null
          event_url?: string | null
          event_value?: string | null
          field?: string
          first_seen_at?: string
          id?: string
          last_seen_at?: string
          pdga_number?: string
          round_key?: string
          status?: string
        }
        Relationships: []
      }
      pdga_src_events: {
        Row: {
          data: Json
          data_hash: string
          event_id: string
          field_rows: number
          id: string
          last_seen_at: string
          parser_version: string
          results_official: boolean
          retrieved_at: string
          source_url: string
          superseded_at: string | null
        }
        Insert: {
          data: Json
          data_hash: string
          event_id: string
          field_rows?: number
          id?: string
          last_seen_at: string
          parser_version: string
          results_official: boolean
          retrieved_at: string
          source_url: string
          superseded_at?: string | null
        }
        Update: {
          data?: Json
          data_hash?: string
          event_id?: string
          field_rows?: number
          id?: string
          last_seen_at?: string
          parser_version?: string
          results_official?: boolean
          retrieved_at?: string
          source_url?: string
          superseded_at?: string | null
        }
        Relationships: []
      }
      pdga_src_fetches: {
        Row: {
          attempts: number
          error: string | null
          http_status: number | null
          id: string
          kind: string
          ok: boolean
          parser_version: string
          pdga_number: string
          retrieved_at: string
          url: string
        }
        Insert: {
          attempts?: number
          error?: string | null
          http_status?: number | null
          id?: string
          kind: string
          ok: boolean
          parser_version: string
          pdga_number: string
          retrieved_at: string
          url: string
        }
        Update: {
          attempts?: number
          error?: string | null
          http_status?: number | null
          id?: string
          kind?: string
          ok?: boolean
          parser_version?: string
          pdga_number?: string
          retrieved_at?: string
          url?: string
        }
        Relationships: []
      }
      pdga_src_player_snapshots: {
        Row: {
          data: Json
          data_hash: string
          id: string
          last_seen_at: string
          parser_version: string
          pdga_number: string
          retrieved_at: string
          source_url: string
          superseded_at: string | null
        }
        Insert: {
          data: Json
          data_hash: string
          id?: string
          last_seen_at: string
          parser_version: string
          pdga_number: string
          retrieved_at: string
          source_url: string
          superseded_at?: string | null
        }
        Update: {
          data?: Json
          data_hash?: string
          id?: string
          last_seen_at?: string
          parser_version?: string
          pdga_number?: string
          retrieved_at?: string
          source_url?: string
          superseded_at?: string | null
        }
        Relationships: []
      }
      pdga_src_rating_history: {
        Row: {
          effective_date: string
          id: string
          last_seen_at: string
          parser_version: string
          pdga_number: string
          rating: number
          retrieved_at: string
          rounds_used: number | null
          source_url: string
          superseded_at: string | null
        }
        Insert: {
          effective_date: string
          id?: string
          last_seen_at: string
          parser_version: string
          pdga_number: string
          rating: number
          retrieved_at: string
          rounds_used?: number | null
          source_url: string
          superseded_at?: string | null
        }
        Update: {
          effective_date?: string
          id?: string
          last_seen_at?: string
          parser_version?: string
          pdga_number?: string
          rating?: number
          retrieved_at?: string
          rounds_used?: number | null
          source_url?: string
          superseded_at?: string | null
        }
        Relationships: []
      }
      pdga_src_rounds: {
        Row: {
          data: Json
          data_hash: string
          id: string
          last_seen_at: string
          layout_state: string
          official_rating_at_round_date: number | null
          parser_version: string
          pdga_event_id: string | null
          pdga_number: string
          played_on: string
          quality: string
          rating_delta: number | null
          retrieved_at: string
          round_key: string
          round_rating: number | null
          source_url: string
          superseded_at: string | null
        }
        Insert: {
          data: Json
          data_hash: string
          id?: string
          last_seen_at: string
          layout_state: string
          official_rating_at_round_date?: number | null
          parser_version: string
          pdga_event_id?: string | null
          pdga_number: string
          played_on: string
          quality: string
          rating_delta?: number | null
          retrieved_at: string
          round_key: string
          round_rating?: number | null
          source_url: string
          superseded_at?: string | null
        }
        Update: {
          data?: Json
          data_hash?: string
          id?: string
          last_seen_at?: string
          layout_state?: string
          official_rating_at_round_date?: number | null
          parser_version?: string
          pdga_event_id?: string | null
          pdga_number?: string
          played_on?: string
          quality?: string
          rating_delta?: number | null
          retrieved_at?: string
          round_key?: string
          round_rating?: number | null
          source_url?: string
          superseded_at?: string | null
        }
        Relationships: []
      }
      pdga_src_sync_state: {
        Row: {
          error: string | null
          last_checked_at: string | null
          last_success_at: string | null
          next_due_at: string | null
          retry_count: number
          source_changed_at: string | null
          status: string
          target: string
        }
        Insert: {
          error?: string | null
          last_checked_at?: string | null
          last_success_at?: string | null
          next_due_at?: string | null
          retry_count?: number
          source_changed_at?: string | null
          status?: string
          target: string
        }
        Update: {
          error?: string | null
          last_checked_at?: string | null
          last_success_at?: string | null
          next_due_at?: string | null
          retry_count?: number
          source_changed_at?: string | null
          status?: string
          target?: string
        }
        Relationships: []
      }
      pdga_tour_events: {
        Row: {
          city: string | null
          country: string | null
          created_at: string
          distance_from_seed_km: number | null
          end_date: string | null
          enriched_at: string | null
          id: string
          latitude: number | null
          location: string | null
          longitude: number | null
          name: string
          pdga_event_id: string | null
          postal_code: string | null
          raw: Json
          refreshed_at: string
          registration_status: string | null
          registration_url: string | null
          sanctioning: string | null
          schedule_json: Json | null
          source: string
          start_date: string | null
          state: string | null
          tier: string | null
          url: string | null
        }
        Insert: {
          city?: string | null
          country?: string | null
          created_at?: string
          distance_from_seed_km?: number | null
          end_date?: string | null
          enriched_at?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name: string
          pdga_event_id?: string | null
          postal_code?: string | null
          raw?: Json
          refreshed_at?: string
          registration_status?: string | null
          registration_url?: string | null
          sanctioning?: string | null
          schedule_json?: Json | null
          source?: string
          start_date?: string | null
          state?: string | null
          tier?: string | null
          url?: string | null
        }
        Update: {
          city?: string | null
          country?: string | null
          created_at?: string
          distance_from_seed_km?: number | null
          end_date?: string | null
          enriched_at?: string | null
          id?: string
          latitude?: number | null
          location?: string | null
          longitude?: number | null
          name?: string
          pdga_event_id?: string | null
          postal_code?: string | null
          raw?: Json
          refreshed_at?: string
          registration_status?: string | null
          registration_url?: string | null
          sanctioning?: string | null
          schedule_json?: Json | null
          source?: string
          start_date?: string | null
          state?: string | null
          tier?: string | null
          url?: string | null
        }
        Relationships: []
      }
      play_availability: {
        Row: {
          auto: boolean
          auto_round_id: string | null
          created_at: string
          note: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          auto?: boolean
          auto_round_id?: string | null
          created_at?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          auto?: boolean
          auto_round_id?: string | null
          created_at?: string
          note?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      play_intent_joins: {
        Row: {
          created_at: string
          intent_id: string
          state: string
          user_id: string
        }
        Insert: {
          created_at?: string
          intent_id: string
          state?: string
          user_id: string
        }
        Update: {
          created_at?: string
          intent_id?: string
          state?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "play_intent_joins_intent_id_fkey"
            columns: ["intent_id"]
            isOneToOne: false
            referencedRelation: "play_intents"
            referencedColumns: ["id"]
          },
        ]
      }
      play_intents: {
        Row: {
          city: string | null
          course_id: string | null
          course_names: string[]
          created_at: string
          holes: number | null
          id: string
          note: string | null
          state: string | null
          updated_at: string
          user_id: string
          visibility: string
          window_end: string
          window_start: string
        }
        Insert: {
          city?: string | null
          course_id?: string | null
          course_names?: string[]
          created_at?: string
          holes?: number | null
          id?: string
          note?: string | null
          state?: string | null
          updated_at?: string
          user_id: string
          visibility?: string
          window_end: string
          window_start: string
        }
        Update: {
          city?: string | null
          course_id?: string | null
          course_names?: string[]
          created_at?: string
          holes?: number | null
          id?: string
          note?: string | null
          state?: string | null
          updated_at?: string
          user_id?: string
          visibility?: string
          window_end?: string
          window_start?: string
        }
        Relationships: [
          {
            foreignKeyName: "play_intents_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "play_intents_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      play_status: {
        Row: {
          available_until: string
          course_id: string | null
          created_at: string
          note: string | null
          user_id: string
        }
        Insert: {
          available_until: string
          course_id?: string | null
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Update: {
          available_until?: string
          course_id?: string | null
          created_at?: string
          note?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "play_status_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "play_status_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      player_external_identities: {
        Row: {
          created_at: string
          external_id: string
          id: string
          source: string
          user_id: string
          verified: boolean
        }
        Insert: {
          created_at?: string
          external_id: string
          id?: string
          source: string
          user_id: string
          verified?: boolean
        }
        Update: {
          created_at?: string
          external_id?: string
          id?: string
          source?: string
          user_id?: string
          verified?: boolean
        }
        Relationships: []
      }
      post_impressions: {
        Row: {
          day: string
          impressions: number
          post_id: string
          unique_viewers: number
        }
        Insert: {
          day?: string
          impressions?: number
          post_id: string
          unique_viewers?: number
        }
        Update: {
          day?: string
          impressions?: number
          post_id?: string
          unique_viewers?: number
        }
        Relationships: [
          {
            foreignKeyName: "post_impressions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string
          post_id: string
          reaction: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          reaction?: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          reaction?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          post_id: string
          reason: string
          reporter_id: string
          resolution: string | null
          resolved_at: string | null
          resolved_by: string | null
          reviewer_note: string | null
          status: string
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          post_id: string
          reason: string
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          reviewer_note?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          post_id?: string
          reason?: string
          reporter_id?: string
          resolution?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          reviewer_note?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reports_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_saves: {
        Row: {
          created_at: string
          post_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          post_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          post_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_tags: {
        Row: {
          created_at: string
          id: string
          post_id: string
          tagged_by: string
          tagged_user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          post_id: string
          tagged_by: string
          tagged_user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          post_id?: string
          tagged_by?: string
          tagged_user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_tags_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tagged_by_fkey"
            columns: ["tagged_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_tags_tagged_user_id_fkey"
            columns: ["tagged_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          author_id: string
          body: string | null
          club_id: string | null
          comment_count: number
          course_name: string | null
          created_at: string
          hidden_at: string | null
          hole_number: number | null
          id: string
          like_count: number
          location: string | null
          media: Json
          posted_as_club: boolean
          repost_of: string | null
          round_id: string | null
          score_data: Json | null
          share_count: number
          snapshot: Json | null
          type: Database["public"]["Enums"]["post_type"]
          updated_at: string
          visibility: Database["public"]["Enums"]["post_visibility"]
        }
        Insert: {
          author_id: string
          body?: string | null
          club_id?: string | null
          comment_count?: number
          course_name?: string | null
          created_at?: string
          hidden_at?: string | null
          hole_number?: number | null
          id?: string
          like_count?: number
          location?: string | null
          media?: Json
          posted_as_club?: boolean
          repost_of?: string | null
          round_id?: string | null
          score_data?: Json | null
          share_count?: number
          snapshot?: Json | null
          type?: Database["public"]["Enums"]["post_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["post_visibility"]
        }
        Update: {
          author_id?: string
          body?: string | null
          club_id?: string | null
          comment_count?: number
          course_name?: string | null
          created_at?: string
          hidden_at?: string | null
          hole_number?: number | null
          id?: string
          like_count?: number
          location?: string | null
          media?: Json
          posted_as_club?: boolean
          repost_of?: string | null
          round_id?: string | null
          score_data?: Json | null
          share_count?: number
          snapshot?: Json | null
          type?: Database["public"]["Enums"]["post_type"]
          updated_at?: string
          visibility?: Database["public"]["Enums"]["post_visibility"]
        }
        Relationships: [
          {
            foreignKeyName: "posts_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_repost_of_fkey"
            columns: ["repost_of"]
            isOneToOne: false
            referencedRelation: "posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      prize_fund_ledger: {
        Row: {
          actor: string | null
          amount: number
          created_at: string
          entry_kind: string
          fund_type: string
          id: string
          note: string | null
          prize_id: string | null
          scope_id: string
          scope_kind: string
        }
        Insert: {
          actor?: string | null
          amount: number
          created_at?: string
          entry_kind: string
          fund_type?: string
          id?: string
          note?: string | null
          prize_id?: string | null
          scope_id: string
          scope_kind: string
        }
        Update: {
          actor?: string | null
          amount?: number
          created_at?: string
          entry_kind?: string
          fund_type?: string
          id?: string
          note?: string | null
          prize_id?: string | null
          scope_id?: string
          scope_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "prize_fund_ledger_prize_id_fkey"
            columns: ["prize_id"]
            isOneToOne: false
            referencedRelation: "event_prizes"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          ace_count_manual: number | null
          avatar_url: string | null
          bag: Json | null
          bio: string | null
          calendar_shared_with_friends: boolean
          cover_url: string | null
          created_at: string
          display_name: string
          favorite_ace: string | null
          home_course: string | null
          home_state: string | null
          ics_feed_token: string | null
          id: string
          is_event_director: boolean
          location: string | null
          notification_prefs: Json
          pdga_number: string | null
          pdga_profile_url: string | null
          pdga_rating: number | null
          player_code: string
          player_since: number | null
          preferred_division: string | null
          privacy_prefs: Json
          qr_token: string
          reunited_count: number
          scene_profile_url: string | null
          scene_profile_urls: Json
          setup_progress: Json
          udisc_profile_url: string | null
          updated_at: string
          username: string
        }
        Insert: {
          ace_count_manual?: number | null
          avatar_url?: string | null
          bag?: Json | null
          bio?: string | null
          calendar_shared_with_friends?: boolean
          cover_url?: string | null
          created_at?: string
          display_name: string
          favorite_ace?: string | null
          home_course?: string | null
          home_state?: string | null
          ics_feed_token?: string | null
          id: string
          is_event_director?: boolean
          location?: string | null
          notification_prefs?: Json
          pdga_number?: string | null
          pdga_profile_url?: string | null
          pdga_rating?: number | null
          player_code: string
          player_since?: number | null
          preferred_division?: string | null
          privacy_prefs?: Json
          qr_token: string
          reunited_count?: number
          scene_profile_url?: string | null
          scene_profile_urls?: Json
          setup_progress?: Json
          udisc_profile_url?: string | null
          updated_at?: string
          username: string
        }
        Update: {
          ace_count_manual?: number | null
          avatar_url?: string | null
          bag?: Json | null
          bio?: string | null
          calendar_shared_with_friends?: boolean
          cover_url?: string | null
          created_at?: string
          display_name?: string
          favorite_ace?: string | null
          home_course?: string | null
          home_state?: string | null
          ics_feed_token?: string | null
          id?: string
          is_event_director?: boolean
          location?: string | null
          notification_prefs?: Json
          pdga_number?: string | null
          pdga_profile_url?: string | null
          pdga_rating?: number | null
          player_code?: string
          player_since?: number | null
          preferred_division?: string | null
          privacy_prefs?: Json
          qr_token?: string
          reunited_count?: number
          scene_profile_url?: string | null
          scene_profile_urls?: Json
          setup_progress?: Json
          udisc_profile_url?: string | null
          updated_at?: string
          username?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          last_used_at: string
          p256dh: string
          user_agent: string | null
          user_id: string
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          last_used_at?: string
          p256dh: string
          user_agent?: string | null
          user_id: string
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          last_used_at?: string
          p256dh?: string
          user_agent?: string | null
          user_id?: string
        }
        Relationships: []
      }
      putting_putts: {
        Row: {
          created_at: string
          disc_id: string | null
          disc_label: string | null
          distance_ft: number
          drill_id: string | null
          gps_accuracy_m: number | null
          id: string
          landed_latitude: number | null
          landed_longitude: number | null
          made: boolean
          mold_id: string | null
          notes: string | null
          putt_index: number
          putt_style: string | null
          session_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          disc_id?: string | null
          disc_label?: string | null
          distance_ft: number
          drill_id?: string | null
          gps_accuracy_m?: number | null
          id?: string
          landed_latitude?: number | null
          landed_longitude?: number | null
          made: boolean
          mold_id?: string | null
          notes?: string | null
          putt_index?: number
          putt_style?: string | null
          session_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          disc_id?: string | null
          disc_label?: string | null
          distance_ft?: number
          drill_id?: string | null
          gps_accuracy_m?: number | null
          id?: string
          landed_latitude?: number | null
          landed_longitude?: number | null
          made?: boolean
          mold_id?: string | null
          notes?: string | null
          putt_index?: number
          putt_style?: string | null
          session_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "putting_putts_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "putting_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      putting_sessions: {
        Row: {
          basket_latitude: number | null
          basket_longitude: number | null
          completed_drills: Json
          conditions: string | null
          created_at: string
          ended_at: string | null
          id: string
          location: string | null
          markers: Json
          name: string | null
          session_discs: Json
          started_at: string
          temperature_f: number | null
          updated_at: string
          user_id: string
          weather_synced_at: string | null
          wind_deg: number | null
          wind_dir: string | null
          wind_gust_mph: number | null
          wind_mph: number | null
        }
        Insert: {
          basket_latitude?: number | null
          basket_longitude?: number | null
          completed_drills?: Json
          conditions?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          markers?: Json
          name?: string | null
          session_discs?: Json
          started_at?: string
          temperature_f?: number | null
          updated_at?: string
          user_id: string
          weather_synced_at?: string | null
          wind_deg?: number | null
          wind_dir?: string | null
          wind_gust_mph?: number | null
          wind_mph?: number | null
        }
        Update: {
          basket_latitude?: number | null
          basket_longitude?: number | null
          completed_drills?: Json
          conditions?: string | null
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          markers?: Json
          name?: string | null
          session_discs?: Json
          started_at?: string
          temperature_f?: number | null
          updated_at?: string
          user_id?: string
          weather_synced_at?: string | null
          wind_deg?: number | null
          wind_dir?: string | null
          wind_gust_mph?: number | null
          wind_mph?: number | null
        }
        Relationships: []
      }
      range_sessions: {
        Row: {
          coaching_challenges: Json
          conditions: string | null
          cone_markers: Json
          created_at: string
          ended_at: string | null
          id: string
          location: string | null
          name: string | null
          session_discs: Json
          started_at: string
          tee_latitude: number | null
          tee_longitude: number | null
          temperature_f: number | null
          updated_at: string
          user_id: string
          weather_synced_at: string | null
          wind_deg: number | null
          wind_dir: string | null
          wind_gust_mph: number | null
          wind_mph: number | null
        }
        Insert: {
          coaching_challenges?: Json
          conditions?: string | null
          cone_markers?: Json
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          name?: string | null
          session_discs?: Json
          started_at?: string
          tee_latitude?: number | null
          tee_longitude?: number | null
          temperature_f?: number | null
          updated_at?: string
          user_id: string
          weather_synced_at?: string | null
          wind_deg?: number | null
          wind_dir?: string | null
          wind_gust_mph?: number | null
          wind_mph?: number | null
        }
        Update: {
          coaching_challenges?: Json
          conditions?: string | null
          cone_markers?: Json
          created_at?: string
          ended_at?: string | null
          id?: string
          location?: string | null
          name?: string | null
          session_discs?: Json
          started_at?: string
          tee_latitude?: number | null
          tee_longitude?: number | null
          temperature_f?: number | null
          updated_at?: string
          user_id?: string
          weather_synced_at?: string | null
          wind_deg?: number | null
          wind_dir?: string | null
          wind_gust_mph?: number | null
          wind_mph?: number | null
        }
        Relationships: []
      }
      range_throws: {
        Row: {
          created_at: string
          disc_id: string | null
          disc_label: string | null
          distance_ft: number
          fairway_hit: boolean | null
          gps_accuracy_m: number | null
          id: string
          intent: Database["public"]["Enums"]["shot_intent"]
          landed_latitude: number
          landed_longitude: number
          lateral_ft: number | null
          mold_id: string | null
          notes: string | null
          session_id: string
          shape: Database["public"]["Enums"]["shot_shape"] | null
          throw_index: number
          user_id: string
        }
        Insert: {
          created_at?: string
          disc_id?: string | null
          disc_label?: string | null
          distance_ft: number
          fairway_hit?: boolean | null
          gps_accuracy_m?: number | null
          id?: string
          intent?: Database["public"]["Enums"]["shot_intent"]
          landed_latitude: number
          landed_longitude: number
          lateral_ft?: number | null
          mold_id?: string | null
          notes?: string | null
          session_id: string
          shape?: Database["public"]["Enums"]["shot_shape"] | null
          throw_index?: number
          user_id: string
        }
        Update: {
          created_at?: string
          disc_id?: string | null
          disc_label?: string | null
          distance_ft?: number
          fairway_hit?: boolean | null
          gps_accuracy_m?: number | null
          id?: string
          intent?: Database["public"]["Enums"]["shot_intent"]
          landed_latitude?: number
          landed_longitude?: number
          lateral_ft?: number | null
          mold_id?: string | null
          notes?: string | null
          session_id?: string
          shape?: Database["public"]["Enums"]["shot_shape"] | null
          throw_index?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "range_throws_disc_id_fkey"
            columns: ["disc_id"]
            isOneToOne: false
            referencedRelation: "user_discs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "range_throws_mold_id_fkey"
            columns: ["mold_id"]
            isOneToOne: false
            referencedRelation: "disc_molds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "range_throws_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "range_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_model_versions: {
        Row: {
          config: Json
          created_at: string
          id: string
          model_name: string
          notes: string | null
          shadow_stage: string | null
          status: string
          version: string
        }
        Insert: {
          config: Json
          created_at?: string
          id: string
          model_name: string
          notes?: string | null
          shadow_stage?: string | null
          status?: string
          version: string
        }
        Update: {
          config?: Json
          created_at?: string
          id?: string
          model_name?: string
          notes?: string | null
          shadow_stage?: string | null
          status?: string
          version?: string
        }
        Relationships: []
      }
      rating_plan_events: {
        Row: {
          actual_rating: number | null
          created_at: string
          event_date: string
          event_name: string | null
          expected_rating: number | null
          id: string
          notes: string | null
          plan_id: string
          rounds: number
          sort_order: number
        }
        Insert: {
          actual_rating?: number | null
          created_at?: string
          event_date: string
          event_name?: string | null
          expected_rating?: number | null
          id?: string
          notes?: string | null
          plan_id: string
          rounds?: number
          sort_order?: number
        }
        Update: {
          actual_rating?: number | null
          created_at?: string
          event_date?: string
          event_name?: string | null
          expected_rating?: number | null
          id?: string
          notes?: string | null
          plan_id?: string
          rounds?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "rating_plan_events_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "rating_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      rating_plans: {
        Row: {
          color: string | null
          created_at: string
          id: string
          is_visible: boolean
          months: number
          name: string
          offset_points: number | null
          pdga_number: string | null
          rounds_per_month: number
          strategy: string
          target_rating: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          color?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          months?: number
          name: string
          offset_points?: number | null
          pdga_number?: string | null
          rounds_per_month?: number
          strategy: string
          target_rating?: number | null
          updated_at?: string
          user_id: string
        }
        Update: {
          color?: string | null
          created_at?: string
          id?: string
          is_visible?: boolean
          months?: number
          name?: string
          offset_points?: number | null
          pdga_number?: string | null
          rounds_per_month?: number
          strategy?: string
          target_rating?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      rating_update_schedule: {
        Row: {
          authority: string
          created_at: string
          id: string
          notes: string | null
          report_deadline: string | null
          update_date: string
          updated_at: string
        }
        Insert: {
          authority?: string
          created_at?: string
          id?: string
          notes?: string | null
          report_deadline?: string | null
          update_date: string
          updated_at?: string
        }
        Update: {
          authority?: string
          created_at?: string
          id?: string
          notes?: string | null
          report_deadline?: string | null
          update_date?: string
          updated_at?: string
        }
        Relationships: []
      }
      registration_audit: {
        Row: {
          action: string
          actor_id: string
          created_at: string
          from_value: string | null
          id: string
          registration_id: string | null
          to_value: string | null
          tournament_id: string
        }
        Insert: {
          action: string
          actor_id: string
          created_at?: string
          from_value?: string | null
          id?: string
          registration_id?: string | null
          to_value?: string | null
          tournament_id: string
        }
        Update: {
          action?: string
          actor_id?: string
          created_at?: string
          from_value?: string | null
          id?: string
          registration_id?: string | null
          to_value?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "registration_audit_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      revert_requests: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_kind"]
          id: string
          requested_by: string
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          revision_id: string
          status: Database["public"]["Enums"]["revert_request_status"]
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: Database["public"]["Enums"]["entity_kind"]
          id?: string
          requested_by: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_id: string
          status?: Database["public"]["Enums"]["revert_request_status"]
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: Database["public"]["Enums"]["entity_kind"]
          id?: string
          requested_by?: string
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          revision_id?: string
          status?: Database["public"]["Enums"]["revert_request_status"]
        }
        Relationships: [
          {
            foreignKeyName: "revert_requests_revision_id_fkey"
            columns: ["revision_id"]
            isOneToOne: false
            referencedRelation: "entity_revisions"
            referencedColumns: ["id"]
          },
        ]
      }
      reward_redemptions: {
        Row: {
          created_at: string
          granted_until: string | null
          id: string
          months_requested: number
          note: string | null
          points_spent: number
          review_note: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: Database["public"]["Enums"]["redemption_status"]
          tier_key: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          granted_until?: string | null
          id?: string
          months_requested: number
          note?: string | null
          points_spent: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["redemption_status"]
          tier_key?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          granted_until?: string | null
          id?: string
          months_requested?: number
          note?: string | null
          points_spent?: number
          review_note?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: Database["public"]["Enums"]["redemption_status"]
          tier_key?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      round_abandonment_penalties: {
        Row: {
          created_at: string
          id: string
          reason: string
          round_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          reason: string
          round_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          reason?: string
          round_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_abandonment_penalties_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_import_jobs: {
        Row: {
          error: string | null
          finished_at: string | null
          id: string
          kind: string
          possible_duplicates: number
          rounds_created: number
          rows_linked: number
          rows_seen: number
          started_at: string
          status: string
          user_id: string
        }
        Insert: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          possible_duplicates?: number
          rounds_created?: number
          rows_linked?: number
          rows_seen?: number
          started_at?: string
          status?: string
          user_id: string
        }
        Update: {
          error?: string | null
          finished_at?: string | null
          id?: string
          kind?: string
          possible_duplicates?: number
          rounds_created?: number
          rows_linked?: number
          rows_seen?: number
          started_at?: string
          status?: string
          user_id?: string
        }
        Relationships: []
      }
      round_players: {
        Row: {
          created_at: string
          guest_name: string | null
          id: string
          position: number
          round_id: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          guest_name?: string | null
          id?: string
          position?: number
          round_id: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          guest_name?: string | null
          id?: string
          position?: number
          round_id?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_players_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_ratings: {
        Row: {
          chainlink_rating: number | null
          course_id: string
          created_at: string
          guest_name: string | null
          holes_played: number
          id: string
          layout_hole_count: number
          layout_id: string
          mock_pdga_rating: number | null
          mock_pdga_source: string | null
          par_total: number
          pdga_rating_at_time: number | null
          round_id: string
          round_player_id: string
          round_rating: number
          score_to_par: number
          scratch_rating: number
          stroke_value: number
          total_strokes: number
          user_id: string | null
        }
        Insert: {
          chainlink_rating?: number | null
          course_id: string
          created_at?: string
          guest_name?: string | null
          holes_played: number
          id?: string
          layout_hole_count: number
          layout_id: string
          mock_pdga_rating?: number | null
          mock_pdga_source?: string | null
          par_total: number
          pdga_rating_at_time?: number | null
          round_id: string
          round_player_id: string
          round_rating: number
          score_to_par: number
          scratch_rating: number
          stroke_value: number
          total_strokes: number
          user_id?: string | null
        }
        Update: {
          chainlink_rating?: number | null
          course_id?: string
          created_at?: string
          guest_name?: string | null
          holes_played?: number
          id?: string
          layout_hole_count?: number
          layout_id?: string
          mock_pdga_rating?: number | null
          mock_pdga_source?: string | null
          par_total?: number
          pdga_rating_at_time?: number | null
          round_id?: string
          round_player_id?: string
          round_rating?: number
          score_to_par?: number
          scratch_rating?: number
          stroke_value?: number
          total_strokes?: number
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "round_ratings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "round_ratings_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_ratings_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_ratings_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_ratings_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      round_score_confirmations: {
        Row: {
          confirmed_by: string
          created_at: string
          hole_number: number
          round_id: string
          round_player_id: string
          strokes: number
        }
        Insert: {
          confirmed_by: string
          created_at?: string
          hole_number: number
          round_id: string
          round_player_id: string
          strokes: number
        }
        Update: {
          confirmed_by?: string
          created_at?: string
          hole_number?: number
          round_id?: string
          round_player_id?: string
          strokes?: number
        }
        Relationships: [
          {
            foreignKeyName: "round_score_confirmations_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_score_confirmations_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      round_scores: {
        Row: {
          c1_in_reg: boolean | null
          c1_putts: number | null
          c1_putts_made: number | null
          c1_putts_missed: number | null
          c2_in_reg: boolean | null
          c2_putts: number | null
          c2_putts_made: number | null
          c2_putts_missed: number | null
          drive_disc_id: string | null
          drive_distance_ft: number | null
          fairway_hit: boolean | null
          hole_note: string | null
          hole_number: number
          id: string
          longest_throw_ft: number | null
          ob_strokes: number | null
          penalties: number | null
          putt_disc_id: string | null
          putts: number | null
          round_id: string
          round_player_id: string
          scramble: boolean | null
          strokes: number
          throw_in_ft: number | null
          throw_tracking: string
          updated_at: string
        }
        Insert: {
          c1_in_reg?: boolean | null
          c1_putts?: number | null
          c1_putts_made?: number | null
          c1_putts_missed?: number | null
          c2_in_reg?: boolean | null
          c2_putts?: number | null
          c2_putts_made?: number | null
          c2_putts_missed?: number | null
          drive_disc_id?: string | null
          drive_distance_ft?: number | null
          fairway_hit?: boolean | null
          hole_note?: string | null
          hole_number: number
          id?: string
          longest_throw_ft?: number | null
          ob_strokes?: number | null
          penalties?: number | null
          putt_disc_id?: string | null
          putts?: number | null
          round_id: string
          round_player_id: string
          scramble?: boolean | null
          strokes?: number
          throw_in_ft?: number | null
          throw_tracking?: string
          updated_at?: string
        }
        Update: {
          c1_in_reg?: boolean | null
          c1_putts?: number | null
          c1_putts_made?: number | null
          c1_putts_missed?: number | null
          c2_in_reg?: boolean | null
          c2_putts?: number | null
          c2_putts_made?: number | null
          c2_putts_missed?: number | null
          drive_disc_id?: string | null
          drive_distance_ft?: number | null
          fairway_hit?: boolean | null
          hole_note?: string | null
          hole_number?: number
          id?: string
          longest_throw_ft?: number | null
          ob_strokes?: number | null
          penalties?: number | null
          putt_disc_id?: string | null
          putts?: number | null
          round_id?: string
          round_player_id?: string
          scramble?: boolean | null
          strokes?: number
          throw_in_ft?: number | null
          throw_tracking?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_scores_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_scores_round_player_id_fkey"
            columns: ["round_player_id"]
            isOneToOne: false
            referencedRelation: "round_players"
            referencedColumns: ["id"]
          },
        ]
      }
      round_throws: {
        Row: {
          created_at: string
          created_by: string | null
          disc_id: string | null
          distance_zone: string | null
          gps_accuracy_m: number | null
          hole_number: number
          holed_out: boolean
          id: string
          lat: number | null
          lie_area: string | null
          lng: number | null
          made: boolean | null
          miss_direction: string | null
          penalty_strokes: number
          round_id: string
          round_player_id: string
          shot_shape: string | null
          source: string
          start_zone: string | null
          stats_version: string
          throw_number: number
          throw_style: string | null
          throw_type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          disc_id?: string | null
          distance_zone?: string | null
          gps_accuracy_m?: number | null
          hole_number: number
          holed_out?: boolean
          id?: string
          lat?: number | null
          lie_area?: string | null
          lng?: number | null
          made?: boolean | null
          miss_direction?: string | null
          penalty_strokes?: number
          round_id: string
          round_player_id: string
          shot_shape?: string | null
          source?: string
          start_zone?: string | null
          stats_version?: string
          throw_number: number
          throw_style?: string | null
          throw_type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          disc_id?: string | null
          distance_zone?: string | null
          gps_accuracy_m?: number | null
          hole_number?: number
          holed_out?: boolean
          id?: string
          lat?: number | null
          lie_area?: string | null
          lng?: number | null
          made?: boolean | null
          miss_direction?: string | null
          penalty_strokes?: number
          round_id?: string
          round_player_id?: string
          shot_shape?: string | null
          source?: string
          start_zone?: string | null
          stats_version?: string
          throw_number?: number
          throw_style?: string | null
          throw_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_throws_disc_id_fkey"
            columns: ["disc_id"]
            isOneToOne: false
            referencedRelation: "user_discs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "round_throws_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      round_tracks: {
        Row: {
          calories: number
          distance_m: number
          elevation_gain_m: number
          elevation_loss_m: number
          id: string
          points: Json
          round_id: string
          started_at: string
          steps: number
          updated_at: string
          user_id: string
        }
        Insert: {
          calories?: number
          distance_m?: number
          elevation_gain_m?: number
          elevation_loss_m?: number
          id?: string
          points?: Json
          round_id: string
          started_at?: string
          steps?: number
          updated_at?: string
          user_id?: string
        }
        Update: {
          calories?: number
          distance_m?: number
          elevation_gain_m?: number
          elevation_loss_m?: number
          id?: string
          points?: Json
          round_id?: string
          started_at?: string
          steps?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "round_tracks_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          course_id: string
          created_at: string
          created_by: string
          ended_at: string | null
          event_snapshot: Json | null
          guest_code_id: string | null
          id: string
          is_rated: boolean
          layout_id: string
          league_event_id: string | null
          notes: string | null
          play_format: string
          rating_mode: string
          round_context: string
          scorekeeper_count: number
          scores_verified: boolean
          scoring_config: Json | null
          scoring_type: string
          started_at: string
          status: Database["public"]["Enums"]["round_status"]
          team_size: number | null
          team_throw_style: string | null
          tournament_id: string | null
          tournament_round_id: string | null
          updated_at: string
          use_handicap: boolean
          weather: Json | null
        }
        Insert: {
          course_id: string
          created_at?: string
          created_by: string
          ended_at?: string | null
          event_snapshot?: Json | null
          guest_code_id?: string | null
          id?: string
          is_rated?: boolean
          layout_id: string
          league_event_id?: string | null
          notes?: string | null
          play_format?: string
          rating_mode?: string
          round_context?: string
          scorekeeper_count?: number
          scores_verified?: boolean
          scoring_config?: Json | null
          scoring_type?: string
          started_at?: string
          status?: Database["public"]["Enums"]["round_status"]
          team_size?: number | null
          team_throw_style?: string | null
          tournament_id?: string | null
          tournament_round_id?: string | null
          updated_at?: string
          use_handicap?: boolean
          weather?: Json | null
        }
        Update: {
          course_id?: string
          created_at?: string
          created_by?: string
          ended_at?: string | null
          event_snapshot?: Json | null
          guest_code_id?: string | null
          id?: string
          is_rated?: boolean
          layout_id?: string
          league_event_id?: string | null
          notes?: string | null
          play_format?: string
          rating_mode?: string
          round_context?: string
          scorekeeper_count?: number
          scores_verified?: boolean
          scoring_config?: Json | null
          scoring_type?: string
          started_at?: string
          status?: Database["public"]["Enums"]["round_status"]
          team_size?: number | null
          team_throw_style?: string | null
          tournament_id?: string | null
          tournament_round_id?: string | null
          updated_at?: string
          use_handicap?: boolean
          weather?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_guest_code_id_fkey"
            columns: ["guest_code_id"]
            isOneToOne: false
            referencedRelation: "event_join_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_league_event_id_fkey"
            columns: ["league_event_id"]
            isOneToOne: false
            referencedRelation: "league_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_tournament_round_id_fkey"
            columns: ["tournament_round_id"]
            isOneToOne: false
            referencedRelation: "tournament_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_document_versions: {
        Row: {
          changelog: string | null
          created_at: string
          created_by: string | null
          document_id: string
          effective_at: string | null
          id: string
          published_at: string | null
          status: Database["public"]["Enums"]["rule_status"]
          supersedes_id: string | null
          version_label: string
        }
        Insert: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          document_id: string
          effective_at?: string | null
          id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["rule_status"]
          supersedes_id?: string | null
          version_label: string
        }
        Update: {
          changelog?: string | null
          created_at?: string
          created_by?: string | null
          document_id?: string
          effective_at?: string | null
          id?: string
          published_at?: string | null
          status?: Database["public"]["Enums"]["rule_status"]
          supersedes_id?: string | null
          version_label?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_document_versions_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "rule_documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rule_document_versions_supersedes_id_fkey"
            columns: ["supersedes_id"]
            isOneToOne: false
            referencedRelation: "rule_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_documents: {
        Row: {
          code: string
          created_at: string
          id: string
          sort: number
          summary: string
          title: string
        }
        Insert: {
          code: string
          created_at?: string
          id?: string
          sort?: number
          summary: string
          title: string
        }
        Update: {
          code?: string
          created_at?: string
          id?: string
          sort?: number
          summary?: string
          title?: string
        }
        Relationships: []
      }
      rule_entries: {
        Row: {
          body: string
          id: string
          is_protected: boolean
          kind: string
          number: string
          parent_number: string | null
          sort: number
          title: string
          version_id: string
        }
        Insert: {
          body?: string
          id?: string
          is_protected?: boolean
          kind?: string
          number: string
          parent_number?: string | null
          sort?: number
          title: string
          version_id: string
        }
        Update: {
          body?: string
          id?: string
          is_protected?: boolean
          kind?: string
          number?: string
          parent_number?: string | null
          sort?: number
          title?: string
          version_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "rule_entries_version_id_fkey"
            columns: ["version_id"]
            isOneToOne: false
            referencedRelation: "rule_document_versions"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_events: {
        Row: {
          all_day: boolean
          city: string | null
          country: string | null
          created_at: string
          currency: string | null
          dgs_course_id: string | null
          dgs_course_url: string | null
          dgs_event_url: string | null
          division: string | null
          ends_on: string | null
          entry_fee_cents: number | null
          event_url: string | null
          external_id: string | null
          google_event_id: string | null
          ics_uid: string | null
          id: string
          last_synced_at: string | null
          league_id: string | null
          location: string | null
          notes: string | null
          raw: Json | null
          recurrence_dow: number | null
          registration_deadline: string | null
          registration_opens_at: string | null
          registration_url: string | null
          source: Database["public"]["Enums"]["schedule_event_source"]
          spots_taken: number | null
          spots_total: number | null
          starts_at: string | null
          starts_on: string | null
          state: string | null
          status: Database["public"]["Enums"]["schedule_event_status"]
          tier: string | null
          title: string
          tournament_id: string | null
          trust_level: string
          updated_at: string
          user_id: string
          waitlist_position: number | null
          weather: Json | null
        }
        Insert: {
          all_day?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          dgs_course_id?: string | null
          dgs_course_url?: string | null
          dgs_event_url?: string | null
          division?: string | null
          ends_on?: string | null
          entry_fee_cents?: number | null
          event_url?: string | null
          external_id?: string | null
          google_event_id?: string | null
          ics_uid?: string | null
          id?: string
          last_synced_at?: string | null
          league_id?: string | null
          location?: string | null
          notes?: string | null
          raw?: Json | null
          recurrence_dow?: number | null
          registration_deadline?: string | null
          registration_opens_at?: string | null
          registration_url?: string | null
          source?: Database["public"]["Enums"]["schedule_event_source"]
          spots_taken?: number | null
          spots_total?: number | null
          starts_at?: string | null
          starts_on?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["schedule_event_status"]
          tier?: string | null
          title: string
          tournament_id?: string | null
          trust_level?: string
          updated_at?: string
          user_id: string
          waitlist_position?: number | null
          weather?: Json | null
        }
        Update: {
          all_day?: boolean
          city?: string | null
          country?: string | null
          created_at?: string
          currency?: string | null
          dgs_course_id?: string | null
          dgs_course_url?: string | null
          dgs_event_url?: string | null
          division?: string | null
          ends_on?: string | null
          entry_fee_cents?: number | null
          event_url?: string | null
          external_id?: string | null
          google_event_id?: string | null
          ics_uid?: string | null
          id?: string
          last_synced_at?: string | null
          league_id?: string | null
          location?: string | null
          notes?: string | null
          raw?: Json | null
          recurrence_dow?: number | null
          registration_deadline?: string | null
          registration_opens_at?: string | null
          registration_url?: string | null
          source?: Database["public"]["Enums"]["schedule_event_source"]
          spots_taken?: number | null
          spots_total?: number | null
          starts_at?: string | null
          starts_on?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["schedule_event_status"]
          tier?: string | null
          title?: string
          tournament_id?: string | null
          trust_level?: string
          updated_at?: string
          user_id?: string
          waitlist_position?: number | null
          weather?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "scheduled_events_league_id_fkey"
            columns: ["league_id"]
            isOneToOne: false
            referencedRelation: "leagues"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scheduled_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      series_official_results: {
        Row: {
          division: string
          event_id: string
          field_size: number
          id: string
          imported_at: string
          pdga_number: number | null
          place: number
          player_key: string
          player_name: string
          series_id: string
          source: string
          source_url: string | null
          user_id: string | null
        }
        Insert: {
          division: string
          event_id: string
          field_size: number
          id?: string
          imported_at?: string
          pdga_number?: number | null
          place: number
          player_key: string
          player_name: string
          series_id: string
          source?: string
          source_url?: string | null
          user_id?: string | null
        }
        Update: {
          division?: string
          event_id?: string
          field_size?: number
          id?: string
          imported_at?: string
          pdga_number?: number | null
          place?: number
          player_key?: string
          player_name?: string
          series_id?: string
          source?: string
          source_url?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "series_official_results_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      source_round_records: {
        Row: {
          captured_at: string
          id: string
          payload: Json
          payload_hash: string
          source: string
          source_row_id: string
          source_table: string
          user_id: string
        }
        Insert: {
          captured_at?: string
          id?: string
          payload: Json
          payload_hash: string
          source: string
          source_row_id: string
          source_table: string
          user_id: string
        }
        Update: {
          captured_at?: string
          id?: string
          payload?: Json
          payload_hash?: string
          source?: string
          source_row_id?: string
          source_table?: string
          user_id?: string
        }
        Relationships: []
      }
      source_snapshots: {
        Row: {
          content_hash: string
          created_at: string
          entity_type: string
          external_id: string
          id: string
          parse_status: string
          parser_version: string | null
          payload: Json
          retrieved_at: string
          source: string
          source_url: string | null
        }
        Insert: {
          content_hash: string
          created_at?: string
          entity_type: string
          external_id: string
          id?: string
          parse_status?: string
          parser_version?: string | null
          payload: Json
          retrieved_at?: string
          source: string
          source_url?: string | null
        }
        Update: {
          content_hash?: string
          created_at?: string
          entity_type?: string
          external_id?: string
          id?: string
          parse_status?: string
          parser_version?: string | null
          payload?: Json
          retrieved_at?: string
          source?: string
          source_url?: string | null
        }
        Relationships: []
      }
      subscription_tiers: {
        Row: {
          apple_product_id: string | null
          color: string | null
          created_at: string
          currency: string
          description: string | null
          google_product_id: string | null
          icon: string | null
          id: string
          is_active: boolean
          is_public: boolean
          key: string
          monthly_price_cents: number
          name: string
          sort_order: number
          stripe_monthly_price_id: string | null
          stripe_product_id: string | null
          stripe_yearly_price_id: string | null
          tagline: string | null
          trial_days: number
          updated_at: string
          yearly_price_cents: number
        }
        Insert: {
          apple_product_id?: string | null
          color?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          google_product_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          key: string
          monthly_price_cents?: number
          name: string
          sort_order?: number
          stripe_monthly_price_id?: string | null
          stripe_product_id?: string | null
          stripe_yearly_price_id?: string | null
          tagline?: string | null
          trial_days?: number
          updated_at?: string
          yearly_price_cents?: number
        }
        Update: {
          apple_product_id?: string | null
          color?: string | null
          created_at?: string
          currency?: string
          description?: string | null
          google_product_id?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean
          is_public?: boolean
          key?: string
          monthly_price_cents?: number
          name?: string
          sort_order?: number
          stripe_monthly_price_id?: string | null
          stripe_product_id?: string | null
          stripe_yearly_price_id?: string | null
          tagline?: string | null
          trial_days?: number
          updated_at?: string
          yearly_price_cents?: number
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          interval: string | null
          metadata: Json
          provider: string
          provider_customer_id: string | null
          provider_subscription_id: string | null
          status: string
          tier_key: string
          trial_end: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval?: string | null
          metadata?: Json
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          tier_key: string
          trial_end?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          interval?: string | null
          metadata?: Json
          provider?: string
          provider_customer_id?: string | null
          provider_subscription_id?: string | null
          status?: string
          tier_key?: string
          trial_end?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_tier_key_fkey"
            columns: ["tier_key"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["key"]
          },
        ]
      }
      tee_sign_designs: {
        Row: {
          design: Json
          hole_id: string | null
          id: string
          layout_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          design?: Json
          hole_id?: string | null
          id?: string
          layout_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          design?: Json
          hole_id?: string | null
          id?: string
          layout_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tee_sign_designs_hole_id_fkey"
            columns: ["hole_id"]
            isOneToOne: false
            referencedRelation: "holes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tee_sign_designs_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      tee_sign_media: {
        Row: {
          created_at: string
          created_by: string
          layout_id: string
          storage_path: string
        }
        Insert: {
          created_at?: string
          created_by?: string
          layout_id: string
          storage_path: string
        }
        Update: {
          created_at?: string
          created_by?: string
          layout_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "tee_sign_media_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
        ]
      }
      throwing_profiles: {
        Row: {
          backhand_comfort_ft: number | null
          backhand_max_ft: number | null
          completed_at: string | null
          created_at: string
          disc_speed_mph: number | null
          field_work_per_month: number | null
          forehand_comfort_ft: number | null
          forehand_max_ft: number | null
          goals: string[]
          handedness: string
          hyzer_angle_deg: number | null
          launch_angle_deg: number | null
          measured_at: string | null
          measurement_device: string | null
          nose_angle_deg: number | null
          notes: string | null
          physical_notes: string | null
          plastic_preference: string | null
          power_band: string | null
          preferred_weight_max_g: number | null
          preferred_weight_min_g: number | null
          primary_style: string
          putting_confident_ft: number | null
          putting_style: string | null
          rounds_per_month: number | null
          secondary_styles: string[]
          shot_confidence: Json
          shot_usage: Json
          spin_rpm: number | null
          stability_bias: string | null
          updated_at: string
          user_id: string
          wind_comfort: string | null
          wobble_deg: number | null
          years_playing: number | null
        }
        Insert: {
          backhand_comfort_ft?: number | null
          backhand_max_ft?: number | null
          completed_at?: string | null
          created_at?: string
          disc_speed_mph?: number | null
          field_work_per_month?: number | null
          forehand_comfort_ft?: number | null
          forehand_max_ft?: number | null
          goals?: string[]
          handedness?: string
          hyzer_angle_deg?: number | null
          launch_angle_deg?: number | null
          measured_at?: string | null
          measurement_device?: string | null
          nose_angle_deg?: number | null
          notes?: string | null
          physical_notes?: string | null
          plastic_preference?: string | null
          power_band?: string | null
          preferred_weight_max_g?: number | null
          preferred_weight_min_g?: number | null
          primary_style?: string
          putting_confident_ft?: number | null
          putting_style?: string | null
          rounds_per_month?: number | null
          secondary_styles?: string[]
          shot_confidence?: Json
          shot_usage?: Json
          spin_rpm?: number | null
          stability_bias?: string | null
          updated_at?: string
          user_id: string
          wind_comfort?: string | null
          wobble_deg?: number | null
          years_playing?: number | null
        }
        Update: {
          backhand_comfort_ft?: number | null
          backhand_max_ft?: number | null
          completed_at?: string | null
          created_at?: string
          disc_speed_mph?: number | null
          field_work_per_month?: number | null
          forehand_comfort_ft?: number | null
          forehand_max_ft?: number | null
          goals?: string[]
          handedness?: string
          hyzer_angle_deg?: number | null
          launch_angle_deg?: number | null
          measured_at?: string | null
          measurement_device?: string | null
          nose_angle_deg?: number | null
          notes?: string | null
          physical_notes?: string | null
          plastic_preference?: string | null
          power_band?: string | null
          preferred_weight_max_g?: number | null
          preferred_weight_min_g?: number | null
          primary_style?: string
          putting_confident_ft?: number | null
          putting_style?: string | null
          rounds_per_month?: number | null
          secondary_styles?: string[]
          shot_confidence?: Json
          shot_usage?: Json
          spin_rpm?: number | null
          stability_bias?: string | null
          updated_at?: string
          user_id?: string
          wind_comfort?: string | null
          wobble_deg?: number | null
          years_playing?: number | null
        }
        Relationships: []
      }
      tier_features: {
        Row: {
          created_at: string
          enabled: boolean
          feature_key: string
          id: string
          limit_value: number | null
          notes: string | null
          reset_period: string | null
          tier_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          enabled?: boolean
          feature_key: string
          id?: string
          limit_value?: number | null
          notes?: string | null
          reset_period?: string | null
          tier_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          enabled?: boolean
          feature_key?: string
          id?: string
          limit_value?: number | null
          notes?: string | null
          reset_period?: string | null
          tier_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tier_features_feature_key_fkey"
            columns: ["feature_key"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "tier_features_tier_id_fkey"
            columns: ["tier_id"]
            isOneToOne: false
            referencedRelation: "subscription_tiers"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_checklist_items: {
        Row: {
          created_at: string
          done: boolean
          id: string
          label: string
          phase: string
          sort_order: number
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          done?: boolean
          id?: string
          label: string
          phase: string
          sort_order?: number
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          done?: boolean
          id?: string
          label?: string
          phase?: string
          sort_order?: number
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_checklist_items_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_divisions: {
        Row: {
          age_max: number | null
          age_min: number | null
          code: string
          created_at: string
          entry_fee_cents: number
          gender: string | null
          id: string
          max_players: number | null
          max_rating: number | null
          min_rating: number | null
          name: string
          pdga_code: string | null
          sort_order: number
          tournament_id: string
        }
        Insert: {
          age_max?: number | null
          age_min?: number | null
          code: string
          created_at?: string
          entry_fee_cents?: number
          gender?: string | null
          id?: string
          max_players?: number | null
          max_rating?: number | null
          min_rating?: number | null
          name: string
          pdga_code?: string | null
          sort_order?: number
          tournament_id: string
        }
        Update: {
          age_max?: number | null
          age_min?: number | null
          code?: string
          created_at?: string
          entry_fee_cents?: number
          gender?: string | null
          id?: string
          max_players?: number | null
          max_rating?: number | null
          min_rating?: number | null
          name?: string
          pdga_code?: string | null
          sort_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_divisions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_registrations: {
        Row: {
          check_in_method: string | null
          checked_in_at: string | null
          checked_in_by: string | null
          created_at: string
          division_id: string
          id: string
          notes: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pdga_number: string | null
          status: Database["public"]["Enums"]["registration_status"]
          tournament_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          check_in_method?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          division_id: string
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pdga_number?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          tournament_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          check_in_method?: string | null
          checked_in_at?: string | null
          checked_in_by?: string | null
          created_at?: string
          division_id?: string
          id?: string
          notes?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pdga_number?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          tournament_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_checked_in_by_fkey"
            columns: ["checked_in_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_division_id_fkey"
            columns: ["division_id"]
            isOneToOne: false
            referencedRelation: "tournament_divisions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_rounds: {
        Row: {
          course_id: string | null
          created_at: string
          holes_played: number | null
          id: string
          layout_id: string | null
          layout_version_id: string | null
          notes: string | null
          round_number: number
          rules_snapshot: Json
          shotgun_time: string | null
          starts_at: string | null
          status: string
          tee_time_interval_min: number | null
          tee_time_start: string | null
          tee_time_type: string | null
          tournament_id: string
        }
        Insert: {
          course_id?: string | null
          created_at?: string
          holes_played?: number | null
          id?: string
          layout_id?: string | null
          layout_version_id?: string | null
          notes?: string | null
          round_number: number
          rules_snapshot?: Json
          shotgun_time?: string | null
          starts_at?: string | null
          status?: string
          tee_time_interval_min?: number | null
          tee_time_start?: string | null
          tee_time_type?: string | null
          tournament_id: string
        }
        Update: {
          course_id?: string | null
          created_at?: string
          holes_played?: number | null
          id?: string
          layout_id?: string | null
          layout_version_id?: string | null
          notes?: string | null
          round_number?: number
          rules_snapshot?: Json
          shotgun_time?: string | null
          starts_at?: string | null
          status?: string
          tee_time_interval_min?: number | null
          tee_time_start?: string | null
          tee_time_type?: string | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "tournament_rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_rounds_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_rounds_layout_version_id_fkey"
            columns: ["layout_version_id"]
            isOneToOne: false
            referencedRelation: "layout_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_rounds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_scores: {
        Row: {
          created_at: string
          hole_number: number
          id: string
          penalties: number
          registration_id: string
          round_id: string
          strokes: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          hole_number: number
          id?: string
          penalties?: number
          registration_id: string
          round_id: string
          strokes: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          hole_number?: number
          id?: string
          penalties?: number
          registration_id?: string
          round_id?: string
          strokes?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_scores_registration_id_fkey"
            columns: ["registration_id"]
            isOneToOne: false
            referencedRelation: "tournament_registrations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_scores_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "tournament_rounds"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_staff: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          notes: string | null
          role: string
          tournament_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          role?: string
          tournament_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          notes?: string | null
          role?: string
          tournament_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_staff_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          ace_pot_enabled: boolean
          agenda: Json
          card_creation: string
          card_selection_required: boolean
          check_in_opens: string | null
          club_id: string | null
          course_id: string | null
          cover_url: string | null
          created_at: string
          ctp_enabled: boolean
          description: string | null
          dgs_course_id: string | null
          dgs_course_url: string | null
          dgs_event_url: string | null
          end_date: string
          entry_fee_cents: number
          event_template: string | null
          event_type: string
          external_scoring: string | null
          format: Database["public"]["Enums"]["tournament_format"]
          format_family: string
          governing_ruleset: string
          handicap_enabled: boolean
          id: string
          imported_source: string | null
          latitude: number | null
          layout_id: string | null
          location: string | null
          longitude: number | null
          management_status: string
          max_players: number | null
          name: string
          owner_id: string | null
          pairing_method: string | null
          payout_plan: Json | null
          payout_ratio: number | null
          payout_type: string | null
          pdga_event_number: string | null
          pdga_sanctioned: boolean
          pdga_tier: string | null
          play_style: string | null
          player_pack_notes: string | null
          players_meeting_at: string | null
          players_pack_cents: number
          players_per_card: number | null
          reentry_allowed: boolean
          refund_policy: string | null
          registration_closes: string | null
          registration_opens: string | null
          registration_url: string | null
          rules_url: string | null
          rules_version_id: string | null
          scorecard_message: string | null
          scoring_mode: string
          series_id: string | null
          setup: Json
          signup_type: string
          slug: string
          start_date: string
          stats_mode: string
          status: Database["public"]["Enums"]["tournament_status"]
          td_email: string | null
          td_name: string | null
          td_phone: string | null
          team_size: number | null
          tee_time_type: string | null
          tiebreaker: string
          time_zone: string | null
          tournament_shape: string
          updated_at: string
          visibility: string
          waitlist_enabled: boolean
          website_url: string | null
        }
        Insert: {
          ace_pot_enabled?: boolean
          agenda?: Json
          card_creation?: string
          card_selection_required?: boolean
          check_in_opens?: string | null
          club_id?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          ctp_enabled?: boolean
          description?: string | null
          dgs_course_id?: string | null
          dgs_course_url?: string | null
          dgs_event_url?: string | null
          end_date: string
          entry_fee_cents?: number
          event_template?: string | null
          event_type?: string
          external_scoring?: string | null
          format?: Database["public"]["Enums"]["tournament_format"]
          format_family?: string
          governing_ruleset?: string
          handicap_enabled?: boolean
          id?: string
          imported_source?: string | null
          latitude?: number | null
          layout_id?: string | null
          location?: string | null
          longitude?: number | null
          management_status?: string
          max_players?: number | null
          name: string
          owner_id?: string | null
          pairing_method?: string | null
          payout_plan?: Json | null
          payout_ratio?: number | null
          payout_type?: string | null
          pdga_event_number?: string | null
          pdga_sanctioned?: boolean
          pdga_tier?: string | null
          play_style?: string | null
          player_pack_notes?: string | null
          players_meeting_at?: string | null
          players_pack_cents?: number
          players_per_card?: number | null
          reentry_allowed?: boolean
          refund_policy?: string | null
          registration_closes?: string | null
          registration_opens?: string | null
          registration_url?: string | null
          rules_url?: string | null
          rules_version_id?: string | null
          scorecard_message?: string | null
          scoring_mode?: string
          series_id?: string | null
          setup?: Json
          signup_type?: string
          slug: string
          start_date: string
          stats_mode?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          td_email?: string | null
          td_name?: string | null
          td_phone?: string | null
          team_size?: number | null
          tee_time_type?: string | null
          tiebreaker?: string
          time_zone?: string | null
          tournament_shape?: string
          updated_at?: string
          visibility?: string
          waitlist_enabled?: boolean
          website_url?: string | null
        }
        Update: {
          ace_pot_enabled?: boolean
          agenda?: Json
          card_creation?: string
          card_selection_required?: boolean
          check_in_opens?: string | null
          club_id?: string | null
          course_id?: string | null
          cover_url?: string | null
          created_at?: string
          ctp_enabled?: boolean
          description?: string | null
          dgs_course_id?: string | null
          dgs_course_url?: string | null
          dgs_event_url?: string | null
          end_date?: string
          entry_fee_cents?: number
          event_template?: string | null
          event_type?: string
          external_scoring?: string | null
          format?: Database["public"]["Enums"]["tournament_format"]
          format_family?: string
          governing_ruleset?: string
          handicap_enabled?: boolean
          id?: string
          imported_source?: string | null
          latitude?: number | null
          layout_id?: string | null
          location?: string | null
          longitude?: number | null
          management_status?: string
          max_players?: number | null
          name?: string
          owner_id?: string | null
          pairing_method?: string | null
          payout_plan?: Json | null
          payout_ratio?: number | null
          payout_type?: string | null
          pdga_event_number?: string | null
          pdga_sanctioned?: boolean
          pdga_tier?: string | null
          play_style?: string | null
          player_pack_notes?: string | null
          players_meeting_at?: string | null
          players_pack_cents?: number
          players_per_card?: number | null
          reentry_allowed?: boolean
          refund_policy?: string | null
          registration_closes?: string | null
          registration_opens?: string | null
          registration_url?: string | null
          rules_url?: string | null
          rules_version_id?: string | null
          scorecard_message?: string | null
          scoring_mode?: string
          series_id?: string | null
          setup?: Json
          signup_type?: string
          slug?: string
          start_date?: string
          stats_mode?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          td_email?: string | null
          td_name?: string | null
          td_phone?: string | null
          team_size?: number | null
          tee_time_type?: string | null
          tiebreaker?: string
          time_zone?: string | null
          tournament_shape?: string
          updated_at?: string
          visibility?: string
          waitlist_enabled?: boolean
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tournaments_club_id_fkey"
            columns: ["club_id"]
            isOneToOne: false
            referencedRelation: "clubs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "tournaments_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_layout_id_fkey"
            columns: ["layout_id"]
            isOneToOne: false
            referencedRelation: "course_layouts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_rules_version_id_fkey"
            columns: ["rules_version_id"]
            isOneToOne: false
            referencedRelation: "rule_document_versions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournaments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "event_series"
            referencedColumns: ["id"]
          },
        ]
      }
      tracked_courses: {
        Row: {
          course_id: string | null
          course_name: string
          created_at: string
          id: string
          location: string | null
          user_id: string
        }
        Insert: {
          course_id?: string | null
          course_name: string
          created_at?: string
          id?: string
          location?: string | null
          user_id: string
        }
        Update: {
          course_id?: string | null
          course_name?: string
          created_at?: string
          id?: string
          location?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracked_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "tracked_courses_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      tracker_change_log: {
        Row: {
          actor_id: string | null
          created_at: string
          event_id: string | null
          field: string
          from_value: string | null
          group_id: string
          id: string
          member_id: string | null
          severity: string
          source: string
          to_value: string | null
        }
        Insert: {
          actor_id?: string | null
          created_at?: string
          event_id?: string | null
          field: string
          from_value?: string | null
          group_id: string
          id?: string
          member_id?: string | null
          severity?: string
          source?: string
          to_value?: string | null
        }
        Update: {
          actor_id?: string | null
          created_at?: string
          event_id?: string | null
          field?: string
          from_value?: string | null
          group_id?: string
          id?: string
          member_id?: string | null
          severity?: string
          source?: string
          to_value?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracker_change_log_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tracker_group_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_change_log_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracker_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_change_log_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tracker_group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      tracker_event_rounds: {
        Row: {
          course_id: string | null
          course_layout: string | null
          course_name: string | null
          created_at: string
          division: string | null
          event_id: string
          id: string
          pool: string | null
          published_at: string | null
          round_date: string | null
          round_label: string | null
          round_number: number
          start_type: string | null
          start_window_end: string | null
          start_window_start: string | null
          tee_interval_minutes: number | null
          updated_at: string
        }
        Insert: {
          course_id?: string | null
          course_layout?: string | null
          course_name?: string | null
          created_at?: string
          division?: string | null
          event_id: string
          id?: string
          pool?: string | null
          published_at?: string | null
          round_date?: string | null
          round_label?: string | null
          round_number: number
          start_type?: string | null
          start_window_end?: string | null
          start_window_start?: string | null
          tee_interval_minutes?: number | null
          updated_at?: string
        }
        Update: {
          course_id?: string | null
          course_layout?: string | null
          course_name?: string | null
          created_at?: string
          division?: string | null
          event_id?: string
          id?: string
          pool?: string | null
          published_at?: string | null
          round_date?: string | null
          round_label?: string | null
          round_number?: number
          start_type?: string | null
          start_window_end?: string | null
          start_window_start?: string | null
          tee_interval_minutes?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracker_event_rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "tracker_event_rounds_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_event_rounds_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tracker_group_events"
            referencedColumns: ["id"]
          },
        ]
      }
      tracker_group_events: {
        Row: {
          auto_added: boolean
          city: string | null
          country: string | null
          cover_url: string | null
          created_at: string
          description: string | null
          end_date: string | null
          event_classification: string | null
          event_date: string | null
          event_status: string | null
          field_capacity: number | null
          field_size: number | null
          group_id: string
          hydrated_at: string | null
          id: string
          last_synced_at: string | null
          latitude: number | null
          live_current_round: number | null
          live_fingerprint: string | null
          live_last_synced_at: string | null
          live_scoring_url: string | null
          live_status: string | null
          location: string | null
          longitude: number | null
          name: string
          pdga_event_ref: string | null
          position: number
          registration_status: string | null
          registration_url: string | null
          results_url: string | null
          rounds_planned: number | null
          sanctioning_tier: string | null
          start_type: string | null
          state: string | null
          sync_error: string | null
          tier: string | null
          time_zone: string | null
          url: string | null
          venue_name: string | null
        }
        Insert: {
          auto_added?: boolean
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_classification?: string | null
          event_date?: string | null
          event_status?: string | null
          field_capacity?: number | null
          field_size?: number | null
          group_id: string
          hydrated_at?: string | null
          id?: string
          last_synced_at?: string | null
          latitude?: number | null
          live_current_round?: number | null
          live_fingerprint?: string | null
          live_last_synced_at?: string | null
          live_scoring_url?: string | null
          live_status?: string | null
          location?: string | null
          longitude?: number | null
          name: string
          pdga_event_ref?: string | null
          position?: number
          registration_status?: string | null
          registration_url?: string | null
          results_url?: string | null
          rounds_planned?: number | null
          sanctioning_tier?: string | null
          start_type?: string | null
          state?: string | null
          sync_error?: string | null
          tier?: string | null
          time_zone?: string | null
          url?: string | null
          venue_name?: string | null
        }
        Update: {
          auto_added?: boolean
          city?: string | null
          country?: string | null
          cover_url?: string | null
          created_at?: string
          description?: string | null
          end_date?: string | null
          event_classification?: string | null
          event_date?: string | null
          event_status?: string | null
          field_capacity?: number | null
          field_size?: number | null
          group_id?: string
          hydrated_at?: string | null
          id?: string
          last_synced_at?: string | null
          latitude?: number | null
          live_current_round?: number | null
          live_fingerprint?: string | null
          live_last_synced_at?: string | null
          live_scoring_url?: string | null
          live_status?: string | null
          location?: string | null
          longitude?: number | null
          name?: string
          pdga_event_ref?: string | null
          position?: number
          registration_status?: string | null
          registration_url?: string | null
          results_url?: string | null
          rounds_planned?: number | null
          sanctioning_tier?: string | null
          start_type?: string | null
          state?: string | null
          sync_error?: string | null
          tier?: string | null
          time_zone?: string | null
          url?: string | null
          venue_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracker_group_events_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracker_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tracker_group_members: {
        Row: {
          color: string | null
          created_at: string
          default_division: string | null
          display_name: string | null
          group_id: string
          id: string
          is_you: boolean
          pdga_number: string
          position: number
        }
        Insert: {
          color?: string | null
          created_at?: string
          default_division?: string | null
          display_name?: string | null
          group_id: string
          id?: string
          is_you?: boolean
          pdga_number: string
          position?: number
        }
        Update: {
          color?: string | null
          created_at?: string
          default_division?: string | null
          display_name?: string | null
          group_id?: string
          id?: string
          is_you?: boolean
          pdga_number?: string
          position?: number
        }
        Relationships: [
          {
            foreignKeyName: "tracker_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "tracker_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      tracker_groups: {
        Row: {
          cover_url: string | null
          created_at: string
          description: string | null
          from_crew_id: string | null
          id: string
          is_all_time: boolean
          last_synced_at: string | null
          name: string
          owner_id: string
          status: string
          time_zone: string | null
          trip_end: string | null
          trip_start: string | null
          updated_at: string
        }
        Insert: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          from_crew_id?: string | null
          id?: string
          is_all_time?: boolean
          last_synced_at?: string | null
          name: string
          owner_id: string
          status?: string
          time_zone?: string | null
          trip_end?: string | null
          trip_start?: string | null
          updated_at?: string
        }
        Update: {
          cover_url?: string | null
          created_at?: string
          description?: string | null
          from_crew_id?: string | null
          id?: string
          is_all_time?: boolean
          last_synced_at?: string | null
          name?: string
          owner_id?: string
          status?: string
          time_zone?: string | null
          trip_end?: string | null
          trip_start?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      tracker_live_scores: {
        Row: {
          card_number: string | null
          completed: boolean
          division: string | null
          event_id: string
          hole_length_units: string | null
          hole_lengths: Json | null
          hole_pars: Json | null
          hole_scores: Json | null
          id: string
          last_synced_at: string
          member_id: string | null
          pdga_number: string
          place: number | null
          player_name: string | null
          result_source: string
          round_number: number | null
          round_score: number | null
          round_started: boolean
          round_to_par: number | null
          running_place: number | null
          tee_time: string | null
          thru: number | null
          to_par: number | null
          total: number | null
          updated_at: string
        }
        Insert: {
          card_number?: string | null
          completed?: boolean
          division?: string | null
          event_id: string
          hole_length_units?: string | null
          hole_lengths?: Json | null
          hole_pars?: Json | null
          hole_scores?: Json | null
          id?: string
          last_synced_at?: string
          member_id?: string | null
          pdga_number: string
          place?: number | null
          player_name?: string | null
          result_source?: string
          round_number?: number | null
          round_score?: number | null
          round_started?: boolean
          round_to_par?: number | null
          running_place?: number | null
          tee_time?: string | null
          thru?: number | null
          to_par?: number | null
          total?: number | null
          updated_at?: string
        }
        Update: {
          card_number?: string | null
          completed?: boolean
          division?: string | null
          event_id?: string
          hole_length_units?: string | null
          hole_lengths?: Json | null
          hole_pars?: Json | null
          hole_scores?: Json | null
          id?: string
          last_synced_at?: string
          member_id?: string | null
          pdga_number?: string
          place?: number | null
          player_name?: string | null
          result_source?: string
          round_number?: number | null
          round_score?: number | null
          round_started?: boolean
          round_to_par?: number | null
          running_place?: number | null
          tee_time?: string | null
          thru?: number | null
          to_par?: number | null
          total?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tracker_live_scores_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tracker_group_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_live_scores_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tracker_group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      tracker_pdga_sync_state: {
        Row: {
          attempt_count: number
          claimed_at: string | null
          error: string | null
          fingerprint: string | null
          last_checked_at: string | null
          last_success_at: string | null
          next_check_at: string | null
          payload: Json | null
          status: string
          tourn_id: string
          updated_at: string
        }
        Insert: {
          attempt_count?: number
          claimed_at?: string | null
          error?: string | null
          fingerprint?: string | null
          last_checked_at?: string | null
          last_success_at?: string | null
          next_check_at?: string | null
          payload?: Json | null
          status?: string
          tourn_id: string
          updated_at?: string
        }
        Update: {
          attempt_count?: number
          claimed_at?: string | null
          error?: string | null
          fingerprint?: string | null
          last_checked_at?: string | null
          last_success_at?: string | null
          next_check_at?: string | null
          payload?: Json | null
          status?: string
          tourn_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      tracker_tee_times: {
        Row: {
          card_number: string | null
          created_at: string
          division: string | null
          event_id: string
          id: string
          last_synced_at: string | null
          manual_override: boolean
          member_id: string
          notes: string | null
          pool: string | null
          round_number: number | null
          source: string
          starting_hole: string | null
          status: string
          tee_time: string | null
        }
        Insert: {
          card_number?: string | null
          created_at?: string
          division?: string | null
          event_id: string
          id?: string
          last_synced_at?: string | null
          manual_override?: boolean
          member_id: string
          notes?: string | null
          pool?: string | null
          round_number?: number | null
          source?: string
          starting_hole?: string | null
          status?: string
          tee_time?: string | null
        }
        Update: {
          card_number?: string | null
          created_at?: string
          division?: string | null
          event_id?: string
          id?: string
          last_synced_at?: string | null
          manual_override?: boolean
          member_id?: string
          notes?: string | null
          pool?: string | null
          round_number?: number | null
          source?: string
          starting_hole?: string | null
          status?: string
          tee_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tracker_tee_times_event_id_fkey"
            columns: ["event_id"]
            isOneToOne: false
            referencedRelation: "tracker_group_events"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tracker_tee_times_member_id_fkey"
            columns: ["member_id"]
            isOneToOne: false
            referencedRelation: "tracker_group_members"
            referencedColumns: ["id"]
          },
        ]
      }
      udisc_catalog: {
        Row: {
          city: string | null
          country: string | null
          course_id: string | null
          created_at: string
          fetched_at: string | null
          hole_count: number | null
          last_error: string | null
          latitude: number | null
          longitude: number | null
          name: string | null
          slug: string
          state: string | null
          status: string
          updated_at: string
          url: string
          us_score: number
        }
        Insert: {
          city?: string | null
          country?: string | null
          course_id?: string | null
          created_at?: string
          fetched_at?: string | null
          hole_count?: number | null
          last_error?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          slug: string
          state?: string | null
          status?: string
          updated_at?: string
          url: string
          us_score?: number
        }
        Update: {
          city?: string | null
          country?: string | null
          course_id?: string | null
          created_at?: string
          fetched_at?: string | null
          hole_count?: number | null
          last_error?: string | null
          latitude?: number | null
          longitude?: number | null
          name?: string | null
          slug?: string
          state?: string | null
          status?: string
          updated_at?: string
          url?: string
          us_score?: number
        }
        Relationships: [
          {
            foreignKeyName: "udisc_catalog_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "course_stats"
            referencedColumns: ["course_id"]
          },
          {
            foreignKeyName: "udisc_catalog_course_id_fkey"
            columns: ["course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["id"]
          },
        ]
      }
      user_achievements: {
        Row: {
          achievement_key: string
          earned_at: string
          progress: Json
          user_id: string
        }
        Insert: {
          achievement_key: string
          earned_at?: string
          progress?: Json
          user_id: string
        }
        Update: {
          achievement_key?: string
          earned_at?: string
          progress?: Json
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_achievements_achievement_key_fkey"
            columns: ["achievement_key"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["key"]
          },
        ]
      }
      user_challenge_progress: {
        Row: {
          challenge_id: string
          completed_at: string | null
          progress: number
          updated_at: string
          user_id: string
        }
        Insert: {
          challenge_id: string
          completed_at?: string | null
          progress?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          challenge_id?: string
          completed_at?: string | null
          progress?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_challenge_progress_challenge_id_fkey"
            columns: ["challenge_id"]
            isOneToOne: false
            referencedRelation: "challenges"
            referencedColumns: ["id"]
          },
        ]
      }
      user_contact_hashes: {
        Row: {
          created_at: string
          hash: string
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          created_at?: string
          hash: string
          id?: string
          kind: string
          user_id: string
        }
        Update: {
          created_at?: string
          hash?: string
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      user_dashboard_layouts: {
        Row: {
          layout: Json
          page: string
          updated_at: string
          user_id: string
        }
        Insert: {
          layout?: Json
          page: string
          updated_at?: string
          user_id: string
        }
        Update: {
          layout?: Json
          page?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_dashboard_prefs: {
        Row: {
          created_at: string
          dashboard_key: string
          hidden_widgets: string[]
          id: string
          layout_version: number
          preset: string | null
          updated_at: string
          user_id: string
          widget_order: string[]
          widget_sizes: Json
        }
        Insert: {
          created_at?: string
          dashboard_key: string
          hidden_widgets?: string[]
          id?: string
          layout_version?: number
          preset?: string | null
          updated_at?: string
          user_id: string
          widget_order?: string[]
          widget_sizes?: Json
        }
        Update: {
          created_at?: string
          dashboard_key?: string
          hidden_widgets?: string[]
          id?: string
          layout_version?: number
          preset?: string | null
          updated_at?: string
          user_id?: string
          widget_order?: string[]
          widget_sizes?: Json
        }
        Relationships: []
      }
      user_discs: {
        Row: {
          acquired_at: string
          color: string
          condition: Database["public"]["Enums"]["disc_condition"]
          created_at: string
          distance_ft: number | null
          id: string
          is_favorite: boolean
          mold_id: string
          nickname: string | null
          notes: string | null
          plastic_id: string | null
          plastic_name: string | null
          purpose: string | null
          retired_at: string | null
          shot_shapes: string[]
          slot_order: number
          stamp_note: string | null
          throw_styles: string[]
          updated_at: string
          user_id: string
          weight_g: number | null
        }
        Insert: {
          acquired_at?: string
          color?: string
          condition?: Database["public"]["Enums"]["disc_condition"]
          created_at?: string
          distance_ft?: number | null
          id?: string
          is_favorite?: boolean
          mold_id: string
          nickname?: string | null
          notes?: string | null
          plastic_id?: string | null
          plastic_name?: string | null
          purpose?: string | null
          retired_at?: string | null
          shot_shapes?: string[]
          slot_order?: number
          stamp_note?: string | null
          throw_styles?: string[]
          updated_at?: string
          user_id: string
          weight_g?: number | null
        }
        Update: {
          acquired_at?: string
          color?: string
          condition?: Database["public"]["Enums"]["disc_condition"]
          created_at?: string
          distance_ft?: number | null
          id?: string
          is_favorite?: boolean
          mold_id?: string
          nickname?: string | null
          notes?: string | null
          plastic_id?: string | null
          plastic_name?: string | null
          purpose?: string | null
          retired_at?: string | null
          shot_shapes?: string[]
          slot_order?: number
          stamp_note?: string | null
          throw_styles?: string[]
          updated_at?: string
          user_id?: string
          weight_g?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "user_discs_mold_id_fkey"
            columns: ["mold_id"]
            isOneToOne: false
            referencedRelation: "disc_molds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_discs_plastic_id_fkey"
            columns: ["plastic_id"]
            isOneToOne: false
            referencedRelation: "disc_plastics"
            referencedColumns: ["id"]
          },
        ]
      }
      user_goals: {
        Row: {
          baseline: number | null
          completed_at: string | null
          course_name: string | null
          created_at: string
          deadline: string | null
          id: string
          metric: Database["public"]["Enums"]["goal_metric"]
          progress: number
          shared_at: string | null
          target: number
          title: string
          updated_at: string
          user_id: string
        }
        Insert: {
          baseline?: number | null
          completed_at?: string | null
          course_name?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          metric: Database["public"]["Enums"]["goal_metric"]
          progress?: number
          shared_at?: string | null
          target: number
          title: string
          updated_at?: string
          user_id: string
        }
        Update: {
          baseline?: number | null
          completed_at?: string | null
          course_name?: string | null
          created_at?: string
          deadline?: string | null
          id?: string
          metric?: Database["public"]["Enums"]["goal_metric"]
          progress?: number
          shared_at?: string | null
          target?: number
          title?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_progress: {
        Row: {
          coins: number
          created_at: string
          last_active_date: string | null
          level: number
          longest_streak: number
          streak_days: number
          title: string
          updated_at: string
          user_id: string
          xp: number
        }
        Insert: {
          coins?: number
          created_at?: string
          last_active_date?: string | null
          level?: number
          longest_streak?: number
          streak_days?: number
          title?: string
          updated_at?: string
          user_id: string
          xp?: number
        }
        Update: {
          coins?: number
          created_at?: string
          last_active_date?: string | null
          level?: number
          longest_streak?: number
          streak_days?: number
          title?: string
          updated_at?: string
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_theme_prefs: {
        Row: {
          background: Json
          mode: string
          palette: Json
          prefs: Json
          preset: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          background?: Json
          mode?: string
          palette?: Json
          prefs?: Json
          preset?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          background?: Json
          mode?: string
          palette?: Json
          prefs?: Json
          preset?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_wardrobe: {
        Row: {
          acquired_at: string
          custom_colors: Json
          item_id: string
          user_id: string
        }
        Insert: {
          acquired_at?: string
          custom_colors?: Json
          item_id: string
          user_id: string
        }
        Update: {
          acquired_at?: string
          custom_colors?: Json
          item_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_wardrobe_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "wardrobe_items"
            referencedColumns: ["id"]
          },
        ]
      }
      wardrobe_items: {
        Row: {
          created_at: string
          description: string | null
          id: string
          is_starter: boolean
          name: string
          palette: Json
          rarity: Database["public"]["Enums"]["wardrobe_rarity"]
          slot: Database["public"]["Enums"]["wardrobe_slot"]
          sort_order: number
          style_key: string
          unlock_rule: Json
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          is_starter?: boolean
          name: string
          palette?: Json
          rarity?: Database["public"]["Enums"]["wardrobe_rarity"]
          slot: Database["public"]["Enums"]["wardrobe_slot"]
          sort_order?: number
          style_key: string
          unlock_rule?: Json
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          is_starter?: boolean
          name?: string
          palette?: Json
          rarity?: Database["public"]["Enums"]["wardrobe_rarity"]
          slot?: Database["public"]["Enums"]["wardrobe_slot"]
          sort_order?: number
          style_key?: string
          unlock_rule?: Json
        }
        Relationships: []
      }
      weather_cache: {
        Row: {
          cache_key: string
          fetched_at: string
          payload: Json
        }
        Insert: {
          cache_key: string
          fetched_at?: string
          payload: Json
        }
        Update: {
          cache_key?: string
          fetched_at?: string
          payload?: Json
        }
        Relationships: []
      }
      xp_events: {
        Row: {
          action_key: string
          created_at: string
          id: string
          meta: Json
          ref_id: string | null
          ref_type: string | null
          user_id: string
          xp: number
        }
        Insert: {
          action_key: string
          created_at?: string
          id?: string
          meta?: Json
          ref_id?: string | null
          ref_type?: string | null
          user_id: string
          xp: number
        }
        Update: {
          action_key?: string
          created_at?: string
          id?: string
          meta?: Json
          ref_id?: string | null
          ref_type?: string | null
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
    }
    Views: {
      course_stats: {
        Row: {
          avg_rating: number | null
          course_id: string | null
          play_count: number | null
          review_count: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      save_admin_project_notes: {
        Args: { _knowledge: string; _security_notes: string; _revision: number; _reason: string }
        Returns: number
      }
      are_friends: { Args: { _a: string; _b: string }; Returns: boolean }
      assert_self_or_admin: { Args: { _user: string }; Returns: undefined }
      award_achievement: {
        Args: { _key: string; _user: string }
        Returns: boolean
      }
      award_xp: {
        Args: {
          _action: string
          _meta?: Json
          _ref_id?: string
          _ref_type?: string
          _user: string
          _xp: number
        }
        Returns: undefined
      }
      begin_layout_hole_renumber: {
        Args: { _layout: string }
        Returns: undefined
      }
      build_event_round_snapshot: {
        Args: { _id: string; _kind: string }
        Returns: Json
      }
      bump_challenge_progress: {
        Args: {
          _amount?: number
          _goal: Database["public"]["Enums"]["challenge_goal_type"]
          _user: string
        }
        Returns: undefined
      }
      bump_course_trust: {
        Args: { _field: string; _user: string }
        Returns: undefined
      }
      calc_level: { Args: { _xp: number }; Returns: number }
      can_access_event_chat: {
        Args: { _event: string; _kind: string; _user: string }
        Returns: boolean
      }
      can_edit_layout: {
        Args: { _layout: string; _user: string }
        Returns: boolean
      }
      can_enter_event_clubhouse: {
        Args: { _tournament_id: string }
        Returns: boolean
      }
      can_manage_club: {
        Args: { _club_id: string; _user: string }
        Returns: boolean
      }
      can_manage_event: {
        Args: { _event: string; _kind: string; _user: string }
        Returns: boolean
      }
      can_manage_league: {
        Args: { _league_id: string; _user: string }
        Returns: boolean
      }
      can_see_event_rsvps: {
        Args: { _event_id: string; _user: string }
        Returns: boolean
      }
      can_steward_course: {
        Args: { _course: string; _user: string }
        Returns: boolean
      }
      can_view_post: { Args: { _post_id: string }; Returns: boolean }
      canonicalize_pending_users: { Args: never; Returns: number }
      canonicalize_user_rounds: { Args: { _user: string }; Returns: Json }
      clubhouse_event_roster: {
        Args: { _tournament_id: string }
        Returns: {
          checked_in: boolean
          display_name: string
          division_id: string
          user_id: string
        }[]
      }
      compute_chainlink_round: {
        Args: {
          _base_rating?: number
          _score: number
          _ssa: number
          _stroke_value?: number
        }
        Returns: number
      }
      compute_mock_pdga_rating: {
        Args: {
          _course_id: string
          _course_name: string
          _layout_name: string
          _played_on: string
          _score: number
          _to_par: number
          _user_id: string
        }
        Returns: {
          rating: number
          source: string
        }[]
      }
      compute_mock_pdga_rating_clamped: {
        Args: {
          _course_id: string
          _course_name: string
          _layout_name: string
          _played_on: string
          _score: number
          _to_par: number
          _user_id: string
        }
        Returns: {
          rating: number
          source: string
        }[]
      }
      consume_feature: {
        Args: { _amount?: number; _feature: string; _user: string }
        Returns: Json
      }
      contact_block_reason: {
        Args: { _kind: string; _target: string }
        Returns: string
      }
      contribution_award_badges: { Args: { _user: string }; Returns: undefined }
      contribution_balance: { Args: { _user_id: string }; Returns: number }
      contribution_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          avatar_url: string
          courses_built: number
          display_name: string
          holes_mapped: number
          points: number
          user_id: string
          username: string
          verified_count: number
        }[]
      }
      contribution_points_for: {
        Args: { _kind: Database["public"]["Enums"]["contribution_kind"] }
        Returns: number
      }
      controls_event_access: {
        Args: { _event: string; _kind: string; _user: string }
        Returns: boolean
      }
      copy_layout: { Args: { _name: string; _source: string }; Returns: string }
      course_conditions_tick: { Args: never; Returns: number }
      course_data_engine_summary: { Args: never; Returns: Json }
      course_directory_diagnostic: {
        Args: { _course_id: string }
        Returns: Json
      }
      course_jobs_health: { Args: never; Returns: Json }
      course_listing_set_aside_reasons: { Args: never; Returns: Json }
      course_map_coverage_by_state: {
        Args: never
        Returns: {
          courses: number
          partial: number
          starter: number
          state: string
          unmapped: number
          verified: number
        }[]
      }
      course_map_coverage_rows: {
        Args: { _course_ids?: string[] }
        Returns: {
          course_id: string
          expected_holes: number
          map_state: string
          mapped_holes: number
        }[]
      }
      course_match_key: { Args: { _name: string }; Returns: string }
      course_name_variant_tokens: { Args: { _name: string }; Returns: string[] }
      course_place_index: {
        Args: never
        Returns: {
          city: string
          lat: number
          lng: number
          state: string
        }[]
      }
      course_source_coverage: { Args: never; Returns: Json }
      courses_needing_mapping: {
        Args: {
          _limit?: number
          _offset?: number
          _search?: string
          _state?: string
        }
        Returns: {
          city: string
          hole_count: number
          id: string
          location_quality: string
          mapped_holes: number
          name: string
          state: string
          total_count: number
        }[]
      }
      delete_round: { Args: { _round_id: string }; Returns: undefined }
      dgd_preview_allowed: { Args: never; Returns: boolean }
      dgd_scale_1000: { Args: { _a: number }; Returns: number }
      dgd_scale_1000_delta: {
        Args: { _a: number; _d: number }
        Returns: number
      }
      dgd_scale_1000_public: { Args: { _a: number }; Returns: number }
      dgd_scale_1200: { Args: { _a: number }; Returns: number }
      dgd_scale_1200_public: { Args: { _a: number }; Returns: number }
      dgd_scale_b: { Args: { _a: number }; Returns: number }
      dgd_scale_b_delta: { Args: { _d: number }; Returns: number }
      dgd_tier_enqueue: {
        Args: { _reason: string; _user: string }
        Returns: undefined
      }
      dgd_v1_apply_layouts: {
        Args: { _layouts: Json; _model: string; _run: string }
        Returns: number
      }
      dgd_v1_apply_player: {
        Args: {
          _eligibility: Json
          _events: Json
          _model: string
          _run: string
          _state: Json
          _user: string
        }
        Returns: number
      }
      dgd_v1_link_duplicate: {
        Args: { _from: string; _to: string }
        Returns: number
      }
      dgd_v11_claim_jobs: {
        Args: { _limit: number }
        Returns: {
          attempts: number
          created_at: string
          duration_ms: number | null
          earliest_affected_on: string | null
          finished_at: string | null
          id: string
          last_error: string | null
          max_attempts: number
          mode: string | null
          model_version: string
          reasons: string[]
          replay_from: string | null
          rows_changed: number | null
          run_after: string
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }[]
        SetofOptions: {
          from: "*"
          to: "dgd_v11_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      dgd_v11_enqueue: {
        Args: { _from: string; _reason: string; _user: string }
        Returns: undefined
      }
      dgd_v11_wake_worker: { Args: never; Returns: undefined }
      dgd_v11_worker_token_ok: { Args: { _token: string }; Returns: boolean }
      dgim_join_event_chat: {
        Args: { _event: string; _kind: string }
        Returns: string
      }
      director_registration_totals: {
        Args: { _tournament_ids: string[] }
        Returns: {
          checked_in: number
          confirmed: number
          fees_collected_cents: number
          fees_outstanding_cents: number
          paid: number
          pending: number
          total: number
          unpaid: number
          waitlist: number
          withdrawn: number
        }[]
      }
      directory_map_coverage: { Args: never; Returns: Json }
      directory_map_view: {
        Args: {
          _difficulty?: string
          _east: number
          _force_pins?: boolean
          _holes?: string
          _min_rating?: number
          _north: number
          _q?: string
          _scoring?: string
          _south: number
          _states?: string[]
          _west: number
          _zoom: number
        }
        Returns: Json
      }
      estimate_chainlink_from_par: {
        Args: { _score: number; _to_par: number; _user_id: string }
        Returns: number
      }
      event_has_capability: {
        Args: { _cap: string; _event: string; _kind: string; _user: string }
        Returns: boolean
      }
      event_owner_id: {
        Args: { _event: string; _kind: string }
        Returns: string
      }
      feature_limit: {
        Args: { _feature: string; _user: string }
        Returns: Json
      }
      find_duplicate_courses: {
        Args: {
          _city?: string
          _exclude_id?: string
          _lat?: number
          _lng?: number
          _name: string
          _state?: string
        }
        Returns: {
          city: string
          hole_count: number
          id: string
          layout_count: number
          match_reason: string
          name: string
          slug: string
          state: string
        }[]
      }
      friend_leaderboard: {
        Args: never
        Returns: {
          achievements: number
          avatar_url: string
          display_name: string
          duel_wins: number
          duels_played: number
          is_self: boolean
          level: number
          pdga_rating: number
          streak_days: number
          title: string
          user_id: string
          username: string
          xp: number
        }[]
      }
      friend_suggestions: {
        Args: { _limit?: number; _user_id: string }
        Returns: {
          mutual_count: number
          same_city: boolean
          same_home_course: boolean
          same_state: boolean
          score: number
          shared_clubs: number
          user_id: string
        }[]
      }
      friends_live_rounds: {
        Args: never
        Returns: {
          avatar_url: string
          course_name: string
          display_name: string
          holes_played: number
          last_score_at: string
          player_id: string
          round_id: string
          started_at: string
          total_par: number
          total_strokes: number
          username: string
        }[]
      }
      generate_player_code: { Args: never; Returns: string }
      get_course_stewards: {
        Args: { _course: string }
        Returns: {
          role: string
          user_id: string
        }[]
      }
      get_dgd_identity_by_pdga: {
        Args: { _pdga: string[] }
        Returns: {
          dgd_rating: number
          pdga_number: string
          tier: string
        }[]
      }
      get_dgd_leaderboard: {
        Args: { _limit?: number; _tier?: string }
        Returns: {
          avatar_url: string
          dgd_rating: number
          display_name: string
          eligible_rounds: number
          rank: number
          tier: string
          user_id: string
          username: string
        }[]
      }
      get_dgd_round_ratings: {
        Args: { _source_ids: string[] }
        Returns: {
          canonical_round_id: string
          dgd_round_rating: number
          source_row_id: string
          status: string
        }[]
      }
      get_effective_tier: { Args: { _user: string }; Returns: string }
      get_league_td_contact: {
        Args: { _league_id: string }
        Returns: {
          td_email: string
          td_name: string
          td_phone: string
        }[]
      }
      get_lost_disc_contact: { Args: { _report_id: string }; Returns: string }
      get_my_data_health: { Args: never; Returns: Json }
      get_my_dgd_preview_rounds: {
        Args: { _limit?: number; _offset?: number; _status?: string }
        Returns: {
          confidence_after: number
          confidence_before: number
          ctx_expected: number
          ctx_strokes_vs_expectation: number
          display_after: number
          display_before: number
          division: string
          event_adjustment: number
          event_name: string
          id: string
          layout_knowledge: string
          layout_name: string
          likely_high: number
          likely_low: number
          par: number
          pdga_round_rating: number
          played_on: string
          pre_expected: number
          pre_strokes_vs_expectation: number
          round_number: number
          round_performance_display: number
          score: number
          status: string
          status_reason: string
          total_count: number
        }[]
      }
      get_my_dgd_preview_rounds_v2: {
        Args: {
          _category?: string
          _course?: string
          _from?: string
          _limit?: number
          _offset?: number
          _rated?: boolean
          _source?: string
          _status?: string
          _to?: string
        }
        Returns: {
          category: string
          confidence_after: number
          confidence_before: number
          course_name: string
          ctx_expected: number
          ctx_strokes_vs_expectation: number
          display_after: number
          display_before: number
          division: string
          event_adjustment: number
          event_name: string
          id: string
          layout_knowledge: string
          layout_name: string
          legacy_round_rating: number
          likely_high: number
          likely_low: number
          par: number
          pdga_round_rating: number
          played_on: string
          pre_expected: number
          pre_strokes_vs_expectation: number
          round_number: number
          round_performance_display: number
          score: number
          sources: string[]
          status: string
          status_reason: string
          total_count: number
        }[]
      }
      get_my_dgd_preview_rounds_v3: {
        Args: {
          _category?: string
          _course?: string
          _from?: string
          _limit?: number
          _offset?: number
          _rated?: boolean
          _source?: string
          _status?: string
          _to?: string
        }
        Returns: {
          category: string
          confidence_after: number
          confidence_before: number
          course_name: string
          ctx_expected: number
          ctx_strokes_vs_expectation: number
          display_after: number
          display_before: number
          division: string
          event_adjustment: number
          event_name: string
          id: string
          layout_knowledge: string
          layout_name: string
          legacy_round_rating: number
          likely_high: number
          likely_low: number
          par: number
          pdga_round_rating: number
          played_on: string
          pre_expected: number
          pre_strokes_vs_expectation: number
          round_number: number
          round_performance_display: number
          score: number
          sources: string[]
          status: string
          status_reason: string
          total_count: number
          udisc_round_rating: number
        }[]
      }
      get_my_dgd_preview_rounds_v4: {
        Args: {
          _category?: string
          _course?: string
          _from?: string
          _limit?: number
          _model?: string
          _offset?: number
          _rated?: boolean
          _source?: string
          _to?: string
        }
        Returns: {
          category: string
          confidence_after: number
          confidence_before: number
          course_name: string
          ctx_expected: number
          ctx_strokes_vs_expectation: number
          display_after: number
          display_before: number
          division: string
          event_adjustment: number
          event_name: string
          field_context_confidence: string
          field_coverage_ratio: number
          field_known_players: number
          id: string
          layout_knowledge: string
          layout_name: string
          legacy_round_rating: number
          likely_high: number
          likely_low: number
          par: number
          pdga_round_rating: number
          played_on: string
          pre_expected: number
          pre_strokes_vs_expectation: number
          round_number: number
          round_performance_display: number
          score: number
          source_conflict: string
          sources: string[]
          status: string
          status_reason: string
          total_count: number
          udisc_round_rating: number
        }[]
      }
      get_my_dgd_preview_summary: { Args: never; Returns: Json }
      get_my_dgd_preview_summary_v2: {
        Args: { _model?: string }
        Returns: Json
      }
      get_my_dgd_rating: { Args: never; Returns: Json }
      get_my_dgd_rating_rounds: {
        Args: {
          _category?: string
          _course?: string
          _from?: string
          _limit?: number
          _offset?: number
          _rated?: boolean
          _source?: string
          _to?: string
        }
        Returns: {
          category: string
          confidence_after: number
          confidence_before: number
          course_name: string
          ctx_expected: number
          ctx_strokes_vs_expectation: number
          display_after: number
          display_before: number
          division: string
          event_adjustment: number
          event_name: string
          field_context_confidence: string
          field_coverage_ratio: number
          field_known_players: number
          id: string
          layout_knowledge: string
          layout_name: string
          legacy_round_rating: number
          likely_high: number
          likely_low: number
          par: number
          pdga_round_rating: number
          played_on: string
          pre_expected: number
          pre_strokes_vs_expectation: number
          round_number: number
          round_performance_display: number
          score: number
          source_conflict: string
          sources: string[]
          status: string
          status_reason: string
          total_count: number
          udisc_round_rating: number
        }[]
      }
      get_my_dgd_scale_candidates: {
        Args: never
        Returns: {
          benchmark_population: string
          benchmark_sample: number
          benchmark_version: string
          confidence: number
          display_form: number
          display_rating: number
          percentile: number
          scale_version: string
          status: string
          transform_type: string
        }[]
      }
      get_player_dgd_identity: {
        Args: { _users: string[] }
        Returns: {
          confidence: number
          dgd_rating: number
          eligible_rounds: number
          form_value: number
          rating_status: string
          tier: string
          tier_score: number
          user_id: string
        }[]
      }
      get_public_prize_winners: {
        Args: { _event: string; _kind: string }
        Returns: {
          amount: number
          award_type: string
          hole_number: number
          name: string
          prize_id: string
          recipient_name: string
          sponsor_name: string
          user_id: string
          value_kind: string
        }[]
      }
      get_tier_state: {
        Args: { _user: string }
        Returns: {
          career: Json
          categories: Json
          current_tier: string
          highest_tier_earned: string
          next_tier: Json
          tier_earned_at: string
          tier_score: number
          tier_version: string
        }[]
      }
      get_tournament_td_contact: {
        Args: { _tournament_id: string }
        Returns: {
          td_email: string
          td_name: string
          td_phone: string
        }[]
      }
      grant_starter_wardrobe: { Args: { _user: string }; Returns: undefined }
      has_feature: {
        Args: { _feature: string; _user: string }
        Returns: boolean
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_approved_creator: { Args: { _user: string }; Returns: boolean }
      is_approved_director: { Args: { _user: string }; Returns: boolean }
      is_blocked_between: { Args: { _a: string; _b: string }; Returns: boolean }
      is_club_member: {
        Args: { _club_id: string; _user: string }
        Returns: boolean
      }
      is_conversation_member: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      is_course_admin: {
        Args: { _course: string; _user: string }
        Returns: boolean
      }
      is_duel_participant: {
        Args: { _duel: string; _user: string }
        Returns: boolean
      }
      is_event_director: {
        Args: { _tournament: string; _user: string }
        Returns: boolean
      }
      is_event_organizer: {
        Args: { _event: string; _kind: string; _user: string }
        Returns: boolean
      }
      is_owner_only_capability: { Args: { _cap: string }; Returns: boolean }
      is_platform_admin: { Args: { _uid: string }; Returns: boolean }
      is_round_participant: {
        Args: { _round_id: string; _user: string }
        Returns: boolean
      }
      is_tournament_staff: {
        Args: { _tournament: string; _user: string }
        Returns: boolean
      }
      latest_layout_version: { Args: { _layout: string }; Returns: string }
      level_title: { Args: { _level: number }; Returns: string }
      log_admin_override: {
        Args: {
          _action: string
          _entity_id: string
          _entity_type: string
          _new: Json
          _old: Json
          _reason: string
        }
        Returns: string
      }
      may_join_conversation: {
        Args: { _conv: string; _user: string }
        Returns: boolean
      }
      merge_course_pair: {
        Args: { _candidate_id: string; _keep_id: string }
        Returns: string
      }
      merge_duplicate_courses: {
        Args: { _duplicate_id: string; _keep_id: string }
        Returns: string
      }
      my_event_scoring_code: {
        Args: { _tournament_id: string }
        Returns: string
      }
      normalize_course_name: { Args: { _name: string }; Returns: string }
      normalize_us_state: { Args: { _input: string }; Returns: string }
      notify_user: {
        Args: {
          _club_id?: string
          _comment_id?: string
          _data?: Json
          _post_id?: string
          _type: Database["public"]["Enums"]["notification_type"]
          _user_id: string
        }
        Returns: string
      }
      pdga_kb_search_courses: {
        Args: { _limit?: number; _q: string }
        Returns: {
          city: string
          country: string
          designer: string
          hole_count: number
          id: string
          latitude: number
          longitude: number
          name: string
          pdga_course_id: string
          pdga_url: string
          state: string
        }[]
      }
      pdga_kb_search_events: {
        Args: { _limit?: number; _q: string }
        Returns: {
          city: string
          country: string
          course_refs: string[]
          end_date: string
          host_club: string
          id: string
          name: string
          pdga_event_id: string
          pdga_url: string
          start_date: string
          state: string
          tier: string
        }[]
      }
      pdga_kb_search_players: {
        Args: { _limit?: number; _q: string }
        Returns: {
          career_wins: number
          city: string
          class: string
          country: string
          id: string
          name: string
          pdga_number: number
          pdga_url: string
          rating: number
          state: string
        }[]
      }
      pdga_kb_stats: { Args: never; Returns: Json }
      pdga_src_apply: { Args: { p: Json }; Returns: Json }
      people_directory_cards: {
        Args: { _ids: string[] }
        Returns: {
          achievements: number
          active_goals: number
          dgd_rating: number
          goal_progress: number
          goal_target: number
          goal_title: string
          latest_achievement: string
          rated_rounds: number
          user_id: string
        }[]
      }
      player_rating_average: { Args: { _user_id: string }; Returns: number }
      player_rating_details: { Args: { _user_id: string }; Returns: Json }
      prize_can_manage: {
        Args: { _event: string; _kind: string; _user: string }
        Returns: boolean
      }
      progress_aces_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          total: number
          user_id: string
        }[]
      }
      progress_rounds_leaderboard: {
        Args: { _limit?: number }
        Returns: {
          total: number
          user_id: string
        }[]
      }
      publish_due_content_drafts: { Args: never; Returns: number }
      publish_layout: {
        Args: { _layout: string; _summary?: string }
        Returns: number
      }
      record_post_impressions: {
        Args: { _new_viewer?: boolean; _post_ids: string[] }
        Returns: number
      }
      refresh_all_course_intel: { Args: never; Returns: number }
      refresh_all_layout_models: { Args: never; Returns: number }
      refresh_course_intel: {
        Args: { _course_id: string; _course_name: string }
        Returns: undefined
      }
      refresh_course_match_candidates: { Args: never; Returns: number }
      refresh_hole_intel: {
        Args: { _hole_number: number; _layout_id: string }
        Returns: undefined
      }
      refresh_layout_model: { Args: { _layout_id: string }; Returns: undefined }
      reopen_payout_snapshot: {
        Args: { _id: string; _reason: string }
        Returns: undefined
      }
      repost_post: {
        Args: { _body?: string; _post_id: string }
        Returns: string
      }
      resolve_duel: {
        Args: { _duel: string; _winner: string }
        Returns: undefined
      }
      resolve_player_identifier: {
        Args: { _identifier: string }
        Returns: string
      }
      resolve_post_report: {
        Args: { _hide: boolean; _note?: string; _report_id: string }
        Returns: undefined
      }
      respond_course_condition: {
        Args: {
          _note?: string
          _photo?: string
          _report: string
          _response: string
        }
        Returns: string
      }
      review_course_proposal: {
        Args: {
          _approve: boolean
          _id: string
          _note?: string
          _override?: Json
        }
        Returns: string
      }
      review_event_claim: {
        Args: { _approve: boolean; _claim: string; _note: string }
        Returns: undefined
      }
      run_lost_disc_matching: {
        Args: {
          _actor_id: string
          _color: string
          _course_id: string
          _found_report_id: string
          _ink_name: string
          _ink_pdga: number
          _lat: number
          _listing_id: string
          _lng: number
          _mold: string
          _occurred: string
          _weight: number
        }
        Returns: undefined
      }
      save_layout_slots: {
        Args: { _layout: string; _numbering?: string; _slots: Json }
        Returns: undefined
      }
      score_lost_disc_match: {
        Args: {
          _color: string
          _course: string
          _ink_name: string
          _ink_pdga: number
          _lat: number
          _lng: number
          _lost: Database["public"]["Tables"]["lost_disc_reports"]["Row"]
          _mold: string
          _weight: number
          _when: string
        }
        Returns: {
          evidence: Json
          score: number
        }[]
      }
      search_ace_knowledge: {
        Args: { _limit?: number; _query: string; _state?: string }
        Returns: {
          body: string
          kind: string
          rank: number
          region: string
          source: string
          state: string
          title: string
        }[]
      }
      set_course_report_priority: {
        Args: { _priority: string; _report: string }
        Returns: undefined
      }
      set_course_report_state: {
        Args: {
          _note?: string
          _photo?: string
          _report: string
          _state: string
        }
        Returns: undefined
      }
      set_course_status: {
        Args: {
          _course: string
          _hole?: number
          _note?: string
          _playable_days?: number
          _status: string
        }
        Returns: undefined
      }
      set_hole_pin: {
        Args: { _hole: string; _pin: string }
        Returns: undefined
      }
      sync_layout_legacy_holes: {
        Args: { _layout: string }
        Returns: undefined
      }
      tracker_pdga_sync_claim: { Args: { _tourn_id: string }; Returns: Json }
      tracker_pdga_sync_finish: {
        Args: {
          _error: string
          _fingerprint: string
          _interval_seconds: number
          _ok: boolean
          _payload: Json
          _retry_after_seconds: number
          _tourn_id: string
        }
        Returns: undefined
      }
      tracker_round_resolve_course: {
        Args: { _name: string; _state: string }
        Returns: string
      }
      update_streak: { Args: { _user: string }; Returns: undefined }
    }
    Enums: {
      achievement_category:
        | "play"
        | "build"
        | "social"
        | "community"
        | "tournament"
        | "misc"
      achievement_tier: "bronze" | "silver" | "gold" | "platinum"
      ambassador_entity: "course" | "club"
      app_role: "admin" | "moderator" | "user" | "super_admin"
      beta_feedback_kind: "bug" | "idea" | "rating"
      beta_feedback_severity: "blocker" | "major" | "minor" | "cosmetic"
      beta_feedback_status:
        | "new"
        | "triaged"
        | "in_progress"
        | "resolved"
        | "wont_fix"
        | "duplicate"
      challenge_goal_type:
        | "rounds_played"
        | "holes_played"
        | "birdies"
        | "eagles"
        | "aces"
        | "new_courses"
        | "posts_created"
        | "comments_made"
        | "friends_added"
        | "event_attended"
        | "event_hosted"
        | "courses_built"
      challenge_kind: "daily" | "weekly" | "seasonal"
      club_role: "owner" | "admin" | "member"
      community_event_kind:
        | "cleanup"
        | "charity"
        | "group_round"
        | "meetup"
        | "clinic"
      content_draft_kind:
        | "photo"
        | "video"
        | "reel"
        | "news"
        | "recap"
        | "course_spotlight"
        | "ace"
        | "tip"
        | "story"
      content_draft_status:
        | "draft"
        | "scheduled"
        | "published"
        | "archived"
        | "failed"
      contribution_kind:
        | "course_created"
        | "layout_mapped"
        | "hole_pinned"
        | "course_fully_mapped"
        | "course_edit"
        | "course_photo"
        | "tee_sign"
        | "duplicate_merge"
        | "hole_data_verified"
        | "condition_report_verified"
        | "club_created"
        | "event_hosted"
        | "player_invited"
        | "review_credit"
        | "other"
      contribution_status: "pending" | "verified" | "rejected" | "expired"
      course_feature_type:
        | "bench"
        | "gazebo"
        | "tree"
        | "water"
        | "fence"
        | "path"
        | "ob_line"
        | "ob_area"
        | "mando"
        | "dropzone"
        | "restroom"
        | "trash"
        | "parking"
        | "tee_sign"
        | "note"
        | "ob_reference"
        | "course_boundary"
        | "island_green"
        | "entrance"
        | "woods"
        | "tree_line"
        | "tall_grass"
        | "hazard"
      course_report_kind:
        | "fallen_tree"
        | "hazard"
        | "flooding"
        | "construction"
        | "closed"
        | "basket_missing"
        | "basket_moved"
        | "tee_damage"
        | "obstacle"
        | "signage"
        | "other"
      course_report_status: "open" | "confirmed" | "resolved" | "expired"
      course_report_vote_kind: "confirm" | "resolved" | "not_found"
      creator_status: "pending" | "approved" | "rejected" | "revoked"
      creator_tier: "none" | "applicant" | "creator" | "ambassador" | "partner"
      director_status: "pending" | "approved" | "rejected" | "revoked"
      disc_category:
        | "distance_driver"
        | "fairway_driver"
        | "midrange"
        | "putter"
        | "approach"
        | "specialty"
      disc_condition: "new" | "beat_in" | "worn" | "retired"
      disc_plastic_tier:
        | "base"
        | "premium"
        | "premium_glow"
        | "tournament"
        | "special"
      disc_stability:
        | "very_overstable"
        | "overstable"
        | "stable"
        | "understable"
        | "very_understable"
      entity_kind:
        | "course_rating_profile"
        | "course"
        | "tournament"
        | "league"
        | "profile"
      event_invite_kind: "community" | "tournament" | "league" | "round"
      event_invite_rsvp: "none" | "going" | "maybe" | "declined"
      event_invite_status:
        | "pending"
        | "sent"
        | "delivered"
        | "failed"
        | "cancelled"
      event_rsvp_status: "going" | "maybe" | "declined"
      goal_metric:
        | "rounds"
        | "birdies"
        | "rating"
        | "courses_played"
        | "friends"
        | "xp"
        | "round_rating"
        | "scoring_average"
        | "birdie_rate"
        | "course_pr"
      hole_media_kind: "photo" | "drone_video" | "video"
      league_status: "draft" | "active" | "completed" | "cancelled"
      lost_disc_claim_state: "pending" | "confirmed" | "rejected"
      lost_disc_kind: "lost" | "found"
      lost_disc_status: "open" | "matched" | "reunited" | "closed"
      marketplace_flag_status:
        | "open"
        | "dismissed"
        | "warned"
        | "hidden"
        | "connected"
      marketplace_listing_status: "active" | "reserved" | "sold" | "removed"
      moderation_status: "pending" | "approved" | "rejected"
      notification_type:
        | "like"
        | "comment"
        | "follow"
        | "mention"
        | "club_invite"
        | "message"
        | "event"
        | "friend_request"
        | "friend_accept"
        | "score_change"
        | "share"
        | "report_resolved"
      ob_side: "left" | "right" | "none" | "past" | "behind"
      payment_status: "unpaid" | "paid" | "refunded" | "waived"
      post_type:
        | "photo"
        | "text"
        | "video"
        | "ace"
        | "checkin"
        | "roundcard"
        | "tournament"
      post_visibility: "public" | "friends" | "club"
      redemption_status: "pending" | "approved" | "rejected" | "granted"
      registration_status:
        | "pending"
        | "confirmed"
        | "waitlist"
        | "withdrawn"
        | "checked_in"
      revert_request_status: "pending" | "approved" | "rejected"
      round_status: "in_progress" | "completed" | "abandoned"
      rule_status:
        | "draft"
        | "proposed"
        | "under_review"
        | "approved"
        | "published"
        | "superseded"
        | "retired"
      schedule_event_source:
        | "disc_golf_scene"
        | "pdga"
        | "tournament"
        | "league"
        | "manual"
        | "udisc"
      schedule_event_status:
        | "interested"
        | "registered"
        | "waitlisted"
        | "confirmed"
        | "completed"
        | "withdrawn"
        | "cancelled"
      shot_intent:
        | "max_distance"
        | "control"
        | "placement"
        | "safety_off_tee"
        | "approach"
        | "putt"
      shot_shape:
        | "hyzer"
        | "anhyzer"
        | "flat"
        | "flex"
        | "s_curve"
        | "hyzer_flip"
        | "turnover"
        | "spike_hyzer"
        | "skip"
        | "roller"
        | "tomahawk"
        | "thumber"
        | "scoober"
      tournament_format:
        | "stroke_play"
        | "match_play"
        | "best_shot"
        | "doubles"
        | "singles"
      tournament_status:
        | "draft"
        | "published"
        | "registration_open"
        | "registration_closed"
        | "in_progress"
        | "completed"
        | "cancelled"
      verification_vote: "approve" | "reject"
      wardrobe_rarity: "common" | "rare" | "epic" | "legendary"
      wardrobe_slot:
        | "shirt"
        | "shorts"
        | "pants"
        | "shoes"
        | "hat"
        | "glasses"
        | "jacket"
        | "accessory"
        | "bag"
        | "cart"
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
    Enums: {
      achievement_category: [
        "play",
        "build",
        "social",
        "community",
        "tournament",
        "misc",
      ],
      achievement_tier: ["bronze", "silver", "gold", "platinum"],
      ambassador_entity: ["course", "club"],
      app_role: ["admin", "moderator", "user", "super_admin"],
      beta_feedback_kind: ["bug", "idea", "rating"],
      beta_feedback_severity: ["blocker", "major", "minor", "cosmetic"],
      beta_feedback_status: [
        "new",
        "triaged",
        "in_progress",
        "resolved",
        "wont_fix",
        "duplicate",
      ],
      challenge_goal_type: [
        "rounds_played",
        "holes_played",
        "birdies",
        "eagles",
        "aces",
        "new_courses",
        "posts_created",
        "comments_made",
        "friends_added",
        "event_attended",
        "event_hosted",
        "courses_built",
      ],
      challenge_kind: ["daily", "weekly", "seasonal"],
      club_role: ["owner", "admin", "member"],
      community_event_kind: [
        "cleanup",
        "charity",
        "group_round",
        "meetup",
        "clinic",
      ],
      content_draft_kind: [
        "photo",
        "video",
        "reel",
        "news",
        "recap",
        "course_spotlight",
        "ace",
        "tip",
        "story",
      ],
      content_draft_status: [
        "draft",
        "scheduled",
        "published",
        "archived",
        "failed",
      ],
      contribution_kind: [
        "course_created",
        "layout_mapped",
        "hole_pinned",
        "course_fully_mapped",
        "course_edit",
        "course_photo",
        "tee_sign",
        "duplicate_merge",
        "hole_data_verified",
        "condition_report_verified",
        "club_created",
        "event_hosted",
        "player_invited",
        "review_credit",
        "other",
      ],
      contribution_status: ["pending", "verified", "rejected", "expired"],
      course_feature_type: [
        "bench",
        "gazebo",
        "tree",
        "water",
        "fence",
        "path",
        "ob_line",
        "ob_area",
        "mando",
        "dropzone",
        "restroom",
        "trash",
        "parking",
        "tee_sign",
        "note",
        "ob_reference",
        "course_boundary",
        "island_green",
        "entrance",
        "woods",
        "tree_line",
        "tall_grass",
        "hazard",
      ],
      course_report_kind: [
        "fallen_tree",
        "hazard",
        "flooding",
        "construction",
        "closed",
        "basket_missing",
        "basket_moved",
        "tee_damage",
        "obstacle",
        "signage",
        "other",
      ],
      course_report_status: ["open", "confirmed", "resolved", "expired"],
      course_report_vote_kind: ["confirm", "resolved", "not_found"],
      creator_status: ["pending", "approved", "rejected", "revoked"],
      creator_tier: ["none", "applicant", "creator", "ambassador", "partner"],
      director_status: ["pending", "approved", "rejected", "revoked"],
      disc_category: [
        "distance_driver",
        "fairway_driver",
        "midrange",
        "putter",
        "approach",
        "specialty",
      ],
      disc_condition: ["new", "beat_in", "worn", "retired"],
      disc_plastic_tier: [
        "base",
        "premium",
        "premium_glow",
        "tournament",
        "special",
      ],
      disc_stability: [
        "very_overstable",
        "overstable",
        "stable",
        "understable",
        "very_understable",
      ],
      entity_kind: [
        "course_rating_profile",
        "course",
        "tournament",
        "league",
        "profile",
      ],
      event_invite_kind: ["community", "tournament", "league", "round"],
      event_invite_rsvp: ["none", "going", "maybe", "declined"],
      event_invite_status: [
        "pending",
        "sent",
        "delivered",
        "failed",
        "cancelled",
      ],
      event_rsvp_status: ["going", "maybe", "declined"],
      goal_metric: [
        "rounds",
        "birdies",
        "rating",
        "courses_played",
        "friends",
        "xp",
        "round_rating",
        "scoring_average",
        "birdie_rate",
        "course_pr",
      ],
      hole_media_kind: ["photo", "drone_video", "video"],
      league_status: ["draft", "active", "completed", "cancelled"],
      lost_disc_claim_state: ["pending", "confirmed", "rejected"],
      lost_disc_kind: ["lost", "found"],
      lost_disc_status: ["open", "matched", "reunited", "closed"],
      marketplace_flag_status: [
        "open",
        "dismissed",
        "warned",
        "hidden",
        "connected",
      ],
      marketplace_listing_status: ["active", "reserved", "sold", "removed"],
      moderation_status: ["pending", "approved", "rejected"],
      notification_type: [
        "like",
        "comment",
        "follow",
        "mention",
        "club_invite",
        "message",
        "event",
        "friend_request",
        "friend_accept",
        "score_change",
        "share",
        "report_resolved",
      ],
      ob_side: ["left", "right", "none", "past", "behind"],
      payment_status: ["unpaid", "paid", "refunded", "waived"],
      post_type: [
        "photo",
        "text",
        "video",
        "ace",
        "checkin",
        "roundcard",
        "tournament",
      ],
      post_visibility: ["public", "friends", "club"],
      redemption_status: ["pending", "approved", "rejected", "granted"],
      registration_status: [
        "pending",
        "confirmed",
        "waitlist",
        "withdrawn",
        "checked_in",
      ],
      revert_request_status: ["pending", "approved", "rejected"],
      round_status: ["in_progress", "completed", "abandoned"],
      rule_status: [
        "draft",
        "proposed",
        "under_review",
        "approved",
        "published",
        "superseded",
        "retired",
      ],
      schedule_event_source: [
        "disc_golf_scene",
        "pdga",
        "tournament",
        "league",
        "manual",
        "udisc",
      ],
      schedule_event_status: [
        "interested",
        "registered",
        "waitlisted",
        "confirmed",
        "completed",
        "withdrawn",
        "cancelled",
      ],
      shot_intent: [
        "max_distance",
        "control",
        "placement",
        "safety_off_tee",
        "approach",
        "putt",
      ],
      shot_shape: [
        "hyzer",
        "anhyzer",
        "flat",
        "flex",
        "s_curve",
        "hyzer_flip",
        "turnover",
        "spike_hyzer",
        "skip",
        "roller",
        "tomahawk",
        "thumber",
        "scoober",
      ],
      tournament_format: [
        "stroke_play",
        "match_play",
        "best_shot",
        "doubles",
        "singles",
      ],
      tournament_status: [
        "draft",
        "published",
        "registration_open",
        "registration_closed",
        "in_progress",
        "completed",
        "cancelled",
      ],
      verification_vote: ["approve", "reject"],
      wardrobe_rarity: ["common", "rare", "epic", "legendary"],
      wardrobe_slot: [
        "shirt",
        "shorts",
        "pants",
        "shoes",
        "hat",
        "glasses",
        "jacket",
        "accessory",
        "bag",
        "cart",
      ],
    },
  },
} as const
