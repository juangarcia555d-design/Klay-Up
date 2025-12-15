import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import photoRoutes from './routes/photoRoutes.js';
import musicRoutes from './routes/musicRoutes.js';
import createAuthRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import messageRoutes from './routes/messageRoutes.js';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { supabase } from './config/supabase.js';
import { isFollowing, countFollowers, countFollowing } from './models/followModel.js';
import chatRoutes from './routes/chatRoutes.js';

const app = express();
const PORT = process.env.PORT || 8080;
const SESSION_MAX_DAYS = parseInt(process.env.SESSION_MAX_DAYS || '30', 10);

// Configurar __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Servir archivos estáticos (CSS, JS, imágenes)
app.use(express.static(path.join(__dirname, '../frontend')));

// Middleware
app.use(express.json());
app.use(cookieParser());
// Habilitar CORS permitiendo credenciales; si ALLOWED_ORIGIN está definido lo usamos, si no reflejamos el origen
const corsOrigin = process.env.ALLOWED_ORIGIN || true;
app.use(cors({ origin: corsOrigin, credentials: true }));

// Log simple de todas las peticiones para depuración
app.use((req, res, next) => {
  console.log(new Date().toISOString(), req.method, req.url);
  next();
});

// Configurar motor de vistas EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend'));

// Ruta principal para mostrar index.ejs — protegida por sesión JWT en cookie
const SESSION_SECRET = process.env.SESSION_SECRET || 'change_this_in_production';

// La raíz muestra el login (redirige a /login)
app.get('/', (req, res) => {
  return res.redirect('/login');
});

// Página protegida de la aplicación (index)
app.get('/app', async (req, res) => {
  try {
    const token = req.cookies?.session_token || null;
    if (!token) return res.redirect('/login');
    // verificar y decodificar token
    let userTheme = '#ffffff';
    let decoded;
    try {
      decoded = jwt.verify(token, SESSION_SECRET);
    } catch (e) {
      return res.redirect('/login');
    }
    // intentar obtener tema del usuario (si existe)
    try {
      const userId = decoded?.userId;
      if (userId) {
        const { data, error } = await supabase.from('usuarios').select('theme').eq('id', userId).limit(1).maybeSingle();
        if (error) {
          console.warn('Error consultando theme del usuario:', error && error.message ? error.message : error);
        } else if (data && typeof data.theme !== 'undefined') {
          if (data.theme === 'default' || data.theme === null || String(data.theme).trim() === '') userTheme = '#ffffff';
          else userTheme = data.theme;
        }
      }
    } catch (e) {
      console.warn('No se pudo obtener theme del usuario:', e && e.message ? e.message : e);
    }
    // Inyectar solo las claves públicas (anon) al frontend — nunca expongas la SERVICE_ROLE_KEY
    res.render('index', {
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
      userTheme: userTheme || 'default'
    });
  } catch (err) {
    console.error('Error en /app handler:', err);
    return res.redirect('/login');
  }
});

// Página de perfil completo (protegida)
app.get('/profile', async (req, res) => {
  try {
    const token = req.cookies?.session_token || null;
    if (!token) return res.redirect('/login');
    let decoded;
    try { decoded = jwt.verify(token, SESSION_SECRET); } catch (e) { return res.redirect('/login'); }
    const userId = decoded?.userId;
    if (!userId) return res.redirect('/login');
    // obtener usuario
    const { data: userData, error: userErr } = await supabase.from('usuarios').select('id,email,full_name,avatar_url,profile_description,theme').eq('id', userId).limit(1).maybeSingle();
    if (userErr || !userData) return res.redirect('/login');
    // obtener solo fotos de perfil (is_public = false) — evitar que los uploads públicos de la galería
    // se muestren automáticamente en la página de perfil del usuario.
    let photosData = [];
    try {
      const { data } = await supabase.from('photos').select('id,title,description,date_taken,category,url,is_public').eq('user_id', userId).eq('is_public', false).order('created_at', { ascending: false });
      photosData = data || [];
    } catch (e) {
      // si la columna is_public no existe en la DB, caeremos al comportamiento anterior: mostrar todas
      try {
        const { data } = await supabase.from('photos').select('id,title,description,date_taken,category,url').eq('user_id', userId).order('created_at', { ascending: false });
        photosData = data || [];
      } catch (e2) {
        photosData = [];
      }
    }
    // refrescar cookie
    try { const maxDays = Number.isFinite(SESSION_MAX_DAYS) ? SESSION_MAX_DAYS : 30; const newToken = jwt.sign({ userId: decoded.userId, email: decoded.email }, SESSION_SECRET, { expiresIn: `${maxDays}d` }); res.cookie('session_token', newToken, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: maxDays * 24 * 60 * 60 * 1000, path: '/' }); } catch (e) {}
    // conseguir estadísticas de followers
    const followers = await countFollowers(userId);
    const following = await countFollowing(userId);
    res.render('profile', { SUPABASE_URL: process.env.SUPABASE_URL || '', SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '', user: userData, photos: photosData || [], isOwner: true, followerCount: followers.count || 0, followingCount: following.count || 0, isFollowing: false, viewerAuthenticated: true, currentUserId: userId });
  } catch (e) {
    console.error('/profile error', e);
    return res.redirect('/login');
  }
});

