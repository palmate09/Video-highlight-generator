import { Request, Response, NextFunction } from 'express';
import prisma from '../config/database';
import logger from '../config/logger';
import config from '../config';
import fs from 'fs/promises';

/**
 * Get all videos for user
 * GET /api/videos
 */
export async function getVideos(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }
        
        const userId = req.user.userId;
        const { status, page = '1', limit = '20' } = req.query;

        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);
        const skip = (pageNum - 1) * limitNum;

        const where: any = { userId };
        if (status) {
            where.status = status;
        }

        const [videos, total] = await Promise.all([
            prisma.video.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limitNum,
                select: {
                    id: true,
                    filename: true,
                    originalName: true,
                    duration: true,
                    size: true,
                    mimeType: true,
                    status: true,
                    thumbnailPath: true,
                    createdAt: true,
                    updatedAt: true,
                    _count: {
                        select: { clips: true },
                    },
                },
            }),
            prisma.video.count({ where }),
        ]);

        res.json({
            success: true,
            data: {
                items: videos.map((v) => {
                    const { _count, ...videoData } = v;
                    return {
                        ...videoData,
                        size: v.size.toString(),
                        clipCount: _count.clips,
                        thumbnailPath: v.thumbnailPath
                            ? (v.thumbnailPath.startsWith('http')
                                ? v.thumbnailPath
                                : (v.thumbnailPath.startsWith('/')
                                    ? v.thumbnailPath.replace(/.*\/output\//, '/output/')
                                    : `/output/${v.thumbnailPath}`))
                            : null,
                    };
                }),
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
 * Get video by ID
 * GET /api/videos/:id
 */
export async function getVideoById(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }
        
        const userId = req.user.userId;
        const { id } = req.params;

        const video = await prisma.video.findFirst({
            where: { id, userId },
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
                _count: {
                    select: { clips: true },
                },
            },
        });

        if (!video) {
            return res.status(404).json({
                success: false,
                error: 'Video not found',
            });
        }

        const { _count, ...videoData } = video;
        res.json({
            success: true,
            data: {
                ...videoData,
                size: video.size.toString(),
                clipCount: _count.clips,
                thumbnailPath: video.thumbnailPath
                    ? (video.thumbnailPath.startsWith('http')
                        ? video.thumbnailPath
                        : (video.thumbnailPath.startsWith('/')
                            ? video.thumbnailPath.replace(/.*\/output\//, '/output/')
                            : `/output/${video.thumbnailPath}`))
                    : null,
            },
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Get video clips
 * GET /api/videos/:id/clips
 */
export async function getVideoClips(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }
        
        const userId = req.user.userId;
        const { id } = req.params;
        const { page = '1', limit = '50' } = req.query;

        const pageNum = Math.max(1, parseInt(page as string, 10));
        const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10))); // Max 100, min 1
        const skip = (pageNum - 1) * limitNum;

        const video = await prisma.video.findFirst({
            where: { id, userId },
            select: { id: true },
        });

        if (!video) {
            return res.status(404).json({
                success: false,
                error: 'Video not found',
            });
        }

        const [clips, total] = await Promise.all([
            prisma.clip.findMany({
                where: { videoId: id },
                orderBy: { startTime: 'asc' },
                skip,
                take: limitNum,
                select: {
                    id: true,
                    startTime: true,
                    endTime: true,
                    transcript: true,
                    speaker: true,
                    emotion: true,
                    action: true,
                    createdAt: true,
                },
            }),
            prisma.clip.count({ where: { videoId: id } }),
        ]);

        res.json({
            success: true,
            data: {
                items: clips,
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
 * Delete video
 * DELETE /api/videos/:id
 */
export async function deleteVideo(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }
        
        const userId = req.user.userId;
        const { id } = req.params;

        const video = await prisma.video.findFirst({
            where: { id, userId },
        });

        if (!video) {
            return res.status(404).json({
                success: false,
                error: 'Video not found',
            });
        }

        // Delete video file
        try {
            await fs.unlink(video.path);
        } catch {
            // File might not exist
        }

        // Delete thumbnail
        if (video.thumbnailPath) {
            try {
                await fs.unlink(video.thumbnailPath);
            } catch {
                // Thumbnail might not exist
            }
        }

        // Delete from database (cascades to clips)
        await prisma.video.delete({
            where: { id },
        });

        logger.info(`Video deleted: ${id}`);

        res.status(204).end();
    } catch (error) {
        next(error);
    }
}

/**
 * Get video stream URL
 * GET /api/videos/:id/stream
 */
export async function getVideoStream(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                success: false,
                error: 'Authentication required',
            });
        }
        
        const userId = req.user.userId;
        const { id } = req.params;

        const video = await prisma.video.findFirst({
            where: { id, userId },
        });

        if (!video) {
            return res.status(404).json({
                success: false,
                error: 'Video not found',
            });
        }

        // Return URL to static file
        const url = `/uploads/${video.filename}`;

        res.json({
            success: true,
            data: { url },
        });
    } catch (error) {
        next(error);
    }
}
