import crypto from 'crypto';
import {
  getMusic,
  createMusic,
  deleteMusic,
  uploadFile,
  getPublicUrl,
  removeFile
} from '../models/musicModel.js';

export async function listMusic(req, res) {
  try {
    const { data, error } = await getMusic();
    if (error) {
      const msg = String(error.message || error);
      if (msg.includes('Could not find the table') || msg.includes('does not exist')) {
        return res.status(500).json({ error: 'La tabla `music` no existe. Ejecuta la migración SQL en `backend/migrations/create_music_table.sql`.' });
      }
      return res.status(500).json({ error: msg });
    }
    res.json(data);
  } catch (e) {
    const msg = String(e.message || e);
    if (msg.includes('Could not find the table') || msg.includes('does not exist')) {
      return res.status(500).json({ error: 'La tabla `music` no existe. Ejecuta la migración SQL en `backend/migrations/create_music_table.sql`.' });
    }
    res.status(500).json({ error: msg });
  }
}

export async function addMusic(req, res) {
  try {
    const { title, artist } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Archivo requerido' });

    const id = crypto.randomUUID();
    const ext = file.originalname.split('.').pop();
    const path = `${id}.${ext}`;

    const uploadResult = await uploadFile(path, file.buffer, file.mimetype);
    if (uploadResult.error) {
      console.error('Error subiendo audio:', uploadResult.error);
      return res.status(500).json({ error: uploadResult.error.message || 'Upload error' });
    }

    const url = getPublicUrl(path);
    const payload = { title, artist, url };

    const createResult = await createMusic(payload);
    if (createResult.error) {
      const msg = String(createResult.error.message || createResult.error);
      if (msg.includes('Could not find the table') || msg.includes('does not exist')) {
        return res.status(500).json({ error: 'La tabla `music` no existe. Ejecuta la migración SQL en `backend/migrations/create_music_table.sql`.' });
      }
      return res.status(500).json({ error: msg });
    }

    res.status(201).json(createResult.data || createResult);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function removeMusic(req, res) {
  try {
    const { id } = req.params;
    // Obtener registro para conocer la url (si se quiere eliminar archivo)
    // Aquí asumimos que la tabla tiene campo 'url'
    const { data: rows, error: qErr } = await getMusic();
    if (qErr) return res.status(500).json({ error: qErr.message });
    const item = rows.find(r => String(r.id) === String(id));
    // eliminar DB
    const { error } = await deleteMusic(id);
    if (error) return res.status(500).json({ error: error.message });
    // eliminar archivo si lo encontramos
    if (item && item.url) {
      try {
        // url forma https://.../bucket/path -> extraer path
        const u = new URL(item.url);
        const pathname = u.pathname; // /object/... may vary per supabase
        const pathParts = pathname.split('/');
        const filePath = pathParts.slice(2).join('/');
        await removeFile(filePath);
      } catch (e) {
        console.warn('No se pudo eliminar archivo de storage (ignorado):', e.message || e);
      }
    }
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
