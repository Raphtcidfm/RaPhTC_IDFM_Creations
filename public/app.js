
let currentUser = null;

const labels = {
  'roblox-progress': 'Roblox — Jeu en cours',
  'roblox-done': 'Roblox — Jeu terminé',
  'omsi-progress': 'OMSI 2 — Repaint en cours',
  'omsi-done': 'OMSI 2 — Repaint terminé'
};

const $ = s => document.querySelector(s);

let detailItems = [];
let editingImages = [];

async function api(url, options = {}) {
  const headers = options.body instanceof FormData
    ? { ...(options.headers || {}) }
    : { 'Content-Type': 'application/json', ...(options.headers || {}) };

  const r = await fetch(url, { ...options, headers });
  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data.error || 'Une erreur est survenue.');
  }

  return data;
}

function showPage(id) {
  if ((id === 'roblox' || id === 'omsi') && !currentUser) {
    openAuth();
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const p = document.getElementById(id);
  if (p) p.classList.add('active');

  if (id === 'admin') loadAdmin();
  if (id === 'demandes') loadMyRequests();

  if (id === 'photos') {
    loadPhotos();
    loadMyPhotos();
  }

  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function openAuth() {
  $('#authModal').classList.remove('hidden');
  switchAuth('login');
}

function closeAuth() {
  $('#authModal').classList.add('hidden');
}

function switchAuth(type) {
  $('#loginForm').classList.toggle('hidden', type !== 'login');
  $('#registerForm').classList.toggle('hidden', type !== 'register');
  $('#loginTab').classList.toggle('active', type === 'login');
  $('#registerTab').classList.toggle('active', type === 'register');
  $('#authMsg').textContent = '';
}

function setMsg(el, text) {
  if (el) el.textContent = text;
}

function esc(v = '') {
  return String(v).replace(/[&<>"']/g, m => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  }[m]));
}

/* =========================
   CRÉATIONS ROBLOX ET OMSI 2
   ========================= */

async function loadItems() {
  const items = await api('/api/items');
  detailItems = items;

  ['roblox-progress', 'roblox-done', 'omsi-progress', 'omsi-done'].forEach(type => {
    const box = $('#' + type);
    const list = items.filter(i => i.type === type);

    box.innerHTML = list.length
      ? list.map(itemCard).join('')
      : '<div class="empty">Aucune création pour le moment.</div>';
  });

  $('#statTotal').textContent = items.length;
  $('#statOngoing').textContent = items.filter(i => i.type.endsWith('progress')).length;
}

function getItemImages(i) {
  return Array.isArray(i.images) && i.images.length ? i.images : [];
}

function itemCard(i) {
  const imgs = getItemImages(i);
  const cover = imgs[0]?.src;

  return `
    <article class="item item-clickable"
      onclick="openItemDetail('${esc(i.id)}')"
      tabindex="0"
      onkeydown="if(event.key==='Enter'||event.key===' '){event.preventDefault();openItemDetail('${esc(i.id)}')}">
      <div class="item-img">
        ${cover
          ? `<img src="${esc(cover)}" alt="${esc(imgs[0]?.name || i.title)}" loading="lazy">`
          : '🚌'}
        ${imgs.length > 1 ? `<span class="image-count">${imgs.length} images</span>` : ''}
      </div>
      <div class="item-body">
        <h4>${esc(i.title)}</h4>
        <p>${esc(i.description)}</p>
        <div class="item-open">Voir les détails →</div>
      </div>
    </article>`;
}

function openItemDetail(id) {
  const item = detailItems.find(x => x.id === id);
  if (!item) return;

  const imgs = getItemImages(item);

  const gallery = imgs.length
    ? imgs.map((img, n) => `
        <button class="gallery-image"
          onclick="openGalleryImage('${esc(id)}',${n})"
          title="Agrandir l'image ${n + 1}">
          <img src="${esc(img.src)}" alt="${esc(img.name || item.title + ' image ' + (n + 1))}">
        </button>`).join('')
    : '<div class="detail-empty-image">🚌<span>Aucune image</span></div>';

  $('#itemDetail').innerHTML = `
    <div class="detail-info">
      <span class="eyebrow">${esc(labels[item.type] || 'Création')}</span>
      <h2>${esc(item.title)}</h2>
      <p class="detail-description">${esc(item.description).replace(/\n/g, '<br>')}</p>
      ${item.link ? `
        <div class="detail-links">
          <h3>Liens</h3>
          <a class="primary detail-link" href="${esc(item.link)}" target="_blank" rel="noopener">
            🌐 Accéder au site
          </a>
        </div>` : ''}
    </div>
    <div class="detail-gallery">
      <div class="gallery-head">
        <h3>Images</h3>
        <span>${imgs.length} image${imgs.length > 1 ? 's' : ''}</span>
      </div>
      <div class="gallery-grid">${gallery}</div>
    </div>`;

  $('#itemModal').classList.remove('hidden');
  $('#itemModal').setAttribute('aria-hidden', 'false');
  document.body.classList.add('modal-open');
}

function closeItemDetail() {
  $('#itemModal').classList.add('hidden');
  $('#itemModal').setAttribute('aria-hidden', 'true');
  document.body.classList.remove('modal-open');
}

function openGalleryImage(id, index) {
  const item = detailItems.find(x => x.id === id);
  const img = getItemImages(item || {})[index];

  if (!img) return;

  const w = window.open('', '_blank');

  if (w) {
    w.document.write(`
      <title>${esc(item.title)}</title>
      <style>
        body {
          margin: 0;
          background: #07111f;
          display: grid;
          place-items: center;
          min-height: 100vh;
        }
        img {
          max-width: 96vw;
          max-height: 96vh;
          object-fit: contain;
        }
      </style>
      <img src="${esc(img.src)}" alt="">
    `);
    w.document.close();
  }
}

/* =========================
   DEMANDES DE REPAINT
   ========================= */

async function loadMyRequests() {
  if (!currentUser) {
    $('#myRequests').innerHTML =
      '<div class="empty">Connecte-toi pour voir tes demandes.</div>';
    return;
  }

  try {
    const rs = await api('/api/my-requests');

    $('#myRequests').innerHTML = rs.length
      ? '<h3 class="subhead">Mes demandes</h3>' +
        rs.map(r => `
          <div class="request-row">
            <strong>${esc(r.title)}</strong>
            <span>${esc(r.status)} • ${new Date(r.createdAt).toLocaleDateString('fr-FR')}</span>
          </div>`).join('')
      : '<div class="empty">Tu n’as encore envoyé aucune demande.</div>';
  } catch (e) {
    $('#myRequests').innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

/* =========================
   PHOTOS DE TRANSPORTS
   ========================= */

function getPhotoImage(photo) {
  return photo.image || photo.imageData || photo.src || '';
}

function photoDate(date) {
  if (!date) return '';

  const d = new Date(date);

  return Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleDateString('fr-FR');
}

function photoStatus(status) {
  const statuses = {
    pending: 'En attente de validation',
    approved: 'Validée',
    rejected: 'Refusée'
  };

  return statuses[status] || status || 'Statut inconnu';
}

async function loadPhotos() {
  const gallery = $('#photoGallery');
  if (!gallery) return;

  gallery.innerHTML = '<p class="muted">Chargement des photos…</p>';

  try {
    const result = await api('/api/photos');
    const photos = Array.isArray(result) ? result : (result.photos || []);

    if (!photos.length) {
      gallery.innerHTML = '<div class="empty">Aucune photo publiée pour le moment. Reviens bientôt !</div>';
      return;
    }

    gallery.innerHTML = photos.map(photo => {
      const image = getPhotoImage(photo);

      return `
        <article class="photo-card glass">
          ${image
            ? `<img class="photo-card-image" src="${esc(image)}" alt="Photo de transport" loading="lazy">`
            : '<div class="empty">📸 Image indisponible</div>'}
          <div class="photo-card-body">
            <p>${esc(photo.description || 'Photo de transport')}</p>
            <div class="muted">
              ${photo.authorPseudo ? `Par ${esc(photo.authorPseudo)}` : ''}
              ${photo.createdAt ? ` • ${photoDate(photo.createdAt)}` : ''}
            </div>
          </div>
        </article>`;
    }).join('');
  } catch (e) {
    gallery.innerHTML = `
      <div class="empty">
        Impossible de charger les photos pour le moment.
        <button class="small-btn" type="button" onclick="loadPhotos()">Réessayer</button>
      </div>`;
    console.error('Chargement des photos :', e);
  }
}

async function loadMyPhotos() {
  const box = $('#myPhotos');
  if (!box) return;

  if (!currentUser) {
    box.innerHTML = '<p class="muted">Connecte-toi pour retrouver tes propositions.</p>';
    return;
  }

  box.innerHTML = '<p class="muted">Chargement de tes propositions…</p>';

  try {
    const result = await api('/api/my-photos');
    const photos = Array.isArray(result) ? result : (result.photos || []);

    if (!photos.length) {
      box.innerHTML = '<div class="empty">Tu n’as pas encore proposé de photo.</div>';
      return;
    }

    box.innerHTML = photos.map(photo => `
      <div class="request-row">
        <div>
          <strong>${esc(photo.description || 'Photo de transport')}</strong>
          <span>${photoDate(photo.createdAt)}</span>
        </div>
        <span>${esc(photoStatus(photo.status))}</span>
      </div>`).join('');
  } catch (e) {
    box.innerHTML = `<div class="empty">${esc(e.message)}</div>`;
  }
}

async function submitPhoto(e) {
  e.preventDefault();

  if (!currentUser) {
    openAuth();
    setMsg($('#photoMsg'), 'Connecte-toi pour proposer une photo.');
    return;
  }

  const form = e.target;
  const file = $('#photoFile').files[0];
  const description = $('#photoDescription').value.trim();

  if (!file) {
    setMsg($('#photoMsg'), 'Choisis une photo avant de continuer.');
    return;
  }

  if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
    setMsg($('#photoMsg'), 'Format non accepté. Utilise JPG, PNG, WebP ou GIF.');
    return;
  }

  if (file.size > 3 * 1024 * 1024) {
    setMsg($('#photoMsg'), 'La photo dépasse la limite de 3 Mo.');
    return;
  }

  if (!description) {
    setMsg($('#photoMsg'), 'Ajoute une description à ta photo.');
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  const oldText = button.textContent;
  button.disabled = true;
  button.textContent = 'Envoi en cours…';
  setMsg($('#photoMsg'), '');

  try {
    const image = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('Impossible de lire cette image.'));
      reader.readAsDataURL(file);
    });

    await api('/api/photos', {
      method: 'POST',
      body: JSON.stringify({ image, description })
    });

    form.reset();
    setMsg($('#photoMsg'), 'Photo envoyée ! Elle attend maintenant la validation d’un administrateur.');
    await loadMyPhotos();
  } catch (err) {
    setMsg($('#photoMsg'), err.message);
  } finally {
    button.disabled = false;
    button.textContent = oldText;
  }
}

/* =========================
   ADMINISTRATION
   ========================= */

async function loadAdmin() {
  if (!currentUser || currentUser.role !== 'admin') {
    showPage('accueil');
    openAuth();
    return;
  }

  try {
    const [items, requests, stats, admins] = await Promise.all([
      api('/api/items'),
      api('/api/admin/requests'),
      api('/api/admin/stats'),
      api('/api/admin/admins')
    ]);

    $('#adminStatUsers').textContent = stats.users;
    $('#adminStatAdmins').textContent = stats.admins;
    $('#adminStatItems').textContent = stats.items;
    $('#adminStatPending').textContent = stats.pending_requests;
    $('#statRequests').textContent = stats.pending_requests;

    const pendingPhotos = stats.pending_photos ?? 0;
    const pendingPhotosBox = $('#adminStatPendingPhotos');

    if (pendingPhotosBox) {
      pendingPhotosBox.textContent = pendingPhotos;
    }

    renderAdminItems(items);
    renderAdminRequests(requests);
    renderAdmins(admins);

    await loadAdminPhotos();
  } catch (e) {
    setMsg($('#adminMsg'), e.message);
  }
}

function renderAdminItems(items) {
  $('#adminItems').innerHTML = items.length
    ? items.map(i => `
        <div class="admin-row">
          <div>
            <strong>${esc(i.title)}</strong>
            <span>
              ${esc(labels[i.type] || i.type)} • ${i.images?.length || 0} image(s)
              ${i.updatedAt && i.updatedAt !== i.createdAt
                ? ' • modifiée le ' + photoDate(i.updatedAt)
                : ''}
            </span>
          </div>
          <div class="actions-small">
            <button class="small-btn" onclick="startItemEdit('${esc(i.id)}')">Modifier</button>
            <button class="small-btn danger" onclick="deleteItem('${esc(i.id)}')">Supprimer</button>
          </div>
        </div>`).join('')
    : '<div class="empty">Aucune création.</div>';
}

function renderAdminRequests(requests) {
  $('#adminRequests').innerHTML = requests.length
    ? requests.map(r => `
        <div class="admin-row">
          <div>
            <strong>${esc(r.title)}</strong>
            <span>par ${esc(r.authorPseudo)} • ${esc(r.status)}</span>
          </div>
          <div class="actions-small">
            <select onchange="updateRequest('${esc(r.id)}',this.value)">
              ${['En attente', 'Acceptée', 'Refusée', 'Terminée'].map(s =>
                `<option ${s === r.status ? 'selected' : ''}>${s}</option>`
              ).join('')}
            </select>
            <button class="small-btn danger" onclick="deleteRequest('${esc(r.id)}')">×</button>
          </div>
        </div>`).join('')
    : '<div class="empty">Aucune demande reçue.</div>';
}

function renderAdmins(admins) {
  $('#adminList').innerHTML = admins.length
    ? admins.map(a => `
        <div class="admin-row">
          <div>
            <strong>${esc(a.pseudo)}</strong>
            <span>${esc(a.email)} • admin</span>
          </div>
          <div class="actions-small">
            ${a.id === currentUser.id
              ? '<span class="muted">Toi</span>'
              : `<button class="small-btn" onclick="changeAdminRole('${esc(a.id)}','member')">Retirer admin</button>`}
          </div>
        </div>`).join('')
    : '<div class="empty">Aucun admin.</div>';
}

async function loadAdminPhotos() {
  const box = $('#adminPhotos');
  if (!box) return;

  box.innerHTML = '<p class="muted">Chargement des photos à examiner…</p>';

  try {
    const result = await api('/api/admin/photos?status=pending');
    const photos = Array.isArray(result) ? result : (result.photos || []);

    if (!photos.length) {
      box.innerHTML = '<div class="empty">Aucune photo en attente de validation.</div>';
      return;
    }

    box.innerHTML = photos.map(photo => {
      const image = getPhotoImage(photo);

      return `
        <article class="admin-photo-row">
          ${image
            ? `<img class="admin-photo-preview" src="${esc(image)}" alt="Photo proposée" loading="lazy">`
            : '<div class="empty">Image indisponible</div>'}
          <div class="admin-photo-info">
            <strong>${esc(photo.authorPseudo || 'Membre')}</strong>
            <p>${esc(photo.description || 'Sans description')}</p>
            <span class="muted">${photoDate(photo.createdAt)}</span>
            <div class="actions-small">
              <button class="small-btn" onclick="moderatePhoto('${esc(photo.id)}','approved')">✅ Publier</button>
              <button class="small-btn danger" onclick="moderatePhoto('${esc(photo.id)}','rejected')">Refuser</button>
              <button class="small-btn danger" onclick="deletePhoto('${esc(photo.id)}')">Supprimer</button>
            </div>
          </div>
        </article>`;
    }).join('');
  } catch (e) {
    box.innerHTML = `<div class="empty">Impossible de charger les photos : ${esc(e.message)}</div>`;
  }
}

async function moderatePhoto(id, status) {
  const message = status === 'approved'
    ? 'Publier cette photo dans la galerie ?'
    : 'Refuser cette photo ?';

  if (!confirm(message)) return;

  try {
    await api('/api/admin/photos/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });

    await loadAdmin();
    await loadPhotos();
    await loadMyPhotos();
  } catch (e) {
    alert(e.message);
  }
}

async function deletePhoto(id) {
  if (!confirm('Supprimer définitivement cette photo ?')) return;

  try {
    await api('/api/admin/photos/' + encodeURIComponent(id), {
      method: 'DELETE'
    });

    await loadAdmin();
    await loadPhotos();
    await loadMyPhotos();
  } catch (e) {
    alert(e.message);
  }
}

/* =========================
   MODIFICATION DES CRÉATIONS
   ========================= */

function getAdminItem(id) {
  return detailItems.find(x => x.id === id);
}

function startItemEdit(id) {
  const item = getAdminItem(id);
  if (!item) return;

  const f = $('#itemForm');
  f.editId.value = item.id;
  f.type.value = item.type;
  f.title.value = item.title;
  f.description.value = item.description;
  f.link.value = item.link || '';

  editingImages = getItemImages(item).map(x => ({ ...x }));

  $('#itemFormTitle').textContent = 'Modifier la création';
  $('#itemSubmitBtn').textContent = '💾 Enregistrer les modifications';
  $('#cancelEditBtn').classList.remove('hidden');

  renderEditImages();
  f.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function renderEditImages() {
  $('#editImages').classList.toggle('hidden', !editingImages.length);

  $('#editImages').innerHTML = editingImages.map((img, i) => `
    <div class="edit-image">
      <img src="${esc(img.src)}" alt="">
      <button type="button" class="small-btn danger" onclick="removeEditingImage(${i})">Retirer</button>
    </div>`).join('');
}

function removeEditingImage(i) {
  editingImages.splice(i, 1);
  renderEditImages();
}

function cancelItemEdit() {
  const f = $('#itemForm');
  f.reset();
  f.editId.value = '';
  editingImages = [];

  $('#editImages').classList.add('hidden');
  $('#itemFormTitle').textContent = 'Ajouter une création';
  $('#itemSubmitBtn').textContent = '+ Ajouter';
  $('#cancelEditBtn').classList.add('hidden');

  setMsg($('#adminMsg'), '');
}

async function fileToData(file) {
  if (file.size > 5 * 1024 * 1024) {
    throw new Error(`Image trop lourde (${file.name}) : maximum 5 Mo par image.`);
  }

  if (!file.type.startsWith('image/')) {
    throw new Error(`Fichier invalide : ${file.name}`);
  }

  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, src: reader.result });
    reader.onerror = () => reject(new Error(`Impossible de lire ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

async function submitItem(e) {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    const newFiles = Array.from(f.getAll('imageFile') || []).filter(x => x && x.size);
    const images = [...editingImages];

    for (const file of newFiles) {
      images.push(await fileToData(file));
    }

    if (images.length > 8) {
      throw new Error('Maximum 8 images par création.');
    }

    const payload = {
      type: f.get('type'),
      title: f.get('title'),
      description: f.get('description'),
      link: f.get('link'),
      images
    };

    const editId = f.get('editId');

    await api(
      editId ? '/api/admin/items/' + encodeURIComponent(editId) : '/api/admin/items',
      {
        method: editId ? 'PATCH' : 'POST',
        body: JSON.stringify(payload)
      }
    );

    setMsg($('#adminMsg'), editId ? 'Création modifiée !' : 'Création ajoutée !');

    cancelItemEdit();
    await loadItems();
    await loadAdmin();
  } catch (err) {
    setMsg($('#adminMsg'), err.message);
  }
}

async function deleteItem(id) {
  if (!confirm('Supprimer cette création ?')) return;

  try {
    await api('/api/admin/items/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadItems();
    await loadAdmin();
  } catch (e) {
    alert(e.message);
  }
}

async function updateRequest(id, status) {
  try {
    await api('/api/admin/requests/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    await loadAdmin();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteRequest(id) {
  if (!confirm('Supprimer cette demande ?')) return;

  try {
    await api('/api/admin/requests/' + encodeURIComponent(id), { method: 'DELETE' });
    await loadAdmin();
  } catch (e) {
    alert(e.message);
  }
}

async function changeAdminRole(id, role) {
  if (!confirm('Retirer les droits administrateur de ce compte ?')) return;

  try {
    await api('/api/admin/admins/' + encodeURIComponent(id), {
      method: 'PATCH',
      body: JSON.stringify({ role })
    });
    await loadAdmin();
  } catch (e) {
    alert(e.message);
  }
}

/* =========================
   CONNEXION ET INSCRIPTION
   ========================= */

async function afterLogin(user) {
  currentUser = user;
  closeAuth();
  refreshAuth();

  await Promise.allSettled([
    loadItems(),
    loadMyRequests(),
    loadMyPhotos()
  ]);

  if (currentUser?.role === 'admin') {
    await loadAdmin();
  }
}

$('#loginForm').addEventListener('submit', async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    const d = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(f))
    });

    await afterLogin(d.user);
  } catch (err) {
    setMsg($('#authMsg'), err.message);
  }
});

$('#registerForm').addEventListener('submit', async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    const d = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(f))
    });

    await afterLogin(d.user);
  } catch (err) {
    setMsg($('#authMsg'), err.message);
  }
});

$('#requestForm').addEventListener('submit', async e => {
  e.preventDefault();

  if (!currentUser) {
    openAuth();
    setMsg($('#authMsg'), 'Connecte-toi pour envoyer une demande.');
    return;
  }

  const f = new FormData(e.target);

  try {
    await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(f))
    });

    e.target.reset();
    setMsg($('#requestMsg'), 'Demande envoyée !');
    await loadMyRequests();
  } catch (err) {
    setMsg($('#requestMsg'), err.message);
  }
});

$('#photoForm')?.addEventListener('submit', submitPhoto);

$('#itemForm').addEventListener('submit', submitItem);

$('#adminForm').addEventListener('submit', async e => {
  e.preventDefault();

  const f = new FormData(e.target);

  try {
    await api('/api/admin/admins', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(f))
    });

    e.target.reset();
    setMsg($('#adminManageMsg'), 'Administrateur ajouté / promu !');
    await loadAdmin();
  } catch (err) {
    setMsg($('#adminManageMsg'), err.message);
  }
});

/* =========================
   AFFICHAGE DU COMPTE
   ========================= */

function refreshAuth() {
  const btn = $('#authBtn');
  let adminLink = document.querySelector('nav a[href="#admin"]');

  if (currentUser) {
    btn.textContent = currentUser.pseudo + (currentUser.role === 'admin' ? ' • Admin' : '');

    btn.onclick = () => {
      if (currentUser.role === 'admin') {
        showPage('admin');
      } else {
        alert('Connecté en tant que ' + currentUser.pseudo);
      }
    };

    if (currentUser.role === 'admin') {
      if (!adminLink) {
        adminLink = document.createElement('a');
        adminLink.href = '#admin';
        adminLink.textContent = 'Admin';
        adminLink.onclick = () => showPage('admin');
        document.querySelector('nav').insertBefore(adminLink, btn);
      }
    } else if (adminLink) {
      adminLink.remove();
    }
  } else {
    btn.textContent = 'Connexion';
    btn.onclick = openAuth;

    if (adminLink) adminLink.remove();
  }
}

/* =========================
   INITIALISATION
   ========================= */

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') closeItemDetail();
});

$('#itemModal').addEventListener('click', e => {
  if (e.target.id === 'itemModal') closeItemDetail();
});

(async () => {
  try {
    const d = await api('/api/me');
    currentUser = d.user;
    refreshAuth();
  } catch (e) {
    currentUser = null;
    refreshAuth();
  }

  try {
    await loadItems();
  } catch (e) {
    console.error('Chargement des créations :', e);
  }

  await Promise.allSettled([
    loadPhotos(),
    loadMyPhotos()
  ]);
})();
