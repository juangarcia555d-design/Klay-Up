import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Faltan variables de entorno para Supabase.');
  console.error('Crea un archivo `backend/.env` basado en `backend/.env.example` y añade SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY.');
  // Lanzar error para que el servidor no arranque en un estado inconsistente
  throw new Error('Supabase variables missing. See backend/.env.example');
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

console.log('Supabase URL encontrada:', SUPABASE_URL ? '✅' : '❌');
console.log('Supabase SERVICE_ROLE_KEY:', SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
