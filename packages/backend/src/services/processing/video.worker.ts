import { Worker, Job } from 'bullmq';
import redis, { redisOptions } from '../../config/redis';
import prisma from '../../config/database';
import logger from '../../config/logger';
import { processingService } from './processing.service';
import { embeddingQueue } from './queue.service';

interface VideoJobData {
    videoId: string;
    path: string;
}

interface ClipJobData {
    clipId: string;
    videoPath: string;
    startTime: number;
    endTime: number;
}

/**
 * Video processing worker
 * Handles scene detection, clip extraction, thumbnail generation
 */
export const videoWorker = new Worker<VideoJobData>(
    'video-processing',
    async (job: Job<VideoJobData>) => {
        const { videoId, path: videoPath } = job.data;
        logger.info(`Processing video: ${videoId} at path: ${videoPath}`);

        // Check if video exists in database
        const video = await prisma.video.findUnique({ where: { id: videoId } });
        if (!video) {
            logger.warn(`Video ${videoId} not found in database, skipping processing`);
            return;
        }

        // Verify video file exists on filesystem
        try {
            const fs = await import('fs/promises');
            await fs.access(videoPath);
            const stats = await fs.stat(videoPath);
            logger.info(`Video file verified: ${videoPath}, size: ${(stats.size / (1024 * 1024)).toFixed(2)}MB`);
        } catch (error: any) {
            logger.error(`Video file not found or inaccessible: ${videoPath} - ${error.message}`);
            await prisma.video.updateMany({
                where: { id: videoId },
                data: { status: 'FAILED' },
            });
            throw new Error(`Video file not found: ${videoPath}`);
        }

        try {
            // Update status to PROCESSING
            await prisma.video.updateMany({
                where: { id: videoId },
                data: { status: 'PROCESSING' },
            });

            // Parallelize metadata extraction and thumbnail generation for speed
            logger.info(`Extracting video metadata and generating thumbnail: ${videoId}`);
            const [metadata, thumbnailPath] = await Promise.all([
                processingService.getVideoMetadata(videoPath),
                processingService.generateThumbnail(videoId, videoPath),
            ]);
            logger.info(`Video metadata extracted: duration=${metadata.duration}s, resolution=${metadata.width}x${metadata.height}, fps=${metadata.fps.toFixed(2)}`);

            // Update video with metadata
            await prisma.video.updateMany({
                where: { id: videoId },
                data: {
                    duration: metadata.duration,
                    thumbnailPath,
                    metadata: metadata as any,
                },
            });

            // Update job progress
            await job.updateProgress(20);

            // Refetch video to ensure we have the latest path
            const currentVideo = await prisma.video.findUnique({ where: { id: videoId } });
            if (!currentVideo) {
                logger.warn(`Video ${videoId} disappeared during processing`);
                return;
            }

            // Optimize scene detection: Skip for short videos (< 30 seconds), use fast detection for longer videos
            let scenes: number[];
            const SHORT_VIDEO_THRESHOLD = 30; // 30 seconds
            
            if (metadata.duration <= SHORT_VIDEO_THRESHOLD) {
                // For short videos, skip scene detection - just use start and end
                logger.info(`Video is short (${metadata.duration.toFixed(2)}s <= ${SHORT_VIDEO_THRESHOLD}s), skipping scene detection`);
                scenes = [0, metadata.duration];
            } else {
                // For longer videos, use optimized scene detection
                logger.info(`Detecting scenes in video: ${videoId} (duration: ${metadata.duration.toFixed(2)}s)`);
                const sceneDetectionStart = Date.now();
                scenes = await processingService.detectScenes(videoPath, metadata.duration);
                const sceneDetectionTime = ((Date.now() - sceneDetectionStart) / 1000).toFixed(2);
                logger.info(`Detected ${scenes.length} scenes in ${sceneDetectionTime}s for video ${videoId}`);
            }

            await job.updateProgress(40);

            // Create clips for each scene
            logger.info(`Creating clips from ${scenes.length} scenes for video: ${videoId}`);
            const clips = await processingService.createClipsFromScenes(
                videoId,
                scenes,
                metadata.duration
            );
            logger.info(`Created ${clips.length} clips for video: ${videoId}`);

            // Update status to TRANSCRIBING
            await prisma.video.updateMany({
                where: { id: videoId },
                data: { status: 'TRANSCRIBING' },
            });

            // Transcribe whole video once
            await job.updateProgress(60);
            logger.info(`Starting transcription for full video: ${videoId} (duration: ${metadata.duration.toFixed(2)}s)`);
            const transcriptionStart = Date.now();
            const transcription = await processingService.transcribeFullVideo(videoPath);
            const transcriptionTime = ((Date.now() - transcriptionStart) / 1000).toFixed(2);
            await job.updateProgress(80);

            if (!transcription.segments || transcription.segments.length === 0) {
                logger.warn(`No transcription segments found for video: ${videoId} after ${transcriptionTime}s`);
            } else {
                logger.info(`Transcribed full video: ${videoId}, found ${transcription.segments.length} segments in ${transcriptionTime}s`);
                const totalTranscriptLength = transcription.segments.reduce((acc: number, s: any) => acc + (s.text?.length || 0), 0);
                logger.info(`Total transcript length: ${totalTranscriptLength} characters`);
            }

            // Update status to EMBEDDING
            await prisma.video.updateMany({
                where: { id: videoId },
                data: { status: 'EMBEDDING' },
            });

            // Map transcription segments to clips and process embeddings
            logger.info(`Mapping ${transcription.segments?.length || 0} transcription segments to ${clips.length} clips for video: ${videoId}`);

            // Process clips to extract transcripts
            const clipTranscripts: Array<{ clipId: string; transcript: string; hasTranscript: boolean }> = [];
            
            for (const clip of clips) {
                const overlappingSegments = (transcription.segments || [])
                    .filter((s: any) => {
                        // More lenient overlap check: if segment is 0 duration but at clip start, include it
                        // or if there is any actual overlap
                        const overlapStart = Math.max(s.start, clip.startTime);
                        const overlapEnd = Math.min(s.end, clip.endTime);
                        return (overlapEnd > overlapStart) || (s.start >= clip.startTime && s.end <= clip.endTime);
                    });

                const clipTranscript = overlappingSegments
                    .map((s: any) => s.text)
                    .join(' ')
                    .trim();

                const hasTranscript = clipTranscript.length > 0;

                if (hasTranscript) {
                    logger.debug(`Clip ${clip.id} (${clip.startTime.toFixed(2)}s-${clip.endTime.toFixed(2)}s): ${overlappingSegments.length} segments, ${clipTranscript.length} chars`);
                } else {
                    logger.debug(`No transcript found for clip ${clip.id} (${clip.startTime.toFixed(2)}s-${clip.endTime.toFixed(2)}s)`);
                }

                // Update clip with transcript
                await prisma.clip.updateMany({
                    where: { id: clip.id },
                    data: { transcript: clipTranscript },
                });

                clipTranscripts.push({
                    clipId: clip.id,
                    transcript: clipTranscript,
                    hasTranscript,
                });
            }

            const clipsWithTranscript = clipTranscripts.filter(c => c.hasTranscript);
            
            // Optimize: For short videos or small number of clips, process embeddings in batch
            // This is MUCH faster than queuing individually (especially for Transformers.js)
            const SHORT_VIDEO_CLIP_THRESHOLD = 10; // Process in batch if <= 10 clips
            const shouldBatch = clipsWithTranscript.length <= SHORT_VIDEO_CLIP_THRESHOLD;

            if (shouldBatch && clipsWithTranscript.length > 0) {
                logger.info(`Processing ${clipsWithTranscript.length} embeddings in batch for fast video: ${videoId}`);
                const embeddingStart = Date.now();

                try {
                    // Extract transcripts for batch processing
                    const transcripts = clipsWithTranscript.map(c => c.transcript);
                    
                    // Validate transcripts before processing
                    if (!transcripts || transcripts.length === 0) {
                        logger.warn(`No transcripts to embed for video ${videoId}`);
                        await checkVideoCompletion(videoId);
                        return;
                    }
                    
                    // Generate all embeddings in one batch call with timeout
                    // Reduced timeout for short videos - should be much faster if model is pre-loaded
                    const BATCH_EMBEDDING_TIMEOUT = 30000; // 30 seconds timeout (reduced from 2 min)
                    logger.debug(`Starting batch embedding generation for ${transcripts.length} transcripts`);
                    const embeddingsPromise = processingService.generateEmbeddingsBatch(transcripts);
                    const timeoutPromise = new Promise((_, reject) => 
                        setTimeout(() => reject(new Error('Batch embedding timeout')), BATCH_EMBEDDING_TIMEOUT)
                    );
                    
                    const embeddings = await Promise.race([embeddingsPromise, timeoutPromise]) as number[][];
                    logger.debug(`Batch embedding generation completed for ${embeddings.length} embeddings`);
                    
                    // Validate embeddings array length matches clips
                    if (!embeddings || embeddings.length !== clipsWithTranscript.length) {
                        throw new Error(`Embedding count mismatch: expected ${clipsWithTranscript.length}, got ${embeddings?.length || 0}`);
                    }
                    
                    // Update all clips with embeddings in parallel
                    await Promise.all(
                        clipsWithTranscript.map(async (clipData, index) => {
                            try {
                                const embedding = embeddings[index];
                                
                                // Validate embedding exists and is valid
                                if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                                    logger.warn(`Invalid embedding for clip ${clipData.clipId} at index ${index}`);
                                    return;
                                }
                                
                                const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);
                                
                                await prisma.clip.updateMany({
                                    where: { id: clipData.clipId },
                                    data: { embedding: embeddingBuffer },
                                });
                            } catch (e: any) {
                                logger.error(`Failed to save embedding for clip ${clipData.clipId}: ${e.message}`);
                                // Continue processing other clips even if one fails
                            }
                        })
                    );

                    const embeddingTime = ((Date.now() - embeddingStart) / 1000).toFixed(2);
                    logger.info(`Batch embedding completed in ${embeddingTime}s for ${clipsWithTranscript.length} clips`);

                    // Check if video is complete
                    await checkVideoCompletion(videoId);
                } catch (error: any) {
                    logger.error(`Batch embedding failed for video ${videoId}: ${error.message}`, {
                        stack: error.stack,
                        videoId,
                        clipCount: clipsWithTranscript.length,
                    });
                    
                    // Fallback to individual processing if batch fails
                    logger.info(`Falling back to individual embedding processing for ${clipsWithTranscript.length} clips`);
                    let queuedCount = 0;
                    for (const clipData of clipsWithTranscript) {
                        try {
                            await embeddingQueue.add('embed-clip', {
                                clipId: clipData.clipId,
                                transcript: clipData.transcript,
                            }, {
                                attempts: 3,
                                backoff: {
                                    type: 'exponential',
                                    delay: 2000,
                                },
                            });
                            queuedCount++;
                        } catch (e: any) {
                            logger.error(`Failed to queue embedding for clip ${clipData.clipId}: ${e.message}`);
                        }
                    }
                    logger.info(`Queued ${queuedCount} of ${clipsWithTranscript.length} clips for individual embedding`);
                }
            } else {
                // For longer videos with many clips, queue individually for better resource management
                logger.info(`Queuing ${clipsWithTranscript.length} clips for embedding processing`);
                for (const clipData of clipsWithTranscript) {
                    await embeddingQueue.add('embed-clip', {
                        clipId: clipData.clipId,
                        transcript: clipData.transcript,
                    });
                }
            }

            const totalSegmentsMapped = clipTranscripts.reduce((sum, c) => {
                const segments = (transcription.segments || []).filter((s: any) => {
                    const clip = clips.find(cl => cl.id === c.clipId);
                    if (!clip) return false;
                    const overlapStart = Math.max(s.start, clip.startTime);
                    const overlapEnd = Math.min(s.end, clip.endTime);
                    return (overlapEnd > overlapStart) || (s.start >= clip.startTime && s.end <= clip.endTime);
                });
                return sum + segments.length;
            }, 0);

            logger.info(`Video processing complete: ${videoId}, ${clips.length} clips created, ${clipsWithTranscript.length} have transcripts (${totalSegmentsMapped} segments mapped)`);

            return { clipCount: clips.length };
        } catch (error: any) {
            logger.error(`Video processing failed: ${videoId} - ${error.message}`);

            await prisma.video.updateMany({
                where: { id: videoId },
                data: { status: 'FAILED' },
            });

            throw error;
        }
    },
    {
        connection: redisOptions,
        concurrency: 4, // Increased from 2
        maxStalledCount: 3,
        stalledInterval: 30000, // Check for stalled jobs every 30 seconds
        lockDuration: 10 * 60 * 1000, // 10 minutes lock duration
    }
);

