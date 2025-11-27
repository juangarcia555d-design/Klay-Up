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

    uploadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const form = new FormData(uploadForm);
      // create or reuse a progress bar
      let progress = uploadForm.querySelector('.upload-progress');
      if (!progress) {
        progress = document.createElement('div');
        progress.className = 'upload-progress';
        progress.style.height = '8px';
        progress.style.background = 'rgba(0,0,0,0.08)';
        progress.style.borderRadius = '6px';
        progress.style.overflow = 'hidden';
        progress.style.marginTop = '8px';
        const inner = document.createElement('div'); inner.className = 'upload-progress-inner'; inner.style.width = '0%'; inner.style.height = '100%'; inner.style.background = 'linear-gradient(90deg,#6b46c1,#7c3aed)'; inner.style.transition = 'width 120ms linear'; progress.appendChild(inner);
        uploadForm.appendChild(progress);
      }
      const innerBar = progress.querySelector('.upload-progress-inner');

      // Use XHR to get progress events
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/photos`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        const pct = Math.round((ev.loaded / ev.total) * 100);
        if (innerBar) innerBar.style.width = pct + '%';
      };
      xhr.onload = async () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            uploadForm.reset();
            if (innerBar) innerBar.style.width = '100%';
            await fetchPhotos();
            setTimeout(()=>{ try { if (progress) progress.remove(); } catch(e){} }, 600);
          } else {
            const msg = xhr.responseText || 'Error al subir';
            alert('No se pudo subir la foto: ' + msg);
            try { if (progress) progress.remove(); } catch(e){}
          }
        } catch (err) { alert('Error procesando la subida: ' + err.message); }
      };
      xhr.onerror = () => { alert('Error al subir el archivo'); try { if (progress) progress.remove(); } catch(e){} };
      xhr.send(form);
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
      // Exponer id del usuario a otras funciones del frontend (para comparar envíos)
      try { window.currentUserId = user.id || ''; } catch(e){}
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
        avatarLarge.addEventListener('click', async () => {
          // open an inline avatar picker modal
          try {
            const existing = document.getElementById('avatarPickerModalInline');
            if (existing) { existing.style.display = 'flex'; return; }
            const modal = document.createElement('div');
            modal.id = 'avatarPickerModalInline';
            modal.style.position = 'fixed'; modal.style.left = '0'; modal.style.top = '0'; modal.style.right = '0'; modal.style.bottom = '0'; modal.style.background = 'rgba(0,0,0,0.45)'; modal.style.display = 'flex'; modal.style.alignItems = 'center'; modal.style.justifyContent = 'center'; modal.style.zIndex = '1000000';
            modal.innerHTML = `<div style="max-width:680px;width:94%;background:var(--bg);color:var(--text);padding:12px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.25);"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Seleccionar avatar</strong><button id='closeAvatarPickerInline' class='btn'>Cerrar</button></div><div id='avatarListInline' style='display:flex;gap:12px;flex-wrap:wrap;max-height:48vh;overflow:auto;padding:6px'>Cargando avatares...</div><hr style='margin:10px 0' /><div style='display:flex;gap:8px;align-items:center'><label style='font-weight:600'>Subir avatar</label><input id='avatarFileInline' type='file' accept='image/*' /><button id='avatarUploadBtnInline' class='btn btn-primary'>Subir</button><div id='avatarUploadProgressInline' style='flex:1;display:none;margin-left:8px;height:8px;background:rgba(0,0,0,0.06);border-radius:8px;overflow:hidden'><div style='height:100%;width:0%;background:linear-gradient(90deg,#6b46c1,#7c3aed);transition:width 120ms linear'></div></div></div></div>`;
            document.body.appendChild(modal);
            document.getElementById('closeAvatarPickerInline').addEventListener('click', ()=>{ modal.style.display='none'; });
            // Populate avatars
            try {
              const r = await fetch('/api/avatars');
              if (!r.ok) throw new Error('No avatars');
              const j = await r.json();
              const files = j && j.data ? (j.data||[]) : [];
              const listEl = document.getElementById('avatarListInline');
              listEl.innerHTML = '';
              if (!files || !files.length) listEl.innerHTML = '<div class="muted">No hay avatares</div>';
              files.forEach(f => {
                const url = '/imagen/avatares/' + f;
                const el = document.createElement('div'); el.style.padding='6px'; el.style.cursor='pointer'; el.style.width='72px'; el.style.height='72px'; el.style.display='flex'; el.style.justifyContent='center'; el.style.alignItems='center'; el.style.borderRadius='8px'; el.style.border='1px solid rgba(0,0,0,0.06)';
                const img = document.createElement('img'); img.src = url; img.style.maxWidth='64px'; img.style.maxHeight='64px'; img.style.borderRadius='50%'; el.appendChild(img);
                el.addEventListener('click', async ()=>{ try { const res = await fetch('/auth/profile/avatar', { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ default_avatar: url }) }); if (!res.ok) { const rr = await res.json().catch(()=>null); alert((rr && rr.error) ? rr.error : 'Error'); return; } const jj = await res.json(); if (jj && jj.avatar) { if (avatarImg) avatarImg.src = jj.avatar; if (avatarLarge) avatarLarge.src = jj.avatar; } alert('Avatar actualizado'); modal.style.display='none'; } catch(e){console.error(e);alert('Error')}; });
                listEl.appendChild(el);
              });
            } catch (e) { const listEl = document.getElementById('avatarListInline'); if (listEl) listEl.innerHTML = '<div class="muted">No se pudieron cargar avatares</div>'; }

            // upload handler
            document.getElementById('avatarUploadBtnInline').addEventListener('click', ()=>{
              const f = document.getElementById('avatarFileInline').files[0]; if (!f) { alert('Selecciona un archivo'); return; }
              const fd = new FormData(); fd.append('avatar', f);
              const xhr = new XMLHttpRequest(); xhr.open('POST','/auth/profile/avatar'); xhr.withCredentials = true;
              const progressWrap = document.getElementById('avatarUploadProgressInline'); progressWrap.style.display='block';
              xhr.upload.onprogress = (ev)=>{ if (ev.lengthComputable) progressWrap.querySelector('div').style.width = Math.round((ev.loaded/ev.total)*100)+'%'; };
              xhr.onload = async ()=>{ if (xhr.status>=200 && xhr.status <300) { const r = JSON.parse(xhr.responseText||'{}'); if (r && r.avatar) { if (avatarImg) avatarImg.src = r.avatar; if (avatarLarge) avatarLarge.src = r.avatar; } alert('Avatar actualizado'); modal.style.display='none'; } else { const rr = JSON.parse(xhr.responseText||'{}'); alert((rr && rr.error) ? rr.error : 'Error'); } progressWrap.style.display='none'; };
              xhr.onerror=()=>{ alert('Error subiendo'); progressWrap.style.display='none'; };
              xhr.send(fd);
            });
          } catch (e) { console.warn('open avatar picker failed', e); window.location.href = '/profile'; }
        });
      }

      // Cargar burbujas de mensajes (si existen) dentro del panel - usar helper
      try { await refreshPanelBubbles(); } catch (e) { console.warn('panel bubbles load error', e); }
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
    // ensure the profile panel is on top of other floating UI (chat drawer, mini chats)
    try { const chatDrawerEl = document.getElementById('chatDrawer'); if (chatDrawerEl) chatDrawerEl.style.zIndex = '9999'; profilePanel.style.zIndex = '1000000'; } catch(e){}
    profilePanel.classList.remove('hidden'); profilePanel.setAttribute('aria-hidden','false');
    // cuando se abre el panel, asegurar que las burbujas se muestren (y ocultar chat si era visible)
    try { const pc = document.getElementById('panelChat'); if (pc) pc.style.display = 'none'; const pb = document.getElementById('panelInboxBubbles'); if (pb) pb.style.display = 'flex'; } catch(e){}
    // empezar polling de las burbujas mientras el panel esté abierto
    try { await refreshPanelBubbles(); startPanelBubblePoll(); } catch(e) { console.warn('panel open refresh failed', e); }
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
      try { stopPanelBubblePoll(); } catch(e){}
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

  // ---- Funcionalidad de chat dentro del panel ----
  let panelChatPoll = null;
  let panelBubblePoll = null;
  let panelBubblesInFlight = false;
  async function openPanelChat(withId, title) {
    try {
      // esconder bandeja y mostrar chat
      const panelInboxEl = document.getElementById('panelInboxBubbles');
      const panelChat = document.getElementById('panelChat');
      const panelTitle = document.getElementById('panelChatTitle');
      const panelBody = document.getElementById('panelChatBody');
      const input = document.getElementById('panelChatInput');
      const sendBtn = document.getElementById('panelChatSend');
      const backBtn = document.getElementById('panelBackToInbox');
      const closeBtn = document.getElementById('panelCloseChat');
      if (!panelChat || !panelBody) return;
      if (panelInboxEl) panelInboxEl.style.display = 'none';
      panelChat.style.display = 'block';
      if (panelTitle) panelTitle.textContent = title || 'Chat';

      // helper to render messages
      function renderPanelMessages(messages) {
        if (!panelBody) return;
        panelBody.innerHTML = '';
        messages.forEach(m => {
          const me = String(m.sender_id) === String(window.currentUserId || '');
          const el = document.createElement('div');
          el.style.display = 'flex';
          el.style.justifyContent = me ? 'flex-end' : 'flex-start';
          el.innerHTML = `<div style="max-width:80%;padding:8px;border-radius:8px;background:${me ? 'linear-gradient(90deg,#0ea5a0,#06b6d4)' : 'rgba(0,0,0,0.06)'};color:${me ? '#fff':'var(--text)'}">${escapeHtml(m.content)}<div style="font-size:10px;margin-top:6px;opacity:0.7;text-align:right">${(new Date(m.created_at)).toLocaleString()}</div></div>`;
          panelBody.appendChild(el);
        });
        panelBody.scrollTop = panelBody.scrollHeight;
      }

      // load conversation once then enable polling
      async function loadPanelConversation() {
        try {
          const res = await fetch(`${API_BASE}/api/messages/conversation/${withId}`, { credentials: 'include' });
          if (!res.ok) return;
          const j = await res.json();
          const msgs = j.data || [];
          renderPanelMessages(msgs);
          // refrescar bandeja y badge (el endpoint de conversation ya marca como leido en servidor)
          try { await refreshPanelBubbles(); await refreshUnreadBadge(); } catch (e) { /* ignore */ }
        } catch (e) { console.error('openPanelChat load error', e); }
      }

      // start polling
      function startPanelPoll() {
        stopPanelPoll();
        panelChatPoll = setInterval(loadPanelConversation, 2500);
      }
      function stopPanelPoll() { if (panelChatPoll) { clearInterval(panelChatPoll); panelChatPoll = null; } }

      // wire send
      async function sendPanelMessage() {
        const text = input && input.value && input.value.trim();
        if (!text) return;
        try {
          const res = await fetch(`${API_BASE}/api/messages/send`, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ to: withId, content: text }) });
          if (!res.ok) { const j = await res.json().catch(()=>null); alert((j && j.error) ? j.error : 'Error enviando'); return; }
          input.value = '';
          await loadPanelConversation();
        } catch (e) { console.error('panel send error', e); }
      }

      // attach handlers
      if (sendBtn) { sendBtn.onclick = sendPanelMessage; }
      if (input) { input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); sendPanelMessage(); } }; }
      if (backBtn) backBtn.onclick = () => { // volver a burbujas
        if (panelChat) panelChat.style.display = 'none'; if (panelInboxEl) panelInboxEl.style.display = 'flex'; stopPanelPoll();
      };
      if (closeBtn) closeBtn.onclick = () => { if (profilePanel) { profilePanel.classList.add('hidden'); profilePanel.setAttribute('aria-hidden','true'); } stopPanelPoll(); };

      await loadPanelConversation();
      startPanelPoll();
    } catch (e) { console.error('openPanelChat error', e); }
  }

  // Refresh helpers
  async function refreshUnreadBadge() {
    try {
      const badge = document.getElementById('avatarBadge');
      const r = await fetch(`${API_BASE}/api/messages/unread_count`, { credentials: 'include' });
      if (!r.ok) return;
      const j = await r.json();
      if (j && typeof j.count !== 'undefined') {
        if (j.count > 0) { if (badge) { badge.style.display='flex'; badge.textContent = String(j.count); } }
        else { if (badge) badge.style.display='none'; }
      }
    } catch (e) { /* ignore */ }
  }

  async function refreshPanelInbox() {
    try {
      const panelInbox = document.getElementById('panelInbox');
      if (!panelInbox) return;
      const inboxRes = await fetch(`${API_BASE}/api/messages/inbox`, { credentials: 'include' });
      if (!inboxRes.ok) { panelInbox.innerHTML = '<div class="muted">No fue posible cargar la bandeja</div>'; return; }
      const j = await inboxRes.json();
      const rows = j.data || [];
      if (!rows.length) { panelInbox.innerHTML = '<div class="muted">No tienes mensajes</div>'; return; }
      // rows have { sender_id, user, unread, last_message }
      const nodes = rows.map(r => {
        const u = r.user || { id: r.sender_id };
        const unread = r.unread || 0;
        const last = r.last_message || {};
        const avatar = (u && u.avatar_url) ? u.avatar_url : '/imagen/default-avatar.png';
        const name = u.full_name || u.email || ('Usuario ' + (u.id || r.sender_id));
        return `<div class="panel-inbox-item" data-sender="${r.sender_id}" style="display:flex;align-items:center;gap:8px;padding:6px;border-bottom:1px solid rgba(0,0,0,0.06);cursor:pointer;background:${unread>0 ? 'linear-gradient(90deg, rgba(225,29,72,0.06), transparent)' : 'transparent'}"><img src='${avatar}' style='width:36px;height:36px;border-radius:999px;object-fit:cover' /><div style='flex:1'><div style='display:flex;justify-content:space-between;align-items:center'><div style='font-weight:600'>${escapeHtml(name)}</div>${unread>0?`<div style='background:#e11d48;color:#fff;border-radius:999px;padding:2px 8px;font-size:12px'>${unread}</div>`:''}</div><div style='font-size:12px;color:var(--muted);max-height:36px;overflow:hidden'>${escapeHtml(last.content || '')}</div></div></div>`;
      }).join('');
      panelInbox.innerHTML = nodes;
      panelInbox.querySelectorAll('.panel-inbox-item').forEach(n => n.addEventListener('click', async () => {
        const sid = n.getAttribute('data-sender'); if (!sid) return; openGlobalChat(sid, 'Usuario ' + sid);
      }));
    } catch (e) { console.error('refreshPanelInbox error', e); }
  }

  // ---- New: show compact chat bubbles for unread senders in the profile panel ----
  async function refreshPanelBubbles() {
    const container = document.getElementById('panelInboxBubbles');
    if (!container) return;
    if (panelBubblesInFlight) return;
    panelBubblesInFlight = true;
    try {
      container.innerHTML = '<div class="muted panel-bubbles-empty">Cargando mensajes...</div>';
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 7000);
      console.debug('[debug] refreshPanelBubbles -> requesting /api/messages/inbox');
      const res = await fetch(`${API_BASE}/api/messages/inbox`, { credentials: 'include', signal: controller.signal });
      clearTimeout(t);
      console.debug('[debug] refreshPanelBubbles -> status', res.status);
      if (!res.ok) { container.innerHTML = ''; return; }
      let j = null;
      try { j = await res.json(); } catch (e) { console.debug('[debug] refreshPanelBubbles invalid json', e); container.innerHTML = ''; return; }
      const rows = (j && j.data) ? (j.data || []) : [];
      // only show senders with unread > 0
      const unread = (rows || []).filter(r => (r.unread || 0) > 0);
      if (!unread.length) { container.innerHTML = ''; return; }
      // render bubble buttons
      container.innerHTML = '';
      unread.forEach(r => {
        const u = r.user || { id: r.sender_id };
        const avatar = (u && u.avatar_url) ? u.avatar_url : '/imagen/default-avatar.png';
        const name = u.full_name || u.email || ('Usuario ' + (u.id || r.sender_id));
        const btn = document.createElement('button');
        btn.className = 'panel-chat-bubble';
        btn.title = `Abrir chat con ${name}`;
        btn.setAttribute('data-sender', String(r.sender_id));
        btn.innerHTML = `<img src="${avatar}" alt="${escapeHtml(name)}" /><div class=\"bubble-unread\">${r.unread}</div>`;
          btn.addEventListener('click', () => {
            // open a mini chat window instead of the large drawer
            openMiniChat(r.sender_id, name, avatar);
          });
        container.appendChild(btn);
      });
    } catch (e) {
      console.error('refreshPanelBubbles error', e);
      container.innerHTML = '';
    } finally { panelBubblesInFlight = false; }
  }

  function startPanelBubblePoll() { try { stopPanelBubblePoll(); panelBubblePoll = setInterval(() => { try { refreshPanelBubbles(); } catch(e){} }, 9000); } catch(e){} }
  function stopPanelBubblePoll() { try { if (panelBubblePoll) { clearInterval(panelBubblePoll); panelBubblePoll = null; } } catch(e){} }

  // Cargar perfil al iniciar
  loadUserProfile();

  // Poll unread badge every 8s
  setInterval(() => { try { refreshUnreadBadge(); } catch(e) {} }, 8000);

  // Side floating bubbles for incoming/unread conversations
  // helper: escape HTML content for safe insertion into innerHTML
  function escapeHtml(s){ return String(s||'').replace(/[&<>"]+/g, (c)=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
  let sideBubblesPoll = null;
  let sideContainer = document.getElementById('sideChatBubbles');
  // if the template didn't include the container for any reason, create it dynamically
  if (!sideContainer) {
    console.debug('[debug] sideChatBubbles container not found in DOM, creating dynamically');
    try {
      sideContainer = document.createElement('div');
      sideContainer.id = 'sideChatBubbles';
      sideContainer.style.position = 'fixed';
      sideContainer.style.right = '12px';
      sideContainer.style.top = '40%';
      sideContainer.style.display = 'flex';
      sideContainer.style.flexDirection = 'column';
      sideContainer.style.gap = '10px';
      sideContainer.style.zIndex = '99999';
      sideContainer.style.pointerEvents = 'auto';
      document.body.appendChild(sideContainer);
    } catch (e) { console.warn('[debug] could not create sideChatBubbles container', e); }
  }

  // track bubbles user closed manually so polling doesn't recreate them
  // store as map { userId: timestampMs }
  function loadClosedBubbles() {
    try { const raw = localStorage.getItem('closedSideBubbles'); if (!raw) return {}; return JSON.parse(raw) || {}; } catch(e){ return {}; }
  }
  function saveClosedBubbles(map) { try { localStorage.setItem('closedSideBubbles', JSON.stringify(map || {})); } catch(e){} }

  // track bubbles the user intentionally kept open so they persist across reloads
  // store as map { userId: { id, full_name, email, avatar_url, ts } }
  function loadOpenBubbles() {
    try { const raw = localStorage.getItem('openSideBubbles'); if (!raw) return {}; return JSON.parse(raw) || {}; } catch(e){ return {}; }
  }
  function saveOpenBubbles(map) { try { localStorage.setItem('openSideBubbles', JSON.stringify(map || {})); } catch(e){} }

  function createSideBubble(owner) {
    const closed = loadClosedBubbles();
    console.debug('[debug] createSideBubble; owner.id=', owner.id, 'closedMap=', closed);
    if (!sideContainer || !owner) return null;
    const existing = sideContainer.querySelector(`[data-sender="${owner.id}"]`);
    if (existing) { console.debug('[debug] createSideBubble existing element found for', owner.id); return existing; }
    // use a DIV wrapper so the close button can be an interactive element inside
    const btn = document.createElement('div');
    btn.className = 'side-bubble';
    btn.setAttribute('data-sender', owner.id);
    btn.style.cursor = 'pointer';
    btn.title = `Abrir chat con ${owner.full_name || owner.email || owner.id}`;
    const img = document.createElement('img');
    img.src = owner.avatar_url || '/imagen/default-avatar.png';
    img.alt = owner.full_name || owner.email || owner.id;
    btn.appendChild(img);
    const badge = document.createElement('div'); badge.className = 'side-unread'; badge.style.display = 'none';
    btn.appendChild(badge);
    // close 'x' button to remove bubble permanently
    const closeX = document.createElement('button');
    closeX.className = 'side-close';
    closeX.style.position = 'absolute'; closeX.style.top = '-8px'; closeX.style.right = '-8px'; closeX.style.background = 'rgba(0,0,0,0.6)'; closeX.style.color = '#fff'; closeX.style.border = '0'; closeX.style.borderRadius = '999px'; closeX.style.width = '22px'; closeX.style.height = '22px'; closeX.style.display = 'flex'; closeX.style.alignItems = 'center'; closeX.style.justifyContent = 'center'; closeX.style.fontSize = '12px'; closeX.style.cursor = 'pointer'; closeX.title = 'Cerrar burbuja';
    closeX.textContent = '×';
    closeX.addEventListener('click', (ev) => {
      ev.stopPropagation();
      try { btn.remove(); } catch(e){}
      try {
        // mark as closed so polling doesn't recreate it unless a newer message arrives
        const closed = loadClosedBubbles(); closed[String(owner.id)] = Date.now(); saveClosedBubbles(closed);
      } catch(e){}
      try {
        // remove from the open map when explicitly closed
        const open = loadOpenBubbles(); if (open && open[String(owner.id)]) { delete open[String(owner.id)]; saveOpenBubbles(open); }
      } catch(e){}
    });
    btn.appendChild(closeX);
    btn.addEventListener('click', async () => {
      console.debug('[debug] side bubble click handler start (owner.id=)', owner.id);
      console.debug('[debug] side bubble clicked -> owner.id=', owner.id);
      // close any mini-chat for the same user to avoid duplicates
      try { closeMiniChat(owner.id); } catch(e){}
      // mark active bubble and remove active from others
      try { sideContainer.querySelectorAll('.side-bubble.active').forEach(b => b.classList.remove('active')); btn.classList.add('active'); } catch(e){}
      try {
        // clicking a bubble means the user wants it open; save to openSideBubbles
        const open = loadOpenBubbles(); open[String(owner.id)] = { id: owner.id, full_name: owner.full_name || owner.email || null, avatar_url: owner.avatar_url || null, ts: Date.now() }; saveOpenBubbles(open);
        // if user had previously closed this bubble, remove that closed marker
        const closed = loadClosedBubbles(); if (closed && closed[String(owner.id)]) { delete closed[String(owner.id)]; saveClosedBubbles(closed); }
      } catch(e){}
      // prefer the profile-panel chat if available (this is the same place 'Mensaje' on profile opens)
      console.debug('[debug] opening chat from side bubble id=', owner.id);
      try {
        // Always open the global chat drawer with the conversation for this user.
        // Using the global drawer ensures the same chat UI that shows messages from the profile 'Mensaje' button.
        await openGlobalChat(owner.id, owner.full_name || owner.email || ('Usuario ' + owner.id));
      } catch (e) {
        console.warn('[debug] error opening global chat from side bubble', e);
      }
      console.debug('[debug] side bubble click handler done (owner.id=)', owner.id);
      try { const ci = document.getElementById('chatInput'); if (ci) { ci.focus(); } } catch(e){}
    });
    // add to container
    sideContainer.appendChild(btn);
    // persist this bubble as open so it survives page reloads
    try { const open = loadOpenBubbles(); open[String(owner.id)] = { id: owner.id, full_name: owner.full_name || owner.email || null, avatar_url: owner.avatar_url || null, ts: Date.now() }; saveOpenBubbles(open); } catch(e){}
    return btn;
  }

  function updateSideBubbleCount(userId, count) {
    if (!sideContainer) return;
    const el = sideContainer.querySelector(`[data-sender="${userId}"]`);
    if (!el) return;
    const badge = el.querySelector('.side-unread');
    if (!badge) return;
    if (count && count > 0) {
      badge.textContent = String(count);
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  async function refreshSideBubbles() {
    if (!sideContainer) return;
    try {
      console.debug('[debug] refreshSideBubbles -> fetching inbox');
      // reuse inbox endpoint which returns grouped senders with unread counts
      const res = await fetch(`${API_BASE}/api/messages/inbox`, { credentials: 'include' });
      console.debug('[debug] refreshSideBubbles -> inbox status', res.status);
      if (!res.ok) return;
      const j = await res.json().catch(()=>null);
      console.debug('[debug] refreshSideBubbles -> inbox payload', j && (j.data || []).map(r=>({sender: r.sender_id, unread: r.unread})) );
      const rows = (j && j.data) ? (j.data || []) : [];
      // First, ensure all bubbles the user previously opened persist across reloads
      try {
        const open = loadOpenBubbles();
        Object.keys(open || {}).forEach(k => {
          try {
            const owner = open[k];
            if (!owner) return;
            // owner may be minimal; create bubble using stored info
            const dummy = { id: owner.id, full_name: owner.full_name, email: owner.email, avatar_url: owner.avatar_url };
            const el = createSideBubble(dummy);
            // if we stored an unread count earlier it will be patched when inbox rows are processed
            if (el) updateSideBubbleCount(owner.id, 0);
          } catch(e){}
        });
      } catch(e){}

      // for each sender with unread > 0 ensure a side bubble exists and show count
      rows.forEach(r => {
        if (!r || !(r.unread && r.unread > 0)) return; // only show bubbles for senders with unread messages
        const u = (r && r.user) ? r.user : { id: r.sender_id };
        if (!u || !r) return;
        console.debug('[debug] refreshSideBubbles row:', u.id, 'unread=', r.unread);
        // create or update (keep bubbles persistent). If user previously closed the bubble
        // only recreate it when there is a newer message after the close timestamp.
        try {
          const closed = loadClosedBubbles();
          const lastMsg = (r && r.last_message && r.last_message.created_at) ? new Date(r.last_message.created_at).getTime() : 0;
          const closedTs = closed[String(u.id)] || 0;
          // If the owner is currently manually opened by user, skip closed logic — keep it
          const openMap = loadOpenBubbles();
          const isManuallyOpen = !!(openMap && openMap[String(u.id)]);
          if (!isManuallyOpen && closedTs && lastMsg && lastMsg <= closedTs) {
            // user closed after last message, don't recreate; but update badge if element exists
            const existing = sideContainer.querySelector(`[data-sender="${u.id}"]`);
            if (existing) updateSideBubbleCount(u.id, r.unread || 0);
            return;
          }
          const el = createSideBubble(u);
          if (!el) return; // creation prevented
          updateSideBubbleCount(u.id, r.unread || 0);
          // make sure it's persisted as open so it survives reloads
          try { const open = loadOpenBubbles(); open[String(u.id)] = { id: u.id, full_name: u.full_name, avatar_url: u.avatar_url, ts: Date.now() }; saveOpenBubbles(open); } catch(e){}
        } catch (ex) { console.error('refreshSideBubbles closed-check error', ex); }
      });
    } catch (e) { console.error('refreshSideBubbles error', e); }
  }

  function startSideBubblesPoll() { try { stopSideBubblesPoll(); refreshSideBubbles(); sideBubblesPoll = setInterval(() => { try { refreshSideBubbles(); } catch(e){} }, 7000); } catch(e){} }
  function stopSideBubblesPoll() { try { if (sideBubblesPoll) { clearInterval(sideBubblesPoll); sideBubblesPoll = null; } } catch(e){} }

  // start polling immediately (so the UI shows bubbles when messages exist)
  try { startSideBubblesPoll(); } catch(e) { /* ignore */ }

  // ---- Global bottom chat drawer (used from panel inbox) ----
  let gpoll = null;
  const gchatDrawer = document.getElementById('chatDrawer');
  const gchatBody = document.getElementById('chatBody');
  const gchatTitle = document.getElementById('chatTitle');
  const gchatInput = document.getElementById('chatInput');
  const gchatSend = document.getElementById('chatSend');
  const gchatClose = document.getElementById('chatClose');

  function renderGMessages(messages) {
    if (!gchatBody) return;
    gchatBody.innerHTML = '';
    messages.forEach(m => {
      const me = (String(m.sender_id) === String(window.currentUserId || ''));
      const el = document.createElement('div');
      el.style.display = 'flex'; el.style.justifyContent = me ? 'flex-end' : 'flex-start';
      el.innerHTML = `<div style="max-width:78%;padding:6px;border-radius:8px;background:${me ? 'linear-gradient(90deg,#0ea5a0,#06b6d4)' : 'rgba(0,0,0,0.06)'};color:${me ? '#fff' : 'var(--text)'}">${escapeHtml(m.content)}<div style="font-size:10px;margin-top:6px;opacity:0.7;text-align:right">${(new Date(m.created_at)).toLocaleString()}</div></div>`;
      gchatBody.appendChild(el);
    });
    gchatBody.scrollTop = gchatBody.scrollHeight;
  }

  async function loadGConversation(withId) {
    if (!withId) return;
    try {
      console.debug('[debug] loadGConversation called with id=', withId);
      const res = await fetch(`${API_BASE}/api/messages/conversation/${withId}`, { credentials: 'include' });
      if (!res.ok) return;
      const j = await res.json();
      const msgs = j.data || [];
      console.debug('[debug] loadGConversation returned', msgs.length, 'messages for id=', withId);
      renderGMessages(msgs);
    } catch (e) { console.error('loadGConversation', e); }
  }

  async function openGlobalChat(withId, title) {
    if (!window.currentUserId) { alert('Necesitas iniciar sesión para enviar mensajes'); return; }
    if (!gchatDrawer) return;
    // hide any mini-chat windows and profile popover so the global drawer is clearly visible
    try { if (miniChatContainer) miniChatContainer.style.display = 'none'; } catch(e){}
    try { if (profilePanel) { profilePanel.classList.add('hidden'); profilePanel.setAttribute('aria-hidden','true'); profilePanel.style.display = 'none'; profilePanel.style.visibility = 'hidden'; } } catch(e){}
    try { const pc = document.getElementById('panelChat'); if (pc) { pc.style.display = 'none'; pc.style.visibility = 'hidden'; } } catch(e){}
    // make sure the global drawer is on top so it's clearly visible
    try { if (gchatDrawer) { gchatDrawer.style.zIndex = '999999'; } } catch(e){}
    // set title
    if (gchatTitle) gchatTitle.textContent = title || 'Chat';
    gchatDrawer.style.display = 'flex';
    // load and start polling
    await loadGConversation(withId);
    try { await refreshPanelBubbles(); await refreshUnreadBadge(); } catch(e){}
    stopGPoll(); gpoll = setInterval(()=> loadGConversation(withId), 2500);
    // attach send
    if (gchatSend) {
      gchatSend.onclick = async () => {
        const text = gchatInput && gchatInput.value && gchatInput.value.trim();
        if (!text) return;
        try {
          const res = await fetch(`${API_BASE}/api/messages/send`, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ to: withId, content: text }) });
          if (!res.ok) { const j = await res.json().catch(()=>null); alert((j && j.error) ? j.error : 'Error enviando'); return; }
          if (gchatInput) gchatInput.value = '';
          await loadGConversation(withId);
        } catch (e) { console.error('sendGlobalChatError', e); }
      };
    }
    if (gchatInput) gchatInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (gchatSend) gchatSend.click(); } };
    if (gchatClose) gchatClose.onclick = () => { gchatDrawer.style.display = 'none'; stopGPoll(); try { if (miniChatContainer) miniChatContainer.style.display = 'flex'; } catch(e){} try { if (sideContainer) sideContainer.querySelectorAll('.side-bubble.active').forEach(b=>b.classList.remove('active')); } catch(e){} };
  }

  function stopGPoll(){ if (gpoll) { clearInterval(gpoll); gpoll = null; } }

  // ---- Lightbox / view modal ----

  // ---- Mini chat windows (Facebook-like) ----
  const miniChatContainer = (() => {
    let el = document.getElementById('miniChatContainer');
    if (!el) {
      el = document.createElement('div');
      el.id = 'miniChatContainer';
      el.style.position = 'fixed';
      el.style.right = '16px';
      el.style.bottom = '16px';
      el.style.display = 'flex';
      el.style.gap = '8px';
      el.style.alignItems = 'flex-end';
      el.style.zIndex = 99999;
      document.body.appendChild(el);
    }
    return el;
  })();

  const miniChats = {}; // keyed by userId

  async function openMiniChat(withId, title, avatarUrl) {
    if (!withId) return;
    const sid = String(withId);
    // if exists, bring to front
    if (miniChats[sid] && miniChats[sid].el) {
      miniChats[sid].el.style.display = 'flex';
      // refresh messages
      await loadMiniConversation(withId);
      return;
    }

    // create element
    const el = document.createElement('div');
    el.className = 'mini-chat';
    el.setAttribute('data-sender', sid);
    el.style.display = 'flex';
    el.style.flexDirection = 'column';
    el.style.width = '320px';
    el.style.maxWidth = 'calc(100vw - 40px)';
    el.style.height = '380px';
    el.style.background = 'var(--bg)';
    el.style.color = 'var(--text)';
    el.style.borderRadius = '12px';
    el.style.boxShadow = '0 16px 56px rgba(0,0,0,0.3)';
    el.style.overflow = 'hidden';

    const header = document.createElement('div');
    header.className = 'mini-chat-header';
    header.style.display = 'flex'; header.style.alignItems = 'center'; header.style.justifyContent = 'space-between'; header.style.padding = '8px'; header.style.borderBottom = '1px solid rgba(0,0,0,0.06)';
    const left = document.createElement('div'); left.style.display = 'flex'; left.style.alignItems = 'center'; left.style.gap = '8px';
    const aimg = document.createElement('img'); aimg.src = avatarUrl || '/imagen/default-avatar.png'; aimg.style.width='32px'; aimg.style.height='32px'; aimg.style.borderRadius='999px'; aimg.style.objectFit='cover'; aimg.style.border='2px solid rgba(255,255,255,0.6)';
    const nameEl = document.createElement('div'); nameEl.style.fontWeight='700'; nameEl.style.fontSize='13px'; nameEl.textContent = title || ('Usuario ' + sid);
    left.appendChild(aimg); left.appendChild(nameEl);

    const right = document.createElement('div'); right.style.display='flex'; right.style.gap='6px';
    const minimizeBtn = document.createElement('button'); minimizeBtn.className='btn'; minimizeBtn.textContent='—'; minimizeBtn.title='Minimizar'; minimizeBtn.style.padding='6px'; minimizeBtn.onclick = () => { el.style.display = 'none'; };
    const closeBtn = document.createElement('button'); closeBtn.className='btn'; closeBtn.textContent='×'; closeBtn.title='Cerrar'; closeBtn.style.padding='6px'; closeBtn.onclick = () => { closeMiniChat(sid); };
    right.appendChild(minimizeBtn); right.appendChild(closeBtn);

    header.appendChild(left); header.appendChild(right);

    const body = document.createElement('div'); body.className='mini-chat-body'; body.style.flex='1'; body.style.padding='8px'; body.style.overflow='auto'; body.style.display='flex'; body.style.flexDirection='column'; body.style.gap='8px';

    const inputBar = document.createElement('div'); inputBar.style.display='flex'; inputBar.style.gap='8px'; inputBar.style.padding='8px'; inputBar.style.borderTop='1px solid rgba(0,0,0,0.06)';
    const input = document.createElement('input'); input.type='text'; input.placeholder='Escribe un mensaje...'; input.style.flex='1'; input.style.padding='8px'; input.style.border='1px solid var(--border)'; input.style.borderRadius='8px'; input.style.background='transparent'; input.style.color='inherit';
    const send = document.createElement('button'); send.className='btn btn-primary'; send.textContent='Enviar'; send.style.flex='0 0 auto';
    inputBar.appendChild(input); inputBar.appendChild(send);

    el.appendChild(header); el.appendChild(body); el.appendChild(inputBar);
    miniChatContainer.appendChild(el);

    // register chat
    miniChats[sid] = { el, body, input, send, poll: null };

    // wire send
    send.onclick = async () => { const txt = input.value && input.value.trim(); if (!txt) return; try { const res = await fetch(`${API_BASE}/api/messages/send`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ to: withId, content: txt }) }); if (!res.ok) { const j = await res.json().catch(()=>null); alert((j&&j.error)?j.error:'Error enviando'); return; } input.value=''; await loadMiniConversation(withId); await refreshPanelBubbles(); await refreshUnreadBadge(); } catch(e){ console.error('mini send error', e); } };
    input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); send.click(); } };

    // load conversation and start polling
    await loadMiniConversation(withId);
    startMiniPoll(withId);
  }

  function closeMiniChat(id) {
    const sid = String(id);
    const c = miniChats[sid];
    if (!c) return;
    try { if (c.poll) clearInterval(c.poll); } catch(e){}
    try { c.el.remove(); } catch(e){}
    delete miniChats[sid];
  }

  async function loadMiniConversation(withId) {
    const sid = String(withId);
    const c = miniChats[sid];
    if (!c) return;
    try {
      const res = await fetch(`${API_BASE}/api/messages/conversation/${withId}`, { credentials: 'include' });
      if (!res.ok) return;
      const j = await res.json();
      const msgs = j.data || [];
      // render messages
      c.body.innerHTML = '';
      msgs.forEach(m => {
        const me = String(m.sender_id) === String(window.currentUserId || '');
        const mEl = document.createElement('div');
        mEl.style.display='flex'; mEl.style.justifyContent = me ? 'flex-end' : 'flex-start';
        mEl.innerHTML = `<div style="max-width:78%;padding:8px;border-radius:8px;background:${me ? 'linear-gradient(90deg,#0ea5a0,#06b6d4)' : 'rgba(0,0,0,0.06)'};color:${me ? '#fff':'var(--text)'}">${escapeHtml(m.content)}<div style=\"font-size:10px;margin-top:6px;opacity:0.7;text-align:right\">${(new Date(m.created_at)).toLocaleString()}</div></div>`;
        c.body.appendChild(mEl);
      });
      c.body.scrollTop = c.body.scrollHeight;
    } catch (e) { console.error('loadMiniConversation error', e); }
  }

  function startMiniPoll(withId) {
    const sid = String(withId);
    const c = miniChats[sid];
    if (!c) return;
    try { if (c.poll) clearInterval(c.poll); c.poll = setInterval(() => loadMiniConversation(withId), 2500); } catch (e) { console.error('startMiniPoll error', e); }
  }
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
