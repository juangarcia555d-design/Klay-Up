import express from 'express';
import jwt from 'jsonwebtoken';
import {
  followUser,
  unfollowUser,
  isFollowing,
  getFollowers,
  getFollowing,
  countFollowers,
  countFollowing
} from '../models/followModel.js';

export default function(supabase) {
  const router = express.Router();

  // GET /api/users?q=term
  router.get('/', async (req, res) => {
    try {
      const q = (req.query.q || '').trim();
      if (!q) return res.json([]);
      const pattern = `%${q}%`;
      const { data, error } = await supabase.from('usuarios')
        .select('id,full_name,email,avatar_url,profile_description')
        .or(`full_name.ilike.${pattern},email.ilike.${pattern}`)
        .limit(30);
      if (error) return res.status(500).json({ error: error.message || error });
      return res.json(data || []);
    } catch (e) {
      console.error('/api/users error', e);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // helper: obtener id del usuario autenticado desde cookie
  function getCurrentUserId(req) {
    const token = req.cookies?.session_token || null;
    if (!token) return null;
    try {
      const secret = process.env.SESSION_SECRET || 'change_this_in_production';
      const payload = jwt.verify(token, secret);
      return payload?.userId || null;
    } catch (e) {
      return null;
    }
  }

  // POST /api/users/:id/follow
  router.post('/:id/follow', async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!targetId) return res.status(400).json({ error: 'Invalid id' });
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      if (Number(me) === Number(targetId)) return res.status(400).json({ error: 'Cannot follow yourself' });

      const { error } = await followUser(me, targetId);
      if (error) return res.status(500).json({ error: error.message || error });

      const followers = await countFollowers(targetId);
      const following = await countFollowing(targetId);
      return res.json({ ok: true, followerCount: followers.count || 0, followingCount: following.count || 0 });
    } catch (e) {
      console.error('follow error', e);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // POST /api/users/:id/unfollow
  router.post('/:id/unfollow', async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      const me = getCurrentUserId(req);
      if (!me) return res.status(401).json({ error: 'Not authenticated' });
      const { error } = await unfollowUser(me, targetId);
      if (error) return res.status(500).json({ error: error.message || error });
      const followers = await countFollowers(targetId);
      const following = await countFollowing(targetId);
      return res.json({ ok: true, followerCount: followers.count || 0, followingCount: following.count || 0 });
    } catch (e) {
      console.error('unfollow error', e);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // GET /api/users/:id/followers
  router.get('/:id/followers', async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!targetId) return res.status(400).json({ error: 'Invalid id' });
      const { data, error } = await getFollowers(targetId, { limit: 500 });
      if (error) return res.status(500).json({ error: error.message || error });
      // getFollowers ahora devuelve objetos { created_at, user }
      const list = (data || []).map(r => r.user || { id: r.follower_id });
      return res.json({ data: list, count: (await countFollowers(targetId)).count || 0 });
    } catch (e) {
      console.error('get followers', e);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // GET /api/users/:id/info -> devolver campos públicos de usuario
  router.get('/:id/info', async (req, res) => {
    try {
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const { data, error } = await supabase.from('usuarios').select('id,full_name,email,avatar_url,profile_description').eq('id', id).limit(1).maybeSingle();
      if (error) return res.status(500).json({ error: error.message || error });
      if (!data) return res.status(404).json({ error: 'Usuario no encontrado' });
      return res.json({ data });
    } catch (e) {
      console.error('/api/users/:id/info error', e);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // GET /api/users/:id/following
  router.get('/:id/following', async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!targetId) return res.status(400).json({ error: 'Invalid id' });
      const { data, error } = await getFollowing(targetId, { limit: 500 });
      if (error) return res.status(500).json({ error: error.message || error });
      const list = (data || []).map(r => r.user || { id: r.following_id });
      return res.json({ data: list, count: (await countFollowing(targetId)).count || 0 });
    } catch (e) {
      console.error('get following', e);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  // GET /api/users/:id/relationship -> info sobre si el current user sigue a :id
  router.get('/:id/relationship', async (req, res) => {
    try {
      const targetId = Number(req.params.id);
      if (!targetId) return res.status(400).json({ error: 'Invalid id' });
      const me = getCurrentUserId(req);
      const followInfo = me ? await isFollowing(me, targetId) : { data: false };
      const fcount = await countFollowers(targetId);
      const tcount = await countFollowing(targetId);
      return res.json({ isFollowing: !!followInfo.data, followerCount: fcount.count || 0, followingCount: tcount.count || 0, isOwner: !!(me && Number(me) === Number(targetId)) });
    } catch (e) {
      console.error('relationship error', e);
      return res.status(500).json({ error: 'Error interno' });
    }
  });

  return router;
}

