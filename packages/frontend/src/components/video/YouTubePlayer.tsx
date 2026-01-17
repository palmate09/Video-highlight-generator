import { useRef, useEffect, useState, useCallback } from 'react';

interface YouTubeClip {
    id?: string;
    startTime: number;
    endTime: number;
    label: string;
    confidence?: number;
    transcript?: string;
}

interface YouTubePlayerProps {
    videoId: string;
    clips?: YouTubeClip[];
    selectedClip?: YouTubeClip | null;
    onClipClick?: (clip: YouTubeClip) => void;
    autoplay?: boolean;
}

declare global {
    interface Window {
        YT: any;
        onYouTubeIframeAPIReady: () => void;
    }
}

/**
 * YouTube Embed Player with Clip Support
 * Uses YouTube IFrame API for timestamp-based playback
 */
export default function YouTubePlayer({
    videoId,
    clips = [],
    selectedClip = null,
    onClipClick,
    autoplay = false,
}: YouTubePlayerProps) {
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isReady, setIsReady] = useState(false);
    const [currentTime, setCurrentTime] = useState(0);
    const [duration, setDuration] = useState(0);
    const clipEndRef = useRef<number | null>(null);
    const intervalRef = useRef<NodeJS.Timeout | null>(null);

    // Load YouTube IFrame API
    useEffect(() => {
        if (window.YT && window.YT.Player) {
            initPlayer();
            return;
        }

        const tag = document.createElement('script');
        tag.src = 'https://www.youtube.com/iframe_api';
        const firstScriptTag = document.getElementsByTagName('script')[0];
        firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);

        window.onYouTubeIframeAPIReady = initPlayer;

        return () => {
            if (playerRef.current) {
                playerRef.current.destroy();
                playerRef.current = null;
            }
            if (intervalRef.current) {
                clearInterval(intervalRef.current);
            }
        };
    }, []);

    // Initialize player
    const initPlayer = useCallback(() => {
        if (!containerRef.current) return;

        playerRef.current = new window.YT.Player(containerRef.current, {
            videoId,
            playerVars: {
                autoplay: autoplay ? 1 : 0,
                modestbranding: 1,
                rel: 0,
                enablejsapi: 1,
                origin: window.location.origin,
            },
            events: {
                onReady: (event: any) => {
                    setIsReady(true);
                    setDuration(event.target.getDuration());
                    startTimeTracking();
                },
                onStateChange: (event: any) => {
                    // Check if we should stop at clip end
                    if (event.data === window.YT.PlayerState.PLAYING && clipEndRef.current !== null) {
                        startClipEndWatcher();
                    }
                },
            },
        });
    }, [videoId, autoplay]);

    // Track current time for progress bar
    const startTimeTracking = () => {
        if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        intervalRef.current = setInterval(() => {
            if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
                setCurrentTime(playerRef.current.getCurrentTime());
            }
        }, 500);
    };

    // Watch for clip end time
    const startClipEndWatcher = useCallback(() => {
        const checkEnd = () => {
            if (!playerRef.current || clipEndRef.current === null) return;

            const current = playerRef.current.getCurrentTime();
            if (current >= clipEndRef.current) {
                playerRef.current.pauseVideo();
                clipEndRef.current = null;
            } else {
                requestAnimationFrame(checkEnd);
            }
        };
        requestAnimationFrame(checkEnd);
    }, []);

    // Handle clip selection
    useEffect(() => {
        if (!isReady || !playerRef.current || !selectedClip) return;

        clipEndRef.current = selectedClip.endTime;
        playerRef.current.seekTo(selectedClip.startTime, true);
        playerRef.current.playVideo();
    }, [selectedClip, isReady]);

    // Update video when videoId changes
    useEffect(() => {
        if (!isReady || !playerRef.current) return;
        playerRef.current.loadVideoById(videoId);
    }, [videoId, isReady]);

    // Format time
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Calculate clip position on timeline
    const getClipPosition = (clip: YouTubeClip) => {
        if (duration === 0) return { left: '0%', width: '0%' };
        const left = (clip.startTime / duration) * 100;
        const width = ((clip.endTime - clip.startTime) / duration) * 100;
        return { left: `${left}%`, width: `${width}%` };
    };

    // Get confidence color
    const getConfidenceColor = (confidence?: number) => {
        if (!confidence) return 'bg-primary-500/60';
        if (confidence >= 0.7) return 'bg-emerald-500/70';
        if (confidence >= 0.4) return 'bg-amber-500/70';
        return 'bg-rose-500/70';
    };

    return (
        <div className="w-full space-y-4">
            {/* Video Player */}
            <div className="relative aspect-video bg-dark-900 rounded-xl overflow-hidden">
                <div
                    ref={containerRef}
                    className="w-full h-full"
                />
                {!isReady && (
                    <div className="absolute inset-0 flex items-center justify-center bg-dark-900">
                        <div className="w-8 h-8 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                )}
            </div>

            {/* Timeline with Clip Markers */}
            {clips.length > 0 && duration > 0 && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-dark-400">
                        <span>{formatTime(currentTime)}</span>
                        <span>{formatTime(duration)}</span>
                    </div>

                    {/* Progress bar with clip markers */}
                    <div className="relative h-10 bg-dark-800 rounded-lg overflow-hidden">
                        {/* Current time indicator */}
                        <div
                            className="absolute top-0 bottom-0 w-0.5 bg-white z-20 transition-all duration-200"
                            style={{ left: `${(currentTime / duration) * 100}%` }}
                        />

                        {/* Clip regions */}
                        {clips.map((clip, index) => {
                            const pos = getClipPosition(clip);
                            const isSelected = selectedClip?.startTime === clip.startTime &&
                                selectedClip?.endTime === clip.endTime;

                            return (
                                <button
                                    key={clip.id || index}
                                    onClick={() => onClipClick?.(clip)}
                                    className={`absolute top-1 bottom-1 rounded transition-all duration-200 hover:brightness-110 ${getConfidenceColor(clip.confidence)} ${isSelected ? 'ring-2 ring-white/50 brightness-125' : ''
                                        }`}
                                    style={{
                                        left: pos.left,
                                        width: pos.width,
                                    }}
                                    title={`${clip.label} (${formatTime(clip.startTime)} - ${formatTime(clip.endTime)})`}
                                >
                                    <span className="sr-only">{clip.label}</span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Legend */}
                    <div className="flex items-center gap-4 text-xs text-dark-400">
                        <div className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-emerald-500/70"></span>
                            <span>High confidence</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-amber-500/70"></span>
                            <span>Medium</span>
                        </div>
                        <div className="flex items-center gap-1">
                            <span className="w-3 h-3 rounded bg-rose-500/70"></span>
                            <span>Low</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
