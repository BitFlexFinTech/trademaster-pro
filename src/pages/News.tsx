import { useState } from 'react';
import { Search, RefreshCw, Newspaper, Calendar, User, Clock } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useNews } from '@/hooks/useNews';
import { formatDistanceToNow, format } from 'date-fns';

const CATEGORIES = ['All', 'Markets', 'DeFi', 'NFTs', 'Regulation', 'Technology', 'Bitcoin', 'Ethereum'];
const SOURCES = ['All', 'CryptoCompare', 'CoinGecko', 'Messari'];

interface NewsItem {
  id: string;
  title: string;
  summary?: string;
  url: string;
  source: string;
  timestamp: string;
  imageUrl?: string;
}

export default function News() {
  const { news, isLoading: loading, refresh } = useNews();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedSource, setSelectedSource] = useState('All');
  const [selectedArticle, setSelectedArticle] = useState<NewsItem | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const filteredNews = news.filter(item => {
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.summary?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSource = selectedSource === 'All' || item.source === selectedSource;
    return matchesSearch && matchesSource;
  });

  const handleArticleClick = (item: NewsItem) => {
    setSelectedArticle(item);
    setSheetOpen(true);
  };

  return (
    <div className="min-h-0 flex gap-4">
      {/* Left Sidebar - Categories */}
      <div className="w-56 flex-shrink-0 bg-card border border-border rounded-lg p-4">
        <ScrollArea className="h-full">
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
        </ScrollArea>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
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
        <div className="flex-1 min-h-0 bg-card border border-border rounded-lg flex flex-col">
          <div className="grid grid-cols-12 gap-4 px-4 py-3 border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground uppercase tracking-wide">
            <div className="col-span-7">Title</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-3">Source</div>
          </div>

          <ScrollArea className="flex-1">
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
                  <button
                    key={item.id}
                    onClick={() => handleArticleClick(item)}
                    className="w-full text-left grid grid-cols-12 gap-4 px-4 py-3 hover:bg-muted/50 transition-colors group"
                  >
                    <div className="col-span-7">
                      <h4 className="text-sm font-medium text-foreground group-hover:text-primary transition-colors line-clamp-2">
                        {item.title}
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
                  </button>
                ))}
              </div>
            )}
          </ScrollArea>
        </div>
      </div>

      {/* Article Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader className="mb-6">
            <SheetTitle className="text-lg font-bold text-foreground pr-8">
              {selectedArticle?.title}
            </SheetTitle>
          </SheetHeader>

          {selectedArticle && (
            <div className="space-y-4">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <Badge variant="secondary">{selectedArticle.source}</Badge>
                <span className="flex items-center gap-1">
                  <Clock className="w-4 h-4" />
                  {format(new Date(selectedArticle.timestamp), 'PPp')}
                </span>
              </div>

              {selectedArticle.imageUrl && (
                <div className="rounded-lg overflow-hidden">
                  <img 
                    src={selectedArticle.imageUrl} 
                    alt={selectedArticle.title}
                    className="w-full h-48 object-cover"
                  />
                </div>
              )}

              <div className="prose prose-sm prose-invert max-w-none">
                {selectedArticle.summary && (
                  <p className="text-muted-foreground leading-relaxed">
                    {selectedArticle.summary}
                  </p>
                )}
                
                <div className="mt-6 p-4 bg-muted/50 rounded-lg text-center">
                  <p className="text-muted-foreground text-sm mb-3">
                    Read the full article at the original source.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(selectedArticle.url, '_blank')}
                  >
                    Read Full Article
                  </Button>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}