/**
 * Transcription worker
 * Handles clip audio extraction and transcription
 */
export const transcriptionWorker = new Worker<ClipJobData>(
    'transcription',
    async (job: Job<ClipJobData>) => {
        const { clipId, videoPath, startTime, endTime } = job.data;
        logger.info(`Transcribing clip: ${clipId}`);

        try {
            // Get transcription
            const transcript = await processingService.transcribeClip(
                videoPath,
                startTime,
                endTime
            );

            // Update clip with transcript
            await prisma.clip.updateMany({
                where: { id: clipId },
                data: { transcript },
            });

            // Queue for embedding
            await embeddingQueue.add('embed-clip', {
                clipId,
                transcript,
            });

            logger.info(`Transcription complete: ${clipId}`);
            return { transcript };
        } catch (error: any) {
            logger.error(`Transcription failed: ${clipId} - ${error.message}`);
            throw error;
        }
    },
    {
        connection: redisOptions,
        concurrency: 8, // Increased from 4
    }
);

/**
 * Embedding worker
 * Handles text embedding generation for semantic search
 */
export const embeddingWorker = new Worker<{ clipId: string; transcript: string }>(
    'embedding',
    async (job: Job<{ clipId: string; transcript: string }>) => {
        const { clipId, transcript } = job.data;
        logger.info(`Generating embedding for clip: ${clipId}`);

        try {
            if (transcript && transcript.trim().length > 0) {
                // Generate embedding with timeout
                const EMBEDDING_TIMEOUT = 60000; // 60 seconds timeout
                const embeddingPromise = processingService.generateEmbedding(transcript);
                const timeoutPromise = new Promise<never>((_, reject) => 
                    setTimeout(() => reject(new Error('Embedding generation timeout')), EMBEDDING_TIMEOUT)
                );
                
                const embedding = await Promise.race([embeddingPromise, timeoutPromise]) as number[];

                // Validate embedding
                if (!embedding || !Array.isArray(embedding) || embedding.length === 0) {
                    throw new Error('Invalid embedding generated');
                }

                // Store embedding as binary (Prisma Bytes field)
                const embeddingBuffer = Buffer.from(new Float32Array(embedding).buffer);

                // Update clip with embedding
                await prisma.clip.updateMany({
                    where: { id: clipId },
                    data: { embedding: embeddingBuffer },
                });

                logger.info(`Embedding generated for clip: ${clipId}`);
            } else {
                logger.warn(`No transcript for clip ${clipId}, skipping embedding`);
            }

            // Get videoId to check completion
            const clip = await prisma.clip.findUnique({
                where: { id: clipId },
                select: { videoId: true }
            });

            if (clip) {
                await checkVideoCompletion(clip.videoId).catch((e: any) => {
                    logger.error(`Failed to check video completion for ${clip.videoId}: ${e.message}`);
                    // Don't throw - this is not critical
                });
            }

            return { success: true };
        } catch (error: any) {
            logger.error(`Embedding failed: ${clipId} - ${error.message}`, {
                clipId,
                error: error.message,
                stack: error.stack,
                hasTranscript: !!(transcript && transcript.trim().length > 0),
            });
            // Re-throw so BullMQ can retry the job if configured
            throw error;
        }
    },
    {
        connection: redisOptions,
        concurrency: 8, // Increased for better throughput
        maxStalledCount: 3,
        stalledInterval: 30000,
    }
);

