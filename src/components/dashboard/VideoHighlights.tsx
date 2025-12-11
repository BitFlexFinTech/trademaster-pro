import { Play, Volume2 } from 'lucide-react';

const videoThumbnails = [
  { id: 1, title: 'Bitcoin Analysis: Breaking Key Resistance', channel: 'Bloomberg Crypto', thumbnail: 'https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=400&h=225&fit=crop' },
  { id: 2, title: 'Crypto Market Update', channel: 'CoinBureau', thumbnail: 'https://images.unsplash.com/photo-1518546305927-5a555bb7020d?w=200&h=112&fit=crop' },
  { id: 3, title: 'DeFi Deep Dive', channel: 'SimplyBitcoin', thumbnail: 'https://images.unsplash.com/photo-1621761191319-c6fb62004040?w=200&h=112&fit=crop' },
  { id: 4, title: 'Trading Strategies', channel: 'ThomasKralow', thumbnail: 'https://images.unsplash.com/photo-1642790106117-e829e14a795f?w=200&h=112&fit=crop' },
];

export function VideoHighlights() {
  return (
    <div className="card-terminal p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">VIDEO HIGHLIGHTS</h3>
        </div>
        <div className="flex items-center gap-2">
          <Volume2 className="w-4 h-4 text-muted-foreground" />
        </div>
      </div>

      {/* Main Video */}
      <div className="relative rounded-lg overflow-hidden mb-3 aspect-video bg-secondary">
        <img
          src={videoThumbnails[0].thumbnail}
          alt={videoThumbnails[0].title}
          className="w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
        <div className="absolute bottom-2 left-2 right-2">
          <p className="text-sm font-medium text-foreground line-clamp-1">
            {videoThumbnails[0].title}
          </p>
          <span className="text-xs text-primary">{videoThumbnails[0].channel}</span>
        </div>
        <div className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-xs px-1 rounded">
          ▶
        </div>
      </div>

      {/* Thumbnail Strip */}
      <div className="flex gap-2 overflow-x-auto">
        {videoThumbnails.slice(1).map((video) => (
          <div
            key={video.id}
            className="relative flex-shrink-0 w-20 h-12 rounded overflow-hidden cursor-pointer hover:ring-1 hover:ring-primary transition-all"
          >
            <img
              src={video.thumbnail}
              alt={video.title}
              className="w-full h-full object-cover"
            />
          </div>
        ))}
      </div>
    </div>
  );
}
