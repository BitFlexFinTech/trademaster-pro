import { useState, useCallback } from 'react';
import { Play, Volume2, VolumeX, SkipForward } from 'lucide-react';

// Curated list of crypto analysis videos (excluding SimplyBitcoin)
const YOUTUBE_VIDEOS = [
  { 
    id: 'gyMwXuJrbJQ',
    title: 'Crypto Market Analysis', 
    channel: 'Coin Bureau',
  },
  { 
    id: 'VYWc9dFqROI',
    title: 'Trading Strategies', 
    channel: 'Thomas Kralow',
  },
  { 
    id: 'rYQgy8QDEBI',
    title: 'Crypto News Update', 
    channel: 'Coin Bureau',
  },
  { 
    id: '41JCpzvnn_0',
    title: 'Bitcoin Analysis', 
    channel: 'Benjamin Cowen',
  },
  { 
    id: 'SSo_EIwHSd4',
    title: 'Market Overview', 
    channel: 'DataDash',
  },
];

export function VideoHighlights() {
  const [activeVideo, setActiveVideo] = useState(0);
  const [isMuted, setIsMuted] = useState(true);
  const [failedVideos, setFailedVideos] = useState<Set<number>>(new Set());

  // Get available videos (excluding failed ones)
  const availableVideos = YOUTUBE_VIDEOS.filter((_, index) => !failedVideos.has(index));
  const currentVideoIndex = availableVideos.length > 0 ? Math.min(activeVideo, availableVideos.length - 1) : 0;
  const currentVideo = availableVideos[currentVideoIndex] || YOUTUBE_VIDEOS[0];

  const handleVideoError = useCallback(() => {
    // Mark current video as failed and move to next
    const originalIndex = YOUTUBE_VIDEOS.findIndex(v => v.id === currentVideo.id);
    if (originalIndex !== -1) {
      setFailedVideos(prev => new Set([...prev, originalIndex]));
    }
    // Move to next available video
    if (currentVideoIndex < availableVideos.length - 1) {
      setActiveVideo(currentVideoIndex + 1);
    } else if (currentVideoIndex > 0) {
      setActiveVideo(0);
    }
  }, [currentVideo.id, currentVideoIndex, availableVideos.length]);

  const skipToNext = useCallback(() => {
    setActiveVideo((prev) => (prev + 1) % availableVideos.length);
  }, [availableVideos.length]);

  return (
    <div className="card-terminal p-3 h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Play className="w-4 h-4 text-primary" />
          <h3 className="text-xs font-medium text-foreground uppercase tracking-wide">Video Highlights</h3>
        </div>
        <div className="flex items-center gap-1">
          <button 
            onClick={skipToNext}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="Next video"
          >
            <SkipForward className="w-3.5 h-3.5 text-muted-foreground hover:text-primary" />
          </button>
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
      </div>

      {/* Main Video - YouTube Embed */}
      <div className="relative rounded-lg overflow-hidden flex-1 min-h-0 bg-secondary">
        <iframe
          key={currentVideo.id}
          src={`https://www.youtube-nocookie.com/embed/${currentVideo.id}?autoplay=1&mute=${isMuted ? 1 : 0}&loop=1&playlist=${currentVideo.id}&controls=0&modestbranding=1&rel=0&showinfo=0`}
          title={currentVideo.title}
          className="absolute inset-0 w-full h-full"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          loading="lazy"
          onError={handleVideoError}
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
        {availableVideos.map((video, index) => (
          <button
            key={video.id}
            onClick={() => setActiveVideo(index)}
            className={`relative flex-shrink-0 w-16 h-10 rounded overflow-hidden transition-all ${
              index === currentVideoIndex 
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
            {index === currentVideoIndex && (
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
