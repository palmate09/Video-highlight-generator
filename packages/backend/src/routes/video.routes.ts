import { Router } from 'express';
import * as videoController from '../controllers/video.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All video routes require authentication
router.use(authenticate);

// Get all videos
router.get('/', videoController.getVideos);

// Get video by ID
router.get('/:id', videoController.getVideoById);

// Get video clips
router.get('/:id/clips', videoController.getVideoClips);

// Get video stream URL
router.get('/:id/stream', videoController.getVideoStream);

// Delete video
router.delete('/:id', videoController.deleteVideo);

export default router;
