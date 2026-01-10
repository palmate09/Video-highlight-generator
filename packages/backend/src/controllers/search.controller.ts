import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { searchService } from '../services/search/search.service';
import logger from '../config/logger';

// Validation schema
const searchSchema = z.object({
    query: z.string().min(1, 'Query is required'),
    type: z.enum(['keyword', 'semantic', 'speaker', 'emotion', 'action']).default('keyword'),
    filters: z.object({
        videoId: z.string().optional(),
        speaker: z.string().optional(),
        emotion: z.string().optional(),
        action: z.string().optional(),
    }).optional(),
    limit: z.number().min(1).max(100).default(20),
    offset: z.number().min(0).default(0),
});

/**
 * Search clips
 * POST /api/search
 */
export async function search(req: Request, res: Response, next: NextFunction) {
    try {
        const result = searchSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: result.error.errors,
            });
        }

        const { query, type, filters, limit, offset } = result.data;
        const userId = req.user!.userId;

        const searchResults = await searchService.search(
            userId,
            query,
            type,
            filters,
            limit,
            offset
        );

        res.json({
            success: true,
            data: {
                results: searchResults.results,
                total: searchResults.total,
                query,
                type,
            },
        });
    } catch (error: any) {
        logger.error(`Search error: ${error.message}`);
        next(error);
    }
}
