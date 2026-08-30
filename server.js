const express = require('express');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL manquante. Connecte une base Render Postgres avant de lancer la V7.');
  process.exit(1);
}
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false } });
const allowedTypes = ['roblox-progress','roblox-done','omsi-progress','omsi-done'];
const requestStatuses = ['En attente','Acceptée','Refusée','Terminée'];
const id = () => crypto.randomBytes(12).toString('hex');

async function dbInit() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      pseudo TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('member','admin')),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS items (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL CHECK (type IN ('roblox-progress','roblox-done','omsi-progress','omsi-done')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      images JSONB NOT NULL DEFAULT '[]'::jsonb,
      link TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      author_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      author_pseudo TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'En attente',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_items_created_at ON items(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at DESC);
  `);
}

function mapUser(r) { return { id:r.id, email:r.email, pseudo:r.pseudo, role:r.role, createdAt:r.created_at }; }
function mapItem(r) { return { id:r.id, type:r.type, title:r.title, description:r.description, images:r.images || [], link:r.link || '', author:r.author, createdAt:r.created_at, updatedAt:r.updated_at }; }
function mapRequest(r) { return { id:r.id, title:r.title, description:r.description, authorId:r.author_id, authorPseudo:r.author_pseudo, status:r.status, createdAt:r.created_at }; }
function safeUser(u) { return u ? { id:u.id, email:u.email, pseudo:u.pseudo, role:u.role, createdAt:u.created_at } : null; }

async function ensureAdmins() {
  const accounts=[];
  for(let n=1;n<=20;n++){
    const prefix=n===1?'ADMIN':`ADMIN${n}`;
    const email=process.env[`${prefix}_EMAIL`], password=process.env[`${prefix}_PASSWORD`], pseudo=process.env[`${prefix}_PSEUDO`];
    if(email && password) accounts.push({email,password,pseudo});
  }
  for(const a of accounts){
    const email=String(a.email).trim().toLowerCase();
    const pseudo=String(a.pseudo||email.split('@')[0]).trim();
    const existing=await pool.query('SELECT * FROM users WHERE email=$1',[email]);
    if(!existing.rowCount){
      await pool.query('INSERT INTO users(id,email,pseudo,password_hash,role) VALUES($1,$2,$3,$4,\'admin\')',[id(),email,pseudo,bcrypt.hashSync(String(a.password),12)]);
      console.log(`Compte admin créé : ${email}`);
    } else if(existing.rows[0].role!=='admin') {
      await pool.query('UPDATE users SET role=\'admin\' WHERE email=$1',[email]);
      console.log(`Compte promu admin : ${email}`);
    }
  }
}

app.set('trust proxy', 1);
app.use(express.json({limit:'60mb'}));
app.use(express.urlencoded({extended:true}));
app.use(session({
  store:new pgSession({pool, tableName:'user_sessions', createTableIfMissing:true}),
  secret:process.env.SESSION_SECRET || 'change-this-session-secret',
  resave:false, saveUninitialized:false,
  cookie:{httpOnly:true,sameSite:'lax',secure:process.env.NODE_ENV==='production',maxAge:1000*60*60*24*30}
}));
app.use(express.static(require('path').join(__dirname,'public')));

async function currentUser(req){
  if(!req.session.userId) return null;
  const r=await pool.query('SELECT * FROM users WHERE id=$1',[req.session.userId]);
  return r.rowCount?r.rows[0]:null;
}
async function auth(req,res,next){ const u=await currentUser(req); if(!u) return res.status(401).json({error:'Connexion requise.'}); req.user=u; next(); }
async function admin(req,res,next){ const u=await currentUser(req); if(!u||u.role!=='admin') return res.status(403).json({error:'Accès administrateur requis.'}); req.user=u; next(); }
function validateImages(images){
  if(!Array.isArray(images)) return {ok:false,error:'Images invalides.'};
  if(images.length>8) return {ok:false,error:'Maximum 8 images par création.'};
  let total=0;
  const out=[];
  for(const img of images){
    const src=String(img?.src||'');
    if(!/^data:image\/(png|jpeg|jpg|webp|gif);base64,/i.test(src)) return {ok:false,error:'Une des images n’est pas valide.'};
    const bytes=Buffer.byteLength(src.split(',')[1]||'','base64');
    if(bytes>5*1024*1024) return {ok:false,error:`Une image dépasse 5 Mo (${img?.name||'image'}).`};
    total+=bytes;
    out.push({name:String(img?.name||'').trim(),src});
  }
  if(total>40*1024*1024) return {ok:false,error:'La taille totale des images dépasse 40 Mo.'};
  return {ok:true,images:out};
}

app.get('/api/me',async(req,res)=>{ try{res.json({user:safeUser(await currentUser(req))});}catch(e){res.status(500).json({error:'Erreur serveur.'});} });
app.post('/api/register',async(req,res)=>{ try{
  const email=String(req.body.email||'').trim().toLowerCase(), password=String(req.body.password||''), pseudo=String(req.body.pseudo||'').trim();
  if(!email||!password||!pseudo) return res.status(400).json({error:'Tous les champs sont obligatoires.'});
  if(password.length<8) return res.status(400).json({error:'Le mot de passe doit contenir au moins 8 caractères.'});
  if(pseudo.length<3) return res.status(400).json({error:'Le pseudo doit contenir au moins 3 caractères.'});
  const dup=await pool.query('SELECT id FROM users WHERE email=$1 OR LOWER(pseudo)=LOWER($2)',[email,pseudo]);
  if(dup.rowCount) return res.status(409).json({error:'Cet e-mail ou ce pseudo est déjà utilisé.'});
  const user={id:id(),email,pseudo,passwordHash:bcrypt.hashSync(password,12)};
  await pool.query('INSERT INTO users(id,email,pseudo,password_hash,role) VALUES($1,$2,$3,$4,\'member\')',[user.id,user.email,user.pseudo,user.passwordHash]);
  req.session.userId=user.id; const r=await pool.query('SELECT * FROM users WHERE id=$1',[user.id]); res.json({user:safeUser(r.rows[0])});
 }catch(e){console.error(e);res.status(500).json({error:'Impossible de créer le compte.'});} });
app.post('/api/login',async(req,res)=>{ try{
  const email=String(req.body.email||'').trim().toLowerCase(), r=await pool.query('SELECT * FROM users WHERE email=$1',[email]);
  if(!r.rowCount||!bcrypt.compareSync(String(req.body.password||''),r.rows[0].password_hash)) return res.status(401).json({error:'E-mail ou mot de passe incorrect.'});
  req.session.userId=r.rows[0].id; res.json({user:safeUser(r.rows[0])});
 }catch(e){res.status(500).json({error:'Erreur de connexion.'});} });
app.post('/api/logout',(req,res)=>req.session.destroy(()=>res.json({ok:true})));

app.get('/api/items',async(req,res)=>{ try{
  const q=req.query.type; const r=q?await pool.query('SELECT * FROM items WHERE type=$1 ORDER BY created_at DESC',[q]):await pool.query('SELECT * FROM items ORDER BY created_at DESC');
  res.json(r.rows.map(mapItem));
 }catch(e){console.error(e);res.status(500).json({error:'Impossible de charger les créations.'});} });
app.post('/api/requests',auth,async(req,res)=>{ try{
  const title=String(req.body.title||'').trim(), description=String(req.body.description||'').trim(); if(!title||!description)return res.status(400).json({error:'Titre et description obligatoires.'});
  const r=await pool.query('INSERT INTO requests(id,title,description,author_id,author_pseudo) VALUES($1,$2,$3,$4,$5) RETURNING *',[id(),title,description,req.user.id,req.user.pseudo]); res.json(mapRequest(r.rows[0]));
 }catch(e){res.status(500).json({error:'Impossible d’envoyer la demande.'});} });
app.get('/api/my-requests',auth,async(req,res)=>{const r=await pool.query('SELECT * FROM requests WHERE author_id=$1 ORDER BY created_at DESC',[req.user.id]);res.json(r.rows.map(mapRequest));});

app.get('/api/admin/stats',admin,async(req,res)=>{ const r=await pool.query(`SELECT (SELECT COUNT(*)::int FROM users) users,(SELECT COUNT(*)::int FROM users WHERE role='admin') admins,(SELECT COUNT(*)::int FROM items) items,(SELECT COUNT(*)::int FROM requests WHERE status='En attente') pending_requests`); res.json(r.rows[0]); });
app.get('/api/admin/admins',admin,async(req,res)=>{const r=await pool.query("SELECT id,email,pseudo,role,created_at FROM users WHERE role='admin' ORDER BY created_at ASC");res.json(r.rows.map(mapUser));});
app.get('/api/admin/users',admin,async(req,res)=>{const r=await pool.query("SELECT id,email,pseudo,role,created_at FROM users ORDER BY created_at DESC");res.json(r.rows.map(mapUser));});
app.post('/api/admin/admins',admin,async(req,res)=>{ try{
  const email=String(req.body.email||'').trim().toLowerCase(), pseudo=String(req.body.pseudo||'').trim(), password=String(req.body.password||'');
  if(!email||!pseudo) return res.status(400).json({error:'E-mail et pseudo obligatoires.'});
  if(password && password.length<8)return res.status(400).json({error:'Le mot de passe doit contenir au moins 8 caractères.'});
  const byEmail=await pool.query('SELECT * FROM users WHERE email=$1',[email]);
  if(byEmail.rowCount){
    const u=byEmail.rows[0];
    const pseudoTaken=await pool.query('SELECT id FROM users WHERE LOWER(pseudo)=LOWER($1) AND id<>$2',[pseudo,u.id]); if(pseudoTaken.rowCount)return res.status(409).json({error:'Ce pseudo est déjà utilisé.'});
    await pool.query('UPDATE users SET role=\'admin\',pseudo=$1'+(password?',password_hash=$2':'')+' WHERE id=$'+(password?'3':'2'),password?[pseudo,bcrypt.hashSync(password,12),u.id]:[pseudo,u.id]);
    const r=await pool.query('SELECT * FROM users WHERE id=$1',[u.id]); return res.json(mapUser(r.rows[0]));
  }
  if(!password)return res.status(400).json({error:'Pour créer un nouveau compte admin, indique un mot de passe d’au moins 8 caractères.'});
  const dup=await pool.query('SELECT id FROM users WHERE LOWER(pseudo)=LOWER($1)',[pseudo]); if(dup.rowCount)return res.status(409).json({error:'Ce pseudo est déjà utilisé.'});
  const r=await pool.query('INSERT INTO users(id,email,pseudo,password_hash,role) VALUES($1,$2,$3,$4,\'admin\') RETURNING *',[id(),email,pseudo,bcrypt.hashSync(password,12)]); res.json(mapUser(r.rows[0]));
 }catch(e){console.error(e);res.status(500).json({error:'Impossible de gérer cet admin.'});} });
app.patch('/api/admin/admins/:id',admin,async(req,res)=>{ try{
  const target=await pool.query('SELECT * FROM users WHERE id=$1',[req.params.id]); if(!target.rowCount)return res.status(404).json({error:'Utilisateur introuvable.'});
  const u=target.rows[0]; if(req.body.role==='member'){
    const count=await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role='admin'"); if(count.rows[0].n<=1)return res.status(400).json({error:'Impossible de retirer le dernier administrateur.'});
    await pool.query("UPDATE users SET role='member' WHERE id=$1",[u.id]);
  } else if(req.body.role==='admin') await pool.query("UPDATE users SET role='admin' WHERE id=$1",[u.id]);
  if(req.body.password){ if(String(req.body.password).length<8)return res.status(400).json({error:'Le mot de passe doit contenir au moins 8 caractères.'}); await pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[bcrypt.hashSync(String(req.body.password),12),u.id]); }
  const r=await pool.query('SELECT * FROM users WHERE id=$1',[u.id]); res.json(mapUser(r.rows[0]));
 }catch(e){res.status(500).json({error:'Impossible de modifier cet administrateur.'});} });

app.get('/api/admin/requests',admin,async(req,res)=>{const r=await pool.query('SELECT * FROM requests ORDER BY created_at DESC');res.json(r.rows.map(mapRequest));});
app.patch('/api/admin/requests/:id',admin,async(req,res)=>{const status=req.body.status;if(!requestStatuses.includes(status))return res.status(400).json({error:'Statut invalide.'});const r=await pool.query('UPDATE requests SET status=$1 WHERE id=$2 RETURNING *',[status,req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Demande introuvable.'});res.json(mapRequest(r.rows[0]));});
app.delete('/api/admin/requests/:id',admin,async(req,res)=>{await pool.query('DELETE FROM requests WHERE id=$1',[req.params.id]);res.json({ok:true});});

app.post('/api/admin/items',admin,async(req,res)=>{ try{
  const {title,description,link,type}=req.body; if(!title||!description||!allowedTypes.includes(type))return res.status(400).json({error:'Titre, description et catégorie obligatoires.'});
  const checked=validateImages(req.body.images||[]); if(!checked.ok)return res.status(400).json({error:checked.error});
  const r=await pool.query('INSERT INTO items(id,type,title,description,images,link,author) VALUES($1,$2,$3,$4,$5::jsonb,$6,$7) RETURNING *',[id(),type,String(title).trim(),String(description).trim(),JSON.stringify(checked.images),String(link||'').trim(),req.user.pseudo]); res.json(mapItem(r.rows[0]));
 }catch(e){console.error(e);res.status(500).json({error:'Impossible d’ajouter la création.'});} });
app.patch('/api/admin/items/:id',admin,async(req,res)=>{ try{
  const existing=await pool.query('SELECT * FROM items WHERE id=$1',[req.params.id]); if(!existing.rowCount)return res.status(404).json({error:'Création introuvable.'});
  const old=mapItem(existing.rows[0]); const title=String(req.body.title??old.title).trim(), description=String(req.body.description??old.description).trim(), link=String(req.body.link??old.link).trim(), type=req.body.type??old.type;
  if(!title||!description||!allowedTypes.includes(type))return res.status(400).json({error:'Titre, description et catégorie obligatoires.'});
  const images=req.body.images===undefined?old.images:req.body.images; const checked=validateImages(images); if(!checked.ok)return res.status(400).json({error:checked.error});
  const r=await pool.query('UPDATE items SET type=$1,title=$2,description=$3,images=$4::jsonb,link=$5,updated_at=NOW() WHERE id=$6 RETURNING *',[type,title,description,JSON.stringify(checked.images),link,req.params.id]); res.json(mapItem(r.rows[0]));
 }catch(e){console.error(e);res.status(500).json({error:'Impossible de modifier la création.'});} });
app.delete('/api/admin/items/:id',admin,async(req,res)=>{const r=await pool.query('DELETE FROM items WHERE id=$1',[req.params.id]);if(!r.rowCount)return res.status(404).json({error:'Création introuvable.'});res.json({ok:true});});

app.use((req,res)=>res.sendFile(require('path').join(__dirname,'public','index.html')));

(async()=>{try{await dbInit();await ensureAdmins();app.listen(PORT,()=>console.log(`RaPhTC_IDFM Créations V7 lancé sur le port ${PORT}`));}catch(e){console.error('Erreur base de données :',e);process.exit(1);}})();
