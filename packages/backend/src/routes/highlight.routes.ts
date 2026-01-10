import { Router } from 'express';
import * as highlightController from '../controllers/highlight.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All highlight routes require authentication
router.use(authenticate);

// Get all highlights
router.get('/', highlightController.getHighlights);

// Create highlight
router.post('/', highlightController.createHighlight);

// Get highlight by ID
router.get('/:id', highlightController.getHighlightById);

// Download highlight video
router.get('/:id/download', highlightController.downloadHighlight);

// Delete highlight
router.delete('/:id', highlightController.deleteHighlight);

export default router;
