// Modelo para categorías personalizadas
import supabase from '../config/supabase.js';

export async function getCategories(userId) {
  const { data, error } = await supabase
    .from('categories')
    .select('id, name, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function createCategory(userId, name) {
  const { data, error } = await supabase
    .from('categories')
    .insert([{ user_id: userId, name }])
    .select();
  if (error) throw error;
  return data && data[0];
}

export async function deleteCategory(userId, name) {
  const { error } = await supabase
    .from('categories')
    .delete()
    .eq('user_id', userId)
    .eq('name', name);
  if (error) throw error;
  return true;
}
