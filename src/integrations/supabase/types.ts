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
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
      alerts: {
        Row: {
          alert_type: string
          created_at: string
          data: Json | null
          id: string
          is_read: boolean | null
          message: string | null
          title: string
          user_id: string
        }
        Insert: {
          alert_type: string
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title: string
          user_id: string
        }
        Update: {
          alert_type?: string
          created_at?: string
          data?: Json | null
          id?: string
          is_read?: boolean | null
          message?: string | null
          title?: string
          user_id?: string
        }
        Relationships: []
      }
      arbitrage_opportunities: {
        Row: {
          buy_exchange: string
          buy_price: number
          created_at: string
          expires_at: string
          id: string
          pair: string
          profit_percentage: number
          sell_exchange: string
          sell_price: number
          volume_24h: number | null
        }
        Insert: {
          buy_exchange: string
          buy_price: number
          created_at?: string
          expires_at: string
          id?: string
          pair: string
          profit_percentage: number
          sell_exchange: string
          sell_price: number
          volume_24h?: number | null
        }
        Update: {
          buy_exchange?: string
          buy_price?: number
          created_at?: string
          expires_at?: string
          id?: string
          pair?: string
          profit_percentage?: number
          sell_exchange?: string
          sell_price?: number
          volume_24h?: number | null
        }
        Relationships: []
      }
      backtest_runs: {
        Row: {
          asset: string
          completed_at: string | null
          created_at: string | null
          end_date: string
          final_balance: number | null
          id: string
          initial_balance: number | null
          max_drawdown: number | null
          results: Json | null
          sharpe_ratio: number | null
          start_date: string
          status: string | null
          total_pnl: number | null
          total_trades: number | null
          user_id: string
          win_rate: number | null
        }
        Insert: {
          asset: string
          completed_at?: string | null
          created_at?: string | null
          end_date: string
          final_balance?: number | null
          id?: string
          initial_balance?: number | null
          max_drawdown?: number | null
          results?: Json | null
          sharpe_ratio?: number | null
          start_date: string
          status?: string | null
          total_pnl?: number | null
          total_trades?: number | null
          user_id: string
          win_rate?: number | null
        }
        Update: {
          asset?: string
          completed_at?: string | null
          created_at?: string | null
          end_date?: string
          final_balance?: number | null
          id?: string
          initial_balance?: number | null
          max_drawdown?: number | null
          results?: Json | null
          sharpe_ratio?: number | null
          start_date?: string
          status?: string | null
          total_pnl?: number | null
          total_trades?: number | null
          user_id?: string
          win_rate?: number | null
        }
        Relationships: []
      }
      bot_config: {
        Row: {
          amount_per_trade: number
          auto_withdraw_on_target: boolean | null
          created_at: string | null
          daily_stop_loss: number
          daily_target: number
          focus_pairs: string[] | null
          id: string
          leverage_defaults: Json | null
          min_profit_threshold: number
          per_trade_stop_loss: number
          profit_per_trade: number
          trade_interval_ms: number
          updated_at: string | null
          user_id: string
        }
        Insert: {
          amount_per_trade?: number
          auto_withdraw_on_target?: boolean | null
          created_at?: string | null
          daily_stop_loss?: number
          daily_target?: number
          focus_pairs?: string[] | null
          id?: string
          leverage_defaults?: Json | null
          min_profit_threshold?: number
          per_trade_stop_loss?: number
          profit_per_trade?: number
          trade_interval_ms?: number
          updated_at?: string | null
          user_id: string
        }
        Update: {
          amount_per_trade?: number
          auto_withdraw_on_target?: boolean | null
          created_at?: string | null
          daily_stop_loss?: number
          daily_target?: number
          focus_pairs?: string[] | null
          id?: string
          leverage_defaults?: Json | null
          min_profit_threshold?: number
          per_trade_stop_loss?: number
          profit_per_trade?: number
          trade_interval_ms?: number
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      bot_runs: {
        Row: {
          analysis_report: Json | null
          bot_name: string
          created_at: string | null
          current_pnl: number | null
          daily_target: number | null
          hit_rate: number | null
          id: string
          is_sandbox: boolean | null
          max_drawdown: number | null
          mode: string
          profit_per_trade: number | null
          profits_withdrawn: number | null
          started_at: string | null
          status: string | null
          stopped_at: string | null
          trades_executed: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          analysis_report?: Json | null
          bot_name: string
          created_at?: string | null
          current_pnl?: number | null
          daily_target?: number | null
          hit_rate?: number | null
          id?: string
          is_sandbox?: boolean | null
          max_drawdown?: number | null
          mode?: string
          profit_per_trade?: number | null
          profits_withdrawn?: number | null
          started_at?: string | null
          status?: string | null
          stopped_at?: string | null
          trades_executed?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          analysis_report?: Json | null
          bot_name?: string
          created_at?: string | null
          current_pnl?: number | null
          daily_target?: number | null
          hit_rate?: number | null
          id?: string
          is_sandbox?: boolean | null
          max_drawdown?: number | null
          mode?: string
          profit_per_trade?: number | null
          profits_withdrawn?: number | null
          started_at?: string | null
          status?: string | null
          stopped_at?: string | null
          trades_executed?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      chart_drawings: {
        Row: {
          created_at: string | null
          data: Json
          id: string
          symbol: string
          tool_type: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          id?: string
          symbol: string
          tool_type: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          id?: string
          symbol?: string
          tool_type?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          context: Json | null
          created_at: string | null
          id: string
          level: string
          message: string
          page_url: string | null
          stack: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          id?: string
          level: string
          message: string
          page_url?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          id?: string
          level?: string
          message?: string
          page_url?: string | null
          stack?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      exchange_connections: {
        Row: {
          api_key_hash: string | null
          created_at: string
          encrypted_api_key: string | null
          encrypted_api_secret: string | null
          encrypted_passphrase: string | null
          encryption_iv: string | null
          exchange_name: string
          exchange_uid: string | null
          id: string
          is_connected: boolean | null
          last_verified_at: string | null
          permissions: string[] | null
          updated_at: string
          user_id: string
        }
        Insert: {
          api_key_hash?: string | null
          created_at?: string
          encrypted_api_key?: string | null
          encrypted_api_secret?: string | null
          encrypted_passphrase?: string | null
          encryption_iv?: string | null
          exchange_name: string
          exchange_uid?: string | null
          id?: string
          is_connected?: boolean | null
          last_verified_at?: string | null
          permissions?: string[] | null
          updated_at?: string
          user_id: string
        }
        Update: {
          api_key_hash?: string | null
          created_at?: string
          encrypted_api_key?: string | null
          encrypted_api_secret?: string | null
          encrypted_passphrase?: string | null
          encryption_iv?: string | null
          exchange_name?: string
          exchange_uid?: string | null
          id?: string
          is_connected?: boolean | null
          last_verified_at?: string | null
          permissions?: string[] | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      kill_events: {
        Row: {
          bots_killed: number | null
          config_snapshot: Json | null
          created_at: string | null
          id: string
          positions_closed: Json | null
          reason: string
          threshold_used: number
          total_loss_locked: number | null
          total_usdt_recovered: number | null
          trigger_pnl: number
          user_id: string
        }
        Insert: {
          bots_killed?: number | null
          config_snapshot?: Json | null
          created_at?: string | null
          id?: string
          positions_closed?: Json | null
          reason: string
          threshold_used: number
          total_loss_locked?: number | null
          total_usdt_recovered?: number | null
          trigger_pnl: number
          user_id: string
        }
        Update: {
          bots_killed?: number | null
          config_snapshot?: Json | null
          created_at?: string | null
          id?: string
          positions_closed?: Json | null
          reason?: string
          threshold_used?: number
          total_loss_locked?: number | null
          total_usdt_recovered?: number | null
          trigger_pnl?: number
          user_id?: string
        }
        Relationships: []
      }
      ml_models: {
        Row: {
          accuracy: number | null
          created_at: string | null
          id: string
          last_trained_at: string | null
          model_type: string
          training_samples: number | null
          updated_at: string | null
          user_id: string
          weights: Json
        }
        Insert: {
          accuracy?: number | null
          created_at?: string | null
          id?: string
          last_trained_at?: string | null
          model_type?: string
          training_samples?: number | null
          updated_at?: string | null
          user_id: string
          weights?: Json
        }
        Update: {
          accuracy?: number | null
          created_at?: string | null
          id?: string
          last_trained_at?: string | null
          model_type?: string
          training_samples?: number | null
          updated_at?: string | null
          user_id?: string
          weights?: Json
        }
        Relationships: []
      }
      news_cache: {
        Row: {
          assets: string[] | null
          category: string | null
          fetched_at: string | null
          id: string
          image_url: string | null
          published_at: string
          source: string
          summary: string | null
          title: string
          url: string | null
        }
        Insert: {
          assets?: string[] | null
          category?: string | null
          fetched_at?: string | null
          id?: string
          image_url?: string | null
          published_at: string
          source: string
          summary?: string | null
          title: string
          url?: string | null
        }
        Update: {
          assets?: string[] | null
          category?: string | null
          fetched_at?: string | null
          id?: string
          image_url?: string | null
          published_at?: string
          source?: string
          summary?: string | null
          title?: string
          url?: string | null
        }
        Relationships: []
      }
      paper_test_runs: {
        Row: {
          ai_analysis: Json | null
          avg_confluence: number | null
          avg_signal_score: number | null
          created_at: string
          failed_trades_breakdown: Json | null
          hit_rate: number
          id: string
          losses: number
          min_confluence: number
          min_signal_score: number
          min_volume_ratio: number
          num_trades: number
          passed: boolean
          target_hit_rate: number
          total_pnl: number
          total_trades: number
          trades_skipped: number
          user_id: string
          wins: number
        }
        Insert: {
          ai_analysis?: Json | null
          avg_confluence?: number | null
          avg_signal_score?: number | null
          created_at?: string
          failed_trades_breakdown?: Json | null
          hit_rate?: number
          id?: string
          losses?: number
          min_confluence?: number
          min_signal_score?: number
          min_volume_ratio?: number
          num_trades?: number
          passed?: boolean
          target_hit_rate?: number
          total_pnl?: number
          total_trades?: number
          trades_skipped?: number
          user_id: string
          wins?: number
        }
        Update: {
          ai_analysis?: Json | null
          avg_confluence?: number | null
          avg_signal_score?: number | null
          created_at?: string
          failed_trades_breakdown?: Json | null
          hit_rate?: number
          id?: string
          losses?: number
          min_confluence?: number
          min_signal_score?: number
          min_volume_ratio?: number
          num_trades?: number
          passed?: boolean
          target_hit_rate?: number
          total_pnl?: number
          total_trades?: number
          trades_skipped?: number
          user_id?: string
          wins?: number
        }
        Relationships: []
      }
      portfolio_holdings: {
        Row: {
          asset_symbol: string
          average_buy_price: number | null
          created_at: string
          exchange_name: string | null
          id: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          asset_symbol: string
          average_buy_price?: number | null
          created_at?: string
          exchange_name?: string | null
          id?: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          asset_symbol?: string
          average_buy_price?: number | null
          created_at?: string
          exchange_name?: string | null
          id?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      price_cache: {
        Row: {
          change_24h: number | null
          id: string
          last_updated: string
          market_cap: number | null
          price: number
          symbol: string
          volume_24h: number | null
        }
        Insert: {
          change_24h?: number | null
          id?: string
          last_updated?: string
          market_cap?: number | null
          price: number
          symbol: string
          volume_24h?: number | null
        }
        Update: {
          change_24h?: number | null
          id?: string
          last_updated?: string
          market_cap?: number | null
          price?: number
          symbol?: string
          volume_24h?: number | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          display_name: string | null
          id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          display_name?: string | null
          id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profit_audit_log: {
        Row: {
          action: string
          balance_available: number | null
          created_at: string
          credential_found: boolean | null
          current_price: number | null
          entry_price: number | null
          error_message: string | null
          exchange: string
          exchange_response: Json | null
          fees: number | null
          gross_pnl: number | null
          id: string
          lot_size_used: string | null
          net_pnl: number | null
          oco_status: string | null
          quantity: number | null
          quantity_sent: string | null
          success: boolean | null
          symbol: string
          trade_id: string | null
          user_id: string
        }
        Insert: {
          action: string
          balance_available?: number | null
          created_at?: string
          credential_found?: boolean | null
          current_price?: number | null
          entry_price?: number | null
          error_message?: string | null
          exchange: string
          exchange_response?: Json | null
          fees?: number | null
          gross_pnl?: number | null
          id?: string
          lot_size_used?: string | null
          net_pnl?: number | null
          oco_status?: string | null
          quantity?: number | null
          quantity_sent?: string | null
          success?: boolean | null
          symbol: string
          trade_id?: string | null
          user_id: string
        }
        Update: {
          action?: string
          balance_available?: number | null
          created_at?: string
          credential_found?: boolean | null
          current_price?: number | null
          entry_price?: number | null
          error_message?: string | null
          exchange?: string
          exchange_response?: Json | null
          fees?: number | null
          gross_pnl?: number | null
          id?: string
          lot_size_used?: string | null
          net_pnl?: number | null
          oco_status?: string | null
          quantity?: number | null
          quantity_sent?: string | null
          success?: boolean | null
          symbol?: string
          trade_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profit_audit_log_trade_id_fkey"
            columns: ["trade_id"]
            isOneToOne: false
            referencedRelation: "trades"
            referencedColumns: ["id"]
          },
        ]
      }
      research_articles: {
        Row: {
          assets: string[] | null
          author: string
          content: string | null
          created_at: string | null
          external_url: string | null
          id: string
          published_at: string | null
          source: string | null
          summary: string | null
          tags: string[] | null
          tier: string | null
          title: string
        }
        Insert: {
          assets?: string[] | null
          author: string
          content?: string | null
          created_at?: string | null
          external_url?: string | null
          id?: string
          published_at?: string | null
          source?: string | null
          summary?: string | null
          tags?: string[] | null
          tier?: string | null
          title: string
        }
        Update: {
          assets?: string[] | null
          author?: string
          content?: string | null
          created_at?: string | null
          external_url?: string | null
          id?: string
          published_at?: string | null
          source?: string | null
          summary?: string | null
          tags?: string[] | null
          tier?: string | null
          title?: string
        }
        Relationships: []
      }
      strategy_executions: {
        Row: {
          created_at: string | null
          daily_profit: number | null
          deployed_usdt: number | null
          exchange: string
          id: string
          risk_level: string | null
          started_at: string | null
          status: string | null
          strategy_name: string
          total_profit: number | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          daily_profit?: number | null
          deployed_usdt?: number | null
          exchange: string
          id?: string
          risk_level?: string | null
          started_at?: string | null
          status?: string | null
          strategy_name: string
          total_profit?: number | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          daily_profit?: number | null
          deployed_usdt?: number | null
          exchange?: string
          id?: string
          risk_level?: string | null
          started_at?: string | null
          status?: string | null
          strategy_name?: string
          total_profit?: number | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          created_at: string
          ends_at: string | null
          id: string
          plan: string
          starts_at: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          ends_at?: string | null
          id?: string
          plan?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          ends_at?: string | null
          id?: string
          plan?: string
          starts_at?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      trades: {
        Row: {
          amount: number
          closed_at: string | null
          created_at: string
          direction: string
          entry_price: number
          exchange_name: string | null
          exit_price: number | null
          id: string
          is_sandbox: boolean | null
          leverage: number | null
          pair: string
          profit_loss: number | null
          profit_percentage: number | null
          status: string | null
          user_id: string
        }
        Insert: {
          amount: number
          closed_at?: string | null
          created_at?: string
          direction: string
          entry_price: number
          exchange_name?: string | null
          exit_price?: number | null
          id?: string
          is_sandbox?: boolean | null
          leverage?: number | null
          pair: string
          profit_loss?: number | null
          profit_percentage?: number | null
          status?: string | null
          user_id: string
        }
        Update: {
          amount?: number
          closed_at?: string | null
          created_at?: string
          direction?: string
          entry_price?: number
          exchange_name?: string | null
          exit_price?: number | null
          id?: string
          is_sandbox?: boolean | null
          leverage?: number | null
          pair?: string
          profit_loss?: number | null
          profit_percentage?: number | null
          status?: string | null
          user_id?: string
        }
        Relationships: []
      }
      usage_limits: {
        Row: {
          created_at: string
          date: string
          id: string
          signals_used: number
          trades_used: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          date?: string
          id?: string
          signals_used?: number
          trades_used?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          date?: string
          id?: string
          signals_used?: number
          trades_used?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          created_at: string
          id: string
          notification_sounds: boolean | null
          profit_threshold: number | null
          push_notifications: boolean | null
          theme: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notification_sounds?: boolean | null
          profit_threshold?: number | null
          push_notifications?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notification_sounds?: boolean | null
          profit_threshold?: number | null
          push_notifications?: boolean | null
          theme?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_watchlists: {
        Row: {
          created_at: string | null
          id: string
          name: string
          symbols: string[] | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name?: string
          symbols?: string[] | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          symbols?: string[] | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      wallet_connections: {
        Row: {
          address: string
          chain: string | null
          connected_at: string | null
          created_at: string | null
          id: string
          is_connected: boolean | null
          user_id: string
          wallet_type: string
        }
        Insert: {
          address: string
          chain?: string | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          user_id: string
          wallet_type: string
        }
        Update: {
          address?: string
          chain?: string | null
          connected_at?: string | null
          created_at?: string | null
          id?: string
          is_connected?: boolean | null
          user_id?: string
          wallet_type?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "trader" | "viewer" | "super_admin"
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
    Enums: {
      app_role: ["admin", "trader", "viewer", "super_admin"],
    },
  },
} as const
