import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
// Try to load from .env file, but Docker will override with environment variables
// In Docker, environment variables are passed directly via docker-compose.yml
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const config = {
    // Server
    port: parseInt(process.env.PORT || '3001', 10),
    nodeEnv: process.env.NODE_ENV || 'development',

    // Database
    databaseUrl: process.env.DATABASE_URL || '',
    databaseHost: process.env.DATABASE_HOST || 'localhost',
    databasePort: parseInt(process.env.DATABASE_PORT || '3306', 10),
    databaseUser: process.env.DATABASE_USER || '',
    databasePassword: process.env.DATABASE_PASSWORD || '',
    databaseName: process.env.DATABASE_NAME || '',

    // Redis
    redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',

    // JWT
    jwt: {
        secret: process.env.JWT_SECRET || 'default-secret-change-in-production',
        refreshSecret: process.env.JWT_REFRESH_SECRET || 'default-refresh-secret-change-in-production',
        accessExpiry: process.env.JWT_ACCESS_EXPIRY || '15m',
        refreshExpiry: process.env.JWT_REFRESH_EXPIRY || '7d',
    },

    // Providers
    providers: {
        transcription: (process.env.TRANSCRIPTION_PROVIDER || 'whisper').toLowerCase().trim(),
        embedding: (process.env.EMBEDDING_PROVIDER || 'transformers').toLowerCase().trim(),
    },

    // OpenAI
    openai: {
        apiKey: process.env.OPENAI_API_KEY || '',
    },

    // Whisper
    whisper: {
        apiUrl: process.env.WHISPER_API_URL || 'http://localhost:8080',
        model: process.env.WHISPER_MODEL || 'base.en',
    },

    // FFmpeg
    ffmpeg: {
        apiUrl: process.env.FFMPEG_API_URL || 'http://localhost:8081',
    },

    // Upload
    upload: {
        maxSizeMB: parseInt(process.env.UPLOAD_MAX_SIZE_MB || '2000', 10),
        chunkSizeMB: parseInt(process.env.UPLOAD_CHUNK_SIZE_MB || '10', 10),
        path: process.env.UPLOAD_PATH || './uploads',
    },

    // Output
    output: {
        path: process.env.OUTPUT_PATH || './output',
    },

    // CORS
    cors: {
        origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    },
};

// Parse DATABASE_URL if components are missing
if (config.databaseUrl && (!process.env.DATABASE_HOST || !process.env.DATABASE_USER)) {
    try {
        const url = new URL(config.databaseUrl);
        config.databaseHost = url.hostname;
        config.databasePort = parseInt(url.port || '3306', 10);
        config.databaseUser = decodeURIComponent(url.username);
        config.databasePassword = decodeURIComponent(url.password);
        config.databaseName = decodeURIComponent(url.pathname.replace('/', ''));
    } catch (e) {
        console.warn('⚠️  Could not parse DATABASE_URL for adapter components');
    }
}

// Validate required config
export function validateConfig(): void {
    const required = ['databaseUrl', 'jwt.secret', 'jwt.refreshSecret'];
    const missing: string[] = [];

    if (!config.databaseUrl) missing.push('DATABASE_URL');
    if (config.jwt.secret === 'default-secret-change-in-production') {
        console.warn('⚠️  WARNING: Using default JWT secret. Set JWT_SECRET in production!');
    }
    if (config.jwt.refreshSecret === 'default-refresh-secret-change-in-production') {
        console.warn('⚠️  WARNING: Using default refresh secret. Set JWT_REFRESH_SECRET in production!');
    }

    if (config.providers.transcription === 'openai' && !config.openai.apiKey) {
        missing.push('OPENAI_API_KEY (required for OpenAI transcription)');
    }
    if (config.providers.embedding === 'openai' && !config.openai.apiKey) {
        missing.push('OPENAI_API_KEY (required for OpenAI embeddings)');
    }

    if (missing.length > 0) {
        console.error('❌ Missing required environment variables:');
        missing.forEach(m => console.error(`   - ${m}`));
        if (config.nodeEnv === 'production') {
            process.exit(1);
        }
    }
}

export default config;