// Ruta pública para ver perfil de otro usuario por id
app.get('/u/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { data: userData, error: userErr } = await supabase.from('usuarios').select('id,email,full_name,avatar_url,profile_description,theme').eq('id', id).limit(1).maybeSingle();
    if (userErr || !userData) return res.status(404).send('Perfil no encontrado');
    // comprobar si el visitante está autenticado y si es el dueño
    const token = req.cookies?.session_token || null;
    let viewerId = null;
    try { if (token) viewerId = jwt.verify(token, SESSION_SECRET)?.userId || null; } catch (e) { viewerId = null; }

    const viewerIsOwner = viewerId && Number(viewerId) === Number(id);

    // Mostrar SOLO fotos de perfil (`is_public = false`) en la vista de usuario.
    // Queremos que las fotos subidas desde la galería pública (index, is_public = true)
    // NO aparezcan en los perfiles — tanto para el propietario como para visitantes.
    let photosData = [];
    try {
      const { data } = await supabase.from('photos').select('id,title,description,date_taken,category,url,is_public').eq('user_id', id).eq('is_public', false).order('created_at', { ascending: false });
      photosData = data || [];
    } catch (e) {
      // Si la columna `is_public` no existe (migraciones antiguas), caemos al comportamiento
      // seguro: mostrar solo por `user_id` (esto puede incluir uploads públicos).
      try {
        const { data } = await supabase.from('photos').select('id,title,description,date_taken,category,url').eq('user_id', id).order('created_at', { ascending: false });
        photosData = data || [];
      } catch (e2) {
        photosData = [];
      }
    }

    // obtener counts y si el viewer sigue al usuario
    const followers = await countFollowers(id);
    const following = await countFollowing(id);
    const rel = viewerId ? await isFollowing(viewerId, id) : { data: false };

    return res.render('profile', { SUPABASE_URL: process.env.SUPABASE_URL || '', SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '', user: userData, photos: photosData || [], isOwner: viewerIsOwner, followerCount: followers.count || 0, followingCount: following.count || 0, isFollowing: !!rel.data, viewerAuthenticated: !!viewerId, currentUserId: viewerId || null });
  } catch (e) {
    console.error('/u/:id error', e);
    return res.status(500).send('Error interno');
  }
});

// Rutas para páginas de autenticación separadas
app.get('/login', (req, res) => {
  res.render('login', {
    SUPABASE_URL: process.env.SUPABASE_URL || '',
    SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || ''
  });
});

app.get('/register', async (req, res) => {
  try {
    // Intentar listar avatares locales desde frontend/imagen/avatares
    let localAvatars = [];
    try {
      const avatarsDir = path.join(__dirname, '../frontend/imagen/avatares');
      const files = await fs.readdir(avatarsDir);
      localAvatars = files.filter(f => /\.(png|jpe?g|gif|webp|svg)$/i.test(f));
    } catch (e) {
      console.warn('No se pudieron leer avatares locales:', e && e.message ? e.message : String(e));
    }

    res.render('register', {
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
      localAvatars
    });
  } catch (err) {
    console.error('Error en /register handler:', err);
    res.render('register', {
      SUPABASE_URL: process.env.SUPABASE_URL || '',
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY || '',
      localAvatars: []
    });
  }
});

