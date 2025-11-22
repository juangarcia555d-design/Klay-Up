import express from 'express';
import multer from 'multer';
import { listPhotos, addPhoto, editPhoto, removePhoto } from '../controllers/photoController.js';

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });



router.get('/', listPhotos);
router.post('/', upload.single('file'), addPhoto);
router.put('/:id', editPhoto);
router.delete('/:id', removePhoto);

export default router;
