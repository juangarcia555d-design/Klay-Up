import express from 'express';
import jwt from 'jsonwebtoken';
import { createMessage, getInbox, getInboxSummary, getConversation, markMessagesRead } from '../models/messageModel.js';

export default function(supabase, sessionSecret) {
  const router = express.Router();

  function getCurrentUserId(req) {
    const token = req.cookies?.session_token || null;
    if (!token) return null;
    try { const payload = jwt.verify(token, sessionSecret || process.env.SESSION_SECRET || 'change_this_in_production'); return payload?.userId || null; } catch (e) { return null; }
  }

  // POST /api/messages/send
  router.post('/send', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      const { to, content } = req.body || {};
      const toId = Number(to);
      if (!toId || !content) return res.status(400).json({ error: 'Missing params' });
      const { data, error } = await createMessage(me, toId, content);
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json({ ok: true, message: data });
    } catch (e) { console.error('send message error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  // GET /api/messages/inbox
  router.get('/inbox', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      // devolver inbox agrupado por remitente con último mensaje e unread count
      const { data, error } = await getInboxSummary(me, { limit: 500 });
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json({ data });
    } catch (e) { console.error('inbox error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  // GET /api/messages/unread_count
  router.get('/unread_count', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(200).json({ count: 0 });
      const { count, error } = await supabase.from('messages').select('*', { count: 'exact', head: true }).eq('receiver_id', me).eq('read', false);
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json({ count: count || 0 });
    } catch (e) { console.error('unread_count error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  // GET /api/messages/conversation/:id (mensajes entre current user y :id)
  router.get('/conversation/:id', async (req, res) => {
    try {
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      const other = Number(req.params.id);
      if (!other) return res.status(400).json({ error: 'Invalid id' });
      console.debug(`[messages] conversation request: me=${me} other=${other}`);
      const start = Date.now();
      const { data, error } = await getConversation(me, other, { limit: 1000 });
      console.debug(`[messages] conversation result: me=${me} other=${other} rows=${(data||[]).length} duration=${Date.now()-start}ms`);
      if (error) return res.status(500).json({ error: error.message || error });
      // marcar mensajes recibidos como leídos
      await markMessagesRead(me, other);
      return res.json({ data });
    } catch (e) { console.error('conversation error', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  return router;
}
