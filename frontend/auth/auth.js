document.addEventListener('DOMContentLoaded', () => {
  // Inicializar supabase client usando las variables inyectadas por server (si están)
  let supabaseClient = null;
  if (!window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    console.warn('Faltan las keys públicas de Supabase en la página. Algunas funciones (OAuth, sesión cliente) no estarán disponibles.');
  } else {
    try {
      supabaseClient = supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
    } catch (e) {
      console.warn('Error inicializando el cliente de Supabase:', e && e.message ? e.message : e);
      supabaseClient = null;
    }
  }

  const authModal = document.getElementById('authModal');
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const googleLoginBtn = document.getElementById('googleLogin');
  const showLoginBtn = document.getElementById('showLogin');
  const showRegisterBtn = document.getElementById('showRegister');
  const loginPane = document.getElementById('loginPane');
  const registerPane = document.getElementById('registerPane');
  const isAuthPage = !!document.getElementById('authPage');

  function showAuth() {
    // si estamos en la pagina dedicada no hacemos modal
    if (isAuthPage) return;
    if (authModal) {
      authModal.classList.remove('hidden');
      authModal.setAttribute('aria-hidden', 'false');
      document.querySelector('main')?.classList.add('hidden');
      document.querySelector('header')?.classList.add('hidden');
    }
  }
  function hideAuth() {
    if (isAuthPage) return;
    if (authModal) {
      authModal.classList.add('hidden');
      authModal.setAttribute('aria-hidden', 'true');
      document.querySelector('main')?.classList.remove('hidden');
      document.querySelector('header')?.classList.remove('hidden');
    }
  }

  // Switch panes
  showLoginBtn?.addEventListener('click', () => {
    showLoginBtn.classList.add('active');
    showRegisterBtn.classList.remove('active');
    loginPane.classList.remove('hidden');
    registerPane.classList.add('hidden');
  });
  showRegisterBtn?.addEventListener('click', () => {
    showRegisterBtn.classList.add('active');
    showLoginBtn.classList.remove('active');
    registerPane.classList.remove('hidden');
    loginPane.classList.add('hidden');
  });

  // Comprobar sesión existente (solo si supabaseClient está disponible)
  (async () => {
    if (!supabaseClient) { showAuth(); return; }
    try {
      const { data } = await supabaseClient.auth.getSession();
      const session = data?.session || null;
          if (session) {
            if (isAuthPage) { window.location.href = '/app'; return; }
            hideAuth();
      } else showAuth();
    } catch (err) {
      console.warn('Error comprobando sesión:', err);
      showAuth();
    }
  })();

  // Login con email/contraseña
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(loginForm);
    const email = (form.get('email') || '').toString().trim();
    const password = (form.get('password') || '').toString();
    const errEl = document.getElementById('loginError');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      if (errEl) { errEl.textContent = 'Por favor ingresa un correo válido.'; errEl.style.display = 'block'; }
      return;
    }
    if (!password || password.length < 6) {
      if (errEl) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; errEl.style.display = 'block'; }
      return;
    }
    if (errEl) { errEl.style.display = 'none'; }
    try {
        if (isAuthPage) {
          // En páginas de auth usamos endpoint server-side
          const res = await fetch('/auth/login', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || 'Login falló');
          // Redirigir al área protegida
          window.location.href = '/app';
        } else {
          if (!supabaseClient) throw new Error('Función de login cliente no disponible (faltan las keys).');
          const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
          if (error) throw error;
          hideAuth(); window.location.reload();
        }
    } catch (err) {
      const errEl = document.getElementById('loginError');
      if (errEl) { errEl.textContent = 'Error iniciando sesión: ' + (err.message || err); errEl.style.display = 'block'; }
      else alert('Error iniciando sesión: ' + (err.message || err));
    }
  });

  // Registro con avatar opcional
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = new FormData(registerForm);
    const email = (form.get('email') || '').toString().trim();
    const password = (form.get('password') || '').toString();
    const avatarFile = registerForm.querySelector('input[name="avatar"]')?.files?.[0] || null;
    const errEl = document.getElementById('registerError');
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      if (errEl) { errEl.textContent = 'Ingresa un correo electrónico válido.'; errEl.style.display = 'block'; }
      return;
    }
    if (!password || password.length < 6) {
      if (errEl) { errEl.textContent = 'La contraseña debe tener al menos 6 caracteres.'; errEl.style.display = 'block'; }
      return;
    }
    if (avatarFile) {
      // Validar tipo y tamaño (max 5MB)
      if (!avatarFile.type.startsWith('image/')) {
        if (errEl) { errEl.textContent = 'El avatar debe ser una imagen.'; errEl.style.display = 'block'; }
        return;
      }
      if (avatarFile.size > 5 * 1024 * 1024) {
        if (errEl) { errEl.textContent = 'El avatar debe ser menor a 5 MB.'; errEl.style.display = 'block'; }
        return;
      }
    }
    if (errEl) { errEl.style.display = 'none'; }
    try {
        if (isAuthPage) {
          // Enviar formData al endpoint server-side que gestiona registro y avatar
          const fd = new FormData();
          fd.append('email', email);
          fd.append('password', password);
          if (registerForm.querySelector('input[name="full_name"]')) fd.append('full_name', registerForm.querySelector('input[name="full_name"]').value || '');
          // si hay file, subir; si no, enviar la opción predeterminada seleccionada
          if (avatarFile) {
            fd.append('avatar', avatarFile, avatarFile.name);
          } else {
            const selectedDefault = registerForm.querySelector('input[name="default_avatar"]')?.value || '';
            if (selectedDefault) fd.append('default_avatar', selectedDefault);
          }
          const res = await fetch('/auth/register', { method: 'POST', body: fd });
          const j = await res.json();
          if (!res.ok) throw new Error(j.error || 'Registro falló');
          // Mostrar mensaje de éxito y redirigir al login para que el usuario ingrese sus datos
          alert('Registrado correctamente. Por favor, inicia sesión.');
          window.location.href = '/login';
          return;
        }
        // si no es página auth, mantener comportamiento anterior (signUp en supabase client)
        const { data, error } = await supabaseClient.auth.signUp({ email, password });
        if (error) throw error;
        alert('Registro creado. Revisa tu correo si Supabase requiere confirmación.');
        hideAuth();
        window.location.reload();
    } catch (err) {
      if (errEl) { errEl.textContent = 'Error registrando: ' + (err.message || err); errEl.style.display = 'block'; }
      else alert('Error registrando: ' + (err.message || err));
    }
  });

  // Google OAuth
    // Google OAuth (solo si supabaseClient está disponible)
    googleLoginBtn?.addEventListener('click', async () => {
      if (!supabaseClient) { alert('Google OAuth no está disponible en este despliegue.'); return; }
      try {
        const { error } = await supabaseClient.auth.signInWithOAuth({ provider: 'google' });
        if (error) throw error;
        // redirección gestionada por Supabase
      } catch (err) {
        alert('Error con Google OAuth: ' + (err.message || err));
      }
    });

  // Escuchar cambios de sesión para ocultar/mostrar UI (si está disponible)
  if (supabaseClient && supabaseClient.auth && typeof supabaseClient.auth.onAuthStateChange === 'function') {
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (session) {
        if (isAuthPage) window.location.href = '/app';
        else hideAuth();
      } else showAuth();
    });
  }
  
    // Final block to ensure proper cleanup or final actions
    window.addEventListener('beforeunload', () => {
      // Perform any necessary cleanup or final actions here
    });

  // Avatar picker (para página de registro): toggle y selección desde carpeta /imagen/avatares
  if (isAuthPage && registerForm) {
    const avatarPickerBtn = document.getElementById('avatarPickerBtn');
    const avatarPicker = document.getElementById('avatarPicker');
    const defaultAvatarInput = document.getElementById('defaultAvatar');

    const avatarPreviewImg = document.getElementById('avatarPreview');

    // Debug: log presence of elements
    console.log('Auth page detected. Avatar elements:', { avatarPickerBtn: !!avatarPickerBtn, avatarPicker: !!avatarPicker, defaultAvatarInput: !!defaultAvatarInput, avatarPreviewImg: !!avatarPreviewImg });
    function closePicker() {
      if (avatarPicker) {
        avatarPicker.style.display = 'none';
        avatarPicker.setAttribute('aria-hidden', 'true');
        if (avatarPickerBtn) avatarPickerBtn.setAttribute('aria-expanded', 'false');
      }
    }
    function openPicker() {
      if (avatarPicker) {
        // Forzar visibilidad con múltiples propiedades para evitar problemas de CSS
        avatarPicker.style.display = 'block';
        avatarPicker.style.visibility = 'visible';
        avatarPicker.style.opacity = '1';
        avatarPicker.style.zIndex = '9999';
        avatarPicker.classList.add('visible');
        avatarPicker.setAttribute('aria-hidden', 'false');
        if (avatarPickerBtn) avatarPickerBtn.setAttribute('aria-expanded', 'true');
      }
    }

    avatarPickerBtn?.addEventListener('click', (ev) => {
        ev.preventDefault();
        console.log('avatarPickerBtn clicked');
        if (!avatarPicker) { console.warn('avatarPicker element not found'); return; }
        const isOpen = avatarPicker.style.display === 'block';
        if (isOpen) closePicker(); else openPicker();
    });

    // Delegation: clicks on avatar-thumb buttons
    avatarPicker?.addEventListener('click', (ev) => {
      const btn = ev.target.closest('.avatar-thumb');
      if (!btn) return;
      const src = btn.getAttribute('data-src');
      if (!src) return;
      // actualizar valor hidden
      if (defaultAvatarInput) defaultAvatarInput.value = src;
      // actualizar vista previa en el botón
      if (avatarPreviewImg) avatarPreviewImg.src = src;
      // marcar visualmente selección
      avatarPicker.querySelectorAll('.avatar-thumb').forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      // opcional: cerrar picker tras elegir
        console.log('avatar selected', src);
        closePicker();
    });

    // Cerrar picker al hacer click fuera
    document.addEventListener('click', (ev) => {
      if (!avatarPicker || !avatarPickerBtn) return;
      if (avatarPicker.contains(ev.target) || avatarPickerBtn.contains(ev.target)) return;
      closePicker();
    });
  }
});
