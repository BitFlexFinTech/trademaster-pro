import { useState, useEffect } from 'react';
import { Search, Filter, RefreshCw, ExternalLink, BookOpen, User, Tag } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { format, formatDistanceToNow } from 'date-fns';

interface ResearchArticle {
  id: string;
  title: string;
  summary: string;
  author: string;
  published_at: string;
  assets: string[];
  tags: string[];
  tier: string;
  external_url: string;
  source: string;
}

const TABS = ['Explore', 'Reports', 'Protocols', 'Deep Research', 'All'];
const TAGS = ['AI', 'DeFi', 'Layer-1', 'Layer-2', 'NFTs', 'Gaming', 'Infrastructure', 'Stablecoins', 'DAOs', 'MEV'];
const TIERS = ['All', 'Free', 'Pro', 'Enterprise'];

export default function Research() {
  const [articles, setArticles] = useState<ResearchArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('Explore');
  const [selectedTier, setSelectedTier] = useState('All');
  const [selectedTags, setSelectedTags] = useState<string[]>([]);

  const fetchResearch = async () => {
    setLoading(true);
    try {
      const response = await supabase.functions.invoke('fetch-research');
      if (response.data) {
        setArticles(response.data);
      }
    } catch (error) {
      console.error('Failed to fetch research:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResearch();
  }, []);

  const toggleTag = (tag: string) => {
    setSelectedTags(prev =>
      prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]
    );
  };

  const filteredArticles = articles.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesTier = selectedTier === 'All' || item.tier.toLowerCase() === selectedTier.toLowerCase();
    const matchesTags = selectedTags.length === 0 || selectedTags.some(tag => item.tags?.includes(tag));
    return matchesSearch && matchesTier && matchesTags;
  });

  return (
    <div className="h-[calc(100vh-8rem)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-bold text-foreground">Research</h1>
        <Button variant="outline" size="sm" onClick={fetchResearch} disabled={loading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-4">
        <TabsList className="bg-muted/50">
          {TABS.map(tab => (
            <TabsTrigger key={tab} value={tab} className="text-xs">
              {tab}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex-1 flex gap-4 min-h-0 overflow-hidden">
        {/* Left Sidebar - Filters */}
        <div className="w-56 flex-shrink-0 bg-card border border-border rounded-lg p-4 overflow-y-auto">
          <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
            <Filter className="w-4 h-4 text-primary" />
            Filters
          </h3>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                Access Tier
              </label>
              <Select value={selectedTier} onValueChange={setSelectedTier}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Tier" />
                </SelectTrigger>
                <SelectContent>
                  {TIERS.map(tier => (
                    <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2 block">
                Tags
              </label>
              <div className="flex flex-wrap gap-1.5">
                {TAGS.map(tag => (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`px-2 py-1 rounded text-[10px] font-medium transition-colors ${
                      selectedTags.includes(tag)
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-muted-foreground hover:bg-muted/80'
                    }`}
                  >
                    {tag}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Search */}
          <div className="relative mb-4">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search research..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Research Table */}
          <div className="flex-1 overflow-hidden bg-card border border-border rounded-lg">
            <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
              <div className="col-span-5">Report</div>
              <div className="col-span-2">Date</div>
              <div className="col-span-2">Author</div>
              <div className="col-span-1">Tier</div>
              <div className="col-span-2">Tags</div>
            </div>

            <ScrollArea className="h-[calc(100%-44px)]">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="flex gap-4">
                      <Skeleton className="h-20 flex-1" />
                    </div>
                  ))}
                </div>
              ) : filteredArticles.length === 0 ? (
                <div className="p-8 text-center text-muted-foreground">
                  <BookOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                  <p>No research articles found</p>
                </div>
              ) : (
                <div className="divide-y divide-border">
                  {filteredArticles.map((item) => (
                    <a
                      key={item.id}
                      href={item.external_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="grid grid-cols-12 gap-4 px-4 py-4 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="col-span-5">
                        <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 flex items-start gap-2">
                          {item.title}
                          <ExternalLink className="w-3 h-3 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </h4>
                        {item.summary && (
                          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{item.summary}</p>
                        )}
                      </div>
                      <div className="col-span-2 flex items-center">
                        <span className="text-xs text-muted-foreground">
                          {formatDistanceToNow(new Date(item.published_at), { addSuffix: true })}
                        </span>
                      </div>
                      <div className="col-span-2 flex items-center gap-1">
                        <User className="w-3 h-3 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground truncate">{item.author}</span>
                      </div>
                      <div className="col-span-1 flex items-center">
                        <Badge
                          variant={item.tier === 'free' ? 'secondary' : 'default'}
                          className="text-[10px]"
                        >
                          {item.tier}
                        </Badge>
                      </div>
                      <div className="col-span-2 flex items-center gap-1 flex-wrap">
                        {item.tags?.slice(0, 2).map(tag => (
                          <Badge key={tag} variant="outline" className="text-[10px] px-1.5 py-0">
                            {tag}
                          </Badge>
                        ))}
                      </div>
                    </a>
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      </div>
    </div>
  );
}
