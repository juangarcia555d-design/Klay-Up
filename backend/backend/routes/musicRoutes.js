import express from 'express';
import multer from 'multer';
import { listMusic, addMusic, removeMusic } from '../controllers/musicController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

router.get('/', listMusic);
router.post('/', upload.single('file'), addMusic);
router.delete('/:id', removeMusic);

export default router;
