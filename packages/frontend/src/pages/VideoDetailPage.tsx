import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { videoApi } from '@/services/api';
import VideoJsPlayer from '@/components/video/VideoJsPlayer';
import {
    ArrowLeft,
    Clock,
    Layers,
    FileText,
    Trash2,
    Check,
    AlertCircle,
    Loader2,
    Play,
    ChevronLeft,
    ChevronRight,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function VideoDetailPage() {
    const { id } = useParams<{ id: string }>();
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [clipsPage, setClipsPage] = useState(1);
    const clipsPerPage = 50;
    const [selectedClipId, setSelectedClipId] = useState<string | null>(null);

    const { data, isLoading } = useQuery({
        queryKey: ['video', id],
        queryFn: () => videoApi.getVideo(id!),
        enabled: !!id,
        refetchInterval: (query) => {
            const video = (query.state.data as any)?.data?.data;
            if (!video) return false;
            const isProcessing = ['PROCESSING', 'TRANSCRIBING', 'EMBEDDING', 'UPLOADING'].includes(video.status);
            return isProcessing ? 3000 : false;
        }
    });

    const video = data?.data?.data;
    const shouldLoadClips = video?.status === 'READY' && (video?.clipCount || 0) > 0;

    const { data: clipsData, isLoading: clipsLoading } = useQuery({
        queryKey: ['video-clips', id, clipsPage],
        queryFn: () => videoApi.getVideoClips(id!, { page: clipsPage, limit: clipsPerPage }),
        enabled: !!id && shouldLoadClips,
    });

    const clips = clipsData?.data?.data?.items || [];
    const clipsTotal = clipsData?.data?.data?.total || 0;
    const clipsTotalPages = clipsData?.data?.data?.totalPages || 0;

    const deleteMutation = useMutation({
        mutationFn: () => videoApi.deleteVideo(id!),
        onSuccess: () => {
            toast.success('Video deleted');
            queryClient.invalidateQueries({ queryKey: ['videos'] });
            navigate('/videos');
        },
        onError: () => {
            toast.error('Failed to delete video');
        },
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-24">
                <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
            </div>
        );
    }

    if (!video) {
        return (
            <div className="glass-card p-12 text-center">
                <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
                <h2 className="text-xl font-semibold text-dark-100 mb-2">
                    Video not found
                </h2>
                <button onClick={() => navigate('/videos')} className="btn-secondary mt-4">
                    Back to Library
                </button>
            </div>
        );
    }

    const formatDuration = (seconds: number | null) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const formatBytes = (bytes: string | number) => {
        const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
        if (b === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(b) / Math.log(k));
        return parseFloat((b / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    const handleClipClick = (clip: any) => {
        setSelectedClipId(clip.id);
        window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    return (
        <div className="space-y-6 animate-fade-up">
            {/* Back button */}
            <button
                onClick={() => navigate('/videos')}
                className="flex items-center gap-2 text-dark-400 hover:text-dark-100 transition-colors"
            >
                <ArrowLeft className="w-5 h-5" />
                Back to Library
            </button>

            {/* Video player section */}
            <div className="grid lg:grid-cols-3 gap-6">
                {/* Player */}
                <div className="lg:col-span-2">
                    <div className="glass-card overflow-hidden">
                        <div className="relative aspect-video bg-dark-900">
                            {video.status === 'READY' ? (
                                <VideoJsPlayer
                                    key={`video-${video.id}`}
                                    src={`/uploads/${video.filename}`}
                                    poster={video.thumbnailPath || undefined}
                                    clips={shouldLoadClips ? clips.map((clip: any, idx: number) => ({
                                        id: clip.id,
                                        startTime: clip.startTime,
                                        endTime: clip.endTime,
                                        label: clip.transcript?.substring(0, 50) || `Clip ${((clipsPage - 1) * clipsPerPage) + idx + 1}`,
                                    })) : []}
                                    onClipClick={handleClipClick}
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center">
                                    <div className="text-center">
                                        {['PROCESSING', 'TRANSCRIBING', 'EMBEDDING'].includes(video.status) ? (
                                            <>
                                                <Loader2 className="w-12 h-12 text-primary-400 animate-spin mx-auto mb-4" />
                                                <p className="text-dark-300">Processing video...</p>
                                                <p className="text-sm text-dark-500 mt-1">{video.status}</p>
                                            </>
                                        ) : (
                                            <>
                                                <AlertCircle className="w-12 h-12 text-rose-400 mx-auto mb-4" />
                                                <p className="text-dark-300">Video unavailable</p>
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Info panel */}
                <div className="space-y-4">
                    {/* Video info */}
                    <div className="glass-card p-6 space-y-4">
                        <h1 className="text-xl font-semibold text-dark-50 line-clamp-2">
                            {video.originalName}
                        </h1>

                        <div className="space-y-3">
                            <div className="flex items-center gap-3 text-dark-300">
                                <Clock className="w-4 h-4 text-dark-500" />
                                <span>Duration: {formatDuration(video.duration)}</span>
                            </div>
                            <div className="flex items-center gap-3 text-dark-300">
                                <Layers className="w-4 h-4 text-dark-500" />
                                <span>{video.clipCount || 0} clips detected</span>
                            </div>
                            <div className="flex items-center gap-3 text-dark-300">
                                <FileText className="w-4 h-4 text-dark-500" />
                                <span>Size: {formatBytes(video.size)}</span>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="pt-3 border-t border-dark-700">
                            {video.status === 'READY' ? (
                                <span className="badge-success">
                                    <Check className="w-3 h-3" />
                                    Ready
                                </span>
                            ) : video.status === 'FAILED' ? (
                                <span className="badge-error">
                                    <AlertCircle className="w-3 h-3" />
                                    Failed
                                </span>
                            ) : (
                                <span className="badge-warning">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    {video.status}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Actions */}
                    <div className="glass-card p-4 flex gap-3">
                        <button
                            onClick={() => deleteMutation.mutate()}
                            disabled={deleteMutation.isPending}
                            className="btn-danger flex-1"
                        >
                            <Trash2 className="w-4 h-4" />
                            Delete
                        </button>
                    </div>
                </div>
            </div>

            {/* Clips section */}
            {shouldLoadClips && (
                <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-dark-100">
                        Detected Clips ({clipsTotal})
                    </h2>
                    
                    {clipsLoading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-6 h-6 text-primary-400 animate-spin" />
                        </div>
                    ) : clips.length > 0 ? (
                        <>
                            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                {clips.map((clip: any, i: number) => (
                                    <div 
                                        key={clip.id} 
                                        className={`glass-card p-4 space-y-3 transition-all ${selectedClipId === clip.id ? 'ring-2 ring-primary-500/50' : ''}`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-sm font-medium text-primary-400">
                                                Clip {((clipsPage - 1) * clipsPerPage) + i + 1}
                                            </span>
                                            <span className="text-xs text-dark-400">
                                                {formatDuration(clip.endTime - clip.startTime)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <button
                                                onClick={() => handleClipClick(clip)}
                                                className="p-1.5 rounded-full bg-primary-500/10 text-primary-400 hover:bg-primary-500/20 transition-colors"
                                                title="Play clip"
                                            >
                                                <Play className="w-4 h-4" />
                                            </button>
                                            <div className="text-xs text-dark-400">
                                                {formatDuration(clip.startTime)} - {formatDuration(clip.endTime)}
                                            </div>
                                        </div>
                                        {clip.transcript && (
                                            <p className="text-sm text-dark-300 line-clamp-3">
                                                {clip.transcript}
                                            </p>
                                        )}
                                    </div>
                                ))}
                            </div>
                            
                            {/* Pagination */}
                            {clipsTotalPages > 1 && (
                                <div className="flex items-center justify-between pt-4">
                                    <button
                                        onClick={() => setClipsPage(p => Math.max(1, p - 1))}
                                        disabled={clipsPage === 1}
                                        className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        <ChevronLeft className="w-4 h-4" />
                                        Previous
                                    </button>
                                    <span className="text-sm text-dark-300">
                                        Page {clipsPage} of {clipsTotalPages}
                                    </span>
                                    <button
                                        onClick={() => setClipsPage(p => Math.min(clipsTotalPages, p + 1))}
                                        disabled={clipsPage >= clipsTotalPages}
                                        className="btn-secondary flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                        Next
                                        <ChevronRight className="w-4 h-4" />
                                    </button>
                                </div>
                            )}
                        </>
                    ) : (
                        <div className="glass-card p-8 text-center text-dark-400">
                            No clips found for this video.
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
