import { Request } from 'express';

// Extended request with user info from auth middleware
export interface AuthenticatedRequest extends Request {
    user?: {
        userId: string;
        email: string;
    };
}

// Video status types
export type VideoStatus =
    | 'UPLOADING'
    | 'PROCESSING'
    | 'TRANSCRIBING'
    | 'EMBEDDING'
    | 'READY'
    | 'FAILED';

// Highlight status types
export type HighlightStatus =
    | 'PENDING'
    | 'PROCESSING'
    | 'READY'
    | 'FAILED';

// Search types
export type SearchType =
    | 'keyword'
    | 'semantic'
    | 'speaker'
    | 'emotion'
    | 'action';

// Job data types for BullMQ
export interface VideoJobData {
    videoId: string;
    path: string;
}

export interface TranscriptionJobData {
    clipId: string;
    videoPath: string;
    startTime: number;
    endTime: number;
}

export interface EmbeddingJobData {
    clipId: string;
    transcript: string;
}

export interface HighlightJobData {
    highlightId: string;
}

// API response types
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

// Transcription types
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

// Embedding types
export interface EmbeddingResult {
    embedding: number[];
    text: string;
    model: string;
}

// Video metadata from FFprobe
export interface VideoMetadata {
    duration: number;
    width: number;
    height: number;
    fps: number;
    codec: string;
    bitrate: number;
}
