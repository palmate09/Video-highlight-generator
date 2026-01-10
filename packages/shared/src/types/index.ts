// ========================
// User Types
// ========================

export interface User {
    id: string;
    email: string;
    name: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserWithPassword extends User {
    passwordHash: string;
}

// ========================
// Auth Types
// ========================

export interface LoginRequest {
    email: string;
    password: string;
}

export interface RegisterRequest {
    email: string;
    password: string;
    name?: string;
}

export interface AuthResponse {
    user: User;
    accessToken: string;
    refreshToken: string;
}

export interface TokenPayload {
    userId: string;
    email: string;
    iat?: number;
    exp?: number;
}

// ========================
// Video Types
// ========================

export type VideoStatus =
    | 'UPLOADING'
    | 'PROCESSING'
    | 'TRANSCRIBING'
    | 'EMBEDDING'
    | 'READY'
    | 'FAILED';

export interface Video {
    id: string;
    userId: string;
    filename: string;
    originalName: string;
    path: string;
    duration: number | null;
    size: bigint;
    mimeType: string;
    status: VideoStatus;
    thumbnailPath: string | null;
    metadata: Record<string, unknown> | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface VideoWithClips extends Video {
    clips: Clip[];
}

// ========================
// Clip Types
// ========================

export interface Clip {
    id: string;
    videoId: string;
    startTime: number;
    endTime: number;
    transcript: string | null;
    speaker: string | null;
    emotion: string | null;
    action: string | null;
    createdAt: Date;
}

export interface ClipWithVideo extends Clip {
    video: Video;
}

// ========================
// Highlight Types
// ========================

export type HighlightStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';

export interface Highlight {
    id: string;
    userId: string;
    name: string;
    outputPath: string | null;
    status: HighlightStatus;
    createdAt: Date;
    updatedAt: Date;
}

export interface HighlightClip {
    id: string;
    highlightId: string;
    clipId: string | null;
    videoId: string | null;
    order: number;
    startTime: number;
    endTime: number;
}

export interface HighlightWithClips extends Highlight {
    clips: HighlightClip[];
}

export interface CreateHighlightRequest {
    name: string;
    clips: Array<{
        clipId?: string;
        videoId?: string;
        startTime: number;
        endTime: number;
    }>;
}

// ========================
// Upload Types
// ========================

export interface UploadInitRequest {
    filename: string;
    size: number;
    mimeType: string;
}

export interface UploadInitResponse {
    uploadId: string;
    uploadUrl: string;
}

export interface UploadSession {
    id: string;
    userId: string;
    filename: string;
    originalName: string;
    mimeType: string;
    size: bigint;
    uploadedSize: bigint;
    path: string;
    status: string;
    expiresAt: Date;
}

// ========================
// Search Types
// ========================

export type SearchType = 'keyword' | 'semantic' | 'speaker' | 'emotion' | 'action';

export interface SearchRequest {
    query: string;
    type: SearchType;
    filters?: {
        videoId?: string;
        speaker?: string;
        emotion?: string;
        action?: string;
        startDate?: Date;
        endDate?: Date;
    };
    limit?: number;
    offset?: number;
}

export interface SearchResult {
    clip: ClipWithVideo;
    score: number;
    matchType: SearchType;
}

export interface SearchResponse {
    results: SearchResult[];
    total: number;
    query: string;
    type: SearchType;
}

// ========================
// API Response Types
// ========================

export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}

export interface PaginatedResponse<T> {
    items: T[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
}

// ========================
// Transcription Types
// ========================

export interface TranscriptSegment {
    start: number;
    end: number;
    text: string;
    speaker?: string;
    confidence?: number;
}

export interface TranscriptionResult {
    segments: TranscriptSegment[];
    language: string;
    duration: number;
}

// ========================
// Embedding Types
// ========================

export interface EmbeddingResult {
    embedding: number[];
    text: string;
    model: string;
}
