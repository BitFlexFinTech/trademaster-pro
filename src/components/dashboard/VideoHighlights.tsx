import { useState } from 'react';
import { Play, Volume2, VolumeX } from 'lucide-react';

// Real YouTube video IDs from whitelisted channels (recent videos)
// Bloomberg Markets, Coin Bureau, Simply Bitcoin, Thomas Kralow
const YOUTUBE_VIDEOS = [
  { 
    id: 'Lhf_2gJJS1I', // Bitcoin analysis video
    title: 'Bitcoin Analysis: Breaking Key Resistance', 
    channel: 'Bloomberg Crypto',
  },
  { 
    id: 'gyMwXuJrbJQ', // Coin Bureau crypto update
    title: 'Crypto News: Major Market Movements', 
    channel: 'Coin Bureau',
  },
  { 
    id: 'oYGN1dt5F3Q', // Simply Bitcoin
    title: 'Bitcoin Deep Dive: On-Chain Analysis', 
    channel: 'Simply Bitcoin',
  },
  { 
    id: 'VYWc9dFqROI', // Thomas Kralow trading
    title: 'Trading Strategies for Volatile Markets', 
    channel: 'Thomas Kralow',
  },
];

export function VideoHighlights() {
  const [activeVideo, setActiveVideo] = useState(0);
  const [isMuted, setIsMuted] = useState(true);

  const currentVideo = YOUTUBE_VIDEOS[activeVideo];

  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-medium text-foreground uppercase tracking-wide">Video Highlights</h3>
        </div>
        <button 
          onClick={() => setIsMuted(!isMuted)}
          className="p-1 hover:bg-muted rounded transition-colors"
          title={isMuted ? "Unmute" : "Mute"}
        >
          {isMuted ? (
            <VolumeX className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <Volume2 className="w-3.5 h-3.5 text-primary" />
          )}
        </button>
      </div>

      {/* Main Video - YouTube Embed */}
      <div className="relative rounded-lg overflow-hidden flex-1 min-h-0 bg-secondary">
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${currentVideo.id}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${currentVideo.id}&controls=0&modestbranding=1&rel=0&showinfo=0`}
          title={currentVideo.title}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
        />
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2 pointer-events-none">
          <p className="text-xs font-medium text-foreground truncate">
            {currentVideo.title}
          </p>
          <span className="text-[10px] text-primary">{currentVideo.channel}</span>
        </div>
      </div>

      {/* Thumbnail Strip */}
      <div className="flex gap-1.5 mt-2 overflow-x-auto pb-0.5">
        {YOUTUBE_VIDEOS.map((video, index) => (
          <button
            key={video.id}
            onClick={() => setActiveVideo(index)}
            className={`relative flex-shrink-0 w-16 h-10 rounded overflow-hidden transition-all ${
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
                <Play className="w-3 h-3 text-primary fill-primary" />
              </div>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
