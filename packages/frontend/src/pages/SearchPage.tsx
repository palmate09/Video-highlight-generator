import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useSearchStore } from '@/store/searchStore';
import {
    Search,
    Sparkles,
    Type,
    User,
    Heart,
    Zap,
    Loader2,
    Play,
    Plus,
    Check,
    Star,
    AlertCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

const SEARCH_TYPES = [
    { value: 'semantic', label: 'Semantic', icon: Sparkles, description: 'AI-powered meaning search' },
    { value: 'keyword', label: 'Keyword', icon: Type, description: 'Exact text matching' },
    { value: 'speaker', label: 'Speaker', icon: User, description: 'Search by speaker name' },
    { value: 'emotion', label: 'Emotion', icon: Heart, description: 'Search by emotion' },
    { value: 'action', label: 'Action', icon: Zap, description: 'Search by action type' },
] as const;

export default function SearchPage() {
    const {
        query,
        type,
        results,
        total,
        isLoading,
        error,
        selectedClips,
        setQuery,
        setType,
        search,
        toggleClipSelection,
        clearSelection,
    } = useSearchStore();

    const [inputValue, setInputValue] = useState(query);

    useEffect(() => {
        setInputValue(query);
    }, [query]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setQuery(inputValue);
        search();
    };

    const formatDuration = (seconds: number) => {
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="space-y-6 animate-fade-up">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-display font-bold text-dark-50 flex items-center gap-3">
                    <Search className="w-7 h-7 text-primary-400" />
                    Search Clips
                </h1>
                <p className="mt-1 text-dark-400">
                    Find specific moments in your videos using AI-powered search
                </p>
            </div>

            {/* Search form */}
            <form onSubmit={handleSearch} className="space-y-4">
                {/* Search input */}
                <div className="relative">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-dark-400" />
                    <input
                        type="text"
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        placeholder="Search for moments, phrases, or topics..."
                        className="input pl-12 pr-32 text-lg h-14"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !inputValue.trim()}
                        className="absolute right-2 top-1/2 -translate-y-1/2 btn-primary"
                    >
                        {isLoading ? (
                            <Loader2 className="w-5 h-5 animate-spin" />
                        ) : (
                            'Search'
                        )}
                    </button>
                </div>

                {/* Search type selector */}
                <div className="flex flex-wrap gap-2">
                    {SEARCH_TYPES.map((searchType) => {
                        const Icon = searchType.icon;
                        const isActive = type === searchType.value;
                        return (
                            <button
                                key={searchType.value}
                                type="button"
                                onClick={() => setType(searchType.value as any)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all ${isActive
                                        ? 'bg-primary-500/20 text-primary-400 border border-primary-500/30'
                                        : 'bg-dark-800 text-dark-300 border border-dark-700 hover:border-dark-600'
                                    }`}
                            >
                                <Icon className="w-4 h-4" />
                                {searchType.label}
                            </button>
                        );
                    })}
                </div>
            </form>

            {/* Error */}
            {error && (
                <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center gap-3">
                    <AlertCircle className="w-5 h-5" />
                    {error}
                </div>
            )}

            {/* Selected clips action bar */}
            {selectedClips.length > 0 && (
                <div className="glass-card p-4 flex items-center justify-between animate-fade-up">
                    <span className="text-dark-200">
                        <span className="text-primary-400 font-semibold">{selectedClips.length}</span> clip
                        {selectedClips.length !== 1 ? 's' : ''} selected
                    </span>
                    <div className="flex gap-3">
                        <button onClick={clearSelection} className="btn-secondary btn-sm">
                            Clear
                        </button>
                        <Link
                            to="/highlights/new"
                            state={{ selectedClips, results }}
                            className="btn-primary btn-sm"
                        >
                            <Star className="w-4 h-4" />
                            Create Highlight
                        </Link>
                    </div>
                </div>
            )}

            {/* Results */}
            {results.length > 0 && (
                <div className="space-y-4">
                    <p className="text-dark-400">
                        Found <span className="text-primary-400 font-semibold">{total}</span> matching clips
                    </p>
                    <div className="grid gap-4">
                        {results.map((result, i) => {
                            const isSelected = selectedClips.includes(result.clip.id);
                            return (
                                <div
                                    key={result.clip.id}
                                    className={`glass-card p-4 flex gap-4 animate-fade-up transition-all ${isSelected ? 'ring-2 ring-primary-500/50' : ''
                                        }`}
                                    style={{ animationDelay: `${i * 0.05}s` }}
                                >
                                    {/* Thumbnail */}
                                    <Link
                                        to={`/videos/${result.clip.videoId}`}
                                        className="relative w-48 aspect-video rounded-lg overflow-hidden bg-dark-800 flex-shrink-0 group"
                                    >
                                        {result.clip.video.thumbnailPath ? (
                                            <img
                                                src={result.clip.video.thumbnailPath}
                                                alt=""
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <Play className="w-8 h-8 text-dark-600" />
                                            </div>
                                        )}
                                        <div className="absolute inset-0 bg-dark-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                            <Play className="w-10 h-10 text-white" />
                                        </div>
                                        <div className="absolute bottom-2 left-2 px-2 py-0.5 rounded bg-dark-900/80 text-xs text-dark-100">
                                            {formatDuration(result.clip.startTime)} - {formatDuration(result.clip.endTime)}
                                        </div>
                                    </Link>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0 space-y-2">
                                        <div className="flex items-start justify-between gap-4">
                                            <div>
                                                <Link
                                                    to={`/videos/${result.clip.videoId}`}
                                                    className="font-medium text-dark-100 hover:text-primary-400 transition-colors line-clamp-1"
                                                >
                                                    {result.clip.video.originalName}
                                                </Link>
                                                <p className="text-sm text-dark-400 mt-1">
                                                    Match score: {Math.round(result.score * 100)}%
                                                </p>
                                            </div>
                                            <button
                                                onClick={() => toggleClipSelection(result.clip.id)}
                                                className={`flex-shrink-0 p-2 rounded-lg transition-all ${isSelected
                                                        ? 'bg-primary-500 text-white'
                                                        : 'bg-dark-700 text-dark-400 hover:text-dark-100'
                                                    }`}
                                            >
                                                {isSelected ? <Check className="w-5 h-5" /> : <Plus className="w-5 h-5" />}
                                            </button>
                                        </div>

                                        {result.clip.transcript && (
                                            <p className="text-dark-300 text-sm line-clamp-2">
                                                "{result.clip.transcript}"
                                            </p>
                                        )}

                                        {/* Metadata badges */}
                                        <div className="flex flex-wrap gap-2">
                                            {result.clip.speaker && (
                                                <span className="badge-info">
                                                    <User className="w-3 h-3" />
                                                    {result.clip.speaker}
                                                </span>
                                            )}
                                            {result.clip.emotion && (
                                                <span className="badge-warning">
                                                    <Heart className="w-3 h-3" />
                                                    {result.clip.emotion}
                                                </span>
                                            )}
                                            {result.clip.action && (
                                                <span className="badge-primary">
                                                    <Zap className="w-3 h-3" />
                                                    {result.clip.action}
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Empty state */}
            {!isLoading && results.length === 0 && query && (
                <div className="glass-card p-12 text-center">
                    <Search className="w-12 h-12 text-dark-500 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-dark-100 mb-2">No results found</h3>
                    <p className="text-dark-400">Try a different search query or search type</p>
                </div>
            )}

            {/* Initial state */}
            {!query && results.length === 0 && (
                <div className="glass-card p-12 text-center">
                    <Sparkles className="w-12 h-12 text-primary-400 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-dark-100 mb-2">
                        Search with AI
                    </h3>
                    <p className="text-dark-400 max-w-md mx-auto">
                        Enter a query above to search through your video transcripts using semantic search.
                        Find moments by describing what you're looking for.
                    </p>
                </div>
            )}
        </div>
    );
}
