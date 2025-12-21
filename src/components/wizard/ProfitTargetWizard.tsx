import { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useProfitTargetWizard, WizardStep } from '@/hooks/useProfitTargetWizard';
import { Wallet, TrendingUp, Shield, CheckCircle, ChevronLeft, ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface ProfitTargetWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const STEPS: { id: WizardStep; title: string; icon: typeof Wallet }[] = [
  { id: 'balances', title: 'Exchange Balances', icon: Wallet },
  { id: 'performance', title: 'Historical Performance', icon: TrendingUp },
  { id: 'risk', title: 'Risk Preferences', icon: Shield },
  { id: 'review', title: 'Review & Apply', icon: CheckCircle },
];

export function ProfitTargetWizard({ open, onOpenChange }: ProfitTargetWizardProps) {
  const wizard = useProfitTargetWizard();
  
  const currentStepIndex = STEPS.findIndex(s => s.id === wizard.currentStep);
  const progressPercent = ((currentStepIndex + 1) / STEPS.length) * 100;

  useEffect(() => {
    if (open && wizard.currentStep === 'balances' && wizard.balances.length === 0) {
      wizard.fetchBalances();
    }
  }, [open]);

  useEffect(() => {
    if (wizard.currentStep === 'performance' && !wizard.performance) {
      wizard.analyzePerformance();
    }
  }, [wizard.currentStep]);

  useEffect(() => {
    if (wizard.currentStep === 'review' && !wizard.recommendation) {
      wizard.calculateRecommendation();
    }
  }, [wizard.currentStep]);

  const handleApply = async () => {
    const success = await wizard.applyConfiguration();
    if (success) {
      wizard.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            Profit Target Wizard
          </DialogTitle>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            {STEPS.map((step, i) => (
              <div key={step.id} className="flex items-center">
                <div 
                  className={cn(
                    'w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors',
                    i <= currentStepIndex 
                      ? 'bg-primary text-primary-foreground' 
                      : 'bg-muted text-muted-foreground'
                  )}
                >
                  {i < currentStepIndex ? <CheckCircle className="w-4 h-4" /> : i + 1}
                </div>
                {i < STEPS.length - 1 && (
                  <div className={cn(
                    'h-0.5 w-12 mx-1',
                    i < currentStepIndex ? 'bg-primary' : 'bg-muted'
                  )} />
                )}
              </div>
            ))}
          </div>
          <Progress value={progressPercent} className="h-1" />
        </div>

        {/* Step Content */}
        <div className="min-h-[300px]">
          {wizard.currentStep === 'balances' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Your Exchange Balances</h3>
              <p className="text-sm text-muted-foreground">
                We'll use your current balances to recommend optimal targets.
              </p>
              
              {wizard.loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : wizard.balances.length === 0 ? (
                <Card className="bg-muted/30">
                  <CardContent className="py-8 text-center">
                    <Wallet className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No balances found. Connect an exchange in Settings.</p>
                    <Button variant="outline" className="mt-4" onClick={wizard.fetchBalances}>
                      Retry
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {wizard.balances.map((b, i) => (
                    <div key={i} className="flex items-center justify-between p-3 rounded-lg bg-muted/30 border border-border/50">
                      <div>
                        <span className="font-medium">{b.asset}</span>
                        <span className="text-muted-foreground text-sm ml-2">on {b.exchange}</span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono">{b.available.toFixed(4)}</div>
                        <div className="text-sm text-muted-foreground">${b.usdValue.toFixed(2)}</div>
                      </div>
                    </div>
                  ))}
                  <div className="flex items-center justify-between p-3 rounded-lg bg-primary/10 border border-primary/30">
                    <span className="font-semibold">Total Balance</span>
                    <span className="font-bold text-lg">${wizard.totalBalance.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {wizard.currentStep === 'performance' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Historical Performance</h3>
              <p className="text-sm text-muted-foreground">
                Your last 30 days of trading data helps us optimize your targets.
              </p>
              
              {wizard.loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                </div>
              ) : wizard.performance ? (
                <div className="grid grid-cols-2 gap-4">
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Total Trades</div>
                      <div className="text-2xl font-bold">{wizard.performance.totalTrades}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Win Rate</div>
                      <div className={cn('text-2xl font-bold', wizard.performance.winRate >= 60 ? 'text-green-500' : 'text-orange-500')}>
                        {wizard.performance.winRate.toFixed(1)}%
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Total P&L</div>
                      <div className={cn('text-2xl font-bold', wizard.performance.totalPnL >= 0 ? 'text-green-500' : 'text-destructive')}>
                        ${wizard.performance.totalPnL.toFixed(2)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Avg Daily P&L</div>
                      <div className={cn('text-2xl font-bold', wizard.performance.avgDailyPnL >= 0 ? 'text-green-500' : 'text-destructive')}>
                        ${wizard.performance.avgDailyPnL.toFixed(2)}
                      </div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Trading Days</div>
                      <div className="text-2xl font-bold">{wizard.performance.tradingDays}</div>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <div className="text-sm text-muted-foreground">Max Drawdown</div>
                      <div className="text-2xl font-bold text-orange-500">
                        ${wizard.performance.maxDrawdown.toFixed(2)}
                      </div>
                    </CardContent>
                  </Card>
                </div>
              ) : null}
            </div>
          )}

          {wizard.currentStep === 'risk' && (
            <div className="space-y-6">
              <h3 className="text-lg font-semibold">Risk Preferences</h3>
              <p className="text-sm text-muted-foreground">
                Set your risk tolerance to customize your targets.
              </p>
              
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium mb-3 block">Risk Level</label>
                  <div className="flex gap-2">
                    {(['conservative', 'moderate', 'aggressive'] as const).map(level => (
                      <Button
                        key={level}
                        variant={wizard.riskPreferences.riskLevel === level ? 'default' : 'outline'}
                        className="flex-1 capitalize"
                        onClick={() => wizard.setRiskPreferences({ ...wizard.riskPreferences, riskLevel: level })}
                      >
                        {level === 'conservative' && '🐢 '}
                        {level === 'moderate' && '⚖️ '}
                        {level === 'aggressive' && '🚀 '}
                        {level}
                      </Button>
                    ))}
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-3 block">
                    Max Daily Loss: ${wizard.riskPreferences.maxDailyLoss}
                  </label>
                  <Slider
                    value={[wizard.riskPreferences.maxDailyLoss]}
                    min={5}
                    max={50}
                    step={5}
                    onValueChange={([v]) => wizard.setRiskPreferences({ ...wizard.riskPreferences, maxDailyLoss: v })}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>$5</span>
                    <span>$50</span>
                  </div>
                </div>
                
                <div>
                  <label className="text-sm font-medium mb-3 block">
                    Max Trades Per Day: {wizard.riskPreferences.maxTradesPerDay}
                  </label>
                  <Slider
                    value={[wizard.riskPreferences.maxTradesPerDay]}
                    min={10}
                    max={200}
                    step={10}
                    onValueChange={([v]) => wizard.setRiskPreferences({ ...wizard.riskPreferences, maxTradesPerDay: v })}
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>10</span>
                    <span>200</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {wizard.currentStep === 'review' && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">AI Recommendation</h3>
              
              {wizard.loading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-primary" />
                  <span className="ml-2 text-muted-foreground">Calculating optimal targets...</span>
                </div>
              ) : wizard.recommendation ? (
                <div className="space-y-4">
                  <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/30">
                    <CardContent className="py-6">
                      <div className="grid grid-cols-3 gap-4 text-center">
                        <div>
                          <div className="text-sm text-muted-foreground">Daily Target</div>
                          <div className="text-3xl font-bold text-primary">${wizard.recommendation.dailyTarget}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Per Trade</div>
                          <div className="text-3xl font-bold">${wizard.recommendation.profitPerTrade.toFixed(2)}</div>
                        </div>
                        <div>
                          <div className="text-sm text-muted-foreground">Trades Needed</div>
                          <div className="text-3xl font-bold">{wizard.recommendation.tradesNeeded}</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <div className="p-4 rounded-lg bg-muted/30 border border-border/50">
                    <div className="flex items-center gap-2 mb-2">
                      <Badge variant="secondary">
                        {wizard.recommendation.confidence.toFixed(0)}% Confidence
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{wizard.recommendation.reasoning}</p>
                  </div>
                  
                  <div className="space-y-2">
                    <h4 className="font-medium">Configuration Summary</h4>
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div className="p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground">Total Balance:</span>
                        <span className="float-right font-medium">${wizard.totalBalance.toFixed(2)}</span>
                      </div>
                      <div className="p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground">Risk Level:</span>
                        <span className="float-right font-medium capitalize">{wizard.riskPreferences.riskLevel}</span>
                      </div>
                      <div className="p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground">Max Daily Loss:</span>
                        <span className="float-right font-medium">${wizard.riskPreferences.maxDailyLoss}</span>
                      </div>
                      <div className="p-2 rounded bg-muted/30">
                        <span className="text-muted-foreground">Win Rate:</span>
                        <span className="float-right font-medium">{wizard.performance?.winRate.toFixed(1) || 'N/A'}%</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>

        {/* Navigation */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="outline"
            onClick={wizard.prevStep}
            disabled={currentStepIndex === 0}
          >
            <ChevronLeft className="w-4 h-4 mr-1" />
            Back
          </Button>
          
          {currentStepIndex < STEPS.length - 1 ? (
            <Button onClick={wizard.nextStep}>
              Next
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          ) : (
            <Button onClick={handleApply} disabled={wizard.loading || !wizard.recommendation}>
              {wizard.loading ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle className="w-4 h-4 mr-1" />}
              Apply Configuration
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
