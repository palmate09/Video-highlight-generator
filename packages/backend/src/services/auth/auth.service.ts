import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import prisma from '../../config/database';
import config from '../../config';
import logger from '../../config/logger';
import type { User, TokenPayload, AuthResponse } from '@vhg/shared';

const SALT_ROUNDS = 12;

export class AuthService {
    /**
     * Register a new user
     */
    async register(
        email: string,
        password: string,
        name?: string
    ): Promise<AuthResponse> {
        // Check if user exists
        const existingUser = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (existingUser) {
            throw new Error('User with this email already exists');
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        const user = await prisma.user.create({
            data: {
                email: email.toLowerCase(),
                passwordHash,
                name,
            },
        });

        logger.info(`New user registered: ${user.email}`);

        // Generate tokens
        const { accessToken, refreshToken } = await this.generateTokens(user);

        return {
            user: this.sanitizeUser(user),
            accessToken,
            refreshToken,
        };
    }

    /**
     * Login user with email and password
     */
    async login(email: string, password: string): Promise<AuthResponse> {
        // Find user
        const user = await prisma.user.findUnique({
            where: { email: email.toLowerCase() },
        });

        if (!user) {
            throw new Error('Invalid email or password');
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.passwordHash);

        if (!isValidPassword) {
            throw new Error('Invalid email or password');
        }

        logger.info(`User logged in: ${user.email}`);

        // Generate tokens
        const { accessToken, refreshToken } = await this.generateTokens(user);

        return {
            user: this.sanitizeUser(user),
            accessToken,
            refreshToken,
        };
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshToken(token: string): Promise<{ accessToken: string; refreshToken: string }> {
        // Find refresh token in database
        const storedToken = await prisma.refreshToken.findUnique({
            where: { token },
            include: { user: true },
        });

        if (!storedToken) {
            throw new Error('Invalid refresh token');
        }

        // Check if token is expired
        if (storedToken.expiresAt < new Date()) {
            // Delete expired token
            await prisma.refreshToken.delete({ where: { id: storedToken.id } });
            throw new Error('Refresh token expired');
        }

        // Verify JWT
        try {
            jwt.verify(token, config.jwt.refreshSecret);
        } catch {
            await prisma.refreshToken.delete({ where: { id: storedToken.id } });
            throw new Error('Invalid refresh token');
        }

        // Delete old refresh token (rotation)
        await prisma.refreshToken.delete({ where: { id: storedToken.id } });

        // Generate new tokens
        const { accessToken, refreshToken: newRefreshToken } = await this.generateTokens(
            storedToken.user
        );

        logger.info(`Token refreshed for user: ${storedToken.user.email}`);

        return {
            accessToken,
            refreshToken: newRefreshToken,
        };
    }

    /**
     * Logout user by invalidating refresh token
     */
    async logout(refreshToken: string): Promise<void> {
        try {
            await prisma.refreshToken.delete({
                where: { token: refreshToken },
            });
            logger.info('User logged out');
        } catch {
            // Token might not exist, that's okay
        }
    }

    /**
     * Logout user from all devices
     */
    async logoutAll(userId: string): Promise<void> {
        await prisma.refreshToken.deleteMany({
            where: { userId },
        });
        logger.info(`User logged out from all devices: ${userId}`);
    }

    /**
     * Get user by ID
     */
    async getUserById(userId: string): Promise<User | null> {
        const user = await prisma.user.findUnique({
            where: { id: userId },
        });

        return user ? this.sanitizeUser(user) : null;
    }

    /**
     * Verify access token
     */
    verifyAccessToken(token: string): TokenPayload {
        try {
            const payload = jwt.verify(token, config.jwt.secret) as TokenPayload;
            return payload;
        } catch {
            throw new Error('Invalid access token');
        }
    }

    /**
     * Generate access and refresh tokens
     */
    private async generateTokens(
        user: { id: string; email: string }
    ): Promise<{ accessToken: string; refreshToken: string }> {
        const payload: TokenPayload = {
            userId: user.id,
            email: user.email,
        };

        // Generate access token
        const accessToken = jwt.sign(payload, config.jwt.secret, {
            expiresIn: config.jwt.accessExpiry,
        });

        // Generate refresh token
        const refreshToken = jwt.sign(payload, config.jwt.refreshSecret, {
            expiresIn: config.jwt.refreshExpiry,
        });

        // Calculate expiry date (7 days by default)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 7);

        // Store refresh token in database
        await prisma.refreshToken.create({
            data: {
                token: refreshToken,
                userId: user.id,
                expiresAt,
            },
        });

        // Cleanup old tokens (keep only last 5 per user)
        const tokens = await prisma.refreshToken.findMany({
            where: { userId: user.id },
            orderBy: { createdAt: 'desc' },
        });

        if (tokens.length > 5) {
            const tokensToDelete = tokens.slice(5).map((t) => t.id);
            await prisma.refreshToken.deleteMany({
                where: { id: { in: tokensToDelete } },
            });
        }

        return { accessToken, refreshToken };
    }

    /**
     * Remove sensitive data from user object
     */
    private sanitizeUser(user: { id: string; email: string; name: string | null; createdAt: Date; updatedAt: Date }): User {
        return {
            id: user.id,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt,
        };
    }
}

export const authService = new AuthService();
