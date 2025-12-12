
-- Bot execution tracking
CREATE TABLE public.bot_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  bot_name TEXT NOT NULL,
  mode TEXT NOT NULL DEFAULT 'spot',
  daily_target NUMERIC DEFAULT 30,
  profit_per_trade NUMERIC DEFAULT 1,
  status TEXT DEFAULT 'stopped',
  current_pnl NUMERIC DEFAULT 0,
  trades_executed INT DEFAULT 0,
  hit_rate NUMERIC DEFAULT 0,
  max_drawdown NUMERIC DEFAULT 0,
  started_at TIMESTAMPTZ,
  stopped_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Strategy executions for Auto Earn
CREATE TABLE public.strategy_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  strategy_name TEXT NOT NULL,
  exchange TEXT NOT NULL,
  status TEXT DEFAULT 'idle',
  deployed_usdt NUMERIC DEFAULT 0,
  total_profit NUMERIC DEFAULT 0,
  daily_profit NUMERIC DEFAULT 0,
  risk_level TEXT DEFAULT 'medium',
  started_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Wallet connections for DeFi
CREATE TABLE public.wallet_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  wallet_type TEXT NOT NULL,
  address TEXT NOT NULL,
  chain TEXT,
  is_connected BOOLEAN DEFAULT true,
  connected_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Backtest runs for Sandbox
CREATE TABLE public.backtest_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  asset TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  initial_balance NUMERIC DEFAULT 10000,
  final_balance NUMERIC,
  total_pnl NUMERIC,
  total_trades INT DEFAULT 0,
  win_rate NUMERIC,
  max_drawdown NUMERIC,
  sharpe_ratio NUMERIC,
  status TEXT DEFAULT 'pending',
  results JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ
);

-- Enable RLS on all tables
ALTER TABLE public.bot_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategy_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.backtest_runs ENABLE ROW LEVEL SECURITY;

-- RLS policies for bot_runs
CREATE POLICY "Users can view their own bot runs" ON public.bot_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own bot runs" ON public.bot_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own bot runs" ON public.bot_runs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own bot runs" ON public.bot_runs FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for strategy_executions
CREATE POLICY "Users can view their own strategies" ON public.strategy_executions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own strategies" ON public.strategy_executions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own strategies" ON public.strategy_executions FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own strategies" ON public.strategy_executions FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for wallet_connections
CREATE POLICY "Users can view their own wallets" ON public.wallet_connections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own wallets" ON public.wallet_connections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own wallets" ON public.wallet_connections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own wallets" ON public.wallet_connections FOR DELETE USING (auth.uid() = user_id);

-- RLS policies for backtest_runs
CREATE POLICY "Users can view their own backtests" ON public.backtest_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own backtests" ON public.backtest_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update their own backtests" ON public.backtest_runs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete their own backtests" ON public.backtest_runs FOR DELETE USING (auth.uid() = user_id);

-- Triggers for updated_at
CREATE TRIGGER update_bot_runs_updated_at BEFORE UPDATE ON public.bot_runs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_strategy_executions_updated_at BEFORE UPDATE ON public.strategy_executions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
