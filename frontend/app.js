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

// Música (requiere interacción del usuario para autoplay)
playMusicBtn.addEventListener('click', async () => {
  try { await bgMusic.play(); } catch(e) {}
});

// Temas de color
function setPrimaryColor(color) {
  document.documentElement.style.setProperty('--primary', color);
}
colorPicker.addEventListener('input', (e) => setPrimaryColor(e.target.value));
presetBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const color = btn.dataset.color;
    if (color === '#111827') {
      document.documentElement.setAttribute('data-theme', 'dark');
      setPrimaryColor('#4f46e5');
    } else {
      document.documentElement.setAttribute('data-theme', 'default');
      setPrimaryColor(color);
    }
  });
});

// Tabs
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    currentCategory = tab.dataset.category || '';
    listTitle.textContent = currentCategory ? `Categoría: ${currentCategory}` : 'Todas las fotos';
    fetchPhotos();
  });
});

// Fetch
async function fetchPhotos() {
  gallery.innerHTML = '';
  const url = currentCategory ? `${API_BASE}/api/photos?category=${encodeURIComponent(currentCategory)}`
                              : `${API_BASE}/api/photos`;
  const res = await fetch(url);
  const data = await res.json();
  data.forEach(renderCard);
}

function renderCard(item) {
  const tpl = document.getElementById('cardTemplate');
  const node = tpl.content.cloneNode(true);
  node.querySelector('.card-img').src = item.image_url;
  node.querySelector('.card-img').alt = item.title || 'Foto';
  node.querySelector('.card-title').textContent = item.title || 'Sin título';
  node.querySelector('.card-desc').textContent = item.description || '';
  node.querySelector('.card-date').textContent = item.date_taken ? `Fecha: ${item.date_taken}` : '';
  node.querySelector('.card-cat').textContent = item.category ? `Categoría: ${item.category}` : '';
  node.querySelector('.edit').addEventListener('click', () => openEdit(item));
  node.querySelector('.delete').addEventListener('click', () => deletePhoto(item.id));
  gallery.appendChild(node);
}

// Subir
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

// Editar
function openEdit(item) {
  editingId = item.id;
  editForm.title.value = item.title || '';
  editForm.description.value = item.description || '';
  editForm.date_taken.value = item.date_taken || '';
  editForm.category.value = item.category || 'GALERIA';
  editModal.classList.remove('hidden');
}
closeModalBtn.addEventListener('click', () => editModal.classList.add('hidden'));
editForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    title: editForm.title.value,
    description: editForm.description.value,
    date_taken: editForm.date_taken.value,
    category: editForm.category.value
  };
  try {
    const res = await fetch(`${API_BASE}/api/photos/${editingId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error('Error al editar');
    editModal.classList.add('hidden');
    fetchPhotos();
  } catch (err) {
    alert('No se pudo editar: ' + err.message);
  }
});

// Eliminar
async function deletePhoto(id) {
  if (!confirm('¿Eliminar esta foto?')) return;
  try {
    const res = await fetch(`${API_BASE}/api/photos/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error('Error al eliminar');
    fetchPhotos();
  } catch (err) {
    alert('No se pudo eliminar: ' + err.message);
  }
}

// Inicial
fetchPhotos();
