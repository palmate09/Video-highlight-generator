import { Request, Response, NextFunction } from 'express';
import logger from '../config/logger';

/**
 * Custom API Error class
 */
export class ApiError extends Error {
    statusCode: number;
    details?: unknown;

    constructor(statusCode: number, message: string, details?: unknown) {
        super(message);
        this.statusCode = statusCode;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

/**
 * Global error handler middleware
 */
export function errorHandler(
    err: Error | ApiError,
    req: Request,
    res: Response,
    next: NextFunction
) {
    // Log error
    logger.error({
        message: err.message,
        stack: err.stack,
        path: req.path,
        method: req.method,
    });

    // Handle ApiError
    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            error: err.message,
            details: err.details,
        });
    }

    // Handle Prisma errors
    if (err.name === 'PrismaClientKnownRequestError') {
        const prismaError = err as any;
        if (prismaError.code === 'P2002') {
            return res.status(409).json({
                success: false,
                error: 'Resource already exists',
            });
        }
        if (prismaError.code === 'P2025') {
            return res.status(404).json({
                success: false,
                error: 'Resource not found',
            });
        }
    }

    // Handle validation errors
    if (err.name === 'ZodError') {
        return res.status(400).json({
            success: false,
            error: 'Validation failed',
            details: (err as any).errors,
        });
    }

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            error: 'Invalid or expired token',
        });
    }

    // Default error response
    const statusCode = (err as any).statusCode || 500;
    const message = process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message;

    res.status(statusCode).json({
        success: false,
        error: message,
    });
}

/**
 * Not found handler
 */
export function notFoundHandler(req: Request, res: Response) {
    res.status(404).json({
        success: false,
        error: `Route ${req.method} ${req.path} not found`,
    });
}
