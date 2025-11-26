import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import {
  getPhotos,
  createPhoto,
  updatePhoto,
  deletePhoto,
  uploadFile,
  getPublicUrl,
  removeFile
} from '../models/photoModel.js';

// 📸 Listar fotos
export async function listPhotos(req, res) {
  try {
    const { category } = req.query;
    // Si se solicita una categoría concreta, devolverla.
    // Si no se especifica categoría, ocultar videos para que sólo se vean en la pestaña VIDEO.
    if (category) {
      // Sólo devolver fotos públicas cuando es una petición pública de galería
      try {
        const { data, error } = await getPhotos(category).eq('is_public', true);
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
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
        .select('id, title, description, date_taken, category, url')
        .neq('category', 'VIDEO')
        .eq('is_public', true)
        .order('created_at', { ascending: false });
      if (error) return res.status(500).json({ error: error.message });
      return res.json(data);
    } catch (e) {
      // fallback si is_public no existe: asumimos que las fotos con user_id son uploads de perfil y no deben mostrarse
      try {
        const { data, error } = await supabase
          .from('photos')
          .select('id, title, description, date_taken, category, url')
          .neq('category', 'VIDEO')
          .is('user_id', null)
          .order('created_at', { ascending: false });
        if (error) return res.status(500).json({ error: error.message });
        return res.json(data);
      } catch (e2) {
        return res.status(500).json({ error: e2.message || 'Error interno' });
      }
    }
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

// ⬆️ Subir foto
export async function addPhoto(req, res) {
  try {
    const { title, description, date_taken, category } = req.body;
    const files = req.files || (req.file ? [req.file] : []);

    if (!files || files.length === 0) return res.status(400).json({ error: 'Archivo(s) requerido(s)' });

    // Validar longitud de descripción (<= 100 chars)
    if (description && String(description).length > 100) {
      return res.status(400).json({ error: 'La descripción no puede superar 100 caracteres.' });
    }

    const results = [];

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
      console.log('DB payload:', payload);

      // Insertar registro
      const createResult = await createPhoto(payload);
      console.log('createResult:', createResult);
      if (createResult.error) {
        console.error('Error creando registro en DB:', createResult.error);
        return res.status(500).json({ error: createResult.error.message || 'DB insert error' });
      }
      results.push(createResult.data || createResult);
    }

    // Si todo OK, devolver los registros creados
    res.status(201).json(results);
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
