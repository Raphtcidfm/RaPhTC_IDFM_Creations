let currentUser = null;
let pendingPage = null;

const labels = {
  'roblox-progress': 'Roblox — Jeu en cours',
  'roblox-done': 'Roblox — Jeu terminé',
  'omsi-progress': 'OMSI 2 — Repaint en cours',
  'omsi-done': 'OMSI 2 — Repaint terminé'
};

const $ = s => document.querySelector(s);

async function api(url, options = {}) {
  const r = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    },
    ...options
  });

  const data = await r.json().catch(() => ({}));

  if (!r.ok) {
    throw new Error(data.error || 'Une erreur est survenue.');
  }

  return data;
}

/* =========================
   ACCÈS AUX PAGES
========================= */

function showPage(id) {

  // Pages réservées aux membres
  const protectedPages = ['roblox', 'omsi', 'demandes', 'admin'];

  if (protectedPages.includes(id) && !currentUser) {
    pendingPage = id;

    // On reste sur l'accueil
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

    const accueil = document.getElementById('accueil');
    if (accueil) accueil.classList.add('active');

    // Message dans la fenêtre de connexion
    openAuth();

    setMsg(
      $('#authMsg'),
      '🔒 Crée un compte ou connecte-toi pour accéder aux créations.'
    );

    return;
  }

  // Panel admin : vérification supplémentaire
  if (id === 'admin' && (!currentUser || currentUser.role !== 'admin')) {
    pendingPage = 'admin';
    openAuth();
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));

  const p = document.getElementById(id);

  if (p) {
    p.classList.add('active');
  }

  if (id === 'admin') {
    loadAdmin();
  }

  if (id === 'demandes') {
    loadMyRequests();
  }

  window.scrollTo({
    top: 0,
    behavior: 'smooth'
  });
}

/* =========================
   CONNEXION
========================= */

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

/* =========================
   SÉCURITÉ HTML
========================= */

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
   CRÉATIONS
========================= */

async function loadItems() {

  if (!currentUser) {
    return;
  }

  try {

    const items = await api('/api/items');

    [
      'roblox-progress',
      'roblox-done',
      'omsi-progress',
      'omsi-done'
    ].forEach(type => {

      const box = $('#' + type);

      if (!box) return;

      const list = items.filter(i => i.type === type);

      box.innerHTML = list.length
        ? list.map(itemCard).join('')
        : '<div class="empty">Aucune création pour le moment.</div>';
    });

    if ($('#statTotal')) {
      $('#statTotal').textContent = items.length;
    }

    if ($('#statOngoing')) {
      $('#statOngoing').textContent =
        items.filter(i => i.type.endsWith('progress')).length;
    }

  } catch (err) {

    console.error(err);

    if (!currentUser) {
      return;
    }
  }
}

function itemCard(i) {

  return `
    <article class="item">

      <div class="item-img">
        ${
          i.image
            ? `<img src="${esc(i.image)}"
                    alt="${esc(i.imageName || i.title)}"
                    loading="lazy">`
            : '🚌'
        }
      </div>

      <div class="item-body">

        <h4>${esc(i.title)}</h4>

        <p>${esc(i.description)}</p>

        ${
          i.link
            ? `
              <div class="item-actions">
                <a href="${esc(i.link)}"
                   target="_blank"
                   rel="noopener">
                   Voir / télécharger ↗
                </a>
              </div>
            `
            : ''
        }

      </div>

    </article>
  `;
}

/* =========================
   DEMANDES
========================= */

async function loadMyRequests() {

  if (!currentUser) {

    $('#myRequests').innerHTML = `
      <div class="empty">
        🔒 Connecte-toi pour accéder à tes demandes.
      </div>
    `;

    return;
  }

  const rs = await api('/api/my-requests');

  $('#myRequests').innerHTML = rs.length
    ? `
      <h3 class="subhead">Mes demandes</h3>
      ${
        rs.map(r => `
          <div class="request-row">
            <strong>${esc(r.title)}</strong>
            <span>
              ${esc(r.status)}
              •
              ${new Date(r.createdAt).toLocaleDateString('fr-FR')}
            </span>
          </div>
        `).join('')
      }
    `
    : '<div class="empty">Tu n’as encore envoyé aucune demande.</div>';
}

/* =========================
   ADMIN
========================= */

async function loadAdmin() {

  if (!currentUser || currentUser.role !== 'admin') {

    showPage('accueil');
    openAuth();

    return;
  }

  const [items, requests] = await Promise.all([
    api('/api/items'),
    api('/api/admin/requests')
  ]);

  $('#adminItems').innerHTML = items.length
    ? items.map(i => `
      <div class="admin-row">

        <div>
          <strong>${esc(i.title)}</strong>
          <span>${labels[i.type]}</span>
        </div>

        <div class="actions-small">
          <button
            class="small-btn"
            onclick="deleteItem('${i.id}')">
            Supprimer
          </button>
        </div>

      </div>
    `).join('')
    : '<div class="empty">Aucune création.</div>';

  $('#adminRequests').innerHTML = requests.length
    ? requests.map(r => `
      <div class="admin-row">

        <div>
          <strong>${esc(r.title)}</strong>
          <span>
            par ${esc(r.authorPseudo)}
            •
            ${esc(r.status)}
          </span>
        </div>

        <div class="actions-small">

          <select onchange="updateRequest('${r.id}', this.value)">
            ${
              ['En attente', 'Acceptée', 'Refusée', 'Terminée']
                .map(s => `
                  <option ${s === r.status ? 'selected' : ''}>
                    ${s}
                  </option>
                `)
                .join('')
            }
          </select>

          <button
            class="small-btn"
            onclick="deleteRequest('${r.id}')">
            ×
          </button>

        </div>

      </div>
    `).join('')
    : '<div class="empty">Aucune demande reçue.</div>';

  if ($('#statRequests')) {
    $('#statRequests').textContent =
      requests.filter(r => r.status === 'En attente').length;
  }
}

