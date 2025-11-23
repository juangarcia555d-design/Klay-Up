import express from 'express';
import cors from 'cors';
import path from 'path';
import { fileURLToPath } from 'url';
import photoRoutes from './routes/photoRoutes.js';
import musicRoutes from './routes/musicRoutes.js';
import { supabase } from './config/supabase.js';

const app = express();
const PORT = process.env.PORT || 8080;

// Configurar __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Servir archivos estáticos (CSS, JS, imágenes)
app.use(express.static(path.join(__dirname, '../frontend')));

// Middleware
app.use(express.json());
app.use(cors({ origin: process.env.ALLOWED_ORIGIN || '*' }));

// Configurar motor de vistas EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../frontend'));

// Ruta principal para mostrar index.ejs
app.get('/', (req, res) => {
  res.render('index');
});

// Rutas API
app.use('/api/photos', photoRoutes);
app.use('/api/music', musicRoutes);

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
    } catch (err) {
      console.error('Error al asegurar bucket:', err.message || err);
    }
  })();
});
