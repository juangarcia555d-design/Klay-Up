import crypto from 'crypto';
import { getPhotos, createPhoto, updatePhoto, deletePhoto, uploadFile, getPublicUrl, removeFile } from '../models/photoModel.js';

export async function listPhotos(req, res) {
  const { category } = req.query;
  const { data, error } = await getPhotos(category);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}

export async function addPhoto(req, res) {
  try {
    const { title, description, date_taken, category } = req.body;
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Archivo requerido' });

    const id = crypto.randomUUID();
    const ext = file.originalname.split('.').pop();
    const path = `${id}.${ext}`;

    const { error: uploadError } = await uploadFile(path, file.buffer, file.mimetype);
    if (uploadError) return res.status(500).json({ error: uploadError.message });

    const image_url = getPublicUrl(path);

    const { data, error } = await createPhoto({ id, title, description, date_taken, category, image_url });
    if (error) return res.status(500).json({ error: error.message });
    res.status(201).json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}

export async function editPhoto(req, res) {
  const { id } = req.params;
  const { title, description, date_taken, category } = req.body;
  const { data, error } = await updatePhoto(id, { title, description, date_taken, category });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
}

export async function removePhoto(req, res) {
  const { id } = req.params;
  // primero obtener la URL para borrar archivo
  // (puedes mover esta lógica al modelo si prefieres)
  // ...
  const { error } = await deletePhoto(id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
}