/**
 * Check if all clips for a video are processed and update status to READY
 */
async function checkVideoCompletion(videoId: string) {
    try {
        const pendingClips = await prisma.clip.count({
            where: {
                videoId: videoId,
                embedding: null,
                OR: [
                    { transcript: { not: "" } },
                    { transcript: null }
                ]
            },
        });

        if (pendingClips > 0) {
            logger.debug(`Video ${videoId} still has ${pendingClips} pending clips`);
            return;
        }

        // All clips processed, update video status ONLY if it's currently EMBEDDING
        // This prevents overwriting a FAILED status if something went wrong elsewhere
        const updated = await prisma.video.updateMany({
            where: {
                id: videoId,
                status: 'EMBEDDING'
            },
            data: { status: 'READY' },
        });

        if (updated.count > 0) {
            logger.info(`Video ready: ${videoId}`);
        } else {
            logger.debug(`Video ${videoId} reached completion check but status was not EMBEDDING (likely already READY or FAILED)`);
        }

    } catch (error: any) {
        logger.error(`Error checking video completion for ${videoId}: ${error.message}`);
    }
}

// Worker event handlers with comprehensive error handling
videoWorker.on('completed', (job) => {
    logger.info(`Video job completed: ${job.id}`);
});

videoWorker.on('failed', (job, error) => {
    logger.error(`Video job failed: ${job?.id} - ${error.message}`, {
        jobId: job?.id,
        error: error.message,
        stack: error.stack,
        data: job?.data,
    });
    
    // Try to update video status to FAILED if job data is available
    if (job?.data) {
        const { videoId } = job.data as VideoJobData;
        if (videoId) {
            prisma.video.updateMany({
                where: { id: videoId },
                data: { status: 'FAILED' },
            }).catch((e: any) => {
                logger.error(`Failed to update video status to FAILED: ${e.message}`);
            });
        }
    }
});

