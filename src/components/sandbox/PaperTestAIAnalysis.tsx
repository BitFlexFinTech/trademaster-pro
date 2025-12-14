import { useState } from 'react';
import { Brain, Lightbulb, ArrowRight, Loader2, CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { PaperTestResult, ThresholdConfig } from '@/lib/sandbox/types';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AIAnalysisResult {
  summary: string;
  rootCauses: string[];
  recommendations: Array<{
    field: string;
    currentValue: number;
    suggestedValue: number;
    reason: string;
    expectedImpact: string;
  }>;
  expectedHitRate: number;
  tradeReduction: number;
}

interface PaperTestAIAnalysisProps {
  testResult: PaperTestResult | null;
  currentThresholds: ThresholdConfig;
  onApplyThresholds: (thresholds: ThresholdConfig) => void;
  className?: string;
}

export function PaperTestAIAnalysis({ 
  testResult, 
  currentThresholds,
  onApplyThresholds,
  className 
}: PaperTestAIAnalysisProps) {
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);

  const runAnalysis = async () => {
    if (!testResult) return;
    
    setAnalyzing(true);
    try {
      const { data, error } = await supabase.functions.invoke('analyze-paper-test', {
        body: {
          testResult,
          currentThresholds,
        },
      });

      if (error) throw error;
      setAnalysis(data.analysis);
    } catch (err) {
      console.error('AI analysis failed:', err);
      toast.error('Analysis failed', { description: 'Could not analyze test results' });
    } finally {
      setAnalyzing(false);
    }
  };

  const applyRecommendations = () => {
    if (!analysis) return;

    const newThresholds: ThresholdConfig = { ...currentThresholds };
    
    analysis.recommendations.forEach(rec => {
      if (rec.field === 'minSignalScore') {
        newThresholds.minSignalScore = rec.suggestedValue;
      } else if (rec.field === 'minConfluence') {
        newThresholds.minConfluence = rec.suggestedValue;
      } else if (rec.field === 'minVolumeRatio') {
        newThresholds.minVolumeRatio = rec.suggestedValue;
      }
    });

    onApplyThresholds(newThresholds);
    toast.success('Thresholds Applied', { 
      description: `Expected hit rate: ${analysis.expectedHitRate.toFixed(1)}%` 
    });
  };

  if (!testResult) {
    return (
      <div className={cn("card-terminal p-4", className)}>
        <div className="flex items-center gap-2 mb-3">
          <Brain className="w-4 h-4 text-muted-foreground" />
          <h3 className="font-semibold text-foreground">AI Analysis</h3>
        </div>
        <p className="text-sm text-muted-foreground text-center py-4">
          Run a paper test to get AI-powered analysis
        </p>
      </div>
    );
  }

  return (
    <div className={cn("card-terminal p-4", className)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          <h3 className="font-semibold text-foreground">AI Analysis</h3>
        </div>
        {!analysis && (
          <Button 
            size="sm" 
            onClick={runAnalysis} 
            disabled={analyzing}
            className="gap-1"
          >
            {analyzing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Lightbulb className="w-3 h-3" />
            )}
            {analyzing ? 'Analyzing...' : 'Analyze'}
          </Button>
        )}
      </div>

      {analysis ? (
        <ScrollArea className="h-[280px]">
          <div className="space-y-4">
            {/* Summary */}
            <div className="p-3 rounded bg-secondary/50">
              <p className="text-sm text-foreground">{analysis.summary}</p>
            </div>

            {/* Root Causes */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">ROOT CAUSES</h4>
              <ul className="space-y-1">
                {analysis.rootCauses.map((cause, i) => (
                  <li key={i} className="text-sm text-foreground flex items-start gap-2">
                    <span className="text-destructive">•</span>
                    {cause}
                  </li>
                ))}
              </ul>
            </div>

            {/* Recommendations */}
            <div>
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">RECOMMENDED ADJUSTMENTS</h4>
              <div className="space-y-2">
                {analysis.recommendations.map((rec, i) => (
                  <div key={i} className="p-2 rounded bg-secondary/50 border border-border">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium text-foreground capitalize">
                        {rec.field.replace(/([A-Z])/g, ' $1').trim()}
                      </span>
                      <div className="flex items-center gap-1 text-xs font-mono">
                        <span className="text-muted-foreground">{rec.currentValue}</span>
                        <ArrowRight className="w-3 h-3 text-primary" />
                        <span className="text-primary font-bold">{rec.suggestedValue}</span>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{rec.reason}</p>
                    <Badge variant="outline" className="mt-1 text-[10px]">
                      {rec.expectedImpact}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>

            {/* Expected Results */}
            <div className="p-3 rounded bg-primary/10 border border-primary/20">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-foreground">Expected After Changes</span>
                <CheckCircle className="w-4 h-4 text-primary" />
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Hit Rate: </span>
                  <span className="font-bold text-primary font-mono">
                    {analysis.expectedHitRate.toFixed(1)}%
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">Trade Reduction: </span>
                  <span className="font-bold text-yellow-500 font-mono">
                    -{analysis.tradeReduction}%
                  </span>
                </div>
              </div>
            </div>

            {/* Apply Button */}
            <Button 
              className="w-full gap-2" 
              onClick={applyRecommendations}
            >
              <CheckCircle className="w-4 h-4" />
              Apply Recommended Thresholds
            </Button>
          </div>
        </ScrollArea>
      ) : (
        <div className="py-8 text-center">
          <Brain className="w-12 h-12 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">
            Click "Analyze" to get AI-powered insights
          </p>
        </div>
      )}
    </div>
  );
}
