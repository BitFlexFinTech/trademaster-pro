import { useState, useEffect, useRef } from 'react';
import { Volume2, VolumeX, Play, Check, Shield, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';

// Sound files - Base64 encoded for instant playback
const WIN_SOUNDS = {
  chime: 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAACBhYqFbF1fdJKVmZydnZ2dm5qYlpSSkI6MioiGhIKAfn17eXd1c3FvbWtpZ2VjYV9dW1lXVVNRUE5MS0lHRURCQD8+PDs6ODc2NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQBCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl9gYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1+f4CBgoOEhYaHiImKi4yNjo+QkZKTlJWWl5iZmpucnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzc7P0NHS09TV1tfY2drb3N3e3+Dh4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7/',
  coin: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onpx2VFF+joqMhYF9gX+Dg4N/fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+',
  fanfare: 'data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAACBhYqFbF1fdJKVmZydnZ2dm5qYlpSSkI6MioiGhIKAfn17eXd1c3FvbWtpZ2VjYV9dW1lXVVNRUE5MS0lHRURCQD8+PDs6ODc2NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQBCQ0RFRkdISUpLTE1OT1BRUlNUVVZXWFlaW1xdXl9gYWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXp7fH1+f4CBgoOEhYaHiImKi4yNjo+QkZKTlJWWl5iZmpucnZ6foKGio6SlpqeoqaqrrK2ur7CxsrO0tba3uLm6u7y9vr/AwcLDxMXGx8jJysvMzc7P0NHS09TV1tfY2drb3N3e3+Dh4uPk5ebn6Onq6+zt7u/w8fLz9PX29/j5+vv8/f7/',
};

const LOSS_SOUNDS = {
  buzz: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onpx2VFF+joqMhYF9gX+Dg4N/fn5+f35+fXx8e3t6eXl4d3Z1dHNycXBvbm1sa2ppaGdmZWRjYmFgX15dXFtaWVhXVlVUU1JRUE9OTUxLSklIR0ZFRENCQUA/Pj08Ozo5ODc2NTQzMjEwLy4tLCsqKSgnJiUkIyIhIB8eHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEA',
  lowTone: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onpx2VFF+joqMhYF9gX+Dg4N/fn5+f35+fXx8e3t6eXl4d3Z1dHNycXBvbm1sa2ppaGdmZWRjYmFgX15dXFtaWVhXVlVUU1JRUE9OTUxLSklIR0ZFRENCQUA/Pj08Ozo5ODc2NTQzMjEwLy4tLCsqKSgnJiUkIyIhIB8eHRwbGhkYFxYVFBMSERAPDg0MCwoJCAcGBQQDAgEA',
};

// Sentinel-specific sounds
const URGENT_SOUNDS = {
  alarm: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAACBhYqFbF1fdH2OnKaqqqqqqqqqqqqopZydnJyclpGNiYaChH97d3NvbGlnZWRjY2NjY2RlZ2ltcnZ7gISHi46QkZGRkZCPjYuIhYJ/fHl2c3BtamdiXlpWU09MSUZDQTw4NDAsKCQgHBgUEAwIBABERkhKTE5QUlRWWFpcXmBiZGZoamxucHJ0dnh6fH6AgYOFh4mLjY+RkpOUlJSUlJOSkI+MioeEgX57eHVyb2xpZ2RiYF5cWlhWVFJQTkxKSEZEQkA+PDo4NjQyMC4sKiglIxwYEwwHAP8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  siren: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAAABBQoQFR0mMTxIVGFvfIqWoqyztbe3t7Ovp5yRhXdpXE9DOS4jGREKBQEAAQULEhojLzpIVmRyfIeRmqClpqakn5mQhXpuYVNGOi8kGhEJBAEAAQYMFB8sOkZTYW9/ipOan6KjoZ2Xj4N5bV9STj0zJxsRCQMAAAQKEhodJC0yNTo9Pz4+Ozo2LykkHBcRDAcDAAABBgsRFhweISMkJCQjIR4bFhEMCAQBAAABBQoQFh0kLDVARk1UWl9jZmdnZWJdV1BJQTkxKCAdFxMNCAQBAAEFCQ0REhMTExIQDgsHAwAAAQQHCg0QERIRERAQEA8ODQsIBQMBAAEDBAUGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYGBgYFBQQDAgEA',
};

const WARNING_SOUNDS = {
  beep: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdH2Onpx2VFF+joqMhYF9gX+Dg4N/fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+fn5+',
  tone: 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAESsAACJWAAABAAgAZGF0YQoGAACBhYqFbF1fdJKVmZydnZ2dm5qYlpSSkI6MioiGhIKAfn17eXd1c3FvbWtpZ2VjYV9dW1lXVVNRUE5MS0lHRURCQD8+PDs6ODc2NDMyMTAvLi0sKyopKCcmJSQjIiEgHx4dHBsaGRgXFhUUExIREA8ODQwLCgkIBwYFBAMCAQA=',
};

interface SoundSettings {
  enabled: boolean;
  volume: number;
  winSound: keyof typeof WIN_SOUNDS;
  lossSound: keyof typeof LOSS_SOUNDS;
  // Sentinel alerts
  sentinelAlertsEnabled: boolean;
  warningSound: keyof typeof WARNING_SOUNDS;
  urgentSound: keyof typeof URGENT_SOUNDS;
}

interface SoundNotificationSettingsProps {
  settings?: SoundSettings;
  onSettingsChange?: (settings: SoundSettings) => void;
}

export function SoundNotificationSettings({ settings: externalSettings, onSettingsChange }: SoundNotificationSettingsProps) {
  const [settings, setSettings] = useState<SoundSettings>(() => {
    const stored = localStorage.getItem('soundNotificationSettings');
    if (stored) {
      try {
        return JSON.parse(stored);
      } catch {
        // Fall through to defaults
      }
    }
    return externalSettings || {
      enabled: true,
      volume: 50,
      winSound: 'chime',
      lossSound: 'buzz',
      sentinelAlertsEnabled: true,
      warningSound: 'beep',
      urgentSound: 'alarm',
    };
  });

  const winAudioRef = useRef<HTMLAudioElement | null>(null);
  const lossAudioRef = useRef<HTMLAudioElement | null>(null);
  const warningAudioRef = useRef<HTMLAudioElement | null>(null);
  const urgentAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (externalSettings) {
      setSettings(externalSettings);
    }
  }, [externalSettings]);

  useEffect(() => {
    localStorage.setItem('soundNotificationSettings', JSON.stringify(settings));
    onSettingsChange?.(settings);
  }, [settings, onSettingsChange]);

  useEffect(() => {
    winAudioRef.current = new Audio(WIN_SOUNDS[settings.winSound]);
    winAudioRef.current.volume = settings.volume / 100;
  }, [settings.winSound, settings.volume]);

  useEffect(() => {
    lossAudioRef.current = new Audio(LOSS_SOUNDS[settings.lossSound]);
    lossAudioRef.current.volume = settings.volume / 100;
  }, [settings.lossSound, settings.volume]);

  useEffect(() => {
    warningAudioRef.current = new Audio(WARNING_SOUNDS[settings.warningSound]);
    warningAudioRef.current.volume = settings.volume / 100;
  }, [settings.warningSound, settings.volume]);

  useEffect(() => {
    urgentAudioRef.current = new Audio(URGENT_SOUNDS[settings.urgentSound]);
    urgentAudioRef.current.volume = settings.volume / 100;
  }, [settings.urgentSound, settings.volume]);

  const previewWinSound = () => {
    if (winAudioRef.current) {
      winAudioRef.current.currentTime = 0;
      winAudioRef.current.play().catch(() => {});
    }
  };

  const previewLossSound = () => {
    if (lossAudioRef.current) {
      lossAudioRef.current.currentTime = 0;
      lossAudioRef.current.play().catch(() => {});
    }
  };

  const previewWarningSound = () => {
    if (warningAudioRef.current) {
      warningAudioRef.current.currentTime = 0;
      warningAudioRef.current.play().catch(() => {});
    }
  };

  const previewUrgentSound = () => {
    if (urgentAudioRef.current) {
      urgentAudioRef.current.currentTime = 0;
      urgentAudioRef.current.play().catch(() => {});
    }
  };

  const updateSetting = <K extends keyof SoundSettings>(key: K, value: SoundSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
  };

  return (
    <Card className="border-border/50 bg-card/50 backdrop-blur">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              {settings.enabled ? <Volume2 className="h-4 w-4 text-primary" /> : <VolumeX className="h-4 w-4 text-muted-foreground" />}
              Sound Notifications
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              Customize sounds for trading events
            </CardDescription>
          </div>
          <Switch
            checked={settings.enabled}
            onCheckedChange={(checked) => updateSetting('enabled', checked)}
          />
        </div>
      </CardHeader>

      {settings.enabled && (
        <CardContent className="space-y-4 pt-0">
          {/* Volume Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm">Volume</Label>
              <span className="text-xs text-muted-foreground">{settings.volume}%</span>
            </div>
            <Slider
              value={[settings.volume]}
              onValueChange={([value]) => updateSetting('volume', value)}
              min={0}
              max={100}
              step={5}
              className="w-full"
            />
          </div>

          {/* Win Sound Selection */}
          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-2">
              <Check className="h-3 w-3 text-green-500" />
              Win Sound
            </Label>
            <div className="flex gap-2">
              <Select
                value={settings.winSound}
                onValueChange={(value) => updateSetting('winSound', value as keyof typeof WIN_SOUNDS)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="chime">Chime</SelectItem>
                  <SelectItem value="coin">Coin</SelectItem>
                  <SelectItem value="fanfare">Fanfare</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="icon"
                onClick={previewWinSound}
                className="shrink-0"
              >
                <Play className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* Loss Sound Selection */}
          <div className="space-y-2">
            <Label className="text-sm flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500/20 flex items-center justify-center text-[8px] text-red-500">✕</span>
              Loss Sound
            </Label>
            <div className="flex gap-2">
              <Select
                value={settings.lossSound}
                onValueChange={(value) => updateSetting('lossSound', value as keyof typeof LOSS_SOUNDS)}
              >
                <SelectTrigger className="flex-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="buzz">Buzz</SelectItem>
                  <SelectItem value="lowTone">Low Tone</SelectItem>
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                size="icon"
                onClick={previewLossSound}
                className="shrink-0"
              >
                <Play className="h-4 w-4" />
              </Button>
            </div>
          </div>

          <Separator className="my-4" />

          {/* Sentinel Alerts Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield className="h-4 w-4 text-amber-500" />
                <Label className="text-sm font-medium">Sentinel Alerts</Label>
              </div>
              <Switch
                checked={settings.sentinelAlertsEnabled}
                onCheckedChange={(checked) => updateSetting('sentinelAlertsEnabled', checked)}
              />
            </div>

            {settings.sentinelAlertsEnabled && (
              <>
                {/* Warning Sound */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-amber-500" />
                    Warning Sound
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={settings.warningSound}
                      onValueChange={(value) => updateSetting('warningSound', value as keyof typeof WARNING_SOUNDS)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="beep">Beep</SelectItem>
                        <SelectItem value="tone">Tone</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={previewWarningSound}
                      className="shrink-0"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Urgent Alarm Sound */}
                <div className="space-y-2">
                  <Label className="text-sm flex items-center gap-2">
                    <AlertTriangle className="h-3 w-3 text-red-500" />
                    Urgent Alarm
                  </Label>
                  <div className="flex gap-2">
                    <Select
                      value={settings.urgentSound}
                      onValueChange={(value) => updateSetting('urgentSound', value as keyof typeof URGENT_SOUNDS)}
                    >
                      <SelectTrigger className="flex-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="alarm">Alarm</SelectItem>
                        <SelectItem value="siren">Siren</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={previewUrgentSound}
                      className="shrink-0"
                    >
                      <Play className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
