import { create } from 'zustand';
import { searchApi } from '@/services/api';

interface SearchResult {
    clip: {
        id: string;
        videoId: string;
        startTime: number;
        endTime: number;
        transcript: string | null;
        speaker: string | null;
        emotion: string | null;
        action: string | null;
        video: {
            id: string;
            filename: string;
            originalName: string;
            thumbnailPath: string | null;
        };
    };
    score: number;
    matchType: string;
}

interface SearchState {
    query: string;
    type: 'keyword' | 'semantic' | 'speaker' | 'emotion' | 'action';
    results: SearchResult[];
    total: number;
    isLoading: boolean;
    error: string | null;
    selectedClips: string[];

    // Actions
    setQuery: (query: string) => void;
    setType: (type: SearchState['type']) => void;
    search: (params?: { query?: string; type?: SearchState['type'] }) => Promise<void>;
    clearResults: () => void;
    toggleClipSelection: (clipId: string) => void;
    clearSelection: () => void;
}

export const useSearchStore = create<SearchState>((set, get) => ({
    query: '',
    type: 'semantic',
    results: [],
    total: 0,
    isLoading: false,
    error: null,
    selectedClips: [],

    setQuery: (query) => set({ query }),

    setType: (type) => set({ type }),

    search: async (params) => {
        const query = params?.query ?? get().query;
        const type = params?.type ?? get().type;

        if (!query.trim()) return;

        set({ isLoading: true, error: null, query: query.trim(), type });

        try {
            const response = await searchApi.search({
                query: query.trim(),
                type,
                limit: 50,
            });

            set({
                results: response.data.data.results,
                total: response.data.data.total,
                isLoading: false,
            });
        } catch (error: any) {
            set({
                error: error.response?.data?.error || 'Search failed',
                isLoading: false,
                results: [],
                total: 0,
            });
        }
    },

    clearResults: () => set({ results: [], total: 0, query: '' }),

    toggleClipSelection: (clipId) => {
        const { selectedClips } = get();
        if (selectedClips.includes(clipId)) {
            set({ selectedClips: selectedClips.filter((id) => id !== clipId) });
        } else {
            set({ selectedClips: [...selectedClips, clipId] });
        }
    },

    clearSelection: () => set({ selectedClips: [] }),
}));
