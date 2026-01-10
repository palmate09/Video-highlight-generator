import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { videoApi, highlightApi } from '@/services/api';
import { useAuthStore } from '@/store/authStore';
import ChunkedUploader from '@/components/upload/ChunkedUploader';
import VideoCard from '@/components/video/VideoCard';
import {
    Film,
    Search,
    Star,
    Clock,
    Upload,
    TrendingUp,
    Zap,
    ArrowRight,
} from 'lucide-react';

export default function DashboardPage() {
    const user = useAuthStore((state) => state.user);

    // Fetch recent videos
    const { data: videosData, isLoading: videosLoading } = useQuery({
        queryKey: ['videos', { limit: 4 }],
        queryFn: () => videoApi.getVideos({ limit: 4 }),
        refetchInterval: (query) => {
            const videos = (query.state.data as any)?.data?.data?.items || [];
            const isAnyProcessing = videos.some((v: any) =>
                ['PROCESSING', 'TRANSCRIBING', 'EMBEDDING', 'UPLOADING'].includes(v.status)
            );
            return isAnyProcessing ? 3000 : false; // Poll every 3 seconds if processing
        }
    });

    // Fetch recent highlights
    const { data: highlightsData } = useQuery({
        queryKey: ['highlights', { limit: 3 }],
        queryFn: () => highlightApi.getHighlights({ limit: 3 }),
    });

    const videos = videosData?.data?.data?.items || [];
    // const highlights = highlightsData?.data?.data?.items || [];

    const stats = [
        {
            label: 'Total Videos',
            value: videosData?.data?.data?.total || 0,
            icon: Film,
            color: 'from-primary-500 to-cyan-500',
        },
        {
            label: 'Highlights Created',
            value: highlightsData?.data?.data?.total || 0,
            icon: Star,
            color: 'from-secondary-500 to-violet-500',
        },
        {
            label: 'Videos Ready',
            value: videos.filter((v: any) => v.status === 'READY').length,
            icon: Zap,
            color: 'from-emerald-500 to-teal-500',
        },
        {
            label: 'Processing',
            value: videos.filter((v: any) => ['PROCESSING', 'TRANSCRIBING', 'EMBEDDING'].includes(v.status)).length,
            icon: Clock,
            color: 'from-amber-500 to-orange-500',
        },
    ];

    return (
        <div className="space-y-8 animate-fade-up">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-display font-bold text-dark-50">
                    Welcome back, {user?.name || 'Creator'}! 👋
                </h1>
                <p className="mt-2 text-dark-400">
                    Upload videos and create stunning highlight reels with AI
                </p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {stats.map((stat, i) => (
                    <div
                        key={i}
                        className="glass-card p-5 animate-fade-up"
                        style={{ animationDelay: `${i * 0.1}s` }}
                    >
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="text-sm text-dark-400">{stat.label}</p>
                                <p className="mt-1 text-2xl font-bold text-dark-50">
                                    {stat.value}
                                </p>
                            </div>
                            <div
                                className={`w-12 h-12 rounded-xl bg-gradient-to-br ${stat.color} flex items-center justify-center shadow-lg`}
                            >
                                <stat.icon className="w-6 h-6 text-white" />
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Main content grid */}
            <div className="grid lg:grid-cols-3 gap-8">
                {/* Upload section */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-dark-100 flex items-center gap-2">
                            <Upload className="w-5 h-5 text-primary-400" />
                            Upload Videos
                        </h2>
                    </div>
                    <ChunkedUploader />
                </div>

                {/* Quick actions */}
                <div className="space-y-6">
                    <h2 className="text-xl font-semibold text-dark-100">Quick Actions</h2>
                    <div className="space-y-3">
                        <Link
                            to="/search"
                            className="glass-card-hover p-4 flex items-center gap-4 group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-primary-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Search className="w-6 h-6 text-primary-400" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-medium text-dark-100">Search Clips</h3>
                                <p className="text-sm text-dark-400">
                                    Find moments with AI semantic search
                                </p>
                            </div>
                            <ArrowRight className="w-5 h-5 text-dark-500 group-hover:text-primary-400 transition-colors" />
                        </Link>

                        <Link
                            to="/highlights/new"
                            className="glass-card-hover p-4 flex items-center gap-4 group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-secondary-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Star className="w-6 h-6 text-secondary-400" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-medium text-dark-100">Create Highlight</h3>
                                <p className="text-sm text-dark-400">
                                    Build a highlight reel from clips
                                </p>
                            </div>
                            <ArrowRight className="w-5 h-5 text-dark-500 group-hover:text-secondary-400 transition-colors" />
                        </Link>

                        <Link
                            to="/videos"
                            className="glass-card-hover p-4 flex items-center gap-4 group"
                        >
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center group-hover:scale-110 transition-transform">
                                <Film className="w-6 h-6 text-emerald-400" />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-medium text-dark-100">Video Library</h3>
                                <p className="text-sm text-dark-400">
                                    Manage all your uploaded videos
                                </p>
                            </div>
                            <ArrowRight className="w-5 h-5 text-dark-500 group-hover:text-emerald-400 transition-colors" />
                        </Link>
                    </div>
                </div>
            </div>

            {/* Recent videos */}
            {videos.length > 0 && (
                <div className="space-y-6">
                    <div className="flex items-center justify-between">
                        <h2 className="text-xl font-semibold text-dark-100 flex items-center gap-2">
                            <TrendingUp className="w-5 h-5 text-primary-400" />
                            Recent Videos
                        </h2>
                        <Link
                            to="/videos"
                            className="text-sm text-primary-400 hover:text-primary-300 font-medium flex items-center gap-1"
                        >
                            View all
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </div>
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                        {videos.map((video: any, i: number) => (
                            <VideoCard
                                key={video.id}
                                video={video}
                                style={{ animationDelay: `${i * 0.1}s` }}
                            />
                        ))}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {videos.length === 0 && !videosLoading && (
                <div className="glass-card p-12 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-dark-800 mb-4">
                        <Film className="w-8 h-8 text-dark-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-dark-100 mb-2">
                        No videos yet
                    </h3>
                    <p className="text-dark-400 mb-6">
                        Upload your first video to get started with creating highlights
                    </p>
                </div>
            )}
        </div>
    );
}
