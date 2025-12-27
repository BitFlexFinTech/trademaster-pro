import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { BookOpen, Save, X, Star, Smile, Meh, Frown, Target, Brain, Tag } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Trade {
  id: string;
  pair: string;
  direction: string;
  entry_price: number;
  exit_price: number | null;
  profit_loss: number | null;
  created_at: string;
  notes?: string | null;
  tags?: string[] | null;
  lessons_learned?: string | null;
  emotion?: string | null;
  market_context?: string | null;
  setup_quality?: number | null;
}

interface TradeJournalModalProps {
  open: boolean;
  onClose: () => void;
  trade: Trade | null;
  onSave?: () => void;
}

const EMOTION_OPTIONS = [
  { value: 'confident', label: 'Confident', icon: Smile, color: 'text-emerald-500' },
  { value: 'neutral', label: 'Neutral', icon: Meh, color: 'text-amber-500' },
  { value: 'fearful', label: 'Fearful', icon: Frown, color: 'text-red-500' },
  { value: 'greedy', label: 'Greedy', icon: Target, color: 'text-purple-500' },
  { value: 'fomo', label: 'FOMO', icon: Brain, color: 'text-orange-500' },
];

const COMMON_TAGS = [
  'breakout', 'pullback', 'reversal', 'trend', 'scalp', 
  'news', 'technical', 'momentum', 'support', 'resistance'
];

export function TradeJournalModal({ open, onClose, trade, onSave }: TradeJournalModalProps) {
  const [notes, setNotes] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [customTag, setCustomTag] = useState('');
  const [lessonsLearned, setLessonsLearned] = useState('');
  const [emotion, setEmotion] = useState('');
  const [marketContext, setMarketContext] = useState('');
  const [setupQuality, setSetupQuality] = useState(3);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (trade) {
      setNotes(trade.notes || '');
      setTags(trade.tags || []);
      setLessonsLearned(trade.lessons_learned || '');
      setEmotion(trade.emotion || '');
      setMarketContext(trade.market_context || '');
      setSetupQuality(trade.setup_quality || 3);
    }
  }, [trade]);

  const handleSave = async () => {
    if (!trade) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('trades')
        .update({
          notes,
          tags,
          lessons_learned: lessonsLearned,
          emotion,
          market_context: marketContext,
          setup_quality: setupQuality,
        })
        .eq('id', trade.id);

      if (error) throw error;

      toast.success('Journal entry saved');
      onSave?.();
      onClose();
    } catch (err) {
      console.error('Failed to save journal entry:', err);
      toast.error('Failed to save journal entry');
    } finally {
      setSaving(false);
    }
  };

  const addTag = (tag: string) => {
    if (!tags.includes(tag)) {
      setTags([...tags, tag]);
    }
  };

  const removeTag = (tag: string) => {
    setTags(tags.filter(t => t !== tag));
  };

  const addCustomTag = () => {
    if (customTag.trim() && !tags.includes(customTag.trim())) {
      setTags([...tags, customTag.trim().toLowerCase()]);
      setCustomTag('');
    }
  };

  if (!trade) return null;

  const isWin = (trade.profit_loss || 0) > 0;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <BookOpen className="h-5 w-5 text-primary" />
            Trade Journal
            <Badge variant={isWin ? "default" : "destructive"}>
              {trade.pair}
            </Badge>
            <Badge variant="outline" className={cn(
              trade.direction === 'long' ? "text-emerald-500 border-emerald-500/50" : "text-red-500 border-red-500/50"
            )}>
              {trade.direction.toUpperCase()}
            </Badge>
          </DialogTitle>
          <DialogDescription>
            Entry: ${trade.entry_price.toFixed(4)} → Exit: ${trade.exit_price?.toFixed(4) || 'Open'}
            {' | '}
            P&L: <span className={isWin ? 'text-emerald-500' : 'text-red-500'}>
              {isWin ? '+' : ''}${(trade.profit_loss || 0).toFixed(4)}
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 pt-4">
          {/* Emotion Selection */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Smile className="h-4 w-4" />
              Emotional State
            </Label>
            <div className="flex flex-wrap gap-2">
              {EMOTION_OPTIONS.map((opt) => (
                <Button
                  key={opt.value}
                  type="button"
                  variant={emotion === opt.value ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEmotion(opt.value)}
                  className="gap-1"
                >
                  <opt.icon className={cn("h-3 w-3", emotion === opt.value ? "" : opt.color)} />
                  {opt.label}
                </Button>
              ))}
            </div>
          </div>

          {/* Setup Quality */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Star className="h-4 w-4" />
              Setup Quality (1-5)
            </Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((rating) => (
                <Button
                  key={rating}
                  type="button"
                  variant={setupQuality >= rating ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSetupQuality(rating)}
                  className="w-10"
                >
                  <Star className={cn(
                    "h-4 w-4",
                    setupQuality >= rating ? "fill-current" : ""
                  )} />
                </Button>
              ))}
            </div>
          </div>

          {/* Tags */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Tag className="h-4 w-4" />
              Tags
            </Label>
            <div className="flex flex-wrap gap-1 mb-2">
              {tags.map((tag) => (
                <Badge key={tag} variant="secondary" className="gap-1">
                  {tag}
                  <X 
                    className="h-3 w-3 cursor-pointer hover:text-destructive" 
                    onClick={() => removeTag(tag)}
                  />
                </Badge>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {COMMON_TAGS.filter(t => !tags.includes(t)).map((tag) => (
                <Badge 
                  key={tag} 
                  variant="outline" 
                  className="cursor-pointer hover:bg-muted"
                  onClick={() => addTag(tag)}
                >
                  + {tag}
                </Badge>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <Input
                placeholder="Add custom tag..."
                value={customTag}
                onChange={(e) => setCustomTag(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addCustomTag()}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addCustomTag}>
                Add
              </Button>
            </div>
          </div>

          {/* Market Context */}
          <div className="space-y-2">
            <Label htmlFor="marketContext">Market Context</Label>
            <Select value={marketContext} onValueChange={setMarketContext}>
              <SelectTrigger>
                <SelectValue placeholder="Select market condition..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="trending_up">Trending Up</SelectItem>
                <SelectItem value="trending_down">Trending Down</SelectItem>
                <SelectItem value="ranging">Ranging/Sideways</SelectItem>
                <SelectItem value="volatile">High Volatility</SelectItem>
                <SelectItem value="low_volume">Low Volume</SelectItem>
                <SelectItem value="news_driven">News Driven</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Trade Notes</Label>
            <Textarea
              id="notes"
              placeholder="What was your reasoning for this trade? What did you observe?"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>

          {/* Lessons Learned */}
          <div className="space-y-2">
            <Label htmlFor="lessons">Lessons Learned</Label>
            <Textarea
              id="lessons"
              placeholder="What would you do differently? What did this trade teach you?"
              value={lessonsLearned}
              onChange={(e) => setLessonsLearned(e.target.value)}
              rows={3}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? (
                <>Saving...</>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-1" />
                  Save Entry
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}