import { supabase } from '../config/supabase.js';

export async function createInviteGroup(inviterId, title, inviteeIds = []) {
  if (!inviterId) return { error: 'Missing inviter' };
  const { data, error } = await supabase.from('chat_invite_groups').insert({ inviter_id: inviterId, title }).select().single();
  if (error) return { error };
  const groupId = data.id;
  // insert invitations
  const rows = (inviteeIds || []).map(i => ({ group_id: groupId, invitee_id: i }));
  if (rows.length) await supabase.from('chat_invitations').insert(rows);
  return { data };
}

export async function listInvitationsForUser(userId) {
  if (!userId) return { data: [] };
  const { data, error } = await supabase.from('chat_invitations').select('id,group_id,invitee_id,status,responded_at, chat_invite_groups!inner(inviter_id,title,created_at)').eq('invitee_id', userId).order('id', { ascending: false });
  if (error) return { error };
  return { data };
}

export async function respondInvitation(invitationId, accept) {
  if (!invitationId) return { error: 'Missing id' };
  const status = accept ? 'accepted' : 'rejected';
  const { data, error } = await supabase.from('chat_invitations').update({ status, responded_at: new Date().toISOString() }).eq('id', invitationId).select().single();
  if (error) return { error };
  // if accepted, create chat if none exists for this group yet
  if (accept) {
    // check if a chat was already created for this group by seeing participants with chat_id via group mapping (simple heuristic)
    // We'll create a new chat and add inviter + all accepted invitees as participants
    const groupId = data.group_id;
    // get group info and accepted invitees
    const { data: group } = await supabase.from('chat_invite_groups').select('*').eq('id', groupId).limit(1).maybeSingle();
    const { data: acceptedRows } = await supabase.from('chat_invitations').select('invitee_id').eq('group_id', groupId).eq('status', 'accepted');
    const inviteeIds = (acceptedRows || []).map(r => r.invitee_id).filter(Boolean);
    // create chat
    const title = group && group.title ? group.title : 'Chat grupal';
    const { data: chat } = await supabase.from('chats').insert({ title, owner_id: group.inviter_id, is_group: true }).select().single();
    if (chat && chat.id) {
      const participantRows = [{ chat_id: chat.id, user_id: group.inviter_id }].concat((inviteeIds || []).map(id => ({ chat_id: chat.id, user_id: id })));
      await supabase.from('chat_participants').insert(participantRows, { ignoreDuplicates: true }).select();
      return { data: { chat_id: chat.id, participants: participantRows } };
    }
  }
  return { data };
}

export async function getChatsForUser(userId) {
  if (!userId) return { data: [] };
  const { data, error } = await supabase.from('chat_participants').select('chat_id').eq('user_id', userId);
  if (error) return { error };
  const chatIds = (data || []).map(r => r.chat_id).filter(Boolean);
  if (!chatIds.length) return { data: [] };
  const { data: chats, error: cerr } = await supabase.from('chats').select('*').in('id', chatIds).limit(200);
  if (cerr) return { error: cerr };
  return { data: chats };
}

export async function getMessagesForChat(chatId, opts = { limit: 200 }) {
  const { data, error } = await supabase.from('chat_messages').select('*').eq('chat_id', chatId).order('created_at', { ascending: true }).limit(opts.limit || 200);
  if (error) return { error };
  return { data };
}

export async function postMessageToChat(chatId, senderId, content) {
  if (!chatId || !senderId || !content) return { error: 'Missing params' };
  return supabase.from('chat_messages').insert({ chat_id: chatId, sender_id: senderId, content }).select().single();
}
