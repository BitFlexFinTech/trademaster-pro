import { useState, useEffect } from 'react';
import { Shield, CheckCircle, XCircle, RefreshCw, Lock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface EncryptionStatus {
  isConfigured: boolean;
  maskedKey: string | null;
  keyLength: number;
  algorithm: string;
}

export function SecurityConfigPanel() {
  const [status, setStatus] = useState<EncryptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);

  const checkStatus = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('check-encryption-status');
      
      if (error) throw error;
      setStatus(data);
    } catch (error: any) {
      console.error('Failed to check encryption status:', error);
      if (!error.message?.includes('Unauthorized')) {
        toast.error('Failed to check encryption status');
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyKey = async () => {
    setVerifying(true);
    try {
      const { data, error } = await supabase.functions.invoke('check-encryption-status');
      if (error) throw error;
      setStatus(data);
      toast.success('Encryption key verified successfully');
    } catch (error: any) {
      toast.error('Verification failed: ' + error.message);
    } finally {
      setVerifying(false);
    }
  };

  useEffect(() => {
    checkStatus();
  }, []);

  if (loading) {
    return (
      <Card className="border-border/50 bg-card/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            Security Configuration
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 text-muted-foreground">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50 bg-card/50">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          Security Configuration
          <Badge variant="outline" className="ml-auto text-xs">
            Admin Only
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 border border-border/30">
          <div className="flex items-center gap-3">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Encryption Key</p>
              <p className="text-xs text-muted-foreground font-mono">
                {status?.maskedKey || 'Not configured'}
              </p>
            </div>
          </div>
          {status?.isConfigured ? (
            <Badge className="bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
              <CheckCircle className="h-3 w-3 mr-1" />
              Active
            </Badge>
          ) : (
            <Badge variant="destructive">
              <XCircle className="h-3 w-3 mr-1" />
              Not Configured
            </Badge>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="p-2 rounded bg-background/30 border border-border/20">
            <span className="text-muted-foreground">Algorithm:</span>
            <span className="ml-2 font-mono">{status?.algorithm || 'N/A'}</span>
          </div>
          <div className="p-2 rounded bg-background/30 border border-border/20">
            <span className="text-muted-foreground">Key Length:</span>
            <span className="ml-2 font-mono">{status?.keyLength || 0} chars</span>
          </div>
        </div>

        <Button
          variant="outline"
          size="sm"
          onClick={verifyKey}
          disabled={verifying}
          className="w-full"
        >
          {verifying ? (
            <>
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            <>
              <RefreshCw className="h-4 w-4 mr-2" />
              Re-verify Key
            </>
          )}
        </Button>

        <p className="text-xs text-muted-foreground">
          API keys are encrypted using AES-256-GCM before storage. The encryption key is stored securely in Lovable Cloud secrets.
        </p>
      </CardContent>
    </Card>
  );
}
