import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import {
  getPhotos,
  createPhoto,
  updatePhoto,
  deletePhoto,
  uploadFile,
  getPublicUrl,
  removeFile,
  addReaction,
  removeReaction,
  getReactions,
  getUserReaction
} from '../models/photoModel.js';

import jwt from 'jsonwebtoken';

// 📸 Listar fotos
export async function listPhotos(req, res) {
  try {
    const { category } = req.query;
    console.log('listPhotos called with category=', category);
    // Si se solicita una categoría concreta, devolverla.
    // Si no se especifica categoría, ocultar videos para que sólo se vean en la pestaña VIDEO.
    if (category) {
      // Sólo devolver fotos públicas cuando es una petición pública de galería
      try {
          const { data, error } = await getPhotos(category).eq('is_public', true);
          if (error) return res.status(500).json({ error: error.message });
          const photos = data || [];
          const userIds = Array.from(new Set(photos.filter(p => p.user_id).map(p => p.user_id)));
          let usersMap = {};
          if (userIds.length) {
            const { data: users } = await supabase.from('usuarios').select('id,full_name,avatar_url').in('id', userIds);
            usersMap = (users || []).reduce((acc, u) => { acc[String(u.id)] = u; return acc; }, {});
          }
          const enhanced = await Promise.all(photos.map(async (p) => {
            const r = await getReactions(p.id);
            const uploader = p.user_id ? usersMap[String(p.user_id)] : null;
            return { ...p, uploader, reactions: { likes: r.count_like || 0, dislikes: r.count_dislike || 0 } };
          }));
          console.log('listPhotos -> returning', enhanced.length, 'rows; sample categories:', enhanced.slice(0,6).map(x=>x.category));
          return res.json(enhanced);
      } catch (e) {
        // Si la columna is_public no existe en la DB, caeremos a una regla segura: devolver solo filas *sin* user_id (públicas)
        try {
          const { data, error } = await getPhotos(category).is('user_id', null);
          if (error) return res.status(500).json({ error: error.message });
          return res.json(data);
        } catch (e2) {
          return res.status(500).json({ error: e2.message || 'Error interno' });
        }
      }
    }

    // No hay categoría -> excluir VIDEO
    try {
        const { data, error } = await supabase
          .from('photos')
          .select('id, title, description, date_taken, category, url, user_id')
          .neq('category', 'VIDEO')
          .eq('is_public', true)
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        // Añadir información del uploader y conteos de reacciones
        const photos = data || [];
        // recolectar user_ids únicos
        const userIds = Array.from(new Set(photos.filter(p => p.user_id).map(p => p.user_id)));
        let usersMap = {};
        if (userIds.length) {
          const { data: users } = await supabase.from('usuarios').select('id,full_name,avatar_url').in('id', userIds);
          usersMap = (users || []).reduce((acc, u) => { acc[String(u.id)] = u; return acc; }, {});
        }
        // obtener reacciones para cada foto (conteos)
        const enhanced = await Promise.all(photos.map(async (p) => {
          const r = await getReactions(p.id);
          const uploader = p.user_id ? usersMap[String(p.user_id)] : null;
          return { ...p, uploader, reactions: { likes: r.count_like || 0, dislikes: r.count_dislike || 0 } };
        }));
        console.log('listPhotos -> returning', enhanced.length, 'rows; sample categories:', enhanced.slice(0,6).map(x=>x.category));
        return res.json(enhanced);
    } catch (e) {
      // fallback si is_public no existe: asumimos que las fotos con user_id son uploads de perfil y no deben mostrarse
      try {
        const { data, error } = await supabase
          .from('photos')
          .select('id, title, description, date_taken, category, url, user_id')
          .neq('category', 'VIDEO')
          .is('user_id', null)
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        const photos = data || [];
        const enhanced = await Promise.all(photos.map(async (p) => {
          const r = await getReactions(p.id);
          return { ...p, uploader: null, reactions: { likes: r.count_like || 0, dislikes: r.count_dislike || 0 } };
        }));
        console.log('listPhotos (fallback) -> returning', enhanced.length, 'rows; sample categories:', enhanced.slice(0,6).map(x=>x.category));
        return res.json(enhanced);
      } catch (e2) {
        return res.status(500).json({ error: e2.message || 'Error interno' });
      }
    }
    if (error) return res.status(500).json({ error: error.message });
    // attach reactions
    const photos = data || [];
    const enhanced = await Promise.all(photos.map(async (p) => {
      const r = await getReactions(p.id);
      return { ...p, reactions: { likes: r.count_like || 0, dislikes: r.count_dislike || 0 } };
    }));
    res.json(enhanced);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// POST /api/photos/:id/reaction  -> body: { reaction: 'like'|'dislike' }
export async function reactPhoto(req, res) {
  try {
    const token = req.cookies?.session_token || null;
    const secret = process.env.SESSION_SECRET || 'change_this_in_production';
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    let payload;
    try { payload = jwt.verify(token, secret); } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
    const userId = payload?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const photoId = Number(req.params.id);
    const { reaction } = req.body || {};
    if (!['like', 'dislike'].includes(reaction)) return res.status(400).json({ error: 'Reacción inválida' });
    const { data, error } = await addReaction(photoId, userId, reaction);
    if (error) {
      const msg = String(error.message || error);
      if (/photo_reactions/i.test(msg) || /does not exist|relation ".*photo_reactions" does not exist|undefined_table/i.test(msg)) {
        return res.status(500).json({ error: 'Tabla photo_reactions no encontrada en la base de datos. Ejecuta la migración add_photo_reactions.sql en Supabase.' });
      }
      return res.status(500).json({ error: msg });
    }
    return res.json({ ok: true, reaction: data });
  } catch (e) { console.error('reactPhoto error', e); return res.status(500).json({ error: e.message || 'Error interno' }); }
}

// DELETE /api/photos/:id/reaction  -> quita la reacción del usuario autenticado
export async function unreactPhoto(req, res) {
  try {
    const token = req.cookies?.session_token || null;
    const secret = process.env.SESSION_SECRET || 'change_this_in_production';
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    let payload;
    try { payload = jwt.verify(token, secret); } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
    const userId = payload?.userId;
    if (!userId) return res.status(401).json({ error: 'No autenticado' });
    const photoId = Number(req.params.id);
    const { error } = await removeReaction(photoId, userId);
    if (error) return res.status(500).json({ error: error.message || error });
    return res.json({ ok: true });
  } catch (e) { console.error('unreactPhoto error', e); return res.status(500).json({ error: e.message || 'Error interno' }); }
}

// GET /api/photos/:id/reactions -> devuelve listas de usuarios que dieron like/dislike
export async function getPhotoReactions(req, res) {
  try {
    const photoId = Number(req.params.id);
    const r = await getReactions(photoId);
    if (r.error) return res.status(500).json({ error: r.error.message || r.error });
    // traer información de usuarios (avatar, full_name)
    const userIds = Array.from(new Set([...(r.likes || []), ...(r.dislikes || [])]));
    let users = [];
    if (userIds.length) {
      const { data, error } = await supabase.from('usuarios').select('id,full_name,avatar_url').in('id', userIds);
      if (error) return res.status(500).json({ error: error.message || error });
      users = data || [];
    }
    const usersById = (users || []).reduce((acc, u) => { acc[String(u.id)] = u; return acc; }, {});
    const likes = (r.likes || []).map(id => usersById[String(id)] || { id });
    const dislikes = (r.dislikes || []).map(id => usersById[String(id)] || { id });
    return res.json({ likes, dislikes, count_like: r.count_like || 0, count_dislike: r.count_dislike || 0 });
  } catch (e) { console.error('getPhotoReactions error', e); return res.status(500).json({ error: e.message || 'Error interno' }); }
}

// GET /api/photos/reactions/check -> comprobar si la tabla photo_reactions existe y es accesible
export async function checkReactionsTable(req, res) {
  try {
    const { data, error } = await supabase.from('photo_reactions').select('id').limit(1);
    if (error) {
      const msg = String(error.message || error);
      return res.status(500).json({ ok: false, error: msg });
    }
    return res.json({ ok: true, rows: (data || []).length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: String(e && (e.message || e)) });
  }
}

// ⬆️ Subir foto
export async function addPhoto(req, res) {
  try {
    const { title, description, date_taken, category, scope } = req.body;
    const files = req.files || (req.file ? [req.file] : []);

    if (!files || files.length === 0) return res.status(400).json({ error: 'Archivo(s) requerido(s)' });

    // Validar longitud de descripción (<= 100 chars)
    if (description && String(description).length > 100) {
      return res.status(400).json({ error: 'La descripción no puede superar 100 caracteres.' });
    }

    const results = [];

    // Determinar usuario autenticado (si existe) antes del loop, pero NO asociar user_id por defecto
    const token = req.cookies?.session_token || null;
    const secret = process.env.SESSION_SECRET || 'change_this_in_production';
    let authUserId = null;
    try { if (token) { const p = jwt.verify(token, secret); if (p && p.userId) authUserId = p.userId; } } catch (e) { /* ignore invalid token */ }

    for (const file of files) {
      // Validar tipo de archivo: permitir imágenes y videos
      if (!file.mimetype || (!file.mimetype.startsWith('image/') && !file.mimetype.startsWith('video/'))) {
        return res.status(400).json({ error: 'Tipo de archivo no permitido. Usa imágenes o videos.' });
      }

      // Generar nombre único para cada archivo
      const id = crypto.randomUUID();
      const ext = (file.originalname || '').split('.').pop();
      const path = `${id}.${ext}`;

      // Subir archivo al bucket
      const uploadResult = await uploadFile(path, file.buffer, file.mimetype);
      console.log('uploadResult:', uploadResult);
      if (uploadResult.error) {
        console.error('Error subiendo archivo:', uploadResult.error);
        return res.status(500).json({ error: uploadResult.error.message || 'Upload error' });
      }

      // Obtener URL pública
      const url = getPublicUrl(path);

        // Payload para la fila en la tabla
        const payload = {
          title,
          description,
          date_taken,
          // Si el archivo es un video, forzamos la categoría VIDEO para que sólo se muestre en esa sección
          category: file.mimetype && file.mimetype.startsWith('video/') ? 'VIDEO' : (category || 'GALERIA'),
          url,
          is_public: true
        };
        // Asociar `user_id` si el usuario está autenticado.
        // Antes asociábamos solo cuando scope === 'profile', eso hacía que las subidas desde el index
        // no tuvieran `user_id` y por tanto no mostraran el uploader en la galería. Ahora siempre
        // preservamos la relación con el usuario autenticado (seguimos marcando `is_public=false`
        // cuando la subida es de perfil).
        try {
          if (authUserId) {
            payload.user_id = authUserId;
            if (scope === 'profile') payload.is_public = false;
          }
        } catch (e) { /* ignore */ }
      console.log('DB payload:', payload);

      // Insertar registro
      const createResult = await createPhoto(payload);
      console.log('createResult:', createResult);
      if (createResult.error) {
        console.error('Error creando registro en DB:', createResult.error);
        return res.status(500).json({ error: createResult.error.message || 'DB insert error' });
      }
      // push raw created row (normalize shape)
      results.push(createResult.data || createResult);
    }

    // Enriquecer los resultados con información del uploader (avatar y nombre) cuando exista user_id.
    // Además, si la subida vino desde index y el usuario estaba autenticado, adjuntar temporalmente `uploader`
    try {
      const userIds = Array.from(new Set((results || []).filter(r => r && r.user_id).map(r => r.user_id)));
      let usersMap = {};
      if (userIds.length) {
        const { data: users, error: usersError } = await supabase.from('usuarios').select('id,full_name,avatar_url').in('id', userIds);
        if (!usersError && users) usersMap = (users || []).reduce((acc, u) => { acc[String(u.id)] = u; return acc; }, {});
      }

      // If authUserId present, fetch that user's public info once (to attach to index uploads responses)
      let authUser = null;
      if (authUserId) {
        try {
          const { data: au, error: auErr } = await supabase.from('usuarios').select('id,full_name,avatar_url').eq('id', authUserId).limit(1).maybeSingle();
          if (!auErr && au) authUser = au;
        } catch (e) { /* ignore */ }
      }

      const enhanced = (results || []).map(r => {
        try {
          const uploader = r && r.user_id ? usersMap[String(r.user_id)] || null : (authUser && !r.user_id ? authUser : null);
          return { ...(r || {}), uploader };
        } catch (e) { return r; }
      });
      return res.status(201).json(enhanced);
    } catch (e) {
      return res.status(201).json(results);
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ✏️ Editar foto
export async function editPhoto(req, res) {
  try {
    const { id } = req.params;
    const { title, description, date_taken, category } = req.body;

    const { data, error } = await updatePhoto(id, {
      title,
      description,
      date_taken,
      category
    });

    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// 🗑️ Eliminar foto
export async function removePhoto(req, res) {
  try {
    const { id } = req.params;

    // Primero elimina el registro en la tabla
    const { error } = await deletePhoto(id);
    if (error) return res.status(500).json({ error: error.message });

    // Opcional: si guardas el path del archivo, aquí puedes llamar a removeFile(path)
    // await removeFile(path);

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
