import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../config/database';
import config from '../../config';
import logger from '../../config/logger';
import { highlightQueue } from '../processing/queue.service';

export class HighlightService {
    private outputDir: string;
    private tempDir: string;

    constructor() {
        this.outputDir = path.resolve(config.output.path, 'highlights');
        this.tempDir = path.resolve(config.output.path, 'temp');
        this.ensureDirectories();
    }

    private async ensureDirectories() {
        await fs.mkdir(this.outputDir, { recursive: true });
        await fs.mkdir(this.tempDir, { recursive: true });
    }

    /**
     * Create a new highlight reel
     */
    async createHighlight(
        userId: string,
        name: string,
        clips: Array<{
            clipId?: string;
            videoId?: string;
            startTime: number;
            endTime: number;
        }>
    ): Promise<string> {
        // Validate clips
        if (clips.length === 0) {
            throw new Error('At least one clip is required');
        }

        // Create highlight record
        const highlight = await prisma.highlight.create({
            data: {
                userId,
                name,
                status: 'PENDING',
                clips: {
                    create: clips.map((clip, index) => ({
                        clipId: clip.clipId || null,
                        videoId: clip.videoId || null,
                        order: index,
                        startTime: clip.startTime,
                        endTime: clip.endTime,
                    })),
                },
            },
        });

        // Queue for processing
        await highlightQueue.add('generate-highlight', {
            highlightId: highlight.id,
        });

        logger.info(`Highlight created: ${highlight.id}`);

        return highlight.id;
    }

    /**
     * Get highlight by ID
     */
    async getHighlight(highlightId: string, userId: string) {
        const highlight = await prisma.highlight.findFirst({
            where: { id: highlightId, userId },
            include: {
                clips: {
                    orderBy: { order: 'asc' },
                    include: {
                        clip: true,
                        video: {
                            select: {
                                id: true,
                                filename: true,
                                originalName: true,
                                path: true,
                                thumbnailPath: true,
                            },
                        },
                    },
                },
            },
        });

        return highlight;
    }

    /**
     * Get all highlights for user
     */
    async getHighlights(userId: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        const [highlights, total] = await Promise.all([
            prisma.highlight.findMany({
                where: { userId },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
                include: {
                    _count: {
                        select: { clips: true },
                    },
                },
            }),
            prisma.highlight.count({ where: { userId } }),
        ]);

        return { highlights, total };
    }

    /**
     * Delete highlight
     */
    async deleteHighlight(highlightId: string, userId: string) {
        const highlight = await prisma.highlight.findFirst({
            where: { id: highlightId, userId },
        });

        if (!highlight) {
            throw new Error('Highlight not found');
        }

        // Delete output file if exists
        if (highlight.outputPath) {
            try {
                await fs.unlink(highlight.outputPath);
            } catch {
                // File might not exist
            }
        }

        // Delete from database
        await prisma.highlight.delete({
            where: { id: highlightId },
        });

        logger.info(`Highlight deleted: ${highlightId}`);
    }

    /**
     * Generate highlight video
     */
    async generateHighlightVideo(highlightId: string): Promise<string> {
        const highlight = await prisma.highlight.findUnique({
            where: { id: highlightId },
            include: {
                clips: {
                    orderBy: { order: 'asc' },
                    include: {
                        clip: true,
                        video: true,
                    },
                },
            },
        });

        if (!highlight) {
            throw new Error('Highlight not found');
        }

        // Update status
        await prisma.highlight.update({
            where: { id: highlightId },
            data: { status: 'PROCESSING' },
        });

        try {
            // Extract individual clips
            const clipPaths: string[] = [];

            for (const hClip of highlight.clips) {
                const videoPath = hClip.clip?.video?.path || hClip.video?.path;
                if (!videoPath) {
                    logger.warn(`No video path for highlight clip ${hClip.id}`);
                    continue;
                }

                const clipPath = path.join(this.tempDir, `${uuidv4()}.mp4`);
                await this.extractClip(videoPath, clipPath, hClip.startTime, hClip.endTime);
                clipPaths.push(clipPath);
            }

            if (clipPaths.length === 0) {
                throw new Error('No valid clips to process');
            }

            // Concatenate clips
            const outputPath = path.join(this.outputDir, `${highlightId}.mp4`);
            await this.concatenateClips(clipPaths, outputPath);

            // Cleanup temp files
            for (const clipPath of clipPaths) {
                try {
                    await fs.unlink(clipPath);
                } catch {
                    // Ignore cleanup errors
                }
            }

            // Update highlight with output path
            await prisma.highlight.update({
                where: { id: highlightId },
                data: {
                    outputPath,
                    status: 'READY',
                },
            });

            logger.info(`Highlight generated: ${highlightId}`);

            return outputPath;
        } catch (error: any) {
            logger.error(`Highlight generation failed: ${highlightId} - ${error.message}`);

            await prisma.highlight.update({
                where: { id: highlightId },
                data: { status: 'FAILED' },
            });

            throw error;
        }
    }

    /**
     * Extract clip from video
     */
    private async extractClip(
        videoPath: string,
        outputPath: string,
        startTime: number,
        endTime: number
    ): Promise<void> {
        const duration = endTime - startTime;

        return new Promise((resolve, reject) => {
            const ffmpeg = spawn('ffmpeg', [
                '-i', videoPath,
                '-ss', startTime.toString(),
                '-t', duration.toString(),
                '-c:v', 'libx264',
                '-c:a', 'aac',
                '-preset', 'fast',
                '-crf', '22',
                '-y',
                outputPath,
            ]);

            let stderr = '';
            ffmpeg.stderr.on('data', (data) => {
                stderr += data.toString();
            });

            ffmpeg.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    reject(new Error(`Clip extraction failed: ${stderr}`));
                }
            });
        });
    }

    /**
     * Concatenate multiple clips into one video
     */
    private async concatenateClips(
        clipPaths: string[],
        outputPath: string
    ): Promise<void> {
        if (clipPaths.length === 1) {
            // Just copy single clip
            await fs.copyFile(clipPaths[0], outputPath);
            return;
        }

        // Create concat file
        const concatFile = path.join(this.tempDir, `${uuidv4()}_concat.txt`);
        const concatContent = clipPaths.map((p) => `file '${p}'`).join('\n');
        await fs.writeFile(concatFile, concatContent);

        try {
            await new Promise<void>((resolve, reject) => {
                const ffmpeg = spawn('ffmpeg', [
                    '-f', 'concat',
                    '-safe', '0',
                    '-i', concatFile,
                    '-c:v', 'libx264',
                    '-c:a', 'aac',
                    '-preset', 'fast',
                    '-crf', '22',
                    '-y',
                    outputPath,
                ]);

                let stderr = '';
                ffmpeg.stderr.on('data', (data) => {
                    stderr += data.toString();
                });

                ffmpeg.on('close', (code) => {
                    if (code === 0) {
                        resolve();
                    } else {
                        reject(new Error(`Concatenation failed: ${stderr}`));
                    }
                });
            });
        } finally {
            // Cleanup concat file
            try {
                await fs.unlink(concatFile);
            } catch {
                // Ignore
            }
        }
    }
}

export const highlightService = new HighlightService();
