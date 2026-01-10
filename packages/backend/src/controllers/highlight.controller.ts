import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import path from 'path';
import { highlightService } from '../services/highlight/highlight.service';
import logger from '../config/logger';

// Validation schemas
const createHighlightSchema = z.object({
    name: z.string().min(1, 'Name is required').max(100),
    clips: z.array(z.object({
        clipId: z.string().optional(),
        videoId: z.string().optional(),
        startTime: z.number().min(0),
        endTime: z.number().min(0),
    })).min(1, 'At least one clip is required'),
});

/**
 * Create highlight
 * POST /api/highlights
 */
export async function createHighlight(req: Request, res: Response, next: NextFunction) {
    try {
        const result = createHighlightSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: result.error.errors,
            });
        }

        const { name, clips } = result.data;
        const userId = req.user!.userId;

        const highlightId = await highlightService.createHighlight(userId, name, clips);

        res.status(201).json({
            success: true,
            data: {
                id: highlightId,
                message: 'Highlight queued for generation',
            },
        });
    } catch (error: any) {
        logger.error(`Create highlight error: ${error.message}`);
        next(error);
    }
}

/**
 * Get all highlights
 * GET /api/highlights
 */
export async function getHighlights(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const { page = '1', limit = '20' } = req.query;

        const pageNum = parseInt(page as string, 10);
        const limitNum = parseInt(limit as string, 10);

        const { highlights, total } = await highlightService.getHighlights(
            userId,
            pageNum,
            limitNum
        );

        res.json({
            success: true,
            data: {
                items: highlights.map((h) => ({
                    ...h,
                    clipCount: h._count.clips,
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
 * Get highlight by ID
 * GET /api/highlights/:id
 */
export async function getHighlightById(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;

        const highlight = await highlightService.getHighlight(id, userId);

        if (!highlight) {
            return res.status(404).json({
                success: false,
                error: 'Highlight not found',
            });
        }

        res.json({
            success: true,
            data: highlight,
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Delete highlight
 * DELETE /api/highlights/:id
 */
export async function deleteHighlight(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;

        await highlightService.deleteHighlight(id, userId);

        res.status(204).end();
    } catch (error: any) {
        if (error.message === 'Highlight not found') {
            return res.status(404).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * Download highlight video
 * GET /api/highlights/:id/download
 */
export async function downloadHighlight(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = req.user!.userId;
        const { id } = req.params;

        const highlight = await highlightService.getHighlight(id, userId);

        if (!highlight) {
            return res.status(404).json({
                success: false,
                error: 'Highlight not found',
            });
        }

        if (highlight.status !== 'READY' || !highlight.outputPath) {
            return res.status(400).json({
                success: false,
                error: 'Highlight is not ready for download',
                status: highlight.status,
            });
        }

        // Return download URL
        const filename = `${highlight.name.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
        const url = `/output/highlights/${path.basename(highlight.outputPath)}`;

        res.json({
            success: true,
            data: {
                url,
                filename,
            },
        });
    } catch (error) {
        next(error);
    }
}