videoWorker.on('error', (error) => {
    logger.error(`Video worker error: ${error.message}`, {
        error: error.message,
        stack: error.stack,
    });
});

transcriptionWorker.on('completed', (job) => {
    logger.info(`Transcription job completed: ${job.id}`);
});

transcriptionWorker.on('failed', (job, error) => {
    logger.error(`Transcription job failed: ${job?.id} - ${error.message}`, {
        jobId: job?.id,
        error: error.message,
        stack: error.stack,
    });
});

transcriptionWorker.on('error', (error) => {
    logger.error(`Transcription worker error: ${error.message}`, {
        error: error.message,
        stack: error.stack,
    });
});

embeddingWorker.on('completed', (job) => {
    logger.info(`Embedding job completed: ${job.id}`);
});

embeddingWorker.on('failed', (job, error) => {
    logger.error(`Embedding job failed: ${job?.id} - ${error.message}`, {
        jobId: job?.id,
        error: error.message,
        stack: error.stack,
        data: job?.data,
    });
    
    // Try to continue processing other clips even if one fails
    // The checkVideoCompletion will still run
});

embeddingWorker.on('error', (error) => {
    logger.error(`Embedding worker error: ${error.message}`, {
        error: error.message,
        stack: error.stack,
    });
    // Don't crash the server - workers should recover
});

logger.info('✅ Video workers initialized');
