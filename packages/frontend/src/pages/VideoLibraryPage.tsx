import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { videoApi } from '@/services/api';
import VideoCard from '@/components/video/VideoCard';
import { Film, Filter, Search, Loader2 } from 'lucide-react';

const STATUS_OPTIONS = [
    { value: '', label: 'All Status' },
    { value: 'READY', label: 'Ready' },
    { value: 'PROCESSING', label: 'Processing' },
    { value: 'TRANSCRIBING', label: 'Transcribing' },
    { value: 'EMBEDDING', label: 'Embedding' },
    { value: 'UPLOADING', label: 'Uploading' },
    { value: 'FAILED', label: 'Failed' },
];

export default function VideoLibraryPage() {
    const [statusFilter, setStatusFilter] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [page, setPage] = useState(1);
    const limit = 12;

    const { data, isLoading } = useQuery({
        queryKey: ['videos', { status: statusFilter, page, limit }],
        queryFn: () =>
            videoApi.getVideos({
                status: statusFilter || undefined,
                page,
                limit,
            }),
        refetchInterval: (query) => {
            const videos = (query.state.data as any)?.data?.data?.items || [];
            const isAnyProcessing = videos.some((v: any) =>
                ['PROCESSING', 'TRANSCRIBING', 'EMBEDDING', 'UPLOADING'].includes(v.status)
            );
            return isAnyProcessing ? 3000 : false;
        }
    });

    const videos = data?.data?.data?.items || [];
    const total = data?.data?.data?.total || 0;
    const totalPages = data?.data?.data?.totalPages || 1;

    // Filter by search query (client-side for simplicity)
    const filteredVideos = searchQuery
        ? videos.filter((v: any) =>
            v.originalName.toLowerCase().includes(searchQuery.toLowerCase())
        )
        : videos;

    return (
        <div className="space-y-6 animate-fade-up">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-display font-bold text-dark-50 flex items-center gap-3">
                        <Film className="w-7 h-7 text-primary-400" />
                        Video Library
                    </h1>
                    <p className="mt-1 text-dark-400">
                        {total} video{total !== 1 ? 's' : ''} in your library
                    </p>
                </div>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-4">
                {/* Search */}
                <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search videos..."
                        className="input pl-12"
                    />
                </div>

                {/* Status filter */}
                <div className="relative">
                    <Filter className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                    <select
                        value={statusFilter}
                        onChange={(e) => {
                            setStatusFilter(e.target.value);
                            setPage(1);
                        }}
                        className="input pl-12 pr-10 appearance-none min-w-[180px]"
                    >
                        {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>
                                {opt.label}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Loading state */}
            {isLoading && (
                <div className="flex items-center justify-center py-12">
                    <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
                </div>
            )}

            {/* Video grid */}
            {!isLoading && filteredVideos.length > 0 && (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filteredVideos.map((video: any, i: number) => (
                        <VideoCard
                            key={video.id}
                            video={video}
                            style={{ animationDelay: `${i * 0.05}s` }}
                        />
                    ))}
                </div>
            )}

            {/* Empty state */}
            {!isLoading && filteredVideos.length === 0 && (
                <div className="glass-card p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark-800 mb-4">
                        <Film className="w-8 h-8 text-dark-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-dark-100 mb-2">
                        No videos found
                    </h3>
                    <p className="text-dark-400">
                        {searchQuery || statusFilter
                            ? 'Try adjusting your filters'
                            : 'Upload your first video from the dashboard'}
                    </p>
                </div>
            )}

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-center gap-2">
                    <button
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                        disabled={page === 1}
                        className="btn-secondary btn-sm"
                    >
                        Previous
                    </button>
                    <span className="px-4 text-dark-400">
                        Page {page} of {totalPages}
                    </span>
                    <button
                        onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                        disabled={page === totalPages}
                        className="btn-secondary btn-sm"
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
}
