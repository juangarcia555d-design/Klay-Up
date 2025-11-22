import { supabase } from '../config/supabase.js';

const BUCKET = 'music';

export async function getMusic() {
  return supabase
    .from('music')
    .select('id, title, artist, url')
    .order('created_at', { ascending: false });
}

export async function createMusic(data) {
  return supabase
    .from('music')
    .insert(data)
    .select()
    .single();
}

export async function deleteMusic(id) {
  return supabase.from('music').delete().eq('id', id);
}

export async function uploadFile(path, buffer, mimetype) {
  return supabase.storage.from(BUCKET).upload(path, buffer, { contentType: mimetype, upsert: true });
}

export function getPublicUrl(path) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function removeFile(path) {
  return supabase.storage.from(BUCKET).remove([path]);
}
