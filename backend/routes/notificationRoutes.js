import express from 'express';
import jwt from 'jsonwebtoken';
import { supabase } from '../config/supabase.js';

const router = express.Router();

// GET /api/notifications -> devuelve notificaciones recientes para el usuario autenticado
router.get('/', async (req, res) => {
  try {
    const token = req.cookies?.session_token || null;
    const secret = process.env.SESSION_SECRET || 'change_this_in_production';
    if (!token) return res.status(401).json({ error: 'No autenticado' });
    let payload;
    try { payload = jwt.verify(token, secret); } catch (e) { return res.status(401).json({ error: 'Token inválido' }); }
    const me = payload?.userId;
    if (!me) return res.status(401).json({ error: 'No autenticado' });

    // 1) followers
    const { data: followerRows } = await supabase.from('followers').select('follower_id,created_at').eq('following_id', me).order('created_at',{ascending:false}).limit(50);

    // 2) photos owned by me
    const { data: myPhotos } = await supabase.from('photos').select('id,title,url').eq('user_id', me);
    const myPhotoIds = (myPhotos || []).map(p => p.id).filter(Boolean);

    // 3) likes (photo_reactions)
    let likeRows = [];
    if (myPhotoIds.length) {
      const { data } = await supabase.from('photo_reactions').select('user_id,photo_id,created_at').in('photo_id', myPhotoIds).eq('reaction','like').order('created_at',{ascending:false}).limit(100);
      likeRows = data || [];
    }

    // 4) comments
    let commentRows = [];
    if (myPhotoIds.length) {
      const { data } = await supabase.from('photo_comments').select('id,photo_id,user_id,text,created_at').in('photo_id', myPhotoIds).order('created_at',{ascending:false}).limit(100);
      commentRows = data || [];
    }

    // recolectar actor ids
    const actorIds = new Set();
    (followerRows || []).forEach(r => actorIds.add(r.follower_id));
    (likeRows || []).forEach(r => actorIds.add(r.user_id));
    (commentRows || []).forEach(r => actorIds.add(r.user_id));
    const actorIdsArr = Array.from(actorIds).filter(Boolean);

    let actorsMap = {};
    if (actorIdsArr.length) {
      const { data: users } = await supabase.from('usuarios').select('id,full_name,avatar_url').in('id', actorIdsArr);
      actorsMap = (users || []).reduce((acc,u)=>{ acc[String(u.id)] = u; return acc; }, {});
    }

    const photosMap = (myPhotos || []).reduce((acc,p)=>{ acc[String(p.id)] = p; return acc; }, {});

    // construir notificaciones uniformes
    const notifications = [];
    (followerRows || []).forEach(r => {
      notifications.push({ type: 'follow', actor_id: r.follower_id, actor: actorsMap[String(r.follower_id)] || {id: r.follower_id}, created_at: r.created_at, text: null });
    });
    (likeRows || []).forEach(r => {
      notifications.push({ type: 'like', actor_id: r.user_id, actor: actorsMap[String(r.user_id)] || {id: r.user_id}, photo_id: r.photo_id, photo: photosMap[String(r.photo_id)] || null, created_at: r.created_at });
    });
    (commentRows || []).forEach(r => {
      notifications.push({ type: 'comment', actor_id: r.user_id, actor: actorsMap[String(r.user_id)] || {id: r.user_id}, photo_id: r.photo_id, photo: photosMap[String(r.photo_id)] || null, text: r.text, created_at: r.created_at });
    });

    // ordenar por created_at desc
    notifications.sort((a,b)=>{ const ta = new Date(a.created_at).getTime(); const tb = new Date(b.created_at).getTime(); return tb - ta; });

    return res.json({ data: notifications.slice(0,100) });
  } catch (e) {
    console.error('notifications error', e);
    return res.status(500).json({ error: String(e && (e.message || e)) });
  }
});

export default router;
