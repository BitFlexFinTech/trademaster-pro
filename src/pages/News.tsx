import { useState } from 'react';
import { Search, RefreshCw, ExternalLink, Newspaper, Calendar } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNews } from '@/hooks/useNews';
import { formatDistanceToNow } from 'date-fns';

const CATEGORIES = ['All', 'Markets', 'DeFi', 'NFTs', 'Regulation', 'Technology', 'Bitcoin', 'Ethereum'];
const SOURCES = ['All', 'CryptoCompare', 'CoinGecko', 'Messari'];

export default function News() {
  const { news, isLoading: loading, refresh } = useNews();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSource, setSelectedSource] = useState('All');

  const filteredNews = news.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSource = selectedSource === 'All' || item.source === selectedSource;
    return matchesSearch && matchesSource;
  });

  return (
    <div className="h-[calc(100vh-8rem)] flex gap-4 overflow-hidden">
      {/* Left Sidebar - Categories */}
      <div className="w-56 flex-shrink-0 bg-card border border-border rounded-lg p-4">
        <h3 className="text-sm font-semibold text-foreground mb-4 flex items-center gap-2">
          <Newspaper className="w-4 h-4 text-primary" />
          Categories
        </h3>
        <nav className="space-y-1">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                selectedCategory === cat
                  ? 'bg-primary/20 text-primary'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              {cat}
            </button>
          ))}
        </nav>

        <div className="mt-6 pt-4 border-t border-border">
          <h4 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">Daily Recaps</h4>
          <div className="space-y-2">
            <button className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              Today
            </button>
            <button className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              Yesterday
            </button>
            <button className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-muted hover:text-foreground flex items-center gap-2">
              <Calendar className="w-3 h-3" />
              This Week
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-foreground">News Feed</h1>
          <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-3 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Search news..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Select value={selectedSource} onValueChange={setSelectedSource}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Source" />
            </SelectTrigger>
            <SelectContent>
              {SOURCES.map(source => (
                <SelectItem key={source} value={source}>{source}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* News Table */}
        <div className="flex-1 overflow-hidden bg-card border border-border rounded-lg">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="col-span-7">Title</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-3">Source</div>
          </div>

          <ScrollArea className="h-[calc(100%-44px)]">
            {loading ? (
              <div className="p-4 space-y-3">
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-16 flex-1" />
                  </div>
                ))}
              </div>
            ) : filteredNews.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">
                <Newspaper className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No news found</p>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {filteredNews.map((item) => (
                  <a
                    key={item.id}
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="col-span-7">
                      <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2 flex items-start gap-2">
                        {item.title}
                        <ExternalLink className="w-3 h-3 flex-shrink-0 mt-1 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </h4>
                      {item.summary && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{item.summary}</p>
                      )}
                    </div>
                    <div className="col-span-2 flex items-center">
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(item.timestamp), { addSuffix: true })}
                      </span>
                    </div>
                    <div className="col-span-3 flex items-center">
                      <Badge variant="outline" className="text-[10px]">
                        {item.source}
                      </Badge>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>
    </div>
  );
}
