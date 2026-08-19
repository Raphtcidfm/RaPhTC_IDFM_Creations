const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
fs.mkdirSync(DATA_DIR, { recursive: true });

const defaultDb = { users: [], items: [], requests: [] };
function loadDb() {
  if (!fs.existsSync(DB_FILE)) fs.writeFileSync(DB_FILE, JSON.stringify(defaultDb, null, 2));
  try { return JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch { return structuredClone(defaultDb); }
}
function saveDb(db) { fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2)); }
let db = loadDb();

function ensureAdmins() {
  const accounts = [];
  const first = {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    pseudo: process.env.ADMIN_PSEUDO
  };
  if (first.email && first.password) accounts.push(first);

  for (let n = 2; n <= 20; n++) {
    const email = process.env[`ADMIN${n}_EMAIL`];
    const password = process.env[`ADMIN${n}_PASSWORD`];
    const pseudo = process.env[`ADMIN${n}_PSEUDO`];
    if (!email || !password) continue;
    accounts.push({ email, password, pseudo });
  }

  let changed = false;
  for (const account of accounts) {
    const email = String(account.email).trim().toLowerCase();
    const password = String(account.password);
    const pseudo = String(account.pseudo || email.split('@')[0] || 'Admin').trim();
    if (!email || !password) continue;
    let admin = db.users.find(u => u.email === email);
    if (!admin) {
      admin = { id: cryptoRandom(), email, pseudo, passwordHash: bcrypt.hashSync(password, 12), role: 'admin', createdAt: new Date().toISOString() };
      db.users.push(admin);
      changed = true;
      console.log(`Compte admin créé : ${email}`);
    } else if (admin.role !== 'admin') {
      admin.role = 'admin';
      changed = true;
      console.log(`Compte promu admin : ${email}`);
    }
  }
  if (changed) saveDb(db);
}
function cryptoRandom() { return require('crypto').randomBytes(12).toString('hex'); }
ensureAdmins();

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-this',
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: false, maxAge: 1000 * 60 * 60 * 24 * 7 }
}));
app.use(express.static(path.join(__dirname, 'public')));

function safeUser(u) { return { id: u.id, email: u.email, pseudo: u.pseudo, role: u.role }; }
function auth(req, res, next) { if (!req.session.userId) return res.status(401).json({ error: 'Connexion requise.' }); next(); }
function admin(req, res, next) {
  const u = db.users.find(x => x.id === req.session.userId);
  if (!u || u.role !== 'admin') return res.status(403).json({ error: 'Accès administrateur requis.' });
  req.user = u; next();
}

app.get('/api/me', (req, res) => {
  const u = db.users.find(x => x.id === req.session.userId);
  res.json({ user: u ? safeUser(u) : null });
});

app.post('/api/register', (req, res) => {
  const { email, password, pseudo } = req.body;
  if (!email || !password || !pseudo) return res.status(400).json({ error: 'Tous les champs sont obligatoires.' });
  if (password.length < 8) return res.status(400).json({ error: 'Le mot de passe doit contenir au moins 8 caractères.' });
  if (String(pseudo).trim().length < 3) return res.status(400).json({ error: 'Le pseudo doit contenir au moins 3 caractères.' });
  const normalized = String(email).trim().toLowerCase();
  if (db.users.some(u => u.email === normalized)) return res.status(409).json({ error: 'Cet e-mail est déjà utilisé.' });
  if (db.users.some(u => u.pseudo.toLowerCase() === String(pseudo).trim().toLowerCase())) return res.status(409).json({ error: 'Ce pseudo est déjà utilisé.' });
  const user = { id: cryptoRandom(), email: normalized, pseudo: String(pseudo).trim(), passwordHash: bcrypt.hashSync(password, 12), role: 'member', createdAt: new Date().toISOString() };
  db.users.push(user); saveDb(db); req.session.userId = user.id;
  res.json({ user: safeUser(user) });
});

app.post('/api/login', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const user = db.users.find(u => u.email === email);
  if (!user || !bcrypt.compareSync(String(req.body.password || ''), user.passwordHash)) return res.status(401).json({ error: 'E-mail ou mot de passe incorrect.' });
  req.session.userId = user.id; res.json({ user: safeUser(user) });
});
app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));

app.get('/api/items', auth, (req, res) => {
  const type = req.query.type;
  let items = db.items.slice().sort((a,b) => b.createdAt.localeCompare(a.createdAt));
  if (type) items = items.filter(i => i.type === type);
  res.json(items);
});

app.post('/api/requests', auth, (req, res) => {
  const { title, description } = req.body;
  if (!title || !description) return res.status(400).json({ error: 'Titre et description obligatoires.' });
  const u = db.users.find(x => x.id === req.session.userId);
  const request = { id: cryptoRandom(), title: String(title).trim(), description: String(description).trim(), authorId: u.id, authorPseudo: u.pseudo, status: 'En attente', createdAt: new Date().toISOString() };
  db.requests.push(request); saveDb(db); res.json(request);
});
app.get('/api/my-requests', auth, (req,res) => res.json(db.requests.filter(r => r.authorId === req.session.userId).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));
app.get('/api/admin/requests', admin, (req,res) => res.json(db.requests.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt))));

app.post('/api/admin/items', admin, (req,res) => {
  const allowed = ['roblox-progress','roblox-done','omsi-progress','omsi-done'];
  const { title, description, image, imageName, link, type } = req.body;
  if (!title || !description || !allowed.includes(type)) return res.status(400).json({ error: 'Titre, description et catégorie obligatoires.' });

  let storedImage = '';
  if (image) {
    const value = String(image);
    if (!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(value)) {
      return res.status(400).json({ error: 'Le fichier image doit être un PNG, JPG, WEBP ou GIF.' });
    }
    const base64 = value.split(',')[1] || '';
    if (Buffer.byteLength(base64, 'base64') > 5 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image trop lourde : maximum 5 Mo.' });
    }
    storedImage = value;
  }

  const item = { id: cryptoRandom(), title: String(title).trim(), description: String(description).trim(), image: storedImage, imageName: String(imageName || '').trim(), link: String(link || '').trim(), type, createdAt: new Date().toISOString(), author: req.user.pseudo };
  db.items.push(item); saveDb(db); res.json(item);
});
app.delete('/api/admin/items/:id', admin, (req,res) => {
  const before = db.items.length; db.items = db.items.filter(i => i.id !== req.params.id); saveDb(db);
  if (before === db.items.length) return res.status(404).json({ error: 'Création introuvable.' }); res.json({ok:true});
});
app.patch('/api/admin/requests/:id', admin, (req,res) => {
  const r = db.requests.find(x => x.id === req.params.id); if (!r) return res.status(404).json({error:'Demande introuvable.'});
  const allowed = ['En attente','Acceptée','Refusée','Terminée'];
  if (!allowed.includes(req.body.status)) return res.status(400).json({error:'Statut invalide.'});
  r.status = req.body.status; saveDb(db); res.json(r);
});
app.delete('/api/admin/requests/:id', admin, (req,res) => { db.requests = db.requests.filter(r => r.id !== req.params.id); saveDb(db); res.json({ok:true}); });

app.use((req,res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.listen(PORT, () => console.log(`RaPhTC_IDFM Créations lancé sur http://localhost:${PORT}`));
