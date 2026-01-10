import { Link } from 'react-router-dom';
import { Clock, Play, Layers, Check, AlertCircle, Loader2 } from 'lucide-react';

interface VideoCardProps {
    video: {
        id: string;
        originalName: string;
        thumbnailPath: string | null;
        duration: number | null;
        status: string;
        clipCount: number;
        createdAt: string;
    };
    style?: React.CSSProperties;
}

export default function VideoCard({ video, style }: VideoCardProps) {
    const formatDuration = (seconds: number | null) => {
        if (!seconds) return '--:--';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

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
            case 'TRANSCRIBING':
            case 'EMBEDDING':
                return (
                    <span className="badge-warning">
                        <Loader2 className="w-3 h-3 animate-spin" />
                        {status.charAt(0) + status.slice(1).toLowerCase()}
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
                return (
                    <span className="badge-info">
                        <Clock className="w-3 h-3" />
                        {status}
                    </span>
                );
        }
    };

    return (
        <Link
            to={`/videos/${video.id}`}
            className="glass-card-hover overflow-hidden group animate-fade-up"
            style={style}
        >
            {/* Thumbnail */}
            <div className="relative aspect-video bg-dark-800">
                {video.thumbnailPath ? (
                    <img
                        src={video.thumbnailPath}
                        alt={video.originalName}
                        className="w-full h-full object-cover"
                    />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Play className="w-12 h-12 text-dark-600" />
                    </div>
                )}

                {/* Duration overlay */}
                <div className="absolute bottom-2 right-2 px-2 py-0.5 rounded-md bg-dark-900/80 backdrop-blur-sm text-xs font-medium text-dark-100">
                    {formatDuration(video.duration)}
                </div>

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-dark-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <div className="w-14 h-14 rounded-full bg-primary-500/90 flex items-center justify-center transform scale-90 group-hover:scale-100 transition-transform">
                        <Play className="w-7 h-7 text-white ml-1" />
                    </div>
                </div>
            </div>

            {/* Info */}
            <div className="p-4 space-y-3">
                <h3 className="font-medium text-dark-100 line-clamp-1 group-hover:text-primary-400 transition-colors">
                    {video.originalName}
                </h3>

                <div className="flex items-center justify-between">
                    {getStatusBadge(video.status)}
                    <div className="flex items-center gap-1 text-xs text-dark-400">
                        <Layers className="w-3 h-3" />
                        {video.clipCount} clips
                    </div>
                </div>
            </div>
        </Link>
    );
}
