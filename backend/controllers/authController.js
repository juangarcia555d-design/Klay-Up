import bcrypt from 'bcryptjs';


import jwt from 'jsonwebtoken';
import multer from 'multer';
import crypto from 'crypto';
import { uploadFile, getPublicUrl, createPhoto } from '../models/photoModel.js';

const upload = multer({ storage: multer.memoryStorage() });

export function uploadMiddleware() {
  return upload.single('avatar');
}

// Session cookie helper
const SESSION_MAX_DAYS = parseInt(process.env.SESSION_MAX_DAYS || '30', 10);
function setSessionCookie(res, payload, sessionSecret) {
  const maxDays = Number.isFinite(SESSION_MAX_DAYS) ? SESSION_MAX_DAYS : 30;
  const token = jwt.sign(payload, sessionSecret, { expiresIn: `${maxDays}d` });
  res.cookie('session_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    maxAge: maxDays * 24 * 60 * 60 * 1000,
    path: '/'
  });
  return token;
}

export function registerHandler(supabase, sessionSecret) {
  return async (req, res) => {
    try {
      const { email, password, full_name } = req.body || {};
      console.log('POST /auth/register received - email:', email, 'file:', !!req.file);
      console.log('Request body keys:', Object.keys(req.body || {}));
      if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });
      const emailStr = String(email).trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(emailStr)) return res.status(400).json({ error: 'Email inválido' });
      if (String(password).length < 6) return res.status(400).json({ error: 'La contraseña debe tener al menos 6 caracteres' });

      // Verificar si email ya existe
      const { data: existing, error: qErr } = await supabase.from('usuarios').select('id').eq('email', emailStr).limit(1).maybeSingle();
      if (qErr) return res.status(500).json({ error: 'Error comprobando usuario' });
      if (existing) return res.status(409).json({ error: 'El correo ya está registrado' });

      // Hash password
      const saltRounds = 10;
      const hash = await bcrypt.hash(password, saltRounds);

      // Determinar avatar: preferir upload, si no usar default_avatar enviado desde el formulario
      let avatarUrl = null;
      if (req.body && req.body.default_avatar) {
        // si el cliente envió una URL de avatar predeterminada, úsala
        avatarUrl = String(req.body.default_avatar).trim();
      }
      // Si hay archivo subido, sobreescribir avatarUrl con la subida
      if (req.file && req.file.buffer) {
        // evitar prefijo duplicado en la URL (bucket name se añade en la ruta pública)
        const key = `${Date.now()}-${req.file.originalname}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(key, req.file.buffer, { contentType: req.file.mimetype });
        if (upErr) console.warn('Error subiendo avatar:', upErr.message || upErr);
        else {
          const { data: urlData } = await supabase.storage.from('avatars').getPublicUrl(key);
          avatarUrl = urlData?.publicUrl || null;
          // Normalizar URL por si el key o la respuesta generan un doble segmento 'avatars/avatars'
          if (avatarUrl && avatarUrl.includes('/avatars/avatars/')) {
            avatarUrl = avatarUrl.replace('/avatars/avatars/', '/avatars/');
          }
        }
      }

      // Insertar en tabla usuarios
      const payload = { email: emailStr, password_hash: hash, full_name: full_name || null, avatar_url: avatarUrl };
      console.log('Inserting payload into usuarios:', { ...payload, password_hash: '<hidden>' });
      const { data, error } = await supabase.from('usuarios').insert([payload]).select().single();
      if (error) {
        console.error('Supabase insert error:', error);
        return res.status(500).json({ error: error.message || 'No se pudo crear el usuario' });
      }
      console.log('Inserted user:', data && data.id ? `id=${data.id}` : data);

      // Si la petición vino de un formulario HTML (sin AJAX), redirigir al login con indicador
      const acceptHeader = (req.headers['accept'] || '');
      if (acceptHeader.includes('text/html')) {
        return res.redirect('/login?registered=1');
      }
      // Devolver JSON para peticiones AJAX
      return res.json({ ok: true, id: data.id, message: 'Usuario creado correctamente' });
    } catch (err) {
      console.error('registerHandler error', err && err.stack ? err.stack : err);
      return res.status(500).json({ error: (err && err.message) ? err.message : 'Error interno' });
    }
  };
}

export function loginHandler(supabase, sessionSecret) {
  return async (req, res) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) return res.status(400).json({ error: 'Email y contraseña son requeridos' });
      const emailStr = String(email).trim().toLowerCase();

      const { data, error } = await supabase.from('usuarios').select('*').eq('email', emailStr).limit(1).maybeSingle();
      if (error) return res.status(500).json({ error: 'Error consultando usuario' });
      if (!data) {
        const acceptHeader = (req.headers['accept'] || '');
        if (acceptHeader.includes('text/html')) return res.redirect('/login?error=1');
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      const match = await bcrypt.compare(password, data.password_hash || '');
      if (!match) {
        const acceptHeader = (req.headers['accept'] || '');
        if (acceptHeader.includes('text/html')) return res.redirect('/login?error=1');
        return res.status(401).json({ error: 'Credenciales incorrectas' });
      }

      // Set session cookie (sliding expiration handled by helper)
      setSessionCookie(res, { userId: data.id, email: data.email }, sessionSecret);
      // Si la petición vino de un formulario HTML, redirigir al index protegido (/app)
      const acceptHeader = (req.headers['accept'] || '');
      if (acceptHeader.includes('text/html')) {
        return res.redirect('/app');
      }
      return res.json({ ok: true });
    } catch (err) {
      console.error('loginHandler error', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  };
}

export function logoutHandler() {
  return (req, res) => {
    res.clearCookie('session_token');
    res.json({ ok: true });
  };
}

// Obtener datos del usuario a partir del token de sesión
export function meHandler(supabase, sessionSecret) {
  return async (req, res) => {
    try {
      const token = req.cookies?.session_token || null;
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      let payload;
      try { payload = jwt.verify(token, sessionSecret); } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
      const userId = payload?.userId;
      if (!userId) return res.status(401).json({ error: 'Token inválido' });
      const { data, error } = await supabase.from('usuarios').select('id,email,full_name,avatar_url,theme,profile_description').eq('id', userId).limit(1).maybeSingle();
      if (error) return res.status(500).json({ error: 'Error consultando usuario' });
      if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
      try { setSessionCookie(res, { userId: data.id, email: data.email }, sessionSecret); } catch (e) {}
      return res.json({ ok: true, user: data });
    } catch (err) {
      console.error('meHandler error', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  };
}

// Actualizar tema del usuario (guardado en la tabla usuarios.theme)
export function updateThemeHandler(supabase, sessionSecret) {
  return async (req, res) => {
    try {
      const token = req.cookies?.session_token || null;
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      let payload;
      try { payload = jwt.verify(token, sessionSecret); } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
      const userId = payload?.userId;
      if (!userId) return res.status(401).json({ error: 'Token inválido' });
      const { theme } = req.body || {};
      if (!theme || typeof theme !== 'string') return res.status(400).json({ error: 'Tema inválido' });
      const { data, error } = await supabase.from('usuarios').update({ theme }).eq('id', userId).select().maybeSingle();
      if (error) {
        console.error('Error actualizando tema:', error);
        return res.status(500).json({ error: 'No se pudo actualizar el tema' });
      }
      try { setSessionCookie(res, { userId: userId, email: payload.email }, sessionSecret); } catch (e) {}
      return res.json({ ok: true, theme: data?.theme || theme });
    } catch (err) {
      console.error('updateThemeHandler error', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  };
}

// Actualizar la descripción del perfil del usuario (crear/editar)
export function updateProfileHandler(supabase, sessionSecret) {
  return async (req, res) => {
    try {
      const token = req.cookies?.session_token || null;
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      let payload;
      try { payload = jwt.verify(token, sessionSecret); } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
      const userId = payload?.userId;
      if (!userId) return res.status(401).json({ error: 'Token inválido' });
      const { description } = req.body || {};
      if (typeof description !== 'string') return res.status(400).json({ error: 'Descripción inválida' });
      const { data, error } = await supabase.from('usuarios').update({ profile_description: description }).eq('id', userId).select().maybeSingle();
      if (error) {
        console.error('Error actualizando descripción de perfil:', error);
        return res.status(500).json({ error: 'No se pudo actualizar la descripción' });
      }
      try { setSessionCookie(res, { userId: userId, email: payload.email }, sessionSecret); } catch (e) {}
      return res.json({ ok: true, profile_description: data?.profile_description || description });
    } catch (err) {
      console.error('updateProfileHandler error', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  };
}

// Eliminar (vaciar) la descripción del perfil
export function deleteProfileHandler(supabase, sessionSecret) {
  return async (req, res) => {
    try {
      const token = req.cookies?.session_token || null;
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      let payload;
      try { payload = jwt.verify(token, sessionSecret); } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
      const userId = payload?.userId;
      if (!userId) return res.status(401).json({ error: 'Token inválido' });
      const { data, error } = await supabase.from('usuarios').update({ profile_description: null }).eq('id', userId).select().maybeSingle();
      if (error) {
        console.error('Error eliminando descripción de perfil:', error);
        return res.status(500).json({ error: 'No se pudo eliminar la descripción' });
      }
      try { setSessionCookie(res, { userId: userId, email: payload.email }, sessionSecret); } catch (e) {}
      return res.json({ ok: true });
    } catch (err) {
      console.error('deleteProfileHandler error', err);
      return res.status(500).json({ error: 'Error interno' });
    }
  };
}

// Subir fotos asociadas al perfil del usuario (protected)
export function uploadProfilePhotosHandler(supabase, sessionSecret) {
  return async (req, res) => {
    try {
      const token = req.cookies?.session_token || null;
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      let payload;
      try { payload = jwt.verify(token, sessionSecret); } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
      const userId = payload?.userId;
      if (!userId) return res.status(401).json({ error: 'Token inválido' });

      const { title, description, date_taken, category } = req.body || {};
      const files = req.files || (req.file ? [req.file] : []);
      if (!files || files.length === 0) return res.status(400).json({ error: 'Archivo(s) requerido(s)' });
      if (description && String(description).length > 100) return res.status(400).json({ error: 'La descripción no puede superar 100 caracteres.' });

      const results = [];
      for (const file of files) {
        if (!file.mimetype || (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/'))) {
          return res.status(400).json({ error: 'Tipo de archivo no permitido. Usa imágenes o videos.' });
        }
        const id = crypto.randomUUID();
        const ext = (file.originalname || '').split('.').pop();
        const path = `${id}.${ext}`;
        const uploadResult = await uploadFile(path, file.buffer, file.mimetype);
        if (uploadResult.error) return res.status(500).json({ error: uploadResult.error.message || 'Upload error' });
        const url = getPublicUrl(path);
        const payload = {
          title,
          description,
          date_taken,
          category: file.mimetype && file.mimetype.startsWith('video/') ? 'VIDEO' : (category || 'GALERIA'),
          url,
          user_id: userId,
          is_public: false
        };
        let createResult = await createPhoto(payload);
        // si la BD no tiene la columna is_public puede fallar; en ese caso reintentar sin is_public
        if (createResult.error && /is_public/i.test(String(createResult.error.message || ''))) {
          const fallback = { ...payload };
          delete fallback.is_public;
          createResult = await createPhoto(fallback);
        }
        if (createResult.error) return res.status(500).json({ error: createResult.error.message || 'DB insert error' });
        results.push(createResult.data || createResult);
      }
      return res.status(201).json(results);
    } catch (e) {
      console.error('uploadProfilePhotosHandler error', e);
      return res.status(500).json({ error: e.message || 'Error interno' });
    }
  };
}

// Actualizar avatar del usuario autenticado (archivo o default_avatar)
export function updateAvatarHandler(supabase, sessionSecret) {
  return async (req, res) => {
    try {
      const token = req.cookies?.session_token || null;
      if (!token) return res.status(401).json({ error: 'No autenticado' });
      let payload;
      try { payload = jwt.verify(token, sessionSecret); } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
      const userId = payload?.userId;
      if (!userId) return res.status(401).json({ error: 'Token inválido' });

      let avatarUrl = null;
      if (req.body && req.body.default_avatar) {
        avatarUrl = String(req.body.default_avatar).trim();
      }
      if (req.file && req.file.buffer) {
        const key = `${Date.now()}-${req.file.originalname}`;
        const { error: upErr } = await supabase.storage.from('avatars').upload(key, req.file.buffer, { contentType: req.file.mimetype });
        if (upErr) console.warn('Error subiendo avatar:', upErr.message || upErr);
        else {
          const { data: urlData } = await supabase.storage.from('avatars').getPublicUrl(key);
          avatarUrl = urlData?.publicUrl || avatarUrl;
          if (avatarUrl && avatarUrl.includes('/avatars/avatars/')) avatarUrl = avatarUrl.replace('/avatars/avatars/', '/avatars/');
        }
      }

      if (!avatarUrl) return res.status(400).json({ error: 'avatar requerido' });

      const { data, error } = await supabase.from('usuarios').update({ avatar_url: avatarUrl }).eq('id', userId).select().maybeSingle();
      if (error) return res.status(500).json({ error: error.message || 'Error actualizando avatar' });
      try { setSessionCookie(res, { userId: data.id, email: payload.email }, sessionSecret); } catch (e) {}
      return res.json({ ok: true, avatar: data.avatar_url || avatarUrl });
    } catch (e) { console.error('updateAvatarHandler', e); return res.status(500).json({ error: 'Error interno' }); }
  };
}
