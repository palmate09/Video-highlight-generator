import Redis, { RedisOptions } from 'ioredis';
import config from './index';

// Parse Redis URL for connection options
const getRedisConfig = (): RedisOptions => {
    try {
        const redisUrl = config.redisUrl;

        // Handle case where redisUrl might not be a valid URL string but just a host
        if (!redisUrl.includes('://')) {
            return {
                host: redisUrl.split(':')[0] || 'localhost',
                port: parseInt(redisUrl.split(':')[1] || '6379', 10),
                maxRetriesPerRequest: null,
                enableReadyCheck: false,
            };
        }

        const url = new URL(redisUrl);
        const db = url.pathname ? parseInt(url.pathname.replace('/', ''), 10) : 0;

        return {
            host: url.hostname || 'localhost',
            port: parseInt(url.port || '6379', 10),
            username: url.username || undefined,
            password: url.password || undefined,
            db: isNaN(db) ? 0 : db,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy: (times: number) => {
                if (times > 10) {
                    return null;
                }
                return Math.min(times * 200, 1000);
            },
        };
    } catch (e) {
        console.error('⚠️  Failed to parse Redis URL, using defaults:', e);
        return {
            host: 'localhost',
            port: 6379,
            maxRetriesPerRequest: null,
            enableReadyCheck: false,
            retryStrategy: (times: number) => {
                if (times > 10) {
                    return null;
                }
                return Math.min(times * 200, 1000);
            },
        };
    }
};


export const redisOptions = getRedisConfig();

// Create a single Redis instance for queues and general use
// Note: BullMQ Workers must use their own dedicated connection
const redis = new Redis(config.redisUrl, {
    ...redisOptions,
    // Add any instance-specific overrides here
});

redis.on('connect', () => {
    console.log('✅ Redis connected successfully');
});

redis.on('error', (error) => {
    console.error('❌ Redis connection error:', error.message);
});

export default redis;


