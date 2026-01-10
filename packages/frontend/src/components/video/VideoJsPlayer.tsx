import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import type  PlayerOptions  from 'video.js/dist/types/player';
import 'video.js/dist/video-js.css';

interface ClipMarker {
  id: string;
  startTime: number;
  endTime: number;
  label?: string;
}

interface VideoJsPlayerProps {
  src: string;
  poster?: string;
  clips?: ClipMarker[];
  onClipClick?: (clip: ClipMarker) => void;
  options?: PlayerOptions;
}



/**
 * Video.js Player Component with Clip Markers
 */
export default function VideoJsPlayer({
  src,
  poster,
  clips = [],
  onClipClick,
  options,
}: VideoJsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const playerRef = useRef<Player | null>(null);
  const markersAddedRef = useRef(false);

  /* -----------------------------------------------------
     Helper: determine video MIME type
  ----------------------------------------------------- */
  const getVideoType = (url: string): string => {
    if (url.endsWith('.mp4')) return 'video/mp4';
    if (url.endsWith('.webm')) return 'video/webm';
    if (url.endsWith('.ogg') || url.endsWith('.ogv')) return 'video/ogg';
    if (url.endsWith('.mkv')) return 'video/x-matroska';
    return 'video/mp4';
  };

  /* -----------------------------------------------------
     Initialize Video.js (ONLY ONCE)
  ----------------------------------------------------- */
  useEffect(() => {
    if (!videoRef.current || playerRef.current) return;
  
    let rafId: number;
  
    const tryInit = () => {
      const videoEl = videoRef.current;
      if (!videoEl) return;
  
      const isInDOM = document.body.contains(videoEl);
  
      if (!isInDOM) {
        rafId = requestAnimationFrame(tryInit);
        return;
      }
  
      const player = videojs(videoEl, {
        controls: true,
        preload: 'metadata',
        poster,
        sources: src
          ? [{ src, type: getVideoType(src) }]
          : [],
        html5: {
          vhs: { overrideNative: true },
          nativeVideoTracks: false,
          nativeAudioTracks: false,
          nativeTextTracks: false,
        },
        ...options,
      });
  
      playerRef.current = player;
      console.log('✅ Video.js initialized (DOM ready)');
    };
  
    tryInit();
  
    return () => {
      cancelAnimationFrame(rafId);
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []);
  

  /* -----------------------------------------------------
     Update source when `src` changes
  ----------------------------------------------------- */
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed() || !src) return;

    markersAddedRef.current = false;

    const onError = () => {
      console.error('Video.js error:', player.error());
    };

    const onLoadedMetadata = () => {
      console.log('Metadata loaded, duration:', player.duration());
    };

    player.src({ src, type: getVideoType(src) });
    player.load();

    player.on('error', onError);
    player.on('loadedmetadata', onLoadedMetadata);

    return () => {
      player.off('error', onError);
      player.off('loadedmetadata', onLoadedMetadata);
    };
  }, [src]);

  /* -----------------------------------------------------
     Update poster
  ----------------------------------------------------- */
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed()) return;

    if (poster) {
      player.poster(poster);
    }
  }, [poster]);

  /* -----------------------------------------------------
     Clip Markers Logic
  ----------------------------------------------------- */
  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed() || clips.length === 0) return;

    markersAddedRef.current = false;

    const addClipMarkers = () => {
      if (markersAddedRef.current) return;

      const duration = player.duration();
      if (typeof duration !== 'number' || duration <= 0) return;

      const progressControl =
        player.getChild('controlBar')?.getChild('progressControl');
      const seekBar = progressControl?.getChild('seekBar');
      const seekEl = seekBar?.el();

      if (!seekEl) return;

      // Clear existing markers
      seekEl
        .querySelectorAll('.vjs-clip-marker')
        .forEach(el => el.remove());

      clips.forEach(clip => {
        const marker = document.createElement('div');
        marker.className = 'vjs-clip-marker';
        marker.style.position = 'absolute';
        marker.style.left = `${(clip.startTime / duration) * 100}%`;
        marker.style.top = '0';
        marker.style.height = '100%';
        marker.style.width = '2px';
        marker.style.background = 'rgba(14,165,233,0.8)';
        marker.style.cursor = 'pointer';
        marker.style.zIndex = '10';
        marker.title =
          clip.label ??
          `${formatTime(clip.startTime)} - ${formatTime(clip.endTime)}`;

        marker.addEventListener('click', e => {
          e.preventDefault();
          e.stopPropagation();
          player.currentTime(clip.startTime);
          onClipClick?.(clip);
        });

        marker.addEventListener('mouseenter', () => {
          marker.style.width = '3px';
          marker.style.background = 'rgba(14,165,233,1)';
        });

        marker.addEventListener('mouseleave', () => {
          marker.style.width = '2px';
          marker.style.background = 'rgba(14,165,233,0.8)';
        });

        seekEl.appendChild(marker);
      });

      markersAddedRef.current = true;
    };

    player.on('loadedmetadata', addClipMarkers);
    player.on('durationchange', addClipMarkers);

    return () => {
      player.off('loadedmetadata', addClipMarkers);
      player.off('durationchange', addClipMarkers);
    };
  }, [clips, onClipClick]);

  /* -----------------------------------------------------
     Render
  ----------------------------------------------------- */
  return (
    <div data-vjs-player className="w-full h-full">
      <video
        ref={videoRef}
        className="video-js vjs-big-play-centered vjs-default-skin"
        playsInline
        style={{ width: '100%', height: '100%' }}
      />
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
