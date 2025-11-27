import express from 'express';
import multer from 'multer';
import { uploadMiddleware, registerHandler, loginHandler, logoutHandler, meHandler, updateThemeHandler, updateProfileHandler, deleteProfileHandler, uploadProfilePhotosHandler, updateAvatarHandler } from '../controllers/authController.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

const router = express.Router();

export default function(supabase, sessionSecret) {
  // register: acepta multipart/form-data (avatar opcional)
  router.post('/register', uploadMiddleware(), registerHandler(supabase, sessionSecret));
  // login: aceptar tanto JSON (fetch) como form-urlencoded (submit HTML)
  router.post('/login', express.json(), express.urlencoded({ extended: true }), loginHandler(supabase, sessionSecret));
  // logout
  router.post('/logout', logoutHandler());
  // obtener info del usuario autenticado
  router.get('/me', meHandler(supabase, sessionSecret));
  // actualizar tema del usuario (require sesión cookie JWT)
  router.post('/theme', express.json(), updateThemeHandler(supabase, sessionSecret));
  // actualizar/eliminar descripción del perfil
  router.post('/profile', express.json(), updateProfileHandler(supabase, sessionSecret));
  router.delete('/profile', deleteProfileHandler(supabase, sessionSecret));
  // subir fotos al perfil (multipart, protected)
  router.post('/profile/photos', upload.array('file', 12), uploadProfilePhotosHandler(supabase, sessionSecret));
  // actualizar avatar del perfil (multipart con campo 'avatar' o default_avatar en body)
  router.post('/profile/avatar', upload.single('avatar'), updateAvatarHandler(supabase, sessionSecret));
  return router;
}
