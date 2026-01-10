import { Queue, Worker, Job } from 'bullmq';
import redis from '../../config/redis';
import logger from '../../config/logger';

// Video processing queue
export const videoQueue = new Queue('video-processing', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
        // Increase timeout for video processing jobs (30 minutes for large videos)
        jobId: undefined,
        timeout: 30 * 60 * 1000, // 30 minutes
    },
});

// Highlight generation queue
export const highlightQueue = new Queue('highlight-generation', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
    },
});

// Transcription queue
export const transcriptionQueue = new Queue('transcription', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 2000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
    },
});

// Embedding queue
export const embeddingQueue = new Queue('embedding', {
    connection: redis,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 50,
    },
});

// Log queue events
videoQueue.on('error', (error) => {
    logger.error(`Video queue error: ${error.message}`);
});

highlightQueue.on('error', (error) => {
    logger.error(`Highlight queue error: ${error.message}`);
});

transcriptionQueue.on('error', (error) => {
    logger.error(`Transcription queue error: ${error.message}`);
});

embeddingQueue.on('error', (error) => {
    logger.error(`Embedding queue error: ${error.message}`);
});

logger.info('✅ Job queues initialized');
