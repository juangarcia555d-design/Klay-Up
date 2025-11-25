const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : ''; // Si front y backend están en el mismo servidor

document.addEventListener('DOMContentLoaded', () => {
  const tabs = document.querySelectorAll('.tab');
  const listTitle = document.getElementById('listTitle');
  const gallery = document.getElementById('gallery');
  const uploadForm = document.getElementById('uploadForm');
  const bgMusic = document.getElementById('bgMusic');
  const playMusicBtn = document.getElementById('playMusic');
  const colorPicker = document.getElementById('colorPicker');
  const presetBtns = document.querySelectorAll('.preset');

  const editModal = document.getElementById('editModal');
  const closeModalBtn = document.getElementById('closeModal');
  const editForm = document.getElementById('editForm');

  let currentCategory = '';
  let editingId = null;
  let photosData = [];
  let currentIndex = -1;

  // 🎵 Música — reproductor global con cola accesible desde UI
  if (playMusicBtn && bgMusic) {
    // Exponer un objeto global para controlar la reproducción desde otros scripts
    window.musicPlayer = {
      queue: [],
      index: 0,
      async loadQueue() {
        try {
          const res = await fetch(`${API_BASE}/api/music`);
          if (!res.ok) return [];
          this.queue = await res.json() || [];
          if (this.queue.length && !bgMusic.src) {
            this.index = 0;
            bgMusic.src = this.queue[0].url;
          }
          return this.queue;
        } catch (e) { console.warn('No se pudo cargar playlist', e); return []; }
      },
      async playUrl(url) {
        try {
          await this.loadQueue();
          const idx = this.queue.findIndex(i => i.url === url);
          this.index = idx >= 0 ? idx : 0;
          bgMusic.src = url || (this.queue[this.index] && this.queue[this.index].url) || '';
          try { await bgMusic.play(); } catch (e) { console.warn('Playback blocked', e); }
        } catch (e) { console.warn('playUrl error', e); }
      }
    };

    // Al terminar una pista, avanzar en la cola global
    bgMusic.addEventListener('ended', async () => {
      try {
        const mp = window.musicPlayer;
        if (!mp || !Array.isArray(mp.queue) || mp.queue.length === 0) return;
        mp.index = (mp.index + 1) % mp.queue.length;
        bgMusic.src = mp.queue[mp.index].url;
        try { await bgMusic.play(); } catch (e) { console.warn('No se pudo reproducir siguiente pista', e); }
      } catch (e) { console.warn('Error en ended handler', e); }
    });

    // Al hacer click en el botón Música abrimos el modal (sin autoplay)
    playMusicBtn.addEventListener('click', async () => {
      try {
        const musicModal = document.getElementById('musicModal');
        if (musicModal) { musicModal.classList.remove('hidden'); musicModal.setAttribute('aria-hidden','false'); }
        // precargar cola en background para que los botones de reproducción sean inmediatos
        window.musicPlayer.loadQueue().catch(()=>{});
      } catch (e) { console.warn('No se pudo abrir gestor de música', e); }
    });
  }

  // 🎨 Temas de color (ahora el picker cambia el background, no los botones)
  function hexToRgb(hex) {
    const h = hex.replace('#', '');
    const bigint = parseInt(h.length === 3 ? h.split('').map(c => c + c).join('') : h, 16);
    return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
  }
  function luminance(r, g, b) {
    const a = [r, g, b].map(v => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrastColor(hex) {
    try {
      const [r, g, b] = hexToRgb(hex);
      const L = luminance(r, g, b);
      // contrast vs white (1.0) and black (0.0)
      const contrastWithWhite = (1.05) / (L + 0.05);
      const contrastWithBlack = (L + 0.05) / 0.05;
      return contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#0b0f1a';
    } catch (e) {
      return '#0b0f1a';
    }
  }

  function setBackgroundColor(color) {
    document.documentElement.style.setProperty('--bg', color);
    // Ajustar texto para legibilidad automática
    const text = contrastColor(color);
    document.documentElement.style.setProperty('--text', text);
    // ajustar muteds y card sutilmente
    if (text === '#ffffff') {
      document.documentElement.style.setProperty('--muted', '#d1d5db');
      document.documentElement.style.setProperty('--card', 'color-mix(in srgb, var(--bg) 92%, #00000010)');
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.style.setProperty('--muted', '#6b7280');
      document.documentElement.style.setProperty('--card', 'color-mix(in srgb, var(--bg) 98%, #ffffff)');
      document.documentElement.setAttribute('data-theme', 'default');
    }
  }

  if (colorPicker) colorPicker.addEventListener('input', (e) => setBackgroundColor(e.target.value));
  // Aplicar tema inicial según el valor actual del colorPicker (o el data-theme inyectado)
  if (colorPicker && colorPicker.value) setBackgroundColor(colorPicker.value);
  if (presetBtns && presetBtns.length) {
    presetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        setBackgroundColor(color);
        // intentar guardar tema para el usuario autenticado y avisar si falla
        (async () => {
          try {
            const res = await fetch(`${API_BASE}/auth/theme`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: color }) });
            if (!res.ok) {
              let msg = 'No se pudo guardar el tema.';
              try { const j = await res.json(); if (j && j.error) msg = j.error; } catch(e){}
              alert(msg + ' Revisa la consola del servidor.');
            } else {
              console.log('Tema guardado:', color);
            }
          } catch (e) {
            console.error('Error guardando tema:', e);
            alert('Error guardando tema. Revisa conexión o sesión.');
          }
        })();
      });
    });
  }

  // Guardar tema cuando el usuario cambie el color picker
  if (colorPicker) colorPicker.addEventListener('change', (e) => {
    const color = e.target.value;
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/auth/theme`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: color }) });
        if (!res.ok) {
          let msg = 'No se pudo guardar el tema.';
          try { const j = await res.json(); if (j && j.error) msg = j.error; } catch(e){}
          alert(msg + ' Revisa la consola del servidor.');
        } else {
          console.log('Tema guardado:', color);
        }
      } catch (e) {
        console.error('Error guardando tema:', e);
        alert('Error guardando tema. Revisa conexión o sesión.');
      }
    })();
  });

  // (Se usará delegación de eventos más abajo cuando exista `tabsContainer`)

  // Categorías dinámicas: crear nuevas categorías y persistir en localStorage
  const categorySelect = document.getElementById('categorySelect');
  const tabsContainer = document.querySelector('.tabs');
  const addCategoryTabBtn = document.getElementById('addCategoryTabBtn');
  const addCategoryContainer = document.getElementById('addCategoryContainer');

  // Delegación: manejar clicks en tabs y en el control de borrado dentro de la misma barra
  if (tabsContainer) {
    tabsContainer.addEventListener('click', (e) => {
      const tabEl = e.target.closest('.tab');
      if (!tabEl) return;
      // si se hizo click en el icono de borrar
      if (e.target.classList.contains('tab-delete')) {
        e.stopPropagation();
        const cat = tabEl.dataset.category || '';
        // no permitir borrar categorías por defecto
        if (!cat || tabEl.dataset.default === 'true') return;
        showConfirm(`¿Eliminar la categoría "${cat}"? Esta acción eliminará la categoría del selector.`)
          .then(ok => { if (ok) deleteCategory(cat); });
        return;
      }
      // click normal en la tab -> activarla
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tabEl.classList.add('active');
      currentCategory = tabEl.dataset.category || '';
      if (listTitle) listTitle.textContent = currentCategory ? `Categoría: ${currentCategory}` : 'Todas las fotos';
      fetchPhotos();
    });
  }

  function createCategory(name, persist = true) {
    if (!name) return;
    const val = name.trim();
    if (!val) return;
    // Evitar duplicados en select
    const exists = Array.from(categorySelect.options).some(o => o.value.toLowerCase() === val.toLowerCase());
    if (!exists) {
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = val;
      categorySelect.appendChild(opt);
    }

    // Añadir tab si no existe (incluye control para borrar)
    const tabExists = Array.from(tabsContainer.querySelectorAll('.tab')).some(t => (t.dataset.category||'').toLowerCase() === val.toLowerCase());
    if (!tabExists) {
      const btn = document.createElement('button');
      btn.className = 'tab';
      btn.dataset.category = val;
      btn.dataset.default = 'false';
      btn.innerHTML = `<span class="tab-label">${val}</span><span class="tab-delete" title="Eliminar categoría">✕</span>`;
      // Insert new tab before the + button so + stays at the end
      if (addCategoryTabBtn && addCategoryTabBtn.parentNode === tabsContainer) {
        tabsContainer.insertBefore(btn, addCategoryTabBtn);
      } else {
        tabsContainer.appendChild(btn);
      }
    }

    if (persist) {
      const saved = JSON.parse(localStorage.getItem('customCategories') || '[]');
      if (!saved.includes(val)) {
        saved.push(val);
        localStorage.setItem('customCategories', JSON.stringify(saved));
      }
    }
    // Return created value for convenience
    return val;
  }

  // Cargar categorías guardadas
  try {
    const saved = JSON.parse(localStorage.getItem('customCategories') || '[]');
    if (Array.isArray(saved) && saved.length) saved.forEach(c => createCategory(c, false));
  } catch (e) { /* ignore */ }

  // Eliminar categoría: quitar tab, opción del select y actualizar localStorage
  function deleteCategory(name) {
    if (!name) return;
    const val = name.trim();
    // quitar del select
    if (categorySelect) {
      const opt = Array.from(categorySelect.options).find(o => (o.value||'').toLowerCase() === val.toLowerCase());
      if (opt) opt.remove();
    }
    // quitar tab
    const tab = Array.from(document.querySelectorAll('.tab')).find(t => (t.dataset.category||'').toLowerCase() === val.toLowerCase());
    if (tab) tab.remove();
    // quitar del storage
    try {
      const saved = JSON.parse(localStorage.getItem('customCategories') || '[]');
      const filtered = saved.filter(s => (s||'').toLowerCase() !== val.toLowerCase());
      localStorage.setItem('customCategories', JSON.stringify(filtered));
    } catch (e) { /* ignore */ }
    // si la categoría eliminada estaba activa, volver a 'Galería'
    if ((currentCategory||'').toLowerCase() === val.toLowerCase()) {
      const home = document.querySelector('.tab[data-category=""]');
      if (home) { document.querySelectorAll('.tab').forEach(t => t.classList.remove('active')); home.classList.add('active'); }
      currentCategory = '';
      fetchPhotos();
    }
  }

  // Confirm dialog (simple, reusable) -> Promise<boolean>
  function showConfirm(message) {
    // Modal centrado con overlay y estilo sencillo
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.left = '0'; overlay.style.top = '0'; overlay.style.right = '0'; overlay.style.bottom = '0';
      overlay.style.background = 'rgba(0,0,0,0.45)';
      overlay.style.display = 'flex';
      overlay.style.alignItems = 'center';
      overlay.style.justifyContent = 'center';
      overlay.style.zIndex = '99999';

      const card = document.createElement('div');
      card.style.background = 'var(--bg)';
      card.style.color = 'var(--text)';
      card.style.padding = '18px';
      card.style.borderRadius = '12px';
      card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.2)';
      card.style.maxWidth = '420px';
      card.style.width = '90%';
      card.innerHTML = `<h4 style="margin-top:0;margin-bottom:8px;">Confirmar</h4><p style="margin:0 0 12px 0;">${message}</p>`;

      const actions = document.createElement('div');
      actions.style.display = 'flex'; actions.style.justifyContent = 'flex-end'; actions.style.gap = '8px';
      const cancelBtn = document.createElement('button'); cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.padding = '8px 12px'; cancelBtn.style.borderRadius = '8px';
      const okBtn = document.createElement('button'); okBtn.textContent = 'Eliminar';
      okBtn.style.padding = '8px 12px'; okBtn.style.borderRadius = '8px'; okBtn.style.background = '#e04848'; okBtn.style.color = '#fff'; okBtn.style.border = 'none';
      actions.appendChild(cancelBtn); actions.appendChild(okBtn);
      card.appendChild(actions);
      overlay.appendChild(card);
      document.body.appendChild(overlay);

      function cleanup(val) { try { document.body.removeChild(overlay); } catch (e) {} resolve(val); }
      cancelBtn.addEventListener('click', () => cleanup(false));
      okBtn.addEventListener('click', () => cleanup(true));
    });
  }

  // Añadir categoría desde la barra de tabs (botón +)
  function activateCategory(val) {
    if (!val) return;
    // seleccionar en select si existe
    if (categorySelect) categorySelect.value = val;
    // activar tab si existe
    const tab = Array.from(document.querySelectorAll('.tab')).find(t => (t.dataset.category||'').toLowerCase() === val.toLowerCase());
    if (tab) tab.click();
  }

  if (addCategoryTabBtn) {
    addCategoryTabBtn.addEventListener('click', () => {
      // si ya hay un input abierto, focusearlo
      if (addCategoryContainer.querySelector('input')) {
        addCategoryContainer.querySelector('input').focus();
        return;
      }
      // crear input inline
      const wrapper = document.createElement('span');
      wrapper.style.display = 'inline-flex';
      wrapper.style.gap = '6px';

      const input = document.createElement('input');
      input.type = 'text';
      input.placeholder = 'Nombre categoría';
      input.style.padding = '6px';
      input.style.border = '1px solid #ddd';
      input.style.borderRadius = '6px';

      const ok = document.createElement('button');
      ok.type = 'button';
      ok.textContent = 'OK';
      ok.style.padding = '6px 8px';

      const cancel = document.createElement('button');
      cancel.type = 'button';
      cancel.textContent = '✕';
      cancel.style.padding = '6px 8px';

      wrapper.appendChild(input);
      wrapper.appendChild(ok);
      wrapper.appendChild(cancel);

      addCategoryContainer.appendChild(wrapper);
      input.focus();

      function cleanup() {
        try { addCategoryContainer.removeChild(wrapper); } catch(e){}
      }

      ok.addEventListener('click', () => {
        const name = input.value ? input.value.trim() : '';
        if (!name) { alert('Ingresa un nombre de categoría válido'); input.focus(); return; }
        const created = createCategory(name, true);
        // seleccionar la nueva categoría en el formulario
        if (categorySelect && created) categorySelect.value = created;
        // activar la tab creada
        activateCategory(created);
        cleanup();
      });

      cancel.addEventListener('click', () => cleanup());

      // Enter / Escape handlers
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { ok.click(); }
        if (e.key === 'Escape') { cleanup(); }
      });
    });
  }

  // 📸 Fetch fotos
  // Helper: detectar si una URL apunta a un video por extensión
  function isVideoUrl(url) {
    if (!url || typeof url !== 'string') return false;
    const u = url.split('?')[0].toLowerCase();
    return u.endsWith('.mp4') || u.endsWith('.webm') || u.endsWith('.ogg') || u.endsWith('.mov') || u.endsWith('.m4v');
  }

  async function fetchPhotos() {
    if (!gallery) return;
    gallery.innerHTML = '';
    const url = currentCategory ? `${API_BASE}/api/photos?category=${encodeURIComponent(currentCategory)}`
                                : `${API_BASE}/api/photos`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Error al obtener fotos, status:', res.status);
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.warn('Respuesta inesperada al obtener fotos:', data);
        return;
      }
      console.log('Fotos recibidas:', data);
      photosData = data;
      // Agrupar elementos contiguos que pertenecen a la misma subida (misma title, date_taken y category)
      const groups = [];
      let i = 0;
      while (i < data.length) {
        const base = data[i];
        let group = [base];
        let j = i + 1;
        while (j < data.length && data[j].title === base.title && data[j].date_taken === base.date_taken && data[j].category === base.category) {
          group.push(data[j]);
          j++;
        }
        if (group.length > 1) groups.push({ type: 'group', items: group, startIndex: i });
        else groups.push({ type: 'single', item: base, index: i });
        i = j;
      }
      // Renderizar grupos
      groups.forEach(g => {
        if (g.type === 'group') renderGroup(g.items, g.startIndex);
        else renderCard(g.item, g.index);
      });
    } catch (err) {
      console.error('Error fetchPhotos:', err);
    }
  }

  // Renderiza un grupo de imágenes/vídeos como un mosaico dentro de una tarjeta
  function renderGroup(items, startIndex) {
    if (!items || !items.length) return;
    const tpl = document.getElementById('cardTemplate');
    if (!tpl) return;
    const node = tpl.content.cloneNode(true);

    const img = node.querySelector('.card-img');
    const videoEl = node.querySelector('.card-video');
    // ocultar img/video principal
    if (img) img.style.display = 'none';
    if (videoEl) videoEl.style.display = 'none';

    // crear contenedor para miniaturas
    const body = node.querySelector('.card-body');
    const thumbWrapper = document.createElement('div');
    thumbWrapper.className = 'group-grid';
    thumbWrapper.style.display = 'grid';
    thumbWrapper.style.gridTemplateColumns = 'repeat(2, 1fr)';
    thumbWrapper.style.gap = '6px';
    thumbWrapper.style.marginBottom = '8px';

    items.slice(0, 4).forEach((it, idx) => {
      const isV = isVideoUrl(it.url);
      if (isV) {
        const v = document.createElement('video');
        v.src = it.url;
        v.controls = false;
        v.muted = true;
        v.style.width = '100%';
        v.style.height = '120px';
        v.style.objectFit = 'cover';
        v.className = 'group-thumb';
        v.addEventListener('click', () => openView(it, startIndex + idx));
        thumbWrapper.appendChild(v);
      } else {
        const t = document.createElement('img');
        t.src = it.url;
        t.alt = it.title || 'Foto';
        t.className = 'group-thumb';
        t.style.width = '100%';
        t.style.height = '120px';
        t.style.objectFit = 'cover';
        t.style.borderRadius = '8px';
        t.addEventListener('click', () => openView(it, startIndex + idx));
        thumbWrapper.appendChild(t);
      }
    });

    // Si hay más de 4 items, añadir indicación
    if (items.length > 4) {
      const more = document.createElement('div');
      more.textContent = `+${items.length - 4} más`;
      more.style.display = 'flex';
      more.style.alignItems = 'center';
      more.style.justifyContent = 'center';
      more.style.background = 'rgba(0,0,0,0.06)';
      more.style.height = '120px';
      more.style.borderRadius = '8px';
      more.style.fontWeight = '700';
      more.style.color = 'var(--muted)';
      thumbWrapper.appendChild(more);
    }

    if (body) body.insertBefore(thumbWrapper, body.firstChild);

    const titleEl = node.querySelector('.card-title');
    if (titleEl) titleEl.textContent = items[0].title || 'Álbum';
    const desc = node.querySelector('.card-desc');
    if (desc) desc.textContent = items[0].description || '';
    const dateEl = node.querySelector('.card-date');
    if (dateEl) dateEl.textContent = items[0].date_taken ? `Fecha: ${items[0].date_taken}` : '';
    const cat = node.querySelector('.card-cat');
    if (cat) cat.textContent = items[0].category ? `Categoría: ${items[0].category}` : '';

    const editBtn = node.querySelector('.edit');
    if (editBtn) editBtn.addEventListener('click', () => openEdit(items[0]));
    const delBtn = node.querySelector('.delete');
    if (delBtn) delBtn.addEventListener('click', () => deletePhoto(items[0].id));

    gallery.appendChild(node);
  }

  function renderCard(item, index) {
    if (!item) return;
    const tpl = document.getElementById('cardTemplate');
    if (!tpl) return;
    const node = tpl.content.cloneNode(true);

    const img = node.querySelector('.card-img');
    const videoEl = node.querySelector('.card-video');
    const isVideo = isVideoUrl(item.url);
    if (isVideo) {
      if (videoEl) {
        videoEl.src = item.url;
        videoEl.style.display = 'block';
      }
      if (img) img.style.display = 'none';
    } else {
      if (img) {
        img.src = item.url;
        img.alt = item.title || 'Foto';
        img.style.display = 'block';
      }
      if (videoEl) videoEl.style.display = 'none';
    }

    const titleEl = node.querySelector('.card-title');
    if (titleEl) titleEl.textContent = item.title || 'Sin título';
    const desc = node.querySelector('.card-desc');
    if (desc) desc.textContent = item.description || '';
    const dateEl = node.querySelector('.card-date');
    if (dateEl) dateEl.textContent = item.date_taken ? `Fecha: ${item.date_taken}` : '';
    const cat = node.querySelector('.card-cat');
    if (cat) cat.textContent = item.category ? `Categoría: ${item.category}` : '';

  const editBtn = node.querySelector('.edit');
  if (editBtn) editBtn.addEventListener('click', () => openEdit(item));
  const delBtn = node.querySelector('.delete');
  if (delBtn) delBtn.addEventListener('click', () => deletePhoto(item.id));

    // Abrir vista completa al hacer click en la imagen o en el video
    if (img) {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', () => openView(item, index));
    }
    if (videoEl) {
      videoEl.style.cursor = 'zoom-in';
      // pausar reproducción si se hace click para abrir el lightbox
      videoEl.addEventListener('click', (e) => { e.preventDefault(); openView(item, index); });
    }

    gallery.appendChild(node);
  }

  // ⬆️ Subir foto
  if (uploadForm) {
    // Auto-seleccionar categoría VIDEO si el usuario selecciona al menos un archivo de video
    const uploadFilesInput = document.getElementById('uploadFiles');
    if (uploadFilesInput) {
      uploadFilesInput.addEventListener('change', (e) => {
        try {
          const files = Array.from(e.target.files || []);
          const hasVideo = files.some(f => f && f.type && f.type.startsWith('video/'));
          if (hasVideo && categorySelect) {
            categorySelect.value = 'VIDEO';
          }
        } catch (err) { /* ignore */ }
      });
    }

    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const form = new FormData(uploadForm);
      try {
        const res = await fetch(`${API_BASE}/api/photos`, { method: 'POST', body: form });
        if (!res.ok) throw new Error('Error al subir');
        uploadForm.reset();
        fetchPhotos();
      } catch (err) {
        alert('No se pudo subir la foto: ' + err.message);
      }
    });
  }

  // ✏️ Editar foto
  function openEdit(item) {
    if (!editForm || !editModal) return;
    editingId = item.id;
    if (editForm.title) editForm.title.value = item.title || '';
    if (editForm.description) editForm.description.value = item.description || '';
    if (editForm.date_taken) editForm.date_taken.value = item.date_taken || '';
    if (editForm.category) editForm.category.value = item.category || 'GALERIA';
    editModal.classList.remove('hidden');
  }
  if (closeModalBtn) closeModalBtn.addEventListener('click', () => editModal.classList.add('hidden'));
  if (editForm) {
    editForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {
        title: editForm.title ? editForm.title.value : '',
        description: editForm.description ? editForm.description.value : '',
        date_taken: editForm.date_taken ? editForm.date_taken.value : '',
        category: editForm.category ? editForm.category.value : ''
      };
      try {
        const res = await fetch(`${API_BASE}/api/photos/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        if (!res.ok) throw new Error('Error al editar');
        if (editModal) editModal.classList.add('hidden');
        fetchPhotos();
      } catch (err) {
        alert('No se pudo editar: ' + err.message);
      }
    });
  }

  // 🗑️ Eliminar foto
  async function deletePhoto(id) {
    if (!confirm('¿Eliminar esta foto?')) return;
    try {
      const res = await fetch(`${API_BASE}/api/photos/${id}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Error al eliminar la foto');
      fetchPhotos();
    } catch (err) {
      alert('No se pudo eliminar: ' + err.message);
    }
  }

  // 🚀 Inicial
  fetchPhotos();

  // Perfil de usuario: cargar datos y manejar panel
  async function loadUserProfile() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (!res.ok) return; // no autenticado
      const j = await res.json();
      if (!j || !j.ok) return;
      const user = j.user || {};
      // rellenar avatar en header
      const avatarImg = document.getElementById('userAvatar');
      const avatarLarge = document.getElementById('profileAvatarLarge');
      if (avatarImg && user.avatar_url) avatarImg.src = user.avatar_url;
      if (avatarLarge && user.avatar_url) avatarLarge.src = user.avatar_url;
      const nameEl = document.getElementById('profileName');
      if (nameEl) {
        nameEl.textContent = user.full_name || '';
        nameEl.style.cursor = 'pointer';
        nameEl.addEventListener('click', () => { window.location.href = '/profile'; });
      }
      const emailEl = document.getElementById('profileEmail');
      if (emailEl) emailEl.textContent = user.email || '';
      const descEl = document.getElementById('profileDescription');
      if (descEl) descEl.value = user.profile_description || '';
      if (avatarLarge) {
        avatarLarge.style.cursor = 'pointer';
        avatarLarge.addEventListener('click', () => { window.location.href = '/profile'; });
      }
    } catch (e) { console.warn('No se pudo cargar perfil:', e); }
  }

  // Abrir/ cerrar panel perfil
  const profilePanel = document.getElementById('profilePanel');
  const closeProfileBtn = document.getElementById('closeProfile');
  const saveProfileBtn = document.getElementById('saveProfileDesc');
  const deleteProfileBtn = document.getElementById('deleteProfileDesc');
  window.addEventListener('openProfilePanel', async () => {
    await loadUserProfile();
    if (!profilePanel) return;
    // Position popover relative to avatar button
    const avatarBtn = document.getElementById('profileBtn');
    try {
      const rect = avatarBtn.getBoundingClientRect();
      // prefer right-aligned popover
      const panelWidth = Math.min(window.innerWidth - 24, 360);
      const top = rect.bottom + window.scrollY + 8;
      const right = Math.max(12, window.innerWidth - rect.right - window.scrollX + 12);
      profilePanel.style.top = top + 'px';
      profilePanel.style.right = right + 'px';
      profilePanel.style.left = 'auto';
    } catch (e) { /* ignore positioning errors */ }
    profilePanel.classList.remove('hidden'); profilePanel.setAttribute('aria-hidden','false');
  });
  if (closeProfileBtn) closeProfileBtn.addEventListener('click', () => { if (profilePanel) { profilePanel.classList.add('hidden'); profilePanel.setAttribute('aria-hidden','true'); } });

  if (saveProfileBtn) {
    saveProfileBtn.addEventListener('click', async () => {
      const textarea = document.getElementById('profileDescription');
      if (!textarea) return;
      const desc = textarea.value || '';
      try {
        const res = await fetch(`${API_BASE}/auth/profile`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ description: desc }) });
        if (!res.ok) {
          const j = await res.json().catch(()=>null);
          alert((j && j.error) ? j.error : 'No se pudo guardar la descripción');
          return;
        }
        alert('Descripción guardada');
        await loadUserProfile();
      } catch (e) { console.error('Error guardando descripción:', e); alert('Error guardando descripción'); }
    });
  }

  if (deleteProfileBtn) {
    deleteProfileBtn.addEventListener('click', async () => {
      const ok = await showConfirm('¿Eliminar tu descripción de perfil? Esta acción no se puede deshacer.');
      if (!ok) return;
      try {
        const res = await fetch(`${API_BASE}/auth/profile`, { method: 'DELETE', credentials: 'include' });
        if (!res.ok) { const j = await res.json().catch(()=>null); alert((j && j.error) ? j.error : 'No se pudo eliminar'); return; }
        alert('Descripción eliminada');
        await loadUserProfile();
      } catch (e) { console.error('Error eliminando descripción:', e); alert('Error eliminando descripción'); }
    });
  }

  // Cerrar panel al hacer click fuera (delegación)
  document.addEventListener('click', (ev) => {
    try {
      if (!profilePanel || profilePanel.classList.contains('hidden')) return;
      const avatarBtn = document.getElementById('profileBtn');
      if (avatarBtn && avatarBtn.contains(ev.target)) return;
      if (profilePanel.contains(ev.target)) return;
      profilePanel.classList.add('hidden'); profilePanel.setAttribute('aria-hidden','true');
    } catch (e) { /* ignore */ }
  });

  // Logout inside panel
  const logoutInPanel = document.getElementById('logoutInPanel');
  if (logoutInPanel) {
    logoutInPanel.addEventListener('click', async () => {
      try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch (e) {}
      window.location.href = '/login';
    });
  }

  // Cargar perfil al iniciar
  loadUserProfile();

  // ---- Lightbox / view modal ----
  const viewModal = document.getElementById('viewModal');
  const viewImage = document.getElementById('viewImage');
  const viewVideo = document.getElementById('viewVideo');
  const viewTitle = document.getElementById('viewTitle');
  const closeViewBtn = document.getElementById('closeView');
  const prevViewBtn = document.getElementById('prevView');
  const nextViewBtn = document.getElementById('nextView');
  const prevSideBtn = document.getElementById('prevSide');
  const nextSideBtn = document.getElementById('nextSide');

  function openView(item, index) {
    if (!viewModal || (!viewImage && !viewVideo)) return;
    if (typeof index === 'number') currentIndex = index;
    const isVideo = isVideoUrl(item.url);
    // Mostrar el elemento correcto
    if (isVideo) {
      if (viewImage) { viewImage.style.display = 'none'; viewImage.src = ''; }
      if (viewVideo) { viewVideo.style.display = 'block'; viewVideo.src = item.url || ''; viewVideo.load(); }
    } else {
      if (viewVideo) { viewVideo.style.display = 'none'; viewVideo.pause(); viewVideo.src = ''; }
      if (viewImage) { viewImage.style.display = 'block'; viewImage.src = item.url || ''; viewImage.alt = item.title || 'Foto'; }
    }
    if (viewTitle) viewTitle.textContent = item.title || '';
    viewModal.classList.remove('hidden');
    viewModal.setAttribute('aria-hidden', 'false');
    updateNavButtons();
  }

  function showIndex(idx) {
    if (!Array.isArray(photosData) || photosData.length === 0) return;
    if (idx < 0 || idx >= photosData.length) return;
    const item = photosData[idx];
    if (!item) return;
    openView(item, idx);
  }

  function prevView() {
    if (typeof currentIndex !== 'number' || currentIndex <= 0) return;
    showIndex(currentIndex - 1);
  }

  function nextView() {
    if (!Array.isArray(photosData)) return;
    if (typeof currentIndex !== 'number') return;
    if (currentIndex >= photosData.length - 1) return;
    showIndex(currentIndex + 1);
  }

  function updateNavButtons() {
    if (prevViewBtn) prevViewBtn.disabled = (typeof currentIndex !== 'number' || currentIndex <= 0);
    if (nextViewBtn) nextViewBtn.disabled = (typeof currentIndex !== 'number' || currentIndex >= (photosData.length - 1));
  }

  function closeView() {
    if (!viewModal) return;
    viewModal.classList.add('hidden');
    viewModal.setAttribute('aria-hidden', 'true');
    if (viewImage) viewImage.src = '';
    if (viewVideo) { try { viewVideo.pause(); } catch(e){}; viewVideo.src = ''; viewVideo.style.display = 'none'; }
    if (viewTitle) viewTitle.textContent = '';
    currentIndex = -1;
    updateNavButtons();
  }

  if (closeViewBtn) closeViewBtn.addEventListener('click', closeView);
  if (prevViewBtn) prevViewBtn.addEventListener('click', prevView);
  if (nextViewBtn) nextViewBtn.addEventListener('click', nextView);
  if (prevSideBtn) prevSideBtn.addEventListener('click', prevView);
  if (nextSideBtn) nextSideBtn.addEventListener('click', nextView);
  if (viewModal) {
    viewModal.addEventListener('click', (e) => {
      // cerrar si se hace click fuera del contenido
      if (e.target === viewModal) closeView();
    });
  }
  // cerrar con Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && viewModal && !viewModal.classList.contains('hidden')) closeView();
    // Navegación por teclado para lightbox
    if (e.key === 'ArrowLeft' && viewModal && !viewModal.classList.contains('hidden')) prevView();
    if (e.key === 'ArrowRight' && viewModal && !viewModal.classList.contains('hidden')) nextView();
  });
});
