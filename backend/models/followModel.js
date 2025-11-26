import { supabase } from '../config/supabase.js';

export async function followUser(followerId, followingId) {
  if (!followerId || !followingId) return { error: 'Missing ids' };
  if (Number(followerId) === Number(followingId)) return { error: 'Cannot follow yourself' };
  // evitar duplicados: si ya sigue, devolvemos ok
  const existing = await supabase.from('followers').select('*').match({ follower_id: followerId, following_id: followingId }).limit(1).maybeSingle();
  if (existing.error) return { error: existing.error };
  if (existing.data) return { data: existing.data, already: true };
  return supabase.from('followers').insert({ follower_id: followerId, following_id: followingId }).select().single();
}

export async function unfollowUser(followerId, followingId) {
  if (!followerId || !followingId) return { error: 'Missing ids' };
  // devolver ok si no existía
  const { data, error } = await supabase.from('followers').delete().match({ follower_id: followerId, following_id: followingId });
  if (error) return { error };
  return { data };
}

export async function isFollowing(followerId, followingId) {
  if (!followerId || !followingId) return { data: false };
  const { data, error } = await supabase.from('followers').select('*').match({ follower_id: followerId, following_id: followingId }).limit(1).maybeSingle();
  if (error) return { error };
  return { data: !!data };
}

export async function getFollowers(userId, opts={limit:100}) {
  const limit = opts.limit || 100;
  // obtener lista de follower_ids y después consultar usuarios
  const { data: rows, error: e1 } = await supabase
    .from('followers')
    .select('follower_id, created_at')
    .eq('following_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (e1) return { error: e1 };
  const ids = (rows || []).map(r => r.follower_id).filter(Boolean);
  if (!ids.length) return { data: [] };
  const { data: users, error: e2 } = await supabase.from('usuarios').select('id,full_name,email,avatar_url,profile_description').in('id', ids).limit(limit);
  if (e2) return { error: e2 };
  // mantener orden aproximado por created_at de followers
  const idToUser = (users || []).reduce((acc, u) => { acc[u.id] = u; return acc; }, {});
  const out = rows.map(r => ({ created_at: r.created_at, user: idToUser[r.follower_id] || { id: r.follower_id } }));
  return { data: out };
}

export async function getFollowing(userId, opts={limit:100}) {
  const limit = opts.limit || 100;
  const { data: rows, error: e1 } = await supabase
    .from('followers')
    .select('following_id, created_at')
    .eq('follower_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (e1) return { error: e1 };
  const ids = (rows || []).map(r => r.following_id).filter(Boolean);
  if (!ids.length) return { data: [] };
  const { data: users, error: e2 } = await supabase.from('usuarios').select('id,full_name,email,avatar_url,profile_description').in('id', ids).limit(limit);
  if (e2) return { error: e2 };
  const idToUser = (users || []).reduce((acc, u) => { acc[u.id] = u; return acc; }, {});
  const out = rows.map(r => ({ created_at: r.created_at, user: idToUser[r.following_id] || { id: r.following_id } }));
  return { data: out };
}

export async function countFollowers(userId) {
  const { count, error } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('following_id', userId);
  if (error) return { error };
  return { count };
}

export async function countFollowing(userId) {
  const { count, error } = await supabase.from('followers').select('*', { count: 'exact', head: true }).eq('follower_id', userId);
  if (error) return { error };
  return { count };
}
