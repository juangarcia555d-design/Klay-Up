import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
dotenv.config();



export const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

console.log('URL:', process.env.SUPABASE_URL);
console.log('KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? '✅' : '❌');
