/**
 * YouTube Controller
 * Handles YouTube video clip generation endpoints
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import prisma from '../config/database';
import logger from '../config/logger';
import {
    extractVideoId,
    fetchYouTubeTranscript,
    analyzeTranscriptForClips,
    getVideoMetadata,
    YouTubeClip,
} from '../services/youtube';

// Request validation schemas
const analyzeVideoSchema = z.object({
    url: z.string().min(1, 'YouTube URL is required'),
    minClipDuration: z.number().min(5).max(60).optional().default(15),
    maxClipDuration: z.number().min(30).max(300).optional().default(120),
    maxClips: z.number().min(1).max(10).optional().default(5),
});

const saveClipsSchema = z.object({
    videoId: z.string().min(11).max(11),
    title: z.string().optional(),
    clips: z.array(z.object({
        start: z.number().min(0),
        end: z.number().min(0),
        label: z.string(),
        confidence: z.number().min(0).max(1),
        transcript: z.string().optional(),
    })).min(1),
});

/**
 * Analyze YouTube video and generate clips
 * POST /api/youtube/analyze
 */
export async function analyzeVideo(req: Request, res: Response, next: NextFunction) {
    try {
        // Validate request body
        const result = analyzeVideoSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request',
                details: result.error.errors,
            });
        }

        const { url, minClipDuration, maxClipDuration, maxClips } = result.data;

        // Extract video ID
        const videoId = extractVideoId(url);
        if (!videoId) {
            return res.status(400).json({
                success: false,
                error: 'Invalid YouTube URL. Please provide a valid YouTube video URL.',
            });
        }

        logger.info(`Analyzing YouTube video: ${videoId}`);

        // Fetch video metadata
        const metadata = await getVideoMetadata(videoId);
        if (!metadata) {
            return res.status(404).json({
                success: false,
                error: 'Could not fetch video information. Please check if the video exists and is publicly available.',
            });
        }

        // Fetch transcript
        let transcript;
        try {
            transcript = await fetchYouTubeTranscript(videoId);
        } catch (error: any) {
            return res.status(400).json({
                success: false,
                error: `Could not fetch video transcript: ${error.message}. Make sure the video has captions/subtitles available.`,
            });
        }

        if (transcript.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'No transcript available for this video. Captions/subtitles are required for clip generation.',
            });
        }

        // Analyze transcript and generate clips
        const clips = analyzeTranscriptForClips(videoId, transcript, {
            minClipDuration,
            maxClipDuration,
            maxClips,
        });

        if (clips.length === 0) {
            return res.status(200).json({
                success: true,
                data: {
                    videoId,
                    title: metadata.title,
                    channelTitle: metadata.channelTitle,
                    duration: metadata.duration,
                    clips: [],
                    message: 'No significant clips detected in this video.',
                },
            });
        }

        logger.info(`Generated ${clips.length} clips for video ${videoId}`);

        res.json({
            success: true,
            data: {
                videoId,
                title: metadata.title,
                channelTitle: metadata.channelTitle,
                duration: metadata.duration,
                transcriptSegments: transcript.length,
                clips: clips.map(clip => ({
                    videoId: clip.videoId,
                    start: clip.start,
                    end: clip.end,
                    label: clip.label,
                    confidence: clip.confidence,
                    transcript: clip.transcript,
                    embedUrl: `https://www.youtube.com/embed/${clip.videoId}?start=${Math.floor(clip.start)}&end=${Math.floor(clip.end)}&autoplay=1`,
                })),
            },
        });
    } catch (error: any) {
        logger.error(`Error analyzing YouTube video: ${error.message}`);
        next(error);
    }
}

/**
 * Save YouTube clips to database
 * POST /api/youtube/clips
 */
