import express from 'express';
import jwt from 'jsonwebtoken';
import { createInviteGroup, listInvitationsForUser, respondInvitation, getChatsForUser, getMessagesForChat, postMessageToChat } from '../models/chatModel.js';

export default function(supabase, sessionSecret) {
  const router = express.Router();

  function getCurrentUserId(req) {
    const token = req.cookies?.session_token || null;
    if (!token) return null;
    try { const payload = jwt.verify(token, sessionSecret || process.env.SESSION_SECRET || 'change_this_in_production'); return payload?.userId || null; } catch (e) { return null; }
  }

  // POST /api/chats/invite -> { title, invitees: [ids] }
  router.post('/invite', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      const { title, invitees } = req.body || {};
      if (!Array.isArray(invitees) || invitees.length === 0) return res.status(400).json({ error: 'No invitees' });
      const ids = invitees.map(i => Number(i)).filter(Boolean).filter(i => i !== Number(me));
      const { data, error } = await createInviteGroup(me, title || 'Chat grupal', ids);
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json({ ok: true, group: data });
    } catch (e) { console.error('invite error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  // GET /api/chats/invitations -> list pending invitations for current user
  router.get('/invitations', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      const { data, error } = await listInvitationsForUser(me);
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json({ data });
    } catch (e) { console.error('invitations list error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  // POST /api/chats/invitations/:id/respond -> { accept: true|false }
  router.post('/invitations/:id/respond', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      const id = Number(req.params.id);
      const { accept } = req.body || {};
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const { data, error } = await respondInvitation(id, !!accept);
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json({ ok: true, result: data });
    } catch (e) { console.error('respond invitation error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  // GET /api/chats -> list chats for user
  router.get('/', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      const { data, error } = await getChatsForUser(me);
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json({ data });
    } catch (e) { console.error('get chats error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  // Messages within a chat
  router.get('/:id/messages', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      const chatId = Number(req.params.id);
      if (!chatId) return res.status(400).json({ error: 'Invalid chat id' });
      const { data, error } = await getMessagesForChat(chatId);
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json({ data });
    } catch (e) { console.error('get chat messages error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  router.post('/:id/messages', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      const chatId = Number(req.params.id);
      const { content } = req.body || {};
      if (!chatId || !content) return res.status(400).json({ error: 'Missing params' });
      const { data, error } = await postMessageToChat(chatId, me, content);
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json({ ok: true, message: data });
    } catch (e) { console.error('post chat message error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  return router;
}
