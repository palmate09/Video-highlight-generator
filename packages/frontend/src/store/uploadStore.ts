import { create } from 'zustand';
import { Upload } from 'tus-js-client';
import { uploadApi, API_BASE_URL } from '@/services/api';
import { useAuthStore } from './authStore';
import { queryClient } from '@/lib/queryClient';

interface UploadFile {
    id: string;
    file: File;
    progress: number;
    status: 'pending' | 'uploading' | 'complete' | 'error';
    error?: string;
    upload?: Upload;
}

interface UploadState {
    uploads: UploadFile[];
    isUploading: boolean;

    // Actions
    addUpload: (file: File) => void;
    startUpload: (id: string) => Promise<void>;
    cancelUpload: (id: string) => void;
    removeUpload: (id: string) => void;
    clearCompleted: () => void;
}

export const useUploadStore = create<UploadState>((set, get) => ({
    uploads: [],
    isUploading: false,

    addUpload: (file: File) => {
        const id = crypto.randomUUID();
        set((state) => ({
            uploads: [
                ...state.uploads,
                {
                    id,
                    file,
                    progress: 0,
                    status: 'pending',
                },
            ],
        }));

        // Auto-start upload
        get().startUpload(id);
    },

    startUpload: async (id: string) => {
        const uploadFile = get().uploads.find((u) => u.id === id);
        if (!uploadFile || uploadFile.status === 'uploading') return;

        const { file } = uploadFile;
        const accessToken = useAuthStore.getState().accessToken;

        try {
            // Initialize upload session
            const response = await uploadApi.initUpload({
                filename: file.name,
                size: file.size,
                mimeType: file.type || 'video/mp4',
            });

            const { uploadUrl } = response.data.data;

            // Create tus upload
            const upload = new Upload(file, {
                endpoint: API_BASE_URL + '/upload',
                uploadUrl: uploadUrl,
                retryDelays: [0, 1000, 3000, 5000],
                chunkSize: 10 * 1024 * 1024, // 10MB chunks
                metadata: {
                    filename: file.name,
                    filetype: file.type,
                },
                headers: {
                    Authorization: `Bearer ${accessToken}`,
                },
                onError: (error) => {
                    set((state) => ({
                        uploads: state.uploads.map((u) =>
                            u.id === id
                                ? { ...u, status: 'error', error: error.message }
                                : u
                        ),
                        isUploading: state.uploads.some(
                            (u) => u.id !== id && u.status === 'uploading'
                        ),
                    }));
                },
                onProgress: (bytesUploaded, bytesTotal) => {
                    const progress = Math.round((bytesUploaded / bytesTotal) * 100);
                    set((state) => ({
                        uploads: state.uploads.map((u) =>
                            u.id === id ? { ...u, progress } : u
                        ),
                    }));
                },
                onSuccess: () => {
                    set((state) => ({
                        uploads: state.uploads.map((u) =>
                            u.id === id ? { ...u, status: 'complete', progress: 100 } : u
                        ),
                        isUploading: state.uploads.some(
                            (u) => u.id !== id && u.status === 'uploading'
                        ),
                    }));

                    // Invalidate videos query to refresh the list
                    queryClient.invalidateQueries({ queryKey: ['videos'] });
                },
            });

            // Update state with upload instance
            set((state) => ({
                uploads: state.uploads.map((u) =>
                    u.id === id ? { ...u, status: 'uploading', upload } : u
                ),
                isUploading: true,
            }));

            // Start upload
            upload.start();
        } catch (error: any) {
            set((state) => ({
                uploads: state.uploads.map((u) =>
                    u.id === id
                        ? { ...u, status: 'error', error: error.response?.data?.error || 'Upload failed' }
                        : u
                ),
            }));
        }
    },

    cancelUpload: (id: string) => {
        const uploadFile = get().uploads.find((u) => u.id === id);
        if (uploadFile?.upload) {
            uploadFile.upload.abort();
        }
        set((state) => ({
            uploads: state.uploads.filter((u) => u.id !== id),
            isUploading: state.uploads.some(
                (u) => u.id !== id && u.status === 'uploading'
            ),
        }));
    },

    removeUpload: (id: string) => {
        set((state) => ({
            uploads: state.uploads.filter((u) => u.id !== id),
        }));
    },

    clearCompleted: () => {
        set((state) => ({
            uploads: state.uploads.filter((u) => u.status !== 'complete'),
        }));
    },
}));