export async function saveClips(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const userId = req.user.userId;

        // Validate request body
        const result = saveClipsSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request',
                details: result.error.errors,
            });
        }

        const { videoId, title, clips } = result.data;

        // Create YouTube video entry and clips in a transaction
        const savedData = await prisma.$transaction(async (tx) => {
            // Create or update YouTubeVideo entry
            const youtubeVideo = await tx.youTubeVideo.upsert({
                where: {
                    videoId_userId: {
                        videoId,
                        userId,
                    },
                },
                create: {
                    videoId,
                    userId,
                    title: title || `YouTube Video: ${videoId}`,
                },
                update: {
                    title: title || undefined,
                    updatedAt: new Date(),
                },
            });

            // Delete existing clips for this video (replace with new ones)
            await tx.youTubeClip.deleteMany({
                where: { youtubeVideoId: youtubeVideo.id },
            });

            // Create new clips
            const savedClips = await Promise.all(
                clips.map((clip, index) =>
                    tx.youTubeClip.create({
                        data: {
                            youtubeVideoId: youtubeVideo.id,
                            startTime: clip.start,
                            endTime: clip.end,
                            label: clip.label,
                            confidence: clip.confidence,
                            transcript: clip.transcript || null,
                            order: index,
                        },
                    })
                )
            );

            return {
                video: youtubeVideo,
                clips: savedClips,
            };
        });

        logger.info(`Saved ${savedData.clips.length} clips for YouTube video ${videoId}`);

        res.status(201).json({
            success: true,
            data: {
                id: savedData.video.id,
                videoId: savedData.video.videoId,
                title: savedData.video.title,
                clips: savedData.clips.map(clip => ({
                    id: clip.id,
                    startTime: clip.startTime,
                    endTime: clip.endTime,
                    label: clip.label,
                    confidence: clip.confidence,
                    transcript: clip.transcript,
                })),
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Get saved YouTube videos with clips for user
 * GET /api/youtube/videos
 */
export async function getYouTubeVideos(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const userId = req.user.userId;
        const { page = '1', limit = '20' } = req.query;

        const pageNum = Math.max(1, parseInt(page as string, 10));
        const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10)));
        const skip = (pageNum - 1) * limitNum;

        const [videos, total] = await Promise.all([
            prisma.youTubeVideo.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
                include: {
                    _count: {
                        select: { clips: true },
                    },
                },
            }),
            prisma.youTubeVideo.count({ where: { userId } }),
        ]);

        res.json({
            success: true,
            data: {
                items: videos.map(v => ({
                    id: v.id,
                    videoId: v.videoId,
                    title: v.title,
                    clipCount: v._count.clips,
                    thumbnailUrl: `https://img.youtube.com/vi/${v.videoId}/mqdefault.jpg`,
                    createdAt: v.createdAt,
                    updatedAt: v.updatedAt,
                })),
                total,
                page: pageNum,
                pageSize: limitNum,
                totalPages: Math.ceil(total / limitNum),
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Get a specific YouTube video with its clips
 * GET /api/youtube/videos/:id
 */
export async function getYouTubeVideo(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const userId = req.user.userId;
        const { id } = req.params;

        const video = await prisma.youTubeVideo.findFirst({
            where: { id, userId },
            include: {
                clips: {
                    orderBy: { order: 'asc' },
                },
            },
        });

        if (!video) {
            return res.status(404).json({
                success: false,
                error: 'YouTube video not found',
            });
        }

        res.json({
            success: true,
            data: {
                id: video.id,
                videoId: video.videoId,
                title: video.title,
                thumbnailUrl: `https://img.youtube.com/vi/${video.videoId}/mqdefault.jpg`,
                clips: video.clips.map(clip => ({
                    id: clip.id,
                    startTime: clip.startTime,
                    endTime: clip.endTime,
                    label: clip.label,
                    confidence: clip.confidence,
                    transcript: clip.transcript,
                    embedUrl: `https://www.youtube.com/embed/${video.videoId}?start=${Math.floor(clip.startTime)}&end=${Math.floor(clip.endTime)}&autoplay=1`,
                })),
                createdAt: video.createdAt,
                updatedAt: video.updatedAt,
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete a saved YouTube video and its clips
 * DELETE /api/youtube/videos/:id
 */
export async function deleteYouTubeVideo(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const userId = req.user.userId;
        const { id } = req.params;

        const video = await prisma.youTubeVideo.findFirst({
            where: { id, userId },
        });

        if (!video) {
            return res.status(404).json({
                success: false,
                error: 'YouTube video not found',
            });
        }

        await prisma.youTubeVideo.delete({
            where: { id },
        });

        logger.info(`Deleted YouTube video: ${id}`);

        res.status(204).end();
    } catch (error) {
        next(error);
    }
}

/**
 * Update a specific clip
 * PATCH /api/youtube/clips/:id
 */
export async function updateClip(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const userId = req.user.userId;
        const { id } = req.params;

        const updateSchema = z.object({
            label: z.string().optional(),
            startTime: z.number().min(0).optional(),
            endTime: z.number().min(0).optional(),
        });

        const result = updateSchema.safeParse(req.body);
        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Invalid request',
                details: result.error.errors,
            });
        }

        // Verify the clip belongs to the user
        const clip = await prisma.youTubeClip.findFirst({
            where: { id },
            include: {
                youtubeVideo: true,
            },
        });

        if (!clip || clip.youtubeVideo.userId !== userId) {
            return res.status(404).json({
                success: false,
                error: 'Clip not found',
            });
        }

        const updatedClip = await prisma.youTubeClip.update({
            where: { id },
            data: result.data,
        });

        res.json({
            success: true,
            data: {
                id: updatedClip.id,
                startTime: updatedClip.startTime,
                endTime: updatedClip.endTime,
                label: updatedClip.label,
                confidence: updatedClip.confidence,
                transcript: updatedClip.transcript,
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete a specific clip
 * DELETE /api/youtube/clips/:id
 */
export async function deleteClip(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }

        const userId = req.user.userId;
        const { id } = req.params;

        // Verify the clip belongs to the user
        const clip = await prisma.youTubeClip.findFirst({
            where: { id },
            include: {
                youtubeVideo: true,
            },
        });

        if (!clip || clip.youtubeVideo.userId !== userId) {
            return res.status(404).json({
                success: false,
                error: 'Clip not found',
            });
        }

        await prisma.youTubeClip.delete({
            where: { id },
        });

        logger.info(`Deleted YouTube clip: ${id}`);

        res.status(204).end();
    } catch (error) {
        next(error);
    }
}