// API para listar avatares locales (frontend/imagen/avatares)
app.get('/api/avatars', async (req, res) => {
  try {
    const avatarsDir = path.join(__dirname, '../frontend/imagen/avatares');
    const files = await fs.readdir(avatarsDir).catch(()=>[]);
    const filtered = (files || []).filter(f => /\.(png|jpe?g|gif|webp|svg)$/i.test(f));
    return res.json({ data: filtered });
  } catch (e) { console.warn('api/avatars error', e && e.message); return res.json({ data: [] }); }
});

// Mount auth routes (server-side register/login/logout)
app.use('/auth', createAuthRoutes(supabase, SESSION_SECRET));

// Endpoint de diagnóstico rápido
app.get('/debug', async (req, res) => {
  try {
    // Intentar leer un registro de la tabla usuarios para comprobar existencia
    let result = null;
    try {
      const { data, error } = await supabase.from('usuarios').select('id').limit(1).maybeSingle();
      if (error) result = { ok: false, error: error.message || error };
      else result = { ok: true, found: !!data };
    } catch (e) {
      result = { ok: false, error: (e && e.message) ? e.message : String(e) };
    }
    return res.json({ server: 'ok', supabase: result });
  } catch (err) {
    return res.status(500).json({ server: 'error', error: err && err.message ? err.message : String(err) });
  }
});

// Rutas API
app.use('/api/photos', photoRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/users', userRoutes(supabase));
app.use('/api/messages', messageRoutes(supabase, SESSION_SECRET));
app.use('/api/chats', chatRoutes(supabase, SESSION_SECRET));

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`Servidor en puerto ${PORT}`);

  // Asegurarse de que el bucket 'photos' exista (crearlo si falta)
  (async function ensureBucket() {
    try {
      const bucketName = 'photos';
      const { data: bucketData, error: getErr } = await supabase.storage.getBucket(bucketName);
      if (getErr && getErr.message && getErr.message.includes('must be authenticated')) {
        console.warn('No se pudo comprobar el bucket (permiso).');
        return;
      }
      if (!bucketData) {
        console.log(`Bucket '${bucketName}' no existe. Creando...`);
        const { data, error } = await supabase.storage.createBucket(bucketName, { public: true });
        if (error) {
          console.error('Error creando bucket:', error);
        } else {
          console.log('Bucket creado:', data);
        }
      } else {
        console.log(`Bucket '${bucketName}' existe.`);
      }
      // Asegurar bucket para música
      try {
        const musicBucket = 'music';
        const { data: mbData, error: mbErr } = await supabase.storage.getBucket(musicBucket);
        if (!mbData) {
          console.log(`Bucket '${musicBucket}' no existe. Creando...`);
          const { data, error } = await supabase.storage.createBucket(musicBucket, { public: true });
          if (error) console.error('Error creando bucket music:', error);
          else console.log('Bucket music creado:', data);
        } else {
          console.log(`Bucket '${musicBucket}' existe.`);
        }
      } catch (e) {
        console.warn('No se pudo asegurar bucket music:', e.message || e);
      }
      // Asegurar bucket para avatars
      try {
        const avatarsBucket = 'avatars';
        const { data: avData, error: avErr } = await supabase.storage.getBucket(avatarsBucket);
        if (!avData) {
          console.log(`Bucket '${avatarsBucket}' no existe. Creando...`);
          const { data, error } = await supabase.storage.createBucket(avatarsBucket, { public: true });
          if (error) console.error('Error creando bucket avatars:', error);
          else console.log('Bucket avatars creado:', data);
        } else {
          console.log(`Bucket '${avatarsBucket}' existe.`);
        }
      } catch (e) {
        console.warn('No se pudo asegurar bucket avatars:', e.message || e);
      }
    } catch (err) {
      console.error('Error al asegurar bucket:', err.message || err);
    }
  })();
});
