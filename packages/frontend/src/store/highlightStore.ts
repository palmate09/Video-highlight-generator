import { create } from 'zustand';

interface SelectedClip {
    id: string;
    clipId?: string;
    videoId: string;
    startTime: number;
    endTime: number;
    transcript?: string;
    videoName?: string;
    thumbnailPath?: string;
}

interface HighlightState {
    name: string;
    clips: SelectedClip[];
    isCreating: boolean;
    error: string | null;

    // Actions
    setName: (name: string) => void;
    addClip: (clip: SelectedClip) => void;
    removeClip: (id: string) => void;
    reorderClips: (fromIndex: number, toIndex: number) => void;
    clearClips: () => void;
    setIsCreating: (isCreating: boolean) => void;
    setError: (error: string | null) => void;
    reset: () => void;
}

export const useHighlightStore = create<HighlightState>((set) => ({
    name: '',
    clips: [],
    isCreating: false,
    error: null,

    setName: (name) => set({ name }),

    addClip: (clip) =>
        set((state) => ({
            clips: [...state.clips, { ...clip, id: crypto.randomUUID() }],
        })),

    removeClip: (id) =>
        set((state) => ({
            clips: state.clips.filter((c) => c.id !== id),
        })),

    reorderClips: (fromIndex, toIndex) =>
        set((state) => {
            const newClips = [...state.clips];
            const [removed] = newClips.splice(fromIndex, 1);
            newClips.splice(toIndex, 0, removed);
            return { clips: newClips };
        }),

    clearClips: () => set({ clips: [] }),

    setIsCreating: (isCreating) => set({ isCreating }),

    setError: (error) => set({ error }),

    reset: () => set({ name: '', clips: [], isCreating: false, error: null }),
}));
