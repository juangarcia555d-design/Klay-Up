import { supabase } from '../config/supabase.js';

const BUCKET = 'photos';

export async function getPhotos(category) {
  let query = supabase
    .from('photos')
    .select('id, title, description, date_taken, category, url') // 👈 selecciona url
    .order('created_at', { ascending: false });
  if (category) query = query.eq('category', category);
  return query;
}

export async function createPhoto(data) {
  // No forzamos `id` aquí: dejamos que la base de datos asigne su PK (bigint)
  // `data` debe contener title, description, date_taken, category, url
  return supabase
    .from('photos')
    .insert(data)
    .select()
    .single();
}

export async function updatePhoto(id, data) {
  return supabase.from('photos').update(data).eq('id', id).select().single();
}

export async function deletePhoto(id) {
  return supabase.from('photos').delete().eq('id', id);
}

export async function uploadFile(path, buffer, mimetype) {
  // Usar upsert=true para sobreescribir si el archivo ya existe
  return supabase.storage.from(BUCKET).upload(path, buffer, { contentType: mimetype, upsert: true });
}

export function getPublicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function removeFile(path) {
  return supabase.storage.from(BUCKET).remove([path]);
}
