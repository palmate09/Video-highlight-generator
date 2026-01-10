import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';
import './config/bigint-fix';

import config, { validateConfig } from './config';
import logger from './config/logger';

// Import routes
import authRoutes from './routes/auth.routes';
import videoRoutes from './routes/video.routes';
import uploadRoutes from './routes/upload.routes';
import searchRoutes from './routes/search.routes';
import highlightRoutes from './routes/highlight.routes';

// Import middleware
import { errorHandler } from './middleware/error.middleware';

// NOTE: Workers are now run in a separate process (see src/workers/index.ts)
// This ensures heavy processing doesn't block the API server
// To run workers: npm run worker:dev or npm run worker:start

// Pre-load embedding model on startup to avoid first-time delays
import { preloadEmbeddingModel } from './services/embeddings';

// Validate configuration
validateConfig();

// Global error handlers - prevent server crashes
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Don't exit the process, just log the error
    // The worker/job system should handle individual job failures
});

process.on('uncaughtException', (error: Error) => {
    logger.error('Uncaught Exception:', error);
    // Log but don't exit immediately - let the server continue
    // Only exit if it's a critical error
    if (error.message?.includes('EADDRINUSE') || error.message?.includes('port')) {
        logger.error('Critical port error, exiting...');
        process.exit(1);
    }
});

process.on('warning', (warning: Error) => {
    logger.warn('Process Warning:', warning);
});

// Create Express app
const app = express();

// Create upload directories if they don't exist
const uploadDir = path.resolve(config.upload.path);
const outputDir = path.resolve(config.output.path);
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(outputDir, { recursive: true });

// Security middleware
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

// CORS configuration
app.use(cors({
    origin: config.cors.origin,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Upload-Length', 'Upload-Offset', 'Tus-Resumable', 'Upload-Metadata'],
    exposedHeaders: ['Upload-Offset', 'Location', 'Upload-Length', 'Tus-Version', 'Tus-Resumable', 'Tus-Max-Size', 'Tus-Extension', 'Upload-Metadata'],
}));

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per window
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => config.nodeEnv === 'development' || req.originalUrl.includes('/api/upload') || req.url.includes('/upload'),
});
app.use('/api/', limiter);

// Auth rate limiting (stricter)
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    message: { error: 'Too many authentication attempts, please try again later.' },
    skip: (req) => config.nodeEnv === 'development',
});
app.use('/api/auth/', authLimiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Static file serving for uploads and output with proper headers
app.use('/uploads', express.static(uploadDir, {
    setHeaders: (res, filePath) => {
        // Set CORS headers for video files
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.set('Access-Control-Allow-Headers', 'Range, Content-Type');
        
        // Set proper content-type for video files
        if (filePath.endsWith('.mp4')) {
            res.set('Content-Type', 'video/mp4');
            res.set('Accept-Ranges', 'bytes');
        } else if (filePath.endsWith('.mkv')) {
            res.set('Content-Type', 'video/x-matroska');
            res.set('Accept-Ranges', 'bytes');
        } else if (filePath.endsWith('.webm')) {
            res.set('Content-Type', 'video/webm');
            res.set('Accept-Ranges', 'bytes');
        }
    },
}));

app.use('/output', express.static(outputDir, {
    setHeaders: (res, filePath) => {
        // Set CORS headers
        res.set('Access-Control-Allow-Origin', '*');
        res.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        
        // Set proper content-type for images
        if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
            res.set('Content-Type', 'image/jpeg');
        } else if (filePath.endsWith('.png')) {
            res.set('Content-Type', 'image/png');
        } else if (filePath.endsWith('.mp4')) {
            res.set('Content-Type', 'video/mp4');
            res.set('Accept-Ranges', 'bytes');
        }
    },
}));

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
    });
});

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/highlights', highlightRoutes);

// 404 handler
app.use((req, res) => {
    res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(config.port, '0.0.0.0', async () => {
    logger.info(`🚀 Server running on http://localhost:${config.port}`);
    logger.info(`📁 Upload directory: ${uploadDir}`);
    logger.info(`📁 Output directory: ${outputDir}`);
    logger.info(`🔧 Environment: ${config.nodeEnv}`);
    logger.info(`🎤 Transcription provider: ${config.providers.transcription}`);
    logger.info(`🧠 Embedding provider: ${config.providers.embedding}`);
    
    // Log OpenAI configuration status
    if (config.providers.transcription === 'openai' || config.providers.embedding === 'openai') {
        if (config.openai.apiKey) {
            const maskedKey = config.openai.apiKey.substring(0, 7) + '...' + config.openai.apiKey.substring(config.openai.apiKey.length - 4);
            logger.info(`✅ OpenAI API Key configured: ${maskedKey}`);
        } else {
            logger.warn(`⚠️  OpenAI API Key is missing but OpenAI provider is selected!`);
        }
    }
    
    // Pre-load embedding model in background to avoid first-time delays
    if (config.providers.embedding === 'transformers') {
        preloadEmbeddingModel().catch((error: any) => {
            logger.warn(`Failed to pre-load embedding model: ${error.message}`);
            // Continue anyway - model will load on-demand
        });
    }
});

export default app;
