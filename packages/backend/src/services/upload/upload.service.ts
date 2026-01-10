import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs/promises';
import prisma from '../../config/database';
import config from '../../config';
import logger from '../../config/logger';
import { videoQueue } from '../processing/queue.service';

const ALLOWED_MIME_TYPES = [
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-msvideo',
    'video/x-matroska',
    'video/mpeg',
];

export class UploadService {
    private uploadDir: string;

    constructor() {
        this.uploadDir = path.resolve(config.upload.path);
    }

    /**
     * Initialize a new upload session
     */
    async initializeUpload(
        userId: string,
        filename: string,
        size: number,
        mimeType: string
    ): Promise<{ uploadId: string; path: string }> {
        // Validate file type
        if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
            throw new Error(`Invalid file type. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`);
        }

        // Validate file size
        const maxSize = config.upload.maxSizeMB * 1024 * 1024;
        if (size > maxSize) {
            throw new Error(`File too large. Maximum size: ${config.upload.maxSizeMB}MB`);
        }

        // Generate unique ID and filename
        const uploadId = uuidv4();
        const ext = path.extname(filename);
        const safeFilename = `${uploadId}${ext}`;
        const filePath = path.join(this.uploadDir, safeFilename);

        // Calculate expiry (24 hours from now)
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + 24);

        // Create upload session in database
        await prisma.uploadSession.create({
            data: {
                id: uploadId,
                userId,
                filename: safeFilename,
                originalName: filename,
                mimeType,
                size: BigInt(size),
                uploadedSize: BigInt(0),
                path: filePath,
                status: 'pending',
                expiresAt,
            },
        });

        // Create empty file
        await fs.writeFile(filePath, '');

        logger.info(`Upload session initialized: ${uploadId} for file ${filename}`);

        return { uploadId, path: filePath };
    }

    /**
     * Get upload session
     */
    async getUploadSession(uploadId: string, userId: string) {
        const session = await prisma.uploadSession.findUnique({
            where: { id: uploadId },
        });

        if (!session) {
            throw new Error('Upload session not found');
        }

        if (session.userId !== userId) {
            throw new Error('Unauthorized');
        }

        return session;
    }

    /**
     * Handle chunk upload
     */
    async uploadChunk(
        uploadId: string,
        userId: string,
        chunk: Buffer,
        offset: number
    ): Promise<{ uploadedSize: number; complete: boolean }> {
        const session = await this.getUploadSession(uploadId, userId);

        // Verify offset matches current position
        const currentOffset = Number(session.uploadedSize);
        if (offset !== currentOffset) {
            throw new Error(`Invalid offset. Expected: ${currentOffset}, Got: ${offset}`);
        }

        // Append chunk to file
        const fileHandle = await fs.open(session.path, 'a');
        await fileHandle.write(chunk);
        await fileHandle.close();

        // Update session
        const newUploadedSize = currentOffset + chunk.length;
        await prisma.uploadSession.update({
            where: { id: uploadId },
            data: {
                uploadedSize: BigInt(newUploadedSize),
                status: newUploadedSize >= Number(session.size) ? 'complete' : 'uploading',
            },
        });

        const complete = newUploadedSize >= Number(session.size);

        if (complete) {
            logger.info(`Upload complete: ${uploadId}`);
            // Process the uploaded video
            await this.finalizeUpload(uploadId, userId);
        }

        return { uploadedSize: newUploadedSize, complete };
    }

    /**
     * Finalize upload and create video record
     */
    async finalizeUpload(uploadId: string, userId: string): Promise<string> {
        const session = await this.getUploadSession(uploadId, userId);

        if (session.status !== 'complete') {
            throw new Error('Upload not complete');
        }

        // Create video record
        const video = await prisma.video.create({
            data: {
                userId,
                filename: session.filename,
                originalName: session.originalName,
                path: session.path,
                size: session.size,
                mimeType: session.mimeType,
                status: 'PROCESSING',
            },
        });

        // Delete upload session
        await prisma.uploadSession.delete({
            where: { id: uploadId },
        });

        // Queue video for processing
        await videoQueue.add('process-video', {
            videoId: video.id,
            path: video.path,
        });

        logger.info(`Video created from upload: ${video.id}`);

        return video.id;
    }

    /**
     * Cancel and cleanup upload
     */
    async cancelUpload(uploadId: string, userId: string): Promise<void> {
        const session = await this.getUploadSession(uploadId, userId);

        // Delete file if exists
        try {
            await fs.unlink(session.path);
        } catch {
            // File might not exist
        }

        // Delete session
        await prisma.uploadSession.delete({
            where: { id: uploadId },
        });

        logger.info(`Upload cancelled: ${uploadId}`);
    }

    /**
     * Cleanup expired uploads
     */
    async cleanupExpiredUploads(): Promise<number> {
        const expired = await prisma.uploadSession.findMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });

        for (const session of expired) {
            try {
                await fs.unlink(session.path);
            } catch {
                // File might not exist
            }
        }

        const result = await prisma.uploadSession.deleteMany({
            where: {
                expiresAt: { lt: new Date() },
            },
        });

        if (result.count > 0) {
            logger.info(`Cleaned up ${result.count} expired uploads`);
        }

        return result.count;
    }
}

export const uploadService = new UploadService();
