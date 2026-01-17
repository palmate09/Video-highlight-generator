import axios from 'axios';

// Use environment variable if set, otherwise use proxy path
export const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

export const api = axios.create({
    baseURL: API_BASE_URL,
    withCredentials: true,
    headers: {
        'Content-Type': 'application/json',
    },
});

type TokenUpdateHandler = (token: string) => void;
let tokenUpdateHandler: TokenUpdateHandler | null = null;

export const setOnTokenUpdate = (handler: TokenUpdateHandler) => {
    tokenUpdateHandler = handler;
};

let isRefreshing = false;
let refreshQueue: Array<{ resolve: (token: string) => void; reject: (error: any) => void }> = [];

const processQueue = (error: any, token: string | null = null) => {
    refreshQueue.forEach(({ resolve, reject }) => {
        if (error) {
            reject(error);
        } else if (token) {
            resolve(token);
        }
    });
    refreshQueue = [];
};

// Response interceptor for token refresh
api.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If 401 and not already retrying, and not a refresh request itself
        if (error.response?.status === 401 && !originalRequest._retry && !originalRequest.url?.includes('/auth/refresh')) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    refreshQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        originalRequest.headers['Authorization'] = `Bearer ${token}`;
                        return api(originalRequest);
                    })
                    .catch((err) => {
                        return Promise.reject(err);
                    });
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                // Try to refresh token
                const response = await api.post('/auth/refresh');
                const { accessToken } = response.data.data;

                // Update token in headers for all future requests
                api.defaults.headers.common['Authorization'] = `Bearer ${accessToken}`;

                // Notify store to persist new token
                if (tokenUpdateHandler) {
                    tokenUpdateHandler(accessToken);
                }

                // Process the queued requests
                processQueue(null, accessToken);

                // Retry the original request
                originalRequest.headers['Authorization'] = `Bearer ${accessToken}`;
                return api(originalRequest);
            } catch (refreshError) {
                // Refresh failed, clear queue and redirect to login
                processQueue(refreshError, null);

                // Clear state to prevent infinite redirect loops
                localStorage.removeItem('auth-storage');

                window.location.href = '/login';
                return Promise.reject(refreshError);
            } finally {
                isRefreshing = false;
            }
        }

        return Promise.reject(error);
    }
);

// Video API
export const videoApi = {
    getVideos: (params?: { status?: string; page?: number; limit?: number }) =>
        api.get('/videos', { params }),

    getVideo: (id: string) => api.get(`/videos/${id}`),

    getVideoClips: (id: string, params?: { page?: number; limit?: number }) =>
        api.get(`/videos/${id}/clips`, { params }),

    deleteVideo: (id: string) => api.delete(`/videos/${id}`),

    getStreamUrl: (id: string) => api.get(`/videos/${id}/stream`),
};

// Upload API
export const uploadApi = {
    initUpload: (data: { filename: string; size: number; mimeType: string }) =>
        api.post('/upload/init', data),

    getProgress: (uploadId: string) => api.head(`/upload/${uploadId}`),

    cancelUpload: (uploadId: string) => api.delete(`/upload/${uploadId}`),
};

// Search API
export const searchApi = {
    search: (data: {
        query: string;
        type: 'keyword' | 'semantic' | 'speaker' | 'emotion' | 'action';
        filters?: { videoId?: string };
        limit?: number;
        offset?: number;
    }) => api.post('/search', data),
};

// Highlight API
export const highlightApi = {
    getHighlights: (params?: { page?: number; limit?: number }) =>
        api.get('/highlights', { params }),

    getHighlight: (id: string) => api.get(`/highlights/${id}`),

    createHighlight: (data: {
        name: string;
        clips: Array<{
            clipId?: string;
            videoId?: string;
            youtubeClipId?: string;
            startTime: number;
            endTime: number;
        }>;
    }) => api.post('/highlights', data),

    deleteHighlight: (id: string) => api.delete(`/highlights/${id}`),

    getDownloadUrl: (id: string) => api.get(`/highlights/${id}/download`),
};

// YouTube API - Clip generation without downloading
export const youtubeApi = {
    // Analyze a YouTube video and generate clips
    analyzeVideo: (data: {
        url: string;
        minClipDuration?: number;
        maxClipDuration?: number;
        maxClips?: number;
    }) => api.post('/youtube/analyze', data),

    // Save generated clips to user account
    saveClips: (data: {
        videoId: string;
        title?: string;
        clips: Array<{
            start: number;
            end: number;
            label: string;
            confidence: number;
            transcript?: string;
        }>;
    }) => api.post('/youtube/clips', data),

    // Get all saved YouTube videos
    getVideos: (params?: { page?: number; limit?: number }) =>
        api.get('/youtube/videos', { params }),

    // Get a specific YouTube video with its clips
    getVideo: (id: string) => api.get(`/youtube/videos/${id}`),

    // Delete a YouTube video
    deleteVideo: (id: string) => api.delete(`/youtube/videos/${id}`),

    // Update a clip
    updateClip: (id: string, data: { label?: string; startTime?: number; endTime?: number }) =>
        api.patch(`/youtube/clips/${id}`, data),

    // Delete a clip
    deleteClip: (id: string) => api.delete(`/youtube/clips/${id}`),
};

