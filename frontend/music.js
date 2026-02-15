// music.js — gestor de subida y reproducción de pistas
(async function(){
  const API = window.API_BASE || '';
  const playBtn = document.getElementById('playMusic');
  const musicModal = document.getElementById('musicModal');
  const closeMusicBtn = document.getElementById('closeMusic');
  const musicForm = document.getElementById('musicForm');
  const musicList = document.getElementById('musicList');

  function showModal() {
    if (!musicModal) return;
    musicModal.classList.remove('hidden');
    musicModal.setAttribute('aria-hidden','false');
  }
  function hideModal(){
    if (!musicModal) return;
    musicModal.classList.add('hidden');
    musicModal.setAttribute('aria-hidden','true');
  }

  if (playBtn) playBtn.addEventListener('click', showModal);
  if (closeMusicBtn) closeMusicBtn.addEventListener('click', hideModal);
  if (musicModal) musicModal.addEventListener('click', (e)=>{ if (e.target===musicModal) hideModal(); });
  document.addEventListener('keydown', (e)=>{ if (e.key==='Escape') hideModal(); });

  // Fetch and render music list
  async function loadMusic(){
    try{
      const res = await fetch(`${API}/api/music`);
      if (!res.ok) return;
      const data = await res.json();
      renderList(data || []);
    }catch(e){ console.error('loadMusic', e); }
  }

  function renderList(list){
    if (!musicList) return;
    musicList.innerHTML = '';
    const audioEls = [];
    list.forEach(item => {
      const row = document.createElement('div');
      row.className = 'music-row';
      row.style.display = 'flex';
      row.style.alignItems = 'center';
      row.style.justifyContent = 'space-between';
      row.style.gap = '8px';

      const info = document.createElement('div');
      info.innerHTML = `<strong>${escapeHtml(item.title||'Sin título')}</strong><div style="font-size:12px;color:var(--muted);">${escapeHtml(item.artist||'Desconocido')}</div>`;
      const controls = document.createElement('div');
      controls.className = 'music-controls';
      controls.style.display = 'flex'; controls.style.gap='8px'; controls.style.alignItems='center';

      const audio = document.createElement('audio');
      audio.src = item.url;
      audio.controls = true;
      audio.preload = 'none';
      audio.style.maxWidth = '360px';
      // Manejar reproducción nativa: pausar otros audios y mantener índice para avanzar secuencialmente
      audio.addEventListener('play', () => {
        try {
          audioEls.forEach(a => { if (a !== audio) { try { a.pause(); } catch(e){} } });
          // marcar índice actual
          audio._playingIndex = audioEls.indexOf(audio);
        } catch (e) { /* ignore */ }
      });
      // Cuando termine, reproducir la siguiente pista de la lista
      audio.addEventListener('ended', () => {
        try {
          const idx = audioEls.indexOf(audio);
          if (idx < 0) return;
          const nextIdx = (idx + 1) < audioEls.length ? (idx + 1) : 0;
          const next = audioEls[nextIdx];
          if (next) try { next.play(); } catch(e){}
        } catch (e) { console.error('Error advancing to next track', e); }
      });

      const del = document.createElement('button');
      del.className = 'btn ghost';
      del.textContent = 'Eliminar';
      del.addEventListener('click', async ()=>{
        if (!confirm(`Eliminar "${item.title}" ?`)) return;
        try{
          const r = await fetch(`${API}/api/music/${item.id}`, { method: 'DELETE' });
          if (!r.ok) throw new Error('Error eliminando');
          loadMusic();
        }catch(e){ alert('No se pudo eliminar: '+(e.message||e)); }
      });

      controls.appendChild(audio);
      controls.appendChild(del);
      audioEls.push(audio);
      row.appendChild(info);
      row.appendChild(controls);
      musicList.appendChild(row);
    });
    // Si queremos, pre-cargar duración de audios para mostrar barras más rápido
    audioEls.forEach(a => { a.preload = 'metadata'; });
  }

  function escapeHtml(s){ return String(s||'').replace(/[&<>"']/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":"&#39;"})[c]); }

  if (musicForm) musicForm.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const fd = new FormData(musicForm);
    try{
      const res = await fetch(`${API}/api/music`, { method: 'POST', body: fd });
      if (!res.ok) {
        const err = await res.json().catch(()=>({error:'upload error'}));
        throw new Error(err.error||err.message||'Error');
      }
      musicForm.reset();
      await loadMusic();
      alert('Música guardada');
    }catch(err){ alert('No se pudo guardar: '+ (err.message||err)); }
  });

  // carga inicial
  loadMusic();
})();
