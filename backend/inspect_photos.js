import { supabase } from './config/supabase.js';
(async function(){
  try{
    const { data, error, count } = await supabase.from('photos').select('id,user_id,title,url,created_at', { count: 'exact', head: false }).order('created_at', { ascending: false }).limit(50);
    if (error) { console.error('Error querying photos', error); process.exit(1); }
    const withUser = (data||[]).filter(p => p.user_id);
    console.log('Sample rows (max 20):', JSON.stringify((data||[]).slice(0,20), null, 2));
    console.log('Count returned:', (data||[]).length);
    console.log('Rows with user_id in sample:', withUser.length);
    process.exit(0);
  } catch (e) { console.error(e); process.exit(2); }
})();