async function deleteItem(id) {

  if (!confirm('Supprimer cette création ?')) return;

  await api('/api/admin/items/' + id, {
    method: 'DELETE'
  });

  await loadItems();
  await loadAdmin();
}

async function updateRequest(id, status) {

  await api('/api/admin/requests/' + id, {
    method: 'PATCH',
    body: JSON.stringify({ status })
  });

  loadAdmin();
}

async function deleteRequest(id) {

  if (!confirm('Supprimer cette demande ?')) return;

  await api('/api/admin/requests/' + id, {
    method: 'DELETE'
  });

  loadAdmin();
}

/* =========================
   CONNEXION
========================= */

$('#loginForm').addEventListener('submit', async e => {

  e.preventDefault();

  const f = new FormData(e.target);

  try {

    const d = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(f))
    });

    currentUser = d.user;

    closeAuth();

    refreshAuth();

    await loadItems();

    await loadMyRequests();

    // Retourne à la page demandée
    if (pendingPage) {

      const page = pendingPage;

      pendingPage = null;

      showPage(page);
    }

  } catch (err) {

    setMsg($('#authMsg'), err.message);
  }
});

/* =========================
   INSCRIPTION
========================= */

$('#registerForm').addEventListener('submit', async e => {

  e.preventDefault();

  const f = new FormData(e.target);

  try {

    const d = await api('/api/register', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(f))
    });

    currentUser = d.user;

    closeAuth();

    refreshAuth();

    await loadItems();

    await loadMyRequests();

    // Retourne à la page demandée
    if (pendingPage) {

      const page = pendingPage;

      pendingPage = null;

      showPage(page);
    }

  } catch (err) {

    setMsg($('#authMsg'), err.message);
  }
});

/* =========================
   DEMANDE DE REPAINT
========================= */

$('#requestForm').addEventListener('submit', async e => {

  e.preventDefault();

  if (!currentUser) {

    pendingPage = 'demandes';

    openAuth();

    setMsg(
      $('#authMsg'),
      '🔒 Crée un compte ou connecte-toi pour envoyer une demande.'
    );

    return;
  }

  const f = new FormData(e.target);

  try {

    await api('/api/requests', {
      method: 'POST',
      body: JSON.stringify(Object.fromEntries(f))
    });

    e.target.reset();

    setMsg(
      $('#requestMsg'),
      'Demande envoyée !'
    );

    loadMyRequests();

  } catch (err) {

    setMsg(
      $('#requestMsg'),
      err.message
    );
  }
});

/* =========================
   AJOUT ADMIN
========================= */

$('#itemForm').addEventListener('submit', async e => {

  e.preventDefault();

  const f = new FormData(e.target);

  const file = f.get('imageFile');

  const payload = {
    type: f.get('type'),
    title: f.get('title'),
    description: f.get('description'),
    link: f.get('link')
  };

  try {

    if (file && file.size) {

      if (file.size > 5 * 1024 * 1024) {
        throw new Error(
          'Image trop lourde : maximum 5 Mo.'
        );
      }

      if (!file.type.startsWith('image/')) {
        throw new Error(
          'Choisis un vrai fichier image.'
        );
      }

      payload.imageName = file.name;

      payload.image = await new Promise(
        (resolve, reject) => {

          const reader = new FileReader();

          reader.onload = () =>
            resolve(reader.result);

          reader.onerror = () =>
            reject(
              new Error('Impossible de lire l’image.')
            );

          reader.readAsDataURL(file);
        }
      );
    }

    await api('/api/admin/items', {
      method: 'POST',
      body: JSON.stringify(payload)
    });

    e.target.reset();

    setMsg(
      $('#adminMsg'),
      'Création ajoutée !'
    );

    await loadItems();
    await loadAdmin();

  } catch (err) {

    setMsg(
      $('#adminMsg'),
      err.message
    );
  }
});

/* =========================
   UTILISATEUR / BOUTON
========================= */

async function refreshAuth() {

  const btn = $('#authBtn');

  // Supprime éventuellement l'ancien bouton Admin
  document
    .querySelectorAll('nav a[data-admin-link]')
    .forEach(a => a.remove());

  if (currentUser) {

    btn.textContent =
      currentUser.pseudo +
      (currentUser.role === 'admin'
        ? ' • Admin'
        : '');

    btn.onclick = () => {

      if (currentUser.role === 'admin') {

        showPage('admin');

      } else {

        alert(
          'Connecté en tant que ' +
          currentUser.pseudo
        );
      }
    };

    // Ajoute le bouton Admin uniquement aux admins
    if (currentUser.role === 'admin') {

      const a = document.createElement('a');

      a.href = '#admin';
      a.textContent = 'Admin';
      a.dataset.adminLink = 'true';

      a.onclick = () => showPage('admin');

      document
        .querySelector('nav')
        .insertBefore(a, btn);
    }

  } else {

    btn.textContent = 'Connexion';
    btn.onclick = openAuth;
  }
}

/* =========================
   DÉMARRAGE
========================= */

(async () => {

  try {

    const d = await api('/api/me');

    currentUser = d.user;

    refreshAuth();

    if (currentUser) {
      await loadItems();
    }

  } catch (e) {

    console.error(e);
  }

})();
