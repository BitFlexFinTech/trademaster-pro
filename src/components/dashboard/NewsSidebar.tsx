import { useNews } from '@/hooks/useNews';
import { RefreshCw, ExternalLink, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

function formatRelativeTime(timestamp: string): string {
  const now = new Date();
  const date = new Date(timestamp);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  
  const diffDays = Math.floor(diffHours / 24);
  return `${diffDays}d ago`;
}

function getSourceColor(source: string): string {
  const lowerSource = source.toLowerCase();
  if (lowerSource.includes('coingecko')) return 'bg-green-500/20 text-green-400 border-green-500/30';
  if (lowerSource.includes('cointelegraph')) return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
  if (lowerSource.includes('decrypt')) return 'bg-purple-500/20 text-purple-400 border-purple-500/30';
  return 'bg-primary/20 text-primary border-primary/30';
}

export function NewsSidebar() {
  const { news, isLoading, error, lastUpdated, refresh } = useNews();

  return (
    <div className="card-terminal p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Crypto News</h3>
        <div className="flex items-center gap-2">
          {lastUpdated && (
            <span className="text-[10px] text-muted-foreground">
              {formatRelativeTime(lastUpdated.toISOString())}
            </span>
          )}
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            disabled={isLoading}
            className="h-6 w-6 p-0 hover:bg-muted"
          >
            <RefreshCw className={cn("w-3 h-3", isLoading && "animate-spin")} />
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && news.length === 0 && (
        <div className="flex-1 space-y-4">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="space-y-2 pb-4 border-b border-border last:border-0">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-3 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      )}

      {/* Error State */}
      {error && news.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground">
          <AlertCircle className="w-8 h-8" />
          <p className="text-sm">{error}</p>
          <Button variant="outline" size="sm" onClick={refresh}>
            Try Again
          </Button>
        </div>
      )}

      {/* News List */}
      {news.length > 0 && (
        <div className="flex-1 space-y-4 overflow-y-auto">
          {news.map((item) => (
            <article key={item.id} className="pb-4 border-b border-border last:border-0">
              <h4 className="font-medium text-foreground text-sm leading-tight mb-2 line-clamp-2">
                {item.title}
              </h4>
              <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
                {item.summary}
              </p>
              <div className="flex items-center justify-between text-xs">
                <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 font-normal", getSourceColor(item.source))}>
                  {item.source}
                </Badge>
                <span className="flex items-center gap-1 text-muted-foreground">
                  <Clock className="w-3 h-3" />
                  {formatRelativeTime(item.timestamp)}
                </span>
              </div>
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-2 transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Read
              </a>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
