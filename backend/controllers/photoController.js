import crypto from 'crypto';
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
    const { data, error } = await getPhotos(category);
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
    const file = req.file;
    if (!file) return res.status(400).json({ error: 'Archivo requerido' });

    // Generar nombre único
    const id = crypto.randomUUID();
    const ext = file.originalname.split('.').pop();
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

    // Preparar payload para la tabla: NO incluimos `id` (la tabla usa bigint PK)
    const payload = {
      title,
      description,
      date_taken,
      category,
      url
    };
    console.log('DB payload:', payload);

    // Guardar registro en la tabla
    const createResult = await createPhoto(payload);
    console.log('createResult:', createResult);

    if (createResult.error) {
      console.error('Error creando registro en DB:', createResult.error);
      return res.status(500).json({ error: createResult.error.message || 'DB insert error' });
    }
    res.status(201).json(createResult.data || createResult);
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
