import { useState, useCallback } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { youtubeApi, highlightApi } from '@/services/api';
import YouTubePlayer from '@/components/video/YouTubePlayer';
import {
    Youtube,
    Sparkles,
    Play,
    Clock,
    Save,
    Loader2,
    AlertCircle,
    CheckCircle,
    ChevronDown,
    ChevronUp,
    Copy,
    ExternalLink,
    Settings2,
    Layers,
} from 'lucide-react';
import toast from 'react-hot-toast';

interface YouTubeClip {
    id?: string;
    videoId: string;
    start: number;
    end: number;
    label: string;
    confidence: number;
    transcript?: string;
    embedUrl?: string;
}

interface AnalyzeResult {
    videoId: string;
    title: string;
    channelTitle: string;
    duration: number;
    transcriptSegments: number;
    clips: YouTubeClip[];
}

export default function YouTubeClipPage() {
    const queryClient = useQueryClient();
    const [url, setUrl] = useState('');
    const [result, setResult] = useState<AnalyzeResult | null>(null);
    const [selectedClip, setSelectedClip] = useState<YouTubeClip | null>(null);
    const [expandedClips, setExpandedClips] = useState<Set<number>>(new Set());
    const [showSettings, setShowSettings] = useState(false);
    const [settings, setSettings] = useState({
        minClipDuration: 15,
        maxClipDuration: 120,
        maxClips: 5,
    });

    // Analyze YouTube video
    const analyzeMutation = useMutation({
        mutationFn: (data: { url: string; minClipDuration: number; maxClipDuration: number; maxClips: number }) =>
            youtubeApi.analyzeVideo(data),
        onSuccess: (response) => {
            const data = response.data.data as AnalyzeResult;
            setResult(data);
            if (data.clips.length > 0) {
                toast.success(`Found ${data.clips.length} meaningful clips!`);
            } else {
                toast.success('Analysis complete, but no significant clips were detected.');
            }
        },
        onError: (error: any) => {
            const message = error.response?.data?.error || 'Failed to analyze video';
            toast.error(message);
        },
    });

    // Save clips to account
    const saveMutation = useMutation({
        mutationFn: () => {
            if (!result) throw new Error('No result to save');
            return youtubeApi.saveClips({
                videoId: result.videoId,
                title: result.title,
                clips: result.clips.map(c => ({
                    start: c.start,
                    end: c.end,
                    label: c.label,
                    confidence: c.confidence,
                    transcript: c.transcript,
                })),
            });
        },
        onSuccess: () => {
            toast.success('Clips saved to your library!');
            queryClient.invalidateQueries({ queryKey: ['youtube-videos'] });
        },
        onError: (error: any) => {
            const message = error.response?.data?.error || 'Failed to save clips';
            toast.error(message);
        },
    });

    // Fetch saved YouTube videos
    const { data: savedVideosData } = useQuery({
        queryKey: ['youtube-videos'],
        queryFn: () => youtubeApi.getVideos(),
    });

    const [selectedClipIndices, setSelectedClipIndices] = useState<Set<number>>(new Set());
    const [isCreatingHighlight, setIsCreatingHighlight] = useState(false);
    const [highlightName, setHighlightName] = useState('');

    const savedVideos = savedVideosData?.data?.data?.items || [];

    // Fetch saved video details
    const getSavedVideoMutation = useMutation({
        mutationFn: (id: string) => youtubeApi.getVideo(id),
        onSuccess: (response) => {
            const video = response.data.data;
            setResult({
                videoId: video.videoId,
                title: video.title,
                channelTitle: "Saved Video",
                duration: 0,
                transcriptSegments: 0,
                clips: video.clips.map((c: any) => ({
                    id: c.id,
                    videoId: video.videoId,
                    start: c.startTime,
                    end: c.endTime,
                    label: c.label,
                    confidence: c.confidence,
                    transcript: c.transcript,
                    embedUrl: c.embedUrl
                }))
            });
            setUrl(`https://www.youtube.com/watch?v=${video.videoId}`);
            toast.success('Loaded saved clips!');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        },
        onError: (error: any) => {
            const message = error.response?.data?.error || 'Failed to load saved video';
            toast.error(message);
        }
    });

    // Create Highlight Reel
    const createHighlightMutation = useMutation({
        mutationFn: async () => {
            const selectedClips = result!.clips.filter((_, i) => selectedClipIndices.has(i));
            if (selectedClips.length === 0) throw new Error("No clips selected");

            // Verify clips are saved (have ID)
            if (selectedClips.some(c => !c.id)) {
                throw new Error("Please save the clips first before creating a highlight.");
            }

            return highlightApi.createHighlight({
                name: highlightName || `Highlight from ${result!.title}`,
                clips: selectedClips.map(c => ({
                    youtubeClipId: c.id,
                    startTime: c.start,
                    endTime: c.end
                }))
            });
        },
        onSuccess: () => {
            toast.success('Highlight generation started! Check "Highlights" page.');
            setSelectedClipIndices(new Set());
            setIsCreatingHighlight(false);
            setHighlightName('');
        },
        onError: (err: any) => toast.error(err.response?.data?.error || err.message)
    });

    const toggleClipSelection = (index: number) => {
        const newSet = new Set(selectedClipIndices);
        if (newSet.has(index)) newSet.delete(index);
        else newSet.add(index);
        setSelectedClipIndices(newSet);
    };

    // Handle form submit
    const handleAnalyze = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (!url.trim()) {
            toast.error('Please enter a YouTube URL');
            return;
        }
        setResult(null);
        setSelectedClip(null);
        analyzeMutation.mutate({
            url: url.trim(),
            ...settings,
        });
    }, [url, settings, analyzeMutation]);

    // Format duration
    const formatDuration = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    // Toggle clip expansion
    const toggleClipExpansion = (index: number) => {
        const newExpanded = new Set(expandedClips);
        if (newExpanded.has(index)) {
            newExpanded.delete(index);
        } else {
            newExpanded.add(index);
        }
        setExpandedClips(newExpanded);
    };

    // Copy embed URL
    const copyEmbedUrl = (clip: YouTubeClip) => {
        const embedUrl = `https://www.youtube.com/embed/${clip.videoId}?start=${Math.floor(clip.start)}&end=${Math.floor(clip.end)}&autoplay=1`;
        navigator.clipboard.writeText(embedUrl);
        toast.success('Embed URL copied to clipboard!');
    };

    // Get confidence badge
    const getConfidenceBadge = (confidence: number) => {
        if (confidence >= 0.7) {
            return <span className="badge-success">High</span>;
        }
        if (confidence >= 0.4) {
            return <span className="badge-warning">Medium</span>;
        }
        return <span className="badge-error">Low</span>;
    };

    return (
        <div className="space-y-8 animate-fade-up">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold text-gradient flex items-center gap-3">
                        <Youtube className="w-8 h-8" />
                        YouTube Clip Generator
                    </h1>
                    <p className="text-dark-400 mt-2">
                        Automatically detect and generate meaningful clips from any YouTube video
                    </p>
                </div>
            </div>

            {/* URL Input Form */}
            <div className="glass-card p-6 space-y-4">
                <form onSubmit={handleAnalyze} className="space-y-4">
                    <div className="flex gap-4">
                        <div className="flex-1">
                            <label htmlFor="youtube-url" className="label">
                                YouTube Video URL
                            </label>
                            <input
                                id="youtube-url"
                                type="text"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                                placeholder="https://www.youtube.com/watch?v=..."
                                className="input"
                                disabled={analyzeMutation.isPending}
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            <button
                                type="button"
                                onClick={() => setShowSettings(!showSettings)}
                                className="btn-secondary"
                            >
                                <Settings2 className="w-4 h-4" />
                            </button>
                            <button
                                type="submit"
                                disabled={analyzeMutation.isPending || !url.trim()}
                                className="btn-primary"
                            >
                                {analyzeMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Analyzing...
                                    </>
                                ) : (
                                    <>
                                        <Sparkles className="w-4 h-4" />
                                        Analyze Video
                                    </>
                                )}
                            </button>
                        </div>
                    </div>

                    {/* Settings Panel */}
                    {showSettings && (
                        <div className="grid sm:grid-cols-3 gap-4 p-4 bg-dark-800/50 rounded-xl border border-dark-700">
                            <div>
                                <label className="label">Min Clip Duration (seconds)</label>
                                <input
                                    type="number"
                                    min={5}
                                    max={60}
                                    value={settings.minClipDuration}
                                    onChange={(e) => setSettings(s => ({ ...s, minClipDuration: parseInt(e.target.value) || 15 }))}
                                    className="input"
                                />
                            </div>
                            <div>
                                <label className="label">Max Clip Duration (seconds)</label>
                                <input
                                    type="number"
                                    min={30}
                                    max={300}
                                    value={settings.maxClipDuration}
                                    onChange={(e) => setSettings(s => ({ ...s, maxClipDuration: parseInt(e.target.value) || 120 }))}
                                    className="input"
                                />
                            </div>
                            <div>
                                <label className="label">Max Number of Clips</label>
                                <input
                                    type="number"
                                    min={1}
                                    max={10}
                                    value={settings.maxClips}
                                    onChange={(e) => setSettings(s => ({ ...s, maxClips: parseInt(e.target.value) || 5 }))}
                                    className="input"
                                />
                            </div>
                        </div>
                    )}
                </form>

                {/* Analysis Progress */}
                {analyzeMutation.isPending && (
                    <div className="flex items-center gap-3 text-dark-300 animate-pulse">
                        <div className="w-4 h-4 border-2 border-primary-500 border-t-transparent rounded-full animate-spin" />
                        <span>Fetching video transcript and analyzing content...</span>
                    </div>
                )}
            </div>

            {/* Results Section */}
            {result && (
                <div className="grid lg:grid-cols-3 gap-6">
                    {/* Player Column */}
                    <div className="lg:col-span-2 space-y-4">
                        <div className="glass-card p-4">
                            <YouTubePlayer
                                videoId={result.videoId}
                                clips={result.clips.map(c => ({
                                    startTime: c.start,
                                    endTime: c.end,
                                    label: c.label,
                                    confidence: c.confidence,
                                    transcript: c.transcript,
                                }))}
                                selectedClip={selectedClip ? {
                                    startTime: selectedClip.start,
                                    endTime: selectedClip.end,
                                    label: selectedClip.label,
                                    confidence: selectedClip.confidence,
                                } : null}
                                onClipClick={(clip) => {
                                    const fullClip = result.clips.find(c =>
                                        c.start === clip.startTime && c.end === clip.endTime
                                    );
                                    if (fullClip) setSelectedClip(fullClip);
                                }}
                            />
                        </div>

                        {/* Video Info */}
                        <div className="glass-card p-4 space-y-3">
                            <h2 className="text-xl font-semibold text-dark-100 line-clamp-2">
                                {result.title}
                            </h2>
                            <div className="flex flex-wrap gap-4 text-sm text-dark-400">
                                <span className="flex items-center gap-1">
                                    <Youtube className="w-4 h-4" />
                                    {result.channelTitle}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Clock className="w-4 h-4" />
                                    {formatDuration(result.duration)}
                                </span>
                                <span className="flex items-center gap-1">
                                    <Layers className="w-4 h-4" />
                                    {result.clips.length} clips detected
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Clips List Column */}
                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h3 className="text-lg font-semibold text-dark-100">
                                Generated Clips
                            </h3>
                            <div className="flex gap-2">
                                {selectedClipIndices.size > 0 && result.clips.some(c => !!c.id) && (
                                    <button
                                        onClick={() => setIsCreatingHighlight(!isCreatingHighlight)}
                                        className={`btn-sm ${isCreatingHighlight ? 'btn-primary' : 'btn-secondary'}`}
                                    >
                                        <Sparkles className="w-4 h-4" />
                                        {isCreatingHighlight ? 'Cancel' : `Create Reel (${selectedClipIndices.size})`}
                                    </button>
                                )}
                                <button
                                    onClick={() => saveMutation.mutate()}
                                    disabled={saveMutation.isPending || result.clips.length === 0}
                                    className="btn-secondary btn-sm"
                                >
                                    {saveMutation.isPending ? (
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                    ) : (
                                        <Save className="w-4 h-4" />
                                    )}
                                    Save Clips
                                </button>
                            </div>
                        </div>

                        {isCreatingHighlight && (
                            <div className="glass-card p-4 space-y-3 animate-fade-in">
                                <label className="label">Highlight Reel Name</label>
                                <div className="flex gap-2">
                                    <input
                                        type="text"
                                        value={highlightName}
                                        onChange={(e) => setHighlightName(e.target.value)}
                                        placeholder={`Highlight from ${result.title.substring(0, 30)}...`}
                                        className="input flex-1"
                                    />
                                    <button
                                        onClick={() => createHighlightMutation.mutate()}
                                        disabled={createHighlightMutation.isPending}
                                        className="btn-primary whitespace-nowrap"
                                    >
                                        {createHighlightMutation.isPending ? (
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                        ) : (
                                            <Sparkles className="w-4 h-4" />
                                        )}
                                        Generate
                                    </button>
                                </div>
                            </div>
                        )}

                        {result.clips.length === 0 ? (
                            <div className="glass-card p-8 text-center">
                                <AlertCircle className="w-12 h-12 text-dark-500 mx-auto mb-3" />
                                <p className="text-dark-400">
                                    No significant clips detected in this video.
                                    Try adjusting the settings or use a video with clearer structure.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                                {result.clips.map((clip, index) => {
                                    const isExpanded = expandedClips.has(index);
                                    const isSelected = selectedClip?.start === clip.start &&
                                        selectedClip?.end === clip.end;

                                    return (
                                        <div
                                            key={index}
                                            className={`glass-card p-4 space-y-3 transition-all cursor-pointer ${isSelected ? 'ring-2 ring-primary-500/50 bg-primary-500/5' : 'hover:bg-dark-800/50'
                                                }`}
                                            onClick={() => setSelectedClip(clip)}
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={selectedClipIndices.has(index)}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleClipSelection(index);
                                                        }}
                                                        onChange={() => { }}
                                                        className="w-4 h-4 rounded border-dark-600 bg-dark-700 text-primary-500 focus:ring-primary-500/50 cursor-pointer"
                                                    />
                                                    <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-primary-500/20 text-primary-400 text-xs font-medium">
                                                        {index + 1}
                                                    </span>
                                                    {getConfidenceBadge(clip.confidence)}
                                                </div>
                                                <div className="flex items-center gap-1">
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            copyEmbedUrl(clip);
                                                        }}
                                                        className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-dark-100 transition-colors"
                                                        title="Copy embed URL"
                                                    >
                                                        <Copy className="w-4 h-4" />
                                                    </button>
                                                    <a
                                                        href={`https://www.youtube.com/watch?v=${clip.videoId}&t=${Math.floor(clip.start)}`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        onClick={(e) => e.stopPropagation()}
                                                        className="p-1.5 rounded-lg hover:bg-dark-700 text-dark-400 hover:text-dark-100 transition-colors"
                                                        title="Open in YouTube"
                                                    >
                                                        <ExternalLink className="w-4 h-4" />
                                                    </a>
                                                </div>
                                            </div>

                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2 text-xs text-dark-400">
                                                    <Play className="w-3 h-3" />
                                                    <span>{formatDuration(clip.start)} - {formatDuration(clip.end)}</span>
                                                    <span className="text-dark-500">
                                                        ({formatDuration(clip.end - clip.start)})
                                                    </span>
                                                </div>
                                                <p className="text-sm text-dark-200 line-clamp-2">
                                                    {clip.label}
                                                </p>
                                            </div>

                                            {clip.transcript && (
                                                <div>
                                                    <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            toggleClipExpansion(index);
                                                        }}
                                                        className="flex items-center gap-1 text-xs text-primary-400 hover:text-primary-300"
                                                    >
                                                        {isExpanded ? (
                                                            <>
                                                                <ChevronUp className="w-3 h-3" />
                                                                Hide transcript
                                                            </>
                                                        ) : (
                                                            <>
                                                                <ChevronDown className="w-3 h-3" />
                                                                Show transcript
                                                            </>
                                                        )}
                                                    </button>
                                                    {isExpanded && (
                                                        <p className="mt-2 text-xs text-dark-400 bg-dark-800/50 p-3 rounded-lg">
                                                            {clip.transcript}
                                                        </p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Saved Videos Section */}
            {savedVideos.length > 0 && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-dark-100">
                        Saved YouTube Clips
                    </h2>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                        {savedVideos.map((video: any) => (
                            <div
                                key={video.id}
                                className="glass-card-hover overflow-hidden cursor-pointer"
                                onClick={() => {
                                    getSavedVideoMutation.mutate(video.id);
                                }}
                            >
                                <div className="aspect-video relative">
                                    <img
                                        src={video.thumbnailUrl}
                                        alt={video.title}
                                        className="w-full h-full object-cover"
                                    />
                                    <div className="absolute inset-0 bg-gradient-to-t from-dark-900/80 to-transparent" />
                                    <span className="absolute bottom-2 right-2 badge-primary">
                                        {video.clipCount} clips
                                    </span>
                                </div>
                                <div className="p-4">
                                    <h3 className="font-medium text-dark-100 line-clamp-2 text-sm">
                                        {video.title}
                                    </h3>
                                    <p className="text-xs text-dark-500 mt-1">
                                        {new Date(video.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!result && !analyzeMutation.isPending && (
                <div className="glass-card p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gradient-to-br from-primary-500/20 to-secondary-500/20 mb-6">
                        <Youtube className="w-8 h-8 text-primary-400" />
                    </div>
                    <h2 className="text-xl font-semibold text-dark-100 mb-3">
                        Generate Clips from YouTube Videos
                    </h2>
                    <p className="text-dark-400 max-w-lg mx-auto mb-6">
                        Paste any YouTube video URL above to automatically detect important moments
                        and generate timestamp-based clips. No downloading or video processing required!
                    </p>
                    <div className="flex flex-wrap justify-center gap-4 text-sm text-dark-500">
                        <span className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                            AI-powered analysis
                        </span>
                        <span className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                            No video download
                        </span>
                        <span className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-emerald-400" />
                            Instant results
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
}
