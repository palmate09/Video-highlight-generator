import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { authService } from '../services/auth/auth.service';
import logger from '../config/logger';

// Validation schemas
const registerSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().optional(),
});

const loginSchema = z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
});

const refreshSchema = z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
});

/**
 * Register a new user
 * POST /api/auth/register
 */
export async function register(req: Request, res: Response, next: NextFunction) {
    try {
        const result = registerSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: result.error.errors,
            });
        }

        const { email, password, name } = result.data;
        const authResponse = await authService.register(email, password, name);

        // Set refresh token as HTTP-only cookie
        res.cookie('refreshToken', authResponse.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.status(201).json({
            success: true,
            data: {
                user: authResponse.user,
                accessToken: authResponse.accessToken,
            },
        });
    } catch (error: any) {
        if (error.message === 'User with this email already exists') {
            return res.status(409).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * Login user
 * POST /api/auth/login
 */
export async function login(req: Request, res: Response, next: NextFunction) {
    try {
        const result = loginSchema.safeParse(req.body);

        if (!result.success) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                details: result.error.errors,
            });
        }

        const { email, password } = result.data;
        const authResponse = await authService.login(email, password);

        // Set refresh token as HTTP-only cookie
        res.cookie('refreshToken', authResponse.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.json({
            success: true,
            data: {
                user: authResponse.user,
                accessToken: authResponse.accessToken,
            },
        });
    } catch (error: any) {
        if (error.message === 'Invalid email or password') {
            return res.status(401).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * Refresh access token
 * POST /api/auth/refresh
 */
export async function refresh(req: Request, res: Response, next: NextFunction) {
    try {
        // Get refresh token from cookie or body
        const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

        if (!refreshToken) {
            return res.status(401).json({
                success: false,
                error: 'Refresh token is required',
            });
        }

        const tokens = await authService.refreshToken(refreshToken);

        // Set new refresh token as HTTP-only cookie
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.json({
            success: true,
            data: {
                accessToken: tokens.accessToken,
            },
        });
    } catch (error: any) {
        if (error.message.includes('token')) {
            return res.status(401).json({
                success: false,
                error: error.message,
            });
        }
        next(error);
    }
}

/**
 * Logout user
 * POST /api/auth/logout
 */
export async function logout(req: Request, res: Response, next: NextFunction) {
    try {
        const refreshToken = req.cookies.refreshToken || req.body.refreshToken;

        if (refreshToken) {
            await authService.logout(refreshToken);
        }

        // Clear refresh token cookie
        res.clearCookie('refreshToken');

        res.json({
            success: true,
            message: 'Logged out successfully',
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Logout from all devices
 * POST /api/auth/logout-all
 */
export async function logoutAll(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as any).user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
            });
        }

        await authService.logoutAll(userId);

        // Clear refresh token cookie
        res.clearCookie('refreshToken');

        res.json({
            success: true,
            message: 'Logged out from all devices successfully',
        });
    } catch (error) {
        next(error);
    }
}

/**
 * Get current user
 * GET /api/auth/me
 */
export async function getCurrentUser(req: Request, res: Response, next: NextFunction) {
    try {
        const userId = (req as any).user?.userId;

        if (!userId) {
            return res.status(401).json({
                success: false,
                error: 'Unauthorized',
            });
        }

        const user = await authService.getUserById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found',
            });
        }

        res.json({
            success: true,
            data: { user },
        });
    } catch (error) {
        next(error);
    }
}
