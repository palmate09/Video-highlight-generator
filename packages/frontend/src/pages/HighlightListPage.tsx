import { Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { highlightApi } from '@/services/api';
import {
    Star,
    Plus,
    Trash2,
    Loader2,
    Check,
    Clock,
    AlertCircle,
    Download,
    Play,
} from 'lucide-react';
import toast from 'react-hot-toast';

export default function HighlightListPage() {
    const queryClient = useQueryClient();

    const { data, isLoading } = useQuery({
        queryKey: ['highlights'],
        queryFn: () => highlightApi.getHighlights({ limit: 50 }),
    });

    const deleteMutation = useMutation({
        mutationFn: (id: string) => highlightApi.deleteHighlight(id),
        onSuccess: () => {
            toast.success('Highlight deleted');
            queryClient.invalidateQueries({ queryKey: ['highlights'] });
        },
        onError: () => {
            toast.error('Failed to delete highlight');
        },
    });

    const highlights = data?.data?.data?.items || [];

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'READY':
                return (
                    <span className="badge-success">
                        <Check className="w-3 h-3" />
                        Ready
                    </span>
                );
            case 'PROCESSING':
                return (
                    <span className="badge-warning">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Processing
                    </span>
                );
            case 'PENDING':
                return (
                    <span className="badge-info">
                        <Clock className="w-3 h-3" />
                        Pending
                    </span>
                );
            case 'FAILED':
                return (
                    <span className="badge-error">
                        <AlertCircle className="w-3 h-3" />
                        Failed
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6 animate-fade-up">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold text-dark-50 flex items-center gap-3">
                        <Star className="w-7 h-7 text-secondary-400" />
                        Highlights
                    </h1>
                    <p className="mt-1 text-dark-400">
                        Your generated highlight reels
                    </p>
                </div>
                <Link to="/highlights/new" className="btn-primary">
                    <Plus className="w-5 h-5" />
                    Create Highlight
                </Link>
            </div>

            {/* Loading */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
                </div>
            )}

            {/* Highlights grid */}
            {!isLoading && highlights.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {highlights.map((highlight: any, i: number) => (
                        <div
                            key={highlight.id}
                            className="glass-card-hover p-5 space-y-4 animate-fade-up"
                            style={{ animationDelay: `${i * 0.05}s` }}
                        >
                            <div className="flex items-start justify-between">
                                <Link
                                    to={`/highlights/${highlight.id}`}
                                    className="flex-1"
                                >
                                    <h3 className="font-semibold text-dark-100 hover:text-primary-400 transition-colors line-clamp-1">
                                        {highlight.name}
                                    </h3>
                                    <p className="text-sm text-dark-400 mt-1">
                                        {highlight.clipCount || highlight._count?.clips || 0} clips
                                    </p>
                                </Link>
                                {getStatusBadge(highlight.status)}
                            </div>

                            <div className="text-xs text-dark-500">
                                Created {new Date(highlight.createdAt).toLocaleDateString()}
                            </div>

                            <div className="flex gap-2">
                                <Link
                                    to={`/highlights/${highlight.id}`}
                                    className="btn-secondary btn-sm flex-1"
                                >
                                    <Play className="w-4 h-4" />
                                    View
                                </Link>
                                <button
                                    onClick={() => deleteMutation.mutate(highlight.id)}
                                    disabled={deleteMutation.isPending}
                                    className="btn-ghost btn-sm text-dark-400 hover:text-rose-400"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!isLoading && highlights.length === 0 && (
                <div className="glass-card p-12 text-center">
                    <Star className="w-12 h-12 text-dark-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-dark-100 mb-2">
                        No highlights yet
                    </h3>
                    <p className="text-dark-400 mb-6">
                        Create your first highlight reel from your video clips
                    </p>
                    <Link to="/highlights/new" className="btn-primary">
                        <Plus className="w-5 h-5" />
                        Create Highlight
                    </Link>
                </div>
            )}
        </div>
    );
}
