import prisma from '../../config/database';
import logger from '../../config/logger';
import { getEmbeddingProvider } from '../embeddings';
import type { SearchType, SearchResult, ClipWithVideo } from '@vhg/shared';

export class SearchService {
    /**
     * Search clips using various methods
     */
    async search(
        userId: string,
        query: string,
        type: SearchType,
        filters?: {
            videoId?: string;
            speaker?: string;
            emotion?: string;
            action?: string;
        },
        limit: number = 20,
        offset: number = 0
    ): Promise<{ results: SearchResult[]; total: number }> {
        switch (type) {
            case 'semantic':
                return this.semanticSearch(userId, query, filters, limit, offset);
            case 'keyword':
                return this.keywordSearch(userId, query, filters, limit, offset);
            case 'speaker':
                return this.filterSearch(userId, 'speaker', query, filters, limit, offset);
            case 'emotion':
                return this.filterSearch(userId, 'emotion', query, filters, limit, offset);
            case 'action':
                return this.filterSearch(userId, 'action', query, filters, limit, offset);
            default:
                return this.keywordSearch(userId, query, filters, limit, offset);
        }
    }

    /**
     * Semantic search using embeddings
     */
    private async semanticSearch(
        userId: string,
        query: string,
        filters?: {
            videoId?: string;
        },
        limit: number = 20,
        offset: number = 0
    ): Promise<{ results: SearchResult[]; total: number }> {
        // Generate query embedding
        const provider = getEmbeddingProvider();
        let queryEmbedding;
        try {
            queryEmbedding = await provider.embed(query);
        } catch (error: any) {
            logger.error(`Failed to generate query embedding: ${error.message}`);
            throw new Error(`Embedding generation failed: ${error.message}`);
        }

        // Get all clips with embeddings for user's videos
        const where: any = {
            video: { userId },
            embedding: { not: null },
        };

        if (filters?.videoId) {
            where.videoId = filters.videoId;
        }

        let clips;
        try {
            clips = await prisma.clip.findMany({
                where,
                include: {
                    video: {
                        select: {
                            id: true,
                            userId: true,
                            filename: true,
                            originalName: true,
                            path: true,
                            duration: true,
                            size: true,
                            mimeType: true,
                            status: true,
                            thumbnailPath: true,
                            metadata: true,
                            createdAt: true,
                            updatedAt: true,
                        },
                    },
                },
            });
        } catch (error: any) {
            logger.error(`Database query failed in semantic search: ${error.message}`);
            throw error;
        }

        // Calculate similarity scores
        const scored = clips
            .filter((clip) => clip.embedding !== null)
            .map((clip) => {
                try {
                    // Convert embedding buffer back to array
                    const embeddingBuffer = clip.embedding as Buffer;
                    if (!embeddingBuffer || embeddingBuffer.length === 0) {
                        return null;
                    }

                    const embedding = new Float32Array(
                        embeddingBuffer.buffer,
                        embeddingBuffer.byteOffset,
                        embeddingBuffer.length / 4
                    );

                    const score = provider.cosineSimilarity(
                        queryEmbedding.embedding,
                        Array.from(embedding)
                    );

                    return { clip, score };
                } catch (error: any) {
                    logger.warn(`Failed to process embedding for clip ${clip.id}: ${error.message}`);
                    return null;
                }
            })
            .filter((item): item is { clip: typeof clips[0]; score: number } => item !== null);

        // Sort by score
        scored.sort((a, b) => b.score - a.score);

        // Apply pagination
        const total = scored.length;
        const paginated = scored.slice(offset, offset + limit);

        const results: SearchResult[] = paginated.map(({ clip, score }) => ({
            clip: {
                id: clip.id,
                videoId: clip.videoId,
                startTime: clip.startTime,
                endTime: clip.endTime,
                transcript: clip.transcript,
                speaker: clip.speaker,
                emotion: clip.emotion,
                action: clip.action,
                createdAt: clip.createdAt,
                video: {
                    ...clip.video,
                    size: clip.video.size.toString(),
                    thumbnailPath: clip.video.thumbnailPath
                        ? (clip.video.thumbnailPath.startsWith('http')
                            ? clip.video.thumbnailPath
                            : (clip.video.thumbnailPath.startsWith('/')
                                ? clip.video.thumbnailPath.replace(/.*\/output\//, '/output/')
                                : `/output/${clip.video.thumbnailPath}`))
                        : null,
                } as any,
            } as ClipWithVideo,
            score,
            matchType: 'semantic' as SearchType,
        }));

        return { results, total };
    }

    /**
     * Keyword search in transcripts
     */
    private async keywordSearch(
        userId: string,
        query: string,
        filters?: {
            videoId?: string;
        },
        limit: number = 20,
        offset: number = 0
    ): Promise<{ results: SearchResult[]; total: number }> {
        const where: any = {
            video: { userId },
            transcript: {
                not: null,
                contains: query,
            },
        };

        if (filters?.videoId) {
            where.videoId = filters.videoId;
        }

        let clips, total;
        try {
            [clips, total] = await Promise.all([
                prisma.clip.findMany({
                    where,
                    include: {
                        video: true,
                    },
                    skip: offset,
                    take: limit,
                    orderBy: { createdAt: 'desc' },
                }),
                prisma.clip.count({ where }),
            ]);
        } catch (error: any) {
            logger.error(`Database query failed in keyword search: ${error.message}`);
            throw error;
        }

        const results: SearchResult[] = clips.map((clip) => ({
            clip: {
                id: clip.id,
                videoId: clip.videoId,
                startTime: clip.startTime,
                endTime: clip.endTime,
                transcript: clip.transcript,
                speaker: clip.speaker,
                emotion: clip.emotion,
                action: clip.action,
                createdAt: clip.createdAt,
                video: {
                    ...clip.video,
                    size: clip.video.size.toString(),
                    thumbnailPath: clip.video.thumbnailPath
                        ? (clip.video.thumbnailPath.startsWith('http')
                            ? clip.video.thumbnailPath
                            : (clip.video.thumbnailPath.startsWith('/')
                                ? clip.video.thumbnailPath.replace(/.*\/output\//, '/output/')
                                : `/output/${clip.video.thumbnailPath}`))
                        : null,
                } as any,
            } as ClipWithVideo,
            score: 1, // Exact match
            matchType: 'keyword' as SearchType,
        }));

        return { results, total };
    }

    /**
     * Filter search by metadata (speaker, emotion, action)
     */
    private async filterSearch(
        userId: string,
        field: 'speaker' | 'emotion' | 'action',
        value: string,
        filters?: {
            videoId?: string;
        },
        limit: number = 20,
        offset: number = 0
    ): Promise<{ results: SearchResult[]; total: number }> {
        const where: any = {
            video: { userId },
            [field]: value,
        };

        if (filters?.videoId) {
            where.videoId = filters.videoId;
        }

        let clips, total;
        try {
            [clips, total] = await Promise.all([
                prisma.clip.findMany({
                    where,
                    include: {
                        video: true,
                    },
                    skip: offset,
                    take: limit,
                    orderBy: { startTime: 'asc' },
                }),
                prisma.clip.count({ where }),
            ]);
        } catch (error: any) {
            logger.error(`Database query failed in filter search: ${error.message}`);
            throw error;
        }

        const results: SearchResult[] = clips.map((clip) => ({
            clip: {
                id: clip.id,
                videoId: clip.videoId,
                startTime: clip.startTime,
                endTime: clip.endTime,
                transcript: clip.transcript,
                speaker: clip.speaker,
                emotion: clip.emotion,
                action: clip.action,
                createdAt: clip.createdAt,
                video: {
                    ...clip.video,
                    size: clip.video.size.toString(),
                    thumbnailPath: clip.video.thumbnailPath
                        ? (clip.video.thumbnailPath.startsWith('http')
                            ? clip.video.thumbnailPath
                            : (clip.video.thumbnailPath.startsWith('/')
                                ? clip.video.thumbnailPath.replace(/.*\/output\//, '/output/')
                                : `/output/${clip.video.thumbnailPath}`))
                        : null,
                } as any,
            } as ClipWithVideo,
            score: 1,
            matchType: field as SearchType,
        }));

        return { results, total };
    }
}

export const searchService = new SearchService();
