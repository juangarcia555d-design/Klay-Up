import express from 'express';
import multer from 'multer';
import { listPhotos, addPhoto, editPhoto, removePhoto, reactPhoto, unreactPhoto, getPhotoReactions, checkReactionsTable } from '../controllers/photoController.js';

const router = express.Router();
// Aumentar límite de tamaño para permitir videos (ej. hasta 200MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });



router.get('/', listPhotos);
// Ahora permitimos múltiples archivos (hasta 12 por request)
router.post('/', upload.array('file', 12), addPhoto);
router.put('/:id', editPhoto);
router.delete('/:id', removePhoto);

// Reacciones
router.post('/:id/reaction', express.json(), reactPhoto);
router.delete('/:id/reaction', unreactPhoto);
router.get('/:id/reactions', getPhotoReactions);
// endpoint de diagnóstico
router.get('/debug/reactions-table', checkReactionsTable);

export default router;
