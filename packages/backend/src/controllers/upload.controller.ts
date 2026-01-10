import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { uploadService } from '../services/upload/upload.service';
import logger from '../config/logger';

// Validation schemas
const initUploadSchema = z.object({
    filename: z.string().min(1, 'Filename is required'),
    size: z.number().positive('Size must be positive'),
    mimeType: z.string().min(1, 'MIME type is required'),
});

/**
 * Initialize upload session
 * POST /api/upload/init
 */
export async function initializeUpload(req: Request, res: Response, next: NextFunction) {
    try {
        const result = initUploadSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: result.error.errors,
            });
        }

        const { filename, size, mimeType } = result.data;
        const userId = req.user!.userId;

        const { uploadId, path } = await uploadService.initializeUpload(
            userId,
            filename,
            size,
            mimeType
        );

        res.status(201).json({
            success: true,
            data: {
                uploadId,
                uploadUrl: `/api/upload/${uploadId}`,
            },
        });
    } catch (error: any) {
        if (error.message.includes('Invalid file type') || error.message.includes('File too large')) {
            return res.status(400).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * Get upload progress (tus HEAD request)
 * HEAD /api/upload/:uploadId
 */
export async function getUploadProgress(req: Request, res: Response, next: NextFunction) {
    try {
        const { uploadId } = req.params;
        const userId = req.user!.userId;

        const session = await uploadService.getUploadSession(uploadId, userId);

        res.set({
            'Upload-Offset': session.uploadedSize.toString(),
            'Upload-Length': session.size.toString(),
            'Tus-Resumable': '1.0.0',
        });

        res.status(200).end();
    } catch (error: any) {
        if (error.message === 'Upload session not found') {
            return res.status(404).json({
                success: false,
                error: error.message,
            });
        }
        if (error.message === 'Unauthorized') {
            return res.status(403).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * Upload chunk (tus PATCH request)
 * PATCH /api/upload/:uploadId
 */
export async function uploadChunk(req: Request, res: Response, next: NextFunction) {
    try {
        const { uploadId } = req.params;
        const userId = req.user!.userId;

        // Get offset from header
        const offsetHeader = req.headers['upload-offset'];
        if (!offsetHeader) {
            return res.status(400).json({
                success: false,
                error: 'Upload-Offset header is required',
            });
        }

        const offset = parseInt(offsetHeader as string, 10);
        if (isNaN(offset)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid Upload-Offset header',
            });
        }

        // Collect request body as buffer
        const chunks: Buffer[] = [];
        req.on('data', (chunk) => chunks.push(chunk));

        await new Promise<void>((resolve, reject) => {
            req.on('end', resolve);
            req.on('error', reject);
        });

        const chunk = Buffer.concat(chunks);

        const { uploadedSize, complete } = await uploadService.uploadChunk(
            uploadId,
            userId,
            chunk,
            offset
        );

        res.set({
            'Upload-Offset': uploadedSize.toString(),
            'Tus-Resumable': '1.0.0',
        });

        if (complete) {
            res.status(204).end();
        } else {
            res.status(204).end();
        }
    } catch (error: any) {
        if (error.message === 'Upload session not found') {
            return res.status(404).json({
                success: false,
                error: error.message,
            });
        }
        if (error.message.includes('Invalid offset')) {
            return res.status(409).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * Cancel upload
 * DELETE /api/upload/:uploadId
 */
export async function cancelUpload(req: Request, res: Response, next: NextFunction) {
    try {
        const { uploadId } = req.params;
        const userId = req.user!.userId;

        await uploadService.cancelUpload(uploadId, userId);

        res.status(204).end();
    } catch (error: any) {
        if (error.message === 'Upload session not found') {
            return res.status(404).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * tus OPTIONS request
 * OPTIONS /api/upload
 */
export function tusOptions(req: Request, res: Response) {
    res.set({
        'Tus-Resumable': '1.0.0',
        'Tus-Version': '1.0.0',
        'Tus-Extension': 'creation,termination',
        'Tus-Max-Size': (2000 * 1024 * 1024).toString(), // 2GB
    });
    res.status(204).end();
}
