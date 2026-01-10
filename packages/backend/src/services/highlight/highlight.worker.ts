import { Worker, Job } from 'bullmq';
import redis, { redisOptions } from '../../config/redis';
import logger from '../../config/logger';
import { highlightService } from './highlight.service';

interface HighlightJobData {
    highlightId: string;
}

/**
 * Highlight generation worker
 */
export const highlightWorker = new Worker<HighlightJobData>(
    'highlight-generation',
    async (job: Job<HighlightJobData>) => {
        const { highlightId } = job.data;
        logger.info(`Generating highlight: ${highlightId}`);

        try {
            const outputPath = await highlightService.generateHighlightVideo(highlightId);
            logger.info(`Highlight generation complete: ${highlightId}`);
            return { outputPath };
        } catch (error: any) {
            logger.error(`Highlight generation failed: ${highlightId} - ${error.message}`);
            throw error;
        }
    },
    {
        connection: redisOptions,
        concurrency: 2,
    }
);

// Worker event handlers
highlightWorker.on('completed', (job) => {
    logger.info(`Highlight job completed: ${job.id}`);
});

highlightWorker.on('failed', (job, error) => {
    logger.error(`Highlight job failed: ${job?.id} - ${error.message}`);
});

logger.info('✅ Highlight worker initialized');
