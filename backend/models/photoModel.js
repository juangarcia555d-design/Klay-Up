import { supabase } from '../config/supabase.js';

const BUCKET = 'photos';

export async function getPhotos(category) {
  let query = supabase
    .from('photos')
    .select('id, title, description, date_taken, category, url, user_id') // 👈 selecciona url
    .order('created_at', { ascending: false });
  if (category) query = query.eq('category', category);
  return query;
}

export async function getPhotosByUser(userId, { includePrivate = false } = {}) {
  let q = supabase
    .from('photos')
    .select('id, title, description, date_taken, category, url, is_public')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (!includePrivate) q = q.eq('is_public', true);
  return q;
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

// Reacciones: like / dislike
export async function addReaction(photoId, userId, reaction) {
  // reaction: 'like'|'dislike'
  // Intentar upsert: si existe, actualizar; si no, insertar
  const payload = { photo_id: photoId, user_id: userId, reaction };
  try {
    return await supabase.from('photo_reactions').upsert(payload, { onConflict: 'photo_id,user_id' }).select().single();
  } catch (e) {
    const msg = String(e && (e.message || e));
    if (/does not exist|relation \".*photo_reactions\" does not exist|undefined_table/i.test(msg)) {
      return { error: { message: 'Tabla photo_reactions no encontrada en la base de datos. Ejecuta la migración en Supabase.' } };
    }
    return { error: e };
  }
}

export async function removeReaction(photoId, userId) {
  return supabase.from('photo_reactions').delete().eq('photo_id', photoId).eq('user_id', userId);
}

export async function getReactions(photoId) {
  // devolver listas de usuarios para like y dislike, más conteos
  try {
    const { data, error } = await supabase.from('photo_reactions').select('user_id,reaction,created_at').eq('photo_id', photoId);
    if (error) {
      // Si la tabla no existe, devolver valores vacíos (evita romper la UI)
      const msg = String(error.message || '');
      if (/does not exist|relation \".*photo_reactions\" does not exist|undefined_table/i.test(msg)) {
        return { likes: [], dislikes: [], count_like: 0, count_dislike: 0 };
      }
      return { error };
    }
    const likes = (data || []).filter(r => r.reaction === 'like').map(r => r.user_id);
    const dislikes = (data || []).filter(r => r.reaction === 'dislike').map(r => r.user_id);
    return { likes, dislikes, count_like: likes.length, count_dislike: dislikes.length };
  } catch (e) {
    const msg = String(e && (e.message || e));
    if (/does not exist|relation \".*photo_reactions\" does not exist|undefined_table/i.test(msg)) {
      return { likes: [], dislikes: [], count_like: 0, count_dislike: 0 };
    }
    return { error: e };
  }
}

export async function getUserReaction(photoId, userId) {
  return supabase.from('photo_reactions').select('reaction').eq('photo_id', photoId).eq('user_id', userId).limit(1).maybeSingle();
}
