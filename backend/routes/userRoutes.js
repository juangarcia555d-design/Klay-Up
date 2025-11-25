import express from 'express';

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

  return router;
}
