import { useState } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';

// Whitelisted YouTube channels with recent video IDs
// Videos should be from: Bloomberg Markets, CoinBureau, SimplyBitcoin, BitcoinHyper, ThomasKralow
const YOUTUBE_VIDEOS = [
  { 
    id: 'dQw4w9WgXcQ', // Placeholder - replace with actual video IDs from channels
    title: 'Bitcoin Market Analysis: Key Levels to Watch', 
    channel: 'Bloomberg Markets',
    channelId: 'UCIALMKvObZNtJ68-imOglZA'
  },
  { 
    id: 'Yj-1kp4sCwg',
    title: 'Crypto News: Major Market Movements', 
    channel: 'Coin Bureau',
    channelId: 'UCqK_GSMbpiV8spgD3ZGloSw'
  },
  { 
    id: '8zKuoqZLyKg',
    title: 'Bitcoin Deep Dive: On-Chain Analysis', 
    channel: 'Simply Bitcoin',
    channelId: 'UCplBs8FLAt-_rRqKwXqD1Mg'
  },
  { 
    id: 'JuQgPz6BnGk',
    title: 'Trading Strategies for Volatile Markets', 
    channel: 'Thomas Kralow',
    channelId: 'UC_jbuxkLpn0XMwH2ZOvS0gQ'
  },
];

export function VideoHighlights() {
  const [activeVideo, setActiveVideo] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const currentVideo = YOUTUBE_VIDEOS[activeVideo];

  return (
    <div className="card-terminal p-4 h-full">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-primary" />
          <h3 className="text-sm font-medium text-foreground">VIDEO HIGHLIGHTS</h3>
        </div>
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="p-1 hover:bg-muted rounded transition-colors"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <VolumeX className="w-4 h-4 text-muted-foreground" />
          ) : (
            <Volume2 className="w-4 h-4 text-primary" />
          )}
        </button>
      </div>

      {/* Main Video - YouTube Embed */}
      <div className="relative rounded-lg overflow-hidden mb-3 aspect-video bg-secondary">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${currentVideo.id}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${currentVideo.id}&controls=0&modestbranding=1&rel=0&showinfo=0`}
          title={currentVideo.title}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pointer-events-none">
          <p className="text-sm font-medium text-foreground line-clamp-1">
            {currentVideo.title}
          </p>
          <span className="text-xs text-primary">{currentVideo.channel}</span>
        </div>
        <div className="absolute top-2 right-2 bg-destructive text-destructive-foreground text-xs px-1.5 py-0.5 rounded font-medium">
          LIVE
        </div>
      </div>

      {/* Thumbnail Strip */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {YOUTUBE_VIDEOS.map((video, index) => (
          <button
            key={video.id}
            onClick={() => setActiveVideo(index)}
            className={`relative flex-shrink-0 w-20 h-12 rounded overflow-hidden transition-all ${
              index === activeVideo 
                ? 'ring-2 ring-primary' 
                : 'hover:ring-1 hover:ring-primary/50 opacity-70 hover:opacity-100'
            }`}
          >
            <img
              src={`https://img.youtube.com/vi/${video.id}/mqdefault.jpg`}
              alt={video.title}
              className="w-full h-full object-cover"
              loading="lazy"
            />
            {index === activeVideo && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                <Play className="w-4 h-4 text-primary fill-primary" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
