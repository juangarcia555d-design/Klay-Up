import { supabase } from '../config/supabase.js';

export async function createMessage(senderId, receiverId, content) {
  if (!senderId || !receiverId || !content) return { error: 'Missing params' };
  return supabase.from('messages').insert({ sender_id: senderId, receiver_id: receiverId, content }).select().single();
}

export async function getInbox(userId, opts = { limit: 100 }) {
  const { limit } = opts;
  // devolver las últimas N conversaciones (por sender) y los mensajes recibidos
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, content, "read", created_at')
    .eq('receiver_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { data, error };
}

export async function getInboxSummary(userId, opts = { limit: 200 }) {
  const limit = opts.limit || 200;
  try {
    // obtener mensajes recibidos ordenados por fecha descendente
    const { data: rows, error } = await supabase.from('messages').select('id,sender_id,receiver_id,content,"read",created_at').eq('receiver_id', userId).order('created_at', { ascending: false }).limit(limit);
    if (error) {
      const msg = String(error.message || error || '').toLowerCase();
      if (msg.includes('does not exist') || msg.includes('relation')) return { data: [] };
      return { error };
    }
    const grouped = {};
    const unreadCounts = {};
    (rows || []).forEach(r => {
      const sid = r.sender_id;
      if (!sid) return;
      // primero encuentro -> último mensaje (más reciente) por sender
      if (!grouped[sid]) grouped[sid] = r;
      if (!unreadCounts[sid]) unreadCounts[sid] = 0;
      if (!r.read) unreadCounts[sid] += 1;
    });
    const senderIds = Object.keys(grouped).map(k => Number(k));
    if (!senderIds.length) return { data: [] };
    // traer información de usuarios en batch
    const { data: users, error: uerr } = await supabase.from('usuarios').select('id,full_name,email,avatar_url,profile_description').in('id', senderIds).limit(limit);
    if (uerr) return { error: uerr };
    const idToUser = (users || []).reduce((acc, u) => { acc[u.id] = u; return acc; }, {});
    const out = senderIds.map(sid => {
      const last = grouped[sid];
      return {
        sender_id: sid,
        user: idToUser[sid] || { id: sid },
        unread: unreadCounts[sid] || 0,
        last_message: { id: last.id, content: last.content, created_at: last.created_at }
      };
    });
    return { data: out };
  } catch (e) {
    return { error: e };
  }
}

export async function getConversation(userIdA, userIdB, opts = { limit: 200 }) {
  const { limit } = opts;
  // mensajes entre dos usuarios ordenados asc
  const { data, error } = await supabase
    .from('messages')
    .select('id, sender_id, receiver_id, content, "read", created_at')
    .or(`and(sender_id.eq.${userIdA},receiver_id.eq.${userIdB}),and(sender_id.eq.${userIdB},receiver_id.eq.${userIdA}))`)
    .order('created_at', { ascending: true })
    .limit(limit);
  return { data, error };
}

export async function markMessagesRead(ownerId, fromUserId) {
  const { data, error } = await supabase
    .from('messages')
    .update({ read: true })
    .match({ receiver_id: ownerId, sender_id: fromUserId });
  return { data, error };
}
