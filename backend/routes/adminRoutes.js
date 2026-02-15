import express from 'express';
import jwt from 'jsonwebtoken';

export default function(supabase) {
  const router = express.Router();

  // Helper: require admin secret header for these endpoints
  function requireAdminSecret(req, res) {
    const adminSecret = process.env.ADMIN_SECRET || null;
    if (!adminSecret) return false; // if not configured, deny
    const h = req.headers['x-admin-secret'] || req.query.admin_secret;
    if (String(h) !== String(adminSecret)) return false;
    return true;
  }

  // POST /api/admin/verify-emails  -> body: { emails: ['a@b.com'], role: 'ADMIN'|'ARTIST' }
  router.post('/verify-emails', async (req, res) => {
    try {
      if (!requireAdminSecret(req, res)) return res.status(403).json({ error: 'Forbidden' });
      const { emails, role } = req.body || {};
      if (!Array.isArray(emails) || emails.length === 0) return res.status(400).json({ error: 'emails required' });
      const r = await supabase.from('usuarios').update({ verified_role: role ? String(role).toUpperCase() : null }).in('email', emails).select('id,email,full_name,verified_role');
      if (r.error) return res.status(500).json({ error: r.error.message || r.error });
      return res.json({ ok: true, updated: r.data || [] });
    } catch (e) { console.error('/api/admin/verify-emails', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  // PUT /api/admin/users/:id/verify  -> body: { role: 'ADMIN'|'ARTIST'|null }
  router.put('/users/:id/verify', async (req, res) => {
    try {
      if (!requireAdminSecret(req, res)) return res.status(403).json({ error: 'Forbidden' });
      const id = Number(req.params.id);
      if (!id) return res.status(400).json({ error: 'Invalid id' });
      const role = req.body && typeof req.body.role !== 'undefined' ? req.body.role : null;
      const r = await supabase.from('usuarios').update({ verified_role: role ? String(role).toUpperCase() : null }).eq('id', id).select('id,email,full_name,verified_role').maybeSingle();
      if (r.error) return res.status(500).json({ error: r.error.message || r.error });
      return res.json({ ok: true, user: r.data || null });
    } catch (e) { console.error('/api/admin/users/:id/verify', e); return res.status(500).json({ error: 'Error interno' }); }
  });

  return router;
}
