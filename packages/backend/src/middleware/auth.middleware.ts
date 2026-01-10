import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/auth/auth.service';
import logger from '../config/logger';

// Extend Express Request type to include user
declare global {
    namespace Express {
        interface Request {
            user?: {
                userId: string;
                email: string;
            };
        }
    }
}

/**
 * Authentication middleware
 * Verifies JWT access token and attaches user to request
 */
export function authenticate(req: Request, res: Response, next: NextFunction) {
    try {
        // Get token from Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Access token is required',
            });
        }

        const token = authHeader.substring(7); // Remove 'Bearer ' prefix

        // Verify token
        const payload = authService.verifyAccessToken(token);

        // Attach user to request
        req.user = {
            userId: payload.userId,
            email: payload.email,
        };

        next();
    } catch (error: any) {
        logger.warn(`Authentication failed: ${error.message}`);
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired access token',
        });
    }
}

/**
 * Optional authentication middleware
 * Tries to authenticate but doesn't fail if no token is provided
 */
export function optionalAuthenticate(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization;

        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.substring(7);
            const payload = authService.verifyAccessToken(token);
            req.user = {
                userId: payload.userId,
                email: payload.email,
            };
        }

        next();
    } catch {
        // Continue without authentication
        next();
    }
}
