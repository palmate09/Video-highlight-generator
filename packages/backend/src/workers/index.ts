/**
 * Worker Entry Point
 * 
 * This file runs workers as a separate process from the API server.
 * Workers handle all heavy processing tasks:
 * - Video processing (scene detection, clip creation, transcription)
 * - Embedding generation
 * - Highlight video generation
 * 
 * Run with: npm run worker:dev or npm run worker:start
 */

import '../config/bigint-fix';
import config, { validateConfig } from '../config';
import logger from '../config/logger';

// Import workers - this starts them automatically
// Note: video.worker.ts exports videoWorker, transcriptionWorker, and embeddingWorker
// All three will start when this module is imported
import '../services/processing/video.worker';
import '../services/highlight/highlight.worker';

logger.info('Loading workers...');

// Pre-load embedding model on startup to avoid first-time delays
import { preloadEmbeddingModel } from '../services/embeddings';

// Validate configuration
validateConfig();

// Global error handlers - prevent worker crashes
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
    // Individual job failures are handled by BullMQ
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error);
    // Log but don't exit immediately - let workers continue
    // Only exit if it's a critical error
    if (error.message?.includes('EADDRINUSE') || error.message?.includes('port')) {
        logger.error('Critical port error, exiting...');
        process.exit(1);
    }
});

process.on('warning', (warning: Error) => {
    logger.warn('Process Warning:', warning);
});

// Pre-load embedding model in background if using transformers.js
if (config.providers.embedding === 'transformers') {
    preloadEmbeddingModel().catch((error: any) => {
        logger.warn(`Failed to pre-load embedding model: ${error.message}`);
        // Continue anyway - model will load on-demand
    });
}

logger.info('🚀 Workers started successfully');
logger.info(`🎤 Transcription provider: ${config.providers.transcription}`);
logger.info(`🧠 Embedding provider: ${config.providers.embedding}`);
logger.info(`📊 Redis: ${config.redisUrl}`);
logger.info(`💾 Database: ${config.databaseHost}:${config.databasePort}/${config.databaseName}`);

// Keep process alive
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down workers gracefully...');
    process.exit(0);
});

process.on('SIGINT', async () => {
    logger.info('SIGINT received, shutting down workers gracefully...');
    process.exit(0);
});
