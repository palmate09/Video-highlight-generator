import { PrismaClient } from '../generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import config from './index';

// Create Prisma adapter
const adapter = new PrismaMariaDb({
    host: config.databaseHost,
    port: config.databasePort,
    user: config.databaseUser,
    password: config.databasePassword,
    database: config.databaseName,
    connectionLimit: 10,
});

// Create Prisma client with logging in development
const prisma = new PrismaClient({
    adapter,
    log: config.nodeEnv === 'development'
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
});

// Handle connection events
prisma.$connect()
    .then(() => {
        console.log('✅ Database connected successfully');
    })
    .catch((error) => {
        console.error('❌ Database connection failed:', error);
        // We don't exit immediately here to allow retries or better debugging in dev
    });

// Graceful shutdown
process.on('beforeExit', async () => {
    await prisma.$disconnect();
});

export default prisma;
