const API_BASE = (typeof window !== 'undefined' && window.API_BASE) ? window.API_BASE : ''; // Si front y backend están en el mismo servidor

// Version stamp para confirmar que el cliente cargó la versión actual del archivo
try { console.log('app.js loaded - ts:' + (new Date()).toISOString()); } catch (e) {}

// Asegurar que las solicitudes para abrir el panel de chat se capturen
// incluso si se disparan antes de que `DOMContentLoaded` registre los handlers.
if (typeof window !== 'undefined') {
  window.__openPanelChatRequests = window.__openPanelChatRequests || [];
  // stub provisional que encola llamadas directas a openPanelChat antes de que la
  // implementación real esté disponible dentro de DOMContentLoaded.
  if (typeof window.openPanelChat !== 'function') {
    window.openPanelChat = function(id, title) {
      try { window.__openPanelChatRequests.push({ id: id, title: title }); } catch (e) {}
    };
  }
  // Listener pasivo para capturar eventos `openPanelChatRequest` que se disparen
  // antes de que el script principal haya terminado de inicializarse.
  window.addEventListener('openPanelChatRequest', function(ev) {
    try {
      const d = ev && ev.detail ? ev.detail : null;
      if (d && d.id) window.__openPanelChatRequests.push(d);
    } catch (e) {}
  });
}

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
      console.log('Tab click -> currentCategory set to:', currentCategory);
      if (listTitle) listTitle.textContent = currentCategory ? `Categoría: ${currentCategory}` : 'Todas las fotos';
      fetchPhotos({ force: true });
    });
  }

  // (debug button removed in production UI)

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

  async function fetchPhotos(opts = {}) {
    if (!gallery) return;
    const force = !!opts.force;
    if (force) {
      try { gallery.innerHTML = ''; } catch (e) {}
      renderSkeletons(6);
    } else {
      if (!gallery.children.length) renderSkeletons(6);
    }
    const url = currentCategory ? `${API_BASE}/api/photos?category=${encodeURIComponent(currentCategory)}`
                                : `${API_BASE}/api/photos`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        console.error('Error al obtener fotos, status:', res.status);
        removeSkeletons();
        return;
      }
      const data = await res.json();
      if (!Array.isArray(data)) {
        console.warn('Respuesta inesperada al obtener fotos:', data);
        removeSkeletons();
        return;
      }
      console.log('Fotos recibidas (raw):', data);
      // Filtrar por categoría en cliente por seguridad (case-insensitive)
      let filtered = data;
      if (currentCategory) {
        const cc = String(currentCategory || '').toLowerCase();
        filtered = (data || []).filter(d => String(d.category || '').toLowerCase() === cc);
      }
      console.log('Fotos tras filtro cliente (category=', currentCategory, '):', filtered.length);
      // actualizar estado local
      photosData = filtered;
      // Mostrar contador en el título para feedback inmediato
      try {
        if (listTitle) {
          const count = (photosData || []).length;
          listTitle.textContent = currentCategory ? `Categoría: ${currentCategory} (${count} fotos)` : `Todas las fotos (${count})`;
        }
      } catch (e) {}
      // Construir mapa de elementos existentes en DOM por id (incluye grupos)
      const existingMap = new Map();
      gallery.querySelectorAll('[data-photo-id]').forEach(el => { existingMap.set(String(el.dataset.photoId), el); });
      gallery.querySelectorAll('[data-photo-ids]').forEach(el => {
        const ids = (el.dataset.photoIds || '').split(',').map(s=>s.trim()).filter(Boolean);
        ids.forEach(id => { if (!existingMap.has(String(id))) existingMap.set(String(id), el); });
      });
      // Usar los ids de las fotos ya filtradas para decidir qué eliminar del DOM
      const newIds = new Set((photosData||[]).map(d => String(d.id)));
      // Remover elementos que ya no existen en el servidor
      const toRemove = [];
      existingMap.forEach((el, id) => {
        if (!newIds.has(String(id))) toRemove.push({ id, el });
      });
      // Siempre eliminar elementos que ya no están en el servidor para mantener las categorías sincronizadas.
      if (toRemove.length > 0) {
        toRemove.forEach(r => { try { r.el.remove(); } catch(e){} });
      }
      // limpiar esqueletos si existían
      removeSkeletons();
      // Agrupar elementos contiguos que pertenecen a la misma subida (misma title, date_taken y category)
      const groups = [];
      let i = 0;
      while (i < photosData.length) {
        const base = photosData[i];
        let group = [base];
        let j = i + 1;
        while (j < photosData.length && photosData[j].title === base.title && photosData[j].date_taken === base.date_taken && photosData[j].category === base.category) {
          group.push(photosData[j]);
          j++;
        }
        if (group.length > 1) groups.push({ type: 'group', items: group, startIndex: i });
        else groups.push({ type: 'single', item: base, index: i });
        i = j;
      }
      // Renderizar grupos: si se fuerza, renderizar todo de cero; si no, añadir solo los nuevos
      if (force) {
        try { gallery.innerHTML = ''; } catch(e){}
        groups.forEach(g => { if (g.type === 'group') renderGroup(g.items, g.startIndex); else renderCard(g.item, g.index); });
      } else {
        groups.forEach(g => {
          try {
            if (g.type === 'group') {
              const firstId = String(g.items[0].id);
              const existsAsSingle = !!gallery.querySelector(`[data-photo-id="${firstId}"]`);
              const existsAsGroup = Array.from(gallery.querySelectorAll('[data-photo-ids]')).some(n=> (n.dataset.photoIds||'').split(',').includes(firstId));
              if (!existsAsSingle && !existsAsGroup) renderGroup(g.items, g.startIndex);
            } else {
              const id = String(g.item.id);
              const exists = !!gallery.querySelector(`[data-photo-id="${id}"]`) || Array.from(gallery.querySelectorAll('[data-photo-ids]')).some(n=> (n.dataset.photoIds||'').split(',').includes(id));
              if (!exists) renderCard(g.item, g.index);
            }
          } catch(e) { console.warn('render group diff error', e); }
        });
      }
      // Si no hay fotos para la categoría, mostrar mensaje amigable
      if ((!photosData || photosData.length === 0) && gallery) {
        const m = document.createElement('div');
        m.className = 'muted';
        m.style.padding = '24px';
        m.textContent = currentCategory ? `No hay fotos en la categoría ${currentCategory}` : 'No hay fotos';
        gallery.appendChild(m);
      }
    } catch (err) {
      console.error('Error fetchPhotos:', err);
      removeSkeletons();
    }
  }

  // Renderiza un grupo de imágenes/vídeos como un mosaico dentro de una tarjeta
  function renderGroup(items, startIndex, opts = {}) {
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

    // Mostrar exactamente 3 miniaturas; la cuarta casilla es '+N más' si hay más de 3 elementos
    const visible = items.slice(0, 3);
    visible.forEach((it, idx) => {
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
        t.loading = 'lazy';
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

    // Cuarta casilla: +N más (si aplica)
    const remaining = items.length - 3;
    const moreBox = document.createElement('div');
    moreBox.style.display = 'flex';
    moreBox.style.alignItems = 'center';
    moreBox.style.justifyContent = 'center';
    moreBox.style.background = 'rgba(0,0,0,0.06)';
    moreBox.style.height = '120px';
    moreBox.style.borderRadius = '8px';
    moreBox.style.fontWeight = '700';
    moreBox.style.color = 'var(--muted)';
    if (remaining > 0) {
      moreBox.textContent = `+${remaining} más`;
    } else {
      moreBox.textContent = '';
    }
    moreBox.className = 'group-more-box';
    moreBox.style.cursor = 'pointer';
    moreBox.addEventListener('click', () => {
      // abrir la vista con el primer elemento del grupo; desde ahí se puede navegar por todas
      if (items && items[0]) openView(items[0], startIndex || 0);
    });
    thumbWrapper.appendChild(moreBox);

    if (body) body.insertBefore(thumbWrapper, body.firstChild);

    const titleEl = node.querySelector('.card-title');
    if (titleEl) titleEl.textContent = items[0].title || 'Álbum';
    const desc = node.querySelector('.card-desc');
    if (desc) desc.textContent = items[0].description || '';
    const dateEl = node.querySelector('.card-date');
    if (dateEl) dateEl.textContent = items[0].date_taken ? `Fecha: ${items[0].date_taken}` : '';
    const cat = node.querySelector('.card-cat');
    if (cat) cat.textContent = items[0].category ? `Categoría: ${items[0].category}` : '';

    const actionsContainer = node.querySelector('.card-actions');
    try {
      const currentId = (typeof window.currentUserId !== 'undefined' && window.currentUserId !== null) ? String(window.currentUserId) : (window.currentUser && window.currentUser.id ? String(window.currentUser.id) : null);
      const ownerId = (items[0] && items[0].uploader && items[0].uploader.id) ? String(items[0].uploader.id) : (items[0] && items[0].user_id ? String(items[0].user_id) : null);
      const isOwner = ownerId && currentId && ownerId === currentId;
      if (!actionsContainer) return;
      if (!isOwner) {
        // remove actions to non-owners
        actionsContainer.parentNode && actionsContainer.parentNode.removeChild(actionsContainer);
      } else {
        // wire up ellipsis menu inside actionsContainer (or create if missing)
        let ell = actionsContainer.querySelector('.card-ellipsis');
        let menu = actionsContainer.querySelector('.card-ellipsis-menu');
        let miEdit = actionsContainer.querySelector('.card-edit');
        let miDel = actionsContainer.querySelector('.card-delete');
        if (!ell || !menu) {
          // create compact menu
          actionsContainer.innerHTML = '';
          ell = document.createElement('button'); ell.className = 'card-ellipsis no-shimmer'; ell.type = 'button'; ell.title = 'Más acciones'; ell.innerHTML = '⋯';
          menu = document.createElement('div'); menu.className = 'card-ellipsis-menu hidden';
          miEdit = document.createElement('button'); miEdit.className = 'menu-item card-edit'; miEdit.type = 'button'; miEdit.textContent = 'Editar';
          miDel = document.createElement('button'); miDel.className = 'menu-item card-delete'; miDel.type = 'button'; miDel.textContent = 'Eliminar';
          menu.appendChild(miEdit); menu.appendChild(miDel);
          actionsContainer.appendChild(ell); actionsContainer.appendChild(menu);
        }
        // interactions
        ell.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); const isHidden = menu.classList.contains('hidden'); document.querySelectorAll('.card-ellipsis-menu').forEach(m=>m.classList.add('hidden')); if (isHidden) menu.classList.remove('hidden'); else menu.classList.add('hidden'); });
        miEdit && miEdit.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); menu.classList.add('hidden'); openEdit(items[0]); });
        miDel && miDel.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); menu.classList.add('hidden'); deletePhoto(items[0].id); });
        document.addEventListener('click', (ev) => { if (!menu.contains(ev.target) && !ell.contains(ev.target)) menu.classList.add('hidden'); });
      }
    } catch (e) { /* ignore ownership errors and keep safe defaults */ }

    // Mostrar uploader y reacciones como placa sobre la imagen (más atractiva)
    try {
      const cardEl = node.querySelector('.card');
      const uploader = items[0].uploader || null;
      const overlay = document.createElement('div');
      overlay.className = 'uploader-badge';
      // Left: avatar + name
      const left = document.createElement('div'); left.className = 'uploader-left';
      if (uploader) {
        const aimg = document.createElement('img'); aimg.src = uploader.avatar_url || '/imagen/default-avatar.png'; aimg.className = 'uploader-img';
        const aname = document.createElement('a'); aname.className = 'uploader-name'; aname.textContent = uploader.full_name || 'Usuario';
        aname.href = `/u/${uploader.id}`;
        aname.style.textDecoration = 'none';
        aname.style.cursor = 'pointer';
        aname.addEventListener('click', (ev) => { ev.stopPropagation(); /* avoid opening lightbox */ });
        left.appendChild(aimg); left.appendChild(aname);
      }
      overlay.appendChild(left);

      // Right: small reaction buttons
      const right = document.createElement('div'); right.className = 'uploader-right';
      const likes = document.createElement('button'); likes.className='like-btn small'; likes.textContent = `👍 ${items[0].reactions ? (items[0].reactions.likes||0) : 0}`;
      const dislikes = document.createElement('button'); dislikes.className='dislike-btn small'; dislikes.textContent = `👎 ${items[0].reactions ? (items[0].reactions.dislikes||0) : 0}`;
      likes.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        likes.disabled = true; dislikes.disabled = true;
        const ok = await sendReaction(items[0].id, 'like');
        if (!ok) { likes.disabled = false; dislikes.disabled = false; return; }
        const r = await fetchPhotoReactions(items[0].id);
        if (r) {
          likes.textContent = `👍 ${r.count_like || (r.likes && r.likes.length) || 0}`;
          dislikes.textContent = `👎 ${r.count_dislike || (r.dislikes && r.dislikes.length) || 0}`;
        }
        likes.disabled = false; dislikes.disabled = false;
      });
      dislikes.addEventListener('click', async (e) => {
        e.preventDefault(); e.stopPropagation();
        likes.disabled = true; dislikes.disabled = true;
        const ok = await sendReaction(items[0].id, 'dislike');
        if (!ok) { likes.disabled = false; dislikes.disabled = false; return; }
        const r = await fetchPhotoReactions(items[0].id);
        if (r) {
          likes.textContent = `👍 ${r.count_like || (r.likes && r.likes.length) || 0}`;
          dislikes.textContent = `👎 ${r.count_dislike || (r.dislikes && r.dislikes.length) || 0}`;
        }
        likes.disabled = false; dislikes.disabled = false;
      });
      const viewList = document.createElement('button'); viewList.className='view-reactions small'; viewList.title='Ver reacciones'; viewList.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); showReactionsModal(items[0].id); });
      viewList.textContent = '⋯';
      right.appendChild(likes); right.appendChild(dislikes); right.appendChild(viewList);
      overlay.appendChild(right);

      const bodyEl = node.querySelector('.card-body');
      // place overlay AFTER the thumbnails for group cards so it appears below them (match single cards)
      if (bodyEl) {
        try {
          if (thumbWrapper && thumbWrapper.nextSibling) bodyEl.insertBefore(overlay, thumbWrapper.nextSibling);
          else bodyEl.appendChild(overlay);
        } catch (e) { bodyEl.appendChild(overlay); }
      } else if (cardEl) cardEl.appendChild(overlay);
    } catch (e) { console.warn('renderGroup meta error', e); }

    // Añadir atributo con los ids del grupo para facilitar actualizaciones puntuales
    try {
      const outer = node.querySelector('.card');
      if (outer) outer.dataset.photoIds = items.map(i => String(i.id)).join(',');
    } catch (e) {}
    // marcar el elemento con el id principal de la primera foto del grupo
    try {
      const outer = node.querySelector('.card');
      if (outer && items && items.length) outer.dataset.photoId = String(items[0].id);
    } catch (e) {}
    if (opts.prepend) gallery.insertBefore(node, gallery.firstChild);
    else gallery.appendChild(node);

    // Después de insertar, conectar la sección de comentarios (cargar existentes y bind al formulario)
    try {
      const added = opts.prepend ? gallery.firstElementChild : gallery.lastElementChild;
      if (added) {
        const cl = added.querySelector('.comments-list');
        const cf = added.querySelector('.comment-form');
        const pid = items && items[0] ? items[0].id : null;
        if (cl && pid) fetchComments(pid).then(list => renderCommentsInto(cl, list)).catch(()=>{});
        if (cf && pid) attachCommentHandler(cf, pid);
      }
    } catch (e) { /* ignore comment attach errors */ }
  }

  function renderCard(item, index, opts = {}) {
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
        img.loading = 'lazy';
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

  const actionsContainer = node.querySelector('.card-actions');
  try {
    const currentId = (typeof window.currentUserId !== 'undefined' && window.currentUserId !== null) ? String(window.currentUserId) : (window.currentUser && window.currentUser.id ? String(window.currentUser.id) : null);
    const ownerId = (item && item.uploader && item.uploader.id) ? String(item.uploader.id) : (item && item.user_id ? String(item.user_id) : null);
    const isOwner = ownerId && currentId && ownerId === currentId;
    if (!actionsContainer) return;
    if (!isOwner) {
      actionsContainer.parentNode && actionsContainer.parentNode.removeChild(actionsContainer);
    } else {
      let ell = actionsContainer.querySelector('.card-ellipsis');
      let menu = actionsContainer.querySelector('.card-ellipsis-menu');
      let miEdit = actionsContainer.querySelector('.card-edit');
      let miDel = actionsContainer.querySelector('.card-delete');
      if (!ell || !menu) {
        actionsContainer.innerHTML = '';
        ell = document.createElement('button'); ell.className = 'card-ellipsis no-shimmer'; ell.type = 'button'; ell.title = 'Más acciones'; ell.innerHTML = '⋯';
        menu = document.createElement('div'); menu.className = 'card-ellipsis-menu hidden';
        miEdit = document.createElement('button'); miEdit.className = 'menu-item card-edit'; miEdit.type = 'button'; miEdit.textContent = 'Editar';
        miDel = document.createElement('button'); miDel.className = 'menu-item card-delete'; miDel.type = 'button'; miDel.textContent = 'Eliminar';
        menu.appendChild(miEdit); menu.appendChild(miDel);
        actionsContainer.appendChild(ell); actionsContainer.appendChild(menu);
      }
      ell.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); const isHidden = menu.classList.contains('hidden'); document.querySelectorAll('.card-ellipsis-menu').forEach(m=>m.classList.add('hidden')); if (isHidden) menu.classList.remove('hidden'); else menu.classList.add('hidden'); });
      miEdit && miEdit.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); menu.classList.add('hidden'); openEdit(item); });
      miDel && miDel.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); menu.classList.add('hidden'); deletePhoto(item.id); });
      document.addEventListener('click', (ev) => { if (!menu.contains(ev.target) && !ell.contains(ev.target)) menu.classList.add('hidden'); });
    }
  } catch (e) { /* ignore ownership errors */ }

  // Mostrar uploader y reacciones como placa sobre la imagen (más atractiva)
  try {
    const cardEl = node.querySelector('.card');
    const uploader = item.uploader || null;
    const overlay = document.createElement('div');
    overlay.className = 'uploader-badge';
    // Left: avatar + name
    const left = document.createElement('div'); left.className = 'uploader-left';
    if (uploader) {
      const aimg = document.createElement('img'); aimg.src = uploader.avatar_url || '/imagen/default-avatar.png'; aimg.className = 'uploader-img';
      const aname = document.createElement('a'); aname.className = 'uploader-name'; aname.textContent = uploader.full_name || 'Usuario';
      aname.href = `/u/${uploader.id}`;
      aname.style.textDecoration = 'none';
      aname.style.cursor = 'pointer';
      aname.addEventListener('click', (ev) => { ev.stopPropagation(); });
      left.appendChild(aimg); left.appendChild(aname);
    } else if (item.user_id) {
      // fallback: fetch public user info
      (async () => {
        try {
          const r = await fetch(`${API_BASE}/api/users/${item.user_id}/info`);
          if (!r.ok) return;
          const j = await r.json();
          const u = j && (j.data || j) ? (j.data || j) : null;
          if (!u) return;
          const aimg = document.createElement('img'); aimg.src = u.avatar_url || '/imagen/default-avatar.png'; aimg.className = 'uploader-img';
          const aname = document.createElement('a'); aname.className = 'uploader-name'; aname.textContent = u.full_name || 'Usuario';
          aname.href = `/u/${u.id}`; aname.style.textDecoration = 'none'; aname.style.cursor = 'pointer';
          aname.addEventListener('click', (ev) => { ev.stopPropagation(); });
          // clear left and append
          left.innerHTML = ''; left.appendChild(aimg); left.appendChild(aname);
        } catch (e) { /* ignore */ }
      })();
    }
    overlay.appendChild(left);

    // Right: small reaction buttons
    const right = document.createElement('div'); right.className = 'uploader-right';
    const likes = document.createElement('button'); likes.className='like-btn small'; likes.textContent = `👍 ${item.reactions ? (item.reactions.likes||0) : 0}`;
    const dislikes = document.createElement('button'); dislikes.className='dislike-btn small'; dislikes.textContent = `👎 ${item.reactions ? (item.reactions.dislikes||0) : 0}`;
    likes.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      likes.disabled = true; dislikes.disabled = true;
      const ok = await sendReaction(item.id, 'like');
      if (!ok) { likes.disabled = false; dislikes.disabled = false; return; }
      const r = await fetchPhotoReactions(item.id);
      if (r) {
        likes.textContent = `👍 ${r.count_like || (r.likes && r.likes.length) || 0}`;
        dislikes.textContent = `👎 ${r.count_dislike || (r.dislikes && r.dislikes.length) || 0}`;
      }
      likes.disabled = false; dislikes.disabled = false;
    });
    dislikes.addEventListener('click', async (e) => {
      e.preventDefault(); e.stopPropagation();
      likes.disabled = true; dislikes.disabled = true;
      const ok = await sendReaction(item.id, 'dislike');
      if (!ok) { likes.disabled = false; dislikes.disabled = false; return; }
      const r = await fetchPhotoReactions(item.id);
      if (r) {
        likes.textContent = `👍 ${r.count_like || (r.likes && r.likes.length) || 0}`;
        dislikes.textContent = `👎 ${r.count_dislike || (r.dislikes && r.dislikes.length) || 0}`;
      }
      likes.disabled = false; dislikes.disabled = false;
    });
    const viewList = document.createElement('button'); viewList.className='view-reactions small'; viewList.title='Ver reacciones'; viewList.addEventListener('click', (e)=>{ e.preventDefault(); e.stopPropagation(); showReactionsModal(item.id); });
    viewList.textContent = '⋯';
    right.appendChild(likes); right.appendChild(dislikes); right.appendChild(viewList);
    overlay.appendChild(right);

    // insert overlay at top of card body (original placement)
    const bodyEl = node.querySelector('.card-body');
    if (bodyEl) bodyEl.insertBefore(overlay, bodyEl.firstChild);
    else if (cardEl) cardEl.appendChild(overlay);
  } catch (e) { console.warn('renderCard meta error', e); }

  // marcar el elemento con el id de la foto para futuras búsquedas
  try {
    const outer = node.querySelector('.card');
    if (outer) outer.dataset.photoId = String(item.id);
  } catch (e) {}

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

    if (opts.prepend) gallery.insertBefore(node, gallery.firstChild);
    else gallery.appendChild(node);

    // conectar sección de comentarios para la tarjeta simple
    try {
      const added = opts.prepend ? gallery.firstElementChild : gallery.lastElementChild;
      if (added) {
        const cl = added.querySelector('.comments-list');
        const cf = added.querySelector('.comment-form');
        const pid = item ? item.id : null;
        if (cl && pid) fetchComments(pid).then(list => renderCommentsInto(cl, list)).catch(()=>{});
        if (cf && pid) attachCommentHandler(cf, pid);
      }
    } catch (e) { /* ignore */ }
  }

  // Render simple skeleton placeholders to improve perceived load
  function renderSkeletons(count = 6) {
    try {
      const existing = gallery.querySelectorAll('.skeleton-card');
      if (existing && existing.length) return;
      for (let i=0;i<count;i++) {
        const s = document.createElement('div');
        s.className = 'card skeleton-card';
        s.style.minHeight = '240px';
        s.style.opacity = '0.7';
        s.innerHTML = `<div style="background:linear-gradient(90deg,#eee,#f5f5f5);height:160px;border-radius:8px;margin:16px"></div><div style="padding:12px"><div style="height:16px;background:#eee;border-radius:6px;width:60%;margin-bottom:8px"></div><div style="height:12px;background:#eee;border-radius:6px;width:40%"></div></div>`;
        gallery.appendChild(s);
      }
    } catch (e) { /* ignore */ }
  }

  function removeSkeletons() {
    try { gallery.querySelectorAll('.skeleton-card').forEach(n=>n.remove()); } catch(e){}
  }

  // Enviar reacción (like/dislike)
  async function sendReaction(photoId, reaction) {
    try {
      const res = await fetch(`${API_BASE}/api/photos/${photoId}/reaction`, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ reaction }) });
      if (!res.ok) {
        const j = await res.json().catch(()=>null);
        alert((j && j.error) ? j.error : 'No fue posible enviar la reacción');
        return false;
      }
      return true;
    } catch (e) { console.error('sendReaction error', e); alert('Error enviando reacción'); return false; }
  }

  // Obtener recuento de reacciones para una foto (solo counts y arrays)
  async function fetchPhotoReactions(photoId) {
    try {
      const res = await fetch(`${API_BASE}/api/photos/${photoId}/reactions`);
      if (!res.ok) return null;
      const j = await res.json();
      return j;
    } catch (e) { console.error('fetchPhotoReactions', e); return null; }
  }

  // Comentarios: obtener y publicar
  async function fetchComments(photoId) {
    try {
      const res = await fetch(`${API_BASE}/api/photos/${photoId}/comments`);
      if (!res.ok) return [];
      const j = await res.json();
      return Array.isArray(j) ? j : [];
    } catch (e) { console.error('fetchComments', e); return []; }
  }

  async function postComment(photoId, text) {
    try {
      const res = await fetch(`${API_BASE}/api/photos/${photoId}/comments`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) });
      if (!res.ok) {
        const j = await res.json().catch(()=>null);
        throw new Error((j && j.error) ? j.error : 'Error creando comentario');
      }
      const created = await res.json();
      return created;
    } catch (e) { console.error('postComment', e); throw e; }
  }

  function renderCommentsInto(container, comments) {
    try {
      container.innerHTML = '';
      if (!comments || !comments.length) { container.innerHTML = '<div class="muted">Sé el primero en comentar</div>'; return; }
      comments.slice(-20).forEach(c => {
        const row = document.createElement('div'); row.style.display='flex'; row.style.gap='8px'; row.style.alignItems='flex-start'; row.style.marginBottom='8px';
        const img = document.createElement('img'); img.src = (c.user && c.user.avatar_url) ? c.user.avatar_url : '/imagen/default-avatar.png'; img.style.width='36px'; img.style.height='36px'; img.style.borderRadius='50%'; img.style.objectFit='cover'; img.style.cursor='pointer';
        const meta = document.createElement('div'); meta.style.flex='1';
        const head = document.createElement('div'); head.style.display='flex'; head.style.justifyContent='space-between'; head.style.alignItems='center';
        const who = document.createElement('div'); who.style.fontWeight='700'; who.style.fontSize='13px'; who.textContent = (c.user && (c.user.full_name || c.user.email)) ? (c.user.full_name || c.user.email) : ('Usuario ' + (c.user && c.user.id ? c.user.id : ''));
        const when = document.createElement('div'); when.style.fontSize='11px'; when.style.color='var(--muted)'; when.textContent = (c.created_at ? (new Date(c.created_at)).toLocaleString() : '');
        const text = document.createElement('div'); text.style.marginTop='4px'; text.textContent = c.text || '';
        const actions = document.createElement('div'); actions.style.display='flex'; actions.style.gap='6px';

        // link to profile on click
        if (c.user && c.user.id) {
          img.addEventListener('click', (e) => { e.stopPropagation(); window.location.href = '/u/' + encodeURIComponent(c.user.id); });
          who.style.cursor = 'pointer'; who.addEventListener('click', (e) => { e.stopPropagation(); window.location.href = '/u/' + encodeURIComponent(c.user.id); });
        }

        // If the current user is the author, show Edit/Delete
        try {
          const currentId = (typeof window.currentUserId !== 'undefined' && window.currentUserId !== null) ? String(window.currentUserId) : (window.currentUser && window.currentUser.id ? String(window.currentUser.id) : null);
          const authorId = c.user && c.user.id ? String(c.user.id) : (c.user_id ? String(c.user_id) : null);
          const isAuthor = currentId && authorId && currentId === authorId;
          if (isAuthor) {
            // compact ellipsis menu for edit/delete
            meta.style.position = meta.style.position || 'relative';
            const ell = document.createElement('button'); ell.className = 'ellipsis-btn no-shimmer'; ell.type = 'button'; ell.title = 'Más acciones'; ell.innerHTML = '⋯'; ell.style.padding = '6px 8px'; ell.style.fontSize = '14px'; ell.style.borderRadius = '8px'; ell.style.minWidth = '34px'; ell.style.height = '30px';
            const menu = document.createElement('div'); menu.className = 'ellipsis-menu hidden';
            // menu items
            const miEdit = document.createElement('button'); miEdit.className = 'menu-item'; miEdit.type = 'button'; miEdit.textContent = 'Editar';
            const miDel = document.createElement('button'); miDel.className = 'menu-item'; miDel.type = 'button'; miDel.textContent = 'Eliminar';
            menu.appendChild(miEdit); menu.appendChild(miDel);

            // attach
            actions.appendChild(ell); actions.appendChild(menu);

            // delete handler
            const doDelete = async () => {
              if (!confirm('¿Eliminar este comentario?')) return;
              try {
                const res = await fetch(`${API_BASE}/api/photos/${c.photo_id}/comments/${c.id}`, { method: 'DELETE', credentials: 'include' });
                if (!res.ok) {
                  const j = await res.json().catch(()=>null);
                  alert((j && j.error) ? j.error : 'No se pudo eliminar el comentario');
                  return;
                }
                const newList = await fetchComments(c.photo_id);
                renderCommentsInto(container, newList);
              } catch (err) { console.error('delete comment error', err); alert('Error eliminando comentario'); }
            };

            // edit handler (inline)
            const doEdit = () => {
              // replace text node with textarea + save/cancel
              const ta = document.createElement('textarea'); ta.style.width = '100%'; ta.style.padding = '8px'; ta.style.borderRadius = '8px'; ta.value = c.text || '';
              const save = document.createElement('button'); save.className='btn primary small'; save.textContent='Guardar'; save.style.padding='6px 8px'; save.style.fontSize='12px';
              const cancel = document.createElement('button'); cancel.className='btn ghost small'; cancel.textContent='Cancelar'; cancel.style.padding='6px 8px'; cancel.style.fontSize='12px';
              try {
                meta.replaceChild(ta, text);
                actions.style.display = 'flex';
                actions.innerHTML = '';
                actions.appendChild(save); actions.appendChild(cancel);
              } catch (e) { console.error('inline edit replace error', e); }
              save.addEventListener('click', async (e) => {
                e.preventDefault(); e.stopPropagation();
                const newText = (ta.value || '').trim();
                if (!newText) return alert('El comentario no puede estar vacío');
                try {
                  const r = await fetch(`${API_BASE}/api/photos/${c.photo_id}/comments/${c.id}`, { method: 'PUT', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ text: newText }) });
                  if (!r.ok) { const jj = await r.json().catch(()=>null); alert((jj && jj.error) ? jj.error : 'No se pudo editar'); return; }
                  const updated = await r.json();
                  meta.replaceChild(text, ta);
                  text.textContent = updated.text || newText;
                  actions.innerHTML = '';
                  actions.appendChild(ell); actions.appendChild(menu);
                } catch (err) { console.error('save edit error', err); alert('Error guardando comentario'); }
              });
              cancel.addEventListener('click', (e) => {
                e.preventDefault(); e.stopPropagation();
                try { meta.replaceChild(text, ta); actions.innerHTML = ''; actions.appendChild(ell); actions.appendChild(menu); } catch(e){}
              });
            };

            // menu interactions
            ell.addEventListener('click', (ev) => {
              ev.preventDefault(); ev.stopPropagation();
              // toggle
              const isHidden = menu.classList.contains('hidden');
              document.querySelectorAll('.ellipsis-menu').forEach(m=>m.classList.add('hidden'));
              if (isHidden) {
                menu.classList.remove('hidden');
              } else { menu.classList.add('hidden'); }
            });

            miDel.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); menu.classList.add('hidden'); doDelete(); });
            miEdit.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); menu.classList.add('hidden'); doEdit(); });

            // close menu on outside click
            document.addEventListener('click', (ev) => { if (!menu.contains(ev.target) && !ell.contains(ev.target)) menu.classList.add('hidden'); });
          }
        } catch (e) { console.error('author check error', e); }

        head.appendChild(who);
        head.appendChild(when);
        meta.appendChild(head);
        meta.appendChild(text);
        // position actions at top-right
        if (actions && actions.childElementCount) {
          const topRow = document.createElement('div'); topRow.style.display='flex'; topRow.style.justifyContent='flex-end'; topRow.style.marginBottom='6px'; topRow.appendChild(actions);
          meta.insertBefore(topRow, text);
        }
        row.appendChild(img); row.appendChild(meta);
        container.appendChild(row);
      });
    } catch (e) { console.error('renderCommentsInto error', e); }
  }

  function attachCommentHandler(formEl, photoId) {
    try {
      if (!formEl) return;
      const ta = formEl.querySelector('textarea[name="comment"]');
      const avatarImg = formEl.querySelector('.comment-avatar');
      if (avatarImg && window.currentUser && window.currentUser.avatar_url) { avatarImg.src = window.currentUser.avatar_url; avatarImg.style.display = 'block'; }
      formEl.addEventListener('submit', async (e) => {
        e.preventDefault();
        const txt = (ta && ta.value) ? ta.value.trim() : '';
        if (!txt) return alert('Escribe un comentario');
        try {
          await postComment(photoId, txt);
          const container = formEl.parentNode ? formEl.parentNode.querySelector('.comments-list') : null;
          if (container) {
            const curr = await fetchComments(photoId);
            renderCommentsInto(container, curr);
          }
          if (ta) ta.value = '';
        } catch (err) { alert('No se pudo publicar el comentario: ' + (err.message || err)); }
      });
    } catch (e) { console.error('attachCommentHandler', e); }
  }

  // Modal para ver listas de usuarios que reaccionaron
  function showReactionsModal(photoId) {
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/api/photos/${photoId}/reactions`);
        if (!res.ok) { alert('No se pudo obtener reacciones'); return; }
        const j = await res.json();
        const likes = j.likes || [];
        const dislikes = j.dislikes || [];
        // construir modal
        const modal = document.createElement('div');
        modal.style.position='fixed'; modal.style.left='0'; modal.style.top='0'; modal.style.right='0'; modal.style.bottom='0'; modal.style.background='rgba(0,0,0,0.45)'; modal.style.display='flex'; modal.style.alignItems='center'; modal.style.justifyContent='center'; modal.style.zIndex='100000';
        const card = document.createElement('div'); card.style.background='var(--bg)'; card.style.color='var(--text)'; card.style.padding='12px'; card.style.borderRadius='12px'; card.style.maxWidth='720px'; card.style.width='92%'; card.style.maxHeight='80vh'; card.style.overflow='auto';
        card.innerHTML = `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><strong>Reacciones</strong><button id='closeReactionsModal' class='btn'>Cerrar</button></div>`;
        const lists = document.createElement('div'); lists.style.display='flex'; lists.style.gap='12px'; lists.style.flexWrap='wrap';
        const likesCol = document.createElement('div'); likesCol.style.flex='1'; likesCol.innerHTML = `<h4>👍 Likes (${j.count_like||likes.length})</h4>`;
        const dislikesCol = document.createElement('div'); dislikesCol.style.flex='1'; dislikesCol.innerHTML = `<h4>👎 Dislikes (${j.count_dislike||dislikes.length})</h4>`;
        function appendUsers(container, arr) {
          if (!arr.length) { const el = document.createElement('div'); el.className='muted'; el.textContent='Nadie aún'; container.appendChild(el); return; }
          arr.forEach(u => {
            const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.marginBottom='6px';
            const img = document.createElement('img'); img.src = u.avatar_url || '/imagen/default-avatar.png'; img.style.width='36px'; img.style.height='36px'; img.style.borderRadius='50%'; img.style.objectFit='cover';
            const name = document.createElement('div'); name.textContent = u.full_name || (`Usuario ${u.id}`);
            row.appendChild(img); row.appendChild(name);
            container.appendChild(row);
          });
        }
        appendUsers(likesCol, likes);
        appendUsers(dislikesCol, dislikes);
        lists.appendChild(likesCol); lists.appendChild(dislikesCol);
        card.appendChild(lists);
        modal.appendChild(card);
        document.body.appendChild(modal);
        document.getElementById('closeReactionsModal').addEventListener('click', ()=>{ try{ document.body.removeChild(modal); }catch(e){} });
      } catch (e) { console.error('showReactionsModal', e); alert('Error obteniendo reacciones'); }
    })();
  }

  // ⬆️ Subir foto (UI mejorada: drag&drop, previews y barra de progreso)
  if (uploadForm) {
    const uploadFilesInput = document.getElementById('uploadFiles');
    const dropArea = document.getElementById('dropArea');
    const selectFilesBtn = document.getElementById('selectFilesBtn');
    const previewEl = document.getElementById('uploadPreview');
    const progressWrap = document.getElementById('uploadProgressWrap');
    const progressBar = document.getElementById('uploadProgressBar');
    const progressLabel = document.getElementById('progressLabel');
    const progressPercent = document.getElementById('progressPercent');
    const clearFilesBtn = document.getElementById('clearFilesBtn');

    let selectedFiles = [];

    function formatBytes(bytes) {
      if (bytes === 0) return '0 B';
      const k = 1024; const dm = 1; const sizes = ['B','KB','MB','GB'];
      const i = Math.floor(Math.log(bytes) / Math.log(k));
      return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function renderPreviews() {
      previewEl.innerHTML = '';
      selectedFiles.forEach((f, idx) => {
        const it = document.createElement('div'); it.className = 'preview-item';
        const thumb = document.createElement('img'); thumb.className = 'preview-thumb';
        const meta = document.createElement('div'); meta.className = 'preview-meta';
        const name = document.createElement('div'); name.className = 'preview-name'; name.textContent = f.name;
        const sub = document.createElement('div'); sub.className = 'preview-sub'; sub.textContent = `${f.type || 'file'} • ${formatBytes(f.size)}`;
        meta.appendChild(name); meta.appendChild(sub);
        const actions = document.createElement('div'); actions.className = 'preview-actions';
        const removeBtn = document.createElement('button'); removeBtn.className = 'preview-remove'; removeBtn.type = 'button'; removeBtn.textContent = 'Eliminar';
        removeBtn.addEventListener('click', () => { selectedFiles.splice(idx,1); renderPreviews(); });
        actions.appendChild(removeBtn);
        it.appendChild(thumb); it.appendChild(meta); it.appendChild(actions);

        // preview image if possible
        if (f.type && f.type.startsWith('image/')) {
          const reader = new FileReader(); reader.onload = (e) => { thumb.src = e.target.result; };
          reader.readAsDataURL(f);
        } else {
          // fallback icon for video/other
          thumb.src = '/imagen/default-avatar.png'; thumb.style.objectFit = 'contain';
        }
        previewEl.appendChild(it);
      });
    }

    // file selection handler
    if (uploadFilesInput) {
      uploadFilesInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files || []);
        if (!files.length) return;
        files.forEach(f => selectedFiles.push(f));
        // auto-select VIDEO category if any file is video
        try { if (selectedFiles.some(x=>x.type && x.type.startsWith('video/')) && categorySelect) categorySelect.value = 'VIDEO'; } catch(e){}
        renderPreviews();
      });
    }

    // select button
    if (selectFilesBtn && uploadFilesInput) selectFilesBtn.addEventListener('click', () => uploadFilesInput.click());

    // drag & drop
    if (dropArea) {
      ['dragenter','dragover'].forEach(ev => dropArea.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dropArea.classList.add('dragover'); }));
      ['dragleave','drop','dragend'].forEach(ev => dropArea.addEventListener(ev, (e) => { e.preventDefault(); e.stopPropagation(); dropArea.classList.remove('dragover'); }));
      dropArea.addEventListener('drop', (e) => {
        const dt = e.dataTransfer; const files = dt && dt.files ? Array.from(dt.files) : [];
        if (files.length) {
          files.forEach(f => selectedFiles.push(f));
          try { if (selectedFiles.some(x=>x.type && x.type.startsWith('video/')) && categorySelect) categorySelect.value = 'VIDEO'; } catch(e){}
          renderPreviews();
        }
      });
    }

    if (clearFilesBtn) clearFilesBtn.addEventListener('click', () => { selectedFiles = []; renderPreviews(); if (uploadFilesInput) uploadFilesInput.value = ''; });

    // submit handler
    uploadForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!selectedFiles.length) { alert('Selecciona al menos un archivo'); return; }
      const title = (uploadForm.title && uploadForm.title.value) || '';
      const dateTaken = (uploadForm.date_taken && uploadForm.date_taken.value) || '';
      if (!title || !dateTaken) { alert('Completa título y fecha'); return; }

      const form = new FormData();
      // append fields
      Array.from(uploadForm.elements).forEach(el => {
        if (!el.name) return;
        if (el.type === 'file') return; // handled below
        form.append(el.name, el.value);
      });
      // append files (multiple entries allowed)
      selectedFiles.forEach(f => form.append('file', f));
      try { form.append('scope', 'index'); } catch(e){}

      // show progress
      if (progressWrap) { progressWrap.classList.remove('hidden'); progressBar.style.width = '0%'; progressBar.classList.add('animated'); progressLabel.textContent = 'Subiendo...'; progressPercent.textContent = '0%'; }

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/photos`);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (ev) => {
        if (!ev.lengthComputable) return;
        const pct = Math.round((ev.loaded / ev.total) * 100);
        if (progressBar) progressBar.style.width = pct + '%';
        if (progressPercent) progressPercent.textContent = pct + '%';
      };
      xhr.onload = async () => {
        try {
          if (xhr.status >= 200 && xhr.status < 300) {
            uploadForm.reset();
            selectedFiles = [];
            renderPreviews();
            if (progressBar) { progressBar.style.width = '100%'; }
            try {
              const resp = JSON.parse(xhr.responseText || '[]');
              const created = Array.isArray(resp) ? resp : (resp ? [resp] : []);
              if (created.length) {
                const toAdd = [];
                created.forEach((c) => {
                  try {
                    if ((!c.uploader || !c.uploader.id) && window.currentUser) {
                      try { c.uploader = { id: window.currentUser.id, full_name: window.currentUser.full_name, avatar_url: window.currentUser.avatar_url }; } catch(e){}
                    }
                    if (!currentCategory || String(c.category || '').toLowerCase() === String(currentCategory || '').toLowerCase()) {
                      toAdd.push(c);
                    }
                  } catch (e) { console.warn('append created card error', e); }
                });
                if (toAdd.length) {
                  // Si varios elementos pertenecen a la misma subida (mismo title, date_taken, category), renderizar como grupo
                  const isGroup = toAdd.length > 1 && toAdd.every(x => x.title === toAdd[0].title && x.date_taken === toAdd[0].date_taken && x.category === toAdd[0].category);
                  if (isGroup) {
                    try { renderGroup(toAdd, 0, { prepend: true }); } catch (e) { console.warn('renderGroup after upload failed', e); toAdd.forEach(c=>{ try{ renderCard(c,0,{prepend:true}); }catch(e){} }); }
                  } else {
                    toAdd.forEach(c=>{ try{ renderCard(c,0,{prepend:true}); }catch(e){} });
                  }
                  photosData = toAdd.concat(photosData || []);
                }
              }
            } catch (e) { console.warn('Could not parse upload response', e); }
            setTimeout(()=>{ try { if (progressWrap) { progressWrap.classList.add('hidden'); progressBar.classList.remove('animated'); } } catch(e){} }, 800);
          } else {
            const msg = xhr.responseText || 'Error al subir';
            alert('No se pudo subir la foto: ' + msg);
            try { if (progressWrap) { progressWrap.classList.add('hidden'); progressBar.classList.remove('animated'); } } catch(e){}
          }
        } catch (err) { alert('Error procesando la subida: ' + err.message); }
      };
      xhr.onerror = () => { alert('Error al subir el archivo'); try { if (progressWrap) { progressWrap.classList.add('hidden'); progressBar.classList.remove('animated'); } } catch(e){} };
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
        fetchPhotos({ force: true });
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
      // Intentar eliminar únicamente el nodo DOM correspondiente y actualizar el estado local
      try {
        let el = gallery.querySelector(`[data-photo-id="${id}"]`);
        if (!el) {
          // buscar en grupos
          document.querySelectorAll('[data-photo-ids]').forEach(n => {
            if (el) return;
            const ids = (n.dataset.photoIds||'').split(',').map(s=>s.trim());
            if (ids.includes(String(id))) el = n;
          });
        }
        if (el) {
          const photoIdsRaw = el.dataset.photoIds || '';
          const idList = photoIdsRaw ? photoIdsRaw.split(',').map(s=>s.trim()).filter(Boolean) : [];
          const isGroup = idList.length > 1;
          if (isGroup) {
            // actualizar estado local
            photosData = (photosData || []).filter(p => String(p.id) !== String(id));
            // actualizar el DOM del grupo sin recargar todo: reconstruir el grupo con los items restantes
            const remainingIds = idList.filter(x => String(x) !== String(id));
            // obtener objetos completos desde photosData (si faltan, pedir al servidor más tarde)
            const remainingItems = (photosData || []).filter(p => remainingIds.includes(String(p.id)));
            if (remainingIds.length === 0) {
              try { el.remove(); } catch(e){}
            } else if (remainingIds.length === 1) {
              // reemplazar el grupo por una card simple del elemento restante
              const remaining = remainingItems[0] || null;
              try {
                const parent = el.parentNode;
                const next = el.nextSibling;
                try { el.remove(); } catch(e){}
                if (remaining && parent) {
                  const cloned = document.createElement('div');
                  // renderCard devuelve un node from template; reuse renderCard by inserting the node then moving it
                  renderCard(remaining, 0, { prepend: false });
                  // insert last rendered card at the position where group was (it was appended at end or prepended).
                  const last = gallery.querySelector('[data-photo-id="' + String(remaining.id) + '"]');
                  if (last && parent) parent.insertBefore(last, next);
                }
              } catch(e) { console.warn('replace group with single failed', e); }
            } else {
              // rebuild group card in-place
              try {
                const parent = el.parentNode;
                const next = el.nextSibling;
                try { el.remove(); } catch(e){}
                // ensure we have item objects for each id; if any missing, fall back to fetchPhotos
                if (remainingItems.length === remainingIds.length) {
                  // render a new group at the same position
                  renderGroup(remainingItems, 0, { prepend: false });
                  // move the newly added group to original position (renderGroup appends)
                  const firstNewId = String(remainingItems[0].id);
                  const selector = '[data-photo-ids="' + remainingIds.join(',') + '"]';
                  const newEl = gallery.querySelector(selector);
                  if (newEl && parent) parent.insertBefore(newEl, next);
                } else {
                  // not enough local data — fallback to sync (async)
                  fetchPhotos().catch(()=>{});
                }
              } catch(e) { console.warn('rebuild group failed', e); fetchPhotos().catch(()=>{}); }
            }
          } else {
            try { el.remove(); } catch(e){}
            photosData = (photosData || []).filter(p => String(p.id) !== String(id));
          }
        } else {
          // si no encontramos elemento en DOM, hacer fetch para sincronizar
          photosData = (photosData || []).filter(p => String(p.id) !== String(id));
          fetchPhotos().catch(()=>{});
        }
      } catch (e) { console.warn('delete DOM update failed', e); fetchPhotos().catch(()=>{}); }
    } catch (err) {
      alert('No se pudo eliminar: ' + err.message);
    }
  }

  // 🚀 Inicial
  fetchPhotos({ force: true });

  // Perfil de usuario: cargar datos y manejar panel
  async function loadUserProfile() {
    try {
      const res = await fetch(`${API_BASE}/auth/me`, { credentials: 'include' });
      if (!res.ok) return; // no autenticado
      const j = await res.json();
      if (!j || !j.ok) return;
      const user = j.user || {};
      // Exponer id del usuario y objeto completo a otras funciones del frontend (para comparar/envíar datos)
      try { window.currentUserId = user.id || ''; window.currentUser = user || null; } catch(e){}
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
      // Solicitar counts de seguidores / siguiendo para mostrar números realess
      try {
        const relRes = await fetch(`/api/users/${encodeURIComponent(user.id)}/relationship`, { credentials: 'include' });
        if (relRes && relRes.ok) {
          const relJson = await relRes.json();
          const fCount = (relJson && typeof relJson.followerCount !== 'undefined') ? Number(relJson.followerCount) : 0;
          const foCount = (relJson && typeof relJson.followingCount !== 'undefined') ? Number(relJson.followingCount) : 0;

          // Variantes en las plantillas: index usa ids simples, profile usa ids con prefijo `profile`.
          // Actualizar primero los span interiores si existen (varios templates soportados).
          const profileFollowerEl = document.getElementById('profileFollowerNum');
          const profileFollowingEl = document.getElementById('profileFollowingNum');

          const followerNumEl = document.getElementById('followerNum');
          const followingNumEl = document.getElementById('followingNum');

          if (followerNumEl) followerNumEl.textContent = String(fCount);
          else {
            const fEl = document.getElementById('followerCount');
            if (fEl) {
              if (fEl.tagName && fEl.tagName.toLowerCase() === 'span') {
                // span used directly on index panel — safe to write
                fEl.textContent = String(fCount);
              } else {
                const child = fEl.querySelector && fEl.querySelector('span');
                if (child) {
                  // If the child is the profile-specific span, avoid overwriting it
                  // unless the profile page refers to the current user.
                  const isProfileSpan = child.id && String(child.id).indexOf('profile') === 0;
                  try {
                    const profilePageId = (typeof window.profilePageUserId !== 'undefined' && window.profilePageUserId !== null) ? String(window.profilePageUserId) : null;
                    const currentId = (typeof window.currentUserId !== 'undefined' && window.currentUserId !== null) ? String(window.currentUserId) : null;
                    if (isProfileSpan) {
                      if (!profilePageId || profilePageId === currentId) child.textContent = String(fCount);
                    } else {
                      child.textContent = String(fCount);
                    }
                  } catch (e) { /* ignore */ }
                } else fEl.textContent = String(fCount);
              }
            }
          }

          if (followingNumEl) followingNumEl.textContent = String(foCount);
          else {
            const tEl = document.getElementById('followingCount');
            if (tEl) {
              if (tEl.tagName && tEl.tagName.toLowerCase() === 'span') {
                tEl.textContent = String(foCount);
              } else {
                const child2 = tEl.querySelector && tEl.querySelector('span');
                if (child2) {
                  const isProfileSpan2 = child2.id && String(child2.id).indexOf('profile') === 0;
                  try {
                    const profilePageId = (typeof window.profilePageUserId !== 'undefined' && window.profilePageUserId !== null) ? String(window.profilePageUserId) : null;
                    const currentId = (typeof window.currentUserId !== 'undefined' && window.currentUserId !== null) ? String(window.currentUserId) : null;
                    if (isProfileSpan2) {
                      if (!profilePageId || profilePageId === currentId) child2.textContent = String(foCount);
                    } else {
                      child2.textContent = String(foCount);
                    }
                  } catch (e) { /* ignore */ }
                } else tEl.textContent = String(foCount);
              }
            }
          }

          // Actualizar elementos específicos de la página de perfil SOLO si la página de perfil
          // corresponde al usuario autenticado (o si no se especificó un profilePageUserId).
          try {
            const profilePageId = (typeof window.profilePageUserId !== 'undefined' && window.profilePageUserId !== null) ? String(window.profilePageUserId) : null;
            const currentId = (typeof window.currentUserId !== 'undefined' && window.currentUserId !== null) ? String(window.currentUserId) : null;
            if (profileFollowerEl) {
              if (!profilePageId || profilePageId === currentId) profileFollowerEl.textContent = String(fCount);
            }
            if (profileFollowingEl) {
              if (!profilePageId || profilePageId === currentId) profileFollowingEl.textContent = String(foCount);
            }
          } catch (e) { /* ignore */ }

          // Attach click handlers to show modal lists (works for both template variants)
          function makeModal(title, itemsHtml) {
            const modal = document.createElement('div');
            modal.style.position = 'fixed'; modal.style.left = '0'; modal.style.top = '0'; modal.style.right = '0'; modal.style.bottom = '0'; modal.style.background = 'rgba(0,0,0,0.45)'; modal.style.display = 'flex'; modal.style.alignItems = 'center'; modal.style.justifyContent = 'center'; modal.style.zIndex = '1000000';
            modal.innerHTML = `<div style="max-width:420px;width:90%;background:var(--bg);color:var(--text);padding:12px;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.2)"><div style='display:flex;justify-content:space-between;align-items:center;margin-bottom:8px'><strong>${title}</strong><button id='closeFollowModal' class='btn'>Cerrar</button></div><div style='max-height:60vh;overflow:auto'>${itemsHtml || '<div class="muted">Sin resultados</div>'}</div></div>`;
            document.body.appendChild(modal);
            const btn = modal.querySelector('#closeFollowModal'); if (btn) btn.addEventListener('click', ()=>{ try{ document.body.removeChild(modal); }catch(e){} });
          }

          async function showFollowersList() {
            try {
              const r = await fetch(`/api/users/${encodeURIComponent(user.id)}/followers`);
              if (!r.ok) { const j = await r.json().catch(()=>null); alert((j && j.error) ? j.error : 'Error'); return; }
              const j = await r.json();
              const listHtml = (j.data || []).map(item => { const u = item.user || item || {}; return `<div style="display:flex;align-items:center;gap:8px;padding:8px"><img src="${u.avatar_url||'/imagen/default-avatar.png'}" style="width:32px;height:32px;border-radius:999px;object-fit:cover"/><div><a href='/u/${u.id}' style='text-decoration:none;color:inherit'>${u.full_name||u.email||u.id}</a></div></div>`; }).join('');
              if (window.showListModal) window.showListModal('Seguidores', listHtml);
              else makeModal('Seguidores', listHtml);
            } catch (e) { console.error('showFollowersList error', e); alert('Error al obtener seguidores'); }
          }

          async function showFollowingList() {
            try {
              const r = await fetch(`/api/users/${encodeURIComponent(user.id)}/following`);
              if (!r.ok) { const j = await r.json().catch(()=>null); alert((j && j.error) ? j.error : 'Error'); return; }
              const j = await r.json();
              const listHtml = (j.data || []).map(item => { const u = item.user || item || {}; return `<div style="display:flex;align-items:center;gap:8px;padding:8px"><img src="${u.avatar_url||'/imagen/default-avatar.png'}" style="width:32px;height:32px;border-radius:999px;object-fit:cover"/><div><a href='/u/${u.id}' style='text-decoration:none;color:inherit'>${u.full_name||u.email||u.id}</a></div></div>`; }).join('');
              if (window.showListModal) window.showListModal('Siguiendo', listHtml);
              else makeModal('Siguiendo', listHtml);
            } catch (e) { console.error('showFollowingList error', e); alert('Error al obtener la lista de seguidos'); }
          }

          // bind clicks to any available element variants
          try {
            // Si estamos en la página dedicada de perfil (profile.ejs), esa plantilla
            // ya adjunta sus propios handlers y gestión; evitar adjuntar handlers
            // duplicados desde app.js para prevenir comportamientos intermitentes.
            if (typeof window.profilePageUserId === 'undefined') {
              const els = [];
              const cand1 = document.getElementById('followerCount'); if (cand1) els.push({el:cand1, fn: showFollowersList});
              const cand2 = document.getElementById('followerNum'); if (cand2) els.push({el:cand2, fn: showFollowersList});
              els.forEach(o => { try { o.el.style.cursor = 'pointer'; o.el.addEventListener('click', o.fn); } catch(e){} });
              const els2 = [];
              const tc1 = document.getElementById('followingCount'); if (tc1) els2.push({el:tc1, fn: showFollowingList});
              const tc2 = document.getElementById('followingNum'); if (tc2) els2.push({el:tc2, fn: showFollowingList});
              els2.forEach(o => { try { o.el.style.cursor = 'pointer'; o.el.addEventListener('click', o.fn); } catch(e){} });
            } else {
              // En la página profile.ejs, respetar los handlers locales y no adjuntar nada aquí.
            }
          } catch(e) { /* ignore handler attach errors */ }
        }
      } catch (e) { /* ignore relationship fetch errors */ }
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
    profilePanel.style.display = 'block'; profilePanel.style.visibility = 'visible';
    profilePanel.classList.remove('hidden'); profilePanel.setAttribute('aria-hidden','false');
    // cuando se abre el panel, asegurar que las burbujas se muestren (y ocultar chat si era visible)
    try { const pc = document.getElementById('panelChat'); if (pc) pc.style.display = 'none'; const pb = document.getElementById('panelInboxBubbles'); if (pb) pb.style.display = 'flex'; } catch(e){}
    // empezar polling de las burbujas mientras el panel esté abierto
    try { await refreshPanelBubbles(); startPanelBubblePoll(); } catch(e) { console.warn('panel open refresh failed', e); }
  });
  if (closeProfileBtn) closeProfileBtn.addEventListener('click', () => { if (profilePanel) { profilePanel.classList.add('hidden'); profilePanel.setAttribute('aria-hidden','true'); profilePanel.style.display = 'none'; profilePanel.style.visibility = 'hidden'; } });

  // Crear chat grupal: abrir modal, seleccionar contactos (followers + following), enviar invitaciones
  const createGroupChatBtn = document.getElementById('createGroupChatBtn');
  const groupChatModal = document.getElementById('groupChatModal');
  const closeGroupChatModal = document.getElementById('closeGroupChatModal');
  const groupContactsList = document.getElementById('groupContactsList');
  const sendGroupInvitesBtn = document.getElementById('sendGroupInvitesBtn');
  const groupTitleInput = document.getElementById('groupTitleInput');
  const invitationsModal = document.getElementById('invitationsModal');
  const closeInvitationsModal = document.getElementById('closeInvitationsModal');
  const invitationsList = document.getElementById('invitationsList');

  async function openGroupChatModal() {
    try {
      // ensure we have current user id
      const me = window.currentUserId || null;
      if (!me) {
        // try to load profile data
        await loadUserProfile();
      }
      const uid = window.currentUserId;
      if (!uid) { alert('No autenticado'); return; }
      groupContactsList.innerHTML = '<div class="muted">Cargando contactos...</div>';
      // fetch followers and following
      const [fRes, foRes] = await Promise.all([fetch(`/api/users/${uid}/followers`), fetch(`/api/users/${uid}/following`)]);
      const followers = fRes.ok ? (await fRes.json()).data || [] : [];
      const following = foRes.ok ? (await foRes.json()).data || [] : [];
      const map = new Map();
      [...followers, ...following].forEach(u => { if (u && u.id) map.set(String(u.id), u); });
      const list = Array.from(map.values());
      if (!list.length) { groupContactsList.innerHTML = '<div class="muted">No tienes contactos para invitar</div>'; }
      else {
        groupContactsList.innerHTML = '';
        list.forEach(u => {
          const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.padding='6px 4px';
          const cb = document.createElement('input'); cb.type='checkbox'; cb.dataset.userid = u.id;
          const img = document.createElement('img'); img.src = u.avatar_url || '/imagen/default-avatar.png'; img.style.width='36px'; img.style.height='36px'; img.style.borderRadius='50%'; img.style.objectFit='cover';
          const txt = document.createElement('div'); txt.innerHTML = `<strong>${u.full_name || u.email}</strong><div style="font-size:12px;color:var(--muted)">${u.profile_description ? u.profile_description.substr(0,80) : ''}</div>`;
          row.appendChild(cb); row.appendChild(img); row.appendChild(txt);
          groupContactsList.appendChild(row);
        });
      }
      groupChatModal.classList.remove('hidden'); groupChatModal.setAttribute('aria-hidden','false');
    } catch (e) { console.error('openGroupChatModal', e); alert('Error cargando contactos'); }
  }

  if (createGroupChatBtn) createGroupChatBtn.addEventListener('click', (e) => { e.preventDefault(); openGroupChatModal(); });
  if (closeGroupChatModal) closeGroupChatModal.addEventListener('click', ()=>{ groupChatModal.classList.add('hidden'); groupChatModal.setAttribute('aria-hidden','true'); });

  if (sendGroupInvitesBtn) sendGroupInvitesBtn.addEventListener('click', async () => {
    try {
      const checks = Array.from(groupContactsList.querySelectorAll('input[type="checkbox"]')).filter(c=>c.checked);
      if (!checks.length) { alert('Selecciona al menos una persona'); return; }
      const ids = checks.map(c => Number(c.dataset.userid)).filter(Boolean);
      const title = (groupTitleInput && groupTitleInput.value) ? groupTitleInput.value : 'Chat grupal';
      const res = await fetch(`${API_BASE}/api/chats/invite`, { method: 'POST', headers: {'Content-Type':'application/json'}, credentials: 'include', body: JSON.stringify({ title, invitees: ids }) });
      if (!res.ok) { const j = await res.json().catch(()=>null); alert((j && j.error) ? j.error : 'No se pudo enviar invitaciones'); return; }
      alert('Invitaciones enviadas'); groupChatModal.classList.add('hidden'); groupChatModal.setAttribute('aria-hidden','true');
    } catch (e) { console.error('sendGroupInvites', e); alert('Error enviando invitaciones'); }
  });

  // Invitations modal
  async function openInvitationsModal() {
    try {
      invitationsList.innerHTML = '<div class="muted">Cargando...</div>';
      const res = await fetch(`${API_BASE}/api/chats/invitations`, { credentials: 'include' });
      if (!res.ok) { invitationsList.innerHTML = '<div class="muted">Error cargando invitaciones</div>'; return; }
      const j = await res.json(); const items = j.data || [];
      if (!items.length) { invitationsList.innerHTML = '<div class="muted">No tienes invitaciones</div>'; }
      else {
        invitationsList.innerHTML = '';
        items.forEach(inv => {
          const row = document.createElement('div'); row.style.display='flex'; row.style.alignItems='center'; row.style.gap='8px'; row.style.padding='8px'; row.style.borderBottom='1px solid var(--border)';
          const info = document.createElement('div'); info.style.flex='1';
          const inviterId = inv.chat_invite_groups && inv.chat_invite_groups.inviter_id ? inv.chat_invite_groups.inviter_id : null;
          const title = inv.chat_invite_groups && inv.chat_invite_groups.title ? inv.chat_invite_groups.title : 'Invitación a chat grupal';
          info.innerHTML = `<div style="font-weight:700">${title}</div><div class="muted">Invitado por: ${inviterId || 'Usuario'}</div>`;
          const acceptBtn = document.createElement('button'); acceptBtn.className='btn primary'; acceptBtn.textContent='Aceptar';
          const rejectBtn = document.createElement('button'); rejectBtn.className='btn ghost'; rejectBtn.textContent='Rechazar';
          acceptBtn.addEventListener('click', async ()=>{
            try {
              const r = await fetch(`${API_BASE}/api/chats/invitations/${inv.id}/respond`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ accept: true }) });
              if (!r.ok) { const j = await r.json().catch(()=>null); alert((j && j.error) ? j.error : 'Error aceptando invitación'); return; }
              const j = await r.json().catch(()=>null);
              alert('Has aceptado la invitación');
              // si el servidor creó el chat, abrirlo
              try { if (j && j.result && j.result.chat_id) { await fetchChats(); openGroupChat(j.result.chat_id, (j.result.title || inv.chat_invite_groups && inv.chat_invite_groups.title)); return; } } catch(e){}
              openInvitationsModal();
            } catch (e) { console.error('accept invite error', e); alert('Error aceptando invitación'); }
          });
          rejectBtn.addEventListener('click', async ()=>{
            try {
              const r = await fetch(`${API_BASE}/api/chats/invitations/${inv.id}/respond`, { method:'POST', credentials:'include', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ accept: false }) });
              if (!r.ok) { const j = await r.json().catch(()=>null); alert((j && j.error) ? j.error : 'Error rechazando invitación'); return; }
              alert('Has rechazado la invitación');
              openInvitationsModal();
            } catch (e) { console.error('reject invite error', e); alert('Error rechazando invitación'); }
          });
          row.appendChild(info); row.appendChild(acceptBtn); row.appendChild(rejectBtn);
          invitationsList.appendChild(row);
        });
      }
      invitationsModal.classList.remove('hidden'); invitationsModal.setAttribute('aria-hidden','false');
    } catch (e) { console.error('openInvitationsModal', e); invitationsList.innerHTML = '<div class="muted">Error</div>'; }
  }

  if (closeInvitationsModal) closeInvitationsModal.addEventListener('click', ()=>{ invitationsModal.classList.add('hidden'); invitationsModal.setAttribute('aria-hidden','true'); });

  // Polling periódico para actualizar badge de invitaciones y abrir modal al hacer click
  const invitationsBtn = document.getElementById('invitationsBtn');
  const invitationsBadge = document.getElementById('invitationsBadge');
  async function fetchInvitationCount() {
    try {
      const r = await fetch(`${API_BASE}/api/chats/invitations`, { credentials: 'include' });
      if (!r.ok) {
        if (invitationsBadge) invitationsBadge.style.display = 'none';
        return;
      }
      const j = await r.json().catch(()=>({ data: [] }));
      const items = (j && j.data) ? j.data : [];
      const pending = (items || []).filter(i => (i.status || 'pending') === 'pending').length;
      if (invitationsBadge) {
        if (pending > 0) { invitationsBadge.style.display = 'flex'; invitationsBadge.textContent = String(pending); }
        else { invitationsBadge.style.display = 'none'; }
      }
    } catch (e) {
      // silent
    }
  }

  if (invitationsBtn) {
    invitationsBtn.addEventListener('click', (ev) => { ev.preventDefault(); try { openInvitationsModal(); } catch(e){ window.dispatchEvent(new CustomEvent('openInvitationsPanel')); } });
  }
  // Arrancar polling inmediato y cada 20s
  fetchInvitationCount();
  setInterval(fetchInvitationCount, 20_000);

  // --- Chats: fetch list of chats and open group chat ---
  async function fetchChats() {
    try {
      const res = await fetch(`${API_BASE}/api/chats`, { credentials: 'include' });
      if (!res.ok) return [];
      const j = await res.json().catch(()=>({ data: [] }));
      const chats = (j && j.data) ? j.data : [];
      // render small buttons in profile panel container
      try {
        const container = document.getElementById('panelInboxBubbles');
        if (container) {
          // keep existing DM bubbles, but append group chats after them
          // remove previous group chat markers
          Array.from(container.querySelectorAll('.group-chat-btn')).forEach(n=>n.remove());
          chats.forEach(ch => {
            const btn = document.createElement('button');
            btn.className = 'panel-chat-bubble group-chat-btn';
            btn.title = ch.title || ('Chat ' + (ch.id || '')); btn.style.background = 'linear-gradient(90deg, rgba(59,130,246,0.06), transparent)';
            btn.setAttribute('data-chatid', String(ch.id));
            btn.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;gap:4px;padding:6px;min-width:48px"><div style="width:36px;height:36px;border-radius:999px;background:linear-gradient(90deg,#3b82f6,#60a5fa);display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">${(ch.title||'').substring(0,1)||'G'}</div><div style="font-size:11px;max-width:70px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escapeHtml(ch.title||'Grupo')}</div></div>`;
            btn.addEventListener('click', () => { openGroupChat(ch.id, ch.title); });
            container.appendChild(btn);
          });
        }
      } catch (e) { /* ignore render errors */ }
      return chats;
    } catch (e) { console.error('fetchChats error', e); return []; }
  }

  async function openGroupChat(chatId, title) {
    if (!chatId) return;
    try {
      // reuse global drawer UI
      if (!gchatDrawer) return;
      if (gchatTitle) gchatTitle.textContent = title || 'Chat grupal';
      gchatDrawer.style.display = 'flex';
      // load messages from chats endpoint
      const res = await fetch(`${API_BASE}/api/chats/${chatId}/messages`, { credentials: 'include' });
      if (!res.ok) { gchatBody.innerHTML = '<div class="muted">No se pudo cargar la conversación</div>'; return; }
      const j = await res.json().catch(()=>({ data: [] }));
      const msgs = (j && j.data) ? j.data : [];
      renderGMessages(msgs);
      stopGPoll(); gpoll = setInterval(()=> fetch(`${API_BASE}/api/chats/${chatId}/messages`, { credentials: 'include' }).then(r=>r.ok?r.json():null).then(j=>{ if (j && j.data) renderGMessages(j.data); }).catch(()=>{}), 2500);
      if (gchatSend) {
        gchatSend.onclick = async () => {
          const text = gchatInput && gchatInput.value && gchatInput.value.trim();
          if (!text) return;
          try {
            const r = await fetch(`${API_BASE}/api/chats/${chatId}/messages`, { method: 'POST', credentials: 'include', headers: {'Content-Type':'application/json'}, body: JSON.stringify({ content: text }) });
            if (!r.ok) { const j = await r.json().catch(()=>null); alert((j && j.error) ? j.error : 'Error enviando mensaje'); return; }
            if (gchatInput) gchatInput.value = '';
            const nr = await fetch(`${API_BASE}/api/chats/${chatId}/messages`, { credentials: 'include' }); if (nr.ok) { const nj = await nr.json().catch(()=>null); if (nj && nj.data) renderGMessages(nj.data); }
          } catch(e){ console.error('send group message error', e); }
        };
      }
      if (gchatInput) gchatInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); if (gchatSend) gchatSend.click(); } };
    } catch (e) { console.error('openGroupChat error', e); }
  }

  // initial load of chats for panel
  fetchChats().catch(()=>{});
  // For convenience open invitations when profile panel opens
  window.addEventListener('openProfilePanel', ()=>{ /* leave invitation handling to user click for now */ });

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
      profilePanel.classList.add('hidden'); profilePanel.setAttribute('aria-hidden','true'); profilePanel.style.display = 'none'; profilePanel.style.visibility = 'hidden';
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
      try { console.log('[chat] openPanelChat called ->', withId, title); } catch(e){}
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
      if (panelChat) {
        panelChat.classList.remove('hidden');
        panelChat.style.visibility = 'visible';
        panelChat.style.display = 'block';
      }
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

  // expose and event-bridge: allow other pages to request opening the panel
  try {
    if (typeof window !== 'undefined') {
      window.openPanelChat = openPanelChat;
      window.__openPanelChatRequests = window.__openPanelChatRequests || [];
      window.addEventListener('openPanelChatRequest', (ev) => {
        try {
          const d = ev && ev.detail ? ev.detail : null;
          try { console.log('[chat] openPanelChatRequest received', d); } catch(e){}
          if (!d || !d.id) return;
          if (typeof openPanelChat === 'function') {
            openPanelChat(d.id, d.title);
          } else {
            window.__openPanelChatRequests.push(d);
            try { console.log('[chat] openPanelChatRequest queued', d); } catch(e){}
          }
        } catch (e) { console.error('openPanelChatRequest handler error', e); }
      });
      // process queued
      try {
        if (Array.isArray(window.__openPanelChatRequests) && window.__openPanelChatRequests.length) {
          try { console.log('[chat] processing queued openPanelChatRequests', window.__openPanelChatRequests); } catch(e){}
          window.__openPanelChatRequests.forEach(d=>{ try{ openPanelChat(d.id,d.title); }catch(e){console.error(e);} });
          window.__openPanelChatRequests = [];
        }
      } catch(e){}
    }
  } catch (e) { /* ignore */ }

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

  // --- Emoji picker support ---
  const EMOJI_BASE = '/imagen/emojis/';
  let EMOJI_FILES = [];

  function createEmojiPicker(targetInput) {
    const wrap = document.createElement('div');
    wrap.className = 'emoji-picker hidden';
    EMOJI_FILES.forEach(f => {
      const img = document.createElement('img');
      img.src = EMOJI_BASE + f;
      img.className = 'emoji-pick';
      img.title = f;
      img.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        // insert token <:eX:> where X is filename without extension
        const id = f.replace(/\.png$/,'');
        insertAtCursor(targetInput, `<:e${id}:>`);
        // hide picker after select
        wrap.classList.add('hidden');
        targetInput.focus();
      };
      wrap.appendChild(img);
    });
    document.body.appendChild(wrap);
    // prevent clicks inside the picker from bubbling and closing it
    wrap.addEventListener('click', (e) => { e.stopPropagation(); });
    // register picker globally so a single document listener can close them
    try { window._emojiPickers = window._emojiPickers || []; window._emojiPickers.push(wrap); } catch(e){}
    try { console.log('[emoji] picker created for input', targetInput && targetInput.id); } catch(e){}
    return wrap;
  }

  function insertAtCursor(input, text) {
    try {
      const start = input.selectionStart || 0;
      const end = input.selectionEnd || 0;
      const val = input.value || '';
      input.value = val.slice(0, start) + text + val.slice(end);
      const pos = start + text.length;
      input.selectionStart = input.selectionEnd = pos;
    } catch(e) { input.value = (input.value || '') + text; }
  }

  function attachEmojiButtonFor(inputEl) {
    if (!inputEl) return;
    // avoid attaching twice
    if (inputEl._emojiAttached) return; inputEl._emojiAttached = true;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'emoji-btn no-shimmer'; btn.title = 'Emojis'; btn.style.padding = '8px'; btn.style.marginLeft = '8px';
    btn.textContent = '😊';
    const picker = createEmojiPicker(inputEl);
    btn.onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      try { console.log('[emoji] button clicked for', inputEl && inputEl.id); } catch(e){}
      // hide other pickers
      try { (window._emojiPickers || []).forEach(p => { if (p !== picker) p.classList.add('hidden'); }); } catch(e){}
      // position picker centered under the button; if no space below, show above
      const wasHidden = picker.classList.contains('hidden');
      requestAnimationFrame(() => {
        try {
          const r = btn.getBoundingClientRect();
          // ensure we measure the picker size even if it's hidden
          let pickerW = picker.offsetWidth || 0;
          let pickerH = picker.offsetHeight || 0;
          if ((!pickerW || !pickerH) && picker.classList.contains('hidden')) {
            const prevVis = picker.style.visibility;
            const prevDisplay = picker.style.display;
            try {
              picker.style.visibility = 'hidden';
              picker.style.display = 'grid';
              picker.classList.remove('hidden');
              pickerW = picker.offsetWidth || 220;
              pickerH = picker.offsetHeight || 160;
            } finally {
              picker.classList.add('hidden');
              picker.style.display = prevDisplay || '';
              picker.style.visibility = prevVis || '';
            }
          }
          picker.style.position = 'fixed';
          picker.style.zIndex = 1000000;
          let left = r.left + (r.width/2) - (pickerW/2);
          left = Math.max(8, Math.min(left, window.innerWidth - pickerW - 8));
          let top = r.bottom + 8;
          picker.classList.remove('above');
          if (top + pickerH > window.innerHeight - 8) {
            top = r.top - pickerH - 8;
            picker.classList.add('above');
          }
          picker.style.left = (Math.round(left)) + 'px';
          picker.style.top = (Math.round(top)) + 'px';
          if (wasHidden) {
            picker.classList.remove('hidden');
            picker.style.transform = 'scale(0.96)';
            setTimeout(()=> picker.style.transform = 'scale(1)', 10);
          } else {
            picker.classList.add('hidden');
          }
        } catch(e) { picker.classList.toggle('hidden'); }
      });
    };
    // place button after input (fallback to appending to body)
    try {
      if (inputEl.parentNode) inputEl.parentNode.insertBefore(btn, inputEl.nextSibling);
      else document.body.appendChild(btn);
    } catch(e){ try { document.body.appendChild(btn); } catch(e){} }
  }

  // Attach emoji button to global chat input and any inputs with class 'chat-input'
  (async function initEmojiPicker() {
    try {
      const res = await fetch('/api/emojis');
      if (res.ok) {
        const j = await res.json();
        EMOJI_FILES = Array.isArray(j.data) ? j.data : [];
      }
    } catch(e) { /* ignore */ }
    // fallback to default set if none found
    if (!EMOJI_FILES || EMOJI_FILES.length === 0) {
      EMOJI_FILES = ['1.png','2.png','3.png','4.png','5.png','6.png','7.png','8.png','9.png'];
    }
    try {
      attachEmojiButtonFor(gchatInput);
      document.querySelectorAll('.chat-input').forEach(el => { try { attachEmojiButtonFor(el); } catch(e){} });
    } catch(e) { /* ignore */ }

    // If inputs are not yet present, attach when DOM is ready
    try {
      if (!gchatInput) {
        document.addEventListener('DOMContentLoaded', () => {
          try { attachEmojiButtonFor(document.getElementById('chatInput')); } catch(e){}
          try { document.querySelectorAll('.chat-input').forEach(el => { try { attachEmojiButtonFor(el); } catch(e){} }); } catch(e){}
        });
      }
    } catch(e) {}

    // Ensure a single global document click listener to close any open pickers
    try {
      if (!window._emojiPickerGlobalAttached) {
        window._emojiPickerGlobalAttached = true;
        document.addEventListener('click', (ev) => {
          try {
            const t = ev && ev.target;
            if (t && (t.closest && (t.closest('.emoji-picker') || t.closest('.emoji-btn')))) {
              // click inside picker or on the emoji button — ignore
              return;
            }
            (window._emojiPickers || []).forEach(p => p.classList.add('hidden'));
          } catch(e){}
        });
      }
    } catch(e) {}
  })();

  function renderGMessages(messages) {
    if (!gchatBody) return;
    gchatBody.innerHTML = '';
    messages.forEach(m => {
      const me = (String(m.sender_id) === String(window.currentUserId || ''));
      const el = document.createElement('div');
      el.style.display = 'flex'; el.style.justifyContent = me ? 'flex-end' : 'flex-start';
      // allow emoji tokens like <:e1:> to be rendered as images from EMOJI_BASE
      let content = escapeHtml(m.content || '');
      // escaped token will look like &lt;:e1:&gt; so replace that with an <img>
      content = content.replace(/&lt;:e(\d+):&gt;/g, function(_, id){ return `<img src="${EMOJI_BASE}${id}.png" class="inline-emoji" alt="emoji" />`; });
      el.innerHTML = `<div style="max-width:78%;padding:6px;border-radius:8px;background:${me ? 'linear-gradient(90deg,#0ea5a0,#06b6d4)' : 'rgba(0,0,0,0.06)'};color:${me ? '#fff' : 'var(--text)'}">${content}<div style="font-size:10px;margin-top:6px;opacity:0.7;text-align:right">${(new Date(m.created_at)).toLocaleString()}</div></div>`;
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

  // Exponer openGlobalChat globalmente para que otras páginas (profile) puedan invocarlo
  try {
    if (typeof window !== 'undefined') window.openGlobalChat = openGlobalChat;
  } catch (e) { /* ignore */ }

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
