import { Router } from 'express';
import * as searchController from '../controllers/search.controller';
import { authenticate } from '../middleware/auth.middleware';

const router = Router();

// All search routes require authentication
router.use(authenticate);

// Search clips
router.post('/', searchController.search);

export default router;
