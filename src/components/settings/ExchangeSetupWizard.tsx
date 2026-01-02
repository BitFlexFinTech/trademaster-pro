import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent } from '@/components/ui/card';
import { Check, X, AlertTriangle, ArrowRight, ExternalLink, Loader2, Shield, Zap, Wallet } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ExchangeSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

interface ExchangeCapabilities {
  spotEnabled: boolean;
  futuresEnabled: boolean;
  marginEnabled: boolean;
  permissions: string[];
  spotBalance: number;
  futuresBalance: number;
}

type ExchangeType = 'binance' | 'okx' | 'bybit';

const EXCHANGE_INFO: Record<ExchangeType, {
  name: string;
  logo: string;
  futuresGuide: string;
  apiGuide: string;
  requiredPermissions: string[];
}> = {
  binance: {
    name: 'Binance',
    logo: '🟡',
    futuresGuide: 'https://www.binance.com/en/support/faq/how-to-open-a-binance-futures-account',
    apiGuide: 'https://www.binance.com/en/support/faq/how-to-create-api-keys',
    requiredPermissions: ['Enable Reading', 'Enable Spot Trading', 'Enable Futures'],
  },
  okx: {
    name: 'OKX',
    logo: '⚫',
    futuresGuide: 'https://www.okx.com/help/how-do-i-enable-futures-trading',
    apiGuide: 'https://www.okx.com/help/how-do-i-create-an-api-key',
    requiredPermissions: ['Read', 'Trade', 'Withdraw (optional)'],
  },
  bybit: {
    name: 'Bybit',
    logo: '🟠',
    futuresGuide: 'https://www.bybit.com/en-US/help-center/bybitHC_Article?id=360039749613',
    apiGuide: 'https://www.bybit.com/en-US/help-center/bybitHC_Article?id=360039749613',
    requiredPermissions: ['Read', 'Contract Trading', 'Wallet'],
  },
};

const STEPS = [
  { id: 1, title: 'Select Exchange', description: 'Choose your exchange' },
  { id: 2, title: 'Check Permissions', description: 'Validate API key' },
  { id: 3, title: 'Enable Futures', description: 'Setup futures trading' },
  { id: 4, title: 'Verify Balance', description: 'Check wallet balance' },
  { id: 5, title: 'Complete', description: 'Ready to trade!' },
];

