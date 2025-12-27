import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Palette, Sparkles, Circle, Check } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

type ThemeMode = 'rainbow' | 'monochrome' | 'custom';

interface CustomColors {
  spot: string;
  leverage: string;
  portfolio: string;
  ai: string;
  risk: string;
  hitRate: string;
}

const DEFAULT_RAINBOW_COLORS: CustomColors = {
  spot: '#00BFFF',
  leverage: '#FF1493',
  portfolio: '#FFD700',
  ai: '#9B59B6',
  risk: '#FF6B6B',
  hitRate: '#40E0D0',
};

const MONOCHROME_COLORS: CustomColors = {
  spot: '#00FF88',
  leverage: '#00FF88',
  portfolio: '#00FF88',
  ai: '#00FF88',
  risk: '#00FF88',
  hitRate: '#00FF88',
};

const PRESET_COLORS = [
  '#00FF88', '#00BFFF', '#FF1493', '#FFD700', 
  '#9B59B6', '#40E0D0', '#FF6B35', '#FF6B6B',
];

export function ColorThemeSwitcher() {
  const { user } = useAuth();
  const [theme, setTheme] = useState<ThemeMode>('rainbow');
  const [customColors, setCustomColors] = useState<CustomColors>(DEFAULT_RAINBOW_COLORS);
  const [editingColor, setEditingColor] = useState<keyof CustomColors | null>(null);
  const [saving, setSaving] = useState(false);

  // Load theme from localStorage and database
  useEffect(() => {
    const savedTheme = localStorage.getItem('greenback-color-theme') as ThemeMode;
    const savedColors = localStorage.getItem('greenback-custom-colors');
    
    if (savedTheme) {
      setTheme(savedTheme);
      applyTheme(savedTheme, savedColors ? JSON.parse(savedColors) : customColors);
    }
    
    if (savedColors) {
      setCustomColors(JSON.parse(savedColors));
    }
  }, []);

  // Apply theme to document
  const applyTheme = (mode: ThemeMode, colors: CustomColors) => {
    const root = document.documentElement;
    root.setAttribute('data-color-theme', mode);
    
    const activeColors = mode === 'monochrome' ? MONOCHROME_COLORS : 
                         mode === 'rainbow' ? DEFAULT_RAINBOW_COLORS : 
                         colors;
    
    // Set CSS custom properties
    root.style.setProperty('--accent-spot', activeColors.spot);
    root.style.setProperty('--accent-leverage', activeColors.leverage);
    root.style.setProperty('--accent-portfolio', activeColors.portfolio);
    root.style.setProperty('--accent-ai', activeColors.ai);
    root.style.setProperty('--accent-risk', activeColors.risk);
    root.style.setProperty('--accent-hitrate', activeColors.hitRate);
  };

  const handleThemeChange = async (newTheme: ThemeMode) => {
    setTheme(newTheme);
    applyTheme(newTheme, customColors);
    localStorage.setItem('greenback-color-theme', newTheme);
    
    // Save to database if user is logged in
    if (user?.id) {
      try {
        const { data: existing } = await supabase
          .from('user_settings')
          .select('id')
          .eq('user_id', user.id)
          .single();

        if (existing) {
          await supabase
            .from('user_settings')
            .update({ theme: newTheme })
            .eq('user_id', user.id);
        }
      } catch (err) {
        console.error('Failed to save theme preference:', err);
      }
    }
  };

  const handleColorChange = (key: keyof CustomColors, color: string) => {
    const newColors = { ...customColors, [key]: color };
    setCustomColors(newColors);
    localStorage.setItem('greenback-custom-colors', JSON.stringify(newColors));
    
    if (theme === 'custom') {
      applyTheme('custom', newColors);
    }
    
    setEditingColor(null);
  };

  const COLOR_LABELS: Record<keyof CustomColors, string> = {
    spot: 'Spot Bot',
    leverage: 'Leverage Bot',
    portfolio: 'Portfolio',
    ai: 'AI Copilot',
    risk: 'Risk',
    hitRate: 'Hit Rate',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Palette className="w-5 h-5 text-primary" />
          <CardTitle>Color Theme</CardTitle>
        </div>
        <CardDescription>
          Choose your preferred color scheme for the dashboard.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Theme Selection */}
        <div className="grid grid-cols-3 gap-3">
          {/* Rainbow Theme */}
          <button
            onClick={() => handleThemeChange('rainbow')}
            className={cn(
              'relative p-4 rounded-lg border-2 transition-all text-left',
              theme === 'rainbow'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            {theme === 'rainbow' && (
              <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />
            )}
            <div className="flex gap-1 mb-2">
              {['#00BFFF', '#FF1493', '#FFD700', '#9B59B6'].map((color) => (
                <div
                  key={color}
                  className="w-4 h-4"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="text-sm font-medium">Rainbow</div>
            <div className="text-xs text-muted-foreground">Fun & vibrant</div>
          </button>

          {/* Monochrome Theme */}
          <button
            onClick={() => handleThemeChange('monochrome')}
            className={cn(
              'relative p-4 rounded-lg border-2 transition-all text-left',
              theme === 'monochrome'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            {theme === 'monochrome' && (
              <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />
            )}
            <div className="flex gap-1 mb-2">
              {[1, 0.8, 0.6, 0.4].map((opacity, i) => (
                <div
                  key={i}
                  className="w-4 h-4"
                  style={{ backgroundColor: '#00FF88', opacity }}
                />
              ))}
            </div>
            <div className="text-sm font-medium">Monochrome</div>
            <div className="text-xs text-muted-foreground">Professional</div>
          </button>

          {/* Custom Theme */}
          <button
            onClick={() => handleThemeChange('custom')}
            className={cn(
              'relative p-4 rounded-lg border-2 transition-all text-left',
              theme === 'custom'
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            )}
          >
            {theme === 'custom' && (
              <Check className="absolute top-2 right-2 w-4 h-4 text-primary" />
            )}
            <div className="flex gap-1 mb-2">
              {Object.values(customColors).slice(0, 4).map((color, i) => (
                <div
                  key={i}
                  className="w-4 h-4"
                  style={{ backgroundColor: color }}
                />
              ))}
            </div>
            <div className="text-sm font-medium">Custom</div>
            <div className="text-xs text-muted-foreground">Your colors</div>
          </button>
        </div>

        {/* Custom Color Picker - Only show when custom theme selected */}
        {theme === 'custom' && (
          <div className="space-y-4 pt-4 border-t border-border">
            <Label className="text-sm font-medium">Customize Accent Colors</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {(Object.keys(customColors) as Array<keyof CustomColors>).map((key) => (
                <div key={key} className="relative">
                  <button
                    onClick={() => setEditingColor(editingColor === key ? null : key)}
                    className={cn(
                      'w-full flex items-center gap-2 p-2 rounded-lg border transition-all',
                      editingColor === key ? 'border-primary' : 'border-border hover:border-primary/50'
                    )}
                  >
                    <div
                      className="w-6 h-6 rounded"
                      style={{ backgroundColor: customColors[key] }}
                    />
                    <span className="text-xs">{COLOR_LABELS[key]}</span>
                  </button>
                  
                  {/* Color Picker Dropdown */}
                  {editingColor === key && (
                    <div className="absolute top-full left-0 mt-1 p-2 bg-card border border-border rounded-lg shadow-lg z-10">
                      <div className="grid grid-cols-4 gap-1">
                        {PRESET_COLORS.map((color) => (
                          <button
                            key={color}
                            onClick={() => handleColorChange(key, color)}
                            className={cn(
                              'w-8 h-8 rounded transition-transform hover:scale-110',
                              customColors[key] === color && 'ring-2 ring-primary ring-offset-2 ring-offset-background'
                            )}
                            style={{ backgroundColor: color }}
                          />
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Preview */}
        <div className="p-4 bg-secondary/30 rounded-lg">
          <Label className="text-xs text-muted-foreground mb-2 block">Preview</Label>
          <div className="flex gap-2 flex-wrap">
            {(Object.keys(customColors) as Array<keyof CustomColors>).map((key) => {
              const activeColors = theme === 'monochrome' ? MONOCHROME_COLORS : 
                                   theme === 'rainbow' ? DEFAULT_RAINBOW_COLORS : 
                                   customColors;
              return (
                <div
                  key={key}
                  className="px-2 py-1 rounded text-xs font-medium"
                  style={{ 
                    backgroundColor: `${activeColors[key]}20`,
                    color: activeColors[key],
                    borderLeft: `3px solid ${activeColors[key]}`,
                  }}
                >
                  {COLOR_LABELS[key]}
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
