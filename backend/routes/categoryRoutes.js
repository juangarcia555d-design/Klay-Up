import express from 'express';
import { listCategories, addCategory, removeCategory } from '../controllers/categoryController.js';
import { requireAuth } from '../controllers/authController.js';

const router = express.Router();

router.get('/', requireAuth, listCategories);
router.post('/', requireAuth, addCategory);
router.delete('/', requireAuth, removeCategory);

export default router;