export function ExchangeSetupWizard({ open, onOpenChange, onComplete }: ExchangeSetupWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [selectedExchange, setSelectedExchange] = useState<ExchangeType | null>(null);
  const [isChecking, setIsChecking] = useState(false);
  const [capabilities, setCapabilities] = useState<ExchangeCapabilities | null>(null);
  const [checkError, setCheckError] = useState<string | null>(null);

  const handleSelectExchange = (exchange: ExchangeType) => {
    setSelectedExchange(exchange);
    setCapabilities(null);
    setCheckError(null);
    setCurrentStep(2);
  };

  const handleCheckPermissions = async () => {
    if (!selectedExchange) return;
    
    setIsChecking(true);
    setCheckError(null);
    
    try {
      const { data, error } = await supabase.functions.invoke('test-exchange-connection', {
        body: { exchange: selectedExchange, checkFutures: true }
      });
      
      if (error) throw error;
      
      if (data?.success) {
        setCapabilities({
          spotEnabled: data.spotEnabled ?? true,
          futuresEnabled: data.futuresEnabled ?? false,
          marginEnabled: data.marginEnabled ?? false,
          permissions: data.permissions ?? [],
          spotBalance: data.spotBalance ?? 0,
          futuresBalance: data.futuresBalance ?? 0,
        });
        
        // Auto-advance based on capabilities
        if (data.futuresEnabled && data.futuresBalance > 10) {
          setCurrentStep(5); // All good!
        } else if (data.futuresEnabled) {
          setCurrentStep(4); // Need to transfer balance
        } else {
          setCurrentStep(3); // Need to enable futures
        }
      } else {
        setCheckError(data?.error || 'Failed to check permissions');
      }
    } catch (e) {
      setCheckError(e instanceof Error ? e.message : 'Connection failed');
    } finally {
      setIsChecking(false);
    }
  };

  const handleComplete = () => {
    toast.success('Exchange setup complete!', {
      description: `${selectedExchange?.toUpperCase()} is ready for bidirectional trading`,
    });
    onComplete?.();
    onOpenChange(false);
    setCurrentStep(1);
    setSelectedExchange(null);
    setCapabilities(null);
  };

  const renderStep1 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Select the exchange you want to configure for futures/leverage trading:
      </p>
      <div className="grid grid-cols-3 gap-3">
        {(Object.keys(EXCHANGE_INFO) as ExchangeType[]).map((key) => {
          const exchange = EXCHANGE_INFO[key];
          return (
            <Button
              key={key}
              variant="outline"
              className={cn(
                "h-20 flex flex-col gap-1",
                selectedExchange === key && "border-primary bg-primary/10"
              )}
              onClick={() => handleSelectExchange(key)}
            >
              <span className="text-2xl">{exchange.logo}</span>
              <span className="text-sm font-medium">{exchange.name}</span>
            </Button>
          );
        })}
      </div>
    </div>
  );

  const renderStep2 = () => (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        We'll check if your {selectedExchange?.toUpperCase()} API key has the required permissions:
      </p>
      
      {selectedExchange && (
        <Card>
          <CardContent className="pt-4">
            <h4 className="font-medium mb-2 flex items-center gap-2">
              <Shield className="h-4 w-4" />
              Required Permissions
            </h4>
            <ul className="space-y-1">
              {EXCHANGE_INFO[selectedExchange].requiredPermissions.map((perm, i) => (
                <li key={i} className="text-sm flex items-center gap-2">
                  <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                  {perm}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
      
      {checkError && (
        <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
          <p className="text-sm text-destructive flex items-center gap-2">
            <AlertTriangle className="h-4 w-4" />
            {checkError}
          </p>
        </div>
      )}
      
      <Button onClick={handleCheckPermissions} disabled={isChecking} className="w-full">
        {isChecking ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Checking...
          </>
        ) : (
          <>
            Check API Permissions
            <ArrowRight className="h-4 w-4 ml-2" />
          </>
        )}
      </Button>
    </div>
  );

  const renderStep3 = () => (
    <div className="space-y-4">
      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
        <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          Futures trading is not enabled on your {selectedExchange?.toUpperCase()} account
        </p>
      </div>
      
      <Card>
        <CardContent className="pt-4 space-y-3">
          <h4 className="font-medium">How to enable futures:</h4>
          <ol className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary">1.</span>
              Log into {selectedExchange?.toUpperCase()} on web or app
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary">2.</span>
              Go to Derivatives/Futures section
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary">3.</span>
              Complete the futures trading quiz
            </li>
            <li className="flex items-start gap-2">
              <span className="font-bold text-primary">4.</span>
              Update your API key with futures permissions
            </li>
          </ol>
          
          {selectedExchange && (
            <Button variant="outline" className="w-full" asChild>
              <a href={EXCHANGE_INFO[selectedExchange].futuresGuide} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="h-4 w-4 mr-2" />
                Open {EXCHANGE_INFO[selectedExchange].name} Futures Guide
              </a>
            </Button>
          )}
        </CardContent>
      </Card>
      
      <Button onClick={handleCheckPermissions} disabled={isChecking} className="w-full">
        {isChecking ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Re-checking...
          </>
        ) : (
          <>
            I've Enabled Futures - Check Again
            <ArrowRight className="h-4 w-4 ml-2" />
          </>
        )}
      </Button>
    </div>
  );

  const renderStep4 = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-3 p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
        <Check className="h-5 w-5 text-emerald-500" />
        <span className="text-sm">Futures trading enabled!</span>
      </div>
      
      <Card>
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Spot Balance</span>
            <span className="font-mono font-bold">${capabilities?.spotBalance.toFixed(2) ?? '0.00'}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Futures Balance</span>
            <span className={cn(
              "font-mono font-bold",
              (capabilities?.futuresBalance ?? 0) < 10 ? "text-amber-500" : "text-emerald-500"
            )}>
              ${capabilities?.futuresBalance.toFixed(2) ?? '0.00'}
            </span>
          </div>
        </CardContent>
      </Card>
      
      {(capabilities?.futuresBalance ?? 0) < 10 && (
        <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-2">
            <Wallet className="h-4 w-4" />
            Transfer at least $10 USDT to your Futures wallet to start trading
          </p>
        </div>
      )}
      
      <Button onClick={handleCheckPermissions} disabled={isChecking} className="w-full">
        {isChecking ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Checking Balance...
          </>
        ) : (
          <>
            I've Transferred Funds - Check Again
            <ArrowRight className="h-4 w-4 ml-2" />
          </>
        )}
      </Button>
    </div>
  );

  const renderStep5 = () => (
    <div className="space-y-4 text-center">
      <div className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center">
        <Check className="h-8 w-8 text-emerald-500" />
      </div>
      
      <h3 className="text-lg font-bold">Setup Complete!</h3>
      <p className="text-sm text-muted-foreground">
        Your {selectedExchange?.toUpperCase()} account is ready for bidirectional trading.
      </p>
      
      <Card>
        <CardContent className="pt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-sm">Spot Trading: Enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-sm">Futures Trading: Enabled</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-500" />
            <span className="text-sm">Futures Balance: ${capabilities?.futuresBalance.toFixed(2)}</span>
          </div>
          <div className="flex items-center gap-2">
            <Zap className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">LONG & SHORT trades enabled</span>
          </div>
        </CardContent>
      </Card>
      
      <Button onClick={handleComplete} className="w-full">
        Start Trading
        <ArrowRight className="h-4 w-4 ml-2" />
      </Button>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            Exchange Futures Setup
          </DialogTitle>
          <DialogDescription>
            Configure your exchange for bidirectional trading (LONG & SHORT)
          </DialogDescription>
        </DialogHeader>
        
        {/* Progress Steps */}
        <div className="flex items-center gap-1 mb-4">
          {STEPS.map((step, index) => (
            <div key={step.id} className="flex-1 flex items-center">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold",
                currentStep >= step.id 
                  ? "bg-primary text-primary-foreground" 
                  : "bg-muted text-muted-foreground"
              )}>
                {currentStep > step.id ? <Check className="h-3 w-3" /> : step.id}
              </div>
              {index < STEPS.length - 1 && (
                <div className={cn(
                  "flex-1 h-0.5 mx-1",
                  currentStep > step.id ? "bg-primary" : "bg-muted"
                )} />
              )}
            </div>
          ))}
        </div>
        
        {/* Step Content */}
        {currentStep === 1 && renderStep1()}
        {currentStep === 2 && renderStep2()}
        {currentStep === 3 && renderStep3()}
        {currentStep === 4 && renderStep4()}
        {currentStep === 5 && renderStep5()}
      </DialogContent>
    </Dialog>
  );
}
