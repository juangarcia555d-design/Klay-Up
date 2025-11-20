import { supabase } from '../config/supabase.js';

const BUCKET = 'photos';

export async function getPhotos(category) {
  let query = supabase.from('photos').select('*').order('created_at', { ascending: false });
  if (category) query = query.eq('category', category);
  return query;
}

export async function createPhoto({ id, title, description, date_taken, category, image_url }) {
  return supabase.from('photos').insert({ id, title, description, date_taken, category, image_url }).select().single();
}

export async function updatePhoto(id, data) {
  return supabase.from('photos').update(data).eq('id', id).select().single();
}

export async function deletePhoto(id) {
  return supabase.from('photos').delete().eq('id', id);
}

export async function uploadFile(path, buffer, mimetype) {
  return supabase.storage.from(BUCKET).upload(path, buffer, { contentType: mimetype });
}

export function getPublicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function removeFile(path) {
  return supabase.storage.from(BUCKET).remove([path]);
}
