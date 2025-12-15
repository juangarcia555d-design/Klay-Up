import { supabase } from './config/supabase.js';

(async function(){
  try{
    const { data: photos, error } = await supabase
      .from('photos')
      .select('id, title, description, date_taken, category, url, user_id')
      .neq('category','VIDEO')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
      .limit(50);
    if (error) { console.error('Error fetching photos', error); process.exit(1); }
    const userIds = Array.from(new Set(photos.filter(p=>p.user_id).map(p=>p.user_id)));
    let usersMap = {};
    if (userIds.length) {
      const { data: users } = await supabase.from('usuarios').select('id,full_name,avatar_url').in('id', userIds);
      usersMap = (users||[]).reduce((acc,u)=>{ acc[String(u.id)] = u; return acc; }, {});
    }
    const enhanced = photos.map(p => ({ ...p, uploader: p.user_id ? usersMap[String(p.user_id)] || null : null }));
    console.log('Enhanced sample (first 10):', JSON.stringify(enhanced.slice(0,10), null, 2));
    const withUploader = enhanced.filter(e=>e.uploader).length;
    console.log('Total rows:', enhanced.length, 'with uploader:', withUploader);
    process.exit(0);
  } catch (e) { console.error(e); process.exit(2); }
})();
