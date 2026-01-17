/**
 * YouTube Routes
 * Routes for YouTube video clip generation feature
 */

import { Router } from 'express';
import * as youtubeController from '../controllers/youtube.controller';
import { authenticate, optionalAuthenticate } from '../middleware/auth.middleware';

const router = Router();

// Public endpoint - analyze video (no auth required for demo, but can use optionalAuthenticate)
router.post('/analyze', optionalAuthenticate, youtubeController.analyzeVideo);

// Protected endpoints - require authentication
router.use(authenticate);

// Save clips to user's account
router.post('/clips', youtubeController.saveClips);

// Get all saved YouTube videos
router.get('/videos', youtubeController.getYouTubeVideos);

// Get specific YouTube video with clips
router.get('/videos/:id', youtubeController.getYouTubeVideo);

// Delete a YouTube video
router.delete('/videos/:id', youtubeController.deleteYouTubeVideo);

// Update a clip
router.patch('/clips/:id', youtubeController.updateClip);

// Delete a clip
router.delete('/clips/:id', youtubeController.deleteClip);

export default router;
