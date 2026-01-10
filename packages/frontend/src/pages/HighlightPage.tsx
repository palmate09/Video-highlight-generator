import { useState, useEffect } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { highlightApi } from '@/services/api';
import { useHighlightStore } from '@/store/highlightStore';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import SortableClipItem from '@/components/highlight/SortableClipItem';
import {
    Star,
    Plus,
    Download,
    Loader2,
    ArrowLeft,
    Check,
    Clock,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function HighlightPage() {
    const { id } = useParams<{ id: string }>();
    const location = useLocation();
    const navigate = useNavigate();
    const isNew = !id;

    const {
        name,
        clips,
        isCreating,
        setName,
        addClip,
        removeClip,
        reorderClips,
        reset,
        setIsCreating,
    } = useHighlightStore();

    // Drag and drop sensors
    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = (event: DragEndEvent) => {
        const { active, over } = event;

        if (over && active.id !== over.id) {
            const oldIndex = clips.findIndex((c) => c.id === active.id);
            const newIndex = clips.findIndex((c) => c.id === over.id);
            reorderClips(oldIndex, newIndex);
        }
    };

    // Load clips from search page if navigated with state
    useEffect(() => {
        if (location.state?.selectedClips && location.state?.results) {
            const { selectedClips, results } = location.state;
            results.forEach((result: any) => {
                if (selectedClips.includes(result.clip.id)) {
                    addClip({
                        id: result.clip.id,
                        clipId: result.clip.id,
                        videoId: result.clip.videoId,
                        startTime: result.clip.startTime,
                        endTime: result.clip.endTime,
                        transcript: result.clip.transcript,
                        videoName: result.clip.video.originalName,
                        thumbnailPath: result.clip.video.thumbnailPath,
                    });
                }
            });
            // Clear location state
            window.history.replaceState({}, document.title);
        }
    }, [location.state, addClip]);

    // Fetch existing highlight
    const { data: highlightData, isLoading: highlightLoading } = useQuery({
        queryKey: ['highlight', id],
        queryFn: () => highlightApi.getHighlight(id!),
        enabled: !!id,
    });

    const highlight = highlightData?.data?.data;

    // Create mutation
    const createMutation = useMutation({
        mutationFn: () =>
            highlightApi.createHighlight({
                name,
                clips: clips.map((c) => ({
                    clipId: c.clipId,
                    videoId: c.videoId,
                    startTime: c.startTime,
                    endTime: c.endTime,
                })),
            }),
        onSuccess: (data) => {
            toast.success('Highlight created! Processing...');
            reset();
            navigate(`/highlights/${data.data.data.id}`);
        },
        onError: (error: any) => {
            toast.error(error.response?.data?.error || 'Failed to create highlight');
        },
    });

    // Download mutation
    const downloadMutation = useMutation({
        mutationFn: () => highlightApi.getDownloadUrl(id!),
        onSuccess: (data) => {
            const { url, filename } = data.data.data;
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            link.click();
        },
        onError: () => {
            toast.error('Download not ready yet');
        },
    });

    const handleCreate = () => {
        if (!name.trim()) {
            toast.error('Please enter a name for your highlight');
            return;
        }
        if (clips.length === 0) {
            toast.error('Please add at least one clip');
            return;
        }
        createMutation.mutate();
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const totalDuration = clips.reduce((acc, clip) => acc + (clip.endTime - clip.startTime), 0);

    // Viewing existing highlight
    if (id && highlight) {
        return (
            <div className="space-y-6 animate-fade-up">
                <button
                    onClick={() => navigate('/highlights')}
                    className="flex items-center gap-2 text-dark-400 hover:text-dark-100 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5" />
                    Back to Highlights
                </button>

                <div className="glass-card p-6 space-y-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-display font-bold text-dark-50">
                                {highlight.name}
                            </h1>
                            <p className="text-dark-400 mt-1">
                                {highlight.clips?.length || 0} clips • Created{' '}
                                {new Date(highlight.createdAt).toLocaleDateString()}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            {highlight.status === 'READY' && (
                                <button
                                    onClick={() => downloadMutation.mutate()}
                                    disabled={downloadMutation.isPending}
                                    className="btn-primary"
                                >
                                    {downloadMutation.isPending ? (
                                        <Loader2 className="w-5 h-5 animate-spin" />
                                    ) : (
                                        <>
                                            <Download className="w-5 h-5" />
                                            Download
                                        </>
                                    )}
                                </button>
                            )}
                            {highlight.status === 'PROCESSING' && (
                                <span className="badge-warning">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Processing
                                </span>
                            )}
                            {highlight.status === 'PENDING' && (
                                <span className="badge-info">
                                    <Clock className="w-3 h-3" />
                                    Pending
                                </span>
                            )}
                            {highlight.status === 'READY' && (
                                <span className="badge-success">
                                    <Check className="w-3 h-3" />
                                    Ready
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Preview if ready */}
                    {highlight.status === 'READY' && highlight.outputPath && (
                        <div className="rounded-xl overflow-hidden bg-dark-900">
                            <video
                                src={`/output/highlights/${highlight.outputPath.split('/').pop()}`}
                                controls
                                className="w-full"
                            />
                        </div>
                    )}

                    {/* Clips list */}
                    <div className="space-y-3">
                        <h3 className="font-medium text-dark-200">Clips in this highlight</h3>
                        {highlight.clips?.map((hClip: any, i: number) => (
                            <div key={hClip.id} className="glass-card p-4 flex items-center gap-4">
                                <span className="w-8 h-8 rounded-lg bg-primary-500/20 flex items-center justify-center text-primary-400 font-medium">
                                    {i + 1}
                                </span>
                                <div className="flex-1">
                                    <p className="text-dark-200">
                                        {hClip.video?.originalName || hClip.clip?.video?.originalName || 'Unknown video'}
                                    </p>
                                    <p className="text-sm text-dark-400">
                                        {formatDuration(hClip.startTime)} - {formatDuration(hClip.endTime)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    }

    // Creating new highlight
    return (
        <div className="space-y-6 animate-fade-up">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-display font-bold text-dark-50 flex items-center gap-3">
                        <Star className="w-7 h-7 text-secondary-400" />
                        Create Highlight
                    </h1>
                    <p className="mt-1 text-dark-400">
                        Combine clips into a highlight reel
                    </p>
                </div>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
                {/* Clips list */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="glass-card p-6 space-y-4">
                        {/* Name input */}
                        <div>
                            <label className="label">Highlight Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                                placeholder="My Awesome Highlight"
                                className="input"
                            />
                        </div>

                        {/* Clips */}
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <label className="label mb-0">
                                    Clips ({clips.length})
                                </label>
                                <span className="text-sm text-dark-400">
                                    Total: {formatDuration(totalDuration)}
                                </span>
                            </div>

                            {clips.length === 0 ? (
                                <div className="text-center py-8 border-2 border-dashed border-dark-700 rounded-xl">
                                    <Plus className="w-8 h-8 text-dark-500 mx-auto mb-2" />
                                    <p className="text-dark-400">No clips added yet</p>
                                    <p className="text-sm text-dark-500 mt-1">
                                        Search for clips and add them here
                                    </p>
                                </div>
                            ) : (
                                <DndContext
                                    sensors={sensors}
                                    collisionDetection={closestCenter}
                                    onDragEnd={handleDragEnd}
                                >
                                    <SortableContext
                                        items={clips.map((c) => c.id)}
                                        strategy={verticalListSortingStrategy}
                                    >
                                        <div className="space-y-2">
                                            {clips.map((clip, index) => (
                                                <SortableClipItem
                                                    key={clip.id}
                                                    clip={clip}
                                                    index={index}
                                                    onRemove={removeClip}
                                                    formatDuration={formatDuration}
                                                />
                                            ))}
                                        </div>
                                    </SortableContext>
                                </DndContext>
                            )}
                        </div>

                        {/* Create button */}
                        <button
                            onClick={handleCreate}
                            disabled={createMutation.isPending || clips.length === 0 || !name.trim()}
                            className="btn-primary w-full h-12"
                        >
                            {createMutation.isPending ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                                <>
                                    <Star className="w-5 h-5" />
                                    Create Highlight
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Instructions */}
                <div className="space-y-4">
                    <div className="glass-card p-6 space-y-4">
                        <h3 className="font-semibold text-dark-100">How it works</h3>
                        <ol className="space-y-3 text-sm text-dark-300">
                            <li className="flex gap-3">
                                <span className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 flex-shrink-0">
                                    1
                                </span>
                                Go to Search and find clips you want to include
                            </li>
                            <li className="flex gap-3">
                                <span className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 flex-shrink-0">
                                    2
                                </span>
                                Select clips and click "Create Highlight"
                            </li>
                            <li className="flex gap-3">
                                <span className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 flex-shrink-0">
                                    3
                                </span>
                                Reorder clips by dragging them
                            </li>
                            <li className="flex gap-3">
                                <span className="w-6 h-6 rounded-full bg-primary-500/20 flex items-center justify-center text-primary-400 flex-shrink-0">
                                    4
                                </span>
                                Click Create and wait for processing
                            </li>
                        </ol>
                    </div>
                </div>
            </div>
        </div>
    );
}
