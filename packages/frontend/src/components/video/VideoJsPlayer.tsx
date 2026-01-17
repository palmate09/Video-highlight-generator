import { useEffect, useRef } from 'react';
import videojs from 'video.js';
import type Player from 'video.js/dist/types/player';
import type PlayerOptions from 'video.js/dist/types/player';
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
  const videoRef = useRef<HTMLDivElement | null>(null);
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
    if (!videoRef.current || playerRef.current) {
      return;
    }

    // create <video-js> element manually (Strict mode safe)
    const videoEl = document.createElement('video-js');
    videoEl.classList.add(
      'video-js',
      'vjs-big-play-centered',
      'vjs-default-skin'
    );
    videoEl.style.width = '100%';
    videoEl.style.height = '100%';

    videoRef.current.appendChild(videoEl);

    const player = (playerRef.current = videojs(videoEl, {
      controls: true,
      preload: 'auto',
      poster,
      fluid: true,
      responsive: true,
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
    }));

    console.log('Video.js player initialized:', player);

    return () => {
      if (playerRef.current && !playerRef.current.isDisposed()) {
        playerRef.current.dispose();
        playerRef.current = null;
      }
    };
  }, []); // Empty dependency array - only run once on mount

  /* -----------------------------------------------------
     Update source when `src` changes
  ----------------------------------------------------- */

  useEffect(() => {
    const player = playerRef.current;
    if (!player || player.isDisposed() || !src) return;

    markersAddedRef.current = false;

    player.src({ src, type: getVideoType(src) });
    player.load();
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

        marker.onclick = e => {
          e.stopPropagation();
          player.currentTime(clip.startTime);
          onClipClick?.(clip);
        };

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
    <div data-vjs-player className="w-full" style={{ width: '100%' }}>
      <div ref={videoRef} style={{ width: '100%' }} />
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
