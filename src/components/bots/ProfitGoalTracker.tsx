import { useState } from 'react';
import { useProfitGoals } from '@/hooks/useProfitGoals';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { 
  Target, 
  Trophy, 
  Flame, 
  ChevronDown, 
  ChevronUp, 
  Settings2, 
  TrendingUp,
  Award,
  Star,
  Zap
} from 'lucide-react';
import { cn } from '@/lib/utils';

const BADGE_ICONS: Record<string, typeof Trophy> = {
  daily_champion: Trophy,
  week_warrior: Award,
  monthly_master: Star,
  consistent_closer: Zap,
  first_100: TrendingUp,
  hot_streak: Flame,
};

const BADGE_COLORS: Record<string, string> = {
  daily_champion: 'text-yellow-500',
  week_warrior: 'text-blue-500',
  monthly_master: 'text-purple-500',
  consistent_closer: 'text-green-500',
  first_100: 'text-orange-500',
  hot_streak: 'text-red-500',
};

interface ProfitGoalTrackerProps {
  className?: string;
  compact?: boolean;
}

export function ProfitGoalTracker({ className, compact = false }: ProfitGoalTrackerProps) {
  const { daily, weekly, monthly, streak, badges, loading, updateGoalTargets } = useProfitGoals();
  const [isOpen, setIsOpen] = useState(!compact);
  const [isEditing, setIsEditing] = useState(false);
  const [editTargets, setEditTargets] = useState({
    daily: daily.target,
    weekly: weekly.target,
    monthly: monthly.target,
  });

  const handleSaveTargets = async () => {
    await updateGoalTargets(editTargets.daily, editTargets.weekly, editTargets.monthly);
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className={cn("card-terminal p-3 animate-pulse", className)}>
        <div className="h-4 bg-muted rounded w-1/3 mb-2" />
        <div className="h-2 bg-muted rounded w-full" />
      </div>
    );
  }

  const goals = [
    { label: 'Daily', data: daily, color: 'bg-green-500' },
    { label: 'Weekly', data: weekly, color: 'bg-blue-500' },
    { label: 'Monthly', data: monthly, color: 'bg-purple-500' },
  ];

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className={cn("card-terminal", className)}>
      <CollapsibleTrigger asChild>
        <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/30 transition-colors">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-primary" />
            <span className="text-sm font-semibold">Profit Goals</span>
            {streak > 0 && (
              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 gap-1">
                <Flame className="w-3 h-3 text-orange-500" />
                {streak} streak
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Mini progress indicators when collapsed */}
            {!isOpen && (
              <div className="flex items-center gap-1">
                {goals.map((goal) => (
                  <div 
                    key={goal.label}
                    className="w-8 h-1.5 bg-muted rounded-full overflow-hidden"
                    title={`${goal.label}: ${goal.data.percent.toFixed(0)}%`}
                  >
                    <div 
                      className={cn("h-full transition-all", goal.color)}
                      style={{ width: `${Math.min(100, goal.data.percent)}%` }}
                    />
                  </div>
                ))}
              </div>
            )}
            {isOpen ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </div>
        </div>
      </CollapsibleTrigger>
      
      <CollapsibleContent>
        <div className="px-3 pb-3 space-y-3">
          {/* Goal Progress Bars */}
          <div className="space-y-2">
            {goals.map((goal) => (
              <div key={goal.label} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">{goal.label}</span>
                  <span className="font-mono">
                    <span className={cn(
                      "font-semibold",
                      goal.data.current >= goal.data.target ? "text-green-500" : "text-foreground"
                    )}>
                      ${goal.data.current.toFixed(2)}
                    </span>
                    <span className="text-muted-foreground"> / ${goal.data.target}</span>
                  </span>
                </div>
                <div className="relative">
                  <Progress 
                    value={goal.data.percent} 
                    className="h-2"
                  />
                  {goal.data.percent >= 100 && (
                    <Trophy className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 text-yellow-500" />
                  )}
                </div>
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{goal.data.tradesCount} trades</span>
                  <span>{goal.data.percent.toFixed(0)}%</span>
                </div>
              </div>
            ))}
          </div>

          {/* Badges Section */}
          {badges.length > 0 && (
            <div className="pt-2 border-t border-border/50">
              <p className="text-xs text-muted-foreground mb-2">Achievements</p>
              <div className="flex flex-wrap gap-1">
                {badges.slice(0, 6).map((badge) => {
                  const Icon = BADGE_ICONS[badge.badge_type] || Trophy;
                  const colorClass = BADGE_COLORS[badge.badge_type] || 'text-primary';
                  return (
                    <Badge 
                      key={badge.id} 
                      variant="outline" 
                      className="text-[10px] px-1.5 py-0.5 gap-1"
                      title={`Earned: ${new Date(badge.earned_at).toLocaleDateString()}`}
                    >
                      <Icon className={cn("w-3 h-3", colorClass)} />
                      {badge.badge_name}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* Edit Targets */}
          {isEditing ? (
            <div className="pt-2 border-t border-border/50 space-y-2">
              <p className="text-xs text-muted-foreground">Edit Targets</p>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[10px] text-muted-foreground">Daily</label>
                  <Input
                    type="number"
                    value={editTargets.daily}
                    onChange={(e) => setEditTargets(prev => ({ ...prev, daily: Number(e.target.value) }))}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Weekly</label>
                  <Input
                    type="number"
                    value={editTargets.weekly}
                    onChange={(e) => setEditTargets(prev => ({ ...prev, weekly: Number(e.target.value) }))}
                    className="h-7 text-xs"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-muted-foreground">Monthly</label>
                  <Input
                    type="number"
                    value={editTargets.monthly}
                    onChange={(e) => setEditTargets(prev => ({ ...prev, monthly: Number(e.target.value) }))}
                    className="h-7 text-xs"
                  />
                </div>
              </div>
              <div className="flex gap-2">
                <Button size="sm" className="h-6 text-xs flex-1" onClick={handleSaveTargets}>
                  Save
                </Button>
                <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <Button
              size="sm"
              variant="ghost"
              className="w-full h-6 text-xs text-muted-foreground hover:text-foreground"
              onClick={() => {
                setEditTargets({ daily: daily.target, weekly: weekly.target, monthly: monthly.target });
                setIsEditing(true);
              }}
            >
              <Settings2 className="w-3 h-3 mr-1" />
              Edit Targets
            </Button>
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}