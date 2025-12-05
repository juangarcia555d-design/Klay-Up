import { supabase } from '../config/supabase.js';

(async function check() {
  try {
    console.log('Comprobando tabla photo_reactions en Supabase...');
    const { data, error } = await supabase.from('photo_reactions').select('id,photo_id,user_id,reaction,created_at').limit(1);
    if (error) {
      console.error('Error de Supabase:', error);
      process.exit(2);
    }
    console.log('Consulta exitosa. Filas devueltas:', (data || []).length);
    if (data && data.length) console.log('Fila muestra:', data[0]);
    process.exit(0);
  } catch (e) {
    console.error('Excepción al consultar Supabase:', e && e.message ? e.message : e);
    process.exit(3);
  }
})();
