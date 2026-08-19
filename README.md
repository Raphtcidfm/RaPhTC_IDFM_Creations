# RaPhTC_IDFM Créations

Site complet pour publier des créations **OMSI 2** et **Roblox**, avec comptes membres, demandes de repaint et panneau administrateur.

## Installation

1. Installer Node.js 20+.
2. Copier `.env.example` en `.env`.
3. Modifier `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `ADMIN_PSEUDO` et `SESSION_SECRET`.
4. Dans le dossier du projet : `npm install`
5. Lancer : `npm start`
6. Ouvrir `http://localhost:3000`

Le compte défini dans `.env` devient automatiquement administrateur au premier démarrage.

## Fonctionnalités

- Accueil décoré avec ambiance bus.
- Logo RaPhTC_IDFM Créations en SVG/CSS, sans image externe obligatoire.
- Inscription avec pseudo, e-mail et mot de passe.
- Connexion/déconnexion avec session.
- Catégories Roblox : Jeu en cours / Jeu terminé.
- Catégories OMSI 2 : Repaints en cours / Repaints terminés / Demande de repaint.
- Demandes de repaint réservées aux membres connectés.
- Admin : ajouter/supprimer les créations et gérer le statut des demandes.
- Lien Discord intégré.

## Mise en ligne

Pour une vraie mise en ligne publique, utiliser HTTPS et un hébergeur Node.js. Pour plusieurs instances ou une forte fréquentation, remplacer `data/db.json` par une vraie base SQL et stocker les sessions côté serveur.
