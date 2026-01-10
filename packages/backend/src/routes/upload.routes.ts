import { Router } from 'express';
import * as uploadController from '../controllers/upload.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All upload routes require authentication
router.use(authenticate);

// tus protocol support
router.options('/', uploadController.tusOptions);
router.options('/:uploadId', uploadController.tusOptions);

// Initialize upload
router.post('/init', uploadController.initializeUpload);

// Get upload progress
router.head('/:uploadId', uploadController.getUploadProgress);

// Upload chunk
router.patch('/:uploadId', uploadController.uploadChunk);

// Cancel upload
router.delete('/:uploadId', uploadController.cancelUpload);

export default router;
