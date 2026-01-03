import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Bell, Send, Loader2, CheckCircle2, XCircle, MessageSquare, Hash } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface WebhookConfig {
  discord_url: string | null;
  slack_url: string | null;
  enabled: boolean;
  alert_types: string[];
  cooldown_seconds: number;
}

const ALERT_TYPES = [
  { id: 'slow_total', label: 'Slow Total Execution', description: 'When total trade time exceeds threshold' },
  { id: 'slow_phase', label: 'Slow Phase', description: 'When individual phase exceeds threshold' },
  { id: 'critical', label: 'Critical Alerts', description: 'Critical trading errors or failures' },
  { id: 'trade_completed', label: 'Trade Completed', description: 'When trades are closed with profit' },
];

export function WebhookAlertSettings() {
  const { user } = useAuth();
  const [config, setConfig] = useState<WebhookConfig>({
    discord_url: null,
    slack_url: null,
    enabled: false,
    alert_types: ['slow_total', 'slow_phase', 'critical'],
    cooldown_seconds: 60,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testingDiscord, setTestingDiscord] = useState(false);
  const [testingSlack, setTestingSlack] = useState(false);

  // Fetch current config
  useEffect(() => {
    if (!user) return;

    const fetchConfig = async () => {
      const { data, error } = await supabase
        .from('user_settings')
        .select('webhook_config')
        .eq('user_id', user.id)
        .single();

      if (!error && data?.webhook_config) {
        const webhookData = data.webhook_config as Record<string, unknown>;
        setConfig({
          discord_url: (webhookData.discord_url as string) || null,
          slack_url: (webhookData.slack_url as string) || null,
          enabled: Boolean(webhookData.enabled),
          alert_types: Array.isArray(webhookData.alert_types) ? webhookData.alert_types : ['slow_total', 'slow_phase', 'critical'],
          cooldown_seconds: typeof webhookData.cooldown_seconds === 'number' ? webhookData.cooldown_seconds : 60,
        });
      }
      setLoading(false);
    };

    fetchConfig();
  }, [user]);

  // Save config
  const saveConfig = useCallback(async () => {
    if (!user) return;

    setSaving(true);
    
    const { error } = await supabase
      .from('user_settings')
      .update({ 
        webhook_config: {
          discord_url: config.discord_url,
          slack_url: config.slack_url,
          enabled: config.enabled,
          alert_types: config.alert_types,
          cooldown_seconds: config.cooldown_seconds,
        }
      })
      .eq('user_id', user.id);

    if (error) {
      toast.error('Failed to save webhook settings');
    } else {
      toast.success('Webhook settings saved');
    }
    setSaving(false);
  }, [user, config]);

  // Test webhook
  const testWebhook = useCallback(async (type: 'discord' | 'slack') => {
    if (type === 'discord') setTestingDiscord(true);
    else setTestingSlack(true);

    try {
      const { data, error } = await supabase.functions.invoke('send-alert-webhook', {
        body: {
          testMode: true,
          payload: {
            type: 'slow_total',
            severity: 'info',
            title: '🧪 Test Alert',
            description: 'This is a test alert from your trading bot webhook settings.',
            pair: 'BTC/USDT',
            exchange: 'binance',
            durationMs: 1500,
            thresholdMs: 1000,
          },
        },
      });

      if (error) throw error;

      if (type === 'discord' && data?.results?.discord) {
        toast.success('Discord test sent successfully!');
      } else if (type === 'slack' && data?.results?.slack) {
        toast.success('Slack test sent successfully!');
      } else {
        toast.error(`${type === 'discord' ? 'Discord' : 'Slack'} test failed`);
      }
    } catch (err) {
      toast.error(`Failed to send ${type} test`);
    }

    if (type === 'discord') setTestingDiscord(false);
    else setTestingSlack(false);
  }, []);

  // Toggle alert type
  const toggleAlertType = (typeId: string) => {
    setConfig(prev => ({
      ...prev,
      alert_types: prev.alert_types.includes(typeId)
        ? prev.alert_types.filter(t => t !== typeId)
        : [...prev.alert_types, typeId],
    }));
  };

  if (loading) {
    return (
      <Card className="border-border/50">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/50">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <CardTitle className="text-lg">Webhook Alerts</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="webhook-enabled" className="text-sm text-muted-foreground">
              Enable
            </Label>
            <Switch
              id="webhook-enabled"
              checked={config.enabled}
              onCheckedChange={(checked) => setConfig(prev => ({ ...prev, enabled: checked }))}
            />
          </div>
        </div>
        <CardDescription>
          Receive alerts on Discord or Slack when execution times exceed thresholds
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Discord Webhook */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Hash className="h-4 w-4 text-[#5865F2]" />
            <Label>Discord Webhook URL</Label>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="https://discord.com/api/webhooks/..."
              value={config.discord_url || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, discord_url: e.target.value || null }))}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => testWebhook('discord')}
              disabled={!config.discord_url || testingDiscord}
            >
              {testingDiscord ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Slack Webhook */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-[#4A154B]" />
            <Label>Slack Webhook URL</Label>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="https://hooks.slack.com/services/..."
              value={config.slack_url || ''}
              onChange={(e) => setConfig(prev => ({ ...prev, slack_url: e.target.value || null }))}
              className="flex-1"
            />
            <Button
              variant="outline"
              size="sm"
              onClick={() => testWebhook('slack')}
              disabled={!config.slack_url || testingSlack}
            >
              {testingSlack ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>

        {/* Alert Types */}
        <div className="space-y-3">
          <Label>Alert Types</Label>
          <div className="grid gap-2">
            {ALERT_TYPES.map((type) => (
              <div key={type.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50">
                <Checkbox
                  id={type.id}
                  checked={config.alert_types.includes(type.id)}
                  onCheckedChange={() => toggleAlertType(type.id)}
                />
                <div className="flex-1">
                  <Label htmlFor={type.id} className="font-medium cursor-pointer">
                    {type.label}
                  </Label>
                  <p className="text-xs text-muted-foreground">{type.description}</p>
                </div>
                {config.alert_types.includes(type.id) ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-muted-foreground/40" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Cooldown */}
        <div className="space-y-2">
          <Label>Cooldown (seconds)</Label>
          <Input
            type="number"
            min={10}
            max={3600}
            value={config.cooldown_seconds}
            onChange={(e) => setConfig(prev => ({ ...prev, cooldown_seconds: parseInt(e.target.value) || 60 }))}
            className="w-32"
          />
          <p className="text-xs text-muted-foreground">
            Minimum time between alerts of the same type
          </p>
        </div>

        {/* Status */}
        <div className="flex items-center justify-between pt-2 border-t">
          <div className="flex items-center gap-2">
            <Badge variant={config.enabled ? 'default' : 'secondary'}>
              {config.enabled ? 'Enabled' : 'Disabled'}
            </Badge>
            {config.discord_url && <Badge variant="outline">Discord</Badge>}
            {config.slack_url && <Badge variant="outline">Slack</Badge>}
          </div>
          <Button onClick={saveConfig} disabled={saving}>
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              'Save Settings'
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
