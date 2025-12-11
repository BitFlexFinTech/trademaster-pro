import { newsData } from '@/lib/mockData';
import { RefreshCw, ExternalLink, Clock } from 'lucide-react';

export function NewsSidebar() {
  return (
    <div className="card-terminal p-4 h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-semibold text-foreground">Crypto News</h3>
        <span className="flex items-center gap-1 text-xs text-muted-foreground">
          <RefreshCw className="w-3 h-3" />
          Auto-refresh 30m
        </span>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto">
        {newsData.map((news) => (
          <article key={news.id} className="pb-4 border-b border-border last:border-0">
            <h4 className="font-medium text-foreground text-sm leading-tight mb-2">
              {news.title}
            </h4>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {news.summary}
            </p>
            <div className="flex items-center justify-between text-xs">
              <span className="text-primary font-medium">{news.source}</span>
              <span className="flex items-center gap-1 text-muted-foreground">
                <Clock className="w-3 h-3" />
                {news.timestamp}
              </span>
            </div>
            <button className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary mt-2 transition-colors">
              <ExternalLink className="w-3 h-3" />
              Read
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
