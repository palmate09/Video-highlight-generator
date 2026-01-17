import { useEffect, useRef, useState } from 'react';
import Hls from 'hls.js';

interface ClipMarker {
  id: string;
  startTime: number;
  endTime: number;
  label?: string;
}

interface ShakaVideoPlayerProps {
  src: string; // HLS (.m3u8)
  poster?: string;
  clips?: ClipMarker[];
  onClipClick?: (clip: ClipMarker) => void;
}

/**
 * HLS Player Component with Clip Markers
 */
export default function ShakaVideoPlayer({
  src,
  poster,
  clips = [],
  onClipClick,
}: ShakaVideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const hlsRef = useRef<Hls | null>(null);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  /* -----------------------------------------------------
      Initialize HLS Player when src changes
   ----------------------------------------------------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 90,
      });

      hls.loadSource(src);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        console.log('HLS manifest parsed');
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        console.error('HLS error:', data);
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              hls.startLoad();
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              hls.destroy();
              break;
          }
        }
      });

      hlsRef.current = hls;

      return () => {
        hls.destroy();
        hlsRef.current = null;
      };
    } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS support (Safari)
      video.src = src;
    }
  }, [src]);

  /* -----------------------------------------------------
      Update poster
   ----------------------------------------------------- */
  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.poster = poster || '';
    }
  }, [poster]);

  /* -----------------------------------------------------
      Video event listeners
   ----------------------------------------------------- */
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleLoadedMetadata = () => {
      setDuration(video.duration);
    };

    const handleTimeUpdate = () => {
      setCurrentTime(video.currentTime);
    };

    const handlePlay = () => setIsPlaying(true);
    const handlePause = () => setIsPlaying(false);

    video.addEventListener('loadedmetadata', handleLoadedMetadata);
    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', handlePlay);
    video.addEventListener('pause', handlePause);

    return () => {
      video.removeEventListener('loadedmetadata', handleLoadedMetadata);
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', handlePlay);
      video.removeEventListener('pause', handlePause);
    };
  }, []);

  /* -----------------------------------------------------
      Handle seek
   ----------------------------------------------------- */
  const handleSeek = (event: React.MouseEvent<HTMLDivElement>) => {
    const video = videoRef.current;
    if (!video || duration === 0) return;

    const rect = event.currentTarget.getBoundingClientRect();
    const clickX = event.clientX - rect.left;
    const percentage = clickX / rect.width;
    const newTime = percentage * duration;

    video.currentTime = newTime;
  };

  /* -----------------------------------------------------
      Handle play/pause
   ----------------------------------------------------- */
  const togglePlayPause = () => {
    const video = videoRef.current;
    if (!video) return;

    if (isPlaying) {
      video.pause();
    } else {
      video.play();
    }
  };

  /* -----------------------------------------------------
      Render
   ----------------------------------------------------- */
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className="relative w-full h-full bg-black">
      <video
        ref={videoRef}
        className="w-full h-full"
        poster={poster}
        crossOrigin="anonymous"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Custom Controls Overlay */}
      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
        {/* Play/Pause Button */}
        <div className="flex items-center justify-center mb-2">
          <button
            onClick={togglePlayPause}
            className="bg-white/20 hover:bg-white/30 rounded-full p-3 text-white"
          >
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M6 4h4v16H6V4zM14 4h4v16h-4V4z" />
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>
        </div>

        {/* Progress Bar with Markers */}
        <div
          className="relative h-2 bg-white/30 rounded cursor-pointer"
          onClick={handleSeek}
        >
          {/* Progress */}
          <div
            className="absolute top-0 left-0 h-full bg-blue-500 rounded"
            style={{ width: `${progress}%` }}
          />

          {/* Clip Markers */}
          {duration > 0 && clips.map((clip) => (
            <div
              key={clip.id}
              className="absolute top-0 h-full w-1 bg-red-500 cursor-pointer hover:w-2 transition-all"
              style={{ left: `${(clip.startTime / duration) * 100}%` }}
              title={clip.label || `${formatTime(clip.startTime)} - ${formatTime(clip.endTime)}`}
              onClick={(e) => {
                e.stopPropagation();
                const video = videoRef.current;
                if (video) video.currentTime = clip.startTime;
                onClipClick?.(clip);
              }}
            />
          ))}
        </div>

        {/* Time Display */}
        <div className="flex justify-between text-white text-sm mt-1">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>
  );
}

/* -----------------------------------------------------
    Utilities
 ----------------------------------------------------- */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}